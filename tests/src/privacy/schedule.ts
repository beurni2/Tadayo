/// <reference lib="esnext.temporal" />
// The schedule routes' rows of the privacy matrix (B2's schedule slice: getSchedule, chooseScheduleDays and
// confirmScheduleDays; spec 05; T6, T9, T14, T19, T33, T49, T55; FQ46, FQ48, FQ55, FQ57, FQ75, FQ79, FQ99,
// FQ100; the contract's `Schedule`, section 1.8 of docs/plans/api-b2-contract.md), as the matrix judges them.
// Everything here is read from the world's rows, apart from the statement and the rules the routes run
// (packages/domain/src/schedule/): this file states the contract's rules a second time, on its own, so a
// change to the domain's view alone fails here and has to be made here too.
//
// What a cell must get:
// - getSchedule: the neutral not-found unless the viewer's account has an active interval in a club that
//   isn't suspended (the gate has already answered an account being deleted and an unfinished profile).
//   Otherwise the whole `Schedule`, byte for value: the server's instant, the club with the viewer's own
//   interval, `current` (the latest version in force on the club's local date, when it has a day whose star
//   has a name to show) and `proposal` (the club's open one, only when it includes the viewer's interval:
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
// The matrix's world (`addFirstDays`). The matrix's club already has its week in force (db/world.ts: Ana's
// Saturday, Ben's Friday, Cleo's Thursday), which is what `current` shows and what its roles are built on.
// To put every kind of slot, with real names, in front of every role, the world also gets first days no
// command would open beside a week in force: a second schedule version from Sunday 8 November, the day
// after the matrix's one day, and an open `activation` proposal for Ana, Ben and Cleo, two days each (spec
// 05's table for three). Ana has confirmed Monday and Thursday; Ben holds Tuesday and has taken Wednesday
// in place of his proposed Friday; Cleo holds Wednesday and Saturday. So Wednesday is contested, Tuesday and
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

/** Adds the matrix's first days to `w` (this file's header), before any role changes the club. Returns the proposal. */
export async function addFirstDays(tx: WorldTx, w: World): Promise<string> {
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
  await tx`
    UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.generated}
     WHERE proposal_id = ${proposal} AND interval_id = ${w.ana.interval}`;
  for (const [weekday, firstDate] of ANA_DAYS) {
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
  members: { interval: string; confirmed: boolean }[];
  days: { interval: string; weekday: Weekday; suggested: boolean; held: boolean }[];
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
      schedule_version: string | null;
      replaced_by: string | null;
    }[]
  >`
    SELECT id, club_id AS club, state, version, reason, effective_from::text AS effective_from, days_per_member,
           schedule_version_id AS schedule_version, replaced_by
      FROM app.schedule_proposals WHERE club_id IN ${db(clubs)}`;
  const proposalMembers = await db<{ proposal: string; interval: string; confirmed: boolean }[]>`
    SELECT proposal_id AS proposal, interval_id AS interval, confirmed_at IS NOT NULL AS confirmed
      FROM app.schedule_proposal_members WHERE club_id IN ${db(clubs)}`;
  const proposalDays = await db<
    { proposal: string; interval: string; weekday: Weekday; suggested: boolean; held: boolean }[]
  >`
    SELECT d.proposal_id AS proposal, d.interval_id AS interval, d.weekday::text AS weekday, d.suggested, d.held
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
          scheduleVersion: row.schedule_version,
          replacedBy: row.replaced_by,
          members: proposalMembers
            .filter((each) => each.proposal === row.id)
            .map((each) => ({ interval: each.interval, confirmed: each.confirmed })),
          days: proposalDays
            .filter((each) => each.proposal === row.id)
            .map((each) => ({
              interval: each.interval,
              weekday: each.weekday,
              suggested: each.suggested,
              held: each.held,
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

/** The proposal `id` as the member `viewer` (an interval it includes) must get it: the contract's ScheduleProposal. */
export function proposalFor(world: ScheduleWorld, id: string, viewer: string): Record<string, unknown> {
  const proposal = world.proposals.get(id);
  if (proposal === undefined) throw new Error("the judge was asked about a proposal the world doesn't hold");
  const joined = (interval: string) =>
    world.members.get(interval)?.joinedAt ?? Temporal.Instant.fromEpochMilliseconds(0);
  // The order the members joined; two who joined at the same instant, by their interval's id.
  const members = [...proposal.members].sort(
    (a, b) => Temporal.Instant.compare(joined(a.interval), joined(b.interval)) || byBytes(a.interval, b.interval),
  );
  const me = members.find((member) => member.interval === viewer);
  if (me === undefined) throw new Error("the judge was asked about a viewer the proposal doesn't include");
  const row = (interval: string, weekday: Weekday) =>
    proposal.days.find((day) => day.interval === interval && day.weekday === weekday);
  const active = (interval: string) => world.members.get(interval)?.active === true;
  const dates = world.versions.find((version) => version.id === proposal.scheduleVersion)?.assignments ?? [];
  const slots = WEEK.map((weekday) => {
    const suggested = row(viewer, weekday)?.suggested === true;
    const confirmer = members.find((member) => member.confirmed && row(member.interval, weekday)?.held === true);
    if (confirmer !== undefined) {
      const date = active(confirmer.interval) ? dates.find((each) => each.weekday === weekday)?.firstDate : undefined;
      const owner = confirmer.interval === viewer ? undefined : personOf(world, confirmer.interval);
      return {
        weekday,
        state: confirmer.interval === viewer ? "yours" : "taken",
        ...(owner === undefined ? {} : { owner }),
        ...(date === undefined ? {} : { first_date: date }),
        suggested,
      };
    }
    const holders = members.filter(
      (member) => active(member.interval) && !member.confirmed && row(member.interval, weekday)?.held === true,
    );
    if (holders.some((member) => member.interval === viewer)) {
      return holders.length === 1
        ? { weekday, state: "yours", suggested }
        : { weekday, state: "clash", holders: holders.map((member) => personOf(world, member.interval)), suggested };
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
    my_days: WEEK.filter((weekday) => row(viewer, weekday)?.held === true),
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
    const person = found === undefined ? undefined : personOf(world, found.star);
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
  const me = proposal.members.find((member) => member.interval === viewer);
  if (viewer === undefined || me === undefined) return NEUTRAL;
  if (proposal.replacedBy !== null) {
    return pinned(409, "Conflict", `{"code":"MEMBERSHIP_CHANGED","current_id":"${proposal.replacedBy}"}`);
  }
  if (proposal.version !== body.expected_version) {
    return pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":${String(proposal.version)}}`);
  }
  if (proposal.state !== "open" || me.confirmed) return NOT_ALLOWED;
  const holds = (interval: string, weekday: Weekday) =>
    proposal.days.some((day) => day.interval === interval && day.weekday === weekday && day.held);
  // A day is confirmed once a member who has confirmed holds it.
  const confirmed = (weekday: Weekday) =>
    proposal.members.some((member) => member.confirmed && holds(member.interval, weekday));
  if (body.weekdays.some(confirmed)) return NOT_ALLOWED;
  if (command === "chooseScheduleDays") return body.weekdays.length > proposal.daysPerMember ? NOT_ALLOWED : "ok";
  const mine = WEEK.filter((weekday) => holds(viewer, weekday));
  const named = WEEK.filter((weekday) => body.weekdays.includes(weekday));
  if (mine.length !== proposal.daysPerMember || canonical(mine) !== canonical(named)) return NOT_ALLOWED;
  const contested = named.some((weekday) =>
    proposal.members.some(
      (member) =>
        member.interval !== viewer &&
        !member.confirmed &&
        world.members.get(member.interval)?.active === true &&
        holds(member.interval, weekday),
    ),
  );
  return contested ? NOT_ALLOWED : "ok";
}

/**
 * What an accepted command must have left in the rows (T6, T33, T49): the choice's days held and nothing
 * else of the viewer's; or the viewer confirmed with a dated day each, and the proposal applied at its next
 * version exactly when every member it includes who is still active has then confirmed.
 */
export function changeProblems(
  before: ScheduleWorld,
  after: ScheduleWorld,
  command: ScheduleCommand,
  proposalId: string,
  account: string | null,
  weekdays: readonly Weekday[],
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
  const dated = after.versions.find((version) => version.id === now.scheduleVersion)?.assignments ?? [];
  for (const weekday of asked) {
    const day = dated.find((each) => each.weekday === weekday);
    if (day?.star !== viewer) problems.push(`${weekday} has no dated day of the viewer's (T49)`);
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
  /** Sent with no Idempotency-Key. */
  noKey?: boolean;
  /** Sent again under the key of the case before it: the same bytes (T19). */
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
