/// <reference lib="esnext.temporal" />
// The schedule routes' rows of the privacy matrix (B2's schedule slice: getSchedule, chooseScheduleDays and
// confirmScheduleDays; spec 05; T6, T9, T14, T19, T33, T49, T55; FQ46, FQ48, FQ55, FQ57, FQ75, FQ79, FQ99,
// FQ100; the contract's `Schedule`, section 1.8 of docs/plans/api-b2-contract.md), as the matrix judges them.
// Everything here is read from the world's rows, apart from the statement and the rules the routes run
// (packages/domain/src/schedule/): this file states the contract's rules a second time, so a change to the
// domain's view alone fails here and has to be made here too. `proposalFor` follows the same reading of the
// contract as the domain's `viewFor`, branch for branch, so a misreading both share passes here: the checks
// that don't share it are the contract's own examples (services/api/src/schedule/routes.test.ts, which puts
// `viewFor` against each first-days example read from the contract) and the answers written out by hand in
// ./schedule.test.ts. No role here is a member still choosing who is outside a contested day (Ana has
// confirmed; Ben and Cleo both hold Wednesday): that member's `no_reveal`, with no name and no count, is
// the contract's `contested_other` example in that file and the outsiders of
// tests/src/db/schedule-commands.test.ts. And every role's rows are made before any request, so a retry
// by someone who has since lost the club is there too (its "gives a retry no stored answer…" test; FQ112).
//
// What a cell must get:
// - getSchedule: the neutral not-found unless the viewer's account has an active interval in a club that
//   isn't suspended (the gate has already answered an account being deleted and an unfinished profile).
//   Otherwise the whole `Schedule`, byte for value: the server's instant, the club with the viewer's own
//   interval, `current` (the latest version in force on the club's local date, with the days of its stars
//   still in the club and with a name to show, when it has one) and `proposal` (the club's open one, only when it includes the viewer's interval:
//   a member who joined after it, or left and rejoined, gets `current` alone, FQ100).
// - A proposal as one viewer sees it (`proposalFor`): `owner` and `first_date` on a day someone confirmed
//   (`first_date` only while its owner is still a member); `holders` only to a holder of a contested day,
//   in the order the members joined; `held_by` only to a viewer still choosing, never themselves; no name
//   and no count on a day two or more others hold; `suggested` only on the viewer's own proposed days.
// - A command (`outcomeOf`), in the contract's order: the neutral not-found to anyone the proposal doesn't
//   include; MEMBERSHIP_CHANGED; VERSION_CONFLICT with the version now; NOT_ALLOWED; else 200 with the
//   proposal as the viewer sees it after the change, read from the rows after it, and the rows themselves
//   changed as the request said (`changeProblems`).
//
// - A membership change, a new member's pick (since `api/b2-new-member-day`; the founder's answers to FQ125
//   to FQ127 and to the three-to-four card, FQ129 to FQ131): it includes only the members with no day in the
//   club's latest week, and is read, chosen in and confirmed as the first days are, where each day of the
//   latest week whose member is still in the club is that member's confirmed day, with no `first_date` but
//   on the viewer's own, and a member it includes who has left holds nothing (`seatsOf`, `proposalFor`,
//   `outcomeOf`). A confirmation writes the club's next week: the latest week's days whose member is still
//   in the club, as they were, and the viewer's, each dated from the week after the confirmation
//   (`changeProblems`). What a join or a leave does to the pick and the week is judged row by row
//   (`weekChangeProblems`). The matrix meets one in a club made by the commands themselves (matrix.test.ts,
//   "a new member's pick through the app").
//
// The matrix's world (`addFirstDays`). The matrix's club already has its week in force (db/world.ts: Ana's
// Saturday, Ben's Friday, Cleo's Thursday), which is what `current` shows and what its roles are built on.
// To put every kind of slot, with real names, in front of every role, the world also gets first days no
// command would open beside a week in force: a second schedule version from Sunday 8 November, the day
// after the matrix's one day, and an open `activation` proposal for Ana, Ben and Cleo, two days each (spec
// 05's table for three). Ana has confirmed Monday and Thursday; Ben holds Tuesday and has taken Wednesday
// in place of Ben's proposed Friday; Cleo holds Wednesday and Saturday. So Wednesday is contested, Tuesday and
// Saturday are held by one member, Friday is free and still marked as proposed for Ben. The schema accepts
// these rows, and the migration's guards judge them at commit. The first days as the commands really make
// them, from their opening to their last confirmation, are on Postgres in
// tests/src/db/schedule-commands.test.ts.

import type { Tx, WorldTx } from "../db/harness.ts";
import { AT, checkAsAtCommit, newId, type World } from "../db/world.ts";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import type { Answer } from "./scanner.ts";

/** The operations whose rows this file judges. */
export const SCHEDULE_JUDGED: ReadonlySet<string> = new Set([
  "getSchedule",
  "chooseScheduleDays",
  "confirmScheduleDays",
]);

export const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEK)[number];

const plain = (tx: WorldTx) => tx as unknown as Tx;

/** The first dates of the days Ana confirmed in the matrix's first days. */
const ANA_DAYS = [
  ["monday", "2026-11-09"],
  ["thursday", "2026-11-12"],
] as const;

/**
 * Adds the matrix's first days to `w` (this file's header), before any role changes the club. Returns the
 * proposal. With `confirmed` false, Ana hasn't confirmed, so nobody has: the first days a join or a leave
 * revises (FQ55, FQ102).
 */
export async function addFirstDays(tx: WorldTx, w: World, confirmed = true): Promise<string> {
  const version = newId("sched");
  const proposal = newId("spr");
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${w.club}, '2026-11-08', ${AT.generated})`;
  await tx`
    INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
    VALUES (${proposal}, ${w.club}, 'activation', '2026-11-08', 2, ${version}, ${AT.generated})`;
  const days: readonly (readonly [string, Weekday, boolean, boolean])[] = [
    [w.ana.interval, "monday", true, true],
    [w.ana.interval, "thursday", true, true],
    [w.ben.interval, "tuesday", true, true],
    [w.ben.interval, "friday", true, false],
    [w.ben.interval, "wednesday", false, true],
    [w.cleo.interval, "wednesday", true, true],
    [w.cleo.interval, "saturday", true, true],
  ];
  for (const member of [w.ana, w.ben, w.cleo]) {
    await tx`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposal}, ${w.club}, ${member.interval})`;
  }
  for (const [interval, weekday, suggested, held] of days) {
    await tx`
      INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
      VALUES (${proposal}, ${interval}, ${weekday}, ${suggested}, ${held})`;
  }
  if (confirmed) {
    await tx`
      UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.generated}
       WHERE proposal_id = ${proposal} AND interval_id = ${w.ana.interval}`;
  }
  for (const [weekday, firstDate] of confirmed ? ANA_DAYS : []) {
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      VALUES (${version}, ${w.club}, ${weekday}, ${w.ana.interval}, ${firstDate}, ${AT.generated})`;
  }
  await checkAsAtCommit(plain(tx));
  return proposal;
}

export interface ScheduleMember {
  club: string;
  account: string;
  /** Whether the interval is active. */
  active: boolean;
  joinedAt: Temporal.Instant;
  /** The name members see (FQ75): the account's while the interval is active, the one it ended with after. */
  name: string | null;
  /** The avatar's version members see: only while the interval and the account are both active. */
  avatar: string | null;
}

export interface ScheduleProposalRows {
  club: string;
  state: "open" | "applied" | "superseded";
  version: number;
  reason: string;
  effectiveFrom: string;
  daysPerMember: number;
  scheduleVersion: string | null;
  replacedBy: string | null;
  /** Which proposed week the proposal is on (db/migrations/0013_first_days_revision.sql). */
  weekRevision: number;
  members: { interval: string; confirmed: boolean }[];
  /** The rows of its current week, which are all a route answers from. */
  days: { interval: string; weekday: Weekday; suggested: boolean; held: boolean }[];
  /** The rows of its earlier weeks, which nothing answers from and nothing changes. */
  earlier: { interval: string; weekday: Weekday; suggested: boolean; held: boolean; weekRevision: number }[];
}

/** The schedule's rows of some clubs, as the judges read them. */
export interface ScheduleWorld {
  clubs: Map<string, { name: string; timezone: string; suspended: boolean }>;
  /** By membership interval. */
  members: Map<string, ScheduleMember>;
  /** The accounts whose state is `active`. */
  activeAccounts: Set<string>;
  versions: {
    id: string;
    club: string;
    effectiveFrom: string;
    assignments: { weekday: Weekday; star: string; firstDate: string }[];
  }[];
  proposals: Map<string, ScheduleProposalRows>;
}

/** Reads the schedule's rows of `clubs` on `db`, a connection of the test's own. */
export async function scheduleWorldOf(db: WorldTx, clubs: readonly string[]): Promise<ScheduleWorld> {
  const clubRows = await db<{ id: string; name: string; timezone: string; suspended: boolean }[]>`
    SELECT id, name, timezone, suspended_at IS NOT NULL AS suspended FROM app.clubs WHERE id IN ${db(clubs)}`;
  const memberRows = await db<
    {
      interval_id: string;
      club: string;
      account: string;
      active: boolean;
      account_active: boolean;
      joined_at: Temporal.Instant;
      name: string | null;
      ended_name: string | null;
      avatar: string | null;
    }[]
  >`
    SELECT m.interval_id, m.club_id AS club, m.user_id AS account, m.state = 'active' AS active,
           u.state = 'active' AS account_active, m.joined_at, u.display_name AS name,
           m.ended_display_name AS ended_name,
           (SELECT a.content_version FROM app.uploads a WHERE a.id = u.avatar_upload_id AND a.state = 'ready') AS avatar
      FROM app.memberships m JOIN app.users u ON u.id = m.user_id
     WHERE m.club_id IN ${db(clubs)}`;
  const versionRows = await db<{ id: string; club: string; effective_from: string }[]>`
    SELECT id, club_id AS club, effective_from::text AS effective_from
      FROM app.schedule_versions WHERE club_id IN ${db(clubs)}`;
  const assignmentRows = await db<{ version: string; weekday: Weekday; star: string; first_date: string }[]>`
    SELECT schedule_version_id AS version, weekday::text AS weekday, star_interval_id AS star,
           first_date::text AS first_date
      FROM app.schedule_assignments WHERE club_id IN ${db(clubs)}`;
  const proposalRows = await db<
    {
      id: string;
      club: string;
      state: ScheduleProposalRows["state"];
      version: number;
      reason: string;
      effective_from: string;
      days_per_member: number;
      week_revision: number;
      schedule_version: string | null;
      replaced_by: string | null;
    }[]
  >`
    SELECT id, club_id AS club, state, version, reason, effective_from::text AS effective_from, days_per_member,
           week_revision, schedule_version_id AS schedule_version, replaced_by
      FROM app.schedule_proposals WHERE club_id IN ${db(clubs)}`;
  const proposalMembers = await db<{ proposal: string; interval: string; confirmed: boolean }[]>`
    SELECT proposal_id AS proposal, interval_id AS interval, confirmed_at IS NOT NULL AS confirmed
      FROM app.schedule_proposal_members WHERE club_id IN ${db(clubs)}`;
  const proposalDays = await db<
    {
      proposal: string;
      interval: string;
      weekday: Weekday;
      suggested: boolean;
      held: boolean;
      week_revision: number;
    }[]
  >`
    SELECT d.proposal_id AS proposal, d.interval_id AS interval, d.weekday::text AS weekday, d.suggested, d.held,
           d.week_revision
      FROM app.schedule_proposal_days d JOIN app.schedule_proposals p ON p.id = d.proposal_id
     WHERE p.club_id IN ${db(clubs)}`;
  return {
    clubs: new Map(
      clubRows.map((row) => [row.id, { name: row.name, timezone: row.timezone, suspended: row.suspended }]),
    ),
    members: new Map(
      memberRows.map((row) => [
        row.interval_id,
        {
          club: row.club,
          account: row.account,
          active: row.active,
          joinedAt: row.joined_at,
          name: row.active ? row.name : row.ended_name,
          avatar: row.active && row.account_active ? row.avatar : null,
        },
      ]),
    ),
    activeAccounts: new Set(memberRows.filter((row) => row.account_active).map((row) => row.account)),
    versions: versionRows.map((row) => ({
      id: row.id,
      club: row.club,
      effectiveFrom: row.effective_from,
      assignments: assignmentRows
        .filter((each) => each.version === row.id)
        .map((each) => ({ weekday: each.weekday, star: each.star, firstDate: each.first_date })),
    })),
    proposals: new Map(
      proposalRows.map((row) => [
        row.id,
        {
          club: row.club,
          state: row.state,
          version: row.version,
          reason: row.reason,
          effectiveFrom: row.effective_from,
          daysPerMember: row.days_per_member,
          weekRevision: row.week_revision,
          scheduleVersion: row.schedule_version,
          replacedBy: row.replaced_by,
          members: proposalMembers
            .filter((each) => each.proposal === row.id)
            .map((each) => ({ interval: each.interval, confirmed: each.confirmed })),
          days: proposalDays
            .filter((each) => each.proposal === row.id && each.week_revision === row.week_revision)
            .map((each) => ({
              interval: each.interval,
              weekday: each.weekday,
              suggested: each.suggested,
              held: each.held,
            })),
          earlier: proposalDays
            .filter((each) => each.proposal === row.id && each.week_revision !== row.week_revision)
            .map((each) => ({
              interval: each.interval,
              weekday: each.weekday,
              suggested: each.suggested,
              held: each.held,
              weekRevision: each.week_revision,
            })),
        },
      ]),
    ),
  };
}

/**
 * The viewer's interval in `club`, when the schedule is theirs to see (T9, T14; FQ80): their account is
 * active, the interval is, and the club isn't suspended. Undefined otherwise.
 */
export function viewerIn(world: ScheduleWorld, club: string, account: string | null): string | undefined {
  if (account === null || !world.activeAccounts.has(account)) return undefined;
  if (world.clubs.get(club)?.suspended !== false) return undefined;
  for (const [interval, member] of world.members) {
    if (member.club === club && member.account === account && member.active) return interval;
  }
  return undefined;
}

/** The contract's Person for `interval`, or undefined when there is no name to show. */
function personOf(world: ScheduleWorld, interval: string): Record<string, unknown> | undefined {
  const member = world.members.get(interval);
  if (member === undefined || member.name === null) return undefined;
  return {
    membership_id: interval,
    display_name: member.name,
    ...(member.avatar === null ? {} : { avatar_version: member.avatar }),
  };
}

/** Ids as the database orders them byte by byte: every character of an id is ASCII. */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One member as a proposal's slots are worked out from: a member it includes, or one with a day in the week. */
interface Seat {
  interval: string;
  confirmed: boolean;
  active: boolean;
  /** The weekdays they hold: in a pick, none once they have left. */
  held: Weekday[];
  suggested: Weekday[];
}

/** The club's latest week: the version that starts last. */
function latestWeek(world: ScheduleWorld, club: string): ScheduleWorld["versions"][number] | undefined {
  return world.versions
    .filter((version) => version.club === club)
    .sort((a, b) => byBytes(a.effectiveFrom, b.effectiveFrom))
    .at(-1);
}

/**
 * The members a proposal's slots come from, in the order they joined, and the first dates its days show. The
 * first days: the members it includes, as their rows say, with the dates of its own week. A pick (FQ125,
 * FQ127): the members it includes, one who has left holding nothing, then each other member still in the
 * club with a day in the club's latest week, confirmed on those days, with the dates of that week's days
 * whose member is still in the club.
 */
function seatsOf(
  world: ScheduleWorld,
  proposal: ScheduleProposalRows,
): { seats: Seat[]; dates: { weekday: Weekday; firstDate: string }[] } {
  const joined = (interval: string) =>
    world.members.get(interval)?.joinedAt ?? Temporal.Instant.fromEpochMilliseconds(0);
  // The order the members joined; two who joined at the same instant, by their interval's id.
  const order = (a: Seat, b: Seat) =>
    Temporal.Instant.compare(joined(a.interval), joined(b.interval)) || byBytes(a.interval, b.interval);
  const active = (interval: string) => world.members.get(interval)?.active === true;
  const rows = (interval: string, which: "held" | "suggested") =>
    WEEK.filter((weekday) =>
      proposal.days.some((day) => day.interval === interval && day.weekday === weekday && day[which]),
    );
  const listed = proposal.members.map((member): Seat => ({
    interval: member.interval,
    confirmed: member.confirmed,
    active: active(member.interval),
    held: rows(member.interval, "held"),
    suggested: rows(member.interval, "suggested"),
  }));
  if (proposal.reason !== "membership_change") {
    const own = world.versions.find((version) => version.id === proposal.scheduleVersion);
    return { seats: listed.sort(order), dates: own?.assignments ?? [] };
  }
  const week = (latestWeek(world, proposal.club)?.assignments ?? []).filter((each) => active(each.star));
  const stars = [...new Set(week.map((each) => each.star))].filter(
    (star) => !proposal.members.some((member) => member.interval === star),
  );
  return {
    seats: [
      ...listed.map((seat) => (seat.active ? seat : { ...seat, held: [] })),
      ...stars.map((star): Seat => ({
        interval: star,
        confirmed: true,
        active: true,
        held: WEEK.filter((weekday) => week.some((each) => each.star === star && each.weekday === weekday)),
        suggested: [],
      })),
    ].sort(order),
    dates: week,
  };
}

/**
 * The proposal `id` as the member `viewer` (an interval it includes) must get it: the contract's
 * ScheduleProposal.
 */
export function proposalFor(world: ScheduleWorld, id: string, viewer: string): Record<string, unknown> {
  const proposal = world.proposals.get(id);
  if (proposal === undefined) throw new Error("the judge was asked about a proposal the world doesn't hold");
  if (!proposal.members.some((member) => member.interval === viewer))
    throw new Error("the judge was asked about a viewer the proposal doesn't include");
  const { seats, dates } = seatsOf(world, proposal);
  const me = seats.find((seat) => seat.interval === viewer);
  if (me === undefined) throw new Error("the judge lost the viewer's seat");
  const pick = proposal.reason === "membership_change";
  const slots = WEEK.map((weekday) => {
    const suggested = me.suggested.includes(weekday);
    const confirmer = seats.find((seat) => seat.confirmed && seat.held.includes(weekday));
    if (confirmer !== undefined) {
      const mine = confirmer.interval === viewer;
      // In a pick, only the viewer's own day shows its first date (FQ130).
      const date =
        confirmer.active && (mine || !pick) ? dates.find((each) => each.weekday === weekday)?.firstDate : undefined;
      const owner = mine ? undefined : personOf(world, confirmer.interval);
      return {
        weekday,
        state: mine ? "yours" : "taken",
        ...(owner === undefined ? {} : { owner }),
        ...(date === undefined ? {} : { first_date: date }),
        suggested,
      };
    }
    const holders = seats.filter((seat) => seat.active && !seat.confirmed && seat.held.includes(weekday));
    if (holders.some((seat) => seat.interval === viewer)) {
      return holders.length === 1
        ? { weekday, state: "yours", suggested }
        : { weekday, state: "clash", holders: holders.map((seat) => personOf(world, seat.interval)), suggested };
    }
    if (holders.length >= 2) return { weekday, state: "no_reveal", suggested };
    const [other] = holders;
    return {
      weekday,
      state: "available",
      ...(other === undefined || me.confirmed ? {} : { held_by: personOf(world, other.interval) }),
      suggested,
    };
  });
  return {
    id,
    version: proposal.version,
    reason: proposal.reason,
    effective_from: proposal.effectiveFrom,
    days_per_member: proposal.daysPerMember,
    slots,
    my_days: me.held,
    my_state: me.confirmed ? "confirmed" : "choosing",
    state: proposal.state,
  };
}

/** An instant as the contract writes it: whole seconds, rounded down, and Z. */
const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/** The contract's Schedule of `club` for the account `account` at `now`, or undefined: the neutral not-found. */
export function weekFor(
  world: ScheduleWorld,
  club: string,
  account: string | null,
  now: Temporal.Instant,
): Record<string, unknown> | undefined {
  const viewer = viewerIn(world, club, account);
  const row = world.clubs.get(club);
  if (viewer === undefined || row === undefined) return undefined;
  const today = now.toZonedDateTimeISO(row.timezone).toPlainDate().toString();
  const inForce = world.versions
    .filter((version) => version.club === club && version.effectiveFrom <= today)
    .sort((a, b) => byBytes(a.effectiveFrom, b.effectiveFrom))
    .at(-1);
  const assignments = WEEK.flatMap((weekday) => {
    const found = inForce?.assignments.find((each) => each.weekday === weekday);
    // Only a member still in the club: a leaver's day won't open, and is free for a new member's pick.
    const person =
      found === undefined || world.members.get(found.star)?.active !== true ? undefined : personOf(world, found.star);
    return person === undefined ? [] : [{ weekday, person }];
  });
  const open = [...world.proposals].find(
    ([, proposal]) =>
      proposal.club === club &&
      proposal.state === "open" &&
      proposal.members.some((member) => member.interval === viewer),
  );
  return {
    server_now: second(now),
    club: { id: club, name: row.name, timezone: row.timezone, my_membership_id: viewer },
    ...(inForce === undefined || assignments.length === 0
      ? {}
      : { current: { effective_from: inForce.effectiveFrom, assignments } }),
    ...(open === undefined ? {} : { proposal: proposalFor(world, open[0], viewer) }),
  };
}

/** A JSON value with its keys sorted, so two values compare as text whatever order their keys came in. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body);
  } catch {
    return undefined;
  }
}

/** A 200 whose body is `want`, value for value; the first slot or field that differs is named. */
export function sameBody(what: string, want: Record<string, unknown>): (answer: Answer) => string[] {
  return (answer) => {
    if (answer.status !== 200) return [`status ${String(answer.status)}, not ${what}`];
    if (answer.headers["cache-control"] !== "private, no-store") return [`${what} without private, no-store`];
    const body = parsed(answer);
    if (!isObject(body)) return [`not ${what}`];
    if (canonical(body) === canonical(want)) return [];
    const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
    const differing = keys.filter((key) => canonical(body[key]) !== canonical(want[key]));
    return differing.map(
      (key) => `${what}'s ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`,
    );
  };
}

/** What the judges know of a cell: its schedule rows, the viewer's account and the server's instant. */
export interface ScheduleSeen {
  schedule: ScheduleWorld;
  account: string | null;
  now: Temporal.Instant;
}

/** getSchedule's answer for `club` in a cell. */
export function weekExpected(seen: () => ScheduleSeen, club: string): Expected {
  return (answer) => {
    const { schedule, account, now } = seen();
    const want = weekFor(schedule, club, account, now);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameBody("the club's Schedule", want)(answer);
  };
}

export type ScheduleCommand = "chooseScheduleDays" | "confirmScheduleDays";

const NOT_ALLOWED = pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}');

/** What a body the contract accepts must get, from the rows before it: a pinned refusal, or `ok`. */
export function outcomeOf(
  world: ScheduleWorld,
  command: ScheduleCommand,
  proposalId: string,
  account: string | null,
  body: { expected_version: number; weekdays: readonly Weekday[] },
): Answer | "ok" {
  const proposal = world.proposals.get(proposalId);
  if (proposal === undefined) return NEUTRAL;
  const viewer = viewerIn(world, proposal.club, account);
  const listed = proposal.members.find((member) => member.interval === viewer);
  if (viewer === undefined || listed === undefined) return NEUTRAL;
  if (proposal.replacedBy !== null) {
    // The club's open proposal, however many replacements on, when it includes the viewer (FQ131); with none
    // open, or one that doesn't, an ended proposal.
    const current = [...world.proposals].find(
      ([, each]) =>
        each.club === proposal.club &&
        each.state === "open" &&
        each.members.some((member) => member.interval === viewer),
    );
    if (current !== undefined) {
      return pinned(409, "Conflict", `{"code":"MEMBERSHIP_CHANGED","current_id":"${current[0]}"}`);
    }
  }
  if (proposal.version !== body.expected_version) {
    return pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":${String(proposal.version)}}`);
  }
  if (proposal.state !== "open" || listed.confirmed) return NOT_ALLOWED;
  // The same rule for both kinds, on their seats: in a pick, each day of the week in force whose member is
  // still in the club is that member's confirmed day (FQ125, FQ127).
  const { seats } = seatsOf(world, proposal);
  const confirmed = (weekday: Weekday) => seats.some((seat) => seat.confirmed && seat.held.includes(weekday));
  if (body.weekdays.some(confirmed)) return NOT_ALLOWED;
  if (command === "chooseScheduleDays") return body.weekdays.length > proposal.daysPerMember ? NOT_ALLOWED : "ok";
  const mine = seats.find((seat) => seat.interval === viewer)?.held ?? [];
  const named = WEEK.filter((weekday) => body.weekdays.includes(weekday));
  if (mine.length !== proposal.daysPerMember || canonical(mine) !== canonical(named)) return NOT_ALLOWED;
  const contested = named.some((weekday) =>
    seats.some((seat) => seat.interval !== viewer && seat.active && !seat.confirmed && seat.held.includes(weekday)),
  );
  return contested ? NOT_ALLOWED : "ok";
}

/** The local date `days` after `date`. */
const plusDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();

/**
 * What an accepted command must have left in the rows (T6, T33, T49): the choice's days held and nothing
 * else of the viewer's; or the viewer confirmed with a dated day each, and the proposal applied at its next
 * version exactly when every member it includes who is still active has then confirmed. A pick's
 * confirmation dates the viewer's days in the club's next week, from `today`, the club's local date at the
 * request (FQ130).
 */
export function changeProblems(
  before: ScheduleWorld,
  after: ScheduleWorld,
  command: ScheduleCommand,
  proposalId: string,
  account: string | null,
  weekdays: readonly Weekday[],
  today?: string,
  at?: Temporal.Instant,
): string[] {
  const was = before.proposals.get(proposalId);
  const now = after.proposals.get(proposalId);
  if (was === undefined || now === undefined) return ["the proposal is gone from the rows"];
  const viewer = viewerIn(after, now.club, account);
  if (viewer === undefined) return ["the viewer is no longer a member after their own request"];
  const problems: string[] = [];
  const held = WEEK.filter((weekday) =>
    now.days.some((day) => day.interval === viewer && day.weekday === weekday && day.held),
  );
  const asked = WEEK.filter((weekday) => weekdays.includes(weekday));
  if (canonical(held) !== canonical(asked))
    problems.push(`the viewer holds ${held.join(", ")}, not ${asked.join(", ")}`);
  // Nobody else's rows moved (T6: nobody is swapped).
  const others = (rows: ScheduleProposalRows) =>
    canonical(
      rows.days
        .filter((day) => day.interval !== viewer)
        .map((day) => `${day.interval} ${day.weekday} ${String(day.suggested)} ${String(day.held)}`)
        .sort(),
    );
  if (others(was) !== others(now)) problems.push("another member's days changed");
  const me = now.members.find((member) => member.interval === viewer);
  if (command === "chooseScheduleDays") {
    if (now.version !== was.version || now.state !== was.state)
      problems.push("a choice moved the version or the state (T33)");
    if (me?.confirmed === true) problems.push("a choice confirmed the viewer");
    return problems;
  }
  if (me?.confirmed !== true) problems.push("the viewer isn't confirmed after their confirmation");
  const othersConfirmed = (rows: ScheduleProposalRows) =>
    canonical(
      rows.members
        .filter((member) => member.interval !== viewer)
        .map((member) => `${member.interval} ${String(member.confirmed)}`)
        .sort(),
    );
  if (othersConfirmed(was) !== othersConfirmed(now)) problems.push("another member's confirmation changed");
  if (now.reason === "membership_change") {
    // The club's next week (FQ125, FQ126, FQ130): from `today`, or the day after the latest week's start
    // when that is today or later; every day of the latest week whose member is still in the club, as it
    // was; and the viewer's days, each on or after that start and in a week after today's.
    if (today === undefined) throw new Error("the judge needs the club's date to judge a pick's confirmation");
    const earlier = latestWeek(before, now.club);
    const next = latestWeek(after, now.club);
    const added = after.versions.filter(
      (version) => version.club === now.club && !before.versions.some((each) => each.id === version.id),
    );
    if (next === undefined || added.length !== 1 || added[0]?.id !== next.id) {
      problems.push("the confirmation didn't write the club's next week, and only it");
      return problems;
    }
    const start = earlier !== undefined && earlier.effectiveFrom >= today ? plusDays(earlier.effectiveFrom, 1) : today;
    if (next.effectiveFrom !== start) problems.push(`the next week starts on ${next.effectiveFrom}, not ${start}`);
    const line = (each: { weekday: Weekday; star: string; firstDate: string }) =>
      `${each.weekday} ${each.star} ${each.firstDate}`;
    const kept = (earlier?.assignments ?? []).filter((each) => after.members.get(each.star)?.active === true);
    if (
      canonical(kept.map(line).sort()) !==
      canonical(
        next.assignments
          .filter((each) => each.star !== viewer)
          .map(line)
          .sort(),
      )
    )
      problems.push("the next week doesn't hold the latest week's days as they were (FQ125, FQ126)");
    const nextMonday = plusDays(today, 8 - Temporal.PlainDate.from(today).dayOfWeek);
    const mine = next.assignments.filter((each) => each.star === viewer);
    if (canonical(WEEK.filter((weekday) => mine.some((each) => each.weekday === weekday))) !== canonical(asked))
      problems.push(
        `the next week gives the viewer ${mine.map((each) => each.weekday).join(", ")}, not ${asked.join(", ")}`,
      );
    for (const each of mine) {
      if (each.firstDate < nextMonday || each.firstDate < start)
        problems.push(
          `${each.weekday} first opens on ${each.firstDate}, before the week after the confirmation (FQ130)`,
        );
    }
    // FQ130 exactly, given the confirmation's instant: the first such weekday on or after both, whose 7 AM
    // in the club's zone is at least 24 elapsed hours after it (FQ79). The world here has no days, so a
    // first date pushed past a member's last announced day on that weekday is the database tests'
    // (tests/src/db/membership-change.test.ts).
    const zone = after.clubs.get(now.club)?.timezone;
    if (at !== undefined && zone !== undefined) {
      for (const each of mine) {
        let date = Temporal.PlainDate.from(nextMonday > start ? nextMonday : start);
        const early = (day: Temporal.PlainDate) =>
          Temporal.Instant.compare(
            day.toZonedDateTime({ timeZone: zone, plainTime: "07:00" }).toInstant(),
            at.add({ hours: 24 }),
          ) < 0;
        while (WEEK[date.dayOfWeek - 1] !== each.weekday || early(date)) date = date.add({ days: 1 });
        if (each.firstDate !== date.toString())
          problems.push(`${each.weekday} first opens on ${each.firstDate}, not ${date.toString()} (FQ130)`);
      }
    }
  } else {
    const dated = after.versions.find((version) => version.id === now.scheduleVersion)?.assignments ?? [];
    for (const weekday of asked) {
      const day = dated.find((each) => each.weekday === weekday);
      if (day?.star !== viewer) problems.push(`${weekday} has no dated day of the viewer's (T49)`);
    }
  }
  const everyone = now.members
    .filter((member) => after.members.get(member.interval)?.active === true)
    .every((member) => member.confirmed);
  const want = everyone ? { state: "applied", version: was.version + 1 } : { state: "open", version: was.version };
  if (now.state !== want.state || now.version !== want.version) {
    problems.push(
      `the proposal is ${now.state} at version ${String(now.version)}, not ${want.state} at ${String(want.version)} (T33)`,
    );
  }
  return problems;
}

/** The viewer's held and proposed days in the cell's proposal, or none for a viewer it doesn't include. */
export function daysOfViewer(
  world: ScheduleWorld,
  proposalId: string,
  account: string | null,
): { held: Weekday[]; suggested: Weekday[] } {
  const proposal = world.proposals.get(proposalId);
  const viewer = proposal === undefined ? undefined : viewerIn(world, proposal.club, account);
  const rows = (proposal?.days ?? []).filter((day) => day.interval === viewer);
  return {
    held: WEEK.filter((weekday) => rows.some((day) => day.weekday === weekday && day.held)),
    suggested: WEEK.filter((weekday) => rows.some((day) => day.weekday === weekday && day.suggested)),
  };
}

/** One body sent to a schedule command in a cell. */
export interface ScheduleCase {
  name: string;
  command: ScheduleCommand;
  /** The proposal the path names: the cell's, one that names nothing, or another club's. */
  proposal: "cell" | "guessed" | "elsewhere";
  /** The body as sent, from the rows as they stand; a string is sent as it is. */
  body(world: ScheduleWorld, version: number): { expected_version: number; weekdays: readonly Weekday[] } | string;
  /** For a body the contract refuses before any rule: the 400 everyone the gate lets through gets. */
  refused?: Answer;
  /** The request carries no Idempotency-Key. */
  noKey?: boolean;
  /**
   * The request of the case before it once more, under the same key: the same bytes (T19). That case is a
   * choice of the days already held, so running it twice would answer the same too: this shows only that
   * every role's retry is answered as its first request was. That a retry is the stored answer and not a
   * second run is tests/src/db/schedule-commands.test.ts's "answers a retry with the first answer as it
   * was, though the week has changed since".
   */
  again?: boolean;
  /** Cases of one group must get the same bytes from a caller the proposal doesn't include (T14). */
  group?: string;
}

const invalid = (field?: string) =>
  pinned(
    400,
    "Bad Request",
    field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
  );

/** A day to name when the viewer holds none: a request must name one to pass the contract's own check. */
const someDay = (days: readonly Weekday[]): readonly Weekday[] => (days.length === 0 ? ["tuesday"] : days);

/**
 * The bodies a cell sends the two commands for the proposal `cellProposal` as the account `account`:
 * what the contract refuses first, then each refusal in the contract's order, then requests that change
 * nothing, and, in the cell's last phase, the viewer's own choice and confirmation, as a member would make
 * them. Every expectation comes from `outcomeOf`, on the rows as they stand when the request is sent.
 */
export function scheduleCases(cellProposal: string, account: string | null, last: boolean): ScheduleCase[] {
  const mine = (world: ScheduleWorld) => daysOfViewer(world, cellProposal, account);
  const cases: ScheduleCase[] = [
    {
      name: "no Idempotency-Key",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (_world, version) => ({ expected_version: version, weekdays: [] }),
      refused: invalid("Idempotency-Key"),
      noKey: true,
    },
    {
      name: "a weekday that is nobody's day",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (_world, version) => JSON.stringify({ expected_version: version, weekdays: ["sunday"] }),
      refused: invalid("weekdays"),
    },
    {
      name: "the same weekday twice",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (_world, version) => JSON.stringify({ expected_version: version, weekdays: ["monday", "monday"] }),
      refused: invalid("weekdays"),
    },
    {
      name: "a confirmation of no day",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (_world, version) => JSON.stringify({ expected_version: version, weekdays: [] }),
      refused: invalid("weekdays"),
    },
    {
      name: "a field the contract doesn't have",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (_world, version) => JSON.stringify({ expected_version: version, weekdays: ["monday"], member: "mem_x" }),
      refused: invalid(),
    },
    {
      name: "a proposal that names nothing",
      command: "chooseScheduleDays",
      proposal: "guessed",
      body: () => ({ expected_version: 1, weekdays: ["friday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "another club's proposal",
      command: "chooseScheduleDays",
      proposal: "elsewhere",
      body: () => ({ expected_version: 1, weekdays: ["friday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "another club's proposal, to confirm",
      command: "confirmScheduleDays",
      proposal: "elsewhere",
      body: () => ({ expected_version: 1, weekdays: ["tuesday", "friday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "a version that isn't the proposal's",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (_world, version) => ({ expected_version: version + 1, weekdays: ["friday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "a day another member has confirmed",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (_world, version) => ({ expected_version: version, weekdays: ["monday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "a confirmation of a day another member has confirmed",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (_world, version) => ({ expected_version: version, weekdays: ["monday"] }),
      group: "not the caller's proposal",
    },
    {
      name: "more days than a member has",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (_world, version) => ({ expected_version: version, weekdays: ["tuesday", "friday", "saturday"] }),
      refused: invalid("weekdays"),
    },
    {
      name: "the days the viewer holds, chosen again",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (world, version) => ({ expected_version: version, weekdays: mine(world).held }),
      group: "not the caller's proposal",
    },
    {
      name: "the same request again under its key",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (world, version) => ({ expected_version: version, weekdays: mine(world).held }),
      again: true,
      group: "not the caller's proposal",
    },
    {
      name: "a confirmation of the days the viewer holds",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (world, version) => ({ expected_version: version, weekdays: someDay(mine(world).held) }),
      group: "not the caller's proposal",
    },
  ];
  if (!last) return cases.filter((one) => one.name !== "a confirmation of the days the viewer holds");
  // The last phase: the viewer goes back to their proposed days, which ends a contest they were in, and
  // confirms them. Before it, the confirmation above has been refused wherever the day was contested.
  return [
    ...cases,
    {
      name: "the viewer's proposed days, chosen",
      command: "chooseScheduleDays",
      proposal: "cell",
      body: (world, version) => ({ expected_version: version, weekdays: mine(world).suggested }),
      group: "not the caller's proposal",
    },
    {
      name: "the viewer's days, confirmed",
      command: "confirmScheduleDays",
      proposal: "cell",
      body: (world, version) => ({ expected_version: version, weekdays: someDay(mine(world).held) }),
      group: "not the caller's proposal",
    },
  ];
}

/** The body the matrix's generic requests send a command: a day Ana has confirmed, at `version`. */
export function genericBody(version: number): { expected_version: number; weekdays: readonly Weekday[] } {
  return { expected_version: version, weekdays: ["monday"] };
}

/**
 * What a cell's generic request to a schedule command must get (matrix.test.ts gives it `genericBody` at
 * the proposal's version when the cell began): what `outcomeOf` says, which is never `ok` for a day
 * already confirmed, so these requests change nothing wherever they are sent.
 */
export function commandExpected(
  seen: () => ScheduleSeen,
  command: ScheduleCommand,
  proposalId: string,
  version: number,
): Expected {
  return (answer) => {
    const { schedule, account } = seen();
    const outcome = outcomeOf(schedule, command, proposalId, account, genericBody(version));
    if (outcome === "ok") return ["the judge's own generic request would change the world"];
    return pinnedProblems(answer, outcome);
  };
}

/**
 * What a join or a leave must have left of the club's week and its pick, row by row, from the rows before
 * and after it and `at.today`, the club's local date then (spec 05; FQ16, FQ100, FQ102; the founder's answers
 * to FQ125 to FQ127 and to the three-to-four card, FQ129 to FQ131), stated here apart from
 * packages/domain/src/schedule/change.ts:
 * - while the first days are open, or in a club where none ever applied, no pick and no week is made or
 *   moved;
 * - each active member keeps their days of the club's latest week. Only where the weekdays nobody active
 *   has there are fewer than spec 05's number for the club's size times the active members with no day
 *   there (three who hold all six, and a fourth) are days freed: each keeps their days from Monday up to
 *   that number, and any beyond it are freed. Then a new week holds exactly the days kept, as they were,
 *   from `today` or the day after the latest week's start when that is today or later; otherwise no week
 *   is made;
 * - the members with no day kept pick: with fewer than two active members no pick is open, and one that was
 *   ends superseded at its next version with no successor. An open pick with spec 05's number of days each
 *   gains a row for each of them it doesn't list, unconfirmed, nothing else of it moving (T33); else, with
 *   nobody it lists still a member, it ends superseded with no successor, and with everyone it lists who is
 *   still a member confirmed, it ends applied, each at its next version. One with another number ends the
 *   same way when nobody is left without a day, and otherwise is superseded naming a new one. A new pick is
 *   at version 1 in its one week, with no week of its own, for exactly the members with no day kept, each
 *   holding spec 05's number of days, each proposed and held: in the order they joined, first the days a
 *   member held in the pick it replaces that nobody keeps, up to that number from Monday, an earlier
 *   joiner's where two held one, then the table's days for their place when nobody keeps them or was given
 *   them, else the first such from Monday. A member added to an open pick is given days the same way,
 *   apart from those its unconfirmed members hold.
 * The days a freed day cancels are the database tests' (tests/src/db/membership-change.test.ts): the world
 * here has no days.
 */
export function weekChangeProblems(
  before: ScheduleWorld,
  after: ScheduleWorld,
  club: string,
  at: { today: string },
): string[] {
  const picks = (world: ScheduleWorld) =>
    [...world.proposals].filter(([, each]) => each.club === club && each.reason === "membership_change");
  const openIn = (world: ScheduleWorld) => picks(world).find(([, each]) => each.state === "open");
  const text = (rows: ScheduleProposalRows | undefined) =>
    rows === undefined
      ? "nothing"
      : canonical({
          ...rows,
          members: rows.members.map((member) => `${member.interval} ${String(member.confirmed)}`).sort(),
          days: rows.days
            .map((day) => `${day.interval} ${day.weekday} ${String(day.suggested)} ${String(day.held)}`)
            .sort(),
        });
  const weeksText = (world: ScheduleWorld) =>
    canonical(
      world.versions
        .filter((version) => version.club === club)
        .map((version) => ({
          ...version,
          assignments: version.assignments.map((each) => `${each.weekday} ${each.star} ${each.firstDate}`).sort(),
        }))
        .sort((a, b) => byBytes(a.id, b.id)),
    );
  const problems: string[] = [];
  const was = openIn(before);
  const now = openIn(after);
  // A pick that had ended is as it was.
  for (const [id, rows] of picks(before)) {
    if (rows.state !== "open" && text(after.proposals.get(id)) !== text(rows))
      problems.push(`the ended pick ${id} moved`);
  }
  const proposals = [...after.proposals.values()].filter((each) => each.club === club);
  if (
    proposals.some((each) => each.reason === "activation" && each.state === "open") ||
    !proposals.some((each) => each.reason === "activation" && each.state === "applied")
  ) {
    if (
      canonical(picks(before).map(([id, rows]) => [id, text(rows)])) !==
      canonical(picks(after).map(([id, rows]) => [id, text(rows)]))
    )
      problems.push("a pick was made or moved where none is due");
    if (weeksText(before) !== weeksText(after)) problems.push("a week was made where none is due");
    return problems;
  }

  const joined = (interval: string) =>
    after.members.get(interval)?.joinedAt ?? Temporal.Instant.fromEpochMilliseconds(0);
  const active = [...after.members]
    .filter(([, member]) => member.club === club && member.active)
    .map(([interval]) => interval)
    .sort((a, b) => Temporal.Instant.compare(joined(a), joined(b)) || byBytes(a, b));
  const per = active.length <= 3 ? 2 : 1;
  const latest = latestWeek(before, club);
  const theirs = (interval: string) =>
    WEEK.flatMap((weekday) =>
      (latest?.assignments ?? []).filter((each) => each.star === interval && each.weekday === weekday),
    );
  const unplaced = active.filter((interval) => theirs(interval).length === 0).length;
  const nobodys = WEEK.filter((weekday) =>
    active.every((interval) => !theirs(interval).some((each) => each.weekday === weekday)),
  ).length;
  const short = nobodys < per * unplaced;
  const kept: { weekday: Weekday; star: string; firstDate: string }[] = [];
  let freed = false;
  for (const interval of active) {
    const days = theirs(interval);
    kept.push(...(short ? days.slice(0, per) : days));
    if (short && days.length > per) freed = true;
  }
  // The week.
  const added = after.versions.filter(
    (version) => version.club === club && !before.versions.some((each) => each.id === version.id),
  );
  if (freed) {
    const [week] = added;
    const start =
      latest !== undefined && latest.effectiveFrom >= at.today ? plusDays(latest.effectiveFrom, 1) : at.today;
    const line = (each: { weekday: Weekday; star: string; firstDate: string }) =>
      `${each.weekday} ${each.star} ${each.firstDate}`;
    if (added.length !== 1 || week === undefined) problems.push("days were freed with no new week, or more than one");
    else {
      if (week.effectiveFrom !== start) problems.push(`the new week starts on ${week.effectiveFrom}, not ${start}`);
      if (canonical(week.assignments.map(line).sort()) !== canonical(kept.map(line).sort()))
        problems.push("the new week isn't the days each member keeps, as they were");
    }
    if (
      weeksText({ ...after, versions: after.versions.filter((version) => !added.includes(version)) }) !==
      weeksText(before)
    )
      problems.push("an earlier week moved");
  } else if (weeksText(before) !== weeksText(after)) problems.push("a week was made or moved though no day was freed");

  // The pick.
  const withDay = new Set(kept.map((each) => each.star));
  const fresh = active.filter((interval) => !withDay.has(interval));
  const taken = new Set<Weekday>(kept.map((each) => each.weekday));
  const table = (place: number): Weekday[] =>
    (per === 2 ? [WEEK[place], WEEK[place + 3]] : [WEEK[place]]).filter((weekday) => weekday !== undefined);
  /** The days each of `ids` holds at first, given in order, apart from `gone`, which they join; first what `earlier` says each held. */
  const holds = (ids: readonly string[], gone: Set<Weekday>, earlier = new Map<string, readonly Weekday[]>()) => {
    const first = new Map(
      ids.map((interval) => {
        const mine = WEEK.filter(
          (weekday) => (earlier.get(interval) ?? []).includes(weekday) && !gone.has(weekday),
        ).slice(0, per);
        for (const weekday of mine) gone.add(weekday);
        return [interval, mine];
      }),
    );
    return new Map(
      ids.map((interval) => {
        const mine: Weekday[] = [...(first.get(interval) ?? [])];
        for (const weekday of [...table(active.indexOf(interval)), ...WEEK]) {
          if (mine.length === per) break;
          if (gone.has(weekday)) continue;
          gone.add(weekday);
          mine.push(weekday);
        }
        return [interval, WEEK.filter((weekday) => mine.includes(weekday))];
      }),
    );
  };
  /** The days `interval` holds in `rows`: a day proposed and set aside is free (FQ48). */
  const daysOf = (rows: ScheduleProposalRows, interval: string) =>
    WEEK.filter((weekday) => rows.days.some((day) => day.interval === interval && day.weekday === weekday && day.held));
  /** The pick that was open ended at its next version, `state`, naming `successor` or nothing. */
  const ended = (state: "applied" | "superseded", successor: string | null) => {
    if (was === undefined) return;
    const rows = after.proposals.get(was[0]);
    const want = { ...was[1], state, version: was[1].version + 1, replacedBy: successor };
    if (text(rows) !== text(want)) problems.push(`the pick that was open is ${text(rows)}, not ${text(want)}`);
  };
  /** `rows` is a new pick for exactly `fresh`, as the rule gives it. */
  const isNew = (id: string, rows: ScheduleProposalRows, earlier = new Map<string, readonly Weekday[]>()) => {
    if (before.proposals.has(id)) problems.push("the open pick isn't a new one");
    if (rows.version !== 1 || rows.weekRevision !== 1 || rows.scheduleVersion !== null || rows.replacedBy !== null)
      problems.push("a new pick isn't at version 1, in its one week, with no week of its own");
    if (rows.daysPerMember !== per)
      problems.push(`the pick gives ${String(rows.daysPerMember)} days each, not ${String(per)}`);
    if (rows.effectiveFrom !== at.today) problems.push(`the pick is from ${rows.effectiveFrom}, not ${at.today}`);
    if (rows.earlier.length > 0) problems.push("a new pick has rows of an earlier week");
    if (rows.members.some((member) => member.confirmed)) problems.push("a new pick starts with a confirmation");
    const included = rows.members.map((member) => member.interval).sort(byBytes);
    if (canonical(included) !== canonical([...fresh].sort(byBytes)))
      problems.push(`the pick includes ${included.join(", ")}, not the members with no day`);
    if (rows.days.some((day) => !(day.suggested && day.held)))
      problems.push("a pick's day isn't both proposed and held");
    const due = holds(fresh, new Set(taken), earlier);
    for (const interval of fresh) {
      const want = due.get(interval) ?? [];
      const got = daysOf(rows, interval);
      if (canonical(want) !== canonical(got))
        problems.push(`${interval} holds ${got.join(", ")} at first, not ${want.join(", ")} (FQ48, FQ127)`);
    }
  };

  if (active.length < 2) {
    if (now !== undefined) problems.push("a pick is open in a paused club");
    ended("superseded", null);
    return problems;
  }
  if (was === undefined) {
    if (fresh.length === 0) {
      if (now !== undefined) problems.push("a pick is open though every member has a day");
      return problems;
    }
    if (now === undefined) return [...problems, "no pick is open though a member has no day"];
    isNew(now[0], now[1]);
    return problems;
  }
  const listed = was[1].members.map((member) => member.interval);
  const included = was[1].members.filter((member) => active.includes(member.interval));
  const everyone = included.length > 0 && included.every((member) => member.confirmed);
  if (was[1].daysPerMember !== per) {
    if (fresh.length === 0) {
      if (now !== undefined) problems.push("a pick is open though every member has a day");
      ended(everyone ? "applied" : "superseded", null);
      return problems;
    }
    if (now === undefined || now[0] === was[0])
      return [...problems, "the pick wasn't replaced though its days each changed"];
    ended("superseded", now[0]);
    isNew(now[0], now[1], new Map(included.map((member) => [member.interval, daysOf(was[1], member.interval)])));
    return problems;
  }
  const joining = fresh.filter((interval) => !listed.includes(interval));
  if (joining.length > 0) {
    if (now?.[0] !== was[0]) return [...problems, "the open pick wasn't kept for the members who joined"];
    const gone = new Set(taken);
    for (const member of included)
      if (!member.confirmed) for (const weekday of daysOf(was[1], member.interval)) gone.add(weekday);
    const due = holds(joining, gone);
    const want: ScheduleProposalRows = {
      ...was[1],
      members: [...was[1].members, ...joining.map((interval) => ({ interval, confirmed: false }))],
      days: [
        ...was[1].days,
        ...joining.flatMap((interval) =>
          (due.get(interval) ?? []).map((weekday) => ({ interval, weekday, suggested: true, held: true })),
        ),
      ],
    };
    if (text(now[1]) !== text(want)) problems.push(`the open pick is ${text(now[1])}, not ${text(want)} (T33)`);
    return problems;
  }
  if (included.length === 0 || everyone) {
    if (now !== undefined) problems.push("a pick is open though the one that was has ended");
    ended(included.length === 0 ? "superseded" : "applied", null);
    return problems;
  }
  if (now?.[0] !== was[0] || text(now[1]) !== text(was[1])) problems.push("the open pick was replaced or moved");
  return problems;
}
