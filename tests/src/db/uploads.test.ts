/// <reference lib="esnext.temporal" />
// Starting a drop's photo upload, reading it and handing it to preparation, against Postgres as `tadayo_app`
// (spec 11, 32, 33; T1, T3, T4, T9, T12, T14, T17, T18, T19, T54; FQ63, FQ112; Q12;
// docs/plans/api-b2-spike-uploads.md, section 3; packages/domain/src/media/upload.ts): only the holder of a live
// photo slot in a day still collecting starts one, one upload to a slot until a rejection, the refusals and the
// facts they carry, the cutoff read after the locks, a release racing an upload, the receipt, the owner's reads,
// the one outbox event, and the database's last guards (db/migrations/0016_upload_reservation.sql), each raced
// with a release in both orders.
//
// The world is world.ts's: Ana's Saturday 7 November 2026 in a London club, which is on UTC then, revealed at
// 07:00Z; Ben and Cleo are its other members, and Dan has no club. Ana's next two Saturdays are added here, so
// a refusal has a next day to offer (T4).
//
// These tests were written beside the command, from the plan's section 3, so none was seen to fail before its
// rule existed, except the review's: one upload to a slot and the guard's two races, each seen failing before
// its fix or with its lock removed. The deliberate breakages, run at the PR's last head, show the rest can fail.

import { randomBytes, randomUUID } from "node:crypto";
import { reservationBody, uploadBody } from "@tadayo/api";
import {
  createDropPhotoUpload,
  createReservation,
  isPlainLoopback,
  markPreparing,
  OBJECT_KEY,
  readOwnUpload,
  Refused,
  releaseReservation,
  type Json,
  type MediaClass,
  type RefusalFacts,
  type ToSign,
  type UploadAnswer,
  type UploadContentType,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, expectRefused, REFUSED, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { forgetCommittedDays, waitingOn } from "./week-world.ts";
import { AT, commitDrop, joinByRoster, leave, newWorld, type World } from "./world.ts";

const db = worldSql(8);
const committedDays: string[] = [];
afterAll(async () => {
  await db.end();
  // The races below need their world committed: their uploads name their reservations, which name the days, so
  // they go first, then the counters, then every committed day.
  if (committedDays.length > 0) {
    if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
      throw new Error("uploads: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
    }
    const admin = adminSql();
    try {
      await admin.begin(async (tx) => {
        await tx`DELETE FROM app.uploads u USING app.reservations r
                  WHERE u.reservation_id = r.id AND r.occurrence_id IN ${tx(committedDays)}`;
        await tx`DELETE FROM app.reservations WHERE occurrence_id IN ${tx(committedDays)}`;
        await tx`DELETE FROM app.contribution_counters WHERE occurrence_id IN ${tx(committedDays)}`;
      });
    } finally {
      await admin.end();
    }
    await forgetCommittedDays();
  }
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);

/** The evening before Ana's Saturday, to the microsecond, as a clock's sample is. */
const EVENING = at("2026-11-06T21:00:00.123456Z");
const REVEAL = at("2026-11-07T07:00:00Z");
const clock = fakeClock(EVENING);
beforeEach(() => {
  clock.set(EVENING);
});

interface Days {
  w: World;
  /** Ana's next two Saturdays, 14 and 21 November. */
  next: string;
  after: string;
}

/** world.ts's world, with Ana's next two Saturdays. */
async function days(tx: WorldTx, suffix = ""): Promise<Days> {
  const w = await newWorld(plain(tx), suffix);
  const made: string[] = [];
  for (const date of ["2026-11-14", "2026-11-21"]) {
    const id = `occ_${randomUUID().replaceAll("-", "")}`;
    await tx`
      INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                   collecting_from)
      VALUES (${id}, ${w.club}, ${w.ana.interval}, ${w.version}, ${date}, ${at(`${date}T07:00:00Z`)},
              ${at(`${date}T07:00:00Z`).add({ hours: 18 })}, ${AT.generated})`;
    made.push(id);
  }
  return { w, next: made[0] ?? "", after: made[1] ?? "" };
}

/** A slot `who` holds in Ana's Saturday unless said, by `createReservation` as its route runs it. */
async function slot(
  tx: WorldTx,
  d: Days,
  who: { user: string },
  media: MediaClass = "photo",
  day = d.w.day,
): Promise<string> {
  const body = (await tx.savepoint((sp) =>
    createReservation(
      sp,
      clock,
      { userId: who.user, key: randomUUID(), occurrenceId: day, mediaClass: media },
      reservationBody,
    ),
  )) as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("slot: no reservation came back");
  return body.id;
}

interface Made {
  readonly status: 201;
  readonly body: { id: string; purpose: string; state: string; expires_at: string } & Record<string, unknown>;
  /** The answer as the receipt keeps it, byte for byte. */
  readonly text: string;
  readonly toSign: ToSign | null;
}
interface Refusal {
  readonly code: string;
  readonly facts: RefusalFacts;
}
type Outcome = Made | Refusal;

async function outcomeOf(running: Promise<{ body: Json; toSign: Made["toSign"] }>): Promise<Outcome> {
  try {
    const { body, toSign } = await running;
    return { status: 201, body: body as unknown as Made["body"], text: JSON.stringify(body), toSign };
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

interface UploadOptions {
  key?: string;
  contentType?: UploadContentType;
  byteSize?: number;
  clock?: FakeClock;
}

/** `createUpload` for a drop's photo as its route runs it, for `who`, under the reservation `reservationId`. */
function upload(tx: WorldTx, who: { user: string }, reservationId: string, options: UploadOptions = {}) {
  return outcomeOf(
    tx.savepoint((sp) =>
      createDropPhotoUpload(
        sp,
        options.clock ?? clock,
        {
          userId: who.user,
          key: options.key ?? randomUUID(),
          reservationId,
          contentType: options.contentType ?? "image/jpeg",
          byteSize: options.byteSize ?? 2_500_000,
        },
        uploadBody,
      ),
    ),
  );
}

function made(outcome: Outcome): Made {
  if (!("status" in outcome)) throw new Error(`expected an upload made, not ${outcome.code}`);
  return outcome;
}

const bare = (code: string) => ({ code, facts: {} });

async function release(tx: WorldTx, who: { user: string }, reservationId: string): Promise<string> {
  const answer = await tx.savepoint((sp) => releaseReservation(sp, clock, { userId: who.user, reservationId }));
  return answer.state;
}

async function reading(tx: WorldTx, who: { user: string }, uploadId: string, now?: Temporal.Instant) {
  try {
    return await tx.savepoint(async (sp) =>
      readOwnUpload(sp, { userId: who.user, uploadId }, await (now === undefined ? clock : fakeClock(now)).sample(sp)),
    );
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

async function completing(tx: WorldTx, who: { user: string }, uploadId: string): Promise<UploadAnswer | Refusal> {
  try {
    return await tx.savepoint((sp) => markPreparing(sp, clock, { userId: who.user, uploadId }));
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

/** An upload's row, its instants as their strings (`toMatchObject` takes any two instants as equal). */
async function uploadRow(tx: WorldTx, id: string) {
  const [row] = await tx<
    {
      owner_user_id: string;
      purpose: string;
      reservation_id: string | null;
      content_type: string;
      byte_size: number;
      object_key: string;
      state: string;
      created_at: Temporal.Instant;
      expires_at: Temporal.Instant;
    }[]
  >`SELECT owner_user_id, purpose, reservation_id, content_type, byte_size, object_key, state, created_at, expires_at
      FROM app.uploads WHERE id = ${id}`;
  return row === undefined
    ? undefined
    : { ...row, created_at: row.created_at.toString(), expires_at: row.expires_at.toString() };
}

const uploadsOf = (tx: WorldTx, reservationId: string) =>
  tx`SELECT FROM app.uploads WHERE reservation_id = ${reservationId}`;
const uploadReceipts = (tx: WorldTx, user: string) =>
  tx`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${user} AND operation = 'createUpload'`;

describe("a drop's photo starts under the caller's own live photo slot (T12, T17)", () => {
  it("makes a pending upload for one random object, living 24 hours from the sample, its answer with no URL", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await slot(tx, d, d.w.ben);
      clock.advance({ minutes: 1 });
      const sample = EVENING.add({ minutes: 1 });
      const one = made(await upload(tx, d.w.ben, bens, { contentType: "image/png", byteSize: 1_234_567 }));
      expect(one.body).toEqual({
        id: one.body.id,
        purpose: "drop_photo",
        state: "pending",
        expires_at: sample.add({ hours: 24 }).toString({ smallestUnit: "second" }),
      });
      expect(one.body.id).toMatch(/^upl_/);
      expect(one.toSign?.objectKey).toMatch(OBJECT_KEY);
      expect(one.toSign?.at.toString()).toBe(sample.toString());
      expect(await uploadRow(tx, one.body.id)).toEqual({
        owner_user_id: d.w.ben.user,
        purpose: "drop_photo",
        reservation_id: bens,
        content_type: "image/png",
        byte_size: 1_234_567,
        object_key: one.toSign?.objectKey,
        state: "pending",
        created_at: sample.toString(),
        expires_at: sample.add({ hours: 24 }).toString(),
      });
      // The receipt keeps the answer as given, which has no URL and no object (T12).
      const [receipt] = await tx<{ response_status: number; response_body: unknown }[]>`
        SELECT response_status, response_body FROM app.idempotency_receipts
         WHERE actor_user_id = ${d.w.ben.user} AND operation = 'createUpload'`;
      expect(receipt).toEqual({ response_status: 201, response_body: one.body });
      expect(JSON.stringify(receipt)).not.toContain(one.toSign?.objectKey ?? "none");
    });
  });

  it("makes one for the star under Ana's own slot, and a new object for every upload", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const first = made(await upload(tx, d.w.ana, await slot(tx, d, d.w.ana)));
      const second = made(await upload(tx, d.w.ana, await slot(tx, d, d.w.ana)));
      expect(first.toSign?.objectKey).not.toBe(second.toSign?.objectKey);
      expect(first.body.id).not.toBe(second.body.id);
    });
  });
});

describe("one slot, one photo: a slot takes another upload only once its upload was rejected (spec 11, T17)", () => {
  it("gives the neutral not-found for a second upload under the same slot with a new key, pending or preparing, and keeps the first key's replay", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await slot(tx, d, d.w.ben);
      const key = randomUUID();
      const first = made(await upload(tx, d.w.ben, bens, { key }));
      const second = randomUUID();
      expect(await upload(tx, d.w.ben, bens, { key: second })).toEqual(bare("NOT_FOUND"));
      expect(await tx`SELECT FROM app.idempotency_receipts WHERE idempotency_key = ${second}`).toHaveLength(0);
      const replay = made(await upload(tx, d.w.ben, bens, { key }));
      expect(replay.text).toBe(first.text);
      expect(replay.toSign?.objectKey).toBe(first.toSign?.objectKey);
      expect(await completing(tx, d.w.ben, first.body.id)).toMatchObject({ state: "preparing" });
      expect(await upload(tx, d.w.ben, bens)).toEqual(bare("NOT_FOUND"));
      await tx`UPDATE app.uploads SET state = 'ready', content_hash = ${randomBytes(32)},
                                      content_version = ${`v_${randomUUID().replaceAll("-", "")}`}
                WHERE id = ${first.body.id}`;
      expect(await upload(tx, d.w.ben, bens)).toEqual(bare("NOT_FOUND"));
      expect(await uploadsOf(tx, bens)).toHaveLength(1);
      expect(await uploadReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("makes one more upload, for a new object, under a slot whose upload was rejected, and then no other", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await slot(tx, d, d.w.ben);
      const first = made(await upload(tx, d.w.ben, bens));
      await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${first.body.id}`;
      await tx`UPDATE app.uploads SET state = 'rejected', rejection = 'unreadable' WHERE id = ${first.body.id}`;
      const again = made(await upload(tx, d.w.ben, bens));
      expect(again.body.id).not.toBe(first.body.id);
      expect(again.toSign?.objectKey).not.toBe(first.toSign?.objectKey);
      expect(await upload(tx, d.w.ben, bens)).toEqual(bare("NOT_FOUND"));
      expect(await uploadsOf(tx, bens)).toHaveLength(2);
    });
  });

  it(
    "puts two uploads with new keys under one slot in order by the counter: the one that waited makes nothing",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      const start = (tx: WorldTx) =>
        createDropPhotoUpload(
          tx,
          clock,
          { userId: d.w.ben.user, key: randomUUID(), reservationId: bens, contentType: "image/jpeg", byteSize: 1000 },
          uploadBody,
        );
      const { first, second } = await racing(start, () => outcomeOf(db.begin((tx) => start(tx as unknown as WorldTx))));
      expect(first.toSign).not.toBeNull();
      expect(second).toEqual(bare("NOT_FOUND"));
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens}`).toHaveLength(1);
    },
  );
});

describe("nothing for a slot that isn't the caller's own and live (T9, T14, T18)", () => {
  it("gives the neutral not-found for another member's slot, a former member's, an earlier interval's, a guessed id, and a link's slot", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await slot(tx, d, d.w.ben);
      for (const who of [d.w.cleo, d.w.ana, d.w.dan]) expect(await upload(tx, who, bens)).toEqual(bare("NOT_FOUND"));
      expect(await upload(tx, d.w.ben, "rsv_nobody")).toEqual(bare("NOT_FOUND"));
      expect(await upload(tx, d.w.ben, "rsv.nobody")).toEqual(bare("NOT_FOUND"));
      expect(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben, "external_video"))).toEqual(bare("NOT_FOUND"));
      const cleos = await slot(tx, d, d.w.cleo);
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T21:05:00Z"));
      expect(await upload(tx, d.w.cleo, cleos)).toEqual(bare("NOT_FOUND"));
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await upload(tx, d.w.ben, bens)).toEqual(bare("NOT_FOUND"));
      expect(
        await tx`SELECT FROM app.uploads WHERE owner_user_id IN ${tx([d.w.ben.user, d.w.cleo.user, d.w.ana.user, d.w.dan.user])}`,
      ).toHaveLength(0);
      for (const who of [d.w.ben, d.w.cleo, d.w.ana, d.w.dan])
        expect(await uploadReceipts(tx, who.user)).toHaveLength(0);
    });
  });

  it("gives the neutral not-found for a released slot, a consumed one, and one lapsed at its expires_at, settled or not", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const released = await slot(tx, d, d.w.ben);
      expect(await release(tx, d.w.ben, released)).toBe("released");
      expect(await upload(tx, d.w.ben, released)).toEqual(bare("NOT_FOUND"));

      await commitDrop(plain(tx), d.w, d.w.cleo);
      const [consumed] = await tx<{ id: string }[]>`
        SELECT id FROM app.reservations WHERE interval_id = ${d.w.cleo.interval} AND state = 'consumed'`;
      expect(await upload(tx, d.w.cleo, consumed?.id ?? "")).toEqual(bare("NOT_FOUND"));

      // Ben's two slots, both taken at the evening: a microsecond before they lapse, one is still good.
      const early = await slot(tx, d, d.w.ben);
      const late = await slot(tx, d, d.w.ben);
      clock.set(EVENING.add({ minutes: 30 }).subtract({ microseconds: 1 }));
      made(await upload(tx, d.w.ben, early));
      // Exactly at its expires_at the other has lapsed, though nothing has settled it yet.
      clock.set(EVENING.add({ minutes: 30 }));
      expect(await tx<{ state: string }[]>`SELECT state FROM app.reservations WHERE id = ${late}`).toEqual([
        { state: "live" },
      ]);
      expect(await upload(tx, d.w.ben, late)).toEqual(bare("NOT_FOUND"));
      // A new slot settles it; refused all the same.
      await slot(tx, d, d.w.ben);
      expect(await tx<{ state: string }[]>`SELECT state FROM app.reservations WHERE id = ${late}`).toEqual([
        { state: "expired" },
      ]);
      expect(await upload(tx, d.w.ben, late)).toEqual(bare("NOT_FOUND"));
      expect(await uploadsOf(tx, late)).toHaveLength(0);
      expect(await uploadsOf(tx, released)).toHaveLength(0);
      expect(await uploadReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("gives the neutral not-found for a suspended club, a suspended or cancelled day, and a deleting account", async () => {
    const denials: ((tx: WorldTx, d: Days) => Promise<unknown>)[] = [
      (tx, d) => tx`UPDATE app.clubs SET suspended_at = ${new Date("2026-11-06T21:05:00Z")} WHERE id = ${d.w.club}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${d.w.day}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${d.w.day}`,
      (tx, d) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${new Date("2026-11-06T21:05:00Z")}
            WHERE id = ${d.w.ben.user}`,
    ];
    for (const deny of denials) {
      await rolledBack(db, async (tx) => {
        const d = await days(tx);
        const bens = await slot(tx, d, d.w.ben);
        await deny(tx, d);
        clock.set(at("2026-11-06T21:10:00Z"));
        expect(await upload(tx, d.w.ben, bens)).toEqual(bare("NOT_FOUND"));
        expect(await uploadsOf(tx, bens)).toHaveLength(0);
        expect(await uploadReceipts(tx, d.w.ben.user)).toHaveLength(0);
      });
    }
  });

  it("answers MEMBERSHIP_CHANGED, with no facts, for a slot in a day whose star left before its reveal (FQ63)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await slot(tx, d, d.w.ben);
      await leave(plain(tx), d.w.ana, "Ana", new Date("2026-11-06T21:05:00Z"));
      clock.set(at("2026-11-06T21:10:00Z"));
      expect(await upload(tx, d.w.ben, bens)).toEqual(bare("MEMBERSHIP_CHANGED"));
      expect(await uploadsOf(tx, bens)).toHaveLength(0);
      expect(await uploadReceipts(tx, d.w.ben.user)).toHaveLength(0);
    });
  });
});

describe("the cutoff is the reveal, read after the locks (T3, T4)", () => {
  it("makes an upload a microsecond before the reveal, and from the reveal answers OCCURRENCE_CLOSED with the day and Ana's next", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      clock.set(REVEAL.subtract({ minutes: 10 }));
      const first = await slot(tx, d, d.w.ben);
      const second = await slot(tx, d, d.w.ben);
      clock.set(REVEAL.subtract({ microseconds: 1 }));
      made(await upload(tx, d.w.ben, first));
      clock.set(REVEAL);
      const closed = (await upload(tx, d.w.ben, second)) as Refusal;
      expect(closed.code).toBe("OCCURRENCE_CLOSED");
      expect(Object.keys(closed.facts).sort()).toEqual(["next_target", "target"]);
      expect(closed.facts.target).toMatchObject({ id: d.w.day, phase: "open", localDate: "2026-11-07" });
      expect(closed.facts.next_target).toMatchObject({ id: d.next, phase: "collecting", localDate: "2026-11-14" });
      expect(await uploadsOf(tx, second)).toHaveLength(0);
    });
  });

  it(
    "waits for the counter's row, and reads the clock after it: an upload that waited across the reveal is refused",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      clock.set(REVEAL.subtract({ seconds: 2 }));
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      clock.set(REVEAL.subtract({ seconds: 1 }));
      const hold = await holdingCounter(d.w.day, d.w.ben.interval);
      const waiting = outcomeOf(
        db.begin((tx) =>
          createDropPhotoUpload(
            tx as unknown as WorldTx,
            clock,
            { userId: d.w.ben.user, key: randomUUID(), reservationId: bens, contentType: "image/jpeg", byteSize: 1000 },
            uploadBody,
          ),
        ),
      );
      try {
        await waitingOn(db, hold.pid, 1);
        clock.set(REVEAL);
      } finally {
        await hold.release();
      }
      expect(await waiting).toMatchObject({
        code: "OCCURRENCE_CLOSED",
        facts: { target: { id: d.w.day, phase: "open" } },
      });
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens}`).toHaveLength(0);
      expect(
        await db`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${d.w.ben.user} AND operation = 'createUpload'`,
      ).toHaveLength(0);
    },
  );
});

/**
 * Another connection holding `interval`'s counter row in `day` `FOR NO KEY UPDATE`, the command's own lock on it,
 * writing nothing, until released.
 */
async function holdingCounter(day: string, interval: string): Promise<{ pid: number; release: () => Promise<void> }> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held: (pid: number) => void = () => undefined;
  const taken = new Promise<number>((resolve) => (held = resolve));
  const done = db.begin(async (tx) => {
    const [row] = await tx<{ pid: number }[]>`
      SELECT pg_catalog.pg_backend_pid() AS pid FROM app.contribution_counters
       WHERE occurrence_id = ${day} AND interval_id = ${interval} FOR NO KEY UPDATE`;
    if (row === undefined) throw new Error("holdingCounter: no such counter");
    held(row.pid);
    await released;
  });
  return {
    pid: await taken,
    release: async () => {
      release();
      await done;
    },
  };
}

/**
 * Runs `first` in its own transaction and holds it open after it has run, until a second transaction, `second`,
 * is seen waiting for it; then lets it commit and returns both outcomes.
 */
async function racing<A, B>(
  first: (tx: WorldTx) => Promise<A>,
  second: () => Promise<B>,
): Promise<{ first: A; second: B }> {
  let open = (): void => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let ready: (pid: number) => void = () => undefined;
  const started = new Promise<number>((resolve) => (ready = resolve));
  const one = db.begin(async (raw) => {
    const tx = raw as unknown as WorldTx;
    const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
    const result = await first(tx);
    ready(row?.pid ?? 0);
    await gate;
    return result;
  });
  const pid = await started;
  const two = second();
  try {
    await waitingOn(db, pid, 1);
  } finally {
    open();
  }
  return { first: (await one) as A, second: await two };
}

describe("a release and an upload on the same slot are put in order by the counter (T17, T18)", () => {
  const begin = (d: Days, reservationId: string) =>
    outcomeOf(
      db.begin((tx) =>
        createDropPhotoUpload(
          tx as unknown as WorldTx,
          clock,
          { userId: d.w.ben.user, key: randomUUID(), reservationId, contentType: "image/jpeg", byteSize: 1000 },
          uploadBody,
        ),
      ),
    );

  it(
    "makes an upload that waited for a release's commit see the slot released: never an upload under a released slot",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      const { first, second } = await racing(
        (tx) => releaseReservation(tx, clock, { userId: d.w.ben.user, reservationId: bens }),
        () => begin(d, bens),
      );
      expect(first.state).toBe("released");
      expect(second).toEqual(bare("NOT_FOUND"));
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens}`).toHaveLength(0);
    },
  );

  it(
    "makes a release that waited for an upload's commit give back a slot whose upload was made while it was live",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      const { first, second } = await racing(
        (tx) =>
          createDropPhotoUpload(
            tx,
            clock,
            { userId: d.w.ben.user, key: randomUUID(), reservationId: bens, contentType: "image/jpeg", byteSize: 1000 },
            uploadBody,
          ),
        () =>
          db.begin((tx) =>
            releaseReservation(tx as unknown as WorldTx, clock, { userId: d.w.ben.user, reservationId: bens }),
          ),
      );
      expect(first.toSign).not.toBeNull();
      expect(second.state).toBe("released");
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens} AND state = 'pending'`).toHaveLength(1);
    },
  );
});

describe("one upload per Idempotency-Key, and its first answer on every retry (T19, Q12)", () => {
  it("returns the first answer byte for byte after a release, the slot's lapse, midnight and the cutoff, with an object to sign only while the upload is pending and lives", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      const bens = await slot(tx, d, d.w.ben);
      const first = made(await upload(tx, d.w.ben, bens, { key }));
      const object = first.toSign?.objectKey;
      const again = async (): Promise<Made> => {
        const replay = made(await upload(tx, d.w.ben, bens, { key }));
        expect(replay.text).toBe(first.text);
        return replay;
      };
      clock.advance({ minutes: 1 });
      const replay = await again();
      expect(replay.toSign?.objectKey).toBe(object);
      expect(replay.toSign?.at.toString()).toBe(EVENING.add({ minutes: 1 }).toString());
      expect(await release(tx, d.w.ben, bens)).toBe("released");
      expect((await again()).toSign?.objectKey).toBe(object);
      clock.set(at("2026-11-07T00:00:00.5Z"));
      expect((await again()).toSign?.objectKey).toBe(object);
      clock.set(REVEAL.add({ hours: 1 }));
      expect((await again()).toSign?.objectKey).toBe(object);
      // Handed to preparation, it is answered the same, with nothing to sign.
      expect(await completing(tx, d.w.ben, first.body.id)).toMatchObject({ state: "preparing" });
      expect((await again()).toSign).toBeNull();
      expect(await tx`SELECT FROM app.uploads WHERE owner_user_id = ${d.w.ben.user}`).toHaveLength(1);
    });
  });

  it("gives nothing to sign once the upload has lapsed, still pending", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      const bens = await slot(tx, d, d.w.ben);
      const first = made(await upload(tx, d.w.ben, bens, { key }));
      clock.set(EVENING.add({ hours: 24 }).subtract({ microseconds: 1 }));
      expect(made(await upload(tx, d.w.ben, bens, { key })).toSign).not.toBeNull();
      clock.set(EVENING.add({ hours: 24 }));
      const late = made(await upload(tx, d.w.ben, bens, { key }));
      expect(late.text).toBe(first.text);
      expect(late.toSign).toBeNull();
    });
  });

  it("returns the first answer after the slot lapsed unreleased, unsettled and settled, signing while the upload is pending", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      const bens = await slot(tx, d, d.w.ben);
      const first = made(await upload(tx, d.w.ben, bens, { key }));
      // At the slot's expires_at it has lapsed, though nothing has settled it.
      clock.set(EVENING.add({ minutes: 30 }));
      expect(await tx<{ state: string }[]>`SELECT state FROM app.reservations WHERE id = ${bens}`).toEqual([
        { state: "live" },
      ]);
      const unsettled = made(await upload(tx, d.w.ben, bens, { key }));
      expect(unsettled.text).toBe(first.text);
      expect(unsettled.toSign?.objectKey).toBe(first.toSign?.objectKey);
      // A new slot settles it.
      await slot(tx, d, d.w.ben);
      expect(await tx<{ state: string }[]>`SELECT state FROM app.reservations WHERE id = ${bens}`).toEqual([
        { state: "expired" },
      ]);
      const settled = made(await upload(tx, d.w.ben, bens, { key }));
      expect(settled.text).toBe(first.text);
      expect(settled.toSign?.objectKey).toBe(first.toSign?.objectKey);
      expect(settled.toSign?.expiresAt.toString()).toBe(EVENING.add({ hours: 24 }).toString());
      expect(await uploadsOf(tx, bens)).toHaveLength(1);
    });
  });

  it("refuses another body under the same key with IDEMPOTENCY_CONFLICT", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      const bens = await slot(tx, d, d.w.ben);
      made(await upload(tx, d.w.ben, bens, { key }));
      expect(await upload(tx, d.w.ben, bens, { key, contentType: "image/webp" })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await upload(tx, d.w.ben, bens, { key, byteSize: 999 })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben), { key })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben, "photo", d.next), { key })).toEqual(
        bare("IDEMPOTENCY_CONFLICT"),
      );
      expect(await tx`SELECT FROM app.uploads WHERE owner_user_id = ${d.w.ben.user}`).toHaveLength(1);
    });
  });

  it("leaves no receipt for a refusal, so the same key can be tried again under a live slot", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const lapsing = await slot(tx, d, d.w.ben);
      clock.set(EVENING.add({ minutes: 30 }));
      const key = randomUUID();
      expect(await upload(tx, d.w.ben, lapsing, { key })).toEqual(bare("NOT_FOUND"));
      expect(await tx`SELECT FROM app.idempotency_receipts WHERE idempotency_key = ${key}`).toHaveLength(0);
      made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben), { key }));
    });
  });

  it("names nothing to a rejoined account under a key its earlier interval used (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben), { key }));
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben), { key })).toEqual(bare("NOT_FOUND"));
    });
  });
});

describe("the caller's own upload, read and handed to preparation while it lives (T12, T14, T54)", () => {
  it("reads the caller's own upload until its expires_at, and nobody else's", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const one = made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben)));
      const expires = EVENING.add({ hours: 24 });
      const own = await reading(tx, d.w.ben, one.body.id);
      expect(own).toEqual({
        answer: { id: one.body.id, purpose: "drop_photo", state: "pending", rejection: null, expiresAt: expires },
        objectKey: one.toSign?.objectKey,
      });
      // `toEqual` takes any two instants as equal, so the expiry is matched by its string.
      expect("answer" in own && own.answer.expiresAt.toString()).toBe(expires.toString());
      for (const who of [d.w.cleo, d.w.ana, d.w.dan])
        expect(await reading(tx, who, one.body.id)).toEqual(bare("NOT_FOUND"));
      expect(await reading(tx, d.w.ben, "upl_nobody")).toEqual(bare("NOT_FOUND"));
      expect(await reading(tx, d.w.ben, "upl.nobody")).toEqual(bare("NOT_FOUND"));
      expect(await reading(tx, d.w.ben, one.body.id, expires.subtract({ microseconds: 1 }))).toMatchObject({
        answer: { state: "pending" },
      });
      expect(await reading(tx, d.w.ben, one.body.id, expires)).toEqual(bare("NOT_FOUND"));
    });
  });

  it("hands a pending upload to preparation once, with one outbox event however often it's repeated", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const one = made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben)));
      clock.advance({ minutes: 2 });
      const sample = EVENING.add({ minutes: 2 });
      for (const who of [d.w.cleo, d.w.ana, d.w.dan])
        expect(await completing(tx, who, one.body.id)).toEqual(bare("NOT_FOUND"));
      expect(await uploadRow(tx, one.body.id)).toMatchObject({ state: "pending" });
      const answer = await completing(tx, d.w.ben, one.body.id);
      expect(answer).toEqual({
        id: one.body.id,
        purpose: "drop_photo",
        state: "preparing",
        rejection: null,
        expiresAt: EVENING.add({ hours: 24 }),
      });
      expect("expiresAt" in answer && answer.expiresAt.toString()).toBe(EVENING.add({ hours: 24 }).toString());
      clock.advance({ minutes: 1 });
      expect(await completing(tx, d.w.ben, one.body.id)).toEqual(answer);
      const events = await tx<
        {
          topic: string;
          payload: unknown;
          state: string;
          available_at: Temporal.Instant;
          created_at: Temporal.Instant;
        }[]
      >`SELECT topic, payload, state, available_at, created_at FROM app.outbox_events
          WHERE dedupe_key = ${`upload.prepare:${one.body.id}`}`;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        topic: "upload.prepare",
        payload: { upload_id: one.body.id },
        state: "pending",
      });
      expect(events[0]?.available_at.toString()).toBe(sample.toString());
      expect(events[0]?.created_at.toString()).toBe(sample.toString());
      expect(await uploadRow(tx, one.body.id)).toMatchObject({ state: "preparing" });
    });
  });

  it("answers an upload past preparing as it is, adding no event", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const ready = made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben)));
      const rejected = made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben)));
      for (const id of [ready.body.id, rejected.body.id])
        await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${id}`;
      await tx`UPDATE app.uploads SET state = 'ready', content_hash = ${randomBytes(32)}, content_version = ${`v_${randomUUID().replaceAll("-", "")}`}
                WHERE id = ${ready.body.id}`;
      await tx`UPDATE app.uploads SET state = 'rejected', rejection = 'too_many_pixels' WHERE id = ${rejected.body.id}`;
      expect(await completing(tx, d.w.ben, ready.body.id)).toMatchObject({ state: "ready", rejection: null });
      expect(await completing(tx, d.w.ben, rejected.body.id)).toMatchObject({
        state: "rejected",
        rejection: "too_many_pixels",
      });
      expect(
        await tx`SELECT FROM app.outbox_events WHERE dedupe_key IN ${tx([`upload.prepare:${ready.body.id}`, `upload.prepare:${rejected.body.id}`])}`,
      ).toHaveLength(0);
    });
  });

  it("gives the neutral not-found for an upload past its expires_at, changing nothing", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const one = made(await upload(tx, d.w.ben, await slot(tx, d, d.w.ben)));
      clock.set(EVENING.add({ hours: 24 }));
      expect(await completing(tx, d.w.ben, one.body.id)).toEqual(bare("NOT_FOUND"));
      expect(await uploadRow(tx, one.body.id)).toMatchObject({ state: "pending" });
      expect(
        await tx`SELECT FROM app.outbox_events WHERE dedupe_key = ${`upload.prepare:${one.body.id}`}`,
      ).toHaveLength(0);
    });
  });
});

describe("the database's last guards: a drop's photo only under a live photo slot, one at a time (0016, T17, T18)", () => {
  const insert = (sp: WorldTx, d: Days, reservationId: string, createdAt: Temporal.Instant) =>
    sp`INSERT INTO app.uploads (id, owner_user_id, purpose, reservation_id, content_type, byte_size, object_key,
                                created_at, expires_at)
       VALUES (${`upl_${randomUUID().replaceAll("-", "")}`}, ${d.w.ben.user}, 'drop_photo', ${reservationId}, 'image/jpeg',
               1000, ${randomBytes(24).toString("base64url")}, ${createdAt}, ${createdAt.add({ hours: 24 })})`;
  const message = /live photo reservation/;

  it("refuses an upload written past the domain under a released, consumed, lapsed or link slot, and lets a live photo slot's through", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const evening = at("2026-11-06T21:01:00Z");
      const released = await slot(tx, d, d.w.ben);
      await release(tx, d.w.ben, released);
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) => insert(sp as unknown as WorldTx, d, released, evening),
        message,
      );

      const link = await slot(tx, d, d.w.ben, "external_video");
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) => insert(sp as unknown as WorldTx, d, link, evening),
        message,
      );

      const live = await slot(tx, d, d.w.ben);
      // At its expires_at, 30 minutes on, the slot has lapsed, though it is still marked live.
      const lapse = EVENING.add({ minutes: 30 });
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) => insert(sp as unknown as WorldTx, d, live, lapse),
        message,
      );
      await tx.savepoint((sp) => insert(sp, d, live, lapse.subtract({ microseconds: 1 })));
      expect(await uploadsOf(tx, live)).toHaveLength(1);

      const drop = await commitDrop(plain(tx), d.w, d.w.ben, { at: new Date("2026-11-06T21:02:00Z") });
      const [consumed] = await tx<{ id: string }[]>`SELECT id FROM app.reservations WHERE drop_id = ${drop}`;
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) => insert(sp as unknown as WorldTx, d, consumed?.id ?? "", evening),
        message,
      );
    });
  });

  it("refuses a second upload under a slot past the domain while the first isn't rejected, and takes one after", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const evening = at("2026-11-06T21:01:00Z");
      const live = await slot(tx, d, d.w.ben);
      await tx.savepoint((sp) => insert(sp, d, live, evening));
      const [first] = await tx<{ id: string }[]>`SELECT id FROM app.uploads WHERE reservation_id = ${live}`;
      const id = first?.id ?? "";
      for (const state of ["pending", "preparing", "ready"]) {
        if (state === "preparing") await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${id}`;
        if (state === "ready") {
          await tx`UPDATE app.uploads SET state = 'ready', content_hash = ${randomBytes(32)},
                                          content_version = ${`v_${randomUUID().replaceAll("-", "")}`}
                    WHERE id = ${id}`;
        }
        await expectRefused(
          plain(tx),
          REFUSED.unique,
          (sp) => insert(sp as unknown as WorldTx, d, live, evening),
          /uploads_one_per_reservation/,
        );
      }
      const other = await slot(tx, d, d.w.ben);
      await tx.savepoint((sp) => insert(sp, d, other, evening));
      await tx`UPDATE app.uploads SET state = 'preparing' WHERE reservation_id = ${other}`;
      await tx`UPDATE app.uploads SET state = 'rejected', rejection = 'too_large' WHERE reservation_id = ${other}`;
      await tx.savepoint((sp) => insert(sp, d, other, evening));
      expect(await uploadsOf(tx, other)).toHaveLength(2);
      await expectRefused(
        plain(tx),
        REFUSED.unique,
        (sp) => insert(sp as unknown as WorldTx, d, other, evening),
        /uploads_one_per_reservation/,
      );
    });
  });

  it(
    "makes an upload written past the domain wait for a release in flight, then refuses it under the released slot",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      const { first, second } = await racing(
        (tx) => releaseReservation(tx, clock, { userId: d.w.ben.user, reservationId: bens }),
        () =>
          db
            .begin((tx) => insert(tx as unknown as WorldTx, d, bens, EVENING.add({ minutes: 1 })))
            .then(
              () => "inserted",
              (error: unknown) => error,
            ),
      );
      expect(first.state).toBe("released");
      expect(second).toMatchObject({ code: REFUSED.integrity, message: expect.stringMatching(message) as string });
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens}`).toHaveLength(0);
    },
  );

  it(
    "makes a release wait for an upload written past the domain while the slot was live, then give the slot back",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const bens = await db.begin((tx) => slot(tx as unknown as WorldTx, d, d.w.ben));
      const { second } = await racing(
        (tx) => insert(tx, d, bens, EVENING.add({ minutes: 1 })),
        () =>
          db.begin((tx) =>
            releaseReservation(tx as unknown as WorldTx, clock, { userId: d.w.ben.user, reservationId: bens }),
          ),
      );
      expect(second.state).toBe("released");
      expect(await db`SELECT FROM app.uploads WHERE reservation_id = ${bens}`).toHaveLength(1);
    },
  );
});
