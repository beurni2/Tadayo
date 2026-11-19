/// <reference lib="esnext.temporal" />
// `createClub` and the club's own read against Postgres as `tadayo_app` (spec 03, 04, 32; G01-create,
// G05-club-details; T1, T2, T7, T9, T14, T19, T27, T33; FQ16, FQ19, FQ54, FQ80;
// packages/domain/src/clubs/create-club.ts and club.ts): a proposed club with its creator's membership at
// the clock's sample; the receipt, which makes a retry the first club and a changed request a conflict;
// an account whose deletion began meanwhile; and what each person gets of a club's information.
//
// A refused request throws `Refused`, which the route's transaction rolls back, so a request in these
// tests is a savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.

import { randomUUID } from "node:crypto";
import { clubDetailBody } from "@tadayo/api";
import { createClub, listClubs, readClub, Refused, type CreatedClub, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { invite, PHASES } from "../matrix.ts";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, leave, newId, newUnfinishedUser, newUser, newWorld } from "./world.ts";

const db = worldSql(8);
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;

/** The clock these tests sample: a whole number of microseconds, the finest Postgres keeps. */
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const clock = fakeClock(AT_FIRST);
/** The server's time for the reads, as only a clock makes it: Ana's Saturday collecting. */
const NOW = PHASES.collecting as ServerNow;

interface Sent {
  name?: string;
  timezone?: string;
  key?: string;
}

/** One request as the route runs it: its own unit of work, which a refusal rolls back. */
const request = (tx: WorldTx, userId: string, sent: Sent = {}): Promise<CreatedClub> =>
  tx.savepoint((sp) =>
    createClub(
      sp,
      clock,
      {
        userId,
        key: sent.key ?? randomUUID(),
        name: sent.name ?? "Sunday people",
        timezone: sent.timezone ?? "America/New_York",
      },
      clubDetailBody,
    ),
  );

/** What a refused request says, its code and its facts. Fails when the request wasn't refused. */
async function refusal(done: Promise<unknown>): Promise<{ code: string; facts: object }> {
  try {
    await done;
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
  throw new Error("the request wasn't refused");
}

interface Answer {
  club: { id: string; my_membership_id: string; [key: string]: unknown };
  [key: string]: unknown;
}
const answerOf = (made: CreatedClub) => made.answer as unknown as Answer;

const clubsOf = (tx: WorldTx, userId: string) =>
  tx<{ id: string }[]>`
    SELECT c.id FROM app.clubs c JOIN app.memberships m ON m.club_id = c.id WHERE m.user_id = ${userId}`;

const receiptsOf = (tx: WorldTx, userId: string) =>
  tx<{ state: string; response_status: number | null; response_body: unknown; created_at: Temporal.Instant }[]>`
    SELECT state, response_status, response_body, created_at
      FROM app.idempotency_receipts WHERE actor_user_id = ${userId} AND operation = 'createClub'`;

describe("making a club (spec 04, G01-create)", () => {
  it("makes a proposed club of one, its creator, at the server clock's sample, and answers it as its creator reads it (T1, T7)", async () => {
    clock.set(FIRST);
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const made = await request(tx, ben);
      const answer = answerOf(made);
      expect(made.at.equals(FIRST)).toBe(true);
      expect(answer).toEqual({
        club: {
          id: answer.club.id,
          name: "Sunday people",
          timezone: "America/New_York",
          my_membership_id: answer.club.my_membership_id,
          state: "proposed",
          member_count: 1,
        },
        roster_version: 0,
        can_propose: true,
      });
      // New ids that say nothing: a prefix and 128 random bits (T15).
      expect(answer.club.id).toMatch(/^club_[A-Za-z0-9_-]{22}$/);
      expect(answer.club.my_membership_id).toMatch(/^mem_[A-Za-z0-9_-]{22}$/);
      const [club] = await tx<
        {
          name: string;
          timezone: string;
          creator_interval_id: string;
          roster_version: number;
          created_at: Temporal.Instant;
          activated_at: Temporal.Instant | null;
          suspended_at: Temporal.Instant | null;
        }[]
      >`SELECT name, timezone, creator_interval_id, roster_version, created_at, activated_at, suspended_at
          FROM app.clubs WHERE id = ${answer.club.id}`;
      expect(club).toMatchObject({
        name: "Sunday people",
        timezone: "America/New_York",
        creator_interval_id: answer.club.my_membership_id,
        roster_version: 0,
        activated_at: null,
        suspended_at: null,
      });
      expect(club?.created_at.equals(FIRST)).toBe(true);
      const members = await tx<
        { interval_id: string; user_id: string; origin: string; state: string; joined_at: Temporal.Instant }[]
      >`SELECT interval_id, user_id, origin, state, joined_at FROM app.memberships WHERE club_id = ${answer.club.id}`;
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({
        interval_id: answer.club.my_membership_id,
        user_id: ben,
        origin: "creator",
        state: "active",
      });
      expect(members[0]?.joined_at.equals(FIRST)).toBe(true);
      // Nobody is proposed, and no week is opened, by making a club.
      const [others] = await tx<{ n: number }[]>`
        SELECT (SELECT count(*) FROM app.candidates WHERE club_id = ${answer.club.id})
             + (SELECT count(*) FROM app.roster_revisions WHERE club_id = ${answer.club.id})
             + (SELECT count(*) FROM app.schedule_proposals WHERE club_id = ${answer.club.id}) AS n`;
      expect(Number(others?.n)).toBe(0);
      // The schema's checks that wait for the commit hold (the club's creator is its own member).
      await tx`SET CONSTRAINTS ALL IMMEDIATE`;
    });
  });

  it("keeps the receipt with the club: completed, 201, at the same sample, and without the server's instant (T19)", async () => {
    clock.set(FIRST);
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const made = await request(tx, ben);
      const receipts = await receiptsOf(tx, ben);
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({ state: "completed", response_status: 201 });
      expect(receipts[0]?.created_at.equals(FIRST)).toBe(true);
      expect(receipts[0]?.response_body).toEqual(made.answer);
      expect(Object.keys(receipts[0]?.response_body as object).sort()).toEqual([
        "can_propose",
        "club",
        "roster_version",
      ]);
    });
  });

  it("stores the zone in the server's one spelling, whatever case it came in (T2, FQ19)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const answer = answerOf(await request(tx, ben, { timezone: "europe/LONDON" }));
      expect(answer.club["timezone"]).toBe("Europe/London");
      const [club] = await tx<{ timezone: string }[]>`SELECT timezone FROM app.clubs WHERE id = ${answer.club.id}`;
      expect(club?.timezone).toBe("Europe/London");
    });
  });

  it("refuses a zone the server can't resolve that reaches the command, naming the field, and leaves nothing", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      for (const timezone of ["Mars/Olympus_Mons", "+05:00", "T07:00[Europe/London]"]) {
        expect(await refusal(request(tx, ben, { timezone })), timezone).toEqual({
          code: "INVALID_REQUEST",
          facts: { field: "timezone" },
        });
      }
      expect(await clubsOf(tx, ben)).toEqual([]);
      expect(await receiptsOf(tx, ben)).toEqual([]);
    });
  });

  it("lists the new club for its creator, proposed, and reads it as it was answered", async () => {
    clock.set(FIRST);
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const answer = answerOf(await request(tx, ben));
      const listing = await listClubs(tx, ben, FIRST as ServerNow);
      expect(listing.clubs).toEqual([
        {
          id: answer.club.id,
          name: "Sunday people",
          timezone: "America/New_York",
          membershipId: answer.club.my_membership_id,
          state: "proposed",
          memberCount: 1,
          openDay: null,
          nextDay: null,
        },
      ]);
      const detail = await readClub(tx, ben, answer.club.id, FIRST as ServerNow);
      expect(detail && clubDetailBody(detail)).toEqual(answer);
    });
  });

  it("makes a club for each key, two of one name included: nothing is unique about a club but its id", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const one = answerOf(await request(tx, ben));
      const two = answerOf(await request(tx, ben));
      expect(one.club.id).not.toBe(two.club.id);
      expect(await clubsOf(tx, ben)).toHaveLength(2);
    });
  });
});

describe("one club per key (T19)", () => {
  it("answers a retry with the first club, as it was answered, makes no second, and gives the clock's sample of the retry (T1)", async () => {
    clock.set(FIRST);
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const key = randomUUID();
      const first = await request(tx, ben, { key });
      const later = FIRST.add({ hours: 30 });
      clock.set(later);
      const again = await request(tx, ben, { key });
      expect(again.answer).toEqual(first.answer);
      expect(JSON.stringify(again.answer)).toBe(JSON.stringify(first.answer));
      expect(again.at.equals(later)).toBe(true);
      expect(await clubsOf(tx, ben)).toHaveLength(1);
      expect(await receiptsOf(tx, ben)).toHaveLength(1);
    });
  });

  it("answers a retry with the first answer though the club has changed since", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const key = randomUUID();
      const first = await request(tx, ben, { key });
      await tx`UPDATE app.clubs SET roster_version = 3 WHERE id = ${answerOf(first).club.id}`;
      expect((await request(tx, ben, { key })).answer).toEqual(first.answer);
    });
  });

  it("refuses another name or another zone under a used key, and makes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const key = randomUUID();
      await request(tx, ben, { key });
      for (const sent of [{ name: "Kitchen table" }, { timezone: "Europe/London" }, { timezone: "america/new_york" }]) {
        expect(await refusal(request(tx, ben, { key, ...sent }))).toEqual({ code: "IDEMPOTENCY_CONFLICT", facts: {} });
      }
      expect(await clubsOf(tx, ben)).toHaveLength(1);
    });
  });

  it("keeps a key the caller's own: the same key from another account makes that account's club", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const ana = await newUser(plain(tx), "Ana");
      const key = randomUUID();
      const bens = answerOf(await request(tx, ben, { key }));
      const anas = answerOf(await request(tx, ana, { key, name: "Kitchen table" }));
      expect(anas.club.id).not.toBe(bens.club.id);
      expect(anas.club["name"]).toBe("Kitchen table");
    });
  });

  it("makes one club when the same request arrives eight times at once, and answers each alike", async () => {
    clock.set(FIRST);
    const ben = await db.begin((tx) => newUser(plain(tx), `Ben ${newId("n")}`));
    const key = randomUUID();
    const sent = { userId: ben, key, name: "Sunday people", timezone: "America/New_York" };
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => db.begin((tx) => createClub(tx, clock, sent, clubDetailBody))),
    );
    for (const one of answers) expect(one.answer).toEqual(answers[0]?.answer);
    const clubs = await db<{ id: string }[]>`
      SELECT c.id FROM app.clubs c JOIN app.memberships m ON m.club_id = c.id WHERE m.user_id = ${ben}`;
    expect(clubs).toHaveLength(1);
  });
});

describe("who may make a club (T27, FQ69)", () => {
  it("refuses an account whose deletion has begun since the gate read it, as no session, and leaves nothing", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.joined} WHERE id = ${ben}`;
      expect(await refusal(request(tx, ben))).toEqual({ code: "UNAUTHENTICATED", facts: {} });
      expect(await clubsOf(tx, ben)).toEqual([]);
      expect(await receiptsOf(tx, ben)).toEqual([]);
    });
  });

  it("refuses an account with no name yet, as the gate does", async () => {
    await rolledBack(db, async (tx) => {
      const mo = await newUnfinishedUser(plain(tx));
      expect(await refusal(request(tx, mo))).toEqual({ code: "PROFILE_INCOMPLETE", facts: {} });
      expect(await clubsOf(tx, mo)).toEqual([]);
    });
  });

  it("refuses an account id nobody has, as no session", async () => {
    await rolledBack(db, async (tx) => {
      // The receipt's own guard refuses an actor who doesn't exist before the command reads the account.
      await expect(request(tx, newId("acct"))).rejects.toThrow();
    });
  });
});

describe("a club's information for its members (G05-club-details; T9, T14, T33)", () => {
  it("gives a member the club, its state, its members counted, its next day, the roster's version and room to propose", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await tx`UPDATE app.clubs SET roster_version = 4 WHERE id = ${w.club}`;
      const detail = await readClub(tx, w.ben.user, w.club, NOW);
      expect(detail).toMatchObject({
        club: {
          id: w.club,
          name: "Saturday people",
          timezone: "Europe/London",
          membershipId: w.ben.interval,
          state: "active",
          memberCount: 3,
          openDay: null,
        },
        rosterVersion: 4,
        canPropose: true,
        openRevisionId: null,
      });
      expect(detail?.club.nextDay?.id).toBe(w.day);
      // Each member gets the same club, with their own interval.
      const anas = await readClub(tx, w.ana.user, w.club, NOW);
      expect(anas?.club.membershipId).toBe(w.ana.interval);
      expect({ ...anas, club: { ...anas?.club, membershipId: "" } }).toEqual({
        ...detail,
        club: { ...detail?.club, membershipId: "" },
      });
    });
  });

  it("gives the open day while it is open, at the instant asked (T1, T5)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const open = await readClub(tx, w.ben.user, w.club, PHASES.open as ServerNow);
      expect(open?.club.openDay?.id).toBe(w.day);
      expect(open?.club.nextDay).toBeNull();
    });
  });

  it("gives nothing to a stranger, a former member, someone invited, an account being deleted, or for an id nobody has (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await invite(tx, w, AT.opened);
      expect(await readClub(tx, w.dan.user, w.club, NOW)).toBeNull();
      expect(await readClub(tx, mo, w.club, NOW)).toBeNull();
      expect(await readClub(tx, w.ben.user, newId("club"), NOW)).toBeNull();
      for (const id of ["", "a b", "x".repeat(65), "club/../x"]) {
        expect(await readClub(tx, w.ben.user, id, NOW), id).toBeNull();
      }
      await leave(plain(tx), w.cleo, "Cleo", AT.opened);
      expect(await readClub(tx, w.cleo.user, w.club, NOW)).toBeNull();
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.opened} WHERE id = ${w.ben.user}`;
      expect(await readClub(tx, w.ben.user, w.club, NOW)).toBeNull();
      expect(await readClub(tx, w.ana.user, w.club, NOW)).not.toBeNull();
    });
  });

  it("gives nothing of a suspended club, to its members too (FQ80)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await tx`UPDATE app.clubs SET suspended_at = ${AT.opened} WHERE id = ${w.club}`;
      expect(await readClub(tx, w.ana.user, w.club, NOW)).toBeNull();
    });
  });

  it("says paused under two active members, and counts only the active ones (FQ16)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.cleo, "Cleo", AT.opened);
      expect((await readClub(tx, w.ana.user, w.club, NOW))?.club).toMatchObject({ state: "active", memberCount: 2 });
      await leave(plain(tx), w.ben, "Ben", AT.opened);
      expect((await readClub(tx, w.ana.user, w.club, NOW))?.club).toMatchObject({ state: "paused", memberCount: 1 });
    });
  });

  it("names the open roster revision, and counts its open candidate towards six, never who accepted (A01, T33)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // One person proposed and still open: three members and one candidate, so there is room.
      await invite(tx, w, AT.opened);
      const [revision] = await tx<{ id: string }[]>`
        SELECT id FROM app.roster_revisions WHERE club_id = ${w.club} AND state = 'open'`;
      const four = await readClub(tx, w.ana.user, w.club, NOW);
      expect(four).toMatchObject({ club: { memberCount: 3 }, canPropose: true, openRevisionId: revision?.id });
      // Five, and still room; six with the next, and the roster is full for every member alike.
      const propose = () => tx`
        INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
        VALUES (${newId("cand")}, ${w.club}, ${w.ana.interval}, ${AT.opened})`;
      await propose();
      expect((await readClub(tx, w.ana.user, w.club, NOW))?.canPropose).toBe(true);
      await propose();
      for (const member of [w.ana, w.ben]) {
        const full = await readClub(tx, member.user, w.club, NOW);
        expect(full).toMatchObject({ club: { memberCount: 3 }, canPropose: false, openRevisionId: revision?.id });
      }
      // A candidate who is no longer open frees the place.
      const [last] = await tx<{ id: string }[]>`
        SELECT k.id FROM app.candidates k
         WHERE k.club_id = ${w.club}
           AND NOT EXISTS (SELECT FROM app.roster_revision_candidates rc WHERE rc.candidate_id = k.id) LIMIT 1`;
      await tx`UPDATE app.candidates SET state = 'ended', ended_at = ${AT.opened} WHERE id = ${last?.id ?? ""}`;
      expect((await readClub(tx, w.ana.user, w.club, NOW))?.canPropose).toBe(true);
    });
  });
});
