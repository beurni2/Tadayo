/// <reference lib="esnext.temporal" />
// Leaving with "Withdraw my contributions", against Postgres as `tadayo_app` (spec 11, 22, 31; T3, T18, T22, T23,
// T24, T26; FQ63, FQ142; the outside audit's A3; docs/plans/api-b2-leave-withdraw.md, section 2;
// packages/domain/src/clubs/leave-club.ts, step 5a): the leaving membership's drops in the club, active or held,
// revealed or not, are withdrawn at the leave's instant with one `leave` removal each, so no read shows them again;
// before a drop's reveal its slot is given back, after it none reopens; the leaver's highlight on one is cleared and
// its pending replacement let go; and every leave, keep or withdraw, gives back the leaver's live reservations.
// Nobody else's drops are touched, nor the same account's in another club or under an earlier membership.
//
// The world is world.ts's: Ana's Saturday 7 November 2026 in a London club, on UTC then, revealed at 07:00Z;
// Ben and Cleo are its other members. Drops are committed as createDrop commits them (world.ts's `commitDrop`).
//
// Written before the fix, from the plan's section 2, and seen failing on `main` at dd0154d: the first test is the
// audit's own reproduction.

import { randomUUID } from "node:crypto";
import { leftClubBody } from "@tadayo/api";
import { leaveClub, mayReadDrop, readHome, type Json, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, joinByRoster, newId, newWorld, type Member, type World } from "./world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);

const EVENING = at("2026-11-06T21:00:00.123456Z");
const REVEAL = at("2026-11-07T07:00:00Z");
const MORNING = at("2026-11-07T09:00:00.654321Z");

type Choice = "keep" | "withdraw";

/**
 * `who` leaves the world's club at `instant` with `choice`, as the route runs the command, and the checks Postgres
 * defers to the commit run on what it left (drops_removal_matches, drops_ended_unhighlighted).
 */
async function leaving(
  tx: WorldTx,
  w: World,
  who: Member,
  instant: Temporal.Instant,
  choice: Choice,
  key = randomUUID(),
) {
  const answer = await leaveClub(
    tx,
    fakeClock(instant),
    { userId: who.user, key, clubId: w.club, contributions: choice },
    leftClubBody,
  );
  await checkAsAtCommit(plain(tx));
  return answer;
}

/**
 * `who`'s leave, which must be refused NOT_FOUND, in a savepoint; `check` reads the rows inside it, after the
 * refusal and before its rollback, so it sees whatever the refused leave wrote.
 */
async function refusedLeave(
  tx: WorldTx,
  w: World,
  who: Member,
  instant: Temporal.Instant,
  choice: Choice,
  check: (sp: WorldTx) => Promise<void>,
): Promise<void> {
  const undo = new Error("the refused leave's savepoint, rolled back");
  await expect(
    tx.savepoint(async (sp) => {
      await expect(leaving(sp, w, who, instant, choice)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await check(sp);
      throw undo;
    }),
  ).rejects.toBe(undo);
}

async function nowAt(tx: WorldTx, instant: Temporal.Instant): Promise<ServerNow> {
  return fakeClock(instant).sample(tx);
}

/** The drops Home's open day lists for `user` at `instant`. */
async function homeDrops(tx: WorldTx, user: string, club: string, instant: Temporal.Instant): Promise<string[]> {
  const read = await readHome(tx, user, club, await nowAt(tx, instant));
  return read?.mode === "day" ? read.day.drops.map((card) => card.id) : [];
}

interface DropRow {
  state: string;
  ended_at: Temporal.Instant | null;
  updated_at: Temporal.Instant;
  version: number;
  pending_upload_id: string | null;
  reason: string | null;
  actor: string | null;
  removed_at: Temporal.Instant | null;
}

async function dropRow(tx: WorldTx, id: string): Promise<DropRow> {
  const [row] = await tx<DropRow[]>`
    SELECT d.state, d.ended_at, d.updated_at, d.version, d.pending_upload_id,
           r.reason, r.actor_interval_id AS actor, r.removed_at
      FROM app.drops d LEFT JOIN app.drop_removals r ON r.drop_id = d.id
     WHERE d.id = ${id}`;
  if (row === undefined) throw new Error(`no drop ${id}`);
  return row;
}

/**
 * The drop's values for `want`'s keys, held to them with `toEqual`: `toMatchObject` passes any two Temporal
 * instants (checked with vitest 5.0.5), so it would not see a wrong `ended_at` or `removed_at`.
 */
async function expectDrop(tx: WorldTx, id: string, want: Partial<DropRow>): Promise<void> {
  const row = await dropRow(tx, id);
  expect(Object.fromEntries(Object.keys(want).map((key) => [key, row[key as keyof DropRow]]))).toEqual(want);
}

/** What a drop withdrawn by `who`'s leave at `instant` looks like. */
function withdrawnBy(who: Member, instant: Temporal.Instant): Partial<DropRow> {
  return {
    state: "withdrawn",
    ended_at: instant,
    updated_at: instant,
    pending_upload_id: null,
    reason: "leave",
    actor: who.interval,
    removed_at: instant,
  };
}

const untouched: Partial<DropRow> = { state: "active", ended_at: null, reason: null };

async function counter(tx: WorldTx, day: string, interval: string) {
  const [row] = await tx<
    { committed_total: number; committed_external: number; reserved_total: number; reserved_external: number }[]
  >`
    SELECT committed_total, committed_external, reserved_total, reserved_external
      FROM app.contribution_counters WHERE occurrence_id = ${day} AND interval_id = ${interval}`;
  return row;
}

/** A live photo slot of `who`'s in `day`, held from `from` until `until`, counted as createReservation counts it. */
async function liveSlot(tx: WorldTx, w: World, who: Member, from: Date, until: Date, day = w.day): Promise<string> {
  const id = newId("rsv");
  await tx`
    INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id)
    VALUES (${day}, ${who.interval}, ${w.club}) ON CONFLICT DO NOTHING`;
  await tx`
    INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
    VALUES (${id}, ${day}, ${who.interval}, 'photo', ${randomUUID()}, ${from}, ${until})`;
  await tx`
    UPDATE app.contribution_counters SET reserved_total = reserved_total + 1
     WHERE occurrence_id = ${day} AND interval_id = ${who.interval}`;
  return id;
}

async function slotRow(tx: WorldTx, id: string) {
  const [row] = await tx<{ state: string; ended_at: Temporal.Instant | null }[]>`
    SELECT state, ended_at FROM app.reservations WHERE id = ${id}`;
  return row;
}

/** A day of Ben's in the world's club: Friday 13 November, still collecting on the evening of the 6th. */
async function bensFriday(tx: WorldTx, w: World): Promise<string> {
  const id = newId("occ");
  await tx`
    INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
    VALUES (${id}, ${w.club}, ${w.ben.interval}, ${w.version}, '2026-11-13', ${at("2026-11-13T07:00:00Z")},
            ${at("2026-11-14T01:00:00Z")}, ${AT.generated})`;
  return id;
}

/** `who`'s drop in `day` (the world's own day unless said), committed at `when` as createDrop commits one. */
async function dropIn(
  tx: WorldTx,
  w: World,
  who: Member,
  when: Date,
  day = w.day,
  media: "photo" | "external_video" = "photo",
) {
  return commitDrop(plain(tx), { ...w, day }, who, { at: when, media, caption: "A caption" });
}

describe("leaving with withdraw takes the leaver's drops out of every view (spec 22, T23, T24, T26; the audit's A3)", () => {
  it("withdraws Ben's photo and link before the reveal: one leave removal each, the slots given back, and no read shows them", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);
      const link = await dropIn(tx, w, w.ben, AT.added, w.day, "external_video");
      const cleos = await dropIn(tx, w, w.cleo, AT.added);
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(
        expect.objectContaining({ committed_total: 2, committed_external: 1 }),
      );

      const answer: Json = await leaving(tx, w, w.ben, EVENING, "withdraw");
      expect(answer).toEqual({ club_id: w.club, left_at: "2026-11-06T21:00:00Z", contributions: "withdraw" });

      await expectDrop(tx, photo, withdrawnBy(w.ben, EVENING));
      await expectDrop(tx, link, withdrawnBy(w.ben, EVENING));
      await expectDrop(tx, cleos, untouched);
      // Before the reveal each withdrawal gives its slot back (T18).
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(
        expect.objectContaining({ committed_total: 0, committed_external: 0 }),
      );
      // At 07:00 the day opens without them, for everyone who stays; the predicate gives nothing of them to anyone.
      for (const reader of [w.ana, w.cleo]) {
        expect(await homeDrops(tx, reader.user, w.club, REVEAL)).toEqual([cleos]);
        for (const drop of [photo, link]) {
          for (const what of ["caption", "media"] as const) {
            expect(await mayReadDrop(tx, reader.user, drop, what, await nowAt(tx, REVEAL))).toBe(false);
            expect(await mayReadDrop(tx, reader.user, drop, what, await nowAt(tx, at("2026-11-06T21:30:00Z")))).toBe(
              false,
            );
          }
        }
      }
    });
  });

  it("withdraws a drop in the opened day too, and gives back no slot after the reveal (T3, T18)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);
      const cleos = await dropIn(tx, w, w.cleo, AT.added);
      expect(await homeDrops(tx, w.ana.user, w.club, MORNING)).toEqual(expect.arrayContaining([photo, cleos]));

      await leaving(tx, w, w.ben, MORNING, "withdraw");

      await expectDrop(tx, photo, withdrawnBy(w.ben, MORNING));
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 1 }));
      const later = MORNING.add({ minutes: 5 });
      for (const reader of [w.ana, w.cleo]) {
        expect(await homeDrops(tx, reader.user, w.club, later)).toEqual([cleos]);
        expect(await mayReadDrop(tx, reader.user, photo, "media", await nowAt(tx, later))).toBe(false);
      }
    });
  });

  it("withdraws at the reveal's very instant as after it: no slot back, Ben's highlight cleared after the drop's end, and a slot lapsing then expired (T3, T18, T22)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);
      const link = await dropIn(tx, w, w.ben, AT.added, w.day, "external_video");
      await tx`
        INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
        VALUES (${w.day}, ${w.ben.interval}, ${photo}, 1, ${at("2026-11-06T20:20:00Z")})`;
      const slot = await liveSlot(tx, w, w.ben, new Date("2026-11-07T06:40:00Z"), new Date("2026-11-07T07:00:00Z"));

      await leaving(tx, w, w.ben, REVEAL, "withdraw");

      await expectDrop(tx, photo, withdrawnBy(w.ben, REVEAL));
      await expectDrop(tx, link, withdrawnBy(w.ben, REVEAL));
      const [highlight] = await tx<{ drop_id: string | null; version: number; updated_at: Temporal.Instant }[]>`
        SELECT drop_id, version, updated_at FROM app.highlights WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}`;
      expect(highlight).toEqual({ drop_id: null, version: 2, updated_at: REVEAL });
      expect(await slotRow(tx, slot)).toEqual({ state: "expired", ended_at: REVEAL });
      expect(await counter(tx, w.day, w.ben.interval)).toEqual({
        committed_total: 2,
        committed_external: 1,
        reserved_total: 0,
        reserved_external: 0,
      });
    });
  });

  it("gives Ben's slots back a microsecond before the reveal, and releases a slot that would lapse at it", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);
      const link = await dropIn(tx, w, w.ben, AT.added, w.day, "external_video");
      const slot = await liveSlot(tx, w, w.ben, new Date("2026-11-07T06:40:00Z"), new Date("2026-11-07T07:00:00Z"));
      const justBefore = REVEAL.subtract({ microseconds: 1 });

      await leaving(tx, w, w.ben, justBefore, "withdraw");

      await expectDrop(tx, photo, withdrawnBy(w.ben, justBefore));
      await expectDrop(tx, link, withdrawnBy(w.ben, justBefore));
      expect(await slotRow(tx, slot)).toEqual({ state: "released", ended_at: justBefore });
      expect(await counter(tx, w.day, w.ben.interval)).toEqual({
        committed_total: 0,
        committed_external: 0,
        reserved_total: 0,
        reserved_external: 0,
      });
    });
  });

  it("keeps Ben's drops for those who stay when Ben chooses keep, as before", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);

      await leaving(tx, w, w.ben, EVENING, "keep");

      await expectDrop(tx, photo, untouched);
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 1 }));
      expect(await homeDrops(tx, w.ana.user, w.club, REVEAL)).toEqual([photo]);
      expect(await mayReadDrop(tx, w.cleo.user, photo, "media", await nowAt(tx, REVEAL))).toBe(true);
    });
  });

  it("withdraws a held drop as well, clears Ben's highlight on a withdrawn one, and lets its pending replacement go (T22, T29)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const held = await dropIn(tx, w, w.ben, AT.added);
      const highlighted = await dropIn(tx, w, w.ben, AT.added);
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${at("2026-11-06T20:10:00Z")} WHERE id = ${held}`;
      await tx`
        INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
        VALUES (${w.day}, ${w.ben.interval}, ${highlighted}, 1, ${at("2026-11-06T20:20:00Z")})`;
      const replacement = newId("upl");
      await tx`
        INSERT INTO app.uploads (id, owner_user_id, purpose, replaces_drop_id, content_type, byte_size, object_key,
                                 created_at, expires_at)
        VALUES (${replacement}, ${w.ben.user}, 'replacement', ${highlighted}, 'image/jpeg', 1000, ${newId("uploads/raw")},
                ${at("2026-11-06T20:30:00Z")}, ${AT.close})`;
      await tx`
        UPDATE app.drops SET pending_upload_id = ${replacement}, updated_at = ${at("2026-11-06T20:30:00Z")}
         WHERE id = ${highlighted}`;

      await leaving(tx, w, w.ben, EVENING, "withdraw");

      await expectDrop(tx, held, withdrawnBy(w.ben, EVENING));
      await expectDrop(tx, highlighted, withdrawnBy(w.ben, EVENING));
      const [highlight] = await tx<{ drop_id: string | null; version: number; updated_at: Temporal.Instant }[]>`
        SELECT drop_id, version, updated_at FROM app.highlights WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}`;
      expect(highlight).toEqual({ drop_id: null, version: 2, updated_at: EVENING });
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 0 }));
    });
  });

  it("withdraws Ana's own drops on her Saturday, which her leave holds, and leaves Ben's drop for that day as it was (FQ63)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const anas = await dropIn(tx, w, w.ana, AT.added);
      const bens = await dropIn(tx, w, w.ben, AT.added);

      await leaving(tx, w, w.ana, EVENING, "withdraw");

      await expectDrop(tx, anas, withdrawnBy(w.ana, EVENING));
      await expectDrop(tx, bens, untouched);
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 1 }));
    });
  });

  it("withdraws Ben's drops in every day of the club, and nobody else's, nor Ben's in another club", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const friday = await bensFriday(tx, w);
      const saturday = await dropIn(tx, w, w.ben, AT.added);
      const ownDay = await dropIn(tx, w, w.ben, AT.added, friday);
      const anas = await dropIn(tx, w, w.ana, AT.added);
      const cleosForBen = await dropIn(tx, w, w.cleo, AT.added, friday);
      // Ben in a second club, with a drop there.
      const other = await newWorld(plain(tx), " two");
      const [elsewhere] = await joinByRoster(
        plain(tx),
        other.club,
        other.ana,
        [{ user: w.ben.user, label: "Ben two" }],
        AT.joined,
      );
      if (elsewhere === undefined) throw new Error("Ben joined no second club");
      const theirs = await dropIn(tx, other, { user: w.ben.user, interval: elsewhere }, AT.added);

      await leaving(tx, w, w.ben, EVENING, "withdraw");

      await expectDrop(tx, saturday, withdrawnBy(w.ben, EVENING));
      await expectDrop(tx, ownDay, withdrawnBy(w.ben, EVENING));
      expect(await counter(tx, friday, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 0 }));
      for (const kept of [anas, cleosForBen, theirs]) await expectDrop(tx, kept, untouched);
      expect(await counter(tx, friday, w.cleo.interval)).toEqual(expect.objectContaining({ committed_total: 1 }));
    });
  });

  it("leaves a drop Ben kept under an earlier membership of the club as it was (FQ142's default)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const earlier = await dropIn(tx, w, w.ben, AT.added);
      await leaving(tx, w, w.ben, at("2026-11-06T20:10:00Z"), "keep");
      const [again] = await joinByRoster(
        plain(tx),
        w.club,
        w.ana,
        [{ user: w.ben.user, label: "Ben" }],
        new Date("2026-11-06T20:20:00Z"),
      );
      if (again === undefined) throw new Error("Ben didn't rejoin");
      const rejoined = { user: w.ben.user, interval: again };
      const later = await dropIn(tx, w, rejoined, new Date("2026-11-06T20:30:00Z"));

      await leaving(tx, w, rejoined, EVENING, "withdraw");

      await expectDrop(tx, later, withdrawnBy(rejoined, EVENING));
      await expectDrop(tx, earlier, untouched);
    });
  });
});

describe("every leave gives back the leaver's live reservations (T18: no phantom slots)", () => {
  for (const choice of ["keep", "withdraw"] as const) {
    it(`releases Ben's live slots at the leave with ${choice}, settles a lapsed one as expired, and leaves a used one`, async () => {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const friday = await bensFriday(tx, w);
        const live = await liveSlot(tx, w, w.ben, new Date("2026-11-06T20:50:00Z"), new Date("2026-11-06T21:20:00Z"));
        const lapsed = await liveSlot(
          tx,
          w,
          w.ben,
          new Date("2026-11-06T20:00:00Z"),
          new Date("2026-11-06T20:30:00Z"),
          friday,
        );
        const liveFriday = await liveSlot(
          tx,
          w,
          w.ben,
          new Date("2026-11-06T20:55:00Z"),
          new Date("2026-11-06T21:25:00Z"),
          friday,
        );
        const used = await dropIn(tx, w, w.ben, AT.added);
        const [consumed] = await tx<{ id: string }[]>`SELECT id FROM app.reservations WHERE drop_id = ${used}`;
        const cleos = await liveSlot(tx, w, w.cleo, new Date("2026-11-06T20:50:00Z"), new Date("2026-11-06T21:20:00Z"));

        await leaving(tx, w, w.ben, EVENING, choice);

        expect(await slotRow(tx, live)).toEqual({ state: "released", ended_at: EVENING });
        expect(await slotRow(tx, liveFriday)).toEqual({ state: "released", ended_at: EVENING });
        expect(await slotRow(tx, lapsed)).toEqual({ state: "expired", ended_at: at("2026-11-06T20:30:00Z") });
        expect(await slotRow(tx, consumed?.id ?? "")).toEqual(expect.objectContaining({ state: "consumed" }));
        expect(await slotRow(tx, cleos)).toEqual({ state: "live", ended_at: null });
        expect(await counter(tx, w.day, w.ben.interval)).toEqual(
          expect.objectContaining({ reserved_total: 0, committed_total: choice === "keep" ? 1 : 0 }),
        );
        expect(await counter(tx, friday, w.ben.interval)).toEqual(expect.objectContaining({ reserved_total: 0 }));
        expect(await counter(tx, w.day, w.cleo.interval)).toEqual(expect.objectContaining({ reserved_total: 1 }));
      });
    });
  }
});

describe("the receipt, and a refused leave (T14, T19)", () => {
  it("answers the same leave again under its key with its first answer, and withdraws nothing more", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.ben, AT.added);
      const key = randomUUID();
      const first = await leaving(tx, w, w.ben, EVENING, "withdraw", key);
      const before = await dropRow(tx, photo);
      const again = await leaving(tx, w, w.ben, EVENING.add({ minutes: 1 }), "withdraw", key);
      expect(again).toEqual(first);
      expect(await dropRow(tx, photo)).toEqual(before);
      expect(await counter(tx, w.day, w.ben.interval)).toEqual(expect.objectContaining({ committed_total: 0 }));
    });
  });

  it("withdraws nothing for a leave refused: someone who was never in the club, or a former member asking again", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const photo = await dropIn(tx, w, w.cleo, AT.added);
      const bens = await dropIn(tx, w, w.ben, AT.added);
      const slot = await liveSlot(tx, w, w.ben, new Date("2026-11-06T20:50:00Z"), new Date("2026-11-06T21:20:00Z"));
      const dan = { user: w.dan.user, interval: "" };
      const nothingMoved = async (sp: WorldTx) => {
        await expectDrop(sp, photo, untouched);
        await expectDrop(sp, bens, untouched);
        expect(await slotRow(sp, slot)).toEqual({ state: "live", ended_at: null });
        expect(await counter(sp, w.day, w.ben.interval)).toEqual(
          expect.objectContaining({ committed_total: 1, reserved_total: 1 }),
        );
      };
      await refusedLeave(tx, w, dan, EVENING, "withdraw", nothingMoved);
      // Cleo leaves keeping her drops, then asks again with withdraw under a new key: the club is nothing to her now.
      await leaving(tx, w, w.cleo, EVENING, "keep");
      await refusedLeave(tx, w, w.cleo, EVENING.add({ minutes: 1 }), "withdraw", nothingMoved);
    });
  });

  it("takes Ben's key from Cleo as Cleo's own leave, since a key is the account's: hers keeps, and Ben's withdrawn drop stays so", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const bens = await dropIn(tx, w, w.ben, AT.added);
      const cleos = await dropIn(tx, w, w.cleo, AT.added);
      const key = randomUUID();
      await leaving(tx, w, w.ben, EVENING, "withdraw", key);

      const answer = await leaving(tx, w, w.cleo, EVENING.add({ minutes: 1 }), "keep", key);

      expect(answer).toEqual({ club_id: w.club, left_at: "2026-11-06T21:01:00Z", contributions: "keep" });
      await expectDrop(tx, bens, withdrawnBy(w.ben, EVENING));
      await expectDrop(tx, cleos, untouched);
    });
  });
});
