/// <reference lib="esnext.temporal" />
// The membership change against Postgres as `tadayo_app` (spec 05; T1, T6, T14, T19, T33; FQ16, FQ56,
// FQ61, FQ81, FQ100, FQ102, FQ115, FQ125 to FQ127; docs/plans/api-b2-membership-change.md;
// packages/domain/src/schedule/settle-change.ts, change.ts, confirm-days.ts, week.ts). Every club here is
// made the way the product makes one, as tests/src/db/first-days-roster.test.ts makes its own: `createClub`,
// `proposeRoster`, `createInvitation`, `acceptInvitation`, `approveRoster`, `leaveClub`, and the schedule's
// `confirmScheduleDays`, each as its route runs it (./club-world.ts), and the checks Postgres keeps for the
// commit run after each step here (`committed`, ./world.ts).

import { randomUUID } from "node:crypto";
import { leftClubBody } from "@tadayo/api";
import {
  chooseScheduleDays,
  confirmScheduleDays,
  leaveClub,
  listClubs,
  makeDays,
  readSchedule,
  type Json,
  type ProposalAnswer,
  type ScheduleSight,
  type ServerNow,
  type Weekday,
} from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type WorldTx } from "./harness.ts";
import { foundedBy, joinAs, leaveAs, type MadeClub } from "./club-world.ts";
import { plain, refusal } from "./roster-world.ts";
import { holding, waitingOn } from "./week-world.ts";
import { checkAsAtCommit, newUser } from "./world.ts";

const db = worldSql(6);
afterAll(async () => {
  await db.end();
});

// Wednesday 11 November 2026, midnight in New York. Seen from that week, the days' window runs to Sunday
// 13 December (the last day made is Saturday 12 December), and a change starts on Monday 14 December
// (FQ61, FQ115).
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const START = "2026-12-14";
const clock = fakeClock(AT_FIRST);
let current = FIRST;
beforeEach(() => {
  current = FIRST;
  clock.set(FIRST);
});
const tick = (hours: number): void => {
  current = current.add({ hours });
  clock.set(current);
};
const now = (): ServerNow => current as ServerNow;

type Club = MadeClub;

const committed = (tx: WorldTx) => checkAsAtCommit(plain(tx));

/** A join, a minute after whatever came before: members are in the order they joined (FQ98). */
async function join(tx: WorldTx, c: Club, name: string, proposer: string): Promise<void> {
  current = current.add({ minutes: 1 });
  clock.set(current);
  await joinAs(tx, clock, c, name, proposer);
  await committed(tx);
}

/** `name` leaves, a minute after whatever came before, so the proposals stay in the order they were made. */
async function leaving(tx: WorldTx, c: Club, name: string): Promise<void> {
  current = current.add({ minutes: 1 });
  clock.set(current);
  await leaveAs(tx, clock, c, name);
  await committed(tx);
}

const sight = (tx: WorldTx, c: Club, name: string): Promise<ScheduleSight | null> =>
  readSchedule(tx, c.user[name] ?? "", c.club, now());

async function proposalOf(tx: WorldTx, c: Club, name: string): Promise<ProposalAnswer> {
  const found = (await sight(tx, c, name))?.proposal ?? null;
  if (found === null) throw new Error(`${name} sees no proposal`);
  return found;
}

const render = (proposal: ProposalAnswer): Json => JSON.parse(JSON.stringify(proposal)) as Json;

type Command = typeof chooseScheduleDays;
const send =
  (command: Command) =>
  async (
    tx: WorldTx,
    c: Club,
    name: string,
    proposalId: string,
    expectedVersion: number,
    weekdays: readonly Weekday[],
    key: string = randomUUID(),
  ): Promise<ProposalAnswer> => {
    const answer = await tx.savepoint((sp) =>
      command(sp, clock, { userId: c.user[name] ?? "", key, proposalId, expectedVersion, weekdays }, render),
    );
    await committed(tx);
    return answer as unknown as ProposalAnswer;
  };
const choose = send(chooseScheduleDays);
const confirm = send(confirmScheduleDays);

async function confirmOwn(tx: WorldTx, c: Club, name: string): Promise<ProposalAnswer> {
  const seen = await proposalOf(tx, c, name);
  return confirm(tx, c, name, seen.id, seen.version, seen.myDays);
}

interface ProposalRow {
  id: string;
  reason: string;
  state: string;
  version: number;
  week_revision: number;
  days_per_member: number;
  effective_from: string;
  replaced_by: string | null;
  schedule_version_id: string | null;
  closed_at: Temporal.Instant | null;
}

/** The club's proposals, the earliest first. */
const proposals = (tx: WorldTx, c: Club): Promise<ProposalRow[]> =>
  tx<ProposalRow[]>`
    SELECT id, reason, state, version, week_revision, days_per_member, effective_from::text AS effective_from,
           replaced_by, schedule_version_id, closed_at
      FROM app.schedule_proposals WHERE club_id = ${c.club} ORDER BY created_at, id`;

/** The club's membership changes, the earliest first. */
const changes = async (tx: WorldTx, c: Club): Promise<ProposalRow[]> =>
  (await proposals(tx, c)).filter((each) => each.reason === "membership_change");

/** The days a proposal's rows propose, by member's name, from Monday. */
async function proposedIn(tx: WorldTx, c: Club, proposal: string): Promise<Record<string, string[]>> {
  const rows = await tx<{ interval_id: string; weekday: string; suggested: boolean; held: boolean }[]>`
    SELECT interval_id, weekday::text AS weekday, suggested, held FROM app.schedule_proposal_days
     WHERE proposal_id = ${proposal} ORDER BY weekday`;
  const names = new Map(Object.entries(c.member).map(([name, interval]) => [interval, name]));
  const found: Record<string, string[]> = {};
  const included = await tx<{ interval_id: string }[]>`
    SELECT interval_id FROM app.schedule_proposal_members WHERE proposal_id = ${proposal}`;
  for (const { interval_id: interval } of included) found[names.get(interval) ?? interval] = [];
  for (const row of rows) {
    expect(row).toMatchObject({ suggested: true, held: true });
    found[names.get(row.interval_id) ?? row.interval_id]?.push(row.weekday);
  }
  for (const days of Object.values(found)) days.sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  return found;
}

const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const slot = (proposal: ProposalAnswer, weekday: Weekday) => proposal.slots.find((each) => each.weekday === weekday);

/** Ben's club with Maya, both confirmed: the first days applied, Ben's Monday and Thursday, Maya's Tuesday and Friday. */
async function pair(tx: WorldTx): Promise<Club> {
  const c = await foundedBy(tx, clock, "Ben");
  await join(tx, c, "Maya", "Ben");
  await confirmOwn(tx, c, "Ben");
  expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied" });
  expect(await changes(tx, c)).toEqual([]);
  return c;
}

/** `pair`, then Alex joins: a change is open for the three. */
async function withAlex(tx: WorldTx): Promise<{ c: Club; change: ProposalRow }> {
  const c = await pair(tx);
  await join(tx, c, "Alex", "Ben");
  const [change] = await changes(tx, c);
  if (change === undefined) throw new Error("withAlex: no change was proposed");
  return { c, change };
}

describe("when a change is proposed (FQ56, FQ100, FQ102, FQ125)", () => {
  it("proposes one for a join in a club with a week: everyone keeps their days, the new member gets free ones", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      expect(change).toMatchObject({
        reason: "membership_change",
        state: "open",
        version: 1,
        week_revision: 1,
        days_per_member: 2,
        effective_from: START,
        replaced_by: null,
        schedule_version_id: null,
        closed_at: null,
      });
      expect(await proposedIn(tx, c, change.id)).toEqual({
        Ben: ["monday", "thursday"],
        Maya: ["tuesday", "friday"],
        Alex: ["wednesday", "saturday"],
      });
      // The first days stay applied, and the week in force is as it was.
      expect((await proposals(tx, c))[0]).toMatchObject({ reason: "activation", state: "applied" });
      expect((await sight(tx, c, "Alex"))?.current?.assignments.map((each) => each.weekday)).toEqual([
        "monday",
        "tuesday",
        "thursday",
        "friday",
      ]);
    });
  });

  it("proposes one with the last confirmation of the first days, for a member who joined after a day was confirmed (FQ100)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await confirmOwn(tx, c, "Ben");
      await join(tx, c, "Alex", "Ben");
      // Alex is outside the first days, and no change is proposed while they are open.
      expect((await sight(tx, c, "Alex"))?.proposal).toBeNull();
      expect(await changes(tx, c)).toEqual([]);
      tick(1);
      expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied", reason: "activation" });
      const [change] = await changes(tx, c);
      expect(change).toMatchObject({ state: "open", version: 1, days_per_member: 2, effective_from: START });
      expect(await proposedIn(tx, c, change?.id ?? "")).toEqual({
        Ben: ["monday", "thursday"],
        Maya: ["tuesday", "friday"],
        Alex: ["wednesday", "saturday"],
      });
      expect(await proposalOf(tx, c, "Alex")).toMatchObject({
        reason: "membership_change",
        myDays: ["wednesday", "saturday"],
      });
    });
  });

  it("proposes one when a leave applies the first days and the leaver's confirmed day is in the week (FQ102)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await join(tx, c, "Alex", "Ben");
      await join(tx, c, "Sam", "Ben");
      // Four members, one day each. Ben, Maya and Alex confirm; Ben leaves; then Sam, who hasn't, leaves.
      await confirmOwn(tx, c, "Ben");
      await confirmOwn(tx, c, "Maya");
      await confirmOwn(tx, c, "Alex");
      await leaving(tx, c, "Ben");
      expect(await changes(tx, c)).toEqual([]);
      await leaving(tx, c, "Sam");
      expect((await proposals(tx, c))[0]).toMatchObject({ reason: "activation", state: "applied" });
      // Two members, two days each, where the week gave one: spec 05's whole week for two, in join order.
      const [change] = await changes(tx, c);
      expect(change).toMatchObject({ state: "open", days_per_member: 2 });
      expect(await proposedIn(tx, c, change?.id ?? "")).toEqual({
        Maya: ["monday", "thursday"],
        Alex: ["tuesday", "friday"],
      });
    });
  });

  it("frees a leaver's days and moves nobody, where the days each stay (three to two)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await join(tx, c, "Alex", "Ben");
      for (const name of ["Ben", "Maya", "Alex"]) await confirmOwn(tx, c, name);
      expect(await changes(tx, c)).toEqual([]);
      await leaving(tx, c, "Maya");
      const [change] = await changes(tx, c);
      expect(change).toMatchObject({ state: "open", days_per_member: 2, effective_from: START });
      expect(await proposedIn(tx, c, change?.id ?? "")).toEqual({
        Ben: ["monday", "thursday"],
        Alex: ["wednesday", "saturday"],
      });
    });
  });

  it("proposes spec 05's whole week when a fourth member joins three, and when one of four leaves", async () => {
    await rolledBack(db, async (tx) => {
      const { c } = await withAlex(tx);
      await join(tx, c, "Sam", "Ben");
      const four = (await changes(tx, c)).at(-1);
      // The week in force has two days each, and four members take one: everyone moves to the table's day.
      expect(four).toMatchObject({ state: "open", days_per_member: 1 });
      expect(await proposedIn(tx, c, four?.id ?? "")).toEqual({
        Ben: ["monday"],
        Maya: ["tuesday"],
        Alex: ["wednesday"],
        Sam: ["thursday"],
      });
    });
  });

  it("proposes nothing in a club that never had a confirmed week, and nothing while the first days are open", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await join(tx, c, "Alex", "Ben");
      await leaving(tx, c, "Alex");
      await leaving(tx, c, "Maya");
      await join(tx, c, "Sam", "Ben");
      expect((await proposals(tx, c)).map((each) => each.reason)).toEqual(["activation", "activation"]);
    });
  });
});

describe("a change replaced, dropped, and a club paused (FQ16, FQ126, FQ127)", () => {
  it("replaces an open change at the next join: the same start, everyone confirms again, and the old id answers MEMBERSHIP_CHANGED", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      await confirmOwn(tx, c, "Ben");
      // Two weeks on, Wednesday 25 November: a change proposed now alone would start on 28 December.
      tick(14 * 24);
      await join(tx, c, "Sam", "Ben");
      const [first, second] = await changes(tx, c);
      expect(first).toMatchObject({ id: change.id, state: "superseded", version: 2, replaced_by: second?.id });
      expect(String(first?.closed_at)).toBe(current.toString());
      expect(second).toMatchObject({ state: "open", version: 1, days_per_member: 1, effective_from: START });
      // Ben's confirmation was of the earlier week, and stays on its row alone.
      expect(await proposalOf(tx, c, "Ben")).toMatchObject({ id: second?.id, myState: "choosing", myDays: ["monday"] });
      const confirmed = await tx`
        SELECT proposal_id FROM app.schedule_proposal_members WHERE club_id = ${c.club} AND confirmed_at IS NOT NULL
           AND proposal_id IN (${change.id}, ${second?.id ?? ""})`;
      expect(confirmed).toEqual([{ proposal_id: change.id }]);
      // The old id: the version Ben read is behind too, and the newer proposal is named first.
      for (const command of [confirm, choose]) {
        expect(await refusal(command(tx, c, "Ben", change.id, 1, ["monday", "thursday"]))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: second?.id },
        });
      }
      // Sam, whom the earlier change never included, gets the neutral answer for it (T14).
      expect(await refusal(confirm(tx, c, "Sam", change.id, 2, ["thursday"]))).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("names the club's open change to an id replaced more than once, and treats it as ended once none is open (FQ126)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      await join(tx, c, "Sam", "Ben");
      // Sam leaves: Ben, Maya and Alex again, who still aren't the week's two, so a third change.
      await leaving(tx, c, "Sam");
      const [first, second, third] = await changes(tx, c);
      expect(first).toMatchObject({ id: change.id, state: "superseded", replaced_by: second?.id });
      expect(second).toMatchObject({ state: "superseded", version: 2, replaced_by: third?.id });
      expect(third).toMatchObject({ state: "open", version: 1, effective_from: START });
      // The id two replacements back answers with the open change, never the one between, which has ended.
      for (const command of [confirm, choose]) {
        expect(await refusal(command(tx, c, "Ben", change.id, 1, ["monday", "thursday"]))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: third?.id },
        });
      }
      expect(await refusal(confirm(tx, c, "Ben", second?.id ?? "", 1, ["monday"]))).toEqual({
        code: "MEMBERSHIP_CHANGED",
        facts: { current_id: third?.id },
      });
      // Alex leaves: the club is back at its week, the third change ends, and none is open. Every id of the
      // chain is then an ended proposal: the version it ended at, then NOT_ALLOWED.
      await leaving(tx, c, "Alex");
      expect((await changes(tx, c)).map((each) => each.state)).toEqual(["superseded", "superseded", "superseded"]);
      expect(await refusal(confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      expect(await refusal(confirm(tx, c, "Ben", change.id, 2, ["monday", "thursday"]))).toMatchObject({
        code: "NOT_ALLOWED",
      });
      expect(await refusal(confirm(tx, c, "Ben", third?.id ?? "", 2, ["monday", "thursday"]))).toMatchObject({
        code: "NOT_ALLOWED",
      });
    });
  });

  it("works a change out from a restarted club's own week, not the week before it, and gives its members the announced days (FQ124)", async () => {
    await rolledBack(db, async (tx) => {
      // Ben confirms and leaves; Maya, alone and unconfirmed, sees the first days end (FQ102). Sam joins:
      // new first days with a week of their own, since Ben's confirmed days are in the first (FQ124).
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await confirmOwn(tx, c, "Ben");
      await leaving(tx, c, "Ben");
      await join(tx, c, "Sam", "Maya");
      const mayas = (await confirmOwn(tx, c, "Maya")).myDays;
      const applied = await confirmOwn(tx, c, "Sam");
      expect(applied).toMatchObject({ state: "applied" });
      const sams = applied.myDays;
      const weeks = await tx<{ id: string }[]>`
        SELECT id FROM app.schedule_versions WHERE club_id = ${c.club} ORDER BY effective_from`;
      expect(weeks).toHaveLength(2);
      expect(await changes(tx, c)).toEqual([]);
      // Debby joins: the change keeps Maya's and Sam's days of the second week and gives Debby the two free.
      await join(tx, c, "Debby", "Maya");
      const [change] = await changes(tx, c);
      expect(change).toMatchObject({ state: "open", days_per_member: 2 });
      const free = WEEK.filter((weekday) => ![...mayas, ...sams].includes(weekday as Weekday));
      expect(await proposedIn(tx, c, change?.id ?? "")).toEqual({ Maya: mayas, Sam: sams, Debby: free });
      // Maya and Sam have a day in the club's latest week, started or not; Debby has none.
      expect((await proposalOf(tx, c, "Maya")).announced).toEqual([]);
      expect((await proposalOf(tx, c, "Sam")).announced).toEqual([]);
      expect("announced" in (await proposalOf(tx, c, "Debby"))).toBe(false);
    });
  });

  it("takes a new start for a replacement once the replaced change's start is today", async () => {
    await rolledBack(db, async (tx) => {
      const { c } = await withAlex(tx);
      // Monday 14 December, 00:00 in New York: the start. (`api/b2-change-start` will have ended the change.)
      tick(33 * 24);
      await join(tx, c, "Sam", "Ben");
      // Seen from that Monday the days' window runs to Sunday 17 January 2027.
      expect((await changes(tx, c)).at(-1)).toMatchObject({ state: "open", effective_from: "2027-01-18" });
    });
  });

  it("drops an open change when a leave brings the club back to its week, and its id then answers as an ended one", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      await confirmOwn(tx, c, "Ben");
      tick(3);
      await leaving(tx, c, "Alex");
      const all = await changes(tx, c);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: change.id, state: "superseded", version: 2, replaced_by: null });
      expect(String(all[0]?.closed_at)).toBe(current.toString());
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();
      // No newer proposal: VERSION_CONFLICT, then NOT_ALLOWED, never MEMBERSHIP_CHANGED.
      expect(await refusal(confirm(tx, c, "Maya", change.id, 1, ["tuesday", "friday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      expect(await refusal(confirm(tx, c, "Maya", change.id, 2, ["tuesday", "friday"]))).toMatchObject({
        code: "NOT_ALLOWED",
      });
    });
  });

  it("drops an open change when the club is paused, proposes none, and proposes one when it has two members again (FQ16, FQ116)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      // Maya leaves: Ben and Alex aren't the week's members, so the change is replaced.
      await leaving(tx, c, "Maya");
      const second = (await changes(tx, c)).at(-1);
      expect(second?.id).not.toBe(change.id);
      // The new change is proposed from the week in force, not from the change it replaces: Maya's days
      // are free, and Alex, second of the two, is proposed the table's days for that place.
      expect(await proposedIn(tx, c, second?.id ?? "")).toEqual({
        Ben: ["monday", "thursday"],
        Alex: ["tuesday", "friday"],
      });
      // Alex leaves: Ben is alone, the club paused.
      await leaving(tx, c, "Alex");
      expect((await listClubs(tx, c.user["Ben"] ?? "", now())).clubs).toMatchObject([{ state: "paused" }]);
      const paused = await changes(tx, c);
      expect(paused).toHaveLength(2);
      expect(paused[1]).toMatchObject({ id: second?.id, state: "superseded", version: 2, replaced_by: null });
      expect((await sight(tx, c, "Ben"))?.proposal).toBeNull();
      // Sam joins: the club has two members again, and its week is a change, never new first days.
      await join(tx, c, "Sam", "Ben");
      const resumed = await changes(tx, c);
      expect(resumed).toHaveLength(3);
      expect(resumed[2]).toMatchObject({ state: "open", version: 1, days_per_member: 2 });
      expect(await proposedIn(tx, c, resumed[2]?.id ?? "")).toEqual({
        Ben: ["monday", "thursday"],
        Sam: ["tuesday", "friday"],
      });
      expect((await proposals(tx, c)).filter((each) => each.reason === "activation")).toHaveLength(1);
    });
  });

  it("proposes nothing when the one member of a paused club with no open change leaves too", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      await leaving(tx, c, "Maya");
      expect(await changes(tx, c)).toEqual([]);
      await leaving(tx, c, "Ben");
      expect(await changes(tx, c)).toEqual([]);
    });
  });
});

describe("the days made while a change is open (FQ61, FQ127)", () => {
  it("makes no day from the change's start on, whatever the date, and every day before it as before", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      const last = async () =>
        (
          await tx<
            { last: string }[]
          >`SELECT max(local_date)::text AS last FROM app.occurrences WHERE club_id = ${c.club}`
        )[0]?.last;
      expect(await last()).toBe("2026-12-11");
      await join(tx, c, "Alex", "Ben");
      expect((await changes(tx, c))[0]).toMatchObject({ effective_from: START });
      // Two weeks on the window runs to Sunday 27 December; the change holds the days at 14 December.
      tick(14 * 24);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      expect(await last()).toBe("2026-12-11");
      // Alex leaves: the change is dropped, and the days are made to the window's end again.
      await leaving(tx, c, "Alex");
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      expect(await last()).toBe("2026-12-25");
    });
  });

  it("starts a change after a day already made beyond the window", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      // The days are made a week later, through Saturday 19 December (the window ends on Sunday the 20th); a
      // change proposed in the clock's own week would start on 14 December, among them.
      tick(7 * 24);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      tick(-7 * 24);
      await join(tx, c, "Alex", "Ben");
      expect((await changes(tx, c))[0]).toMatchObject({ effective_from: "2026-12-21" });
    });
  });
});

describe("reading a change (the contract's ScheduleProposal; FQ61, FQ81; G04-change)", () => {
  it("gives a member who stays their days, each other day with the member it is proposed for, and the days announced", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await join(tx, c, "Alex", "Ben");
      const ben = await sight(tx, c, "Ben");
      const change = ben?.proposal;
      expect(change).toMatchObject({
        reason: "membership_change",
        version: 1,
        state: "open",
        effectiveFrom: START,
        daysPerMember: 2,
        myDays: ["monday", "thursday"],
        myState: "choosing",
      });
      const person = (name: string) => ({ membershipId: c.member[name], displayName: name, avatarVersion: null });
      expect(change?.slots).toEqual([
        { weekday: "monday", state: "yours", suggested: true },
        { weekday: "tuesday", state: "available", heldBy: person("Maya"), suggested: false },
        { weekday: "wednesday", state: "available", heldBy: person("Alex"), suggested: false },
        { weekday: "thursday", state: "yours", suggested: true },
        { weekday: "friday", state: "available", heldBy: person("Maya"), suggested: false },
        { weekday: "saturday", state: "available", heldBy: person("Alex"), suggested: false },
      ]);
      // Every day already made and not yet closed, in date order: Thursday 12 November to Friday 11 December.
      const announced = change?.announced ?? [];
      expect(announced.map((day) => day.localDate)).toEqual([
        ...["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-19", "2026-11-20"],
        ...["2026-11-23", "2026-11-24", "2026-11-26", "2026-11-27"],
        ...["2026-11-30", "2026-12-01", "2026-12-03", "2026-12-04"],
        ...["2026-12-07", "2026-12-08", "2026-12-10", "2026-12-11"],
      ]);
      expect(new Set(announced.map((day) => day.phase))).toEqual(new Set(["collecting"]));
      expect(announced[0]).toMatchObject({ clubId: c.club, star: person("Ben") });
      expect(announced[1]).toMatchObject({ star: person("Maya") });
      // The week in force is as it was.
      expect(ben?.current?.assignments.map((each) => [each.weekday, each.person.displayName])).toEqual([
        ["monday", "Ben"],
        ["tuesday", "Maya"],
        ["thursday", "Ben"],
        ["friday", "Maya"],
      ]);

      // Friday 13 November, 8 AM in New York: Thursday's day has closed and Friday's is open.
      tick(2 * 24 + 7);
      const later = (await proposalOf(tx, c, "Maya")).announced ?? [];
      expect(later.slice(0, 2).map((day) => [day.localDate, day.phase])).toEqual([
        ["2026-11-13", "open"],
        ["2026-11-16", "collecting"],
      ]);
      expect(later).toHaveLength(17);
    });
  });

  it("gives the new member the same week and no announced days", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await join(tx, c, "Alex", "Ben");
      const alex = await proposalOf(tx, c, "Alex");
      expect(alex).toMatchObject({ myDays: ["wednesday", "saturday"], myState: "choosing", version: 1 });
      expect(alex).not.toHaveProperty("announced");
      expect(alex.slots.map((each) => [each.weekday, each.state, each.heldBy?.displayName])).toEqual([
        ["monday", "available", "Ben"],
        ["tuesday", "available", "Maya"],
        ["wednesday", "yours", undefined],
        ["thursday", "available", "Ben"],
        ["friday", "available", "Maya"],
        ["saturday", "yours", undefined],
      ]);
    });
  });

  it("names nobody on a day the change proposes for nobody, and leaves a leaver's made days out of the announced", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await join(tx, c, "Alex", "Ben");
      for (const name of ["Ben", "Maya", "Alex"]) await confirmOwn(tx, c, name);
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await leaving(tx, c, "Maya");
      const seen = await proposalOf(tx, c, "Ben");
      expect(slot(seen, "tuesday")).toEqual({ weekday: "tuesday", state: "available", suggested: false });
      expect(slot(seen, "friday")).toEqual({ weekday: "friday", state: "available", suggested: false });
      // Maya's days are held (FQ63): none is announced.
      const stars = new Set((seen.announced ?? []).map((day) => day.star.displayName));
      expect(stars).toEqual(new Set(["Ben", "Alex"]));
    });
  });

  it("gives someone who left, a stranger and a member of another club nothing of it (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      const other = await pair(tx);
      const stranger = await newUser(plain(tx), "Nina");
      expect(await readSchedule(tx, stranger, c.club, now())).toBeNull();
      expect(await readSchedule(tx, other.user["Ben"] ?? "", c.club, now())).toBeNull();
      for (const userId of [stranger, other.user["Ben"] ?? ""]) {
        const asked = tx.savepoint((sp) =>
          confirmScheduleDays(
            sp,
            clock,
            { userId, key: randomUUID(), proposalId: change.id, expectedVersion: 1, weekdays: ["monday", "thursday"] },
            render,
          ),
        );
        expect(await refusal(asked)).toMatchObject({ code: "NOT_FOUND" });
      }
      await leaving(tx, c, "Maya");
      expect(await sight(tx, c, "Maya")).toBeNull();
      const successor = (await changes(tx, c)).at(-1)?.id ?? "";
      for (const id of [change.id, successor]) {
        expect(await refusal(confirm(tx, c, "Maya", id, 1, ["tuesday", "friday"]))).toMatchObject({
          code: "NOT_FOUND",
        });
      }
    });
  });
});

describe("confirming a change (FQ56, FQ81; T1, T19, T33)", () => {
  it("writes the member's confirmation at the clock's instant and nothing else: the same version, state and answer for everyone", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await join(tx, c, "Alex", "Ben");
      const before = { maya: await sight(tx, c, "Maya"), alex: await sight(tx, c, "Alex") };
      const seen = await proposalOf(tx, c, "Ben");
      const rowsBefore = await tx`
        SELECT * FROM app.schedule_proposal_days WHERE proposal_id = ${seen.id} ORDER BY interval_id, weekday`;
      const answer = await confirm(tx, c, "Ben", seen.id, seen.version, ["thursday", "monday"]);
      // Ben's own answer: the same week, confirmed.
      expect(answer).toEqual(JSON.parse(JSON.stringify({ ...seen, myState: "confirmed" })));
      expect(await proposalOf(tx, c, "Ben")).toEqual({ ...seen, myState: "confirmed" });
      // Everyone else's is as it was, to the last field (FQ81, T33).
      expect(await sight(tx, c, "Maya")).toEqual(before.maya);
      expect(await sight(tx, c, "Alex")).toEqual(before.alex);
      const [row] = await changes(tx, c);
      expect(row).toMatchObject({ id: seen.id, state: "open", version: 1, closed_at: null, schedule_version_id: null });
      const members = await tx<{ interval_id: string; confirmed_at: Temporal.Instant | null }[]>`
        SELECT interval_id, confirmed_at FROM app.schedule_proposal_members WHERE proposal_id = ${seen.id}`;
      expect(
        members.map((each) => [each.interval_id, each.confirmed_at === null ? null : String(each.confirmed_at)]).sort(),
      ).toEqual(
        [
          [c.member["Ben"], current.toString()],
          [c.member["Maya"], null],
          [c.member["Alex"], null],
        ].sort(),
      );
      expect(
        await tx`SELECT * FROM app.schedule_proposal_days WHERE proposal_id = ${seen.id} ORDER BY interval_id, weekday`,
      ).toEqual(rowsBefore);
      // No day joins any week, and none is made, before the start.
      expect(await tx`SELECT FROM app.schedule_assignments WHERE club_id = ${c.club}`).toHaveLength(4);
      expect(await tx`SELECT FROM app.schedule_versions WHERE club_id = ${c.club}`).toHaveLength(1);
      // Every member confirms: it stays open at its version until its start.
      await confirmOwn(tx, c, "Maya");
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "open", version: 1, myState: "confirmed" });
      expect((await changes(tx, c))[0]).toMatchObject({ state: "open", version: 1 });
    });
  });

  it("refuses, in the contract's order: VERSION_CONFLICT, then NOT_ALLOWED for other days, a choice and a second confirmation", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      expect(await refusal(confirm(tx, c, "Ben", change.id, 2, ["tuesday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 1 },
      });
      const notAllowed = async (weekdays: readonly Weekday[]) => {
        expect(await refusal(confirm(tx, c, "Ben", change.id, 1, weekdays))).toMatchObject({ code: "NOT_ALLOWED" });
      };
      // One of Ben's two days, Maya's days, one of each, and a day proposed for nobody.
      await notAllowed(["monday"]);
      await notAllowed(["tuesday", "friday"]);
      await notAllowed(["monday", "friday"]);
      // A change has no choosing: the days it proposes for the caller are refused too.
      for (const weekdays of [["monday", "thursday"], ["wednesday"], []] as const) {
        expect(await refusal(choose(tx, c, "Ben", change.id, 1, weekdays))).toMatchObject({ code: "NOT_ALLOWED" });
      }
      expect(
        await tx`SELECT FROM app.schedule_proposal_members WHERE proposal_id = ${change.id} AND confirmed_at IS NOT NULL`,
      ).toEqual([]);
      await confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"]);
      await notAllowed(["monday", "thursday"]);
    });
  });

  it("answers a retry under the same key with the first answer, once, and another request under it IDEMPOTENCY_CONFLICT (T19)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      const key = randomUUID();
      const first = await confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"], key);
      const [at] = await tx<{ confirmed_at: Temporal.Instant }[]>`
        SELECT confirmed_at FROM app.schedule_proposal_members
         WHERE proposal_id = ${change.id} AND interval_id = ${c.member["Ben"] ?? ""}`;
      tick(5);
      expect(await confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"], key)).toEqual(first);
      const [again] = await tx<{ confirmed_at: Temporal.Instant }[]>`
        SELECT confirmed_at FROM app.schedule_proposal_members
         WHERE proposal_id = ${change.id} AND interval_id = ${c.member["Ben"] ?? ""}`;
      expect(String(again?.confirmed_at)).toBe(String(at?.confirmed_at));
      expect(await refusal(confirm(tx, c, "Ben", change.id, 1, ["monday"], key))).toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
      });
    });
  });

  it("answers a retry with the first answer after the change was replaced, and nothing once the caller has left (T19, T14)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, change } = await withAlex(tx);
      const key = randomUUID();
      const first = await confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"], key);
      await join(tx, c, "Sam", "Ben");
      expect((await changes(tx, c))[0]).toMatchObject({ id: change.id, state: "superseded" });
      // The same request under the same key: the stored answer, as it was, though the change has ended.
      expect(await confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"], key)).toEqual(first);
      // Once Ben has left, the key gives nothing: the neutral answer comes before the receipt (T14).
      await leaving(tx, c, "Ben");
      expect(await refusal(confirm(tx, c, "Ben", change.id, 1, ["monday", "thursday"], key))).toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("confirmations and a leave at once, on connections of their own", () => {
  const outcome = (done: Promise<unknown>): Promise<unknown> =>
    done.then(
      (answer) => answer,
      (error: unknown) => (error as { code?: string }).code ?? String(error),
    );
  /** Ben, Maya and Alex with an open change, committed. */
  const three = () => db.begin((raw) => withAlex(raw as unknown as WorldTx));
  const confirmingAlone = (c: Club, name: string, proposalId: string, weekdays: Weekday[]) =>
    db.begin((tx) =>
      confirmScheduleDays(
        tx as unknown as WorldTx,
        clock,
        { userId: c.user[name] ?? "", key: randomUUID(), proposalId, expectedVersion: 1, weekdays },
        render,
      ),
    );
  const leavingAlone = (c: Club, name: string) =>
    db.begin((tx) =>
      leaveClub(
        tx as unknown as WorldTx,
        clock,
        { userId: c.user[name] ?? "", key: randomUUID(), clubId: c.club, contributions: "keep" },
        leftClubBody,
      ),
    );
  const rowOf = async (proposal: string) =>
    (
      await db<{ state: string; version: number; confirmed: number }[]>`
        SELECT p.state, p.version,
               (SELECT count(*)::int FROM app.schedule_proposal_members m
                 WHERE m.proposal_id = p.id AND m.confirmed_at IS NOT NULL) AS confirmed
          FROM app.schedule_proposals p WHERE p.id = ${proposal}`
    )[0];

  it("takes two members' confirmations one after the other, and moves no version", { timeout: 30_000 }, async () => {
    const s = await three();
    const hold = await holding(db, s.c.club);
    let ben: Promise<unknown>;
    let maya: Promise<unknown>;
    try {
      ben = outcome(confirmingAlone(s.c, "Ben", s.change.id, ["monday", "thursday"]));
      await waitingOn(db, hold.pid, 1);
      maya = outcome(confirmingAlone(s.c, "Maya", s.change.id, ["tuesday", "friday"]));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await ben).toMatchObject({ state: "open", version: 1, myState: "confirmed" });
    expect(await maya).toMatchObject({ state: "open", version: 1, myState: "confirmed" });
    expect(await rowOf(s.change.id)).toEqual({ state: "open", version: 1, confirmed: 2 });
  });

  it("refuses a confirmation that comes after the leave that dropped the change", { timeout: 30_000 }, async () => {
    const s = await three();
    const hold = await holding(db, s.c.club);
    let left: Promise<unknown>;
    let ben: Promise<unknown>;
    try {
      left = outcome(leavingAlone(s.c, "Alex"));
      await waitingOn(db, hold.pid, 1);
      ben = outcome(confirmingAlone(s.c, "Ben", s.change.id, ["monday", "thursday"]));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await left).toMatchObject({ club_id: s.c.club });
    expect(await ben).toBe("VERSION_CONFLICT");
    expect(await rowOf(s.change.id)).toEqual({ state: "superseded", version: 2, confirmed: 0 });
  });

  it("takes a confirmation that comes before the leave, which then drops the change", { timeout: 30_000 }, async () => {
    const s = await three();
    const hold = await holding(db, s.c.club);
    let left: Promise<unknown>;
    let ben: Promise<unknown>;
    try {
      ben = outcome(confirmingAlone(s.c, "Ben", s.change.id, ["monday", "thursday"]));
      await waitingOn(db, hold.pid, 1);
      left = outcome(leavingAlone(s.c, "Alex"));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await ben).toMatchObject({ state: "open", version: 1, myState: "confirmed" });
    expect(await left).toMatchObject({ club_id: s.c.club });
    expect(await rowOf(s.change.id)).toEqual({ state: "superseded", version: 2, confirmed: 1 });
  });

  it(
    "answers MEMBERSHIP_CHANGED to a confirmation that comes after the leave that replaced the change",
    { timeout: 30_000 },
    async () => {
      // Ben, Maya, Alex and Sam, with a change open for the four. Sam's leave replaces it with one for three.
      const s = await db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const made = await withAlex(tx);
        await join(tx, made.c, "Sam", "Ben");
        const open = (await changes(tx, made.c)).at(-1);
        if (open === undefined) throw new Error("no change for the four");
        return { c: made.c, change: open };
      });
      const hold = await holding(db, s.c.club);
      let left: Promise<unknown>;
      let ben: Promise<unknown>;
      try {
        left = outcome(leavingAlone(s.c, "Sam"));
        await waitingOn(db, hold.pid, 1);
        ben = outcome(confirmingAlone(s.c, "Ben", s.change.id, ["monday"]));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await left).toMatchObject({ club_id: s.c.club });
      expect(await ben).toBe("MEMBERSHIP_CHANGED");
      expect(await rowOf(s.change.id)).toEqual({ state: "superseded", version: 2, confirmed: 0 });
      const [next] = await db<{ id: string; state: string }[]>`
      SELECT id, state FROM app.schedule_proposals WHERE replaced_by IS NULL AND state = 'open' AND club_id = ${s.c.club}`;
      expect(next?.id).not.toBe(s.change.id);
    },
  );
});
