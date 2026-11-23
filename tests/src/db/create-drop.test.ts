/// <reference lib="esnext.temporal" />
// Adding a photo to a day, against Postgres as `tadayo_app` (spec 06, 07, 11, 14, 32; addendum 2; T1, T3, T4, T8,
// T9, T12, T14, T15, T17, T18, T19, T20, T21; FQ63, FQ112; ND01, ND02, Q10, Q12;
// docs/plans/api-b2-spike-commit.md, section 3; packages/domain/src/drops/commit.ts): only the holder of a ready
// upload of their own, under a slot of theirs in the day, adds it; the slot consumed, or a free one taken when it
// has ended; the refusals in their order and the facts they carry; the cutoff read after the locks; the receipt;
// the same photo twice; two commits racing for the last free slot; and the audience, written once and sealed, with
// a join that waits for it.
//
// The world is world.ts's: Ana's Saturday 7 November 2026 in a London club, which is on UTC then, revealed at
// 07:00Z; Ben and Cleo are its other members, and Dan has no club. Ana's next two Saturdays are added here, so a
// refusal has a next day to offer (T4). Each upload is made by the commands that make one (createReservation,
// createUpload, the completion's markPreparing and the worker's recordPreparation), so its rows are theirs.
//
// These tests were written after the command, from the plan's section 3, so none was seen to fail before its rule
// existed. The deliberate breakages, run at the PR's last head (the plan's section 5), are what shows they can fail.

import { randomBytes, randomUUID } from "node:crypto";
import { allowanceBody, dropRender, reservationBody, uploadBody } from "@tadayo/api";
import {
  createDrop,
  createDropPhotoUpload,
  createReservation,
  isPlainLoopback,
  markPreparing,
  readHome,
  recordPreparation,
  Refused,
  releaseReservation,
  type Allowance,
  type CreateDropInput,
  type DropMediaInput,
  type Json,
  type RefusalFacts,
  type ServerNow,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { forgetCommittedDays, waitingOn } from "./week-world.ts";
import {
  AT,
  checkAsAtCommit,
  commitDrop,
  joinByRoster,
  leave,
  newAvatar,
  newId,
  newUser,
  newWorld,
  type Member,
  type World,
} from "./world.ts";

const db = worldSql(12);
const committedDays: string[] = [];
afterAll(async () => {
  await db.end();
  // The races below need their world committed, and a committed drop can't be deleted (drops_no_delete), nor can
  // its audience or its caption's versions. Its rows and its upload's, reservation's and counter's name one another
  // in a ring (the drop its upload, the upload its reservation, the reservation its drop), so the superuser removes
  // them in one transaction with the triggers that would keep them, the foreign keys' among them, off for that
  // transaction alone (`session_replication_role`), naming each table's rows of these days only. Then every
  // committed day goes, as the other files' days do.
  if (committedDays.length > 0) {
    if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
      throw new Error("create-drop: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
    }
    const admin = adminSql();
    try {
      await admin.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        const days = tx(committedDays);
        await tx`DELETE FROM app.drop_audience a USING app.drops d WHERE a.drop_id = d.id AND d.occurrence_id IN ${days}`;
        await tx`DELETE FROM app.drop_caption_versions v USING app.drops d
                  WHERE v.drop_id = d.id AND d.occurrence_id IN ${days}`;
        await tx`DELETE FROM app.drops WHERE occurrence_id IN ${days}`;
        await tx`DELETE FROM app.upload_renditions n USING app.uploads u, app.reservations r
                  WHERE n.upload_id = u.id AND u.reservation_id = r.id AND r.occurrence_id IN ${days}`;
        await tx`DELETE FROM app.uploads u USING app.reservations r
                  WHERE u.reservation_id = r.id AND r.occurrence_id IN ${days}`;
        await tx`DELETE FROM app.reservations WHERE occurrence_id IN ${days}`;
        await tx`DELETE FROM app.contribution_counters WHERE occurrence_id IN ${days}`;
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
const CLOSE = at("2026-11-08T01:00:00Z");
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

/** A world committed for a race, its days kept for the cleanup above. */
async function committedWorld(): Promise<Days> {
  const d = await db.begin((tx) => days(tx as unknown as WorldTx));
  committedDays.push(d.w.day, d.next, d.after);
  return d;
}

/** A photo slot `who` holds in Ana's Saturday unless said, by `createReservation` as its route runs it. */
async function slot(tx: WorldTx, who: { user: string }, day: string): Promise<string> {
  const body = (await tx.savepoint((sp) =>
    createReservation(
      sp,
      clock,
      { userId: who.user, key: randomUUID(), occurrenceId: day, mediaClass: "photo" },
      reservationBody,
    ),
  )) as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("slot: no reservation came back");
  return body.id;
}

type UploadEnd = "pending" | "preparing" | "ready" | "held" | "rejected";

interface PrepareOptions {
  day?: string;
  /** Where preparation left the upload; ready unless said. */
  end?: UploadEnd;
  /** The content hash preparation gives it (spec 33's scoped hash); random unless said. */
  hash?: Uint8Array;
}

interface Prepared {
  readonly upload: string;
  readonly slot: string;
}

/**
 * A photo of `who`'s under a new slot of theirs in Ana's Saturday unless said, made by the commands that make one:
 * the slot, the upload, its completion, and the worker's record of its preparation, with its two renditions.
 */
async function prepared(tx: WorldTx, d: Days, who: { user: string }, options: PrepareOptions = {}): Promise<Prepared> {
  const end = options.end ?? "ready";
  const reservationId = await slot(tx, who, options.day ?? d.w.day);
  const made = await tx.savepoint((sp) =>
    createDropPhotoUpload(
      sp,
      clock,
      { userId: who.user, key: randomUUID(), reservationId, contentType: "image/jpeg", byteSize: 2_500_000 },
      uploadBody,
    ),
  );
  const upload = (made.body as { id?: unknown }).id;
  if (typeof upload !== "string") throw new Error("prepared: no upload came back");
  if (end !== "pending") await tx.savepoint((sp) => markPreparing(sp, clock, { userId: who.user, uploadId: upload }));
  if (end === "ready" || end === "held") {
    const { recorded } = await tx.savepoint((sp) =>
      recordPreparation(sp, clock, upload, {
        state: end,
        contentHash: options.hash ?? randomBytes(32),
        renditions: [
          { kind: "full", objectKey: newId("uploads/rendition"), width: 3024, height: 4032, byteSize: 900_000 },
          { kind: "display", objectKey: newId("uploads/rendition"), width: 1200, height: 1600, byteSize: 200_000 },
        ],
      }),
    );
    if (!recorded) throw new Error("prepared: the preparation wasn't recorded");
  }
  if (end === "rejected") {
    await tx.savepoint((sp) => recordPreparation(sp, clock, upload, { state: "rejected", rejection: "unreadable" }));
  }
  return { upload, slot: reservationId };
}

interface Added {
  readonly status: 201;
  readonly body: {
    drop_id: string;
    occurrence: { id: string; phase: string; local_date: string } & Record<string, Json>;
    media_class: string;
    state: string;
    version: number;
    allowance: Json;
    highlight: { drop_id?: string; version: number };
  };
  /** The answer as the receipt keeps it, byte for byte. */
  readonly text: string;
}
interface Refusal {
  readonly code: string;
  readonly facts: RefusalFacts;
}
type Outcome = Added | Refusal;

async function outcomeOf(running: Promise<Json>): Promise<Outcome> {
  try {
    const body = await running;
    return { status: 201, body: body as unknown as Added["body"], text: JSON.stringify(body) };
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

interface CommitOptions {
  /** The body's `media`: the photo upload `upload` unless said. */
  media?: DropMediaInput;
  reservation?: string;
  caption?: string;
  key?: string;
  day?: string;
  clock?: FakeClock;
}

function input(d: Days, who: { user: string }, upload: string, options: CommitOptions): CreateDropInput {
  return {
    userId: who.user,
    key: options.key ?? randomUUID(),
    occurrenceId: options.day ?? d.w.day,
    reservationId: options.reservation,
    media: options.media ?? { kind: "photo", uploadId: upload },
    caption: options.caption,
  };
}

/** `createDrop` as its route runs it, for `who`, committing `upload` to Ana's Saturday unless said. */
function commit(tx: WorldTx, d: Days, who: { user: string }, upload: string, options: CommitOptions = {}) {
  return outcomeOf(
    tx.savepoint((sp) => createDrop(sp, options.clock ?? clock, input(d, who, upload, options), dropRender)),
  );
}

/** The same in a transaction of its own, for the races. */
function commitAlone(d: Days, who: { user: string }, upload: string, options: CommitOptions = {}) {
  return outcomeOf(
    db.begin((tx) =>
      createDrop(tx as unknown as WorldTx, options.clock ?? clock, input(d, who, upload, options), dropRender),
    ),
  );
}

function added(outcome: Outcome): Added {
  if (!("status" in outcome)) throw new Error(`expected a drop added, not ${outcome.code} ${JSON.stringify(outcome)}`);
  return outcome;
}

const bare = (code: string) => ({ code, facts: {} });

interface Counts {
  photos?: number;
  links?: number;
  heldPhotos?: number;
  heldLinks?: number;
}

/** The caller's own allowance for their role with `counts` (T15, T17; addendum 2). */
function allowance(isStar: boolean, counts: Counts = {}): Allowance {
  const { photos = 0, links = 0, heldPhotos = 0, heldLinks = 0 } = counts;
  return {
    added: photos + links,
    reserved: heldPhotos + heldLinks,
    limit: isStar ? 6 : 3,
    photoAdded: photos,
    photoReserved: heldPhotos,
    photoLimit: isStar ? 6 : 2,
    externalAdded: links,
    externalReserved: heldLinks,
    externalLimit: isStar ? 2 : 1,
    isStar,
  };
}
const STAR = true;
const FRIEND = false;

/** Expects the role's refusal `code` on Ana's Saturday, with the caller's own `expected` allowance and Ana's next day. */
function expectLimit(outcome: Outcome, code: string, d: Days, expected: Allowance): void {
  expect("code" in outcome && outcome.code, JSON.stringify(outcome)).toBe(code);
  const { facts } = outcome as Refusal;
  expect(Object.keys(facts).sort()).toEqual(["allowance", "next_target", "target"]);
  expect(facts.target).toMatchObject({ id: d.w.day, phase: "collecting", localDate: "2026-11-07" });
  expect(facts.next_target).toMatchObject({ id: d.next, phase: "collecting", localDate: "2026-11-14" });
  expect(facts.allowance).toEqual(expected);
}

/** A reservation's row, its instants as their strings (`toMatchObject` takes any two instants as equal). */
async function slotRow(tx: WorldTx, id: string) {
  const [row] = await tx<
    { state: string; expires_at: Temporal.Instant; ended_at: Temporal.Instant | null; drop_id: string | null }[]
  >`SELECT state, expires_at, ended_at, drop_id FROM app.reservations WHERE id = ${id}`;
  return row === undefined
    ? undefined
    : { ...row, expires_at: row.expires_at.toString(), ended_at: row.ended_at?.toString() ?? null };
}

const counterOf = async (tx: WorldTx, day: string, interval: string) =>
  (
    await tx<
      { committed_total: number; committed_external: number; reserved_total: number; reserved_external: number }[]
    >`
      SELECT committed_total, committed_external, reserved_total, reserved_external FROM app.contribution_counters
       WHERE occurrence_id = ${day} AND interval_id = ${interval}`
  )[0];

/** Expects each counter of `day` to count exactly its active and held drops and its live reservations (T17, T18). */
async function expectCounted(tx: WorldTx, day: string): Promise<void> {
  const rows = await tx<{ counted: number[]; actual: number[] }[]>`
    SELECT ARRAY[c.committed_total, c.committed_external, c.reserved_total, c.reserved_external] AS counted,
           ARRAY[(SELECT pg_catalog.count(*)::int4 FROM app.drops d
                   WHERE d.occurrence_id = c.occurrence_id AND d.author_interval_id = c.interval_id
                     AND d.state IN ('active', 'held')),
                 (SELECT pg_catalog.count(*)::int4 FROM app.drops d
                   WHERE d.occurrence_id = c.occurrence_id AND d.author_interval_id = c.interval_id
                     AND d.state IN ('active', 'held') AND d.media_class = 'external_video'),
                 (SELECT pg_catalog.count(*)::int4 FROM app.reservations r
                   WHERE r.occurrence_id = c.occurrence_id AND r.interval_id = c.interval_id AND r.state = 'live'),
                 (SELECT pg_catalog.count(*)::int4 FROM app.reservations r
                   WHERE r.occurrence_id = c.occurrence_id AND r.interval_id = c.interval_id AND r.state = 'live'
                     AND r.media_class = 'external_video')] AS actual
      FROM app.contribution_counters c WHERE c.occurrence_id = ${day}`;
  for (const row of rows) expect(row.counted).toEqual(row.actual);
}

/** A drop's row, its instants as their strings and its hash as hex. */
async function dropRow(tx: WorldTx, id: string) {
  const [row] = await tx<
    {
      occurrence_id: string;
      club_id: string;
      author_interval_id: string;
      media_class: string;
      upload_id: string | null;
      dedupe_key: Buffer | null;
      caption: string | null;
      state: string;
      version: number;
      submitted_at: Temporal.Instant;
      updated_at: Temporal.Instant;
      audience_sealed_at: Temporal.Instant | null;
    }[]
  >`SELECT occurrence_id, club_id, author_interval_id, media_class, upload_id, dedupe_key, caption, state, version,
           submitted_at, updated_at, audience_sealed_at
      FROM app.drops WHERE id = ${id}`;
  return row === undefined
    ? undefined
    : {
        ...row,
        dedupe_key: row.dedupe_key?.toString("hex") ?? null,
        submitted_at: row.submitted_at.toString(),
        updated_at: row.updated_at.toString(),
        audience_sealed_at: row.audience_sealed_at?.toString() ?? null,
      };
}

const hashOf = async (tx: WorldTx, upload: string) =>
  (
    await tx<
      { hash: string }[]
    >`SELECT pg_catalog.encode(content_hash, 'hex') AS hash FROM app.uploads WHERE id = ${upload}`
  )[0]?.hash;

const audienceOf = async (tx: WorldTx, drop: string) =>
  (
    await tx<{ interval_id: string }[]>`
      SELECT interval_id FROM app.drop_audience WHERE drop_id = ${drop} ORDER BY interval_id COLLATE "C"`
  ).map((row) => row.interval_id);

const sorted = (...intervals: string[]) => [...intervals].sort();

const dropsIn = (tx: WorldTx, day: string) => tx`SELECT FROM app.drops WHERE occurrence_id = ${day}`;
const dropReceipts = (tx: WorldTx, user: string) =>
  tx`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${user} AND operation = 'createDrop'`;

async function releasing(tx: WorldTx, who: { user: string }, reservationId: string) {
  return tx.savepoint((sp) => releaseReservation(sp, clock, { userId: who.user, reservationId }));
}

/** Home's open day for `user` at `instant`, the drops it lists, or none when Home isn't a day. */
async function homeDrops(tx: WorldTx, user: string, club: string, instant: Temporal.Instant): Promise<string[]> {
  const now: ServerNow = await fakeClock(instant).sample(tx);
  const read = await readHome(tx, user, club, now);
  return read?.mode === "day" ? read.day.drops.map((card) => card.id) : [];
}

describe("a photo is added under the slot it was uploaded for (T17, T20; spec 06, 11)", () => {
  it("adds Ben's photo: the receipt, the slot consumed, the counts, the drop, its caption and its sealed audience", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      clock.advance({ minutes: 5 });
      const sample = EVENING.add({ minutes: 5 });
      const one = added(await commit(tx, d, d.w.ben, photo.upload, { caption: "The ferry at dawn 🌅" }));
      expect(one.body).toEqual({
        drop_id: one.body.drop_id,
        occurrence: one.body.occurrence,
        media_class: "photo",
        state: "added",
        version: 1,
        allowance: allowanceBody(allowance(FRIEND, { photos: 1 })),
        highlight: { version: 0 },
      });
      expect(one.body.drop_id).toMatch(/^drp_/);
      expect(one.body.occurrence).toMatchObject({
        id: d.w.day,
        club_id: d.w.club,
        local_date: "2026-11-07",
        phase: "collecting",
        reveal_at: "2026-11-07T07:00:00Z",
        star: { membership_id: d.w.ana.interval },
      });
      // The receipt names no caption, upload or hash (TECH-DESIGN section 6).
      expect(one.text).not.toContain("ferry");
      expect(one.text).not.toContain(photo.upload);
      expect(await slotRow(tx, photo.slot)).toEqual({
        state: "consumed",
        expires_at: EVENING.add({ minutes: 30 }).toString(),
        ended_at: sample.toString(),
        drop_id: one.body.drop_id,
      });
      expect(await counterOf(tx, d.w.day, d.w.ben.interval)).toEqual({
        committed_total: 1,
        committed_external: 0,
        reserved_total: 0,
        reserved_external: 0,
      });
      expect(await dropRow(tx, one.body.drop_id)).toEqual({
        occurrence_id: d.w.day,
        club_id: d.w.club,
        author_interval_id: d.w.ben.interval,
        media_class: "photo",
        upload_id: photo.upload,
        dedupe_key: await hashOf(tx, photo.upload),
        caption: "The ferry at dawn 🌅",
        state: "active",
        version: 1,
        submitted_at: sample.toString(),
        updated_at: sample.toString(),
        audience_sealed_at: sample.toString(),
      });
      expect(
        await tx`SELECT drop_version, caption FROM app.drop_caption_versions WHERE drop_id = ${one.body.drop_id}`,
      ).toEqual([{ drop_version: 1, caption: "The ferry at dawn 🌅" }]);
      expect(await audienceOf(tx, one.body.drop_id)).toEqual(
        sorted(d.w.ana.interval, d.w.ben.interval, d.w.cleo.interval),
      );
      // Giving the slot back now names the drop (T20), and every row passes the database's own guards at COMMIT.
      expect(await releasing(tx, d.w.ben, photo.slot)).toEqual({
        id: photo.slot,
        state: "consumed",
        dropId: one.body.drop_id,
        allowance: allowance(FRIEND, { photos: 1 }),
      });
      await expectCounted(tx, d.w.day);
      await checkAsAtCommit(plain(tx));
    });
  });

  it("adds Ana's own photos under the star's limits, and answers Ana's highlight as it stands (ND01, T22)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      for (let index = 0; index < 3; index += 1) await commitDrop(plain(tx), d.w, d.w.ana);
      const earlier = await commitDrop(plain(tx), d.w, d.w.ana);
      await tx`
        INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
        VALUES (${d.w.day}, ${d.w.ana.interval}, ${earlier}, 2, ${AT.edited})`;
      const photo = await prepared(tx, d, d.w.ana);
      const fifth = added(await commit(tx, d, d.w.ana, photo.upload));
      expect(fifth.body.allowance).toEqual(allowanceBody(allowance(STAR, { photos: 5 })));
      expect(fifth.body.highlight).toEqual({ drop_id: earlier, version: 2 });
      expect(await audienceOf(tx, fifth.body.drop_id)).toContain(d.w.ana.interval);
      const sixth = added(await commit(tx, d, d.w.ana, (await prepared(tx, d, d.w.ana)).upload));
      expect(sixth.body.allowance).toEqual(allowanceBody(allowance(STAR, { photos: 6 })));
      await expectCounted(tx, d.w.day);
      await checkAsAtCommit(plain(tx));
    });
  });

  it("keeps an empty caption as none, and one that was never sent as none", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const empty = added(await commit(tx, d, d.w.ben, (await prepared(tx, d, d.w.ben)).upload, { caption: "" }));
      const none = added(await commit(tx, d, d.w.cleo, (await prepared(tx, d, d.w.cleo)).upload));
      for (const drop of [empty.body.drop_id, none.body.drop_id]) {
        expect(await dropRow(tx, drop)).toMatchObject({ caption: null });
        expect(await tx`SELECT caption FROM app.drop_caption_versions WHERE drop_id = ${drop}`).toEqual([
          { caption: null },
        ]);
      }
    });
  });

  it("takes the body's reservation_id when it names the upload's own slot", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const one = added(await commit(tx, d, d.w.ben, photo.upload, { reservation: photo.slot }));
      expect(await slotRow(tx, photo.slot)).toMatchObject({ state: "consumed", drop_id: one.body.drop_id });
    });
  });
});

describe("one drop per Idempotency-Key, and its first answer on every retry (T19, Q12)", () => {
  it("returns the first receipt byte for byte after midnight and after the cutoff, with one drop made", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      const first = added(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry" }));
      expect(added(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry" })).text).toBe(first.text);
      clock.set(at("2026-11-07T00:00:00.5Z"));
      expect(added(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry" })).text).toBe(first.text);
      clock.set(REVEAL.add({ hours: 1 }));
      expect(added(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry" })).text).toBe(first.text);
      expect(await dropsIn(tx, d.w.day)).toHaveLength(1);
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("names the day's star in a retry as members see them then, and keeps no name in the receipt (FQ139, FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const avatar = await newAvatar(plain(tx), d.w.ana.user, "ready");
      await tx`UPDATE app.users SET avatar_upload_id = ${avatar.id} WHERE id = ${d.w.ana.user}`;
      const photo = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      const first = added(await commit(tx, d, d.w.ben, photo.upload, { key }));
      const ana = { membership_id: d.w.ana.interval, display_name: "Ana", avatar_version: avatar.version };
      expect(first.body.occurrence).toMatchObject({ star: ana });
      // The receipt keeps the star by interval alone: no name, no avatar.
      const [kept] = await tx<{ star: unknown; text: string }[]>`
        SELECT response_body->'occurrence'->'star' AS star, response_body::text AS text FROM app.idempotency_receipts
         WHERE actor_user_id = ${d.w.ben.user} AND operation = 'createDrop'`;
      expect(kept?.star).toEqual({ membership_id: d.w.ana.interval });
      expect(kept?.text).not.toContain("Ana");
      expect(kept?.text).not.toContain(avatar.version);
      const starred = (star: Record<string, unknown>) => ({
        ...first.body,
        occurrence: { ...(first.body.occurrence as Record<string, unknown>), star },
      });
      // Renamed: the retry names her as members see her now, and nothing else in it moves.
      await tx`UPDATE app.users SET display_name = 'Annie' WHERE id = ${d.w.ana.user}`;
      clock.advance({ minutes: 1 });
      expect(added(await commit(tx, d, d.w.ben, photo.upload, { key })).body).toEqual(
        starred({ ...ana, display_name: "Annie" }),
      );
      // Gone from the club: by the name she left with, and no avatar (FQ75); the day is held, the drop kept.
      await leave(plain(tx), d.w.ana, "Annie", new Date("2026-11-06T21:01:30Z"));
      clock.advance({ minutes: 1 });
      expect(added(await commit(tx, d, d.w.ben, photo.upload, { key })).body).toEqual(
        starred({ membership_id: d.w.ana.interval, display_name: "Annie" }),
      );
      expect(await dropsIn(tx, d.w.day)).toHaveLength(1);
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("answers a retry MEMBERSHIP_CHANGED once the day's star has no name left to show, before the reveal, keeping the drop held (FQ139)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      const first = added(await commit(tx, d, d.w.ben, photo.upload, { key }));
      // An account deletion that kept no name (T27; migration 0003 lets a deleted account's be empty).
      await tx`
        UPDATE app.memberships SET state = 'account_deleted', left_at = ${new Date("2026-11-06T21:01:30Z")}
         WHERE interval_id = ${d.w.ana.interval}`;
      clock.advance({ minutes: 2 });
      expect(await commit(tx, d, d.w.ben, photo.upload, { key })).toEqual(bare("MEMBERSHIP_CHANGED"));
      expect(await tx`SELECT id FROM app.drops WHERE occurrence_id = ${d.w.day}`).toEqual([{ id: first.body.drop_id }]);
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("answers a retry MEMBERSHIP_CHANGED too when the star's account goes with no name after the reveal, the drop still active in the opened day (FQ139)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      const first = added(await commit(tx, d, d.w.ben, photo.upload, { key }));
      // The day opens at 07:00; at 07:30 Ana's account is deleted with no name kept (T27; migration 0003).
      await tx`
        UPDATE app.memberships SET state = 'account_deleted', left_at = ${new Date("2026-11-07T07:30:00Z")}
         WHERE interval_id = ${d.w.ana.interval}`;
      clock.set(REVEAL.add({ hours: 1 }));
      // The day has no star to name, so no answer can send it: the retry is refused, though the drop was added. Not
      // reachable until account deletion is built (B6), which decides how such a day ends (FQ139).
      expect(await commit(tx, d, d.w.ben, photo.upload, { key })).toEqual(bare("MEMBERSHIP_CHANGED"));
      expect(await tx`SELECT id, state FROM app.drops WHERE occurrence_id = ${d.w.day}`).toEqual([
        { id: first.body.drop_id, state: "active" },
      ]);
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it(
    "makes one drop when the same send arrives twice at once: the second waits for the first, then gets its answer",
    { timeout: 30_000 },
    async () => {
      const d = await committedWorld();
      const photo = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
      const key = randomUUID();
      let open = (): void => undefined;
      const gate = new Promise<void>((resolve) => (open = resolve));
      let ready: (pid: number) => void = () => undefined;
      const started = new Promise<number>((resolve) => (ready = resolve));
      // The first holds its transaction open once it has committed the drop and reserved the receipt.
      const first = outcomeOf(
        db.begin(async (raw) => {
          const tx = raw as unknown as WorldTx;
          const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
          const body = await createDrop(
            tx,
            clock,
            input(d, d.w.ben, photo.upload, { key, caption: "Ferry" }),
            dropRender,
          );
          ready(row?.pid ?? 0);
          await gate;
          return body;
        }),
      );
      const pid = await started;
      const second = commitAlone(d, d.w.ben, photo.upload, { key, caption: "Ferry" });
      try {
        // The second send waits on the first's receipt, not past it.
        await waitingOn(db, pid, 1);
      } finally {
        open();
      }
      const one = added(await first);
      expect(added(await second).text).toBe(one.text);
      expect(await dropsIn(db as unknown as WorldTx, d.w.day)).toHaveLength(1);
      expect(await dropReceipts(db as unknown as WorldTx, d.w.ben.user)).toHaveLength(1);
      await expectCounted(db as unknown as WorldTx, d.w.day);
    },
  );

  it("refuses another caption, another upload or another day under the same key with IDEMPOTENCY_CONFLICT", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const other = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      added(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry" }));
      expect(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Boat" })).toEqual(
        bare("IDEMPOTENCY_CONFLICT"),
      );
      expect(await commit(tx, d, d.w.ben, photo.upload, { key })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await commit(tx, d, d.w.ben, other.upload, { key, caption: "Ferry" })).toEqual(
        bare("IDEMPOTENCY_CONFLICT"),
      );
      expect(await commit(tx, d, d.w.ben, photo.upload, { key, caption: "Ferry", day: d.next })).toEqual(
        bare("IDEMPOTENCY_CONFLICT"),
      );
      expect(await dropsIn(tx, d.w.day)).toHaveLength(1);
      expect(await slotRow(tx, other.slot)).toMatchObject({ state: "live" });
    });
  });

  it("leaves no receipt for a refusal, so the same key adds the photo once it is ready", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben, { end: "preparing" });
      const key = randomUUID();
      expect(await commit(tx, d, d.w.ben, photo.upload, { key })).toEqual(bare("MEDIA_NOT_READY"));
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(0);
      await tx.savepoint((sp) =>
        recordPreparation(sp, clock, photo.upload, {
          state: "ready",
          contentHash: randomBytes(32),
          renditions: [
            { kind: "full", objectKey: newId("uploads/rendition"), width: 3024, height: 4032, byteSize: 900_000 },
            { kind: "display", objectKey: newId("uploads/rendition"), width: 1200, height: 1600, byteSize: 200_000 },
          ],
        }),
      );
      added(await commit(tx, d, d.w.ben, photo.upload, { key }));
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(1);
    });
  });

  it("names nothing to a rejoined account under a key its earlier interval used (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const key = randomUUID();
      added(await commit(tx, d, d.w.ben, photo.upload, { key }));
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await commit(tx, d, d.w.ben, photo.upload, { key })).toEqual(bare("NOT_FOUND"));
    });
  });
});

describe("nothing for anyone the day or the photo isn't theirs to add (T4, T9, T12, T14)", () => {
  it("gives the neutral not-found to Dan, a guessed day, a day id that can't be one, and a former member", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await prepared(tx, d, d.w.ben);
      const cleos = await prepared(tx, d, d.w.cleo);
      expect(await commit(tx, d, d.w.dan, bens.upload)).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, bens.upload, { day: "occ_nobody" })).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, bens.upload, { day: "occ.nobody" })).toEqual(bare("NOT_FOUND"));
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T21:01:00Z"));
      clock.advance({ minutes: 2 });
      expect(await commit(tx, d, d.w.cleo, cleos.upload)).toEqual(bare("NOT_FOUND"));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
      expect(
        await tx`SELECT FROM app.idempotency_receipts
                  WHERE actor_user_id IN (${d.w.dan.user}, ${d.w.cleo.user}, ${d.w.ben.user}) AND operation = 'createDrop'`,
      ).toHaveLength(0);
    });
  });

  it("gives the neutral not-found for a suspended club, a suspended or cancelled day, and a deleting account", async () => {
    const denials: ((tx: WorldTx, d: Days) => Promise<unknown>)[] = [
      (tx, d) => tx`UPDATE app.clubs SET suspended_at = ${new Date("2026-11-06T21:01:00Z")} WHERE id = ${d.w.club}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${d.w.day}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${d.w.day}`,
      (tx, d) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${new Date("2026-11-06T21:01:00Z")}
            WHERE id = ${d.w.ben.user}`,
    ];
    for (const deny of denials) {
      await rolledBack(db, async (tx) => {
        const d = await days(tx);
        const photo = await prepared(tx, d, d.w.ben);
        await deny(tx, d);
        clock.advance({ minutes: 2 });
        expect(await commit(tx, d, d.w.ben, photo.upload)).toEqual(bare("NOT_FOUND"));
        expect(await slotRow(tx, photo.slot)).toMatchObject({ state: "live" });
      });
    }
  });

  it("gives the neutral not-found for another member's upload, an avatar, a link, an id nobody has and one that can't be one", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const cleos = await prepared(tx, d, d.w.cleo);
      const avatar = await newAvatar(plain(tx), d.w.ben.user, "ready");
      expect(await commit(tx, d, d.w.ben, cleos.upload)).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, cleos.upload, { reservation: cleos.slot })).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, avatar.id)).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, "", { media: { kind: "external_video", sourceId: "src_nobody" } })).toEqual(
        bare("NOT_FOUND"),
      );
      expect(await commit(tx, d, d.w.ben, "upl_nobody")).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, "upl.nobody")).toEqual(bare("NOT_FOUND"));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
      expect(await slotRow(tx, cleos.slot)).toMatchObject({ state: "live" });
      // Cleo's own photo is still hers to add.
      added(await commit(tx, d, d.w.cleo, cleos.upload));
    });
  });

  it("moves nothing: an upload made for another day, or a reservation_id naming another slot, is not found (T4)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const nextWeek = await prepared(tx, d, d.w.ben, { day: d.next });
      const photo = await prepared(tx, d, d.w.ben);
      const otherSlot = await slot(tx, d.w.cleo, d.w.day);
      expect(await commit(tx, d, d.w.ben, nextWeek.upload)).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, photo.upload, { reservation: nextWeek.slot })).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, photo.upload, { reservation: otherSlot })).toEqual(bare("NOT_FOUND"));
      expect(await commit(tx, d, d.w.ben, photo.upload, { day: d.next })).toEqual(bare("NOT_FOUND"));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
      expect(await dropsIn(tx, d.next)).toHaveLength(0);
      // Each in its own day is added.
      added(await commit(tx, d, d.w.ben, nextWeek.upload, { day: d.next }));
      added(await commit(tx, d, d.w.ben, photo.upload));
    });
  });

  it("gives the neutral not-found for an upload that has lapsed, 24 hours after it began (spec 33)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      clock.set(at("2026-11-12T10:00:00Z"));
      const photo = await prepared(tx, d, d.w.ben, { day: d.next });
      clock.set(at("2026-11-13T10:00:00Z"));
      expect(await commit(tx, d, d.w.ben, photo.upload, { day: d.next })).toEqual(bare("NOT_FOUND"));
      expect(await dropsIn(tx, d.next)).toHaveLength(0);
      // A microsecond before, it is still Ben's, its slot long lapsed, so it takes a free one.
      clock.set(at("2026-11-13T09:59:59.999999Z"));
      added(await commit(tx, d, d.w.ben, photo.upload, { day: d.next }));
    });
  });

  it("gives the neutral not-found for a photo a rejoined account uploaded under its earlier interval (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await commit(tx, d, d.w.ben, photo.upload)).toEqual(bare("NOT_FOUND"));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
    });
  });
});

describe("a held day, and the cutoff read after the locks (T1, T3, T4; FQ63)", () => {
  it("answers MEMBERSHIP_CHANGED, with no facts, for a day whose star has left, the slot left as it was", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      await leave(plain(tx), d.w.ana, "Ana", new Date("2026-11-06T21:01:00Z"));
      clock.advance({ minutes: 2 });
      expect(await commit(tx, d, d.w.ben, photo.upload)).toEqual(bare("MEMBERSHIP_CHANGED"));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
      expect(await slotRow(tx, photo.slot)).toMatchObject({ state: "live", drop_id: null });
    });
  });

  it("adds a photo a microsecond before 07:00, and refuses it at 07:00 with the day and Ana's next day", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      clock.set(at("2026-11-07T06:45:00Z"));
      const early = await prepared(tx, d, d.w.ben);
      const late = await prepared(tx, d, d.w.cleo);
      clock.set(REVEAL.subtract({ microseconds: 1 }));
      const one = added(await commit(tx, d, d.w.ben, early.upload));
      expect(await dropRow(tx, one.body.drop_id)).toMatchObject({
        submitted_at: REVEAL.subtract({ microseconds: 1 }).toString(),
      });
      clock.set(REVEAL);
      const before = await slotRow(tx, late.slot);
      const closed = (await commit(tx, d, d.w.cleo, late.upload)) as Refusal;
      expect(closed.code).toBe("OCCURRENCE_CLOSED");
      expect(Object.keys(closed.facts).sort()).toEqual(["next_target", "target"]);
      expect(closed.facts.target).toMatchObject({ id: d.w.day, phase: "open" });
      expect(closed.facts.next_target).toMatchObject({ id: d.next, phase: "collecting", localDate: "2026-11-14" });
      expect(await slotRow(tx, late.slot)).toEqual(before);
      expect(await dropsIn(tx, d.w.day)).toHaveLength(1);
    });
  });

  it("refuses after the close with the day as past, and a photo still preparing at 07:00 as closed, not unready", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const ready = await prepared(tx, d, d.w.ben);
      const preparing = await prepared(tx, d, d.w.cleo, { end: "preparing" });
      clock.set(REVEAL);
      expect(await commit(tx, d, d.w.cleo, preparing.upload)).toMatchObject({
        code: "OCCURRENCE_CLOSED",
        facts: { target: { id: d.w.day, phase: "open" }, next_target: { id: d.next } },
      });
      clock.set(CLOSE);
      expect(await commit(tx, d, d.w.ben, ready.upload)).toMatchObject({
        code: "OCCURRENCE_CLOSED",
        facts: { target: { id: d.w.day, phase: "past" }, next_target: { id: d.next } },
      });
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
    });
  });

  it(
    "waits for the day's own row, and reads the clock after it: a commit held on the day across 07:00 is refused (ADR-013)",
    { timeout: 30_000 },
    async () => {
      const d = await committedWorld();
      clock.set(REVEAL.subtract({ minutes: 10 }));
      const photo = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
      clock.set(REVEAL.subtract({ seconds: 1 }));
      const hold = await holdingDay(d.w.day);
      const waiting = commitAlone(d, d.w.ben, photo.upload);
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
      expect(await db`SELECT FROM app.drops WHERE occurrence_id = ${d.w.day}`).toHaveLength(0);
      expect(
        await db`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${d.w.ben.user} AND operation = 'createDrop'`,
      ).toHaveLength(0);
    },
  );

  it(
    "waits for the counter's row, and reads the clock after it: a commit that waited across 07:00 is refused",
    { timeout: 30_000 },
    async () => {
      const d = await committedWorld();
      clock.set(REVEAL.subtract({ minutes: 10 }));
      const photo = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
      clock.set(REVEAL.subtract({ seconds: 1 }));
      const hold = await holdingCounter(d.w.day, d.w.ben.interval);
      const waiting = commitAlone(d, d.w.ben, photo.upload);
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
      expect(await db`SELECT FROM app.drops WHERE occurrence_id = ${d.w.day}`).toHaveLength(0);
      expect(
        await db`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${d.w.ben.user} AND operation = 'createDrop'`,
      ).toHaveLength(0);
    },
  );
});

describe("only a ready photo is added (spec 33; T12)", () => {
  it("answers MEDIA_NOT_READY for a pending, a preparing, a held and a rejected upload, leaving each slot live", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const ends = ["pending", "preparing", "held", "rejected"] as const;
      const photos: Prepared[] = [];
      for (const [index, end] of ends.entries()) {
        photos.push(await prepared(tx, d, index < 2 ? d.w.ana : d.w.ben, { end }));
      }
      for (const [index, photo] of photos.entries()) {
        expect(await commit(tx, d, index < 2 ? d.w.ana : d.w.ben, photo.upload)).toEqual(bare("MEDIA_NOT_READY"));
        expect(await slotRow(tx, photo.slot)).toMatchObject({ state: "live", drop_id: null });
      }
      expect(await dropsIn(tx, d.w.day)).toHaveLength(0);
      expect(await dropReceipts(tx, d.w.ana.user)).toHaveLength(0);
      expect(await dropReceipts(tx, d.w.ben.user)).toHaveLength(0);
    });
  });
});

describe("the same photo twice in one day (T20, T21)", () => {
  it("refuses the same photo under a second slot with DUPLICATE_DROP and the first drop, the second slot kept", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const hash = randomBytes(32);
      const first = added(await commit(tx, d, d.w.ben, (await prepared(tx, d, d.w.ben, { hash })).upload));
      const again = await prepared(tx, d, d.w.ben, { hash });
      expect(await commit(tx, d, d.w.ben, again.upload)).toEqual({
        code: "DUPLICATE_DROP",
        facts: { existing_drop_id: first.body.drop_id },
      });
      expect(await slotRow(tx, again.slot)).toMatchObject({ state: "live", drop_id: null });
      // Another member's photo with the same bytes is no duplicate of Ben's: the check is the author's own.
      added(await commit(tx, d, d.w.cleo, (await prepared(tx, d, d.w.cleo, { hash })).upload));
      // Nor is Ben's in another day.
      added(
        await commit(tx, d, d.w.ben, (await prepared(tx, d, d.w.ben, { hash, day: d.next })).upload, { day: d.next }),
      );
    });
  });

  it("refuses an upload already added, under a new key, with DUPLICATE_DROP and its own drop (T20's net)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      const first = added(await commit(tx, d, d.w.ben, photo.upload));
      expect(await commit(tx, d, d.w.ben, photo.upload)).toEqual({
        code: "DUPLICATE_DROP",
        facts: { existing_drop_id: first.body.drop_id },
      });
      expect(await dropsIn(tx, d.w.day)).toHaveLength(1);
    });
  });

  it("counts a held drop as the same photo, and not a withdrawn one, whose own upload is then not found", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const hash = randomBytes(32);
      const photo = await prepared(tx, d, d.w.ben, { hash });
      const first = added(await commit(tx, d, d.w.ben, photo.upload));
      const again = await prepared(tx, d, d.w.ben, { hash });
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${at("2026-11-06T21:10:00Z")} WHERE id = ${first.body.drop_id}`;
      clock.set(at("2026-11-06T21:11:00Z"));
      expect(await commit(tx, d, d.w.ben, again.upload)).toEqual({
        code: "DUPLICATE_DROP",
        facts: { existing_drop_id: first.body.drop_id },
      });
      await tx`
        UPDATE app.drops SET state = 'withdrawn', ended_at = ${at("2026-11-06T21:12:00Z")},
                             updated_at = ${at("2026-11-06T21:12:00Z")}
         WHERE id = ${first.body.drop_id}`;
      clock.set(at("2026-11-06T21:13:00Z"));
      expect(await commit(tx, d, d.w.ben, photo.upload)).toEqual(bare("NOT_FOUND"));
      added(await commit(tx, d, d.w.ben, again.upload));
    });
  });
});

describe("a slot that ended before its photo was added (T17, T18; spec 11)", () => {
  it("takes a free slot for a photo whose slot lapsed, the reservation left as it ended", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      clock.advance({ minutes: 40 });
      const one = added(await commit(tx, d, d.w.ben, photo.upload));
      expect(one.body.allowance).toEqual(allowanceBody(allowance(FRIEND, { photos: 1 })));
      expect(await slotRow(tx, photo.slot)).toEqual({
        state: "expired",
        expires_at: EVENING.add({ minutes: 30 }).toString(),
        ended_at: EVENING.add({ minutes: 30 }).toString(),
        drop_id: null,
      });
      expect(await counterOf(tx, d.w.day, d.w.ben.interval)).toMatchObject({ committed_total: 1, reserved_total: 0 });
      await expectCounted(tx, d.w.day);
      await checkAsAtCommit(plain(tx));
    });
  });

  it("takes a free slot for a photo whose slot was given back, the reservation left released", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      clock.advance({ minutes: 1 });
      expect(await releasing(tx, d.w.ben, photo.slot)).toMatchObject({ state: "released" });
      clock.advance({ minutes: 1 });
      added(await commit(tx, d, d.w.ben, photo.upload));
      expect(await slotRow(tx, photo.slot)).toMatchObject({
        state: "released",
        ended_at: EVENING.add({ minutes: 1 }).toString(),
        drop_id: null,
      });
      await expectCounted(tx, d.w.day);
    });
  });

  it("refuses Ben's third photo with PHOTO_LIMIT, his own allowance and Ana's next day, and Ana's third not at all", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await prepared(tx, d, d.w.ben);
      const anas = await prepared(tx, d, d.w.ana);
      clock.advance({ minutes: 30 });
      expect(await releasing(tx, d.w.ben, bens.slot)).toMatchObject({ state: "expired" });
      expect(await releasing(tx, d.w.ana, anas.slot)).toMatchObject({ state: "expired" });
      for (const who of [d.w.ben, d.w.ana, d.w.ben, d.w.ana]) {
        await commitDrop(plain(tx), d.w, who, { at: new Date("2026-11-06T21:35:00Z") });
      }
      clock.set(at("2026-11-06T21:40:00Z"));
      expectLimit(await commit(tx, d, d.w.ben, bens.upload), "PHOTO_LIMIT", d, allowance(FRIEND, { photos: 2 }));
      expect(await slotRow(tx, bens.slot)).toMatchObject({ state: "expired", drop_id: null });
      const star = added(await commit(tx, d, d.w.ana, anas.upload));
      expect(star.body.allowance).toEqual(allowanceBody(allowance(STAR, { photos: 3 })));
    });
  });

  it("refuses with QUOTA_FULL, not PHOTO_LIMIT, once all of Ben's are used, and Ana's with photos still left to her", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = await prepared(tx, d, d.w.ben);
      const anas = await prepared(tx, d, d.w.ana);
      clock.advance({ minutes: 1 });
      await releasing(tx, d.w.ben, bens.slot);
      await releasing(tx, d.w.ana, anas.slot);
      const committed: [Member, "photo" | "external_video"][] = [
        [d.w.ben, "photo"],
        [d.w.ben, "photo"],
        [d.w.ben, "external_video"],
        ...Array.from({ length: 4 }, (): [Member, "photo"] => [d.w.ana, "photo"]),
        [d.w.ana, "external_video"],
        [d.w.ana, "external_video"],
      ];
      for (const [who, media] of committed) {
        await commitDrop(plain(tx), d.w, who, { media, at: new Date("2026-11-06T21:05:00Z") });
      }
      clock.set(at("2026-11-06T21:10:00Z"));
      expectLimit(
        await commit(tx, d, d.w.ben, bens.upload),
        "QUOTA_FULL",
        d,
        allowance(FRIEND, { photos: 2, links: 1 }),
      );
      expectLimit(await commit(tx, d, d.w.ana, anas.upload), "QUOTA_FULL", d, allowance(STAR, { photos: 4, links: 2 }));
      expect(await dropsIn(tx, d.w.day)).toHaveLength(9);
    });
  });
});

/**
 * Another connection holding `interval`'s counter row in `day` `FOR NO KEY UPDATE`, the command's own lock on it,
 * writing nothing, until released.
 */
/** Another connection holding Ana's Saturday's own row, as a write to the day would, until released. */
async function holdingDay(day: string): Promise<{ pid: number; release: () => Promise<void> }> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held: (pid: number) => void = () => undefined;
  const taken = new Promise<number>((resolve) => (held = resolve));
  const done = db.begin(async (tx) => {
    const [row] = await tx<{ pid: number }[]>`
      SELECT pg_catalog.pg_backend_pid() AS pid FROM app.occurrences WHERE id = ${day} FOR NO KEY UPDATE`;
    if (row === undefined) throw new Error("holdingDay: no such day");
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
 * Ben's two photos whose slots have lapsed, and a third slot of his live, made in a committed world: one photo is
 * left to him, so of the two photos only one can take a free slot (Q10).
 */
async function lastFreeSlot(): Promise<{ d: Days; a: Prepared; b: Prepared }> {
  const d = await committedWorld();
  const a = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
  const b = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
  clock.set(EVENING.add({ minutes: 31 }));
  await db.begin((tx) => slot(tx as unknown as WorldTx, d.w.ben, d.w.day));
  return { d, a, b };
}

describe("two photos racing for the last free slot are put in order by the counter (Q10, T17)", () => {
  it("makes the second wait for the first's commit, then sees its drop: PHOTO_LIMIT", { timeout: 30_000 }, async () => {
    const { d, a, b } = await lastFreeSlot();
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let ready: (pid: number) => void = () => undefined;
    const started = new Promise<number>((resolve) => (ready = resolve));
    const first = outcomeOf(
      db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
        const body = await createDrop(tx, clock, input(d, d.w.ben, a.upload, {}), dropRender);
        ready(row?.pid ?? 0);
        await gate;
        return body;
      }),
    );
    const pid = await started;
    const second = commitAlone(d, d.w.ben, b.upload);
    try {
      await waitingOn(db, pid, 1);
    } finally {
      open();
    }
    expect(added(await first).body.allowance).toEqual(allowanceBody(allowance(FRIEND, { photos: 1, heldPhotos: 1 })));
    expectLimit(await second, "PHOTO_LIMIT", d, allowance(FRIEND, { photos: 1, heldPhotos: 1 }));
    await expectCounted(db as unknown as WorldTx, d.w.day);
  });

  it(
    "lets exactly one of two commits and a reservation, all at once, take the last photo, never three",
    { timeout: 30_000 },
    async () => {
      const { d, a, b } = await lastFreeSlot();
      const reserving = outcomeOf(
        db.begin((tx) =>
          createReservation(
            tx as unknown as WorldTx,
            clock,
            { userId: d.w.ben.user, key: randomUUID(), occurrenceId: d.w.day, mediaClass: "photo" },
            reservationBody,
          ),
        ),
      );
      const outcomes = await Promise.all([
        commitAlone(d, d.w.ben, a.upload),
        commitAlone(d, d.w.ben, b.upload),
        reserving,
      ]);
      expect(outcomes.filter((outcome) => "status" in outcome)).toHaveLength(1);
      for (const outcome of outcomes) {
        if ("code" in outcome) expect(outcome.code).toBe("PHOTO_LIMIT");
      }
      const counter = await counterOf(db as unknown as WorldTx, d.w.day, d.w.ben.interval);
      expect((counter?.committed_total ?? 0) + (counter?.reserved_total ?? 0)).toBe(2);
      await expectCounted(db as unknown as WorldTx, d.w.day);
    },
  );
});

describe("the audience is the club's active members at the commit, written once and sealed (T8)", () => {
  it("leaves out a member who left before, and Home at 07:00 shows the drop to its audience, not to one who joined after", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = await prepared(tx, d, d.w.ben);
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T21:01:00Z"));
      clock.set(at("2026-11-06T21:02:00Z"));
      const one = added(await commit(tx, d, d.w.ben, photo.upload));
      expect(await audienceOf(tx, one.body.drop_id)).toEqual(sorted(d.w.ana.interval, d.w.ben.interval));
      await checkAsAtCommit(plain(tx));
      const zoe = await newUser(plain(tx), "Zoe");
      await joinByRoster(plain(tx), d.w.club, d.w.ana, [{ user: zoe, label: "Zoe" }], new Date("2026-11-06T21:30:00Z"));
      expect(await homeDrops(tx, d.w.ana.user, d.w.club, REVEAL)).toContain(one.body.drop_id);
      expect(await homeDrops(tx, d.w.ben.user, d.w.club, REVEAL)).toContain(one.body.drop_id);
      expect(await homeDrops(tx, zoe, d.w.club, REVEAL)).not.toContain(one.body.drop_id);
      expect(await homeDrops(tx, d.w.cleo.user, d.w.club, REVEAL)).not.toContain(one.body.drop_id);
    });
  });

  it(
    "makes a join wait for the commit's hold on the club, so the joiner comes after the seal and is never in it",
    { timeout: 30_000 },
    async () => {
      const d = await committedWorld();
      const photo = await db.begin((tx) => prepared(tx as unknown as WorldTx, d, d.w.ben));
      const zoe = await db.begin((tx) => newUser(tx as unknown as Tx, `Zoe ${randomUUID().slice(0, 8)}`));
      const hold = await holdingCounter(d.w.day, d.w.ben.interval);
      const committing = commitAlone(d, d.w.ben, photo.upload);
      let joining: Promise<unknown> | undefined;
      try {
        await waitingOn(db, hold.pid, 1);
        joining = db.begin(async (tx) => {
          await tx`SELECT id FROM app.clubs WHERE id = ${d.w.club} FOR UPDATE`;
          await joinByRoster(tx, d.w.club, d.w.ana, [{ user: zoe, label: "Zoe" }], new Date("2026-11-06T21:05:00Z"));
        });
        // The join waits behind the commit, which waits behind the counter's holder.
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      const one = added(await committing);
      await joining;
      expect(await audienceOf(db as unknown as WorldTx, one.body.drop_id)).toEqual(
        sorted(d.w.ana.interval, d.w.ben.interval, d.w.cleo.interval),
      );
      expect(
        await db`SELECT FROM app.memberships WHERE club_id = ${d.w.club} AND user_id = ${zoe} AND state = 'active'`,
      ).toHaveLength(1);
    },
  );
});
