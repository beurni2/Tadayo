/// <reference lib="esnext.temporal" />
// The worker's outbox poller (T54; spec 34; TECH-DESIGN section 5, "The worker"; docs/plans/api-b2-spike-prepare.md
// section 1). Events are written by the business transactions they follow (`app.outbox_events`, 0009), and each is
// handled at least once, by a handler that may run twice and changes things once.
//
// One event at a time:
// 1. The claim, in its own short transaction: the clock's sample (T1: the dev clock moves it, the tests' fake clock
//    holds it), then the oldest due event of a topic this worker has a handler for, `FOR UPDATE SKIP LOCKED`, so two
//    workers never claim the same one. A topic no handler knows is never claimed: it waits for a worker that knows it.
//    The claim counts the attempt and leases the event, `available_at` the sample plus LEASE_SECONDS, and commits. The
//    attempt is counted here, outside the work, so a photo that killed the process doesn't roll its attempt back and
//    come back for ever: it comes back once its lease has passed, at most MAX_ATTEMPTS times. The lease does what a
//    transaction held across the work would, without holding a connection and a row lock through seconds of network
//    and CPU: nobody else claims the event while it lasts.
// 2. An event claimed with its attempts already spent dies at once, as `lease_lapsed`: its last attempt never
//    reported back, since a last attempt that failed dies as it reports (item 3). The codes of the attempts before
//    it are in their own lines.
// 3. The work: the handler, given the event. It returns once the work is done, and the event is marked done; a
//    handler that changes rows marks it done itself, in the same transaction (`finishEvent`), so the change and the
//    event's end commit together. A throw is tried again after BACKOFF_SECONDS times two to the attempts before it,
//    and dies once MAX_ATTEMPTS are spent; a `FailedForGood` dies at once. A failure is written only over the claim
//    it came from: if its lease passed and another claim took the event, that claim's is the event's.
//
// The dead-letter table is `app.outbox_events` with `state = 'dead'`, and its alert is a line on standard error,
// which Fly's logs keep; nothing pages anyone before monitoring exists (docs/LIMITATIONS.md). Every line and every
// `last_error` holds codes and opaque ids, never an error's message, which could quote a row or a URL (T52). Each line
// is written as soon as what it says is committed, so a pass that then fails, or that runs on while events keep
// coming, loses or holds back none.

import type { Clock, ServerNow } from "@tadayo/domain";
import type { WorkerSql, WorkerTx } from "./connection.ts";
import { LOCK_WAIT_MS, STATEMENT_MS } from "./generation.ts";

/** How long a claimed event is the claimer's alone, in seconds: longer than the slowest work (prepare.ts). */
export const LEASE_SECONDS = 300;
/** The first retry's wait, in seconds; each later one is twice the one before. */
export const BACKOFF_SECONDS = 30;
/** Attempts before an event dies. */
export const MAX_ATTEMPTS = 5;

/** A claimed event: its payload holds ids and codes only (T52). */
export interface OutboxEvent {
  readonly id: string;
  readonly topic: string;
  readonly payload: unknown;
  /** This attempt's number, from 1. */
  readonly attempts: number;
}

/** A handler: returns once the event's work is done, throws when it failed. */
export type Handler = (event: OutboxEvent) => Promise<void>;

/** A failure no retry would end: the event dies at once. `code` is what the row and the line say. */
export class FailedForGood extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`outbox: failed for good: ${code}`);
    this.name = "FailedForGood";
    this.code = code;
  }
}

/** `app.outbox_events.last_error`'s pattern (0009), narrowed to the codes this worker writes. */
const CODE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;
/** A Postgres SQLSTATE. */
const SQLSTATE = /^[0-9A-Z]{5}$/;
/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The wait before the retry after attempt `attempts`, in seconds: 30, 60, 120, 240. */
export function backoffSeconds(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("outbox: attempts count from 1");
  return BACKOFF_SECONDS * 2 ** (attempts - 1);
}

/** A system's or a driver's own code: `ECONNRESET`, `CONNECTION_CLOSED`. */
const SYSTEM = /^[A-Z][A-Z0-9_]{1,40}$/;

/**
 * The code a failure is recorded under: a code the worker's own errors carry (`storage.unavailable`,
 * `image.timeout`, a `FailedForGood`'s), `db.<SQLSTATE>` for Postgres, `sys.<code>` for a system's or the driver's
 * own (a lost connection), else `unknown`. Never a message.
 */
export function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return "unknown";
  if (error instanceof Error && error.name === "PostgresError" && SQLSTATE.test(code)) return `db.${code}`;
  if (CODE.test(code) && code.length <= 64) return code;
  return SYSTEM.test(code) ? `sys.${code.toLowerCase()}` : "unknown";
}

/** `fn` in a transaction with generation's limits on lock waits and statements. */
async function limited<T>(sql: WorkerSql, fn: (tx: WorkerTx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`
      SELECT pg_catalog.set_config('lock_timeout', ${`${String(LOCK_WAIT_MS)}ms`}, true),
             pg_catalog.set_config('statement_timeout', ${`${String(STATEMENT_MS)}ms`}, true)`;
    return fn(tx);
  })) as T;
}

/** Marks the event `id` done at `at`, in the caller's transaction, if it is still pending. */
export async function finishEvent(tx: WorkerTx, id: string, at: ServerNow): Promise<void> {
  await tx`UPDATE app.outbox_events SET state = 'done', processed_at = ${at} WHERE id = ${id} AND state = 'pending'`;
}

/** The code of an event whose last attempt never reported back. */
const LEASE_LAPSED = "lease_lapsed";

/** What a claim found: an event to work on, one whose attempts were spent (now dead), or nothing due. */
export type Claim = { readonly kind: "work" | "dead"; readonly event: OutboxEvent } | null;

/** Claims the oldest due event of `topics`, in its own transaction (item 1 above). */
export async function claimNext(sql: WorkerSql, clock: Clock, topics: readonly string[]): Promise<Claim> {
  if (topics.length === 0) return null;
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const rows = await tx<{ id: string; topic: string; payload: unknown; attempts: number }[]>`
      SELECT id, topic, payload, attempts FROM app.outbox_events
       WHERE state = 'pending' AND available_at <= ${at} AND topic = ANY(${tx.array([...topics])})
       ORDER BY available_at, id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`;
    const row = rows[0];
    if (row === undefined) return null;
    if (!ID.test(row.id)) throw new Error("outbox: an event came back with no id");
    if (row.attempts >= MAX_ATTEMPTS) {
      await tx`
        UPDATE app.outbox_events SET state = 'dead', processed_at = ${at}, last_error = ${LEASE_LAPSED}
         WHERE id = ${row.id}`;
      return { kind: "dead", event: row } as const;
    }
    await tx`
      UPDATE app.outbox_events SET attempts = attempts + 1, available_at = ${at.add({ seconds: LEASE_SECONDS })}
       WHERE id = ${row.id}`;
    return {
      kind: "work",
      event: { id: row.id, topic: row.topic, payload: row.payload, attempts: row.attempts + 1 },
    } as const;
  });
}

/**
 * Records a failed attempt of `event`: tried again after its backoff, or dead. Returns whether it died, and whether
 * anything was written: nothing is when the event has ended, or when another claim has taken it since (its lease
 * passed while this attempt worked), whose attempt then decides.
 */
async function recordFailure(sql: WorkerSql, clock: Clock, event: OutboxEvent, code: string, forGood: boolean) {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const dies = forGood || event.attempts >= MAX_ATTEMPTS;
    const changed = dies
      ? await tx`
          UPDATE app.outbox_events SET state = 'dead', processed_at = ${at}, last_error = ${code}
           WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}`
      : await tx`
          UPDATE app.outbox_events
             SET last_error = ${code}, available_at = ${at.add({ seconds: backoffSeconds(event.attempts) })}
           WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}`;
    return { dies, changed: changed.count > 0 };
  });
}

export interface OutboxPassResult {
  /** Events whose work was done. */
  readonly handled: number;
}

export interface OutboxPassOptions {
  /** Writes a line for standard error, at once: each failure, and each event that died, by topic, id and code. */
  readonly warn: (line: string) => void;
  /** Answers true once the worker is told to stop. */
  readonly stopping?: (() => boolean) | undefined;
}

/**
 * One pass: claims and works on due events of the handlers' topics, one at a time, until none is due or `stopping`
 * answers true. Throws only when the database can't be reached for a claim or a failure's record; the event's lease
 * then brings it back. Every line is already written when it throws.
 */
export async function outboxPass(
  sql: WorkerSql,
  clock: Clock,
  handlers: Readonly<Record<string, Handler>>,
  { warn, stopping = () => false }: OutboxPassOptions,
): Promise<OutboxPassResult> {
  const topics = Object.keys(handlers);
  let handled = 0;
  while (!stopping()) {
    const claim = await claimNext(sql, clock, topics);
    if (claim === null) break;
    const { event } = claim;
    if (claim.kind === "dead") {
      warn(
        `worker: an event is dead: ${event.topic} ${event.id} after ${String(event.attempts)} attempts: ${LEASE_LAPSED}`,
      );
      continue;
    }
    const handler = handlers[event.topic];
    try {
      if (handler === undefined) throw new FailedForGood("topic");
      await handler(event);
      await limited(sql, async (tx) => finishEvent(tx, event.id, await clock.sample(tx)));
      handled += 1;
    } catch (error) {
      const code = failureCode(error);
      const { dies, changed } = await recordFailure(sql, clock, event, code, error instanceof FailedForGood);
      if (!changed) continue;
      warn(
        dies
          ? `worker: an event is dead: ${event.topic} ${event.id} after ${String(event.attempts)} attempts: ${code}`
          : `worker: an event failed: ${event.topic} ${event.id}, attempt ${String(event.attempts)}: ${code}`,
      );
    }
  }
  return { handled };
}
