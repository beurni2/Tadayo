/// <reference lib="esnext.temporal" />
// A new member's pick against Postgres as `tadayo_app` (spec 05; T1, T6, T9, T14, T19, T33; FQ16, FQ63,
// FQ79, FQ100, FQ102, FQ115, FQ124; the founder's answers to FQ125 to FQ127 and to the three-to-four card,
// FQ129 to FQ131; docs/plans/api-b2-new-member-day.md; packages/domain/src/schedule/settle-change.ts,
// change.ts, confirm-days.ts, week.ts, view.ts). Every club here is made the way the product makes one, as
// tests/src/db/first-days-roster.test.ts makes its own: `createClub`, `proposeRoster`, `createInvitation`,
// `acceptInvitation`, `approveRoster`, `leaveClub`, and the schedule's `chooseScheduleDays` and
// `confirmScheduleDays`, each as its route runs it (./club-world.ts), and the checks Postgres keeps for the
// commit run after each step here (`committed`, ./world.ts).
//
// Once a club's first days have applied, nobody already in the week is asked anything or moves (FQ125,
// FQ126); a member with no day picks free ones and confirms them as in the first days, and each is theirs
// from that weekday in the week after (FQ127, FQ130), no four-to-five-week wait. Where the free days can't
// give each member with no day spec 05's number, as when a fourth member joins three who hold all six, the
// others' second days are freed now (the founder's answer on three to four).

import { randomUUID } from "node:crypto";
import { leftClubBody } from "@tadayo/api";
import {
  chooseScheduleDays,
  confirmScheduleDays,
  isPlainLoopback,
  leaveClub,
  listClubs,
  makeDays,
  mayReadDrop,
  READS,
  readSchedule,
  type Json,
  type ProposalAnswer,
  type ScheduleSight,
  type ServerNow,
  type Weekday,
} from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, expectRefused, REFUSED, rolledBack, worldSql, type WorldTx } from "./harness.ts";
import { foundedBy, joinAs, leaveAs, type MadeClub } from "./club-world.ts";
import { plain, refusal } from "./roster-world.ts";
import { forgetCommittedDays, holding, waitingOn } from "./week-world.ts";
import { checkAsAtCommit, commitDrop, newId, newUser, type World } from "./world.ts";

const db = worldSql(6);
/** The clubs whose days the races on a cancelled day commit, with a photo counter and a reservation. */
const raced: string[] = [];
afterAll(async () => {
  await db.end();
  // No rollback takes those away, and the ops scripts' tests need a database with no committed day: the
  // reservations and counters go first, as the superuser, on this machine only, then every committed day.
  if (raced.length === 0) return;
  if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) throw new Error("not a database on this machine");
  const admin = adminSql();
  try {
    await admin`DELETE FROM app.reservations r USING app.occurrences o
                 WHERE o.id = r.occurrence_id AND o.club_id IN ${admin(raced)}`;
    await admin`DELETE FROM app.contribution_counters WHERE club_id IN ${admin(raced)}`;
  } finally {
    await admin.end();
  }
  await forgetCommittedDays();
});

// Wednesday 11 November 2026, midnight in New York. The days are made to Sunday 13 December (the last one
// made is Friday 11 December, a club of two having no Saturday), and next week starts on Monday 16 November.
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const TODAY = "2026-11-11";
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

/** The club's picks, the earliest first. */
const picks = async (tx: WorldTx, c: Club): Promise<ProposalRow[]> =>
  (await proposals(tx, c)).filter((each) => each.reason === "membership_change");

const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const byWeekday = (a: string, b: string) => WEEK.indexOf(a) - WEEK.indexOf(b);
const nameOf = (c: Club) => new Map(Object.entries(c.member).map(([name, interval]) => [interval, name]));

/** The days each member a pick includes holds at first, by name, from Monday: each proposed and held. */
async function heldAtFirst(tx: WorldTx, c: Club, proposal: string): Promise<Record<string, string[]>> {
  const rows = await tx<{ interval_id: string; weekday: string; suggested: boolean; held: boolean }[]>`
    SELECT interval_id, weekday::text AS weekday, suggested, held FROM app.schedule_proposal_days
     WHERE proposal_id = ${proposal}`;
  const names = nameOf(c);
  const found: Record<string, string[]> = {};
  const included = await tx<{ interval_id: string }[]>`
    SELECT interval_id FROM app.schedule_proposal_members WHERE proposal_id = ${proposal}`;
  for (const { interval_id: interval } of included) found[names.get(interval) ?? interval] = [];
  for (const row of rows) {
    expect(row).toMatchObject({ suggested: true, held: true });
    found[names.get(row.interval_id) ?? row.interval_id]?.push(row.weekday);
  }
  for (const days of Object.values(found)) days.sort(byWeekday);
  return found;
}

interface WeekRow {
  effective_from: string;
  days: [string, string, string][];
}

/** The club's weeks, the earliest first, each with its days as [weekday, member's name, first date], from Monday. */
async function weeks(tx: WorldTx, c: Club): Promise<WeekRow[]> {
  const rows = await tx<{ id: string; effective_from: string }[]>`
    SELECT id, effective_from::text AS effective_from FROM app.schedule_versions
     WHERE club_id = ${c.club} ORDER BY effective_from`;
  const names = nameOf(c);
  const found: WeekRow[] = [];
  for (const row of rows) {
    const days = await tx<{ weekday: string; star: string; first_date: string }[]>`
      SELECT weekday::text AS weekday, star_interval_id AS star, first_date::text AS first_date
        FROM app.schedule_assignments WHERE schedule_version_id = ${row.id}`;
    found.push({
      effective_from: row.effective_from,
      days: days
        .map((day): [string, string, string] => [day.weekday, names.get(day.star) ?? day.star, day.first_date])
        .sort((a, b) => byWeekday(a[0], b[0])),
    });
  }
  return found;
}

interface DayRow {
  local_date: string;
  star: string;
  status: string;
}

/** The club's days on `weekdays`, by date, a date's cancelled day first: [date, member's name, status]. */
async function daysOn(tx: WorldTx, c: Club, weekdays: readonly string[]): Promise<[string, string, string][]> {
  const isoDays = weekdays.map((weekday) => WEEK.indexOf(weekday) + 1);
  const rows = await tx<DayRow[]>`
    SELECT local_date::text AS local_date, star_interval_id AS star, status FROM app.occurrences
     WHERE club_id = ${c.club} AND EXTRACT(isodow FROM local_date)::int IN ${tx(isoDays)}
     ORDER BY local_date, status = 'cancelled' DESC`;
  const names = nameOf(c);
  return rows.map((row) => [row.local_date, names.get(row.star) ?? row.star, row.status]);
}

const make = (tx: WorldTx, c: Club) => tx.savepoint((sp) => makeDays(sp, clock, c.club));

const person = (c: Club, name: string) => ({ membershipId: c.member[name], displayName: name, avatarVersion: null });

/** Ben's club with Maya, both confirmed: the first days applied, Ben's Monday and Thursday, Maya's Tuesday and Friday. */
async function pair(tx: WorldTx): Promise<Club> {
  const c = await foundedBy(tx, clock, "Ben");
  await join(tx, c, "Maya", "Ben");
  await confirmOwn(tx, c, "Ben");
  expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied" });
  expect(await picks(tx, c)).toEqual([]);
  return c;
}

/** `pair`, then Alex joins: a pick is open for Alex alone. */
async function withAlex(tx: WorldTx): Promise<{ c: Club; pick: ProposalRow }> {
  const c = await pair(tx);
  await join(tx, c, "Alex", "Ben");
  const [pick] = await picks(tx, c);
  if (pick === undefined) throw new Error("withAlex: no pick was opened");
  return { c, pick };
}

/** `withAlex`, Alex confirmed Wednesday and Saturday: three members, all six days. */
async function three(tx: WorldTx): Promise<Club> {
  const { c } = await withAlex(tx);
  expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied", myState: "confirmed" });
  return c;
}

/** Four members whose first days applied, a day each, then Debby and Nina, who joined since: a pick for the two. */
async function six(tx: WorldTx): Promise<{ c: Club; pick: ProposalRow }> {
  const c = await foundedBy(tx, clock, "Ben");
  for (const name of ["Maya", "Alex", "Sam"]) await join(tx, c, name, "Ben");
  for (const name of ["Ben", "Maya", "Alex", "Sam"]) await confirmOwn(tx, c, name);
  await join(tx, c, "Debby", "Ben");
  await join(tx, c, "Nina", "Ben");
  const all = await picks(tx, c);
  expect(all).toHaveLength(1);
  const [pick] = all;
  if (pick === undefined) throw new Error("six: no pick was opened");
  return { c, pick };
}

describe("when a pick opens (FQ100, FQ102, FQ125, FQ126, FQ131)", () => {
  it("opens one for a join in a club with a week: only the new member is in it, holding free days, and nobody else is asked", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      expect(pick).toMatchObject({
        reason: "membership_change",
        state: "open",
        version: 1,
        week_revision: 1,
        days_per_member: 2,
        effective_from: TODAY,
        replaced_by: null,
        schedule_version_id: null,
        closed_at: null,
      });
      // Spec 05's days for the third of three, Wednesday and Saturday, are free.
      expect(await heldAtFirst(tx, c, pick.id)).toEqual({ Alex: ["wednesday", "saturday"] });
      // The first days stay applied; Ben and Maya see the week as it was, and no pick.
      expect((await proposals(tx, c))[0]).toMatchObject({ reason: "activation", state: "applied" });
      for (const name of ["Ben", "Maya", "Alex"]) {
        const seen = await sight(tx, c, name);
        expect(seen?.current?.assignments.map((each) => [each.weekday, each.person.displayName])).toEqual([
          ["monday", "Ben"],
          ["tuesday", "Maya"],
          ["thursday", "Ben"],
          ["friday", "Maya"],
        ]);
        if (name !== "Alex") expect(seen?.proposal).toBeNull();
      }
      expect(await weeks(tx, c)).toHaveLength(1);
    });
  });

  it("opens one with the last confirmation of the first days, for a member who joined after a day was confirmed (FQ100)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await confirmOwn(tx, c, "Ben");
      await join(tx, c, "Alex", "Ben");
      // Alex is outside the first days, and no pick opens while they are open.
      expect((await sight(tx, c, "Alex"))?.proposal).toBeNull();
      expect(await picks(tx, c)).toEqual([]);
      tick(1);
      expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied", reason: "activation" });
      const [pick] = await picks(tx, c);
      expect(pick).toMatchObject({ state: "open", version: 1, days_per_member: 2, effective_from: TODAY });
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Alex: ["wednesday", "saturday"] });
      expect(await proposalOf(tx, c, "Alex")).toMatchObject({
        reason: "membership_change",
        myDays: ["wednesday", "saturday"],
      });
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();
    });
  });

  it("keeps everyone's days when a leave applies the first days, even where two members would take two days each (FQ102, FQ131)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await foundedBy(tx, clock, "Ben");
      for (const name of ["Maya", "Alex", "Sam"]) await join(tx, c, name, "Ben");
      // Four members, one day each. Ben, Maya and Alex confirm; Ben leaves; then Sam, who hasn't, leaves.
      for (const name of ["Ben", "Maya", "Alex"]) await confirmOwn(tx, c, name);
      await leaving(tx, c, "Ben");
      await leaving(tx, c, "Sam");
      expect((await proposals(tx, c))[0]).toMatchObject({ reason: "activation", state: "applied" });
      // Maya and Alex have a day each, and keep it: nobody is without a day, so nobody picks.
      expect(await picks(tx, c)).toEqual([]);
      expect((await sight(tx, c, "Maya"))?.proposal).toBeNull();
    });
  });

  it("asks nobody anything when a member leaves: the leaver's days are free, and nobody moves (three to two)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await three(tx);
      const before = await weeks(tx, c);
      await leaving(tx, c, "Maya");
      expect((await picks(tx, c)).map((each) => each.state)).toEqual(["applied"]);
      expect(await weeks(tx, c)).toEqual(before);
    });
  });

  it("frees the others' second days when a fourth member joins three: a new week now, their days from next week cancelled, and a pick for the fourth", async () => {
    await rolledBack(db, async (tx) => {
      const c = await three(tx);
      tick(1);
      await make(tx, c);
      await join(tx, c, "Sam", "Ben");
      // Each of the three keeps their first day from Monday; Thursday, Friday and Saturday leave the week, in a
      // new one from Friday 13 November, the day after the latest week's start (Alex's, on the 12th).
      const all = await weeks(tx, c);
      expect(all.map((each) => each.effective_from)).toEqual([TODAY, "2026-11-12", "2026-11-13"]);
      expect(all.at(-1)?.days).toEqual([
        ["monday", "Ben", "2026-11-16"],
        ["tuesday", "Maya", "2026-11-17"],
        ["wednesday", "Alex", "2026-11-18"],
      ]);
      // This week's days stay as announced; from Monday 16 November the freed days open for nobody (T9).
      expect(await daysOn(tx, c, ["thursday", "friday", "saturday"])).toEqual([
        ["2026-11-12", "Ben", "scheduled"],
        ["2026-11-13", "Maya", "scheduled"],
        ["2026-11-19", "Ben", "cancelled"],
        ["2026-11-20", "Maya", "cancelled"],
        ["2026-11-21", "Alex", "cancelled"],
        ["2026-11-26", "Ben", "cancelled"],
        ["2026-11-27", "Maya", "cancelled"],
        ["2026-11-28", "Alex", "cancelled"],
        ["2026-12-03", "Ben", "cancelled"],
        ["2026-12-04", "Maya", "cancelled"],
        ["2026-12-05", "Alex", "cancelled"],
        ["2026-12-10", "Ben", "cancelled"],
        ["2026-12-11", "Maya", "cancelled"],
        ["2026-12-12", "Alex", "cancelled"],
      ]);
      // Sam picks one day from the three freed, spec 05's Thursday for the fourth to begin with.
      const [, pick] = await picks(tx, c);
      expect(pick).toMatchObject({ state: "open", version: 1, days_per_member: 1, replaced_by: null });
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Sam: ["thursday"] });
      // Nobody else is asked anything.
      for (const name of ["Ben", "Maya", "Alex"]) expect((await sight(tx, c, name))?.proposal).toBeNull();

      // Sam confirms Thursday: theirs from Thursday 19 November, after Ben's last one, the 12th.
      expect(await confirmOwn(tx, c, "Sam")).toMatchObject({ state: "applied", version: 2, myState: "confirmed" });
      expect((await weeks(tx, c)).at(-1)).toEqual({
        effective_from: "2026-11-14",
        days: [
          ["monday", "Ben", "2026-11-16"],
          ["tuesday", "Maya", "2026-11-17"],
          ["wednesday", "Alex", "2026-11-18"],
          ["thursday", "Sam", "2026-11-19"],
        ],
      });
      await make(tx, c);
      const thursdays = await daysOn(tx, c, ["thursday"]);
      expect(thursdays.filter((day) => day[2] === "scheduled")).toEqual([
        ["2026-11-12", "Ben", "scheduled"],
        ["2026-11-19", "Sam", "scheduled"],
        ["2026-11-26", "Sam", "scheduled"],
        ["2026-12-03", "Sam", "scheduled"],
        ["2026-12-10", "Sam", "scheduled"],
      ]);
      // Friday and Saturday stay free: nobody's days are made on them.
      expect((await daysOn(tx, c, ["friday", "saturday"])).filter((day) => day[2] === "scheduled")).toEqual([
        ["2026-11-13", "Maya", "scheduled"],
      ]);
    });
  });

  it("takes today and next week from the club's own date: a fourth member who joins on Sunday evening in New York, Monday by UTC, frees from the next day (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await three(tx);
      // Sunday 15 November at 22:00 in New York, which is 03:00 on Monday the 16th by UTC.
      current = Temporal.Instant.from("2026-11-16T03:00:00.123456Z");
      clock.set(current);
      await make(tx, c);
      await join(tx, c, "Sam", "Ben");
      // The freed week starts on the club's Sunday, and the cancellations on the Monday after it, the next
      // day: Thursday 19 November is next week's, so it is cancelled already (by UTC's date it would be
      // this week's, kept, and the 26th the first cancelled).
      expect((await weeks(tx, c)).at(-1)?.effective_from).toBe("2026-11-15");
      const thursdays = await daysOn(tx, c, ["thursday"]);
      expect(thursdays[0]).toEqual(["2026-11-19", "Ben", "cancelled"]);
      expect(thursdays.filter((day) => day[2] === "scheduled")).toEqual([]);
      // Sam confirms Thursday at once: the 19th, in the week after the club's Sunday, is Sam's first.
      expect(await confirmOwn(tx, c, "Sam")).toMatchObject({ state: "applied", myState: "confirmed" });
      const sams = await weeks(tx, c);
      expect(sams.at(-1)?.effective_from).toBe("2026-11-16");
      expect(sams.at(-1)?.days.find((day) => day[0] === "thursday")).toEqual(["thursday", "Sam", "2026-11-19"]);
    });
  });

  it("opens a pick in a club whose zone has an older name Postgres needn't know: TypeScript resolves the zone, Postgres compares (ADR-008; the outside audit's A11)", async () => {
    await rolledBack(db, async (tx) => {
      // US/Eastern is New York's zone under its older name. Node keeps the name as given, and some Postgres
      // builds leave the older names out (Ubuntu's Postgres 16, here), so a Postgres that resolved the club's
      // zone would refuse the join after the first days, for good.
      const c = await foundedBy(tx, clock, "Ben", "US/Eastern");
      const [club] = await tx<{ timezone: string }[]>`SELECT timezone FROM app.clubs WHERE id = ${c.club}`;
      expect(club?.timezone).toBe("US/Eastern");
      await join(tx, c, "Maya", "Ben");
      await confirmOwn(tx, c, "Ben");
      expect(await confirmOwn(tx, c, "Maya")).toMatchObject({ state: "applied" });
      await join(tx, c, "Alex", "Ben");
      const [pick] = await picks(tx, c);
      expect(pick).toMatchObject({ state: "open", effective_from: TODAY });
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Alex: ["wednesday", "saturday"] });
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied", myState: "confirmed" });
    });
  });

  it("opens the pick from the club's own date, not UTC's: a join on Sunday evening in New York, Monday by UTC (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      // Sunday 15 November at 22:00 in New York, which is 03:00 on Monday the 16th by UTC.
      current = Temporal.Instant.from("2026-11-16T03:00:00.123456Z");
      clock.set(current);
      await make(tx, c);
      await join(tx, c, "Alex", "Ben");
      expect(await picks(tx, c)).toMatchObject([{ state: "open", effective_from: "2026-11-15" }]);
    });
  });

  it("keeps what was added for a freed day hidden from everyone, its caption too, and never on the new member's day (T9, FQ131)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await three(tx);
      tick(1);
      await make(tx, c);
      // Maya adds a link for Ben's Thursday 19 November, a day the fourth member's join will free.
      const [thursday] = await tx<{ id: string }[]>`
        SELECT id FROM app.occurrences
         WHERE club_id = ${c.club} AND local_date = '2026-11-19' AND status = 'scheduled'`;
      const day = thursday?.id ?? "";
      const where = { club: c.club, day } as unknown as World;
      const author = { user: c.user["Maya"] ?? "", interval: c.member["Maya"] ?? "" };
      const drop = await commitDrop(tx, where, author, {
        media: "external_video",
        caption: "For Thursday",
        at: new Date(current.epochMilliseconds),
      });
      await committed(tx);
      // That day's 7 AM in New York, and the instant now.
      const opened = Temporal.Instant.from("2026-11-19T12:00:00Z") as ServerNow;
      const reads = async (name: string, at: ServerNow) => {
        const seen: string[] = [];
        for (const what of READS) if (await mayReadDrop(tx, c.user[name] ?? "", drop, what, at)) seen.push(what);
        return seen;
      };
      // Before the join, as for any day: its caption now, and everything once it opens.
      expect(await reads("Alex", now())).toEqual(["caption"]);
      expect(await reads("Alex", opened)).toEqual([...READS]);

      await join(tx, c, "Sam", "Ben");
      const [cancelled] = await tx<{ status: string }[]>`SELECT status FROM app.occurrences WHERE id = ${day}`;
      expect(cancelled?.status).toBe("cancelled");
      for (const name of ["Ben", "Maya", "Alex", "Sam"]) {
        expect(await reads(name, now()), name).toEqual([]);
        expect(await reads(name, opened), name).toEqual([]);
      }
      // A cancelled day takes nothing new: Alex's link for it is refused (T9).
      const alex = { user: c.user["Alex"] ?? "", interval: c.member["Alex"] ?? "" };
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) =>
          commitDrop(sp, where, alex, {
            media: "external_video",
            caption: "Too",
            at: new Date(current.epochMilliseconds),
          }),
        /is a cancelled day, and takes nothing new \(T9\)/,
      );
      // Nor a photo: its reservation, the first thing a photo writes, is refused (T9).
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) => commitDrop(sp, where, alex, { media: "photo", at: new Date(current.epochMilliseconds) }),
        /app\.reservations: \S+ is a cancelled day, and takes nothing new \(T9\)/,
      );
      // Sam takes Thursday: Sam's own day on the 19th is another day, which holds nothing of Maya's.
      await confirmOwn(tx, c, "Sam");
      await make(tx, c);
      const onSams = await tx<{ id: string }[]>`
        SELECT d.id FROM app.drops d JOIN app.occurrences o ON o.id = d.occurrence_id
         WHERE o.club_id = ${c.club} AND o.local_date = '2026-11-19' AND o.status = 'scheduled'`;
      expect(onSams).toEqual([]);
      for (const name of ["Ben", "Maya", "Alex", "Sam"]) expect(await reads(name, opened), name).toEqual([]);
      // The drop is kept, with its author (FQ63).
      const [kept] = await tx<{ state: string; author: string }[]>`
        SELECT state, author_interval_id AS author FROM app.drops WHERE id = ${drop}`;
      expect(kept).toEqual({ state: "active", author: c.member["Maya"] });
    });
  });

  it("frees days the same way when the first days apply with a late joiner and no day free (FQ100, FQ131)", async () => {
    await rolledBack(db, async (tx) => {
      // Ben, Maya and Alex's first days, two days each: Ben and Maya confirm, then Sam joins with no day (FQ100).
      const c = await foundedBy(tx, clock, "Ben");
      await join(tx, c, "Maya", "Ben");
      await join(tx, c, "Alex", "Ben");
      await confirmOwn(tx, c, "Ben");
      await confirmOwn(tx, c, "Maya");
      await join(tx, c, "Sam", "Ben");
      expect(await picks(tx, c)).toEqual([]);
      // Alex's confirmation applies the first days. All six days are held and Sam has none, so each of the three
      // keeps their first day, Alex's just-confirmed Saturday among the days freed, and Sam picks.
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied" });
      const all = await weeks(tx, c);
      expect(all).toHaveLength(2);
      expect(all.at(-1)?.days.map((day) => [day[0], day[1]])).toEqual([
        ["monday", "Ben"],
        ["tuesday", "Maya"],
        ["wednesday", "Alex"],
      ]);
      const [pick] = await picks(tx, c);
      expect(pick).toMatchObject({ state: "open", version: 1, days_per_member: 1 });
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Sam: ["thursday"] });
    });
  });

  it("opens nothing in a club that never had a confirmed week, and nothing while the first days are open", async () => {
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

  it("works a pick out from a restarted club's own week, not the week before it (FQ124)", async () => {
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
      expect(await weeks(tx, c)).toHaveLength(2);
      expect(await picks(tx, c)).toEqual([]);
      // Debby joins: the pick gives Debby the two days Maya and Sam don't have in the second week.
      await join(tx, c, "Debby", "Maya");
      const [pick] = await picks(tx, c);
      expect(pick).toMatchObject({ state: "open", days_per_member: 2 });
      const free = WEEK.filter((weekday) => ![...mayas, ...applied.myDays].includes(weekday as Weekday));
      expect(free).toHaveLength(2);
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Debby: free });
    });
  });
});

describe("a pick added to, replaced, dropped, and a club paused (FQ16, FQ131)", () => {
  it("adds a member who joins while it is open, holding a free day nobody it includes holds, and moves nothing else (T33)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await six(tx);
      expect(pick).toMatchObject({ state: "open", version: 1, days_per_member: 1 });
      // Debby, fifth, holds spec 05's Friday; Nina, sixth, joined while it was open and holds Saturday.
      expect(await heldAtFirst(tx, c, pick.id)).toEqual({ Debby: ["friday"], Nina: ["saturday"] });
      expect(await proposalOf(tx, c, "Debby")).toMatchObject({ id: pick.id, version: 1, myDays: ["friday"] });
      expect(await proposalOf(tx, c, "Nina")).toMatchObject({ id: pick.id, version: 1, myDays: ["saturday"] });
    });
  });

  it("replaces an open pick when the club's size changes the days each, and the old id answers MEMBERSHIP_CHANGED to whom the new one includes", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      tick(2);
      await join(tx, c, "Sam", "Ben");
      const [first, second] = await picks(tx, c);
      expect(first).toMatchObject({ id: pick.id, state: "superseded", version: 2, replaced_by: second?.id });
      expect(String(first?.closed_at)).toBe(current.toString());
      // Four members take one day each, and Wednesday and Saturday are free for Alex and Sam: Ben and Maya
      // keep both their days, nothing is cancelled, and no week is written (FQ125).
      expect(second).toMatchObject({ state: "open", version: 1, days_per_member: 1, effective_from: TODAY });
      expect(await heldAtFirst(tx, c, second?.id ?? "")).toEqual({ Alex: ["wednesday"], Sam: ["saturday"] });
      expect(await weeks(tx, c)).toHaveLength(1);
      expect((await weeks(tx, c)).at(-1)?.days.map((day) => day[0])).toEqual([
        "monday",
        "tuesday",
        "thursday",
        "friday",
      ]);
      expect(await tx`SELECT id FROM app.occurrences WHERE club_id = ${c.club} AND status = 'cancelled'`).toEqual([]);
      expect(await proposalOf(tx, c, "Alex")).toMatchObject({ id: second?.id, myState: "choosing" });
      for (const command of [confirm, choose]) {
        expect(await refusal(command(tx, c, "Alex", pick.id, 1, ["wednesday", "saturday"]))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: second?.id },
        });
      }
      // Sam, whom the earlier pick never included, and Ben, whom neither does, get the neutral answer (T14).
      expect(await refusal(confirm(tx, c, "Sam", pick.id, 2, ["thursday"]))).toMatchObject({ code: "NOT_FOUND" });
      expect(await refusal(confirm(tx, c, "Ben", pick.id, 2, ["monday"]))).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("keeps what a member held when a new pick takes the place of theirs: Alex's chosen Saturday stays Alex's (FQ125, FQ126)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      // Alex chooses only Saturday of the two, and Sam joins: one day each now. Alex keeps Saturday, and Sam
      // gets the other free day, Wednesday; nobody is given a day someone chose.
      await choose(tx, c, "Alex", pick.id, 1, ["saturday"]);
      await join(tx, c, "Sam", "Ben");
      const [, second] = await picks(tx, c);
      expect(second).toMatchObject({ state: "open", days_per_member: 1 });
      expect(await heldAtFirst(tx, c, second?.id ?? "")).toEqual({ Alex: ["saturday"], Sam: ["wednesday"] });
      expect(await proposalOf(tx, c, "Alex")).toMatchObject({ id: second?.id, myDays: ["saturday"] });
    });
  });

  it("names the club's open pick to an id replaced more than once, and treats it as ended once none is open", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      await join(tx, c, "Sam", "Ben");
      // Sam leaves: three again, two days each, and Alex picks two, Wednesday and Saturday, the two free.
      await leaving(tx, c, "Sam");
      const [first, second, third] = await picks(tx, c);
      expect(first).toMatchObject({ id: pick.id, state: "superseded", replaced_by: second?.id });
      expect(second).toMatchObject({ state: "superseded", version: 2, replaced_by: third?.id });
      expect(third).toMatchObject({ state: "open", version: 1, days_per_member: 2 });
      expect(await heldAtFirst(tx, c, third?.id ?? "")).toEqual({ Alex: ["wednesday", "saturday"] });
      for (const id of [pick.id, second?.id ?? ""]) {
        expect(await refusal(confirm(tx, c, "Alex", id, 1, ["wednesday", "saturday"]))).toEqual({
          code: "MEMBERSHIP_CHANGED",
          facts: { current_id: third?.id },
        });
      }
      // Maya leaves: Alex still picks. Ben leaves: Alex is alone, the club paused, and the pick ends. Every id
      // of the chain is then an ended proposal: the version it ended at, then NOT_ALLOWED.
      await leaving(tx, c, "Maya");
      expect((await picks(tx, c)).at(-1)).toMatchObject({ id: third?.id, state: "open" });
      await leaving(tx, c, "Ben");
      expect((await picks(tx, c)).map((each) => each.state)).toEqual(["superseded", "superseded", "superseded"]);
      expect(await refusal(confirm(tx, c, "Alex", pick.id, 1, ["wednesday", "saturday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      for (const id of [pick.id, third?.id ?? ""]) {
        expect(await refusal(confirm(tx, c, "Alex", id, 2, ["wednesday", "saturday"]))).toMatchObject({
          code: "NOT_ALLOWED",
        });
      }
    });
  });

  it("ends an open pick with no successor when nobody it includes is still a member", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      tick(3);
      await leaving(tx, c, "Alex");
      const all = await picks(tx, c);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: pick.id, state: "superseded", version: 2, replaced_by: null });
      expect(String(all[0]?.closed_at)).toBe(current.toString());
      expect(await weeks(tx, c)).toHaveLength(1);
    });
  });

  it("ends an open pick when the club is paused, and opens one when it has two members again (FQ16, FQ116)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      // Maya leaves: Tuesday and Friday are free, and Alex goes on picking in the same pick.
      await leaving(tx, c, "Maya");
      expect(await picks(tx, c)).toEqual([expect.objectContaining({ id: pick.id, state: "open", version: 1 })]);
      const seen = await proposalOf(tx, c, "Alex");
      expect(seen.slots.map((each) => [each.weekday, each.state])).toEqual([
        ["monday", "taken"],
        ["tuesday", "available"],
        ["wednesday", "yours"],
        ["thursday", "taken"],
        ["friday", "available"],
        ["saturday", "yours"],
      ]);
      // Ben leaves: Alex is alone, the club paused.
      await leaving(tx, c, "Ben");
      expect((await listClubs(tx, c.user["Alex"] ?? "", now())).clubs).toMatchObject([{ state: "paused" }]);
      expect(await picks(tx, c)).toEqual([
        expect.objectContaining({ id: pick.id, state: "superseded", version: 2, replaced_by: null }),
      ]);
      expect((await sight(tx, c, "Alex"))?.proposal).toBeNull();
      // Sam joins: two members again, neither with a day in the week, and a pick for both, never new first days.
      await join(tx, c, "Sam", "Alex");
      const resumed = await picks(tx, c);
      expect(resumed).toHaveLength(2);
      expect(resumed[1]).toMatchObject({ state: "open", version: 1, days_per_member: 2 });
      expect(await heldAtFirst(tx, c, resumed[1]?.id ?? "")).toEqual({
        Alex: ["monday", "thursday"],
        Sam: ["tuesday", "friday"],
      });
      expect((await proposals(tx, c)).filter((each) => each.reason === "activation")).toHaveLength(1);
    });
  });

  it("opens nothing when the one member of a paused club with no open pick leaves too", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      await leaving(tx, c, "Maya");
      expect(await picks(tx, c)).toEqual([]);
      await leaving(tx, c, "Ben");
      expect(await picks(tx, c)).toEqual([]);
    });
  });
});

describe("a new member's days (FQ79, FQ127, FQ129, FQ130: no four-to-five-week wait)", () => {
  it("writes the days into a new week at once, each the new member's from that weekday next week, and moves nobody", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await make(tx, c);
      const made = await daysOn(tx, c, WEEK);
      await join(tx, c, "Alex", "Ben");
      expect(await confirmOwn(tx, c, "Alex")).toMatchObject({ state: "applied", version: 2, myState: "confirmed" });
      // A new week from Thursday 12 November, the day after the first days' week started: everyone's days as
      // they were, and Alex's from Wednesday 18 and Saturday 21 November.
      expect(await weeks(tx, c)).toEqual([
        {
          effective_from: TODAY,
          days: [
            ["monday", "Ben", "2026-11-16"],
            ["tuesday", "Maya", "2026-11-17"],
            ["thursday", "Ben", "2026-11-12"],
            ["friday", "Maya", "2026-11-13"],
          ],
        },
        {
          effective_from: "2026-11-12",
          days: [
            ["monday", "Ben", "2026-11-16"],
            ["tuesday", "Maya", "2026-11-17"],
            ["wednesday", "Alex", "2026-11-18"],
            ["thursday", "Ben", "2026-11-12"],
            ["friday", "Maya", "2026-11-13"],
            ["saturday", "Alex", "2026-11-21"],
          ],
        },
      ]);
      // Nothing already made moved.
      expect(await daysOn(tx, c, WEEK)).toEqual(made);
      await make(tx, c);
      expect((await daysOn(tx, c, ["wednesday", "saturday"])).map((day) => day[0])).toEqual([
        ...["2026-11-18", "2026-11-21", "2026-11-25", "2026-11-28"],
        ...["2026-12-02", "2026-12-05", "2026-12-09", "2026-12-12"],
      ]);
      // Seen from Thursday 12 November, the week in force holds Alex's days.
      tick(24);
      expect((await sight(tx, c, "Ben"))?.current?.assignments.map((each) => each.person.displayName)).toEqual([
        "Ben",
        "Maya",
        "Alex",
        "Ben",
        "Maya",
        "Alex",
      ]);
    });
  });

  it("makes the week's days while a pick is open, as before, and the new member's only once confirmed", async () => {
    await rolledBack(db, async (tx) => {
      const c = await pair(tx);
      tick(1);
      await make(tx, c);
      const last = async () =>
        (
          await tx<
            { last: string }[]
          >`SELECT max(local_date)::text AS last FROM app.occurrences WHERE club_id = ${c.club}`
        )[0]?.last;
      expect(await last()).toBe("2026-12-11");
      await join(tx, c, "Alex", "Ben");
      // Two weeks on, the window runs to Sunday 27 December: Ben's and Maya's days are made to it.
      tick(14 * 24);
      await make(tx, c);
      expect(await last()).toBe("2026-12-25");
      expect(await daysOn(tx, c, ["wednesday", "saturday"])).toEqual([]);
      // Alex confirms on Wednesday 25 November: a week from that day, Alex's days from the next week's.
      await confirmOwn(tx, c, "Alex");
      expect((await weeks(tx, c)).at(-1)).toMatchObject({ effective_from: "2026-11-25" });
      await make(tx, c);
      expect((await daysOn(tx, c, ["wednesday", "saturday"])).map((day) => day[0])).toEqual([
        ...["2026-12-02", "2026-12-05", "2026-12-09", "2026-12-12"],
        ...["2026-12-16", "2026-12-19", "2026-12-23", "2026-12-26"],
      ]);
    });
  });

  it("gives a new member a leaver's weekday from its first date, cancelling the leaver's days there on (FQ63, FQ129)", async () => {
    await rolledBack(db, async (tx) => {
      const c = await three(tx);
      tick(1);
      await make(tx, c);
      await leaving(tx, c, "Maya");
      await join(tx, c, "Sam", "Ben");
      // Third of three, Sam would hold Wednesday and Saturday, which are Alex's: the free days from Monday instead.
      const [, pick] = await picks(tx, c);
      expect(await heldAtFirst(tx, c, pick?.id ?? "")).toEqual({ Sam: ["tuesday", "friday"] });
      await confirmOwn(tx, c, "Sam");
      expect((await weeks(tx, c)).at(-1)).toEqual({
        effective_from: "2026-11-13",
        days: [
          ["monday", "Ben", "2026-11-16"],
          ["tuesday", "Sam", "2026-11-17"],
          ["wednesday", "Alex", "2026-11-18"],
          ["thursday", "Ben", "2026-11-12"],
          ["friday", "Sam", "2026-11-20"],
          ["saturday", "Alex", "2026-11-21"],
        ],
      });
      await make(tx, c);
      // Maya's Friday 13 November stays Maya's, held (FQ63); from Sam's first dates on, each date's day is Sam's.
      const days = await daysOn(tx, c, ["tuesday", "friday"]);
      expect(days.slice(0, 5)).toEqual([
        ["2026-11-13", "Maya", "scheduled"],
        ["2026-11-17", "Maya", "cancelled"],
        ["2026-11-17", "Sam", "scheduled"],
        ["2026-11-20", "Maya", "cancelled"],
        ["2026-11-20", "Sam", "scheduled"],
      ]);
      expect(days.filter((day) => day[1] === "Maya" && day[2] === "scheduled")).toEqual([
        ["2026-11-13", "Maya", "scheduled"],
      ]);
      expect(days.filter((day) => day[1] === "Sam").map((day) => day[0])).toEqual([
        ...["2026-11-17", "2026-11-20", "2026-11-24", "2026-11-27"],
        ...["2026-12-01", "2026-12-04", "2026-12-08", "2026-12-11"],
      ]);
    });
  });
});

describe("reading a pick (the contract's ScheduleProposal; FQ125, FQ127, FQ130)", () => {
  it("gives the new member each day of the week in force as its member's, with no first date, and the free days to choose", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      expect(await proposalOf(tx, c, "Alex")).toEqual({
        id: pick.id,
        version: 1,
        reason: "membership_change",
        effectiveFrom: TODAY,
        daysPerMember: 2,
        slots: [
          { weekday: "monday", state: "taken", owner: person(c, "Ben"), suggested: false },
          { weekday: "tuesday", state: "taken", owner: person(c, "Maya"), suggested: false },
          { weekday: "wednesday", state: "yours", suggested: true },
          { weekday: "thursday", state: "taken", owner: person(c, "Ben"), suggested: false },
          { weekday: "friday", state: "taken", owner: person(c, "Maya"), suggested: false },
          { weekday: "saturday", state: "yours", suggested: true },
        ],
        myDays: ["wednesday", "saturday"],
        myState: "choosing",
        state: "open",
      });
      // Confirmed, Alex's own days carry their first dates; nobody else's does.
      const answer = await confirmOwn(tx, c, "Alex");
      expect(answer).toMatchObject({ state: "applied", version: 2, myState: "confirmed" });
      expect(answer.slots.map((each) => [each.weekday, each.state, each.firstDate])).toEqual([
        ["monday", "taken", undefined],
        ["tuesday", "taken", undefined],
        ["wednesday", "yours", "2026-11-18"],
        ["thursday", "taken", undefined],
        ["friday", "taken", undefined],
        ["saturday", "yours", "2026-11-21"],
      ]);
    });
  });

  it("names the one other new member who holds a free day, and shows a contest, as the first days do (FQ55)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await six(tx);
      const slots = async (name: string) =>
        (await proposalOf(tx, c, name)).slots.slice(4).map((each) => ({
          weekday: each.weekday,
          state: each.state,
          ...(each.heldBy === undefined ? {} : { heldBy: each.heldBy.displayName }),
          ...(each.holders === undefined ? {} : { holders: each.holders.map((one) => one.displayName) }),
        }));
      expect(await slots("Debby")).toEqual([
        { weekday: "friday", state: "yours" },
        { weekday: "saturday", state: "available", heldBy: "Nina" },
      ]);
      await choose(tx, c, "Nina", pick.id, 1, ["friday"]);
      expect(await slots("Debby")).toEqual([
        { weekday: "friday", state: "clash", holders: ["Debby", "Nina"] },
        { weekday: "saturday", state: "available" },
      ]);
      // Ben, with Monday in the week, sees no pick.
      expect((await sight(tx, c, "Ben"))?.proposal).toBeNull();
    });
  });

  it("gives members already in the week, someone who left, a stranger and a member of another club nothing of it (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      const other = await pair(tx);
      const stranger = await newUser(plain(tx), "Nina");
      expect(await readSchedule(tx, stranger, c.club, now())).toBeNull();
      expect(await readSchedule(tx, other.user["Ben"] ?? "", c.club, now())).toBeNull();
      const asking = (userId: string) =>
        tx.savepoint((sp) =>
          confirmScheduleDays(
            sp,
            clock,
            { userId, key: randomUUID(), proposalId: pick.id, expectedVersion: 1, weekdays: ["wednesday", "saturday"] },
            render,
          ),
        );
      for (const userId of [stranger, other.user["Ben"] ?? "", c.user["Ben"] ?? "", c.user["Maya"] ?? ""]) {
        expect(await refusal(asking(userId))).toMatchObject({ code: "NOT_FOUND" });
      }
      await leaving(tx, c, "Alex");
      expect(await sight(tx, c, "Alex")).toBeNull();
      expect(await refusal(asking(c.user["Alex"] ?? ""))).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("choosing and confirming in a pick (FQ55, FQ57, FQ99; T1, T19, T33)", () => {
  it("takes a choice of free days, never a day of the week in force, and moves no version", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      for (const weekdays of [["monday"], ["tuesday", "wednesday"], ["wednesday", "friday"]] as const) {
        expect(await refusal(choose(tx, c, "Alex", pick.id, 1, weekdays))).toMatchObject({ code: "NOT_ALLOWED" });
      }
      expect(await choose(tx, c, "Alex", pick.id, 1, ["saturday"])).toMatchObject({ version: 1, myDays: ["saturday"] });
      expect(await choose(tx, c, "Alex", pick.id, 1, [])).toMatchObject({ version: 1, myDays: [] });
      // Maya leaves: Friday is free, and Alex may take it.
      await leaving(tx, c, "Maya");
      expect(await choose(tx, c, "Alex", pick.id, 1, ["friday", "wednesday"])).toMatchObject({
        version: 1,
        state: "open",
        myDays: ["wednesday", "friday"],
      });
      expect((await picks(tx, c))[0]).toMatchObject({ state: "open", version: 1 });
    });
  });

  it("refuses, in the contract's order: VERSION_CONFLICT, then NOT_ALLOWED for days not held, a contested day and a second confirmation", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await six(tx);
      expect(await refusal(confirm(tx, c, "Debby", pick.id, 2, ["friday"]))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 1 },
      });
      for (const weekdays of [["saturday"], ["monday"]] as const) {
        expect(await refusal(confirm(tx, c, "Debby", pick.id, 1, weekdays))).toMatchObject({ code: "NOT_ALLOWED" });
      }
      await choose(tx, c, "Nina", pick.id, 1, ["friday"]);
      // Debby and Nina both hold Friday: neither confirms it (FQ55).
      for (const name of ["Debby", "Nina"]) {
        expect(await refusal(confirm(tx, c, name, pick.id, 1, ["friday"]))).toMatchObject({ code: "NOT_ALLOWED" });
      }
      await choose(tx, c, "Nina", pick.id, 1, ["saturday"]);
      expect(await confirm(tx, c, "Debby", pick.id, 1, ["friday"])).toMatchObject({
        state: "open",
        version: 1,
        myState: "confirmed",
      });
      expect(await refusal(confirm(tx, c, "Debby", pick.id, 1, ["friday"]))).toMatchObject({ code: "NOT_ALLOWED" });
      expect(await refusal(choose(tx, c, "Debby", pick.id, 1, ["saturday"]))).toMatchObject({ code: "NOT_ALLOWED" });
      // Nina, the last it waited for, applies it.
      expect(await confirm(tx, c, "Nina", pick.id, 1, ["saturday"])).toMatchObject({ state: "applied", version: 2 });
      expect((await weeks(tx, c)).map((each) => each.effective_from)).toEqual([TODAY, "2026-11-12", "2026-11-13"]);
      expect((await weeks(tx, c)).at(-1)?.days.map((day) => day[1])).toEqual([
        "Ben",
        "Maya",
        "Alex",
        "Sam",
        "Debby",
        "Nina",
      ]);
    });
  });

  it("answers a retry under the same key with the first answer, once, and another request under it IDEMPOTENCY_CONFLICT (T19)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      const key = randomUUID();
      const first = await confirm(tx, c, "Alex", pick.id, 1, ["wednesday", "saturday"], key);
      const before = await weeks(tx, c);
      tick(5);
      expect(await confirm(tx, c, "Alex", pick.id, 1, ["wednesday", "saturday"], key)).toEqual(first);
      expect(await weeks(tx, c)).toEqual(before);
      expect(await refusal(confirm(tx, c, "Alex", pick.id, 1, ["wednesday"], key))).toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
      });
    });
  });

  it("answers a retry with the first answer after the pick was replaced, and nothing once the caller has left (T19, T14)", async () => {
    await rolledBack(db, async (tx) => {
      const { c, pick } = await withAlex(tx);
      const key = randomUUID();
      const first = await choose(tx, c, "Alex", pick.id, 1, ["saturday"], key);
      await join(tx, c, "Sam", "Ben");
      expect((await picks(tx, c))[0]).toMatchObject({ id: pick.id, state: "superseded" });
      expect(await choose(tx, c, "Alex", pick.id, 1, ["saturday"], key)).toEqual(first);
      await leaving(tx, c, "Alex");
      expect(await refusal(choose(tx, c, "Alex", pick.id, 1, ["saturday"], key))).toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});

describe("confirmations, joins and leaves at once, on connections of their own", () => {
  const outcome = (done: Promise<unknown>): Promise<unknown> =>
    done.then(
      (answer) => answer,
      (error: unknown) => (error as { code?: string }).code ?? String(error),
    );
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
  const weeksOf = (club: string) =>
    db<{ effective_from: string; days: number }[]>`
      SELECT v.effective_from::text AS effective_from,
             (SELECT count(*)::int FROM app.schedule_assignments a WHERE a.schedule_version_id = v.id) AS days
        FROM app.schedule_versions v WHERE v.club_id = ${club} ORDER BY v.effective_from`;

  it(
    "takes two new members' confirmations one after the other, the second applying the pick, each in a week of its own",
    { timeout: 60_000 },
    async () => {
      const s = await db.begin((raw) => six(raw as unknown as WorldTx));
      const hold = await holding(db, s.c.club);
      let debby: Promise<unknown>;
      let nina: Promise<unknown>;
      try {
        debby = outcome(confirmingAlone(s.c, "Debby", s.pick.id, ["friday"]));
        await waitingOn(db, hold.pid, 1);
        nina = outcome(confirmingAlone(s.c, "Nina", s.pick.id, ["saturday"]));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await debby).toMatchObject({ state: "open", version: 1, myState: "confirmed" });
      expect(await nina).toMatchObject({ state: "applied", version: 2, myState: "confirmed" });
      expect(await rowOf(s.pick.id)).toEqual({ state: "applied", version: 2, confirmed: 2 });
      expect(await weeksOf(s.c.club)).toEqual([
        { effective_from: TODAY, days: 4 },
        { effective_from: "2026-11-12", days: 5 },
        { effective_from: "2026-11-13", days: 6 },
      ]);
    },
  );

  it("refuses a confirmation that comes after the leave that ended the pick", { timeout: 30_000 }, async () => {
    const s = await db.begin(async (raw) => {
      const tx = raw as unknown as WorldTx;
      const made = await withAlex(tx);
      await leaving(tx, made.c, "Maya");
      return made;
    });
    const hold = await holding(db, s.c.club);
    let left: Promise<unknown>;
    let alex: Promise<unknown>;
    try {
      left = outcome(leavingAlone(s.c, "Ben"));
      await waitingOn(db, hold.pid, 1);
      alex = outcome(confirmingAlone(s.c, "Alex", s.pick.id, ["wednesday", "saturday"]));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await left).toMatchObject({ club_id: s.c.club });
    expect(await alex).toBe("VERSION_CONFLICT");
    expect(await rowOf(s.pick.id)).toEqual({ state: "superseded", version: 2, confirmed: 0 });
    expect(await weeksOf(s.c.club)).toHaveLength(1);
  });

  it(
    "takes a confirmation that comes before the leave, which then finds the pick applied",
    { timeout: 30_000 },
    async () => {
      const s = await db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const made = await withAlex(tx);
        await leaving(tx, made.c, "Maya");
        return made;
      });
      const hold = await holding(db, s.c.club);
      let left: Promise<unknown>;
      let alex: Promise<unknown>;
      try {
        alex = outcome(confirmingAlone(s.c, "Alex", s.pick.id, ["wednesday", "saturday"]));
        await waitingOn(db, hold.pid, 1);
        left = outcome(leavingAlone(s.c, "Ben"));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await alex).toMatchObject({ state: "applied", version: 2, myState: "confirmed" });
      expect(await left).toMatchObject({ club_id: s.c.club });
      expect(await rowOf(s.pick.id)).toEqual({ state: "applied", version: 2, confirmed: 1 });
      expect(await weeksOf(s.c.club)).toHaveLength(2);
    },
  );

  it(
    "answers MEMBERSHIP_CHANGED to a confirmation that comes after the leave that replaced the pick",
    { timeout: 30_000 },
    async () => {
      // Ben, Maya, Alex and Sam, with a pick open for Alex and Sam. Sam's leave replaces it with one for Alex.
      const s = await db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const made = await withAlex(tx);
        await join(tx, made.c, "Sam", "Ben");
        const open = (await picks(tx, made.c)).at(-1);
        if (open === undefined) throw new Error("no pick for the four");
        return { c: made.c, pick: open };
      });
      const hold = await holding(db, s.c.club);
      let left: Promise<unknown>;
      let alex: Promise<unknown>;
      try {
        left = outcome(leavingAlone(s.c, "Sam"));
        await waitingOn(db, hold.pid, 1);
        alex = outcome(confirmingAlone(s.c, "Alex", s.pick.id, ["wednesday"]));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await left).toMatchObject({ club_id: s.c.club });
      expect(await alex).toBe("MEMBERSHIP_CHANGED");
      expect(await rowOf(s.pick.id)).toEqual({ state: "superseded", version: 2, confirmed: 0 });
      const [next] = await db<{ id: string }[]>`
        SELECT id FROM app.schedule_proposals WHERE state = 'open' AND club_id = ${s.c.club}`;
      expect(next?.id).not.toBe(s.pick.id);
    },
  );

  /** A transaction on a connection of its own that runs `first`, then waits, not committed, until released. */
  async function openWith(
    first: (tx: WorldTx) => Promise<unknown>,
  ): Promise<{ pid: number; release: () => Promise<void> }> {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let ready: (pid: number) => void = () => undefined;
    let failed: (error: unknown) => void = () => undefined;
    const started = new Promise<number>((resolve, reject) => ((ready = resolve), (failed = reject)));
    const done = db.begin(async (raw) => {
      const tx = raw as unknown as WorldTx;
      const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
      await first(tx);
      ready(row?.pid ?? 0);
      await released;
    });
    done.catch(failed);
    return {
      pid: await started,
      release: async () => {
        release();
        await done;
      },
    };
  }

  /** Ben's Thursday 19 November, in `three`'s club with its days made, and Maya's photo counter for it, committed. */
  async function thursdayOfBen(): Promise<{ c: Club; day: string; maya: string }> {
    return db.begin(async (raw) => {
      const tx = raw as unknown as WorldTx;
      const c = await three(tx);
      raced.push(c.club);
      await make(tx, c);
      const [thursday] = await tx<{ id: string }[]>`
        SELECT id FROM app.occurrences WHERE club_id = ${c.club} AND local_date = '2026-11-19' AND status = 'scheduled'`;
      const day = thursday?.id ?? "";
      const maya = c.member["Maya"] ?? "";
      await tx`INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id) VALUES (${day}, ${maya}, ${c.club})`;
      return { c, day, maya };
    });
  }
  /** Maya's photo slot for the day, as a reservation and its counter. */
  const reserving = async (tx: WorldTx, day: string, maya: string): Promise<void> => {
    await tx`
      INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
      VALUES (${newId("rsv")}, ${day}, ${maya}, 'photo', ${randomUUID()}, ${new Date(current.epochMilliseconds)},
              ${new Date("2026-11-19T12:00:00Z")})`;
    await tx`
      UPDATE app.contribution_counters SET reserved_total = reserved_total + 1
       WHERE occurrence_id = ${day} AND interval_id = ${maya}`;
  };
  const cancelling = (tx: WorldTx, day: string) =>
    tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${day}`;
  const reservationsOf = async (day: string) =>
    (await db<{ n: number }[]>`SELECT count(*)::int AS n FROM app.reservations WHERE occurrence_id = ${day}`)[0]?.n;

  it(
    "refuses a reservation that waits on a cancellation in progress, once it commits (T9)",
    { timeout: 30_000 },
    async () => {
      const { day, maya } = await thursdayOfBen();
      const cancel = await openWith((tx) => cancelling(tx, day));
      let reserved: Promise<unknown>;
      try {
        reserved = outcome(db.begin((raw) => reserving(raw as unknown as WorldTx, day, maya)));
        await waitingOn(db, cancel.pid, 1);
      } finally {
        await cancel.release();
      }
      expect(await reserved).toBe("23000");
      expect(await reservationsOf(day)).toBe(0);
    },
  );

  it(
    "lets a cancellation wait on a reservation in progress, which then stays as it was (T9, FQ63)",
    { timeout: 30_000 },
    async () => {
      const { day, maya } = await thursdayOfBen();
      const reserve = await openWith((tx) => reserving(tx, day, maya));
      let cancelled: Promise<unknown>;
      try {
        cancelled = outcome(db.begin((raw) => cancelling(raw as unknown as WorldTx, day)));
        await waitingOn(db, reserve.pid, 1);
      } finally {
        await reserve.release();
      }
      await cancelled;
      const [row] = await db<{ status: string }[]>`SELECT status FROM app.occurrences WHERE id = ${day}`;
      expect(row?.status).toBe("cancelled");
      expect(await reservationsOf(day)).toBe(1);
    },
  );
});
