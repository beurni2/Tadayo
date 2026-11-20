/// <reference lib="esnext.temporal" />
// A join or a leave in a club's first days, against Postgres as `tadayo_app` (spec 04, 05; T1, T6, T14,
// T33, T49; FQ16, FQ55, FQ61, FQ100, FQ102, FQ123, FQ124; docs/plans/api-b2-first-days-roster.md;
// packages/domain/src/schedule/settle.ts, roster-change.ts). Every club here is made the way the product
// makes one: `createClub`, `proposeRoster`, `createInvitation`, `acceptInvitation`, `approveRoster`,
// `leaveClub`, and the schedule's own `chooseScheduleDays` and `confirmScheduleDays`, each as its route
// runs it, with the checks Postgres keeps for the commit run after each.
//
// Written before `settleFirstDays` existed and before the commands called it, from the plan's sections 0
// and 4; the journal's entry for the commit says which of them failed then.

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
import { acceptWith, approve, founded, linkFor, plain, propose, refusal } from "./roster-world.ts";
import { holding, waitingOn } from "./week-world.ts";
import { checkAsAtCommit, newUser } from "./world.ts";

const db = worldSql(6);
afterAll(async () => {
  await db.end();
});

// Wednesday 11 November 2026, midnight in New York.
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const clock = fakeClock(AT_FIRST);
let current = FIRST;
beforeEach(() => {
  current = FIRST;
  clock.set(FIRST);
});
/** The clock moves on by `hours`. */
const tick = (hours: number): void => {
  current = current.add({ hours });
  clock.set(current);
};
const now = (): ServerNow => current as ServerNow;

interface Club {
  club: string;
  /** Accounts and membership intervals, by name. */
  user: Record<string, string>;
  member: Record<string, string>;
}

const committed = (tx: WorldTx) => checkAsAtCommit(plain(tx));

/** Ben's club with Maya, started by Maya's acceptance: its first days are open, two days each. */
async function started(tx: WorldTx): Promise<Club> {
  const ben = await founded(tx, clock);
  const c: Club = { club: ben.club, user: { Ben: ben.user }, member: { Ben: ben.interval } };
  await join(tx, c, "Maya", "Ben");
  return c;
}

/**
 * `proposer` proposes `name`, every other member approves, and a new account of that name accepts, a
 * minute after whatever came before: members are in the order they joined (FQ98), and two who joined at
 * one instant would be in the order of their ids (FQ114).
 */
async function join(tx: WorldTx, c: Club, name: string, proposer: string): Promise<void> {
  current = current.add({ minutes: 1 });
  clock.set(current);
  const by = c.user[proposer] ?? "";
  const open = await propose(tx, clock, by, c.club, [name]);
  const candidate = open.candidates.find((each) => each.name === name)?.id ?? "";
  const active = await tx<{ user_id: string }[]>`
    SELECT user_id FROM app.memberships WHERE club_id = ${c.club} AND state = 'active'`;
  for (const { user_id: other } of active) {
    if (other !== by) await approve(tx, clock, other, open.id, open.version);
  }
  const made = await linkFor(tx, clock, by, c.club, candidate);
  const account = await newUser(plain(tx), name);
  const answer = await acceptWith(tx, clock, account, made.token, open.id, open.version);
  if (answer.state !== "joined" || answer.club === undefined) throw new Error(`join: ${name} is ${answer.state}`);
  c.user[name] = account;
  c.member[name] = answer.club.my_membership_id;
  await committed(tx);
}

async function leaving(tx: WorldTx, c: Club, name: string): Promise<void> {
  await tx.savepoint((sp) =>
    leaveClub(
      sp,
      clock,
      { userId: c.user[name] ?? "", key: randomUUID(), clubId: c.club, contributions: "keep" },
      leftClubBody,
    ),
  );
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
  ): Promise<ProposalAnswer> => {
    const answer = await tx.savepoint((sp) =>
      command(
        sp,
        clock,
        { userId: c.user[name] ?? "", key: randomUUID(), proposalId, expectedVersion, weekdays },
        render,
      ),
    );
    await committed(tx);
    return answer as unknown as ProposalAnswer;
  };
const choose = send(chooseScheduleDays);
const confirm = send(confirmScheduleDays);

/** `name` confirms the days they hold, having just read the proposal. */
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
  replaced_by: string | null;
  schedule_version_id: string;
  closed_at: Temporal.Instant | null;
}

/** The club's proposals, the earliest first. */
const proposals = (tx: WorldTx, c: Club): Promise<ProposalRow[]> =>
  tx<ProposalRow[]>`
    SELECT id, reason, state, version, week_revision, days_per_member, replaced_by, schedule_version_id, closed_at
      FROM app.schedule_proposals WHERE club_id = ${c.club} ORDER BY created_at, id`;

const includedIn = async (tx: WorldTx, proposal: string): Promise<string[]> =>
  (
    await tx<{ interval_id: string }[]>`
      SELECT interval_id FROM app.schedule_proposal_members WHERE proposal_id = ${proposal} ORDER BY interval_id COLLATE "C"`
  ).map((row) => row.interval_id);

const dayRows = (tx: WorldTx, proposal: string, week: number) =>
  tx`SELECT interval_id, weekday::text AS weekday, suggested, held, week_revision
       FROM app.schedule_proposal_days WHERE proposal_id = ${proposal} AND week_revision = ${week}
      ORDER BY interval_id, weekday`;

const slot = (proposal: ProposalAnswer, weekday: Weekday) => proposal.slots.find((each) => each.weekday === weekday);
const suggestedOf = (proposal: ProposalAnswer) =>
  proposal.slots.filter((each) => each.suggested).map((each) => each.weekday);

describe("a join before any day is confirmed (FQ55, FQ102)", () => {
  it("includes the new member in the same proposal, at its next version, and moves nobody", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      const first = await proposalOf(tx, c, "Ben");
      expect(first).toMatchObject({ version: 1, daysPerMember: 2, myDays: ["monday", "thursday"] });
      // Maya contests Ben's Monday.
      await choose(tx, c, "Maya", first.id, 1, ["monday", "friday"]);
      tick(1);
      await join(tx, c, "Alex", "Ben");

      expect(await proposals(tx, c)).toMatchObject([
        { id: first.id, state: "open", version: 2, week_revision: 1, days_per_member: 2, replaced_by: null },
      ]);
      expect(await includedIn(tx, first.id)).toEqual([c.member["Ben"], c.member["Maya"], c.member["Alex"]].sort());
      // Alex is proposed the third place's days, which nobody holds, and holds them.
      const alex = await proposalOf(tx, c, "Alex");
      expect(alex).toMatchObject({ id: first.id, version: 2, myDays: ["wednesday", "saturday"], myState: "choosing" });
      expect(suggestedOf(alex)).toEqual(["wednesday", "saturday"]);
      // Nobody else moved: the contest is as it was.
      const ben = await proposalOf(tx, c, "Ben");
      expect(ben.myDays).toEqual(["monday", "thursday"]);
      expect(slot(ben, "monday")?.state).toBe("clash");
      expect((await proposalOf(tx, c, "Maya")).myDays).toEqual(["monday", "friday"]);
      expect(slot(alex, "monday")?.state).toBe("no_reveal");
    });
  });

  it("answers a request made with the earlier version VERSION_CONFLICT and the new one, then takes it", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      const first = await proposalOf(tx, c, "Ben");
      await join(tx, c, "Alex", "Ben");
      expect(await refusal(confirm(tx, c, "Ben", first.id, 1, ["monday", "thursday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      const answer = await confirm(tx, c, "Alex", first.id, 2, ["wednesday", "saturday"]);
      expect(answer).toMatchObject({ state: "open", version: 2, myState: "confirmed" });
      const written = await tx`
        SELECT weekday::text AS weekday FROM app.schedule_assignments
         WHERE star_interval_id = ${c.member["Alex"] ?? ""} ORDER BY weekday`;
      expect(written.map((row) => row["weekday"] as string).sort()).toEqual(["saturday", "wednesday"]);
    });
  });

  it("gives a new member the first free days when someone holds the days of their place", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      const first = await proposalOf(tx, c, "Maya");
      await choose(tx, c, "Maya", first.id, 1, ["wednesday", "saturday"]);
      await join(tx, c, "Alex", "Ben");
      const alex = await proposalOf(tx, c, "Alex");
      expect(alex.myDays).toEqual(["tuesday", "friday"]);
      expect(suggestedOf(alex)).toEqual(["tuesday", "friday"]);
    });
  });

  it("proposes the whole week again when a fourth member joins three, and again when one of four leaves", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      const three = await proposalOf(tx, c, "Maya");
      await choose(tx, c, "Maya", three.id, three.version, ["wednesday", "thursday"]);
      const weekOne = await dayRows(tx, three.id, 1);
      expect(weekOne.length).toBeGreaterThan(0);

      await join(tx, c, "Sam", "Ben");
      expect(await proposals(tx, c)).toMatchObject([
        { id: three.id, state: "open", version: 3, week_revision: 2, days_per_member: 1 },
      ]);
      // One day each, in the order they joined; earlier choices are set aside.
      for (const [name, day] of [
        ["Ben", "monday"],
        ["Maya", "tuesday"],
        ["Alex", "wednesday"],
        ["Sam", "thursday"],
      ] as const) {
        const seen = await proposalOf(tx, c, name);
        expect(seen).toMatchObject({ version: 3, daysPerMember: 1, myDays: [day], myState: "choosing" });
        expect(suggestedOf(seen)).toEqual([day]);
        expect(seen.slots.filter((each) => each.state === "clash" || each.state === "no_reveal")).toEqual([]);
      }
      // The earlier week's rows are as they were.
      expect(await dayRows(tx, three.id, 1)).toEqual(weekOne);
      const weekTwo = await dayRows(tx, three.id, 2);
      expect(weekTwo).toHaveLength(4);

      // Sam leaves: three again, two days each, proposed afresh.
      const sam = c.user["Sam"] ?? "";
      await leaving(tx, c, "Sam");
      expect(await proposals(tx, c)).toMatchObject([
        { id: three.id, state: "open", version: 4, week_revision: 3, days_per_member: 2 },
      ]);
      expect((await proposalOf(tx, c, "Ben")).myDays).toEqual(["monday", "thursday"]);
      expect((await proposalOf(tx, c, "Maya")).myDays).toEqual(["tuesday", "friday"]);
      expect((await proposalOf(tx, c, "Alex")).myDays).toEqual(["wednesday", "saturday"]);
      expect(await readSchedule(tx, sam, c.club, now())).toBeNull();
      expect(await dayRows(tx, three.id, 1)).toEqual(weekOne);
      expect(await dayRows(tx, three.id, 2)).toEqual(weekTwo);
      // Each confirms the new week.
      await confirmOwn(tx, c, "Ben");
      await confirmOwn(tx, c, "Maya");
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied", version: 5 });
    });
  });

  it("reads and writes the current week alone once the week was proposed again: a choice, then a fifth member", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      await join(tx, c, "Sam", "Ben");
      // The second week, one day each. Maya takes Saturday, a day nobody was proposed: a new row, in that week.
      const four = await proposalOf(tx, c, "Maya");
      expect(four).toMatchObject({ version: 3, myDays: ["tuesday"] });
      await choose(tx, c, "Maya", four.id, four.version, ["saturday"]);
      expect((await proposalOf(tx, c, "Maya")).myDays).toEqual(["saturday"]);
      // Debby joins as the fifth. In the first week, of three members, every day but Sunday was held; in the
      // current one Tuesday and Friday are free, and Friday is the fifth place's day.
      await join(tx, c, "Debby", "Ben");
      expect(await proposals(tx, c)).toMatchObject([
        { id: four.id, state: "open", version: 4, week_revision: 2, days_per_member: 1 },
      ]);
      expect((await proposalOf(tx, c, "Debby")).myDays).toEqual(["friday"]);
      expect((await proposalOf(tx, c, "Maya")).myDays).toEqual(["saturday"]);
      expect(await dayRows(tx, four.id, 2)).toHaveLength(6);
    });
  });
});

describe("a join once a day is confirmed (FQ100)", () => {
  it("joins with no day, outside the first days, and moves no version", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      const first = await confirmOwn(tx, c, "Ben");
      expect(first).toMatchObject({ state: "open", version: 1 });
      await join(tx, c, "Alex", "Ben");

      expect(await proposals(tx, c)).toMatchObject([{ id: first.id, state: "open", version: 1, week_revision: 1 }]);
      expect(await includedIn(tx, first.id)).toEqual([c.member["Ben"], c.member["Maya"]].sort());
      // Alex gets the club's week in force and no proposal; the proposal's id gives them nothing.
      const alex = await sight(tx, c, "Alex");
      expect(alex?.proposal).toBeNull();
      expect(await refusal(choose(tx, c, "Alex", first.id, 1, ["wednesday"]))).toEqual({
        code: "NOT_FOUND",
        facts: {},
      });
      // Maya still sees the same version, and Maya's confirmation applies the first days: Alex isn't waited for.
      expect((await proposalOf(tx, c, "Maya")).version).toBe(1);
      expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied", version: 2 });
    });
  });
});

describe("a leave before any day is confirmed (FQ102)", () => {
  it("frees the leaver's days in the same week, at the next version", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      const before = await proposalOf(tx, c, "Ben");
      expect(slot(before, "tuesday")).toMatchObject({ state: "available", heldBy: { displayName: "Maya" } });
      await leaving(tx, c, "Maya");

      expect(await proposals(tx, c)).toMatchObject([
        { id: before.id, state: "open", version: 3, week_revision: 1, days_per_member: 2 },
      ]);
      const ben = await proposalOf(tx, c, "Ben");
      expect(ben.myDays).toEqual(["monday", "thursday"]);
      expect(slot(ben, "tuesday")).toEqual({ weekday: "tuesday", state: "available", suggested: false });
      expect(slot(ben, "friday")).toEqual({ weekday: "friday", state: "available", suggested: false });
      expect((await proposalOf(tx, c, "Alex")).myDays).toEqual(["wednesday", "saturday"]);
      expect(await refusal(choose(tx, c, "Ben", before.id, before.version, ["tuesday", "friday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 3 },
      });
      await choose(tx, c, "Ben", before.id, 3, ["tuesday", "friday"]);
    });
  });

  it("ends the first days of a club of two with no successor, and opens new ones at the next join", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      const first = await proposalOf(tx, c, "Maya");
      tick(2);
      await leaving(tx, c, "Ben");

      const [ended] = await proposals(tx, c);
      expect(ended).toMatchObject({ id: first.id, state: "superseded", version: 2, replaced_by: null });
      expect(String(ended?.closed_at)).toBe(current.toString());
      // Maya, alone in a paused club, has no proposal, and confirms no day the club won't make.
      expect((await listClubs(tx, c.user["Maya"] ?? "", now())).clubs).toMatchObject([{ state: "paused" }]);
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();
      expect(await refusal(confirm(tx, c, "Maya", first.id, 1, ["tuesday", "friday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      expect(await refusal(confirm(tx, c, "Maya", first.id, 2, ["tuesday", "friday"]))).toMatchObject({
        code: "NOT_ALLOWED",
      });
      expect(await tx`SELECT FROM app.schedule_assignments WHERE club_id = ${c.club}`).toHaveLength(0);

      // Sam joins: new first days for the two, in the club's first week, which held no confirmed day.
      tick(1);
      await join(tx, c, "Sam", "Maya");
      const all = await proposals(tx, c);
      expect(all).toHaveLength(2);
      expect(all[1]).toMatchObject({
        state: "open",
        version: 1,
        week_revision: 1,
        days_per_member: 2,
        schedule_version_id: ended?.schedule_version_id,
      });
      expect(await tx`SELECT FROM app.schedule_versions WHERE club_id = ${c.club}`).toHaveLength(1);
      expect(await includedIn(tx, all[1]?.id ?? "")).toEqual([c.member["Maya"], c.member["Sam"]].sort());
      expect((await proposalOf(tx, c, "Maya")).myDays).toEqual(["monday", "thursday"]);
      expect((await proposalOf(tx, c, "Sam")).myDays).toEqual(["tuesday", "friday"]);
      await confirmOwn(tx, c, "Maya");
      expect(await confirmOwn(tx, c, "Sam")).toMatchObject({ state: "applied", version: 2 });
      // A third first days is never opened over an applied one: the week for the three is a membership
      // change (tests/src/db/membership-change.test.ts).
      await join(tx, c, "Debby", "Maya");
      const after = await proposals(tx, c);
      expect(after.map((each) => [each.reason, each.state])).toEqual([
        ["activation", "superseded"],
        ["activation", "applied"],
        ["membership_change", "open"],
      ]);
    });
  });
});

describe("a leave once a day is confirmed (FQ102)", () => {
  it("applies the first days when only confirmed members stay, at the leave's own instant", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      await confirmOwn(tx, c, "Ben");
      const open = await confirmOwn(tx, c, "Alex");
      expect(open).toMatchObject({ state: "open", version: 2 });
      tick(4);
      await leaving(tx, c, "Maya");
      const [applied] = await proposals(tx, c);
      expect(applied).toMatchObject({ id: open.id, state: "applied", version: 3, days_per_member: 2 });
      expect(String(applied?.closed_at)).toBe(current.toString());
      expect(current.toString()).toBe("2026-11-11T09:02:00.123456Z");
    });
    // A club of two: the one who stays had confirmed, and is alone in a paused club whose first days applied.
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await confirmOwn(tx, c, "Ben");
      await leaving(tx, c, "Maya");
      expect(await proposals(tx, c)).toMatchObject([{ state: "applied", version: 2 }]);
      // The join that follows opens no first days: Sam gets a pick of the free days (FQ127).
      await join(tx, c, "Sam", "Ben");
      expect((await proposals(tx, c)).map((each) => [each.reason, each.state])).toEqual([
        ["activation", "applied"],
        ["membership_change", "open"],
      ]);
    });
  });

  it("changes nothing, and no version, when someone who hasn't confirmed stays in a club of two or more", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      await confirmOwn(tx, c, "Ben");
      const before = await proposalOf(tx, c, "Maya");
      await leaving(tx, c, "Alex");
      expect(await proposals(tx, c)).toMatchObject([
        { id: before.id, state: "open", version: before.version, week_revision: 1, days_per_member: 2 },
      ]);
      // Alex's days are free, with no name, and Maya's request with the version Maya read still stands.
      const maya = await proposalOf(tx, c, "Maya");
      expect(maya.version).toBe(before.version);
      expect(slot(maya, "wednesday")).toEqual({ weekday: "wednesday", state: "available", suggested: false });
      expect(await confirm(tx, c, "Maya", before.id, before.version, ["tuesday", "friday"])).toMatchObject({
        state: "applied",
      });
    });
  });

  it("keeps the leaver's confirmed day taken, with their name and no first date", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      const confirmed = await confirmOwn(tx, c, "Ben");
      expect(slot(await proposalOf(tx, c, "Maya"), "monday")).toMatchObject({
        state: "taken",
        firstDate: "2026-11-16",
      });
      await leaving(tx, c, "Ben");
      expect(await proposals(tx, c)).toMatchObject([{ state: "open", version: confirmed.version }]);
      const maya = await proposalOf(tx, c, "Maya");
      const monday = slot(maya, "monday");
      expect(monday).toMatchObject({ state: "taken", owner: { displayName: "Ben" } });
      expect(monday).not.toHaveProperty("firstDate");
      expect(await refusal(choose(tx, c, "Maya", maya.id, maya.version, ["monday", "friday"]))).toMatchObject({
        code: "NOT_ALLOWED",
      });
    });
  });

  it("ends the first days when the one member left hasn't confirmed, and starts the next after the days already made (FQ124)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      // Ben confirms Monday and Thursday at midnight on Wednesday the 11th; Ben's days are made four weeks ahead.
      await confirmOwn(tx, c, "Ben");
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      const [last] = await tx<{ last: string }[]>`
        SELECT max(local_date)::text AS last FROM app.occurrences WHERE club_id = ${c.club}`;
      expect(last?.last).toBe("2026-12-10");
      await leaving(tx, c, "Ben");
      const [ended] = await proposals(tx, c);
      expect(ended).toMatchObject({ state: "superseded", version: 2, replaced_by: null });
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();

      tick(1);
      await join(tx, c, "Sam", "Maya");
      const all = await proposals(tx, c);
      expect(all).toHaveLength(2);
      expect(all[1]).toMatchObject({ state: "open", version: 1, days_per_member: 2 });
      expect(all[1]?.schedule_version_id).not.toBe(ended?.schedule_version_id);
      const versions = await tx<{ id: string; effective_from: string }[]>`
        SELECT id, effective_from::text AS effective_from FROM app.schedule_versions
         WHERE club_id = ${c.club} ORDER BY effective_from`;
      // The day after the last day already made.
      expect(versions).toMatchObject([
        { effective_from: "2026-11-11" },
        { id: all[1]?.schedule_version_id, effective_from: "2026-12-11" },
      ]);
      // Every day is free in the new week, Ben's Monday included.
      const maya = await proposalOf(tx, c, "Maya");
      expect(maya).toMatchObject({ myDays: ["monday", "thursday"], effectiveFrom: "2026-12-11" });
      expect(maya.slots.filter((each) => each.state === "taken")).toEqual([]);
      const answer = await confirmOwn(tx, c, "Maya");
      // No first date before the week's start: the Monday and the Thursday after 11 December.
      expect(slot(answer, "monday")).toMatchObject({ state: "yours", firstDate: "2026-12-14" });
      expect(slot(answer, "thursday")).toMatchObject({ state: "yours", firstDate: "2026-12-17" });
      expect(await confirmOwn(tx, c, "Sam")).toMatchObject({ state: "applied" });
      // Until the new week starts, the week in force is the earlier one, which holds Ben's two days alone
      // and none of Maya's or Sam's. Ben has left, so the club's week shows none of them: it lists only
      // members still in the club, and Sam never met Ben (FQ124; Schedule.current).
      const waiting = await sight(tx, c, "Sam");
      expect(waiting?.proposal).toBeNull();
      expect(waiting?.current).toBeNull();
      // The days made afterwards follow the ones already made, and none is Ben's.
      tick(7 * 24);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      const made = await tx<{ first: string | null }[]>`
        SELECT min(local_date)::text AS first FROM app.occurrences
         WHERE club_id = ${c.club} AND star_interval_id <> ${c.member["Ben"] ?? ""}`;
      // Sam's Friday is the week's own first day.
      expect(made).toEqual([{ first: "2026-12-11" }]);
      // From that day the week in force is the new one: Maya's and Sam's days, and none of Ben's.
      tick(23 * 24);
      const inForce = await sight(tx, c, "Sam");
      expect(inForce?.current?.effectiveFrom).toBe("2026-12-11");
      expect(inForce?.current?.assignments.map((each) => [each.weekday, each.person.membershipId])).toEqual([
        ["monday", c.member["Maya"]],
        ["tuesday", c.member["Sam"]],
        ["thursday", c.member["Maya"]],
        ["friday", c.member["Sam"]],
      ]);
    });
  });

  it("starts a restarted club's week the day after its first when nothing was made and the day is the same", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await confirmOwn(tx, c, "Ben");
      await leaving(tx, c, "Ben");
      await join(tx, c, "Sam", "Maya");
      const versions = await tx<{ effective_from: string }[]>`
        SELECT effective_from::text AS effective_from FROM app.schedule_versions
         WHERE club_id = ${c.club} ORDER BY effective_from`;
      expect(versions).toEqual([{ effective_from: "2026-11-11" }, { effective_from: "2026-11-12" }]);
    });
  });

  it("starts a restarted club's week today when every day already made is past", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await confirmOwn(tx, c, "Ben");
      tick(1);
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await leaving(tx, c, "Ben");
      // Forty days on, Monday 21 December: Ben's last made day, 10 December, is behind.
      tick(40 * 24);
      await join(tx, c, "Sam", "Maya");
      const versions = await tx<{ effective_from: string }[]>`
        SELECT effective_from::text AS effective_from FROM app.schedule_versions
         WHERE club_id = ${c.club} ORDER BY effective_from`;
      expect(versions).toEqual([{ effective_from: "2026-11-11" }, { effective_from: "2026-12-21" }]);
    });
  });

  it("uses a restarted club's own week again when nobody confirmed in it and the club restarts a second time", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      // The first restart, with a week of its own: Ben confirmed in the first week and left (FQ124).
      await confirmOwn(tx, c, "Ben");
      await leaving(tx, c, "Ben");
      await join(tx, c, "Sam", "Maya");
      const second = await proposalOf(tx, c, "Maya");
      expect(second.effectiveFrom).toBe("2026-11-12");
      // Nobody confirms in it, and Sam leaves: the club is paused, its second first days ended.
      tick(1);
      await leaving(tx, c, "Sam");
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();
      // The second restart, a day later: no day was confirmed in the club's latest week, so it is used again.
      tick(24);
      await join(tx, c, "Alex", "Maya");
      const all = await proposals(tx, c);
      expect(all.map((each) => [each.reason, each.state, each.replaced_by])).toEqual([
        ["activation", "superseded", null],
        ["activation", "superseded", null],
        ["activation", "open", null],
      ]);
      expect(all[1]?.id).toBe(second.id);
      expect(all[2]?.schedule_version_id).toBe(all[1]?.schedule_version_id);
      expect(all[2]?.schedule_version_id).not.toBe(all[0]?.schedule_version_id);
      expect(await tx`SELECT FROM app.schedule_versions WHERE club_id = ${c.club}`).toHaveLength(2);
      const third = await proposalOf(tx, c, "Maya");
      expect(third).toMatchObject({ effectiveFrom: "2026-11-12", version: 1, myDays: ["monday", "thursday"] });
      expect(third.slots.filter((each) => each.state === "taken")).toEqual([]);
      expect(await includedIn(tx, third.id)).toEqual([c.member["Alex"], c.member["Maya"]].sort());
      // The days confirmed in it join that week, and apply it.
      const maya = await confirmOwn(tx, c, "Maya");
      expect(slot(maya, "monday")).toMatchObject({ state: "yours", firstDate: "2026-11-16" });
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied" });
      expect(
        await tx`SELECT FROM app.schedule_assignments WHERE schedule_version_id = ${all[2]?.schedule_version_id ?? ""}`,
      ).toHaveLength(4);
    });
  });

  it("ends the first days when nobody they include is left, and opens new ones at once for those who remain (FQ123)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await started(tx);
      await confirmOwn(tx, c, "Ben");
      await join(tx, c, "Alex", "Ben");
      await join(tx, c, "Sam", "Ben");
      const first = await proposalOf(tx, c, "Maya");
      // Ben leaves: Maya hasn't confirmed, and the club has three members. Nothing moves.
      await leaving(tx, c, "Ben");
      expect(await proposals(tx, c)).toMatchObject([{ id: first.id, state: "open", version: first.version }]);
      // Maya leaves: the first days include nobody who is left.
      tick(1);
      await leaving(tx, c, "Maya");
      const all = await proposals(tx, c);
      expect(all).toHaveLength(2);
      expect(all[0]).toMatchObject({
        id: first.id,
        state: "superseded",
        version: first.version + 1,
        replaced_by: null,
      });
      expect(all[1]).toMatchObject({ state: "open", version: 1, days_per_member: 2 });
      expect(await includedIn(tx, all[1]?.id ?? "")).toEqual([c.member["Alex"], c.member["Sam"]].sort());
      // Ben had confirmed, so the new first days have a week of their own (FQ124): here the day after the
      // first week's start, since none of Ben's days was made; after the last of them when they were.
      expect((await proposalOf(tx, c, "Alex")).effectiveFrom).toBe("2026-11-12");
      expect((await proposalOf(tx, c, "Alex")).myDays).toEqual(["monday", "thursday"]);
      expect((await proposalOf(tx, c, "Sam")).myDays).toEqual(["tuesday", "friday"]);
    });
  });
});

describe("a confirmation and a leave at once (T1; docs/plans/api-b2-schedule.md, for PR 3)", () => {
  const outcome = (done: Promise<unknown>): Promise<unknown> =>
    done.then(
      (answer) => answer,
      (error: unknown) => (error as { code?: string }).code ?? String(error),
    );

  /** Ben, Maya and Alex, committed; Ben has confirmed. */
  const three = () =>
    db.begin(async (raw) => {
      const tx = raw as unknown as WorldTx;
      const c = await started(tx);
      await join(tx, c, "Alex", "Ben");
      const seen = await confirmOwn(tx, c, "Ben");
      return { c, proposal: seen.id, version: seen.version };
    });

  const leavingAlone = (c: Club, name: string) =>
    db.begin((tx) =>
      leaveClub(
        tx as unknown as WorldTx,
        clock,
        { userId: c.user[name] ?? "", key: randomUUID(), clubId: c.club, contributions: "keep" },
        leftClubBody,
      ),
    );
  const confirmingAlone = (c: Club, name: string, proposalId: string, expectedVersion: number, weekdays: Weekday[]) =>
    db.begin((tx) =>
      confirmScheduleDays(
        tx as unknown as WorldTx,
        clock,
        { userId: c.user[name] ?? "", key: randomUUID(), proposalId, expectedVersion, weekdays },
        render,
      ),
    );
  const stateOf = async (proposal: string) =>
    (
      await db<
        { state: string; version: number }[]
      >`SELECT state, version FROM app.schedule_proposals WHERE id = ${proposal}`
    )[0];

  it(
    "applies the first days by the leave when the last other confirmation came first",
    { timeout: 30_000 },
    async () => {
      const s = await three();
      const hold = await holding(db, s.c.club);
      let confirmed: Promise<unknown>;
      let left: Promise<unknown>;
      try {
        // Maya's confirmation is first behind the row; Alex's leave is second.
        confirmed = outcome(confirmingAlone(s.c, "Maya", s.proposal, s.version, ["tuesday", "friday"]));
        await waitingOn(db, hold.pid, 1);
        left = outcome(leavingAlone(s.c, "Alex"));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      // Maya's confirmation saw Alex still choosing, and left the first days open; the leave applied them.
      expect(await confirmed).toMatchObject({ state: "open", myState: "confirmed" });
      expect(await left).toMatchObject({ club_id: s.c.club });
      expect(await stateOf(s.proposal)).toEqual({ state: "applied", version: s.version + 1 });
    },
  );

  it("applies them by the confirmation when the leave came first", { timeout: 30_000 }, async () => {
    const s = await three();
    const hold = await holding(db, s.c.club);
    let confirmed: Promise<unknown>;
    let left: Promise<unknown>;
    try {
      left = outcome(leavingAlone(s.c, "Alex"));
      await waitingOn(db, hold.pid, 1);
      confirmed = outcome(confirmingAlone(s.c, "Maya", s.proposal, s.version, ["tuesday", "friday"]));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await left).toMatchObject({ club_id: s.c.club });
    // The leave moved no version (Maya hadn't confirmed), so Maya's request stands and is the last one.
    expect(await confirmed).toMatchObject({ state: "applied", myState: "confirmed" });
    expect(await stateOf(s.proposal)).toEqual({ state: "applied", version: s.version + 1 });
  });

  it("refuses the confirmation of someone whose leave came first", { timeout: 30_000 }, async () => {
    const s = await three();
    const hold = await holding(db, s.c.club);
    let confirmed: Promise<unknown>;
    let left: Promise<unknown>;
    try {
      left = outcome(leavingAlone(s.c, "Maya"));
      await waitingOn(db, hold.pid, 1);
      confirmed = outcome(confirmingAlone(s.c, "Maya", s.proposal, s.version, ["tuesday", "friday"]));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await left).toMatchObject({ club_id: s.c.club });
    expect(await confirmed).toBe("NOT_FOUND");
    expect(await stateOf(s.proposal)).toEqual({ state: "open", version: s.version });
  });
});
