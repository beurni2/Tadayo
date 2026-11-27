/// <reference lib="esnext.temporal" />
// The worker's `upload.prepare` against Postgres as `tadayo_app` (services/worker/src/prepare.ts; packages/domain/src/
// media/prepare.ts; docs/plans/api-b2-spike-prepare.md sections 2 to 4 and 9; spec 33; T12, T21, T52, T54): a drop's
// photo handed to preparation comes out with its two renditions stored and recorded, its owner's hash, a random
// version and its event done, in one transaction; what the checks refuse comes out rejected with its code and
// nothing stored; an event with nothing to prepare changes nothing and calls Storage for nothing; an event that
// can't ever be prepared dies at once; Storage away is waited out for as long as the upload lives, counting no
// attempt, and the retry writes over the same keys; an original Storage says it doesn't have is rejected only on the
// third attempt, and one there again on a retry is prepared; a put Storage refuses itself is counted as any failure;
// an upload that lapses still `preparing`, before the work or during it, is recorded as nothing and its event is a
// dead letter, `upload.lapsed` (the outside audit's B1; docs/plans/api-b2-worker-storage-retry.md); the record's clock
// is read after its lock (T1); and a second run of the same event records nothing, whether it comes after the first
// or at the same time.
//
// The world is world.ts's: Ana's Saturday 7 November 2026 in a London club, revealed at 07:00Z; Ben and Cleo are its
// other members. Storage is the worker's in-memory fake (@tadayo/worker/testing), and every image is made by
// `sharp` in the test. Each test but the last two runs in one transaction rolled back at its end, the worker's own
// transactions being savepoints in it (`inside`): other files leave events of the same topic committed, which a
// pass here would claim, so a pass first sets every pending event aside, in the same rolled-back transaction.
//
// These tests were written beside the handler, from the plan's section 9, so none was seen to fail before its rule
// existed. The four of B1 (the retry's waits, the lapse, the third attempt and the original there again) were written
// or rewritten before theirs and failed on `main`'s handler; the lapsed upload's dead letter and the refused put were
// written after the review (the B1 plan's section 5). The deliberate breakages, run at the PR's last head, show they
// can fail.

import { randomUUID } from "node:crypto";
import { reservationBody, uploadBody } from "@tadayo/api";
import {
  createDropPhotoUpload,
  createReservation,
  isPlainLoopback,
  markPreparing,
  UPLOAD_MAX_BYTES,
  type UploadContentType,
} from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import {
  contentHash,
  outboxPass,
  PREPARE_TOPIC,
  prepareHandler,
  prepareUpload,
  signatureOf,
  StorageRefused,
  StorageUnavailable,
  UPLOAD_LAPSED,
  type OutboxEvent,
  type PrepareDeps,
  type SafetyProvider,
  type WorkerSql,
  type WorkerStorage,
} from "@tadayo/worker";
import { fakeWorkerStorage, testImage, type FakeWorkerStorage } from "@tadayo/worker/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { forgetCommittedDays, waitingOn } from "./week-world.ts";
import { newAvatar, newWorld, type World } from "./world.ts";

const db = worldSql(6);
const committed: { days: string[]; uploads: string[] } = { days: [], uploads: [] };
afterAll(async () => {
  await db.end();
  // The race at the end needs its world committed: its upload's event, its upload (and with it its renditions),
  // its reservation and its counter go first, then every committed day.
  if (committed.days.length > 0) {
    if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
      throw new Error("worker-prepare: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
    }
    const admin = adminSql();
    try {
      await admin.begin(async (tx) => {
        await tx`DELETE FROM app.outbox_events WHERE dedupe_key IN ${tx(committed.uploads.map((id) => `upload.prepare:${id}`))}`;
        await tx`DELETE FROM app.uploads WHERE id IN ${tx(committed.uploads)}`;
        await tx`DELETE FROM app.reservations WHERE occurrence_id IN ${tx(committed.days)}`;
        await tx`DELETE FROM app.contribution_counters WHERE occurrence_id IN ${tx(committed.days)}`;
      });
    } finally {
      await admin.end();
    }
    await forgetCommittedDays();
  }
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);
const MiB = 1024 * 1024;

/** The evening before Ana's Saturday, to the microsecond, as a clock's sample is. */
const EVENING = at("2026-11-06T21:00:00.123456Z");
/** When the upload is handed to preparation, and when the pass runs unless a test moves the clock. */
const HANDED = EVENING.add({ minutes: 1 });
const clock = fakeClock(EVENING);
beforeEach(() => {
  clock.set(EVENING);
});

/** The worker's connection as one rolled-back transaction: each of its transactions is a savepoint in `tx`. */
function inside(tx: WorldTx): WorkerSql {
  return { begin: (fn: (sp: WorldTx) => Promise<unknown>) => tx.savepoint(fn) } as unknown as WorkerSql;
}

/** Sets every pending event aside in `tx`, so a pass claims only the events the test writes after it. */
async function aside(tx: WorldTx): Promise<void> {
  await tx`UPDATE app.outbox_events SET state = 'dead', processed_at = ${EVENING}, last_error = 'test.aside'
            WHERE state = 'pending'`;
}

interface Handed {
  readonly id: string;
  readonly objectKey: string;
  readonly owner: string;
}

/**
 * A drop's photo upload of `who`'s, declared as `contentType`, handed to preparation at HANDED by `markPreparing`,
 * as `completeUpload` does once the app's PUT is in: a slot, the upload, then the completion.
 */
async function handed(
  tx: WorldTx,
  w: World,
  who: { user: string },
  contentType: UploadContentType = "image/jpeg",
): Promise<Handed> {
  clock.set(EVENING);
  const reservation = (await tx.savepoint((sp) =>
    createReservation(
      sp,
      clock,
      { userId: who.user, key: randomUUID(), occurrenceId: w.day, mediaClass: "photo" },
      reservationBody,
    ),
  )) as { id?: unknown };
  if (typeof reservation.id !== "string") throw new Error("handed: no reservation came back");
  const reservationId = reservation.id;
  const { body } = await tx.savepoint((sp) =>
    createDropPhotoUpload(
      sp,
      clock,
      { userId: who.user, key: randomUUID(), reservationId, contentType, byteSize: 2_500_000 },
      uploadBody,
    ),
  );
  const id = (body as { id?: unknown }).id;
  if (typeof id !== "string") throw new Error("handed: no upload came back");
  clock.set(HANDED);
  await tx.savepoint((sp) => markPreparing(sp, clock, { userId: who.user, uploadId: id }));
  const [row] = await tx<{ object_key: string }[]>`SELECT object_key FROM app.uploads WHERE id = ${id}`;
  if (row === undefined) throw new Error("handed: the upload isn't there");
  return { id, objectKey: row.object_key, owner: who.user };
}

/** The upload `id`'s event, as a claim would hand it to its first attempt. */
async function eventOf(tx: WorldTx, id: string): Promise<OutboxEvent> {
  const [row] = await tx<{ id: string; topic: string; payload: unknown; created_at: Temporal.Instant }[]>`
    SELECT id, topic, payload, created_at FROM app.outbox_events WHERE dedupe_key = ${`upload.prepare:${id}`}`;
  if (row === undefined) throw new Error("eventOf: the upload has no event");
  return { id: row.id, topic: row.topic, payload: row.payload, attempts: 1, createdAt: row.created_at };
}

/** An event of the worker's topic written by the test, naming `payload`, due at EVENING. */
async function writeEvent(tx: WorldTx, payload: Record<string, unknown>): Promise<string> {
  const id = `evt_${randomUUID().replaceAll("-", "")}`;
  await tx`
    INSERT INTO app.outbox_events (id, topic, dedupe_key, payload, available_at, created_at)
    VALUES (${id}, ${PREPARE_TOPIC}, ${`test.prepare:${id}`}, ${JSON.stringify(payload)}::pg_catalog.text::pg_catalog.jsonb, ${EVENING}, ${EVENING})`;
  return id;
}

async function eventRow(tx: WorldTx, id: string) {
  const [row] = await tx<
    {
      state: string;
      attempts: number;
      last_error: string | null;
      available_at: Temporal.Instant;
      processed_at: Temporal.Instant | null;
    }[]
  >`SELECT state, attempts, last_error, available_at, processed_at FROM app.outbox_events WHERE id = ${id}`;
  if (row === undefined) throw new Error("eventRow: no such event");
  return {
    ...row,
    available_at: row.available_at.toString(),
    processed_at: row.processed_at === null ? null : row.processed_at.toString(),
  };
}

async function uploadRow(tx: WorldTx, id: string) {
  const [row] = await tx<
    { state: string; rejection: string | null; content_hash: Uint8Array | null; content_version: string | null }[]
  >`SELECT state, rejection, content_hash, content_version FROM app.uploads WHERE id = ${id}`;
  if (row === undefined) throw new Error("uploadRow: no such upload");
  return row;
}

async function renditionRows(tx: WorldTx, id: string) {
  const rows = await tx<
    {
      kind: string;
      object_key: string;
      width: number;
      height: number;
      byte_size: number;
      created_at: Temporal.Instant;
    }[]
  >`SELECT kind, object_key, width, height, byte_size, created_at FROM app.upload_renditions
     WHERE upload_id = ${id} ORDER BY kind`;
  return rows.map((row) => ({ ...row, created_at: row.created_at.toString() }));
}

interface Rig {
  readonly storage: FakeWorkerStorage;
  readonly lines: string[];
  readonly deps: (tx: WorldTx, overrides?: Partial<PrepareDeps>) => PrepareDeps;
}

function rig(): Rig {
  const storage = fakeWorkerStorage();
  const lines: string[] = [];
  return {
    storage,
    lines,
    deps: (tx, overrides = {}) => ({
      sql: inside(tx),
      clock,
      storage,
      safety: { name: "none", screen: () => Promise.resolve("clear") },
      say: (line) => lines.push(line),
      peakBytes: () => 123 * MiB,
      ...overrides,
    }),
  };
}

/** One pass of the outbox with the worker's one handler, as main.ts runs it, with the lines it wrote. */
async function pass(tx: WorldTx, deps: PrepareDeps) {
  const err: string[] = [];
  const { handled } = await outboxPass(
    inside(tx),
    clock,
    { [PREPARE_TOPIC]: prepareHandler(deps) },
    {
      warn: (line) => err.push(line),
    },
  );
  return { handled, err };
}

/** A preparation's line; the photo's process's peak is more than nothing whenever the photo was read. */
const LINE = (id: string, outcome: string, photo = "[1-9]\\d*") =>
  new RegExp(
    `^worker: prepared an upload ${id} in \\d+ ms \\(read \\d+, image \\d+, store \\d+, record \\d+\\), ${outcome}, peak memory: worker 123 MiB, photo ${photo} MiB$`,
  );

describe("upload.prepare makes a drop's photo's renditions and records them (spec 33, T12, T21)", () => {
  it("stores full and display at the upload's key, then records them with the owner's hash, a random version and the event done", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      const photo = await testImage(4032, 3024);
      r.storage.originals.set(one.objectKey, photo);
      const event = await eventOf(tx, one.id);

      expect(await pass(tx, r.deps(tx))).toEqual({ handled: 1, err: [] });

      expect(r.storage.reads).toEqual([one.objectKey]);
      expect(r.storage.puts).toEqual([`${one.objectKey}/full`, `${one.objectKey}/display`]);
      const full = r.storage.renditions.get(`${one.objectKey}/full`);
      const display = r.storage.renditions.get(`${one.objectKey}/display`);
      expect(full && signatureOf(full)).toBe("image/jpeg");
      expect(display && signatureOf(display)).toBe("image/jpeg");
      expect(await renditionRows(tx, one.id)).toEqual([
        {
          kind: "display",
          object_key: `${one.objectKey}/display`,
          width: 1290,
          height: 968,
          byte_size: display?.length,
          created_at: HANDED.toString(),
        },
        {
          kind: "full",
          object_key: `${one.objectKey}/full`,
          width: 2560,
          height: 1920,
          byte_size: full?.length,
          created_at: HANDED.toString(),
        },
      ]);
      const row = await uploadRow(tx, one.id);
      expect(row.state).toBe("ready");
      expect(row.rejection).toBeNull();
      // The owner's hash of the original (T21), and a version that isn't derived from the bytes.
      expect(Buffer.from(row.content_hash ?? [])).toEqual(Buffer.from(contentHash(w.ben.user, photo)));
      expect(Buffer.from(row.content_hash ?? [])).not.toEqual(Buffer.from(contentHash(w.cleo.user, photo)));
      expect(row.content_version).toMatch(/^mv_[A-Za-z0-9_-]{22}$/);
      expect(await eventRow(tx, event.id)).toEqual({
        state: "done",
        attempts: 1,
        last_error: null,
        available_at: HANDED.add({ seconds: 300 }).toString(),
        processed_at: HANDED.toString(),
      });
      // Its line holds the upload's opaque id and the times, never its owner or its key (T52).
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatch(LINE(one.id, "ready"));
      expect(r.lines[0]).not.toContain(w.ben.user);
      expect(r.lines[0]).not.toContain(one.objectKey);
    });
  });

  it("gives one owner's same photo the same hash and each upload its own random version, never one from the bytes (T21)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const photo = await testImage(1200, 900);
      const one = await handed(tx, w, w.ben);
      const two = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, photo);
      r.storage.originals.set(two.objectKey, photo);

      expect(await pass(tx, r.deps(tx))).toEqual({ handled: 2, err: [] });

      const first = await uploadRow(tx, one.id);
      const second = await uploadRow(tx, two.id);
      expect([first.state, second.state]).toEqual(["ready", "ready"]);
      expect(Buffer.from(first.content_hash ?? [])).toEqual(Buffer.from(second.content_hash ?? []));
      expect(first.content_version).toMatch(/^mv_[A-Za-z0-9_-]{22}$/);
      expect(second.content_version).toMatch(/^mv_[A-Za-z0-9_-]{22}$/);
      expect(first.content_version).not.toBe(second.content_version);
    });
  });

  it("makes the version at random: the same upload's same photo, prepared again from the same start, gets another (T21)", async () => {
    // A version made from anything the preparation is given (the upload, its owner, its bytes, the clock) would come
    // out the same twice here (PR #111's third review: R3-7).
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(1200, 900));
      const event = await eventOf(tx, one.id);
      const undone = new Error("undone");
      const versionOnce = async () => {
        let version: string | null = null;
        await tx
          .savepoint(async (sp) => {
            expect(await prepareUpload(r.deps(sp), event)).toMatchObject({ outcome: "ready" });
            version = (await uploadRow(sp, one.id)).content_version;
            throw undone;
          })
          .catch((error: unknown) => {
            if (error !== undone) throw error;
          });
        return version;
      };

      const first = await versionOnce();
      const second = await versionOnce();
      expect((await uploadRow(tx, one.id)).state).toBe("preparing");
      expect(first).toMatch(/^mv_[A-Za-z0-9_-]{22}$/);
      expect(second).toMatch(/^mv_[A-Za-z0-9_-]{22}$/);
      expect(first).not.toBe(second);
    });
  });

  it("does it once: a repeat of the event, and a later pass, find nothing to prepare and call Storage for nothing (T54)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(1200, 900));
      const event = await eventOf(tx, one.id);
      expect(await prepareUpload(r.deps(tx), event)).toMatchObject({ upload: one.id, outcome: "ready" });
      const version = (await uploadRow(tx, one.id)).content_version;
      const reads = r.storage.reads.length;

      clock.advance({ minutes: 10 });
      expect(await prepareUpload(r.deps(tx), { ...event, attempts: 2 })).toMatchObject({
        upload: one.id,
        outcome: "skipped",
      });
      expect(await pass(tx, r.deps(tx))).toEqual({ handled: 0, err: [] });
      expect(r.storage.reads).toHaveLength(reads);
      expect(r.storage.puts).toHaveLength(2);
      expect(await renditionRows(tx, one.id)).toHaveLength(2);
      expect((await uploadRow(tx, one.id)).content_version).toBe(version);
      expect((await eventRow(tx, event.id)).processed_at).toBe(HANDED.toString());
    });
  });

  it("holds a photo the safety provider holds: its renditions are made and recorded, its state held (FQ8)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.cleo, "image/png");
      const photo = await testImage(800, 600, "png");
      r.storage.originals.set(one.objectKey, photo);
      const screened: Uint8Array[] = [];
      const holding: SafetyProvider = {
        name: "test",
        screen: (bytes) => {
          screened.push(bytes);
          return Promise.resolve("hold");
        },
      };
      expect(await pass(tx, r.deps(tx, { safety: holding }))).toEqual({ handled: 1, err: [] });
      expect(screened).toEqual([photo]);
      const row = await uploadRow(tx, one.id);
      expect(row.state).toBe("held");
      expect(Buffer.from(row.content_hash ?? [])).toEqual(Buffer.from(contentHash(w.cleo.user, photo)));
      expect(row.content_version).toMatch(/^mv_/);
      expect(await renditionRows(tx, one.id)).toMatchObject([
        { kind: "display", width: 800, height: 600 },
        { kind: "full", width: 800, height: 600 },
      ]);
      expect(r.lines[0]).toMatch(LINE(one.id, "held"));
    });
  });
});

describe("upload.prepare rejects what the checks refuse (D09, spec 33)", () => {
  const truncated = async () => (await testImage(64, 64)).subarray(0, 200);
  const cases: readonly {
    what: string;
    declared: UploadContentType;
    bytes: () => Promise<Buffer> | null;
    rejection: string;
    /** The photo's process's peak in the line: 0 when none was started. */
    photo?: string;
  }[] = [
    {
      what: "a PNG declared as a JPEG",
      declared: "image/jpeg",
      bytes: () => testImage(64, 64, "png"),
      rejection: "unsupported_type",
    },
    {
      what: "more than 20 MiB, starting no process for it",
      declared: "image/jpeg",
      bytes: () =>
        Promise.resolve(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(UPLOAD_MAX_BYTES - 2)])),
      rejection: "too_large",
      photo: "0",
    },
    {
      what: "more than 64 million pixels",
      declared: "image/png",
      bytes: () => testImage(8001, 8000, "png"),
      rejection: "too_many_pixels",
    },
    { what: "a JPEG cut short", declared: "image/jpeg", bytes: truncated, rejection: "unreadable" },
    // An original Storage says it doesn't have is rejected only on the third attempt: its own test, below.
  ];

  for (const c of cases) {
    it(`rejects ${c.what} as ${c.rejection}, storing nothing and writing no hash, and finishes the event`, async () => {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        await aside(tx);
        const r = rig();
        const one = await handed(tx, w, w.ana, c.declared);
        const bytes = await c.bytes();
        if (bytes !== null) r.storage.originals.set(one.objectKey, bytes);
        const event = await eventOf(tx, one.id);
        expect(await pass(tx, r.deps(tx))).toEqual({ handled: 1, err: [] });
        expect(await uploadRow(tx, one.id)).toEqual({
          state: "rejected",
          rejection: c.rejection,
          content_hash: null,
          content_version: null,
        });
        expect(await renditionRows(tx, one.id)).toEqual([]);
        expect(r.storage.puts).toEqual([]);
        expect(await eventRow(tx, event.id)).toMatchObject({ state: "done", attempts: 1, last_error: null });
        expect(r.lines).toHaveLength(1);
        expect(r.lines[0]).toMatch(LINE(one.id, `rejected ${c.rejection}`, c.photo));
      });
    });
  }
});

describe("upload.prepare with nothing to prepare, or nothing it can (T54)", () => {
  it("finishes an event whose upload isn't preparing or doesn't exist, and kills one whose upload lapsed still preparing as upload.lapsed, calling Storage for nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const lapsed = await handed(tx, w, w.ben);
      const ready = await handed(tx, w, w.cleo);
      r.storage.originals.set(ready.objectKey, await testImage(100, 100));
      expect(await prepareUpload(r.deps(tx), await eventOf(tx, ready.id))).toMatchObject({ outcome: "ready" });
      // A pending upload's: an event no command writes, but nothing is prepared before the bytes are in.
      clock.set(EVENING);
      const reservation = (await tx.savepoint((sp) =>
        createReservation(
          sp,
          clock,
          { userId: w.ana.user, key: randomUUID(), occurrenceId: w.day, mediaClass: "photo" },
          reservationBody,
        ),
      )) as { id: string };
      const { body } = await tx.savepoint((sp) =>
        createDropPhotoUpload(
          sp,
          clock,
          {
            userId: w.ana.user,
            key: randomUUID(),
            reservationId: reservation.id,
            contentType: "image/jpeg",
            byteSize: 1000,
          },
          uploadBody,
        ),
      );
      const pending = (body as { id: string }).id;
      const events = [
        await writeEvent(tx, { upload_id: pending }),
        await writeEvent(tx, { upload_id: ready.id }),
        await writeEvent(tx, { upload_id: "upl_nobodyhasthisone" }),
      ];
      const reads = r.storage.reads.length;
      const lines = r.lines.length;
      // The handed upload lapses at its expires_at, 24 hours after it was made: nobody's from then on, and never
      // prepared, so its event is a dead letter with its line, not a quiet done. Its event came due last.
      clock.set(EVENING.add({ hours: 24 }));
      const lapsedEvent = (await eventOf(tx, lapsed.id)).id;
      expect(await pass(tx, r.deps(tx))).toEqual({
        handled: 3,
        err: [`worker: an event is dead: upload.prepare ${lapsedEvent} after 1 attempts: ${UPLOAD_LAPSED}`],
      });
      expect(UPLOAD_LAPSED).toBe("upload.lapsed");
      expect(r.storage.reads).toHaveLength(reads);
      expect(r.lines).toHaveLength(lines);
      for (const id of events) {
        expect(await eventRow(tx, id)).toMatchObject({
          state: "done",
          processed_at: EVENING.add({ hours: 24 }).toString(),
        });
      }
      expect(await eventRow(tx, lapsedEvent)).toMatchObject({
        state: "dead",
        attempts: 1,
        last_error: "upload.lapsed",
        processed_at: EVENING.add({ hours: 24 }).toString(),
      });
      expect((await uploadRow(tx, lapsed.id)).state).toBe("preparing");
      expect((await uploadRow(tx, pending)).state).toBe("pending");
      expect(await renditionRows(tx, lapsed.id)).toEqual([]);
    });
  });

  it("records nothing for an upload that lapses during the work, and kills the event as upload.lapsed: its renditions stay stored at its key", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(640, 480));
      const event = await eventOf(tx, one.id);
      // Read a microsecond before its expires_at, 24 hours after it was made; recorded at it.
      const lapses = EVENING.add({ hours: 24 });
      clock.set(lapses.subtract({ microseconds: 1 }));
      const storage: WorkerStorage = {
        readOriginal: (key) => r.storage.readOriginal(key),
        putRendition: (key, bytes) => {
          clock.set(lapses);
          return r.storage.putRendition(key, bytes);
        },
      };
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({
        handled: 0,
        err: [`worker: an event is dead: upload.prepare ${event.id} after 1 attempts: upload.lapsed`],
      });
      expect(r.storage.puts).toEqual([`${one.objectKey}/full`, `${one.objectKey}/display`]);
      expect(await renditionRows(tx, one.id)).toEqual([]);
      expect(await uploadRow(tx, one.id)).toMatchObject({
        state: "preparing",
        content_hash: null,
        content_version: null,
      });
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "dead",
        attempts: 1,
        last_error: "upload.lapsed",
        processed_at: lapses.toString(),
      });
      expect(r.lines).toEqual([]);
    });
  });

  it("kills at once an event whose payload names no upload, and one whose upload's renditions aren't built, with the alert line", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const avatar = await newAvatar(plain(tx), w.ben.user, "preparing");
      const none = await writeEvent(tx, {});
      const bad = await writeEvent(tx, { upload_id: "not an id" });
      const avatars = await writeEvent(tx, { upload_id: avatar.id });
      clock.set(HANDED);
      const result = await pass(tx, r.deps(tx));
      expect(result.handled).toBe(0);
      expect([...result.err].sort()).toEqual(
        [
          `worker: an event is dead: upload.prepare ${none} after 1 attempts: payload`,
          `worker: an event is dead: upload.prepare ${bad} after 1 attempts: payload`,
          `worker: an event is dead: upload.prepare ${avatars} after 1 attempts: purpose.avatar`,
        ].sort(),
      );
      for (const [id, code] of [
        [none, "payload"],
        [bad, "payload"],
        [avatars, "purpose.avatar"],
      ] as const) {
        expect(await eventRow(tx, id)).toMatchObject({
          state: "dead",
          attempts: 1,
          last_error: code,
          processed_at: HANDED.toString(),
        });
      }
      expect(r.storage.reads).toEqual([]);
      expect((await uploadRow(tx, avatar.id)).state).toBe("preparing");
    });
  });
});

describe("upload.prepare as the photo user it is given (ADR-038)", () => {
  it("prepares the photo as that user: a worker not started as root can take none, so the photo fails, to be tried again", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(300, 200));
      const event = await eventOf(tx, one.id);
      // These tests run in the worker's own user (or as plain root), never in the worker's mode, so asRoot refuses
      // to start the photo's process as the user given (services/worker/src/privileges.ts): nothing is prepared.
      expect(await pass(tx, r.deps(tx, { photoUser: { uid: 64999, gid: 64999 } }))).toEqual({
        handled: 0,
        err: [`worker: an event failed: upload.prepare ${event.id}, attempt 1: image.process_failed`],
      });
      expect(r.storage.puts).toEqual([]);
      expect(await renditionRows(tx, one.id)).toEqual([]);
      expect((await uploadRow(tx, one.id)).state).toBe("preparing");
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "pending",
        attempts: 1,
        last_error: "image.process_failed",
      });
    });
  });
});

describe("upload.prepare when Storage is away, or another run gets there first (T54)", () => {
  it("tries again after its wait, counting no attempt, and the retry writes over the same keys, leaving one row of each rendition", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(3000, 2000));
      // The second put of each attempt fails while `flaky` is on: the first rendition is stored, the second isn't.
      let flaky = true;
      let putsThisAttempt = 0;
      const storage: WorkerStorage = {
        readOriginal: (key) => {
          putsThisAttempt = 0;
          return r.storage.readOriginal(key);
        },
        putRendition: (key, bytes) => {
          putsThisAttempt += 1;
          if (flaky && putsThisAttempt === 2) return Promise.reject(new StorageUnavailable("answered 503"));
          return r.storage.putRendition(key, bytes);
        },
      };
      const event = await eventOf(tx, one.id);

      r.storage.failing(true);
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({
        handled: 0,
        err: [`worker: an event is waiting: upload.prepare ${event.id}: storage.unavailable, again in 30 s`],
      });
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "pending",
        attempts: 0,
        last_error: "storage.unavailable",
        available_at: HANDED.add({ seconds: 30 }).toString(),
      });
      r.storage.failing(false);

      // Not before its wait has passed.
      clock.set(HANDED.add({ seconds: 29 }));
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({ handled: 0, err: [] });
      clock.set(HANDED.add({ seconds: 30 }));
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({
        handled: 0,
        err: [`worker: an event is waiting: upload.prepare ${event.id}: storage.unavailable, again in 30 s`],
      });
      expect(r.storage.puts).toEqual([`${one.objectKey}/full`]);
      expect(await renditionRows(tx, one.id)).toEqual([]);
      expect((await uploadRow(tx, one.id)).state).toBe("preparing");
      expect((await eventRow(tx, event.id)).available_at).toBe(HANDED.add({ seconds: 60 }).toString());

      flaky = false;
      clock.set(HANDED.add({ seconds: 60 }));
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({ handled: 1, err: [] });
      expect(r.storage.puts).toEqual([`${one.objectKey}/full`, `${one.objectKey}/full`, `${one.objectKey}/display`]);
      expect(await renditionRows(tx, one.id)).toMatchObject([
        { kind: "display", object_key: `${one.objectKey}/display`, width: 1290, height: 860 },
        { kind: "full", object_key: `${one.objectKey}/full`, width: 2560, height: 1707 },
      ]);
      expect((await uploadRow(tx, one.id)).state).toBe("ready");
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "done",
        attempts: 1,
        last_error: "storage.unavailable",
        processed_at: HANDED.add({ seconds: 60 }).toString(),
      });
    });
  });

  it("waits out Storage for as long as the upload lives, counting no attempt, then kills the event once it lapses, as upload.lapsed, rejecting nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(640, 480));
      const event = await eventOf(tx, one.id);
      // The upload was made at EVENING and lives 24 hours: Storage is away for all of them.
      const lapses = EVENING.add({ hours: 24 });
      r.storage.failing(true);
      const err: string[] = [];
      let passes = 0;
      for (;;) {
        const ran = await pass(tx, r.deps(tx));
        passes += 1;
        err.push(...ran.err);
        const row = await eventRow(tx, event.id);
        if (row.state !== "pending") break;
        expect(row.attempts).toBe(0);
        expect(passes).toBeLessThan(200);
        clock.set(Temporal.Instant.from(row.available_at));
      }
      // Every try found Storage away, each a waiting line; the last, past the lapse, found the upload lapsed still
      // preparing, never prepared, and killed its event with its line.
      expect(err).toHaveLength(passes);
      const waiting = err.slice(0, -1);
      for (const line of waiting) {
        expect(line).toMatch(
          new RegExp(
            `^worker: an event is waiting: upload\\.prepare ${event.id}: storage\\.unavailable, again in \\d+ s$`,
          ),
        );
      }
      expect(err.at(-1)).toBe(`worker: an event is dead: upload.prepare ${event.id} after 1 attempts: upload.lapsed`);
      expect(r.storage.reads).toHaveLength(passes - 1);
      expect(waiting.at(-1)).toMatch(/again in 900 s$/);
      // About every 15 minutes for the day, after the first seven tries.
      expect(passes).toBeGreaterThan(90);
      expect(passes).toBeLessThan(110);
      expect(
        Temporal.Instant.compare(Temporal.Instant.from((await eventRow(tx, event.id)).processed_at ?? ""), lapses),
      ).toBe(1);
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "dead",
        attempts: 1,
        last_error: "upload.lapsed",
      });
      expect(await uploadRow(tx, one.id)).toEqual({
        state: "preparing",
        rejection: null,
        content_hash: null,
        content_version: null,
      });
      expect(r.lines).toEqual([]);
      expect(r.storage.puts).toEqual([]);
    });
  });

  it("counts a put Storage refuses itself as any failure, and kills the event after five attempts, leaving the upload preparing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(640, 480));
      const event = await eventOf(tx, one.id);
      // Storage answers, and refuses the rendition itself (too large for the bucket): no wait would change that.
      const storage: WorkerStorage = {
        readOriginal: (key) => r.storage.readOriginal(key),
        putRendition: () => Promise.reject(new StorageRefused("answered 400 EntityTooLarge")),
      };
      let now = HANDED;
      for (const [attempt, wait] of [
        [1, 30],
        [2, 60],
        [3, 120],
        [4, 240],
      ] as const) {
        clock.set(now);
        expect(await pass(tx, r.deps(tx, { storage }))).toEqual({
          handled: 0,
          err: [`worker: an event failed: upload.prepare ${event.id}, attempt ${String(attempt)}: storage.refused`],
        });
        expect(await eventRow(tx, event.id)).toMatchObject({
          state: "pending",
          attempts: attempt,
          last_error: "storage.refused",
          available_at: now.add({ seconds: wait }).toString(),
        });
        now = now.add({ seconds: wait });
      }
      clock.set(now);
      expect(await pass(tx, r.deps(tx, { storage }))).toEqual({
        handled: 0,
        err: [`worker: an event is dead: upload.prepare ${event.id} after 5 attempts: storage.refused`],
      });
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "dead",
        attempts: 5,
        last_error: "storage.refused",
        processed_at: now.toString(),
      });
      expect(await uploadRow(tx, one.id)).toEqual({
        state: "preparing",
        rejection: null,
        content_hash: null,
        content_version: null,
      });
      expect(await renditionRows(tx, one.id)).toEqual([]);
      expect(r.storage.reads).toHaveLength(5);
      expect(r.lines).toEqual([]);
    });
  });

  it("rejects an original Storage says it doesn't have only on its third attempt, after 30 and 60 seconds, as unreadable", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ana);
      const event = await eventOf(tx, one.id);
      for (const [attempt, wait] of [
        [1, 30],
        [2, 60],
      ] as const) {
        expect(await pass(tx, r.deps(tx))).toEqual({
          handled: 0,
          err: [`worker: an event failed: upload.prepare ${event.id}, attempt ${String(attempt)}: storage.missing`],
        });
        const row = await eventRow(tx, event.id);
        expect(row).toMatchObject({ state: "pending", attempts: attempt, last_error: "storage.missing" });
        expect((await uploadRow(tx, one.id)).state).toBe("preparing");
        clock.set(Temporal.Instant.from(row.available_at));
        expect(
          Temporal.Instant.from(row.available_at)
            .since(attempt === 1 ? HANDED : HANDED.add({ seconds: 30 }))
            .total("seconds"),
        ).toBe(wait);
      }
      expect(await pass(tx, r.deps(tx))).toEqual({ handled: 1, err: [] });
      expect(await uploadRow(tx, one.id)).toEqual({
        state: "rejected",
        rejection: "unreadable",
        content_hash: null,
        content_version: null,
      });
      expect(await eventRow(tx, event.id)).toMatchObject({
        state: "done",
        attempts: 3,
        last_error: "storage.missing",
        processed_at: HANDED.add({ seconds: 90 }).toString(),
      });
      expect(r.storage.reads).toEqual([one.objectKey, one.objectKey, one.objectKey]);
      expect(r.storage.puts).toEqual([]);
      expect(await renditionRows(tx, one.id)).toEqual([]);
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatch(LINE(one.id, "rejected unreadable", "0"));
    });
  });

  it("prepares an original that is there again on a retry", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.cleo);
      const event = await eventOf(tx, one.id);
      expect(await pass(tx, r.deps(tx))).toEqual({
        handled: 0,
        err: [`worker: an event failed: upload.prepare ${event.id}, attempt 1: storage.missing`],
      });
      r.storage.originals.set(one.objectKey, await testImage(640, 480));
      clock.set(HANDED.add({ seconds: 30 }));
      expect(await pass(tx, r.deps(tx))).toEqual({ handled: 1, err: [] });
      expect((await uploadRow(tx, one.id)).state).toBe("ready");
      expect(await renditionRows(tx, one.id)).toHaveLength(2);
      expect(await eventRow(tx, event.id)).toMatchObject({ state: "done", attempts: 2, last_error: "storage.missing" });
    });
  });

  it("records nothing when another run of the same event recorded first, and finishes the event", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await aside(tx);
      const r = rig();
      const one = await handed(tx, w, w.ben);
      r.storage.originals.set(one.objectKey, await testImage(640, 480));
      const event = await eventOf(tx, one.id);
      // The first run, at its first put, waits while a second run of the same event does all of its work.
      let second: Promise<unknown> | undefined;
      const storage: WorkerStorage = {
        readOriginal: (key) => r.storage.readOriginal(key),
        putRendition: async (key, bytes) => {
          if (second === undefined) {
            second = prepareUpload(r.deps(tx), event);
            expect(await second).toMatchObject({ outcome: "ready" });
          }
          return r.storage.putRendition(key, bytes);
        },
      };
      expect(await prepareUpload(r.deps(tx, { storage }), event)).toMatchObject({ upload: one.id, outcome: "skipped" });
      expect(await renditionRows(tx, one.id)).toHaveLength(2);
      const row = await uploadRow(tx, one.id);
      expect(row.state).toBe("ready");
      expect(row.content_version).toMatch(/^mv_/);
      expect(await eventRow(tx, event.id)).toMatchObject({ state: "done" });
    });
  });

  it(
    "reads the record's clock after the upload's lock, so what it writes is dated when it could write it (T1)",
    { timeout: 30_000 },
    async () => {
      const r = rig();
      const w = await db.begin((tx) => newWorld(plain(tx as unknown as WorldTx)));
      committed.days.push(w.day);
      const one = await db.begin((tx) => handed(tx as unknown as WorldTx, w, w.ben));
      committed.uploads.push(one.id);
      r.storage.originals.set(one.objectKey, await testImage(800, 600));
      const event = await db.begin((tx) => eventOf(tx as unknown as WorldTx, one.id));
      const worker = db as unknown as WorkerSql;

      // Another transaction holds the upload's row while the run reaches its record.
      let go = (): void => undefined;
      const gate = new Promise<void>((resolve) => (go = resolve));
      let held: (pid: number) => void = () => undefined;
      const holding = new Promise<number>((resolve) => (held = resolve));
      const holder = db.begin(async (tx) => {
        const [row] = await tx<{ pid: number }[]>`
          SELECT pg_catalog.pg_backend_pid() AS pid FROM app.uploads WHERE id = ${one.id} FOR UPDATE`;
        held(row?.pid ?? 0);
        await gate;
      });
      const pid = await holding;
      const later = HANDED.add({ seconds: 10 });
      try {
        clock.set(HANDED);
        const run = prepareUpload({ ...r.deps(db as unknown as WorldTx), sql: worker }, event);
        await waitingOn(db, pid);
        clock.set(later);
        go();
        await holder;
        expect(await run).toMatchObject({ outcome: "ready" });
      } finally {
        go();
      }
      const rows = await db.begin((tx) => renditionRows(tx as unknown as WorldTx, one.id));
      expect(rows.map((row) => [row.kind, row.created_at])).toEqual([
        ["display", later.toString()],
        ["full", later.toString()],
      ]);
      const [done] = await db<{ state: string; processed_at: Temporal.Instant | null }[]>`
        SELECT state, processed_at FROM app.outbox_events WHERE id = ${event.id}`;
      expect([done?.state, done?.processed_at?.toString()]).toEqual(["done", later.toString()]);
    },
  );

  it(
    "makes a second run recording at the same time wait for the first and then write nothing, while a row naming the upload goes by (FOR NO KEY UPDATE)",
    { timeout: 30_000 },
    async () => {
      const r = rig();
      const w = await db.begin((tx) => newWorld(plain(tx as unknown as WorldTx)));
      committed.days.push(w.day);
      const one = await db.begin((tx) => handed(tx as unknown as WorldTx, w, w.ben));
      committed.uploads.push(one.id);
      r.storage.originals.set(one.objectKey, await testImage(1000, 1000));
      const event = await db.begin((tx) => eventOf(tx as unknown as WorldTx, one.id));
      const worker = db as unknown as WorkerSql;

      // The first run's recording transaction holds the upload's row until the gate opens.
      let go = (): void => undefined;
      const gate = new Promise<void>((resolve) => (go = resolve));
      let held: (pid: number) => void = () => undefined;
      const holding = new Promise<number>((resolve) => (held = resolve));
      const gated: WorkerSql = {
        begin: (fn: (tx: WorldTx) => Promise<unknown>) =>
          worker.begin(async (tx) => {
            const value = await fn(tx);
            const [row] = await tx<{ state: string; pid: number }[]>`
              SELECT (SELECT state FROM app.uploads WHERE id = ${one.id}) AS state, pg_catalog.pg_backend_pid() AS pid`;
            if (row?.state !== "preparing") {
              held(row?.pid ?? 0);
              await gate;
            }
            return value;
          }),
      } as unknown as WorkerSql;
      const first = prepareUpload({ ...r.deps(db as unknown as WorldTx), sql: gated }, event);
      const pid = await holding;
      try {
        const second = prepareUpload({ ...r.deps(db as unknown as WorldTx), sql: worker }, event);
        await waitingOn(db, pid);
        // A row naming the upload, as a drop's will: its foreign key's check locks the upload FOR KEY SHARE, which
        // FOR NO KEY UPDATE lets by and FOR UPDATE would keep waiting, until the timeout.
        const sharing = await db
          .begin(async (tx) => {
            await tx`SET LOCAL lock_timeout = '5s'`;
            return tx`SELECT FROM app.uploads WHERE id = ${one.id} FOR KEY SHARE`;
          })
          .then(
            (rows) => rows.length,
            (error: unknown) => (error as { code?: string }).code ?? String(error),
          );
        expect(sharing).toBe(1);
        go();
        expect(await first).toMatchObject({ outcome: "ready" });
        expect(await second).toMatchObject({ outcome: "skipped" });
      } finally {
        go();
      }
      const rows = await db.begin((tx) => renditionRows(tx as unknown as WorldTx, one.id));
      expect(rows.map((row) => row.kind)).toEqual(["display", "full"]);
      const [event_] = await db<{ state: string }[]>`SELECT state FROM app.outbox_events WHERE id = ${event.id}`;
      expect(event_?.state).toBe("done");
    },
  );
});
