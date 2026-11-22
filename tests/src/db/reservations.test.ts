/// <reference lib="esnext.temporal" />
// Holding a slot and giving it back, against Postgres as `tadayo_app` (spec 06, 11, 32; addendum 2; T1, T3,
// T4, T9, T14, T15, T17, T18, T19, T20; FQ50, FQ63, FQ112; ND01, ND02, ND04, Q09, Q10, Q12;
// docs/plans/api-b2-reservations.md, section 3; packages/domain/src/drops/reserve.ts and release.ts): each
// role's limits, the order of the refusals and the facts they carry, two phones racing for the last slot, the
// cutoff read after the locks, lapses, the receipt, and releases.
//
// The world is world.ts's: Ana's Saturday 7 November 2026 in a London club, which is on UTC then, revealed at
// 07:00Z; Ben and Cleo are its other members, and Dan has no club. Ana's next two Saturdays are added here, so
// a refusal has a next day to offer (T4).
//
// These tests were written beside the commands, from the plan's section 3, so none was seen to fail before its
// rule existed. The deliberate breakages, run at the PR's last head (the plan's section 5), are what shows they
// can fail.

import { randomUUID } from "node:crypto";
import { allowanceBody, releasedBody, reservationBody } from "@tadayo/api";
import {
  createReservation,
  isPlainLoopback,
  Refused,
  releaseReservation,
  type Allowance,
  type Json,
  type MediaClass,
  type RefusalFacts,
  type ReleasedAnswer,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { forgetCommittedDays, holding, waitingOn } from "./week-world.ts";
import { AT, commitDrop, joinByRoster, leave, newWorld, type Member, type World } from "./world.ts";

const db = worldSql(12);
const committedDays: string[] = [];
afterAll(async () => {
  await db.end();
  // The races below need their world committed, so their slots and days stay: their reservations and counters
  // name the days, so they go first, then every committed day.
  if (committedDays.length > 0) {
    if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
      throw new Error("reservations: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
    }
    const admin = adminSql();
    try {
      await admin.begin(async (tx) => {
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

interface Held {
  readonly status: 201;
  readonly body: {
    id: string;
    occurrence_id: string;
    media_class: MediaClass;
    expires_at: string;
    allowance: Json;
  };
  /** The answer as the receipt keeps it, byte for byte. */
  readonly text: string;
}
interface Refusal {
  readonly code: string;
  readonly facts: RefusalFacts;
}
type Outcome = Held | Refusal;

async function outcomeOf(running: Promise<Json>): Promise<Outcome> {
  try {
    const body = await running;
    return { status: 201, body: body as unknown as Held["body"], text: JSON.stringify(body) };
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

interface ReserveOptions {
  day?: string;
  key?: string;
  clock?: FakeClock;
}

/** `createReservation` as its route runs it, for `who`, on Ana's Saturday unless said. */
function reserve(tx: WorldTx, d: Days, who: { user: string }, media: MediaClass, options: ReserveOptions = {}) {
  return outcomeOf(
    tx.savepoint((sp) =>
      createReservation(
        sp,
        options.clock ?? clock,
        { userId: who.user, key: options.key ?? randomUUID(), occurrenceId: options.day ?? d.w.day, mediaClass: media },
        reservationBody,
      ),
    ),
  );
}

async function releasing(tx: WorldTx, who: { user: string }, reservationId: string): Promise<ReleasedAnswer | Refusal> {
  try {
    return await tx.savepoint((sp) => releaseReservation(sp, clock, { userId: who.user, reservationId }));
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
}

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

function held(outcome: Outcome): Held {
  if (!("status" in outcome)) throw new Error(`expected a slot held, not ${outcome.code}`);
  return outcome;
}

/** Expects `outcome` to be a slot held with the caller's allowance `expected`, lapsing at `expires`. */
function expectHeld(outcome: Outcome, expected: Allowance, expires?: Temporal.Instant): Held {
  const slot = held(outcome);
  expect(slot.body.allowance).toEqual(allowanceBody(expected));
  if (expires !== undefined) expect(slot.body.expires_at).toBe(expires.toString({ smallestUnit: "second" }));
  return slot;
}

/** Expects the role's refusal `code` on Ana's Saturday, with the caller's own `expected` allowance and Ana's next day. */
function expectLimit(outcome: Outcome, code: string, d: Days, expected: Allowance): void {
  expect("code" in outcome && outcome.code, JSON.stringify(outcome)).toBe(code);
  const { facts } = outcome as Refusal;
  expect(Object.keys(facts).sort()).toEqual(["allowance", "next_target", "target"]);
  expect(facts.target).toMatchObject({ id: d.w.day, phase: "collecting", localDate: "2026-11-07" });
  expect(facts.next_target).toMatchObject({ id: d.next, phase: "collecting", localDate: "2026-11-14" });
  expect(facts.allowance).toEqual(expected);
}

const bare = (code: string) => ({ code, facts: {} });

interface SlotRow {
  id: string;
  state: string;
  media_class: string;
  created_at: Temporal.Instant;
  expires_at: Temporal.Instant;
  ended_at: Temporal.Instant | null;
  drop_id: string | null;
}

const slotRow = async (tx: WorldTx, id: string): Promise<SlotRow | undefined> =>
  (
    await tx<SlotRow[]>`
      SELECT id, state, media_class, created_at, expires_at, ended_at, drop_id FROM app.reservations WHERE id = ${id}`
  )[0];

/** Expects each counter of `day` to count exactly its live reservations (T17, T18). */
async function expectBalanced(tx: WorldTx, day: string): Promise<void> {
  const rows = await tx<{ reserved_total: number; reserved_external: number; live: number; live_external: number }[]>`
    SELECT c.reserved_total, c.reserved_external,
           (SELECT pg_catalog.count(*)::int4 FROM app.reservations r
             WHERE r.occurrence_id = c.occurrence_id AND r.interval_id = c.interval_id AND r.state = 'live') AS live,
           (SELECT pg_catalog.count(*)::int4 FROM app.reservations r
             WHERE r.occurrence_id = c.occurrence_id AND r.interval_id = c.interval_id AND r.state = 'live'
               AND r.media_class = 'external_video') AS live_external
      FROM app.contribution_counters c WHERE c.occurrence_id = ${day}`;
  for (const row of rows) expect([row.reserved_total, row.reserved_external]).toEqual([row.live, row.live_external]);
}

const counterOf = async (tx: WorldTx, day: string, interval: string) =>
  (
    await tx<{ committed_total: number; reserved_total: number; reserved_external: number; total_limit: number }[]>`
      SELECT committed_total, reserved_total, reserved_external, total_limit FROM app.contribution_counters
       WHERE occurrence_id = ${day} AND interval_id = ${interval}`
  )[0];

describe("the star's allowance: six drops, two of them links at most (ND01, T17)", () => {
  it("holds six photos for Ana, and refuses a seventh with QUOTA_FULL, Ana's own counts and the next Saturday", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      for (let index = 1; index <= 6; index += 1) {
        const slot = expectHeld(await reserve(tx, d, d.w.ana, "photo"), allowance(STAR, { heldPhotos: index }));
        expect(slot.body).toMatchObject({ occurrence_id: d.w.day, media_class: "photo" });
      }
      expectLimit(await reserve(tx, d, d.w.ana, "photo"), "QUOTA_FULL", d, allowance(STAR, { heldPhotos: 6 }));
      expectLimit(await reserve(tx, d, d.w.ana, "external_video"), "QUOTA_FULL", d, allowance(STAR, { heldPhotos: 6 }));
      await expectBalanced(tx, d.w.day);
    });
  });

  it("refuses Ana's third link with EXTERNAL_LIMIT while the total is free, then holds four photos, then QUOTA_FULL", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      expectHeld(await reserve(tx, d, d.w.ana, "external_video"), allowance(STAR, { heldLinks: 1 }));
      expectHeld(await reserve(tx, d, d.w.ana, "external_video"), allowance(STAR, { heldLinks: 2 }));
      expectLimit(
        await reserve(tx, d, d.w.ana, "external_video"),
        "EXTERNAL_LIMIT",
        d,
        allowance(STAR, { heldLinks: 2 }),
      );
      for (let index = 1; index <= 4; index += 1) {
        expectHeld(await reserve(tx, d, d.w.ana, "photo"), allowance(STAR, { heldLinks: 2, heldPhotos: index }));
      }
      // Six in all, two of them links: QUOTA_FULL comes first for either kind.
      for (const media of ["photo", "external_video"] as const) {
        expectLimit(
          await reserve(tx, d, d.w.ana, media),
          "QUOTA_FULL",
          d,
          allowance(STAR, { heldLinks: 2, heldPhotos: 4 }),
        );
      }
      await expectBalanced(tx, d.w.day);
    });
  });

  it("counts Ana's committed drops with Ana's live slots", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      await commitDrop(plain(tx), d.w, d.w.ana, { media: "external_video" });
      await commitDrop(plain(tx), d.w, d.w.ana);
      expectHeld(
        await reserve(tx, d, d.w.ana, "external_video"),
        allowance(STAR, { links: 1, photos: 1, heldLinks: 1 }),
      );
      expectLimit(
        await reserve(tx, d, d.w.ana, "external_video"),
        "EXTERNAL_LIMIT",
        d,
        allowance(STAR, { links: 1, photos: 1, heldLinks: 1 }),
      );
    });
  });
});

describe("a friend's allowance: two photos and one link (ND02, T17; addendum 2)", () => {
  it("holds two photos for Ben, refuses a third with PHOTO_LIMIT while the link is free, holds the link, then QUOTA_FULL", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { heldPhotos: 1 }));
      expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { heldPhotos: 2 }));
      expectLimit(await reserve(tx, d, d.w.ben, "photo"), "PHOTO_LIMIT", d, allowance(FRIEND, { heldPhotos: 2 }));
      expectHeld(await reserve(tx, d, d.w.ben, "external_video"), allowance(FRIEND, { heldPhotos: 2, heldLinks: 1 }));
      for (const media of ["photo", "external_video"] as const) {
        expectLimit(
          await reserve(tx, d, d.w.ben, media),
          "QUOTA_FULL",
          d,
          allowance(FRIEND, { heldPhotos: 2, heldLinks: 1 }),
        );
      }
      await expectBalanced(tx, d.w.day);
    });
  });

  it("refuses a second link with EXTERNAL_LIMIT, with committed drops and live slots counted together", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      await commitDrop(plain(tx), d.w, d.w.cleo);
      expectHeld(await reserve(tx, d, d.w.cleo, "external_video"), allowance(FRIEND, { photos: 1, heldLinks: 1 }));
      expectLimit(
        await reserve(tx, d, d.w.cleo, "external_video"),
        "EXTERNAL_LIMIT",
        d,
        allowance(FRIEND, { photos: 1, heldLinks: 1 }),
      );
      expectHeld(
        await reserve(tx, d, d.w.cleo, "photo"),
        allowance(FRIEND, { photos: 1, heldLinks: 1, heldPhotos: 1 }),
      );
      expectLimit(
        await reserve(tx, d, d.w.cleo, "photo"),
        "QUOTA_FULL",
        d,
        allowance(FRIEND, { photos: 1, heldLinks: 1, heldPhotos: 1 }),
      );
    });
  });

  it("refuses a third photo after a committed link with QUOTA_FULL, never PHOTO_LIMIT, once all three are used", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      await commitDrop(plain(tx), d.w, d.w.ben, { media: "external_video" });
      await commitDrop(plain(tx), d.w, d.w.ben);
      expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { links: 1, photos: 1, heldPhotos: 1 }));
      expectLimit(
        await reserve(tx, d, d.w.ben, "photo"),
        "QUOTA_FULL",
        d,
        allowance(FRIEND, { links: 1, photos: 1, heldPhotos: 1 }),
      );
    });
  });

  it("gives each refusal the caller's own allowance, never another member's numbers (T15)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      for (let index = 0; index < 5; index += 1) await reserve(tx, d, d.w.ana, "photo");
      await reserve(tx, d, d.w.cleo, "external_video");
      await reserve(tx, d, d.w.ben, "photo");
      await reserve(tx, d, d.w.ben, "photo");
      const refused = (await reserve(tx, d, d.w.ben, "photo")) as Refusal;
      expect(refused.facts.allowance).toEqual(allowance(FRIEND, { heldPhotos: 2 }));
      const star = held(await reserve(tx, d, d.w.ana, "photo"));
      expect(star.body.allowance).toEqual(allowanceBody(allowance(STAR, { heldPhotos: 6 })));
    });
  });

  it("takes the star's own reservations for a paused club's announced day until it opens (FQ50)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      // Ben and Cleo leaving leaves Ana alone, which pauses the club; Ana's own announced day is still scheduled.
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T20:30:00Z"));
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T20:31:00Z"));
      expectHeld(await reserve(tx, d, d.w.ana, "photo"), allowance(STAR, { heldPhotos: 1 }));
      clock.set(REVEAL);
      expect(await reserve(tx, d, d.w.ana, "photo")).toMatchObject({ code: "OCCURRENCE_CLOSED" });
    });
  });
});

describe("one person's counter in one day, and nothing else's (ND04)", () => {
  it("keeps Ben's slots out of another day, another member's counter and another club", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const other = await days(tx, " 2");
      const [benThere] = await joinByRoster(
        plain(tx),
        other.w.club,
        other.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        AT.joined,
      );
      await reserve(tx, d, d.w.ben, "photo");
      await reserve(tx, d, d.w.ben, "external_video");
      expectHeld(await reserve(tx, d, d.w.ben, "photo", { day: d.next }), allowance(FRIEND, { heldPhotos: 1 }));
      expectHeld(await reserve(tx, d, d.w.cleo, "external_video"), allowance(FRIEND, { heldLinks: 1 }));
      expectHeld(await reserve(tx, other, d.w.ben, "external_video"), allowance(FRIEND, { heldLinks: 1 }));
      expect(await counterOf(tx, d.w.day, d.w.ben.interval)).toMatchObject({ reserved_total: 2, reserved_external: 1 });
      expect(await counterOf(tx, other.w.day, benThere ?? "")).toMatchObject({ reserved_total: 1, total_limit: 3 });
      await expectBalanced(tx, d.w.day);
      await expectBalanced(tx, other.w.day);
    });
  });

  it("starts a rejoined account's new interval with an empty allowance, the old interval's slots staying its own", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const first = held(await reserve(tx, d, d.w.ben, "photo"));
      await reserve(tx, d, d.w.ben, "photo");
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      const [again] = await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      const slot = expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { heldPhotos: 1 }));
      expect(await counterOf(tx, d.w.day, again ?? "")).toMatchObject({ reserved_total: 1 });
      expect(await counterOf(tx, d.w.day, d.w.ben.interval)).toMatchObject({ reserved_total: 2 });
      expect(await slotRow(tx, first.body.id)).toMatchObject({ state: "live" });
      expect(slot.body.id).not.toBe(first.body.id);
    });
  });
});

describe("nothing for anyone the day isn't theirs to add to (T9, T14; FQ63)", () => {
  it("gives the neutral not-found to Dan, a guessed day, an id that can't be one, and a former member", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      expect(await reserve(tx, d, d.w.dan, "photo")).toEqual(bare("NOT_FOUND"));
      expect(await reserve(tx, d, d.w.ben, "photo", { day: "occ_nobody" })).toEqual(bare("NOT_FOUND"));
      expect(await reserve(tx, d, d.w.ben, "photo", { day: "occ.nobody" })).toEqual(bare("NOT_FOUND"));
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T20:30:00Z"));
      expect(await reserve(tx, d, d.w.cleo, "photo")).toEqual(bare("NOT_FOUND"));
      expect(
        await tx`SELECT FROM app.idempotency_receipts WHERE actor_user_id IN (${d.w.dan.user}, ${d.w.cleo.user})`,
      ).toHaveLength(0);
    });
  });

  it("gives the neutral not-found for a suspended club, a suspended or cancelled day, and a deleting account", async () => {
    const denials: ((tx: WorldTx, d: Days) => Promise<unknown>)[] = [
      (tx, d) => tx`UPDATE app.clubs SET suspended_at = ${new Date("2026-11-06T20:30:00Z")} WHERE id = ${d.w.club}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${d.w.day}`,
      (tx, d) => tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${d.w.day}`,
      (tx, d) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${new Date("2026-11-06T20:30:00Z")}
            WHERE id = ${d.w.ben.user}`,
    ];
    for (const deny of denials) {
      await rolledBack(db, async (tx) => {
        const d = await days(tx);
        await deny(tx, d);
        expect(await reserve(tx, d, d.w.ben, "photo")).toEqual(bare("NOT_FOUND"));
      });
    }
  });

  it("answers MEMBERSHIP_CHANGED, with no facts, for a day whose star left or asked to delete before its reveal (FQ63)", async () => {
    const gone: ((tx: WorldTx, d: Days) => Promise<unknown>)[] = [
      (tx, d) => leave(plain(tx), d.w.ana, "Ana", new Date("2026-11-06T20:30:00Z")),
      (tx, d) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${new Date("2026-11-06T20:30:00Z")}
            WHERE id = ${d.w.ana.user}`,
    ];
    for (const leaveDay of gone) {
      await rolledBack(db, async (tx) => {
        const d = await days(tx);
        await leaveDay(tx, d);
        expect(await reserve(tx, d, d.w.ben, "photo")).toEqual(bare("MEMBERSHIP_CHANGED"));
        expect(await reserve(tx, d, d.w.cleo, "external_video")).toEqual(bare("MEMBERSHIP_CHANGED"));
        expect(await tx`SELECT FROM app.reservations WHERE occurrence_id = ${d.w.day}`).toHaveLength(0);
      });
    }
  });
});

describe("the cutoff is the reveal, read after the locks (T3, T4, T18)", () => {
  it("holds a slot a microsecond before the reveal until exactly the reveal, and refuses one at the reveal", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      clock.set(REVEAL.subtract({ microseconds: 1 }));
      const slot = expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { heldPhotos: 1 }), REVEAL);
      expect(await slotRow(tx, slot.body.id)).toMatchObject({
        expires_at: REVEAL,
        created_at: REVEAL.subtract({ microseconds: 1 }),
      });
      clock.set(REVEAL);
      const closed = (await reserve(tx, d, d.w.ben, "photo")) as Refusal;
      expect(closed.code).toBe("OCCURRENCE_CLOSED");
      expect(Object.keys(closed.facts).sort()).toEqual(["next_target", "target"]);
      expect(closed.facts.target).toMatchObject({ id: d.w.day, phase: "open" });
      expect(closed.facts.next_target).toMatchObject({ id: d.next, phase: "collecting" });
    });
  });

  it("holds a slot 30 minutes, and one taken within 30 minutes of the reveal only until the reveal", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      expectHeld(
        await reserve(tx, d, d.w.ben, "photo"),
        allowance(FRIEND, { heldPhotos: 1 }),
        EVENING.add({ minutes: 30 }),
      );
      clock.set(at("2026-11-07T06:45:00Z"));
      expectHeld(await reserve(tx, d, d.w.cleo, "photo"), allowance(FRIEND, { heldPhotos: 1 }), REVEAL);
    });
  });

  it("offers after the close the day as past and the star's next day, and skips a next day that has also opened", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      clock.set(CLOSE);
      expect(await reserve(tx, d, d.w.ben, "photo")).toMatchObject({
        code: "OCCURRENCE_CLOSED",
        facts: { target: { id: d.w.day, phase: "past" }, next_target: { id: d.next } },
      });
      clock.set(at("2026-11-14T08:00:00Z"));
      expect(await reserve(tx, d, d.w.ben, "photo")).toMatchObject({
        code: "OCCURRENCE_CLOSED",
        facts: { target: { id: d.w.day, phase: "past" }, next_target: { id: d.after } },
      });
    });
  });

  it(
    "refuses a reservation that waited for the club's row while the clock passed the reveal",
    { timeout: 30_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      clock.set(REVEAL.subtract({ seconds: 1 }));
      const hold = await holding(db, d.w.club);
      const waiting = outcomeOf(
        db.begin((tx) =>
          createReservation(
            tx as unknown as WorldTx,
            clock,
            { userId: d.w.ben.user, key: randomUUID(), occurrenceId: d.w.day, mediaClass: "photo" },
            reservationBody,
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
      expect(await db`SELECT FROM app.reservations WHERE occurrence_id = ${d.w.day}`).toHaveLength(0);
      expect(await db`SELECT FROM app.idempotency_receipts WHERE actor_user_id = ${d.w.ben.user}`).toHaveLength(0);
    },
  );
});

describe("two phones racing for the last slot are put in order by the counter (Q10, T17)", () => {
  it("makes the second wait for the first's commit, then sees its slot: PHOTO_LIMIT", { timeout: 30_000 }, async () => {
    const d = await db.begin((tx) => days(tx as unknown as WorldTx));
    committedDays.push(d.w.day, d.next, d.after);
    const run = (tx: WorldTx, key = randomUUID()) =>
      createReservation(
        tx,
        clock,
        { userId: d.w.ben.user, key, occurrenceId: d.w.day, mediaClass: "photo" },
        reservationBody,
      );
    await db.begin((tx) => run(tx as unknown as WorldTx));
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let ready: (pid: number) => void = () => undefined;
    const started = new Promise<number>((resolve) => (ready = resolve));
    const first = outcomeOf(
      db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
        const body = await run(tx);
        ready(row?.pid ?? 0);
        await gate;
        return body;
      }),
    );
    const pid = await started;
    const second = outcomeOf(db.begin((tx) => run(tx as unknown as WorldTx)));
    try {
      await waitingOn(db, pid, 1);
    } finally {
      open();
    }
    expectHeld(await first, allowance(FRIEND, { heldPhotos: 2 }));
    const refused = (await second) as Refusal;
    expect(refused.code).toBe("PHOTO_LIMIT");
    expect(refused.facts.allowance).toEqual(allowance(FRIEND, { heldPhotos: 2 }));
    await expectBalanced(db as unknown as WorldTx, d.w.day);
  });

  it(
    "holds never more than each role allows when ten requests arrive at once, refusing every other",
    { timeout: 60_000 },
    async () => {
      const d = await db.begin((tx) => days(tx as unknown as WorldTx));
      committedDays.push(d.w.day, d.next, d.after);
      const burst = (who: Member, media: readonly MediaClass[]) =>
        Promise.all(
          media.map((mediaClass) =>
            outcomeOf(
              db.begin((tx) =>
                createReservation(
                  tx as unknown as WorldTx,
                  clock,
                  { userId: who.user, key: randomUUID(), occurrenceId: d.w.day, mediaClass },
                  reservationBody,
                ),
              ),
            ),
          ),
        );
      const kinds = (outcomes: Outcome[]) => ({
        photos: outcomes.filter((o) => "status" in o && o.body.media_class === "photo").length,
        links: outcomes.filter((o) => "status" in o && o.body.media_class === "external_video").length,
        refused: outcomes.filter((o) => "code" in o).map((o) => o.code),
      });

      const friend = kinds(
        await burst(d.w.ben, [
          "photo",
          "external_video",
          "photo",
          "photo",
          "external_video",
          "photo",
          "photo",
          "external_video",
          "photo",
          "external_video",
        ]),
      );
      expect([friend.photos, friend.links]).toEqual([2, 1]);
      expect(friend.refused).toHaveLength(7);
      for (const code of friend.refused) expect(["PHOTO_LIMIT", "EXTERNAL_LIMIT", "QUOTA_FULL"]).toContain(code);

      const star = kinds(
        await burst(d.w.ana, [
          "photo",
          "external_video",
          "photo",
          "photo",
          "external_video",
          "photo",
          "photo",
          "external_video",
          "photo",
          "photo",
        ]),
      );
      expect(star.photos + star.links).toBe(6);
      expect(star.links).toBeLessThanOrEqual(2);
      for (const code of star.refused) expect(["EXTERNAL_LIMIT", "QUOTA_FULL"]).toContain(code);

      expect(await counterOf(db as unknown as WorldTx, d.w.day, d.w.ben.interval)).toMatchObject({
        reserved_total: 3,
        reserved_external: 1,
      });
      expect(await counterOf(db as unknown as WorldTx, d.w.day, d.w.ana.interval)).toMatchObject({ reserved_total: 6 });
      await expectBalanced(db as unknown as WorldTx, d.w.day);
    },
  );
});

describe("a slot lapses at its expires_at, with nothing to run (T18)", () => {
  it("frees a lapsed slot for the next request, marks it expired at its own expires_at, and keeps the counter true", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const first = held(await reserve(tx, d, d.w.ben, "photo"));
      clock.advance({ minutes: 1 });
      await reserve(tx, d, d.w.ben, "photo");
      expectLimit(await reserve(tx, d, d.w.ben, "photo"), "PHOTO_LIMIT", d, allowance(FRIEND, { heldPhotos: 2 }));
      // A microsecond before the first lapses, it still counts.
      clock.set(EVENING.add({ minutes: 30 }).subtract({ microseconds: 1 }));
      expectLimit(await reserve(tx, d, d.w.ben, "photo"), "PHOTO_LIMIT", d, allowance(FRIEND, { heldPhotos: 2 }));
      // Exactly at its expires_at it has lapsed.
      clock.set(EVENING.add({ minutes: 30 }));
      expectHeld(await reserve(tx, d, d.w.ben, "photo"), allowance(FRIEND, { heldPhotos: 2 }));
      expect(await slotRow(tx, first.body.id)).toMatchObject({
        state: "expired",
        ended_at: EVENING.add({ minutes: 30 }),
        expires_at: EVENING.add({ minutes: 30 }),
      });
      await expectBalanced(tx, d.w.day);
    });
  });
});

describe("one slot per Idempotency-Key, and its first answer on every retry (T19, Q12)", () => {
  it("returns the first answer byte for byte after a release, after midnight and after the cutoff", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      const first = held(await reserve(tx, d, d.w.ben, "photo", { key }));
      expect(held(await reserve(tx, d, d.w.ben, "photo", { key })).text).toBe(first.text);
      expect(await releasing(tx, d.w.ben, first.body.id)).toMatchObject({ state: "released" });
      expect(held(await reserve(tx, d, d.w.ben, "photo", { key })).text).toBe(first.text);
      clock.set(at("2026-11-07T00:00:00.5Z"));
      expect(held(await reserve(tx, d, d.w.ben, "photo", { key })).text).toBe(first.text);
      clock.set(REVEAL.add({ hours: 1 }));
      expect(held(await reserve(tx, d, d.w.ben, "photo", { key })).text).toBe(first.text);
      expect(await tx`SELECT FROM app.reservations WHERE interval_id = ${d.w.ben.interval}`).toHaveLength(1);
    });
  });

  it("refuses another body or another day under the same key with IDEMPOTENCY_CONFLICT", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      held(await reserve(tx, d, d.w.ben, "photo", { key }));
      expect(await reserve(tx, d, d.w.ben, "external_video", { key })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await reserve(tx, d, d.w.ben, "photo", { key, day: d.next })).toEqual(bare("IDEMPOTENCY_CONFLICT"));
      expect(await tx`SELECT FROM app.reservations WHERE interval_id = ${d.w.ben.interval}`).toHaveLength(1);
    });
  });

  it("leaves no receipt for a refusal, so the same key can be tried again once a slot is free", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const first = held(await reserve(tx, d, d.w.ben, "photo"));
      await reserve(tx, d, d.w.ben, "photo");
      const key = randomUUID();
      expect(await reserve(tx, d, d.w.ben, "photo", { key })).toMatchObject({ code: "PHOTO_LIMIT" });
      expect(await tx`SELECT FROM app.idempotency_receipts WHERE idempotency_key = ${key}`).toHaveLength(0);
      await releasing(tx, d.w.ben, first.body.id);
      expectHeld(await reserve(tx, d, d.w.ben, "photo", { key }), allowance(FRIEND, { heldPhotos: 2 }));
    });
  });

  it("names nothing to a rejoined account under a key its earlier interval used (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const key = randomUUID();
      held(await reserve(tx, d, d.w.ben, "photo", { key }));
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await reserve(tx, d, d.w.ben, "photo", { key })).toEqual(bare("NOT_FOUND"));
      expect(await reserve(tx, d, d.w.ben, "external_video", { key })).toEqual(bare("NOT_FOUND"));
    });
  });
});

describe("giving a slot back (T15, T18, T20)", () => {
  it("releases a live slot, off the counts, with the caller's allowance, and answers the same again", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const photo = held(await reserve(tx, d, d.w.ben, "photo"));
      await reserve(tx, d, d.w.ben, "external_video");
      clock.advance({ minutes: 5 });
      const released = await releasing(tx, d.w.ben, photo.body.id);
      expect(released).toEqual({
        id: photo.body.id,
        state: "released",
        dropId: null,
        allowance: allowance(FRIEND, { heldLinks: 1 }),
      });
      expect(await slotRow(tx, photo.body.id)).toMatchObject({
        state: "released",
        ended_at: EVENING.add({ minutes: 5 }),
      });
      clock.advance({ minutes: 1 });
      expect(await releasing(tx, d.w.ben, photo.body.id)).toEqual(released);
      expect(releasedBody(released as ReleasedAnswer)).toEqual({
        id: photo.body.id,
        state: "released",
        allowance: allowanceBody(allowance(FRIEND, { heldLinks: 1 })),
      });
      await expectBalanced(tx, d.w.day);
    });
  });

  it("answers expired for a slot that has lapsed, and consumed with the caller's own drop for one a commit used", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const slot = held(await reserve(tx, d, d.w.ben, "photo"));
      clock.advance({ minutes: 30 });
      expect(await releasing(tx, d.w.ben, slot.body.id)).toEqual({
        id: slot.body.id,
        state: "expired",
        dropId: null,
        allowance: allowance(FRIEND),
      });
      const drop = await commitDrop(plain(tx), d.w, d.w.ben, { at: new Date("2026-11-06T21:40:00Z") });
      const [used] = await tx<{ id: string }[]>`SELECT id FROM app.reservations WHERE drop_id = ${drop}`;
      expect(await releasing(tx, d.w.ben, used?.id ?? "")).toEqual({
        id: used?.id,
        state: "consumed",
        dropId: drop,
        allowance: allowance(FRIEND, { photos: 1 }),
      });
      await expectBalanced(tx, d.w.day);
    });
  });

  it("gives back a slot in a day whose star has gone, and after the reveal answers the slot as lapsed", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const first = held(await reserve(tx, d, d.w.ben, "photo"));
      const second = held(await reserve(tx, d, d.w.cleo, "photo"));
      await leave(plain(tx), d.w.ana, "Ana", new Date("2026-11-06T21:01:00Z"));
      expect(await releasing(tx, d.w.ben, first.body.id)).toMatchObject({ state: "released" });
      clock.set(REVEAL.add({ minutes: 1 }));
      expect(await releasing(tx, d.w.cleo, second.body.id)).toMatchObject({ state: "expired" });
    });
  });

  it("gives the neutral not-found for another member's slot, an earlier interval's, a former member's and a guessed id", async () => {
    await rolledBack(db, async (tx) => {
      const d = await days(tx);
      const bens = held(await reserve(tx, d, d.w.ben, "photo"));
      const cleos = held(await reserve(tx, d, d.w.cleo, "photo"));
      for (const who of [d.w.cleo, d.w.ana, d.w.dan]) {
        expect(await releasing(tx, who, bens.body.id)).toEqual(bare("NOT_FOUND"));
      }
      expect(await releasing(tx, d.w.ben, "rsv_nobody")).toEqual(bare("NOT_FOUND"));
      expect(await releasing(tx, d.w.ben, "rsv.nobody")).toEqual(bare("NOT_FOUND"));
      await leave(plain(tx), d.w.cleo, "Cleo", new Date("2026-11-06T21:05:00Z"));
      expect(await releasing(tx, d.w.cleo, cleos.body.id)).toEqual(bare("NOT_FOUND"));
      await leave(plain(tx), d.w.ben, "Ben", new Date("2026-11-06T21:05:00Z"));
      await joinByRoster(
        plain(tx),
        d.w.club,
        d.w.ana,
        [{ user: d.w.ben.user, label: "Ben" }],
        new Date("2026-11-06T21:10:00Z"),
      );
      clock.set(at("2026-11-06T21:15:00Z"));
      expect(await releasing(tx, d.w.ben, bens.body.id)).toEqual(bare("NOT_FOUND"));
      expect(await slotRow(tx, bens.body.id)).toMatchObject({ state: "live" });
      expect(await slotRow(tx, cleos.body.id)).toMatchObject({ state: "live" });
    });
  });
});
