/// <reference lib="esnext.temporal" />
// A club's first days against Postgres as `tadayo_app` (spec 04, 05; T1, T6, T9, T14, T19, T33, T49, T55;
// FQ46, FQ48, FQ55, FQ57, FQ79, FQ99, FQ100; the contract's `getSchedule`, `chooseScheduleDays` and
// `confirmScheduleDays`; packages/domain/src/schedule/): opened as B1's activation will open them, read by
// each member, chosen and confirmed, and applied on the last confirmation. The refusals come in the
// contract's order, each from a state that would also earn a later one; a retry under its key is the first
// answer as it was; and two members at the same day at once are in one order, the club's row's.
//
// A refused request throws `Refused`, which the route's transaction rolls back, so a request in these
// tests is a savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.
// After each request the test runs the checks Postgres keeps for COMMIT, so the migration's deferred
// guards judge every change a command makes.

import { randomUUID } from "node:crypto";
import {
  activeMember,
  chooseScheduleDays,
  confirmScheduleDays,
  daysByClub,
  openFirstDays,
  proposedWeek,
  readSchedule,
  Refused,
  type Json,
  type ProposalAnswer,
  type ScheduleSight,
  type SlotAnswer,
  type Weekday,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, checkAsAtCommit, joinByRoster, leave, newId, newUser } from "./world.ts";

const db = worldSql(8);
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;

/** Sunday people's names, in the order they joined (the contract's fixtures). */
const NAMES = ["Ben", "Maya", "Alex", "Sam", "Debby", "Nina"] as const;

/** Monday 2 November 2026, 9 AM in London: the club's first local date is that Monday. */
const OPENED = "2026-11-02T09:00:00Z";
/** Wednesday 4 November 2026, 9 AM in London, with microseconds, the finest Postgres keeps. */
const CONFIRMED = "2026-11-04T09:00:00.123456Z";
/** The first dates of days confirmed at CONFIRMED in London (FQ79): Thursday 5's 7 AM is only 22 hours on. */
const FIRST: Record<Weekday, string> = {
  monday: "2026-11-09",
  tuesday: "2026-11-10",
  wednesday: "2026-11-11",
  thursday: "2026-11-12",
  friday: "2026-11-06",
  saturday: "2026-11-07",
};

interface Club {
  club: string;
  /** The members' accounts and intervals, in the order they joined. */
  users: string[];
  members: string[];
}

interface FirstDays extends Club {
  proposal: string;
  version: string;
}

/** An activated club of `count`, each member joined a minute after the one before, with no schedule yet. */
async function clubOf(tx: WorldTx, count: number, timezone = "Europe/London"): Promise<Club> {
  const users: string[] = [];
  for (let index = 0; index < count; index += 1) users.push(await newUser(plain(tx), NAMES[index] ?? "Zed"));
  const [creator, ...others] = users;
  if (creator === undefined) throw new Error("clubOf: no creator");
  const club = newId("club");
  const first = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, 'Sunday people', ${timezone}, ${first}, ${AT.created})`;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${first}, ${club}, ${creator}, 'creator', ${AT.created})`;
  const members = [first];
  for (const [index, user] of others.entries()) {
    const [joined] = await joinByRoster(
      plain(tx),
      club,
      { user: creator, interval: first },
      [{ user, label: NAMES[index + 1] ?? "Zed" }],
      new Date(AT.joined.getTime() + index * 60_000),
    );
    if (joined === undefined) throw new Error("clubOf: nobody joined");
    members.push(joined);
  }
  await tx`UPDATE app.clubs SET activated_at = ${new Date(AT.joined.getTime() + 3_600_000)} WHERE id = ${club}`;
  return { club, users, members };
}

/** A club of `count` whose first days have just been opened at `clock`'s time. */
async function firstDays(tx: WorldTx, clock: FakeClock, count: number, timezone?: string): Promise<FirstDays> {
  const made = await clubOf(tx, count, timezone);
  const opened = await openFirstDays(tx, clock, made.club);
  await checkAsAtCommit(plain(tx));
  return { ...made, proposal: opened.proposalId, version: opened.scheduleVersionId };
}

/** The command's answer as the domain made it: these tests read the domain's own shape. */
const render = (proposal: ProposalAnswer): Json => JSON.parse(JSON.stringify(proposal)) as Json;

interface Options {
  key?: string;
  version?: number;
  proposal?: string;
}

type Command = typeof chooseScheduleDays;

/** One request as the route runs it: its own unit of work, which a refusal rolls back. */
async function request(
  command: Command,
  tx: WorldTx,
  clock: FakeClock,
  w: FirstDays,
  who: number | string,
  weekdays: readonly Weekday[],
  options: Options = {},
): Promise<ProposalAnswer> {
  const userId = typeof who === "string" ? who : w.users[who];
  if (userId === undefined) throw new Error("request: no such member");
  const answer = await tx.savepoint((sp) =>
    command(
      sp,
      clock,
      {
        userId,
        key: options.key ?? randomUUID(),
        proposalId: options.proposal ?? w.proposal,
        expectedVersion: options.version ?? 1,
        weekdays,
      },
      render,
    ),
  );
  await checkAsAtCommit(plain(tx));
  return answer as unknown as ProposalAnswer;
}

const choose = (
  tx: WorldTx,
  clock: FakeClock,
  w: FirstDays,
  who: number | string,
  days: readonly Weekday[],
  options?: Options,
) => request(chooseScheduleDays, tx, clock, w, who, days, options);
const confirm = (
  tx: WorldTx,
  clock: FakeClock,
  w: FirstDays,
  who: number | string,
  days: readonly Weekday[],
  options?: Options,
) => request(confirmScheduleDays, tx, clock, w, who, days, options);

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

/** The week as member `who` reads it now. */
async function sees(tx: WorldTx, clock: FakeClock, w: Club, who: number | string): Promise<ScheduleSight | null> {
  const userId = typeof who === "string" ? who : w.users[who];
  if (userId === undefined) throw new Error("sees: no such member");
  return readSchedule(tx, userId, w.club, await clock.sample(tx));
}

async function proposalFor(tx: WorldTx, clock: FakeClock, w: Club, who: number): Promise<ProposalAnswer> {
  const proposal = (await sees(tx, clock, w, who))?.proposal;
  if (proposal === null || proposal === undefined) throw new Error("the member sees no proposal");
  return proposal;
}

function slot(proposal: ProposalAnswer, weekday: Weekday): SlotAnswer {
  const found = proposal.slots.find((each) => each.weekday === weekday);
  if (found === undefined) throw new Error(`no ${weekday} in the proposal`);
  return found;
}

/** The contract's Person the tests expect of member `who`: nobody here has an avatar. */
const person = (w: Club, who: number) => ({
  membershipId: w.members[who],
  displayName: NAMES[who],
  avatarVersion: null,
});

interface ProposalRow {
  state: string;
  version: number;
  closed_at: Temporal.Instant | null;
  effective_from: string;
  days_per_member: number;
}
async function proposalRow(tx: WorldTx, id: string): Promise<ProposalRow> {
  const [row] = await tx<ProposalRow[]>`
    SELECT state, version, closed_at, effective_from::text AS effective_from, days_per_member
      FROM app.schedule_proposals WHERE id = ${id}`;
  if (row === undefined) throw new Error("no such proposal");
  return row;
}

interface AssignmentRow {
  weekday: string;
  star_interval_id: string;
  first_date: string;
  confirmed_at: Temporal.Instant;
}
const assignments = (tx: WorldTx, w: FirstDays) =>
  tx<AssignmentRow[]>`
    SELECT weekday::text AS weekday, star_interval_id, first_date::text AS first_date, confirmed_at
      FROM app.schedule_assignments WHERE schedule_version_id = ${w.version} ORDER BY first_date`;

const receipts = (tx: WorldTx, w: Club, who: number) =>
  tx<{ operation: string; state: string }[]>`
    SELECT operation, state FROM app.idempotency_receipts WHERE actor_user_id = ${w.users[who] ?? ""}`;

/**
 * Every schedule row of the club, as text, each with its `ctid`, which moves when a row is written again
 * even with the same values: what a refused request, or one that changes nothing, must leave as it was.
 */
async function everything(tx: WorldTx, w: FirstDays): Promise<string> {
  const rows = await tx<{ row: string }[]>`
    SELECT 'proposal ' || t.ctid::text || ' ' || pg_catalog.to_jsonb(t)::text AS row FROM app.schedule_proposals t WHERE club_id = ${w.club}
    UNION ALL
    SELECT 'member ' || t.ctid::text || ' ' || pg_catalog.to_jsonb(t)::text FROM app.schedule_proposal_members t WHERE club_id = ${w.club}
    UNION ALL
    SELECT 'day ' || t.ctid::text || ' ' || pg_catalog.to_jsonb(t)::text FROM app.schedule_proposal_days t WHERE proposal_id = ${w.proposal}
    UNION ALL
    SELECT 'assignment ' || t.ctid::text || ' ' || pg_catalog.to_jsonb(t)::text FROM app.schedule_assignments t WHERE club_id = ${w.club}
    ORDER BY 1`;
  return rows.map((each) => each.row).join("\n");
}

describe("opening the first days (spec 04, 05; FQ48)", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    it(`proposes spec 05's week to a club of ${String(count)}: each member holds their days, in the order they joined, at version 1`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await firstDays(tx, clock, count);
        const perMember = count <= 3 ? 2 : 1;
        expect(await proposalRow(tx, w.proposal)).toEqual({
          state: "open",
          version: 1,
          closed_at: null,
          effective_from: "2026-11-02",
          days_per_member: perMember,
        });
        const week = proposedWeek(count);
        for (let who = 0; who < count; who += 1) {
          const sight = await sees(tx, clock, w, who);
          // Nobody has confirmed, so no schedule is in force yet (the contract's `current`).
          expect(sight?.current).toBeNull();
          expect(sight?.club).toEqual({
            id: w.club,
            name: "Sunday people",
            timezone: "Europe/London",
            membershipId: w.members[who],
          });
          const proposal = sight?.proposal;
          expect(proposal).toMatchObject({
            id: w.proposal,
            version: 1,
            reason: "activation",
            effectiveFrom: "2026-11-02",
            daysPerMember: perMember,
            myDays: week[who],
            myState: "choosing",
            state: "open",
          });
          expect(proposal?.slots.map((each) => each.weekday)).toEqual([
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ]);
          for (const each of proposal?.slots ?? []) {
            const holder = week.findIndex((days) => days.includes(each.weekday));
            if (holder === who) expect(each).toEqual({ weekday: each.weekday, state: "yours", suggested: true });
            else if (holder === -1)
              expect(each).toEqual({ weekday: each.weekday, state: "available", suggested: false });
            else {
              expect(each).toEqual({
                weekday: each.weekday,
                state: "available",
                heldBy: person(w, holder),
                suggested: false,
              });
            }
          }
        }
      });
    });
  }

  it("takes the club's first local date from the server clock's sample in the club's zone (T1, T2)", async () => {
    await rolledBack(db, async (tx) => {
      // 11:30 UTC on Monday 2 November is already Tuesday 3 in Auckland.
      const clock = fakeClock("2026-11-02T11:30:00Z");
      const w = await firstDays(tx, clock, 4, "Pacific/Auckland");
      expect((await proposalRow(tx, w.proposal)).effective_from).toBe("2026-11-03");
      const [version] = await tx<{ effective_from: string; created_at: Temporal.Instant }[]>`
        SELECT effective_from::text AS effective_from, created_at FROM app.schedule_versions WHERE id = ${w.version}`;
      expect(version?.effective_from).toBe("2026-11-03");
      expect(version?.created_at.equals(Temporal.Instant.from("2026-11-02T11:30:00Z"))).toBe(true);
    });
  });

  it("opens them once: a second opening, a club of one and a club that isn't there are the caller's bugs, and write nothing", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const before = await everything(tx, w);
      await expect(tx.savepoint((sp) => openFirstDays(sp, clock, w.club))).rejects.toThrow(/opened once/);
      expect(await everything(tx, w)).toBe(before);
      const alone = await clubOf(tx, 1);
      await expect(tx.savepoint((sp) => openFirstDays(sp, clock, alone.club))).rejects.toThrow(/two to six members/);
      await expect(tx.savepoint((sp) => openFirstDays(sp, clock, newId("club")))).rejects.toThrow(/no such club/);
      const [none] = await tx<{ versions: number }[]>`
        SELECT pg_catalog.count(*)::int AS versions FROM app.schedule_versions WHERE club_id = ${alone.club}`;
      expect(none?.versions).toBe(0);
    });
  });

  it("leaves out a member who has left before the opening, and counts the club by who is still in it", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const made = await clubOf(tx, 4);
      const gone = { user: made.users[1] ?? "", interval: made.members[1] ?? "" };
      await leave(plain(tx), gone, "Maya", AT.generated);
      const opened = await openFirstDays(tx, clock, made.club);
      await checkAsAtCommit(plain(tx));
      const w = { ...made, proposal: opened.proposalId, version: opened.scheduleVersionId };
      // Three members: two days each, Ben Monday and Thursday, Alex Tuesday and Friday, Sam Wednesday and Saturday.
      expect((await proposalRow(tx, w.proposal)).days_per_member).toBe(2);
      expect((await proposalFor(tx, clock, w, 0)).myDays).toEqual(["monday", "thursday"]);
      expect((await proposalFor(tx, clock, w, 2)).myDays).toEqual(["tuesday", "friday"]);
      expect((await proposalFor(tx, clock, w, 3)).myDays).toEqual(["wednesday", "saturday"]);
      expect(await sees(tx, clock, w, 1)).toBeNull();
    });
  });
});

describe("who gets the week (T9, T14; FQ80, FQ100)", () => {
  it("gives a stranger, a former member, an account being deleted, a suspended club and a guessed id the same nothing, as Home's days do", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const stranger = await newUser(plain(tx), "Zed");
      const now = await clock.sample(tx);
      /** Whether Home's day choice lists the club for `user`: the same three conditions, in its own statement. */
      const home = async (user: string) => {
        const rows = await tx`SELECT d.club_id FROM (${daysByClub(tx, user, now)}) d WHERE d.club_id = ${w.club}`;
        return rows.length === 1;
      };
      const both = async (user: string) => ({
        member: await activeMember(tx, user, w.club),
        week: (await sees(tx, clock, w, user)) !== null,
        home: await home(user),
      });
      expect(await both(w.users[0] ?? "")).toEqual({ member: w.members[0], week: true, home: true });
      expect(await both(stranger)).toEqual({ member: null, week: false, home: false });
      expect(await activeMember(tx, w.users[0] ?? "", newId("club"))).toBeNull();
      expect(await activeMember(tx, w.users[0] ?? "", "not an id")).toBeNull();
      expect(await readSchedule(tx, w.users[0] ?? "", "not an id", now)).toBeNull();

      await leave(plain(tx), { user: w.users[1] ?? "", interval: w.members[1] ?? "" }, "Maya", AT.generated);
      expect(await both(w.users[1] ?? "")).toEqual({ member: null, week: false, home: false });

      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.generated} WHERE id = ${w.users[2] ?? ""}`;
      expect(await both(w.users[2] ?? "")).toEqual({ member: null, week: false, home: false });

      await tx`UPDATE app.clubs SET suspended_at = ${AT.generated} WHERE id = ${w.club}`;
      expect(await both(w.users[0] ?? "")).toEqual({ member: null, week: false, home: false });
    });
  });

  it("gives a member who joined after the first days were opened the schedule in force alone, never the proposal (FQ100)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const late = await newUser(plain(tx), "Debby");
      await joinByRoster(
        plain(tx),
        w.club,
        { user: w.users[0] ?? "", interval: w.members[0] ?? "" },
        [{ user: late, label: "Debby" }],
        AT.generated,
      );
      // Ben and Maya contest Monday: the late joiner sees no proposal, so no Contested either (FQ46, FQ100).
      await choose(tx, clock, w, 1, ["monday"]);
      expect(await sees(tx, clock, w, late)).toMatchObject({ current: null, proposal: null });
      clock.set(Temporal.Instant.from(CONFIRMED));
      await confirm(tx, clock, w, 2, ["wednesday"]);
      const sight = await sees(tx, clock, w, late);
      expect(sight?.proposal).toBeNull();
      expect(sight?.current).toEqual({
        effectiveFrom: "2026-11-02",
        assignments: [{ weekday: "wednesday", person: person(w, 2) }],
      });
      // And the proposal's commands answer them as they answer a stranger (the contract's first refusal).
      expect(await refusal(choose(tx, clock, w, late, ["friday"]))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(await refusal(confirm(tx, clock, w, late, ["friday"]))).toEqual({ code: "NOT_FOUND", facts: {} });
    });
  });
});

describe("choosing days (FQ46, FQ48, FQ55; T33)", () => {
  it("moves the caller's hold: the proposed day stays marked as proposed, the new one is theirs, and the version stays", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      // Ben, proposed Monday, chooses Friday, which nobody holds in a club of four.
      const answer = await choose(tx, clock, w, 0, ["friday"]);
      expect(answer).toMatchObject({ version: 1, myDays: ["friday"], myState: "choosing", state: "open" });
      expect(slot(answer, "monday")).toEqual({ weekday: "monday", state: "available", suggested: true });
      expect(slot(answer, "friday")).toEqual({ weekday: "friday", state: "yours", suggested: false });
      expect(slot(answer, "tuesday")).toEqual({
        weekday: "tuesday",
        state: "available",
        heldBy: person(w, 1),
        suggested: false,
      });
      // The answer is what the read gives the caller, and nobody else is told Monday was proposed for Ben.
      expect(await proposalFor(tx, clock, w, 0)).toEqual(answer);
      const maya = await proposalFor(tx, clock, w, 1);
      expect(slot(maya, "monday")).toEqual({ weekday: "monday", state: "available", suggested: false });
      expect(slot(maya, "friday")).toEqual({
        weekday: "friday",
        state: "available",
        heldBy: person(w, 0),
        suggested: false,
      });
      expect((await proposalRow(tx, w.proposal)).version).toBe(1);
    });
  });

  it("writes nothing for a choice of the days the caller already holds, and still answers", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const before = await everything(tx, w);
      const answer = await choose(tx, clock, w, 0, ["monday"]);
      expect(answer.myDays).toEqual(["monday"]);
      expect(await everything(tx, w)).toBe(before);
      expect(await receipts(tx, w, 0)).toEqual([{ operation: "chooseScheduleDays", state: "completed" }]);
    });
  });

  it("keeps a choice of no day, and takes the days back in any order sent (handoff 6's two-day picker)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 3);
      // Ben holds Monday and Thursday by proposal.
      const none = await choose(tx, clock, w, 0, []);
      expect(none.myDays).toEqual([]);
      expect(slot(none, "monday")).toEqual({ weekday: "monday", state: "available", suggested: true });
      expect(slot(none, "thursday")).toEqual({ weekday: "thursday", state: "available", suggested: true });
      const back = await choose(tx, clock, w, 0, ["thursday", "monday"]);
      expect(back.myDays).toEqual(["monday", "thursday"]);
      expect(slot(back, "monday")).toEqual({ weekday: "monday", state: "yours", suggested: true });
      // One of the two, and another's proposed day beside it.
      const mixed = await choose(tx, clock, w, 0, ["saturday", "monday"]);
      expect(mixed.myDays).toEqual(["monday", "saturday"]);
      expect(slot(mixed, "saturday")).toEqual({
        weekday: "saturday",
        state: "clash",
        holders: [person(w, 0), person(w, 2)],
        suggested: false,
      });
    });
  });

  it("shows a contest and moves nobody: its holders see each other in the order they joined, everyone else sees no reveal and no names (T6)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 6);
      // Debby (Friday) and Alex (Wednesday) both choose Ben's Monday.
      await choose(tx, clock, w, 4, ["monday"]);
      const two = await proposalFor(tx, clock, w, 0);
      expect(slot(two, "monday")).toEqual({
        weekday: "monday",
        state: "clash",
        holders: [person(w, 0), person(w, 4)],
        suggested: true,
      });
      const alex = await choose(tx, clock, w, 2, ["monday"]);
      const holders = [person(w, 0), person(w, 2), person(w, 4)];
      expect(slot(alex, "monday")).toEqual({ weekday: "monday", state: "clash", holders, suggested: false });
      expect(slot(await proposalFor(tx, clock, w, 4), "monday")).toEqual({
        weekday: "monday",
        state: "clash",
        holders,
        suggested: false,
      });
      // Ben still holds Monday: the proposal never swapped anyone.
      expect((await proposalFor(tx, clock, w, 0)).myDays).toEqual(["monday"]);
      for (const outsider of [1, 3, 5]) {
        expect(slot(await proposalFor(tx, clock, w, outsider), "monday")).toEqual({
          weekday: "monday",
          state: "no_reveal",
          suggested: false,
        });
      }
      // Sam may join the contest, and then sees its names (FQ46, FQ48).
      const sam = await choose(tx, clock, w, 3, ["monday"]);
      expect(slot(sam, "monday").holders).toEqual([person(w, 0), person(w, 2), person(w, 3), person(w, 4)]);
      // Once all but one have chosen another day, the day is the last holder's alone.
      await choose(tx, clock, w, 2, ["wednesday"]);
      await choose(tx, clock, w, 3, ["thursday"]);
      await choose(tx, clock, w, 4, ["friday"]);
      expect(slot(await proposalFor(tx, clock, w, 0), "monday")).toEqual({
        weekday: "monday",
        state: "yours",
        suggested: true,
      });
      expect((await proposalRow(tx, w.proposal)).version).toBe(1);
    });
  });

  it("names a contest's holders in the order they joined, whatever the order of their ids", async () => {
    // A club whose six random ids happen to be sorted has nothing to tell apart (about one in 360), so
    // another is made: ten sorted clubs in a row don't happen.
    let judged = false;
    for (let attempt = 0; attempt < 10 && !judged; attempt += 1)
      judged = await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await firstDays(tx, clock, 6);
        // Three members whose ids run neither up nor down in the order they joined, so that no order by id
        // gives theirs. Six random ids have such a three unless they are sorted, one way or the other.
        const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
        const id = (who: number) => w.members[who] ?? "";
        let three: [number, number, number] | undefined;
        for (let a = 0; a < 6 && three === undefined; a += 1) {
          for (let b = a + 1; b < 6 && three === undefined; b += 1) {
            for (let c = b + 1; c < 6 && three === undefined; c += 1) {
              if (byBytes(id(a), id(b)) !== byBytes(id(b), id(c))) three = [a, b, c];
            }
          }
        }
        if (three === undefined) return false;
        const [first, second, third] = three;
        const day = proposedWeek(6)[first]?.[0];
        if (day === undefined) throw new Error("the first of the three has no proposed day");
        await choose(tx, clock, w, third, [day]);
        await choose(tx, clock, w, second, [day]);
        const holders = [person(w, first), person(w, second), person(w, third)];
        for (const who of three) {
          expect(slot(await proposalFor(tx, clock, w, who), day).holders, `as member ${String(who)}`).toEqual(holders);
        }
        return true;
      });
    expect(judged).toBe(true);
  });

  it("frees the hold of a member who left, and shows a confirmed member who left by the name they left with (FQ75, FQ102)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 6);
      // Alex contests Ben's Monday; Sam confirms Thursday. Then both leave, Sam under another name.
      await choose(tx, clock, w, 2, ["monday"]);
      clock.set(Temporal.Instant.from(CONFIRMED));
      await confirm(tx, clock, w, 3, ["thursday"]);
      expect(slot(await proposalFor(tx, clock, w, 0), "monday").state).toBe("clash");
      await leave(plain(tx), { user: w.users[2] ?? "", interval: w.members[2] ?? "" }, "Alex", AT.edited);
      await leave(plain(tx), { user: w.users[3] ?? "", interval: w.members[3] ?? "" }, "Sam who left", AT.edited);
      await checkAsAtCommit(plain(tx));
      const ben = await sees(tx, clock, w, 0);
      // Alex holds nothing now, so Monday is Ben's alone again.
      expect(slot(ben?.proposal as ProposalAnswer, "monday")).toEqual({
        weekday: "monday",
        state: "yours",
        suggested: true,
      });
      // Sam's Thursday stays Sam's, under the name Sam left with, and with no date: it won't open (FQ63).
      const sam = { membershipId: w.members[3], displayName: "Sam who left", avatarVersion: null };
      expect(slot(ben?.proposal as ProposalAnswer, "thursday")).toEqual({
        weekday: "thursday",
        state: "taken",
        owner: sam,
        suggested: false,
      });
      // The club's week lists only members still in the club, so Sam's Thursday isn't in it (Schedule.current).
      expect(ben?.current).toBeNull();
      // And Ben confirms Monday: nobody who is still a member holds it too.
      const answer = await confirm(tx, clock, w, 0, ["monday"]);
      expect(answer).toMatchObject({ myState: "confirmed", state: "open", version: 1 });
    });
  });
});

describe("confirming days (FQ55, FQ57, FQ79, FQ99; T1, T33, T49)", () => {
  it("confirms the caller's day from the server clock's sample: its first date is at least 24 hours on, and the version stays", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 6);
      clock.set(Temporal.Instant.from(CONFIRMED));
      // Sam confirms Thursday on Wednesday at 9 AM: Thursday 5's 7 AM is 22 hours on, so it first opens on the 12th.
      const answer = await confirm(tx, clock, w, 3, ["thursday"]);
      expect(answer).toMatchObject({ version: 1, myDays: ["thursday"], myState: "confirmed", state: "open" });
      expect(slot(answer, "thursday")).toEqual({
        weekday: "thursday",
        state: "yours",
        firstDate: "2026-11-12",
        suggested: true,
      });
      // A confirmed member's view names nobody on a day nobody has confirmed (FQ48).
      expect(slot(answer, "monday")).toEqual({ weekday: "monday", state: "available", suggested: false });
      const rows = await assignments(tx, w);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ weekday: "thursday", star_interval_id: w.members[3], first_date: "2026-11-12" });
      expect(rows[0]?.confirmed_at.equals(Temporal.Instant.from(CONFIRMED))).toBe(true);
      expect(await proposalRow(tx, w.proposal)).toMatchObject({ state: "open", version: 1, closed_at: null });
      // Everyone else sees it taken, by its owner, with its date; and the schedule in force now has it.
      const ben = await sees(tx, clock, w, 0);
      expect(slot(ben?.proposal as ProposalAnswer, "thursday")).toEqual({
        weekday: "thursday",
        state: "taken",
        owner: person(w, 3),
        firstDate: "2026-11-12",
        suggested: false,
      });
      expect(ben?.current).toEqual({
        effectiveFrom: "2026-11-02",
        assignments: [{ weekday: "thursday", person: person(w, 3) }],
      });
    });
  });

  it("counts a confirmed day's 24 hours to 7 AM in the club's zone, not in UTC (T2; FQ79)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 6, "Pacific/Auckland");
      // 05:00 UTC on Wednesday 4 November is 6 PM in Auckland. Thursday's 7 AM there is 13 hours on, so
      // Sam's Thursday first opens on the 12th; 7 AM UTC on Thursday the 5th would be 26 hours on.
      clock.set(Temporal.Instant.from("2026-11-04T05:00:00Z"));
      const answer = await confirm(tx, clock, w, 3, ["thursday"]);
      expect(slot(answer, "thursday").firstDate).toBe("2026-11-12");
      // And Friday's 7 AM in Auckland, 6 PM UTC on Thursday, is 37 hours on: Debby's Friday opens on the 6th.
      expect(slot(await confirm(tx, clock, w, 4, ["friday"]), "friday").firstDate).toBe("2026-11-06");
    });
  });

  it("takes the confirmation's instant from the sample after the receipt's, not from when the request began (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const opening = fakeClock(OPENED);
      const w = await firstDays(tx, opening, 6);
      // A clock that moves a day with every sample: the receipt's sample is the first, the rule's the second.
      // (That the second is taken only once the club's row is held is the committed test "samples the
      // confirmation's clock only once it holds the club's row", which this one can't see.)
      const start = Temporal.Instant.from("2026-11-03T06:30:00Z");
      let samples = 0;
      const moving: FakeClock = {
        ...opening,
        async sample(sql) {
          await opening.sample(sql);
          const at = start.add({ hours: 24 * samples });
          samples += 1;
          return at as Awaited<ReturnType<FakeClock["sample"]>>;
        },
      };
      // Tuesday 06:30 would give Wednesday 4 its first date; Wednesday 06:30, the second sample, gives the 11th.
      const answer = await confirm(tx, moving, w, 2, ["wednesday"]);
      expect(samples).toBe(2);
      expect(slot(answer, "wednesday").firstDate).toBe("2026-11-11");
      const [row] = await assignments(tx, w);
      expect(row?.confirmed_at.equals(start.add({ hours: 24 }))).toBe(true);
    });
  });

  for (const count of [2, 3, 4, 6]) {
    it(`applies the first days of a club of ${String(count)} on the last confirmation, which alone moves the version (T33)`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await firstDays(tx, clock, count);
        const week = proposedWeek(count);
        clock.set(Temporal.Instant.from(CONFIRMED));
        for (let who = 0; who < count; who += 1) {
          const days = week[who] ?? [];
          const answer = await confirm(tx, clock, w, who, days);
          const last = who === count - 1;
          expect(answer).toMatchObject({
            version: last ? 2 : 1,
            state: last ? "applied" : "open",
            myDays: days,
            myState: "confirmed",
          });
          for (const weekday of days) expect(slot(answer, weekday).firstDate).toBe(FIRST[weekday]);
          expect((await proposalRow(tx, w.proposal)).version).toBe(last ? 2 : 1);
        }
        const row = await proposalRow(tx, w.proposal);
        expect(row.state).toBe("applied");
        expect(row.closed_at?.equals(Temporal.Instant.from(CONFIRMED))).toBe(true);
        expect((await assignments(tx, w)).map((each) => `${each.weekday} ${each.first_date}`).sort()).toEqual(
          week
            .flat()
            .map((weekday) => `${weekday} ${FIRST[weekday]}`)
            .sort(),
        );
        // Applied, the proposal is no longer open: the week is the schedule in force, from Monday.
        const sight = await sees(tx, clock, w, 0);
        expect(sight?.proposal).toBeNull();
        expect(sight?.current?.effectiveFrom).toBe("2026-11-02");
        expect(sight?.current?.assignments).toEqual(
          (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const).flatMap((weekday) => {
            const owner = week.findIndex((days) => days.includes(weekday));
            return owner === -1 ? [] : [{ weekday, person: person(w, owner) }];
          }),
        );
      });
    });
  }

  it("confirms nothing while a day is contested: neither holder, in either order, until all but one have chosen another (FQ55)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      await choose(tx, clock, w, 1, ["monday"]);
      const before = await everything(tx, w);
      expect(await refusal(confirm(tx, clock, w, 0, ["monday"]))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      expect(await refusal(confirm(tx, clock, w, 1, ["monday"]))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      expect(await everything(tx, w)).toBe(before);
      expect(await receipts(tx, w, 0)).toEqual([]);
      await choose(tx, clock, w, 1, ["tuesday"]);
      expect((await confirm(tx, clock, w, 0, ["monday"])).myState).toBe("confirmed");
    });
  });

  it("confirms both days at once or neither: one contested day holds back the other too, in a club of two (FQ99)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 2);
      // Ben: Monday, Thursday. Maya: Tuesday, Friday. Maya takes Thursday in place of Friday.
      await choose(tx, clock, w, 1, ["tuesday", "thursday"]);
      for (const days of [["monday", "thursday"], ["monday"], ["thursday"]] as const) {
        expect(await refusal(confirm(tx, clock, w, 0, days))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      }
      expect(await assignments(tx, w)).toEqual([]);
      await choose(tx, clock, w, 1, ["tuesday", "friday"]);
      const answer = await confirm(tx, clock, w, 0, ["thursday", "monday"]);
      expect(answer).toMatchObject({ myDays: ["monday", "thursday"], myState: "confirmed", version: 1 });
    });
  });

  it("confirms only the days the caller holds and named, the whole of them (book p11)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 3);
      // Ben holds Monday and Thursday.
      for (const days of [["monday"], ["monday", "friday"], ["tuesday", "friday"], ["friday"]] as const) {
        expect(await refusal(confirm(tx, clock, w, 0, days))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      }
      // Holding one day of two is not enough to confirm it.
      await choose(tx, clock, w, 0, ["monday"]);
      expect(await refusal(confirm(tx, clock, w, 0, ["monday"]))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      expect(await assignments(tx, w)).toEqual([]);
    });
  });
});

describe("the refusals, in the contract's order", () => {
  /** A world where Ben's request would earn every later refusal too: a stale version and a day Maya has confirmed. */
  async function loaded(tx: WorldTx, clock: FakeClock): Promise<FirstDays> {
    const w = await firstDays(tx, clock, 4);
    await confirm(tx, clock, w, 1, ["tuesday"]);
    return w;
  }

  /**
   * Replaces the world's proposal with a newer one that includes Ben alone, as a new member's pick is
   * replaced for the members then without a day (settle-change.ts `settleChange`, FQ131): rows this test
   * writes. A revision of the first days keeps its proposal (./first-days-roster.test.ts).
   */
  async function replaced(tx: WorldTx, w: FirstDays): Promise<string> {
    const successor = newId("spr");
    await tx`
      UPDATE app.schedule_proposals
         SET state = 'superseded', version = version + 1, closed_at = ${AT.added}, replaced_by = ${successor}
       WHERE id = ${w.proposal}`;
    await tx`
      INSERT INTO app.schedule_proposals
        (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
      VALUES (${successor}, ${w.club}, 'activation', '2026-11-02', 1, ${w.version}, ${AT.added})`;
    await tx`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${successor}, ${w.club}, ${w.members[0] ?? ""})`;
    await checkAsAtCommit(plain(tx));
    return successor;
  }

  for (const [name, command] of [
    ["a choice", choose],
    ["a confirmation", confirm],
  ] as const) {
    it(`answers ${name} NOT_FOUND first: an unknown proposal, a stranger, a former member, an account being deleted and a suspended club alike (T14)`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await loaded(tx, clock);
        await replaced(tx, w);
        const stale = { version: 7 };
        const stranger = await newUser(plain(tx), "Zed");
        const none = { code: "NOT_FOUND", facts: {} };
        expect(await refusal(command(tx, clock, w, stranger, ["tuesday"], stale))).toEqual(none);
        expect(await refusal(command(tx, clock, w, 0, ["tuesday"], { ...stale, proposal: newId("spr") }))).toEqual(
          none,
        );
        expect(await refusal(command(tx, clock, w, 0, ["tuesday"], { ...stale, proposal: "not an id" }))).toEqual(none);
        await leave(plain(tx), { user: w.users[2] ?? "", interval: w.members[2] ?? "" }, "Alex", AT.edited);
        expect(await refusal(command(tx, clock, w, 2, ["tuesday"], stale))).toEqual(none);
        await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${w.users[3] ?? ""}`;
        expect(await refusal(command(tx, clock, w, 3, ["tuesday"], stale))).toEqual(none);
        await tx`UPDATE app.clubs SET suspended_at = ${AT.edited} WHERE id = ${w.club}`;
        expect(await refusal(command(tx, clock, w, 0, ["tuesday"], stale))).toEqual(none);
      });
    });

    it(`answers ${name} MEMBERSHIP_CHANGED with the newer proposal's id before it looks at the version or the days`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await loaded(tx, clock);
        const successor = await replaced(tx, w);
        const before = await everything(tx, w);
        expect(await refusal(command(tx, clock, w, 0, ["tuesday"], { version: 7 }))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: successor },
        });
        // The version it would have asked for changes nothing about that answer.
        expect(await refusal(command(tx, clock, w, 0, ["monday"], { version: 2 }))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: successor },
        });
        // To a member the newer one doesn't include, the earlier one has ended like any other.
        expect(await refusal(command(tx, clock, w, 2, ["thursday"], { version: 7 }))).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: 2 },
        });
        expect(await refusal(command(tx, clock, w, 2, ["thursday"], { version: 2 }))).toEqual({
          code: "NOT_ALLOWED",
          facts: {},
        });
        expect(await everything(tx, w)).toBe(before);
      });
    });

    it(`answers ${name} VERSION_CONFLICT with the version now before it judges the days`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await loaded(tx, clock);
        const before = await everything(tx, w);
        for (const version of [0, 2, 7]) {
          expect(await refusal(command(tx, clock, w, 0, ["tuesday"], { version }))).toEqual({
            code: "VERSION_CONFLICT",
            facts: { current_version: 1 },
          });
        }
        expect(await everything(tx, w)).toBe(before);
        expect(await receipts(tx, w, 0)).toEqual([]);
      });
    });

    it(`answers ${name} of a day another member has confirmed NOT_ALLOWED, and leaves everything as it was (FQ78)`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await loaded(tx, clock);
        const before = await everything(tx, w);
        expect(await refusal(command(tx, clock, w, 0, ["tuesday"]))).toEqual({ code: "NOT_ALLOWED", facts: {} });
        expect(await everything(tx, w)).toBe(before);
      });
    });

    it(`answers ${name} after the caller confirmed NOT_ALLOWED: nothing is chosen or confirmed twice (FQ57)`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await loaded(tx, clock);
        const before = await everything(tx, w);
        const days: Weekday[] = name === "a choice" ? ["friday"] : ["tuesday"];
        expect(await refusal(command(tx, clock, w, 1, days))).toEqual({ code: "NOT_ALLOWED", facts: {} });
        expect(await everything(tx, w)).toBe(before);
      });
    });

    it(`answers ${name} of first days that have applied VERSION_CONFLICT to the version a member read while they were open, and NOT_ALLOWED to the applied one`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await firstDays(tx, clock, 2);
        await confirm(tx, clock, w, 0, ["monday", "thursday"]);
        await confirm(tx, clock, w, 1, ["tuesday", "friday"]);
        expect(await refusal(command(tx, clock, w, 0, ["monday", "thursday"]))).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: 2 },
        });
        expect(await refusal(command(tx, clock, w, 0, ["monday", "thursday"], { version: 2 }))).toEqual({
          code: "NOT_ALLOWED",
          facts: {},
        });
      });
    });

    it(`answers ${name} of first days that ended with no successor NOT_ALLOWED: nothing is written to a proposal that has closed (FQ102)`, async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(OPENED);
        const w = await firstDays(tx, clock, 4);
        // As a leave that pauses the club ends them (packages/domain/src/schedule/settle.ts): rows this test writes.
        await tx`
          UPDATE app.schedule_proposals SET state = 'superseded', version = version + 1, closed_at = ${AT.added}
           WHERE id = ${w.proposal}`;
        await checkAsAtCommit(plain(tx));
        const before = await everything(tx, w);
        expect(await refusal(command(tx, clock, w, 0, ["monday"]))).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: 2 },
        });
        expect(await refusal(command(tx, clock, w, 0, ["monday"], { version: 2 }))).toEqual({
          code: "NOT_ALLOWED",
          facts: {},
        });
        expect(await everything(tx, w)).toBe(before);
      });
    });
  }

  it("answers a choice of more days than a member has NOT_ALLOWED (spec 05's table)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const before = await everything(tx, w);
      expect(await refusal(choose(tx, clock, w, 0, ["monday", "friday"]))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      expect(await everything(tx, w)).toBe(before);
    });
  });
});

describe("one commit per key (T19)", () => {
  it("answers a retry with the first answer as it was, though the week has changed since, and writes nothing again", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const key = randomUUID();
      const first = await choose(tx, clock, w, 0, ["friday"], { key });
      // Since then Maya has confirmed, and Ben has chosen again under another key.
      await confirm(tx, clock, w, 1, ["tuesday"]);
      await choose(tx, clock, w, 0, ["saturday"]);
      const before = await everything(tx, w);
      const again = await choose(tx, clock, w, 0, ["friday"], { key });
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(slot(again, "tuesday").state).toBe("available");
      expect(await everything(tx, w)).toBe(before);
      expect((await proposalFor(tx, clock, w, 0)).myDays).toEqual(["saturday"]);
    });
  });

  it("answers a retried confirmation the same way, even after the first days have applied", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 2);
      const key = randomUUID();
      const first = await confirm(tx, clock, w, 0, ["monday", "thursday"], { key });
      expect(first.state).toBe("open");
      await confirm(tx, clock, w, 1, ["tuesday", "friday"]);
      const again = await confirm(tx, clock, w, 0, ["monday", "thursday"], { key });
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(await assignments(tx, w)).toHaveLength(4);
    });
  });

  it("refuses another request under a used key with IDEMPOTENCY_CONFLICT: other days and another version, another proposal's path, each alone; a path that names no proposal is NOT_FOUND first", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const key = randomUUID();
      await choose(tx, clock, w, 0, ["friday"], { key });
      const conflict = { code: "IDEMPOTENCY_CONFLICT", facts: {} };
      expect(await refusal(choose(tx, clock, w, 0, ["saturday"], { key }))).toEqual(conflict);
      expect(await refusal(choose(tx, clock, w, 0, ["friday"], { key, version: 2 }))).toEqual(conflict);
      // No proposal of the caller's is found before the key is looked at (T14; FQ112).
      expect(await refusal(choose(tx, clock, w, 0, ["friday"], { key, proposal: newId("spr") }))).toEqual({
        code: "NOT_FOUND",
        facts: {},
      });
      // The key is per operation: the same key confirms, as its own request.
      await choose(tx, clock, w, 0, ["monday"]);
      expect((await confirm(tx, clock, w, 0, ["monday"], { key })).myState).toBe("confirmed");
      // Another proposal of the same club, as a new member's pick makes: the same body under the key, at its path.
      const successor = newId("spr");
      await tx`
        UPDATE app.schedule_proposals
           SET state = 'superseded', version = version + 1, closed_at = ${AT.added}, replaced_by = ${successor}
         WHERE id = ${w.proposal}`;
      await tx`
        INSERT INTO app.schedule_proposals
          (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
        VALUES (${successor}, ${w.club}, 'activation', '2026-11-02', 1, ${w.version}, ${AT.added})`;
      await checkAsAtCommit(plain(tx));
      // Until it includes Ben, it is nothing to Ben, whatever key comes with the request (T14; FQ100).
      expect(await refusal(choose(tx, clock, w, 0, ["friday"], { key, proposal: successor }))).toEqual({
        code: "NOT_FOUND",
        facts: {},
      });
      await tx`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
        VALUES (${successor}, ${w.club}, ${w.members[0] ?? ""})`;
      expect(await refusal(choose(tx, clock, w, 0, ["friday"], { key, proposal: successor }))).toEqual(conflict);
    });
  });

  it("gives a retry no stored answer once its sender has nothing of the club: NOT_FOUND for a former member, an account being deleted and a suspended club, whatever the body (T14; FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 6);
      const none = { code: "NOT_FOUND", facts: {} };
      const alex = randomUUID();
      const sam = randomUUID();
      const ben = randomUUID();
      // Alex, Sam and Ben each choose under a key, and each answer names Maya, who contests Wednesday.
      await choose(tx, clock, w, 1, ["wednesday"]);
      for (const [who, key] of [
        [2, alex],
        [3, sam],
        [0, ben],
      ] as const) {
        const first = await choose(tx, clock, w, who, ["wednesday"], { key });
        expect(slot(first, "wednesday").holders).toContainEqual(person(w, 1));
      }
      // While its sender is still a member, a retry is the first answer.
      expect(slot(await choose(tx, clock, w, 2, ["wednesday"], { key: alex }), "wednesday").state).toBe("clash");
      /** Both retries under `key`, the same body and another, get the same nothing and change nothing. */
      const nothing = async (who: number, key: string): Promise<void> => {
        const before = await everything(tx, w);
        expect(await refusal(choose(tx, clock, w, who, ["wednesday"], { key }))).toEqual(none);
        // Another body under the key isn't IDEMPOTENCY_CONFLICT, which a stranger never gets.
        expect(await refusal(choose(tx, clock, w, who, ["saturday"], { key }))).toEqual(none);
        expect(await everything(tx, w)).toBe(before);
        expect(await receipts(tx, w, who)).toEqual([{ operation: "chooseScheduleDays", state: "completed" }]);
      };
      await leave(plain(tx), { user: w.users[2] ?? "", interval: w.members[2] ?? "" }, "Alex", AT.edited);
      await nothing(2, alex);
      // Alex joins again, a member of the club once more under a new interval, which the proposal doesn't
      // include (FQ100): still nothing, though the key and the body are the ones that were answered.
      await joinByRoster(
        plain(tx),
        w.club,
        { user: w.users[0] ?? "", interval: w.members[0] ?? "" },
        [{ user: w.users[2] ?? "", label: "Alex" }],
        new Date(AT.edited.getTime() + 60_000),
      );
      expect(await activeMember(tx, w.users[2] ?? "", w.club)).not.toBeNull();
      await nothing(2, alex);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${w.users[3] ?? ""}`;
      await nothing(3, sam);
      await tx`UPDATE app.clubs SET suspended_at = ${AT.edited} WHERE id = ${w.club}`;
      await nothing(0, ben);
    });
  });

  it("asks who is calling again under the club's lock: a member who left and joined again after the first look gets NOT_FOUND, and nothing is written (T14; FQ100)", async () => {
    await rolledBack(db, async (tx) => {
      const base = fakeClock(OPENED);
      const w = await firstDays(tx, base, 6);
      const before = await everything(tx, w);
      // The command's first sample comes after its first look at the caller and before the club's lock.
      // There, Alex leaves and joins again: the proposal included the membership the first look found,
      // and doesn't include the one the command finds under the lock.
      let samples = 0;
      const between: FakeClock = {
        ...base,
        async sample(sql) {
          samples += 1;
          if (samples === 1) {
            const now = sql as unknown as Tx;
            await leave(now, { user: w.users[2] ?? "", interval: w.members[2] ?? "" }, "Alex", AT.edited);
            await joinByRoster(
              now,
              w.club,
              { user: w.users[0] ?? "", interval: w.members[0] ?? "" },
              [{ user: w.users[2] ?? "", label: "Alex" }],
              new Date(AT.edited.getTime() + 60_000),
            );
          }
          return base.sample(sql);
        },
      };
      expect(await refusal(choose(tx, between, w, 2, ["friday"]))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(samples).toBe(1);
      // The refusal took the leave and the joining back with it, as it does the receipt.
      expect(await everything(tx, w)).toBe(before);
      expect(await receipts(tx, w, 2)).toEqual([]);
    });
  });

  it("keeps no receipt of a refused request, so the same key can be tried again", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(OPENED);
      const w = await firstDays(tx, clock, 4);
      const key = randomUUID();
      await choose(tx, clock, w, 1, ["monday"]);
      expect(await refusal(confirm(tx, clock, w, 0, ["monday"], { key }))).toMatchObject({ code: "NOT_ALLOWED" });
      expect(await receipts(tx, w, 0)).toEqual([]);
      await choose(tx, clock, w, 1, ["tuesday"]);
      expect((await confirm(tx, clock, w, 0, ["monday"], { key })).myState).toBe("confirmed");
      expect(await receipts(tx, w, 0)).toEqual([{ operation: "confirmScheduleDays", state: "completed" }]);
    });
  });
});

describe("requests at once, committed (T6, T19; FQ55)", () => {
  /** First days other connections can see: committed, and left in the database, as update-me.test.ts's accounts are. */
  const committed = (count: number) => db.begin((tx) => firstDays(tx, fakeClock(OPENED), count));
  const clock = fakeClock(CONFIRMED);
  const asRoute = (command: Command, w: FirstDays, who: number, weekdays: readonly Weekday[], key = randomUUID()) =>
    db.begin((tx) =>
      command(
        tx,
        clock,
        { userId: w.users[who] ?? "", key, proposalId: w.proposal, expectedVersion: 1, weekdays },
        render,
      ),
    ) as Promise<unknown> as Promise<ProposalAnswer>;
  const world = db as unknown as WorldTx;
  const codes = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.map((one) =>
      one.status === "fulfilled" ? "ok" : one.reason instanceof Refused ? one.reason.code : String(one.reason),
    );

  it("lets a choice and a confirmation of the same day race: exactly one stands, whichever the club's lock took first", async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < 12; round += 1) {
      const w = await committed(4);
      // Ben confirms Monday while Maya chooses it.
      const results = await Promise.allSettled([
        asRoute(confirmScheduleDays, w, 0, ["monday"]),
        asRoute(chooseScheduleDays, w, 1, ["monday"]),
      ]);
      const [confirmed, chose] = codes(results);
      outcomes.add(`${String(confirmed)} ${String(chose)}`);
      const rows = await assignments(world, w);
      if (confirmed === "ok") {
        // The confirmation was first: the day is Ben's, and Maya's choice of it is refused.
        expect(chose).toBe("NOT_ALLOWED");
        expect(rows.map((each) => each.star_interval_id)).toEqual([w.members[0]]);
        expect((await proposalFor(world, clock, w, 1)).myDays).toEqual(["tuesday"]);
      } else {
        // The choice was first: the day is contested, and nobody has confirmed it.
        expect([confirmed, chose]).toEqual(["NOT_ALLOWED", "ok"]);
        expect(rows).toEqual([]);
        expect(slot(await proposalFor(world, clock, w, 0), "monday").state).toBe("clash");
      }
    }
    // Never both, never neither.
    for (const outcome of outcomes) expect(["ok NOT_ALLOWED", "NOT_ALLOWED ok"]).toContain(outcome);
  });

  it("in both orders, one after the other: the confirmation first refuses the choice, the choice first refuses the confirmation", async () => {
    const one = await committed(4);
    await asRoute(confirmScheduleDays, one, 0, ["monday"]);
    expect(await refusal(asRoute(chooseScheduleDays, one, 1, ["monday"]))).toMatchObject({ code: "NOT_ALLOWED" });
    const two = await committed(4);
    await asRoute(chooseScheduleDays, two, 1, ["monday"]);
    expect(await refusal(asRoute(confirmScheduleDays, two, 0, ["monday"]))).toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("confirms neither of two members who hold the same day and confirm it at once: both still see the clash", async () => {
    const w = await committed(4);
    await asRoute(chooseScheduleDays, w, 1, ["monday"]);
    const results = await Promise.allSettled([
      asRoute(confirmScheduleDays, w, 0, ["monday"]),
      asRoute(confirmScheduleDays, w, 1, ["monday"]),
    ]);
    expect(codes(results)).toEqual(["NOT_ALLOWED", "NOT_ALLOWED"]);
    expect(await assignments(world, w)).toEqual([]);
    for (const who of [0, 1]) expect(slot(await proposalFor(world, clock, w, who), "monday").state).toBe("clash");
  });

  it("lets every member of a club of six confirm at once: six days, one version move, no deadlock", async () => {
    const w = await committed(6);
    const week = proposedWeek(6);
    const results = await Promise.allSettled(week.map((days, who) => asRoute(confirmScheduleDays, w, who, days)));
    expect(codes(results)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
    const answers = results.flatMap((one) => (one.status === "fulfilled" ? [one.value] : []));
    // Exactly one of them was the last, and answered the applied proposal at the next version.
    expect(answers.filter((answer) => answer.state === "applied" && answer.version === 2)).toHaveLength(1);
    expect(answers.filter((answer) => answer.state === "open" && answer.version === 1)).toHaveLength(5);
    expect(await assignments(world, w)).toHaveLength(6);
    expect(await proposalRow(world, w.proposal)).toMatchObject({ state: "applied", version: 2 });
  });

  /** Holds `club`'s row in another transaction until `release` is called; resolves once it is held. */
  async function holding(club: string): Promise<{ pid: number; release: () => Promise<void> }> {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held: (pid: number) => void = () => undefined;
    const taken = new Promise<number>((resolve) => (held = resolve));
    const done = db.begin(async (tx) => {
      const [row] = await tx<{ pid: number }[]>`
        SELECT pg_catalog.pg_backend_pid() AS pid FROM app.clubs WHERE id = ${club} FOR UPDATE`;
      if (row === undefined) throw new Error("holding: no such club");
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

  /** Waits until some backend is waiting on a lock `pid` holds. */
  async function waitingOn(pid: number): Promise<void> {
    for (let tries = 0; tries < 400; tries += 1) {
      const [row] = await db<{ waiting: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM pg_catalog.pg_stat_activity a WHERE ${pid}::int4 = ANY (pg_catalog.pg_blocking_pids(a.pid))
        ) AS waiting`;
      if (row?.waiting === true) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("waitingOn: nothing came to wait for the club's row");
  }

  /** A clock at `at` that counts its samples. */
  function counting(at: string): { clock: FakeClock; samples: () => number } {
    const base = fakeClock(at);
    let samples = 0;
    const clock: FakeClock = {
      ...base,
      async sample(sql) {
        samples += 1;
        return base.sample(sql);
      },
    };
    return { clock, samples: () => samples };
  }

  // Each waits up to ten seconds for the command to queue behind the held row, so it gets twenty.
  it(
    "samples the confirmation's clock only once it holds the club's row (T1; T3's order)",
    { timeout: 20_000 },
    async () => {
      const w = await committed(4);
      const hold = await holding(w.club);
      const { clock: counted, samples } = counting(CONFIRMED);
      const sent = db.begin((tx) =>
        confirmScheduleDays(
          tx,
          counted,
          {
            userId: w.users[0] ?? "",
            key: randomUUID(),
            proposalId: w.proposal,
            expectedVersion: 1,
            weekdays: ["monday"],
          },
          render,
        ),
      );
      try {
        await waitingOn(hold.pid);
        // Waiting for the row, it has sampled once, for the receipt: the deciding sample hasn't been taken.
        expect(samples()).toBe(1);
      } finally {
        await hold.release();
        // Settled either way before the test ends, so a failure above leaves no promise unanswered.
        await sent.catch(() => undefined);
      }
      await sent;
      expect(samples()).toBe(2);
    },
  );

  it(
    "samples the clock that dates the first days only once it holds the club's row (T1)",
    { timeout: 20_000 },
    async () => {
      const made = await db.begin((tx) => clubOf(tx, 4));
      const hold = await holding(made.club);
      const { clock: counted, samples } = counting(OPENED);
      const opened = db.begin((tx) => openFirstDays(tx, counted, made.club));
      try {
        await waitingOn(hold.pid);
        expect(samples()).toBe(0);
      } finally {
        await hold.release();
        await opened.catch(() => undefined);
      }
      await opened;
      expect(samples()).toBe(1);
    },
  );

  it("gives two sends of the same key at once the same answer, and confirms once", async () => {
    const w = await committed(4);
    const key = randomUUID();
    const [one, two] = await Promise.all([
      asRoute(confirmScheduleDays, w, 0, ["monday"], key),
      asRoute(confirmScheduleDays, w, 0, ["monday"], key),
    ]);
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
    expect(await assignments(world, w)).toHaveLength(1);
  });
});
