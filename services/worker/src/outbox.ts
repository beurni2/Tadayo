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
//    it came from, known by its lease's end, `available_at` as the claim set it, which no later claim or write can
//    set again: a later claim's sample is past this lease, and every write after it sets a time later still. If its
//    lease passed and another claim took the event, that claim's is the event's, even once it has given its attempt
//    back (item 4), when the attempts' number is this claim's again.
// 4. An `Unavailable`, a service the work needs that didn't answer (Storage away), says nothing of the event, so in
//    the event's first day (OUTAGE_SECONDS from its `created_at`, by the clock's sample) it is waited out: the attempt
//    the claim counted is given back, so the attempts stay for the failures that are the event's own, and it is tried
//    again after a wait of the event's age, at least BACKOFF_SECONDS and at most OUTAGE_WAIT_SECONDS. From its second
//    day it counts as any failure, so the retries stay bounded whatever a handler does (T54): at most a day of waits,
//    then MAX_ATTEMPTS. A handler whose work ends sooner, as `upload.prepare`'s does when its upload lapses, ends the
//    event on its next attempt (the outside audit's B1; docs/plans/api-b2-worker-storage-retry.md). The day assumes
//    the clock moves forward, as the server's does (T1): a sample behind the row's `created_at` waits the least. It
//    starts at `created_at`, which for `upload.prepare` is when the event first comes due; a topic written ahead of its
//    time (a day's reveal or close, 0009) would start its day before its first attempt, and needs its first due time
//    kept as its own start, which that topic's slice adds. Each wait holds this one-at-a-time poller for at most the
//    call that failed (Storage's 30 seconds); while every topic needs Storage, nothing that could run waits behind
//    it, and the first topic that doesn't will need a topic's waiting events kept from holding it up.
//
// The dead-letter table is `app.outbox_events` with `state = 'dead'`. Its alert is twofold: a line on standard error,
// which Fly's logs keep, and a count in `app.failure_counts`, as `<topic>:<code>` (`deadCode`), written in the same
// transaction as the death, so an event that dies is counted once and a death that rolls back counts nothing (a count
// that can't be written rolls its death back, for the lease to bring the event back: `outboxPass`); a check
// every 15 minutes tells the founder what is new, as a GitHub issue (the outside audit's B7; FQ150;
// tools/ops/src/failure-alert.ts). Every line, every `last_error` and every count holds codes and opaque ids, never an
// error's message, which could quote a row or a URL (T52). Each line is written as soon as what it says is committed,
// so a pass that then fails, or that runs on while events keep coming, loses or holds back none.

import { countFailures, FAILURE_CODE, type Clock, type ServerNow } from "@tadayo/domain";
import type { WorkerSql, WorkerTx } from "./connection.ts";
import { LOCK_WAIT_MS, STATEMENT_MS } from "./generation.ts";
import { Fault, RangeFault } from "@tadayo/domain/fault";

/** How long a claimed event is the claimer's alone, in seconds: longer than the slowest work (prepare.ts). */
export const LEASE_SECONDS = 300;
/** The first retry's wait, in seconds; each later one is twice the one before. */
export const BACKOFF_SECONDS = 30;
/** Attempts before an event dies. */
export const MAX_ATTEMPTS = 5;
/** How long from an event's `created_at` an `Unavailable` is waited out, uncounted, in seconds: a day (item 4). */
export const OUTAGE_SECONDS = 24 * 60 * 60;
/** The longest wait after an `Unavailable`, in seconds. */
export const OUTAGE_WAIT_SECONDS = 15 * 60;

/** A claimed event: its payload holds ids and codes only (T52). */
export interface OutboxEvent {
  readonly id: string;
  readonly topic: string;
  readonly payload: unknown;
  /** This attempt's number, from 1. */
  readonly attempts: number;
  /** When the event was written: the start of its first day, in which an `Unavailable` is waited out (item 4). */
  readonly createdAt: Temporal.Instant;
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

/**
 * A service the work needs didn't answer, which says nothing of the event: waited out in the event's first day, and
 * counted from its second (item 4). `code` is what the row and the line say; the message names no value.
 */
export class Unavailable extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "Unavailable";
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
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new RangeFault("worker_outbox_1", "outbox: attempts count from 1");
  return BACKOFF_SECONDS * 2 ** (attempts - 1);
}

/**
 * The wait after an `Unavailable` of an event `ageSeconds` old, in whole seconds: its age, at least BACKOFF_SECONDS
 * and at most OUTAGE_WAIT_SECONDS. Each try then comes at about twice the age of the one before, as the backoff's do,
 * with no counter of its own: 30, 30, 60, 120, 240, 480 seconds, then every 15 minutes. An age before the event was
 * written, a clock behind its row's, is none.
 */
export function outageWaitSeconds(ageSeconds: number): number {
  if (Number.isNaN(ageSeconds))
    throw new RangeFault("worker_outbox_3", "outbox: an event's age is a number of seconds");
  return Math.min(OUTAGE_WAIT_SECONDS, Math.max(BACKOFF_SECONDS, Math.floor(ageSeconds)));
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

/**
 * What a dead event is counted as: its topic and its code (`upload.prepare:lease_lapsed`), or its code alone if the two
 * would be past the count's pattern (0020), or `unknown`. A topic is one of the handlers' and a code one of
 * `failureCode`'s, so the first is the one there is; the others keep a death that can't be named from rolling back.
 */
export function deadCode(topic: string, code: string): string {
  const both = `${topic}:${code}`;
  if (FAILURE_CODE.test(both)) return both;
  return FAILURE_CODE.test(code) ? code : "unknown";
}

/** Counts the death of an event of `topic` with `code`, in the transaction that writes it. */
async function countDeath(tx: WorkerTx, topic: string, code: string): Promise<void> {
  await countFailures(tx, "worker", new Map([[deadCode(topic, code), 1]]));
}

/** `fn` in a transaction with generation's limits on lock waits and statements (the push's too, push.ts). */
export async function limited<T>(sql: WorkerSql, fn: (tx: WorkerTx) => Promise<T>): Promise<T> {
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

/**
 * What a claim found: an event to work on, with its lease's end, which marks the claim (item 3); one whose attempts
 * were spent (now dead); or nothing due.
 */
export type Claim =
  | { readonly kind: "work"; readonly event: OutboxEvent; readonly leaseUntil: Temporal.Instant }
  | { readonly kind: "dead"; readonly event: OutboxEvent }
  | null;

/** Claims the oldest due event of `topics`, in its own transaction (item 1 above). */
export async function claimNext(sql: WorkerSql, clock: Clock, topics: readonly string[]): Promise<Claim> {
  if (topics.length === 0) return null;
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const rows = await tx<
      { id: string; topic: string; payload: unknown; attempts: number; created_at: Temporal.Instant }[]
    >`
      SELECT id, topic, payload, attempts, created_at FROM app.outbox_events
       WHERE state = 'pending' AND available_at <= ${at} AND topic = ANY(${tx.array([...topics])})
       ORDER BY available_at, id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`;
    const row = rows[0];
    if (row === undefined) return null;
    if (!ID.test(row.id)) throw new Fault("worker_outbox_2", "outbox: an event came back with no id");
    const event = { id: row.id, topic: row.topic, payload: row.payload, createdAt: row.created_at };
    if (row.attempts >= MAX_ATTEMPTS) {
      await tx`
        UPDATE app.outbox_events SET state = 'dead', processed_at = ${at}, last_error = ${LEASE_LAPSED}
         WHERE id = ${row.id}`;
      await countDeath(tx, row.topic, LEASE_LAPSED);
      return { kind: "dead", event: { ...event, attempts: row.attempts } } as const;
    }
    const leaseUntil = at.add({ seconds: LEASE_SECONDS });
    await tx`UPDATE app.outbox_events SET attempts = attempts + 1, available_at = ${leaseUntil} WHERE id = ${row.id}`;
    return { kind: "work", event: { ...event, attempts: row.attempts + 1 }, leaseUntil } as const;
  });
}

/** How a failed attempt ends: tried again after its backoff, waited out uncounted (item 4), or dead. */
type Ending = { readonly kind: "retry" | "dead" } | { readonly kind: "waiting"; readonly seconds: number };

/**
 * Records a failed attempt of `event`, claimed with a lease to `leaseUntil`: tried again after its backoff, waited
 * out, or dead. Returns how it ended, and whether anything was written: nothing is when the event has ended, or when
 * another claim has taken it since (its lease passed while this attempt worked), whose attempt then decides (item 3).
 */
async function recordFailure(
  sql: WorkerSql,
  clock: Clock,
  event: OutboxEvent,
  leaseUntil: Temporal.Instant,
  code: string,
  error: unknown,
): Promise<{ readonly ending: Ending; readonly changed: boolean }> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const age = event.createdAt.until(at).total("seconds");
    if (error instanceof Unavailable && age < OUTAGE_SECONDS) {
      const seconds = outageWaitSeconds(age);
      const waited = await tx`
        UPDATE app.outbox_events
           SET attempts = attempts - 1, last_error = ${code}, available_at = ${at.add({ seconds })}
         WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}
           AND available_at = ${leaseUntil}`;
      return { ending: { kind: "waiting", seconds }, changed: waited.count > 0 } as const;
    }
    const dies = error instanceof FailedForGood || event.attempts >= MAX_ATTEMPTS;
    if (dies) {
      const died = await tx`
        UPDATE app.outbox_events SET state = 'dead', processed_at = ${at}, last_error = ${code}
         WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}
           AND available_at = ${leaseUntil}`;
      // Counted only when this claim's write is the death: one written over no claim of its own changed nothing.
      if (died.count > 0) await countDeath(tx, event.topic, code);
      return { ending: { kind: "dead" }, changed: died.count > 0 } as const;
    }
    const retried = await tx`
      UPDATE app.outbox_events
         SET last_error = ${code}, available_at = ${at.add({ seconds: backoffSeconds(event.attempts) })}
       WHERE id = ${event.id} AND state = 'pending' AND attempts = ${event.attempts}
         AND available_at = ${leaseUntil}`;
    return { ending: { kind: "retry" }, changed: retried.count > 0 } as const;
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
 * answers true. Throws only when the database can't be reached for a claim or a failure's record, or a death's count
 * can't be written, which rolls the death back with it; the event's lease then brings it back. One that had used its
 * last attempt dies when its lease has passed, written and counted then as `lease_lapsed`, the code of the failure
 * whose record rolled back gone with it; one a handler failed for good with attempts left is worked again. Every line
 * is already written when it throws.
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
      const { ending, changed } = await recordFailure(sql, clock, event, claim.leaseUntil, code, error);
      if (!changed) continue;
      warn(
        ending.kind === "waiting"
          ? `worker: an event is waiting: ${event.topic} ${event.id}: ${code}, again in ${String(ending.seconds)} s`
          : ending.kind === "dead"
            ? `worker: an event is dead: ${event.topic} ${event.id} after ${String(event.attempts)} attempts: ${code}`
            : `worker: an event failed: ${event.topic} ${event.id}, attempt ${String(event.attempts)}: ${code}`,
      );
    }
  }
  return { handled };
}
