/// <reference lib="esnext.temporal" />
// The worker's outbox poller against Postgres as `tadayo_app` (services/worker/src/outbox.ts; docs/plans/
// api-b2-spike-prepare.md sections 1 and 9; spec 34; T52, T54): a claim takes the oldest due event of the worker's
// topics, counts its attempt and leases it, in its own committed transaction, and two claimers never take the same
// one; a handled event is done; a failed one comes back after its backoff, and dies after five attempts or at once
// when it can never work, with its alert line; an event whose last attempt never reported back dies when claimed
// again; and a line or a row says a failure's code, never its message.
//
// Each test writes its events under a topic of its own (`topic()`), which no other file's worker has a handler for,
// and commits them, so the claims here are the real ones, each in its own transaction, as the worker makes them. The
// events are removed at the end.
//
// These tests were written beside the poller, from the plan's section 9, so none was seen to fail before its rule
// existed. The deliberate breakages, run at the PR's last head, show they can fail.

import { randomBytes } from "node:crypto";
import { isPlainLoopback } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import {
  BACKOFF_SECONDS,
  claimNext,
  FailedForGood,
  finishEvent,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  outboxPass,
  StorageUnavailable,
  type Handler,
  type OutboxEvent,
  type WorkerSql,
} from "@tadayo/worker";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, worldSql } from "./harness.ts";

const db = worldSql(8);
const worker = db as unknown as WorkerSql;
const topics: string[] = [];
afterAll(async () => {
  await db.end();
  if (topics.length === 0) return;
  if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
    throw new Error("worker-outbox: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
  }
  const admin = adminSql();
  try {
    await admin`DELETE FROM app.outbox_events WHERE topic IN ${admin(topics)}`;
  } finally {
    await admin.end();
  }
});

const at = (text: string) => Temporal.Instant.from(text);
const T = at("2026-11-06T21:00:00.123456Z");

/** A topic of this test's own: letters only, as 0009's pattern has them. */
function topic(): string {
  const letters = [...randomBytes(12)].map((byte) => String.fromCharCode(97 + (byte % 26))).join("");
  const name = `test.outbox_${letters}`;
  topics.push(name);
  return name;
}

interface Written {
  readonly attempts?: number;
  readonly lastError?: string;
}

/** A committed event of `name`, due at `due`, with `payload`. */
async function event(name: string, due: Temporal.Instant, written: Written = {}, payload = {}): Promise<string> {
  const id = `evt_${randomBytes(16).toString("base64url")}`;
  await db`
    INSERT INTO app.outbox_events (id, topic, dedupe_key, payload, available_at, attempts, last_error, created_at)
    VALUES (${id}, ${name}, ${`${name}:${id}`}, ${JSON.stringify(payload)}::pg_catalog.text::pg_catalog.jsonb, ${due},
            ${written.attempts ?? 0}, ${written.lastError ?? null}, ${due})`;
  return id;
}

async function row(id: string) {
  const [found] = await db<
    {
      state: string;
      attempts: number;
      last_error: string | null;
      available_at: Temporal.Instant;
      processed_at: Temporal.Instant | null;
    }[]
  >`SELECT state, attempts, last_error, available_at, processed_at FROM app.outbox_events WHERE id = ${id}`;
  if (found === undefined) throw new Error("row: no such event");
  return {
    ...found,
    available_at: found.available_at.toString(),
    processed_at: found.processed_at === null ? null : found.processed_at.toString(),
  };
}

/** A handler that records the events it was given, then does `then`. */
function recording(then: (event: OutboxEvent) => Promise<void> = () => Promise.resolve()) {
  const seen: OutboxEvent[] = [];
  const handler: Handler = async (e) => {
    seen.push(e);
    await then(e);
  };
  return { seen, handler };
}

describe("a claim (spec 34, T54)", () => {
  it("takes the oldest due event of the worker's topics alone, counts the attempt and leases it, in a transaction of its own", async () => {
    const mine = topic();
    const other = topic();
    const second = await event(mine, T.subtract({ minutes: 1 }));
    const first = await event(mine, T.subtract({ minutes: 2 }));
    const later = await event(mine, T.add({ microseconds: 1 }));
    const others = await event(other, T.subtract({ minutes: 3 }));
    const clock = fakeClock(T);

    expect(await claimNext(worker, clock, [mine])).toEqual({
      kind: "work",
      event: { id: first, topic: mine, payload: {}, attempts: 1 },
    });
    // Committed: another connection sees the attempt and the lease.
    expect(await row(first)).toEqual({
      state: "pending",
      attempts: 1,
      last_error: null,
      available_at: T.add({ seconds: LEASE_SECONDS }).toString(),
      processed_at: null,
    });
    expect(await claimNext(worker, clock, [mine])).toMatchObject({ kind: "work", event: { id: second, attempts: 1 } });
    // The one due a microsecond later isn't due, the two claimed are leased, and the other topic isn't the worker's.
    expect(await claimNext(worker, clock, [mine])).toBeNull();
    expect(await claimNext(worker, clock, [])).toBeNull();
    expect((await row(later)).attempts).toBe(0);
    expect((await row(others)).attempts).toBe(0);
    // An event due at the very sample is due.
    clock.set(T.add({ microseconds: 1 }));
    expect(await claimNext(worker, clock, [mine])).toMatchObject({ kind: "work", event: { id: later } });
  });

  it(
    "never gives two claimers the same event: one held by another claim is skipped, not waited for",
    { timeout: 30_000 },
    async () => {
      const mine = topic();
      const ids: string[] = [];
      for (let i = 0; i < 6; i += 1) ids.push(await event(mine, T.subtract({ minutes: 10 - i })));
      const clock = fakeClock(T);

      // Another claimer, mid-claim, holds the oldest.
      let go = (): void => undefined;
      const gate = new Promise<void>((resolve) => (go = resolve));
      let held = (): void => undefined;
      const holding = new Promise<void>((resolve) => (held = resolve));
      const other = db.begin(async (tx) => {
        await tx`SELECT FROM app.outbox_events WHERE id = ${ids[0] ?? ""} FOR UPDATE`;
        held();
        await gate;
      });
      await holding;
      try {
        const claimed = await Promise.all(Array.from({ length: 5 }, () => claimNext(worker, clock, [mine])));
        const got = claimed.map((claim) => claim?.event.id);
        expect(new Set(got).size).toBe(5);
        expect([...got].sort()).toEqual(ids.slice(1).sort());
        expect(await claimNext(worker, clock, [mine])).toBeNull();
      } finally {
        go();
        await other;
      }
      expect(await claimNext(worker, clock, [mine])).toMatchObject({ kind: "work", event: { id: ids[0] } });
    },
  );

  it("brings an event back once its lease has passed when its attempt never reported back, as the next attempt", async () => {
    const mine = topic();
    const id = await event(mine, T);
    const clock = fakeClock(T);
    // The process that claimed it died before it reported anything.
    expect(await claimNext(worker, clock, [mine])).toMatchObject({ event: { id, attempts: 1 } });
    clock.set(T.add({ seconds: LEASE_SECONDS }).subtract({ microseconds: 1 }));
    expect(await claimNext(worker, clock, [mine])).toBeNull();
    clock.set(T.add({ seconds: LEASE_SECONDS }));
    expect(await claimNext(worker, clock, [mine])).toMatchObject({ event: { id, attempts: 2 } });
  });
});

describe("a pass (spec 34, T52, T54)", () => {
  it("marks a handled event done at the clock's sample, and its handler is given the event's payload", async () => {
    const mine = topic();
    const id = await event(mine, T, {}, { upload_id: "upl_one" });
    const clock = fakeClock(T.add({ seconds: 5 }));
    const { seen, handler } = recording();
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({ handled: 1, err: [] });
    expect(seen).toEqual([{ id, topic: mine, payload: { upload_id: "upl_one" }, attempts: 1 }]);
    expect(await row(id)).toMatchObject({ state: "done", attempts: 1, processed_at: T.add({ seconds: 5 }).toString() });
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({ handled: 0, err: [] });
  });

  it("tries a failed event again after 30, 60, 120 and 240 seconds, and kills it after five attempts with its code", async () => {
    const mine = topic();
    const id = await event(mine, T);
    const clock = fakeClock(T);
    const { seen, handler } = recording(() => Promise.reject(new StorageUnavailable("got no answer")));
    let now = T;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({
        handled: 0,
        err: [`worker: an event failed: ${mine} ${id}, attempt ${String(attempt)}: storage.unavailable`],
      });
      const wait = BACKOFF_SECONDS * 2 ** (attempt - 1);
      expect(await row(id)).toEqual({
        state: "pending",
        attempts: attempt,
        last_error: "storage.unavailable",
        available_at: now.add({ seconds: wait }).toString(),
        processed_at: null,
      });
      // Not a microsecond before.
      clock.set(now.add({ seconds: wait }).subtract({ microseconds: 1 }));
      expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({ handled: 0, err: [] });
      now = now.add({ seconds: wait });
      clock.set(now);
    }
    expect([30, 60, 120, 240].reduce((sum, s) => sum + s, 0)).toBe(T.until(now).total("seconds"));
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({
      handled: 0,
      err: [`worker: an event is dead: ${mine} ${id} after 5 attempts: storage.unavailable`],
    });
    expect(await row(id)).toMatchObject({
      state: "dead",
      attempts: 5,
      last_error: "storage.unavailable",
      processed_at: now.toString(),
    });
    expect(seen.map((e) => e.attempts)).toEqual([1, 2, 3, 4, 5]);
    clock.set(now.add({ hours: 24 }));
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({ handled: 0, err: [] });
  });

  it("kills at once an event whose failure no retry would end, keeping its code", async () => {
    const mine = topic();
    const id = await event(mine, T);
    const clock = fakeClock(T);
    const { handler } = recording(() => Promise.reject(new FailedForGood("payload")));
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({
      handled: 0,
      err: [`worker: an event is dead: ${mine} ${id} after 1 attempts: payload`],
    });
    expect(await row(id)).toMatchObject({
      state: "dead",
      attempts: 1,
      last_error: "payload",
      processed_at: T.toString(),
    });
  });

  it("kills an event claimed with its attempts spent without running its handler, as lease_lapsed when the last never reported back", async () => {
    const mine = topic();
    const lapsed = await event(mine, T.subtract({ minutes: 2 }), { attempts: MAX_ATTEMPTS });
    const failed = await event(mine, T.subtract({ minutes: 1 }), {
      attempts: MAX_ATTEMPTS,
      lastError: "image.timeout",
    });
    const clock = fakeClock(T);
    const { seen, handler } = recording();
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({
      handled: 0,
      err: [
        `worker: an event is dead: ${mine} ${lapsed} after 5 attempts: lease_lapsed`,
        `worker: an event is dead: ${mine} ${failed} after 5 attempts: image.timeout`,
      ],
    });
    expect(seen).toEqual([]);
    expect(await row(lapsed)).toMatchObject({ state: "dead", attempts: 5, last_error: "lease_lapsed" });
    expect(await row(failed)).toMatchObject({ state: "dead", attempts: 5, last_error: "image.timeout" });
  });

  it("writes a failure's code, never its message: Postgres's SQLSTATE, a system's code, else unknown (T52)", async () => {
    const mine = topic();
    const secret = `secret${randomBytes(8).toString("hex")}`;
    const failures: [string, () => Promise<void>, string][] = [
      [
        "postgres",
        async () => {
          await db`SELECT 1 / ${0}::int4`;
        },
        "db.22012",
      ],
      [
        "system",
        () => Promise.reject(Object.assign(new Error(`connect ECONNRESET ${secret}`), { code: "ECONNRESET" })),
        "sys.econnreset",
      ],
      ["message", () => Promise.reject(new Error(`postgres://tadayo_app:${secret}@db/tadayo`)), "unknown"],
      ["code", () => Promise.reject(Object.assign(new Error(secret), { code: `${secret} with spaces` })), "unknown"],
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a failure that isn't an Error is the case
      ["thrown", () => Promise.reject(secret), "unknown"],
    ];
    const ids = new Map<string, string>();
    for (const [what] of failures) ids.set(what, await event(mine, T, {}, { what }));
    const clock = fakeClock(T);
    const handler: Handler = async (e) => {
      const what = (e.payload as { what: string }).what;
      await (failures.find(([name]) => name === what)?.[1] ?? (() => Promise.resolve()))();
    };
    const result = await outboxPass(worker, clock, { [mine]: handler });
    expect(result.handled).toBe(0);
    expect(result.err).toHaveLength(failures.length);
    expect(result.err.join("\n")).not.toContain(secret);
    for (const [what, , code] of failures) {
      const id = ids.get(what) ?? "";
      expect(result.err).toContain(`worker: an event failed: ${mine} ${id}, attempt 1: ${code}`);
      expect(await row(id)).toMatchObject({ state: "pending", last_error: code });
    }
  });

  it("stops between events when told to, leaving the rest due", async () => {
    const mine = topic();
    const first = await event(mine, T.subtract({ minutes: 2 }));
    const second = await event(mine, T.subtract({ minutes: 1 }));
    const clock = fakeClock(T);
    let stop = false;
    const { handler } = recording(() => {
      stop = true;
      return Promise.resolve();
    });
    expect(await outboxPass(worker, clock, { [mine]: handler }, () => stop)).toEqual({ handled: 1, err: [] });
    expect((await row(first)).state).toBe("done");
    expect(await row(second)).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("writes nothing over an event its handler already ended, when the handler then fails", async () => {
    const mine = topic();
    const id = await event(mine, T);
    const clock = fakeClock(T);
    // A handler that committed its work and the event's end, then failed on its way out.
    const { handler } = recording(async (e) => {
      await db.begin((tx) => finishEvent(tx, e.id, T));
      throw new StorageUnavailable("got no answer");
    });
    expect(await outboxPass(worker, clock, { [mine]: handler })).toEqual({ handled: 0, err: [] });
    expect(await row(id)).toMatchObject({ state: "done", attempts: 1, last_error: null, processed_at: T.toString() });
  });
});
