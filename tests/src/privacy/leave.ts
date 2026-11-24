/// <reference lib="esnext.temporal" />
// The leave's row of the privacy matrix (B1's fourth slice: `leaveClub`, the contract's `LeftClub`; spec
// 22; T1, T7, T9, T14, T19, T26; FQ16, FQ60, FQ80, FQ120, FQ121, FQ122): what each role must get, and what
// a leave must change, judged from the world's rows apart from the statements the route runs.
//
// - Who leaves: an account that is active, with an active interval in a club that isn't suspended
//   (schedule.ts's `viewerIn`, the rule every club route is judged by). Everyone else the gate lets
//   through gets the neutral not-found, byte for byte: a stranger, a former member, an account being
//   deleted, a suspended club's member (FQ122).
// - What they get: the club's id, the server's instant in whole seconds, and their own choice, and no
//   other field.
// - What it changes (`leaveProblems`, from the rows before and after): the caller's interval ends at the
//   instant, with the choice and the name they had; nobody else's does; the club's roster version moves
//   by one; no candidate the leaver proposed is still open; and the club's open revision, which listed
//   them, has ended: superseded by one the server made for the members who stay, carrying its other open
//   candidates at their labels and in their order with only its proposer's approval and no acceptance
//   (no approval at all when it was the revision of a name nobody had approved, FQ84), or, when its
//   proposer is no member now or nothing is left to carry, ended with every candidate it held (FQ121).
//
// - What it does to the club's first days (`firstDaysProblems`, since `api/b2-first-days-roster`; FQ102,
//   FQ123), from the schedule's rows before and after: with nobody confirmed, the same proposal at its
//   next version, or ended with one member left; once a day is confirmed, applied when only confirmed
//   members stay among those it includes, ended when the one member left hasn't confirmed or nobody it
//   includes is left (with new first days only then, and only for two or more), and otherwise exactly as
//   it was, at the same version (T33). With no first days open, a leave changes no proposal.
//
// - What it does to the leaver's contributions (`contributionProblems`, since `api/b2-leave-withdraw`, the
//   outside audit's A3; spec 22, T18, T22, T23, T24, T26, FQ142), from the drops', removals', reservations',
//   counters' and highlights' rows before and after: with `withdraw`, each of the leaving interval's drops in the
//   club that was active or held is `withdrawn` at the instant, its pending replacement gone, with one removal,
//   reason `leave`, by the interval at the instant, its highlight cleared, and, before its day's reveal, its slot
//   off the counter; with `keep`, every drop as it was. Either way each live reservation of the interval in the
//   club has ended (`released` at the instant, or `expired` at its own `expires_at` when that had come) and left
//   the counts; and no other row changed: another interval's, or the same account's elsewhere.
//
// The leak scanner reads the same answer for the club's id (scanner.ts's BARE: a club the caller has an
// interval in); it can't judge an instant, a choice or a row, so this file does.

import type { WorldTx } from "../db/harness.ts";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinned } from "./harness.ts";
import { sameAnswer, type RosterWorld } from "./roster.ts";
import type { Answer } from "./scanner.ts";
import { viewerIn, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const LEAVE_JUDGED: ReadonlySet<string> = new Set(["leaveClub"]);

export type Choice = "keep" | "withdraw";

/** leaveClub's ordinary request (specsFor: a key and no body): the contract refuses it. */
export const LEAVE_NO_BODY: Answer = pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}');

/** What the world's rows give `account` asking to leave `club`: the interval that ends, or the neutral not-found. */
export function leaveOutcome(schedule: ScheduleWorld, club: string, account: string | null): string | Answer {
  return viewerIn(schedule, club, account) ?? NEUTRAL;
}

/** The answer of a leave at `now`: the club, the instant in whole seconds, the choice. */
export function leftExpected(club: string, now: Temporal.Instant, choice: Choice): (answer: Answer) => string[] {
  return sameAnswer("the leave", 200, {
    club_id: club,
    left_at: now.toString({ smallestUnit: "second", roundingMode: "floor" }),
    contributions: choice,
  });
}

/** A membership's own row, as the test reads it with its own statement. */
export interface MembershipRow {
  state: string;
  leftAt: Temporal.Instant | null;
  contributions: string | null;
  endedName: string | null;
}

/** The world's rows around a leave. */
export interface LeaveRows {
  schedule: ScheduleWorld;
  roster: RosterWorld;
  clubs: ClubRows;
}

const activeOf = (schedule: ScheduleWorld, club: string): string[] =>
  [...schedule.members]
    .filter(([, member]) => member.club === club && member.active)
    .map(([interval]) => interval)
    .sort();

/**
 * What is wrong with the rows after `interval` left `club` at `now` with `choice`, given the rows before
 * and the membership's own row afterwards. Empty when the leave changed what it must and nothing else.
 */
export function leaveProblems(
  before: LeaveRows,
  after: LeaveRows,
  club: string,
  interval: string,
  row: MembershipRow | undefined,
  now: Temporal.Instant,
  choice: Choice,
): string[] {
  const problems: string[] = [];
  const name = before.schedule.members.get(interval)?.name ?? null;
  if (row === undefined) return ["the membership's row is gone"];
  if (row.state !== "left") problems.push(`the interval's state is ${row.state}, not left`);
  if (row.leftAt === null || !row.leftAt.equals(now)) problems.push("left_at isn't the server's instant (T1)");
  if (row.contributions !== choice)
    problems.push(`the choice kept is ${String(row.contributions)}, not ${choice} (T26)`);
  if (row.endedName !== name) problems.push("the name kept isn't the one the person had (FQ75)");

  const stayed = activeOf(before.schedule, club).filter((one) => one !== interval);
  if (activeOf(after.schedule, club).join() !== stayed.join()) problems.push("another member's interval changed");
  const versions = [before.clubs.get(club)?.rosterVersion, after.clubs.get(club)?.rosterVersion];
  if (versions[0] === undefined || versions[1] !== versions[0] + 1)
    problems.push("the club's roster version didn't move by one");

  for (const [id, candidate] of after.roster.candidates) {
    if (candidate.club === club && candidate.proposer === interval && candidate.state === "open")
      problems.push(`the leaver's candidate ${id} is still open (FQ121)`);
  }

  const openBefore = before.clubs.get(club)?.openRevision ?? null;
  const openAfter = after.clubs.get(club)?.openRevision ?? null;
  if (openBefore === null) {
    if (openAfter !== null) problems.push("a leave made a revision in a club that had none open");
    return problems;
  }
  const was = before.roster.revisions.get(openBefore);
  const ended = after.roster.revisions.get(openBefore);
  if (was === undefined || ended === undefined) return [...problems, "the open revision's rows are gone"];
  const carried = was.candidates.filter(
    (one) => one.proposer !== interval && before.roster.candidates.get(one.id)?.state === "open",
  );
  if (ended.version !== was.version + 1) problems.push("the ended revision's version didn't move by one");
  // Carried only by a proposer who stays: one who isn't a member any more stands behind nothing.
  if (carried.length === 0 || !stayed.includes(was.proposer)) {
    if (ended.state !== "did_not_go_ahead") problems.push(`the revision is ${ended.state}, not did_not_go_ahead`);
    if (openAfter !== null) problems.push("a revision is open though nothing could be carried (FQ121)");
    for (const one of was.candidates) {
      if (after.roster.candidates.get(one.id)?.state === "open")
        problems.push(`the candidate ${one.id} is open on no revision`);
    }
    return problems;
  }
  if (ended.state !== "superseded") problems.push(`the revision is ${ended.state}, not superseded`);
  if (openAfter === null || openAfter === openBefore) return [...problems, "no new revision carries the candidates"];
  if (ended.supersededBy !== openAfter) problems.push("the ended revision doesn't name the new one");
  const next = after.roster.revisions.get(openAfter);
  if (next === undefined) return [...problems, "the new revision's rows are missing"];
  if (next.state !== "open" || !next.sealed) problems.push("the new revision isn't open and sealed");
  if (next.proposer !== was.proposer) problems.push("the new revision has another proposer");
  if ([...next.members].sort().join() !== stayed.join())
    problems.push("the new revision's members aren't exactly the members who stay (T7)");
  if (
    next.candidates.map((one) => `${one.id} ${one.label}`).join("\n") !==
    carried.map((one) => `${one.id} ${one.label}`).join("\n")
  )
    problems.push("the new revision's candidates aren't the ones carried, at their labels and in their order");
  if (next.candidates.some((one) => one.acceptedWith !== null))
    problems.push("the new revision carries an acceptance of another roster (T7)");
  if (next.origin !== was.origin) problems.push(`the new revision is a ${next.origin}, not a ${was.origin}`);
  if (was.origin === "proposal") {
    if (next.decisions.size !== 1 || next.decisions.get(was.proposer) !== "approved")
      problems.push("the new revision's approvals aren't its proposer's alone (FQ60)");
  } else if (next.decisions.size !== 0) {
    problems.push("the new revision of a name nobody approved starts with an approval (FQ84)");
  }
  for (const one of carried) {
    if (after.roster.candidates.get(one.id)?.state !== "open")
      problems.push(`the carried candidate ${one.id} was ended`);
  }
  return problems;
}

type ProposalRows = ScheduleWorld["proposals"] extends Map<string, infer Rows> ? Rows : never;

/** Spec 05's table: two days each up to three members, one each from four. */
const perFor = (count: number): number => (count <= 3 ? 2 : 1);
const lines = (rows: readonly object[]): string =>
  rows
    .map((row) => JSON.stringify(row))
    .sort()
    .join("\n");

/** A proposal's rows as one text, whatever order its members and days were read in. */
const whole = ([id, rows]: [string, ProposalRows]): string =>
  JSON.stringify([id, { ...rows, members: lines(rows.members), days: lines(rows.days), earlier: lines(rows.earlier) }]);

/**
 * What is wrong with the members and the days of first days that stayed one proposal across a change of
 * the club's members: `now` against `was`, for the club's `active` members after it. `revised` says the
 * week was to be revised (nobody had confirmed; FQ55, FQ102), and `added` names who it gains.
 *
 * - Not revised: its members, their confirmations, its week and every row are as they were (FQ100, T33).
 * - Revised, the days each member has unchanged: nobody is moved (T6). Every row there was is as it was,
 *   and each new member holds that many days, proposed, which no active member held.
 * - Revised, the days each member has changed (between three and four members): a new week. The week
 *   before is kept whole among the earlier ones, and in the new one each active member, and nobody
 *   else, holds their proposed days, no day twice.
 * - Always: a confirmation is nobody's but the member's own, so none moves; an earlier week's row never
 *   changes.
 */
function weekProblems(
  was: ProposalRows,
  now: ProposalRows,
  active: readonly string[],
  added: readonly string[],
  revised: boolean,
): string[] {
  const problems: string[] = [];
  const gains = revised ? added : [];
  const members = [...was.members.map((member) => member.interval), ...gains].sort();
  if (
    now.members
      .map((member) => member.interval)
      .sort()
      .join() !== members.join()
  ) {
    problems.push("the first days' members aren't those they had, with exactly the members a revision adds (FQ100)");
  }
  for (const member of now.members) {
    const before = was.members.find((one) => one.interval === member.interval)?.confirmed ?? false;
    if (member.confirmed !== before) problems.push(`the confirmation of ${member.interval} moved`);
  }
  const per = revised ? perFor(active.length) : was.daysPerMember;
  const newWeek = per !== was.daysPerMember;
  if (now.daysPerMember !== per) problems.push(`each member has ${String(now.daysPerMember)} days, not ${String(per)}`);
  if (now.weekRevision !== was.weekRevision + (newWeek ? 1 : 0)) {
    problems.push(
      `the first days are on week ${String(now.weekRevision)}, not week ${String(was.weekRevision + (newWeek ? 1 : 0))}`,
    );
  }
  if (!newWeek) {
    if (lines(now.earlier) !== lines(was.earlier)) problems.push("an earlier week's rows changed");
    const kept = now.days.filter((day) => !gains.includes(day.interval));
    if (lines(kept) !== lines(was.days)) problems.push("a member's days changed though nobody is moved (T6)");
    const held = new Set(was.days.filter((day) => day.held && active.includes(day.interval)).map((day) => day.weekday));
    for (const interval of gains) {
      const mine = now.days.filter((day) => day.interval === interval);
      if (mine.length !== per || mine.some((day) => !day.suggested || !day.held)) {
        problems.push(`the new member ${interval} doesn't hold ${String(per)} proposed days`);
      }
      for (const day of mine) {
        if (held.has(day.weekday)) problems.push(`the new member ${interval} was given ${day.weekday}, which is held`);
        held.add(day.weekday);
      }
    }
    return problems;
  }
  const kept = [...was.earlier, ...was.days.map((day) => ({ ...day, weekRevision: was.weekRevision }))];
  if (lines(now.earlier) !== lines(kept)) problems.push("the week before isn't kept as it was");
  if (now.days.some((day) => !active.includes(day.interval))) {
    problems.push("the new week gives a day to someone who isn't an active member");
  }
  for (const interval of active) {
    const mine = now.days.filter((day) => day.interval === interval);
    if (mine.length !== per || mine.some((day) => !day.suggested || !day.held)) {
      problems.push(`${interval} doesn't hold ${String(per)} proposed days in the new week`);
    }
  }
  if (new Set(now.days.map((day) => day.weekday)).size !== now.days.length) {
    problems.push("the new week proposes a day twice");
  }
  return problems;
}

/**
 * What is wrong with the club's first-days proposals after `interval` left `club`, given the schedule's
 * rows before and after. A new member's pick (a `membership_change` proposal) the leave ends or replaces is judged
 * by ./schedule.ts `weekChangeProblems`, which the matrix asks beside this at every leave. Empty when the first days are what FQ102 and FQ123 make of the leave: their
 * state and version, and their members, confirmations and days row by row (`weekProblems`).
 */
export function firstDaysProblems(
  before: ScheduleWorld,
  after: ScheduleWorld,
  club: string,
  interval: string,
): string[] {
  const of = (world: ScheduleWorld) =>
    [...world.proposals].filter(([, proposal]) => proposal.club === club).sort(([a], [b]) => (a < b ? -1 : 1));
  const open = of(before).find(([, proposal]) => proposal.state === "open" && proposal.reason === "activation");
  if (open === undefined) {
    // A new member's pick is another judge's (./schedule.ts `weekChangeProblems`): a leave replaces or ends
    // one in a club whose first days have applied.
    const first = (world: ScheduleWorld) =>
      of(world)
        .filter(([, proposal]) => proposal.reason === "activation")
        .map(whole)
        .join("\n");
    return first(after) === first(before) ? [] : ["a leave changed the club's first days though none were open"];
  }
  const [id, was] = open;
  const now = after.proposals.get(id);
  if (now === undefined) return ["the first days' rows are gone"];
  const problems: string[] = [];
  const stayed = activeOf(before, club).filter((one) => one !== interval);
  const included = was.members.filter((member) => stayed.includes(member.interval));
  const confirmedDay = was.members.some((member) => member.confirmed);
  const nobodyLeft = confirmedDay && included.length === 0;
  let state: string;
  let moved = true;
  if (!confirmedDay) state = stayed.length < 2 ? "superseded" : "open";
  else if (nobodyLeft) state = "superseded";
  else if (included.every((member) => member.confirmed)) state = "applied";
  else if (stayed.length < 2) state = "superseded";
  else {
    state = "open";
    moved = false;
  }
  const version = was.version + (moved ? 1 : 0);
  if (now.state !== state || now.version !== version) {
    problems.push(
      `the first days are ${now.state} at version ${String(now.version)}, not ${state} at version ${String(version)} (FQ102)`,
    );
  }
  if (now.replacedBy !== null) problems.push("the first days name a successor");
  const revised = state === "open" && moved;
  problems.push(...weekProblems(was, now, stayed, [], revised));
  // New first days only: a new member's pick the same command opens is `weekChangeProblems`' (./schedule.ts).
  const fresh = of(after).filter(([one, each]) => !before.proposals.has(one) && each.reason === "activation");
  const again = nobodyLeft && stayed.length >= 2;
  if (!again && fresh.length > 0) {
    problems.push(
      stayed.length < 2
        ? "new first days opened for fewer than two members"
        : "new first days opened though the earlier ones still had someone to confirm them",
    );
  }
  if (again) {
    const [next] = fresh;
    const members = (next?.[1].members ?? []).map((member) => member.interval).sort();
    if (
      fresh.length !== 1 ||
      next?.[1].state !== "open" ||
      next[1].reason !== "activation" ||
      members.join() !== stayed.join() ||
      next[1].members.some((member) => member.confirmed)
    ) {
      problems.push("no new first days are open for exactly the members who remain (FQ123)");
    }
  }
  return problems;
}

/**
 * What is wrong with the club's schedule proposals after `joined` became members of `club`, a club that
 * had started, given the schedule's rows before and after. Empty when the first days are what FQ55, FQ100
 * and FQ102 make of the join: revised to include them while nobody has confirmed, untouched once a day
 * is confirmed, and opened anew when the club's earlier ones all ended with no successor.
 */
export function firstDaysJoinProblems(
  before: ScheduleWorld,
  after: ScheduleWorld,
  club: string,
  joined: readonly string[],
): string[] {
  const of = (world: ScheduleWorld) =>
    [...world.proposals].filter(([, proposal]) => proposal.club === club).sort(([a], [b]) => (a < b ? -1 : 1));
  const active = activeOf(after, club);
  // New first days only: a new member's pick the same command opens is `weekChangeProblems`' (./schedule.ts).
  const fresh = of(after).filter(([one, each]) => !before.proposals.has(one) && each.reason === "activation");
  const open = of(before).find(([, proposal]) => proposal.state === "open" && proposal.reason === "activation");
  if (open === undefined) {
    const problems: string[] = [];
    const old = of(after).filter(([one]) => before.proposals.has(one));
    if (old.map(whole).join("\n") !== of(before).map(whole).join("\n")) {
      problems.push("a join changed a proposal that wasn't open first days");
    }
    const ended =
      of(before).length > 0 &&
      of(before).every(
        ([, proposal]) =>
          proposal.reason === "activation" && proposal.state === "superseded" && proposal.replacedBy === null,
      );
    if (!ended || active.length < 2) {
      return fresh.length === 0 ? problems : [...problems, "a join opened first days the club has no call for"];
    }
    const [next] = fresh;
    const members = (next?.[1].members ?? []).map((member) => member.interval).sort();
    if (
      fresh.length !== 1 ||
      next?.[1].state !== "open" ||
      next[1].reason !== "activation" ||
      members.join() !== active.join() ||
      next[1].members.some((member) => member.confirmed)
    ) {
      problems.push("the join that restarts the club opened no new first days for exactly its members (FQ102)");
    }
    return problems;
  }
  const [id, was] = open;
  const now = after.proposals.get(id);
  if (now === undefined) return ["the first days' rows are gone"];
  const problems: string[] = [];
  const revised = !was.members.some((member) => member.confirmed);
  const version = was.version + (revised ? 1 : 0);
  if (now.state !== "open" || now.version !== version) {
    problems.push(
      `the first days are ${now.state} at version ${String(now.version)}, not open at version ${String(version)} (FQ100, FQ102)`,
    );
  }
  if (now.replacedBy !== null) problems.push("the first days name a successor");
  problems.push(...weekProblems(was, now, active, joined, revised));
  if (fresh.length > 0) problems.push("a join opened new first days beside the open ones");
  return problems;
}

/** A drop's row, as the leave's contributions judge reads it. */
export interface ContributionDrop {
  club: string;
  day: string;
  author: string;
  mediaClass: string;
  state: string;
  revealAt: Temporal.Instant;
  endedAt: Temporal.Instant | null;
  updatedAt: Temporal.Instant;
  version: number;
  pending: string | null;
  removal: { reason: string; actor: string | null; at: Temporal.Instant } | null;
}

/** A reservation's row. */
export interface ContributionSlot {
  day: string;
  interval: string;
  mediaClass: string;
  state: string;
  expiresAt: Temporal.Instant;
  endedAt: Temporal.Instant | null;
  drop: string | null;
}

/** A counter's counts. */
export interface ContributionCounter {
  committedTotal: number;
  committedExternal: number;
  reservedTotal: number;
  reservedExternal: number;
}

/** A highlight's row. */
export interface ContributionHighlight {
  drop: string | null;
  version: number;
  updatedAt: Temporal.Instant;
}

/** The rows of the clubs' contributions: drops by id, reservations by id, counters and highlights by "day interval". */
export interface ContributionRows {
  drops: Map<string, ContributionDrop>;
  slots: Map<string, ContributionSlot>;
  counters: Map<string, ContributionCounter>;
  highlights: Map<string, ContributionHighlight>;
}

/** The contributions' rows of `clubs`, read with the test's own statements. */
export async function contributionRowsOf(db: WorldTx, clubs: readonly string[]): Promise<ContributionRows> {
  const drops = await db<
    {
      id: string;
      club_id: string;
      occurrence_id: string;
      author_interval_id: string;
      media_class: string;
      state: string;
      reveal_at: Temporal.Instant;
      ended_at: Temporal.Instant | null;
      updated_at: Temporal.Instant;
      version: number;
      pending_upload_id: string | null;
      reason: string | null;
      actor_interval_id: string | null;
      removed_at: Temporal.Instant | null;
    }[]
  >`
    SELECT d.id, d.club_id, d.occurrence_id, d.author_interval_id, d.media_class, d.state, o.reveal_at, d.ended_at,
           d.updated_at, d.version, d.pending_upload_id, r.reason, r.actor_interval_id, r.removed_at
      FROM app.drops d JOIN app.occurrences o ON o.id = d.occurrence_id
      LEFT JOIN app.drop_removals r ON r.drop_id = d.id
     WHERE d.club_id IN ${db(clubs)}`;
  const slots = await db<
    {
      id: string;
      occurrence_id: string;
      interval_id: string;
      media_class: string;
      state: string;
      expires_at: Temporal.Instant;
      ended_at: Temporal.Instant | null;
      drop_id: string | null;
    }[]
  >`
    SELECT r.id, r.occurrence_id, r.interval_id, r.media_class, r.state, r.expires_at, r.ended_at, r.drop_id
      FROM app.reservations r JOIN app.occurrences o ON o.id = r.occurrence_id
     WHERE o.club_id IN ${db(clubs)}`;
  const counters = await db<
    {
      occurrence_id: string;
      interval_id: string;
      committed_total: number;
      committed_external: number;
      reserved_total: number;
      reserved_external: number;
    }[]
  >`
    SELECT occurrence_id, interval_id, committed_total, committed_external, reserved_total, reserved_external
      FROM app.contribution_counters WHERE club_id IN ${db(clubs)}`;
  const highlights = await db<
    {
      occurrence_id: string;
      interval_id: string;
      drop_id: string | null;
      version: number;
      updated_at: Temporal.Instant;
    }[]
  >`
    SELECT h.occurrence_id, h.interval_id, h.drop_id, h.version, h.updated_at
      FROM app.highlights h JOIN app.occurrences o ON o.id = h.occurrence_id
     WHERE o.club_id IN ${db(clubs)}`;
  return {
    drops: new Map(
      drops.map((row) => [
        row.id,
        {
          club: row.club_id,
          day: row.occurrence_id,
          author: row.author_interval_id,
          mediaClass: row.media_class,
          state: row.state,
          revealAt: row.reveal_at,
          endedAt: row.ended_at,
          updatedAt: row.updated_at,
          version: row.version,
          pending: row.pending_upload_id,
          removal:
            row.reason === null || row.removed_at === null
              ? null
              : { reason: row.reason, actor: row.actor_interval_id, at: row.removed_at },
        },
      ]),
    ),
    slots: new Map(
      slots.map((row) => [
        row.id,
        {
          day: row.occurrence_id,
          interval: row.interval_id,
          mediaClass: row.media_class,
          state: row.state,
          expiresAt: row.expires_at,
          endedAt: row.ended_at,
          drop: row.drop_id,
        },
      ]),
    ),
    counters: new Map(
      counters.map((row) => [
        `${row.occurrence_id} ${row.interval_id}`,
        {
          committedTotal: row.committed_total,
          committedExternal: row.committed_external,
          reservedTotal: row.reserved_total,
          reservedExternal: row.reserved_external,
        },
      ]),
    ),
    highlights: new Map(
      highlights.map((row) => [
        `${row.occurrence_id} ${row.interval_id}`,
        { drop: row.drop_id, version: row.version, updatedAt: row.updated_at },
      ]),
    ),
  };
}

/** A row as one text, its instants as ISO strings, to compare a row with what it must be. */
const said = (row: unknown): string =>
  JSON.stringify(row, (_key, value: unknown) => (value instanceof Temporal.Instant ? value.toString() : value));

/** How many drops a withdrawing leave withdrew and how many reservations it ended: the judge's own counts. */
export interface Settled {
  withdrawn: number;
  slotsEnded: number;
}

/**
 * What is wrong with the contributions' rows after `interval` left `club` at `now` with `choice`, given the rows
 * before. Empty when the leave changed what it must and nothing else. `settled`, when given, counts what it ended.
 */
export function contributionProblems(
  before: ContributionRows,
  after: ContributionRows,
  club: string,
  interval: string,
  now: Temporal.Instant,
  choice: Choice,
  settled?: Settled,
): string[] {
  const problems: string[] = [];
  const freed = new Map<string, { total: number; external: number; reserved: number; reservedExternal: number }>();
  const freeing = (key: string) => {
    const one = freed.get(key) ?? { total: 0, external: 0, reserved: 0, reservedExternal: 0 };
    freed.set(key, one);
    return one;
  };
  const withdrawnHere = new Set<string>();
  for (const [id, was] of before.drops) {
    const then = after.drops.get(id);
    if (then === undefined) {
      problems.push(`the drop ${id} is gone`);
      continue;
    }
    const leavers = was.club === club && was.author === interval && (was.state === "active" || was.state === "held");
    if (!leavers || choice === "keep") {
      if (said(then) !== said(was))
        problems.push(
          leavers
            ? `the leaver's drop ${id} changed though they kept their drops (T26)`
            : `the drop ${id}, not the leaver's to withdraw, changed`,
        );
      continue;
    }
    withdrawnHere.add(id);
    if (settled !== undefined) settled.withdrawn += 1;
    const expected: ContributionDrop = {
      ...was,
      state: "withdrawn",
      endedAt: now,
      updatedAt: now,
      pending: null,
      removal: { reason: "leave", actor: interval, at: now },
    };
    if (said(then) !== said(expected)) {
      if (then.state !== "withdrawn")
        problems.push(`the leaver's drop ${id} is ${then.state}, not withdrawn (T26, A3)`);
      else problems.push(`the leaver's withdrawn drop ${id} isn't as a leave at the instant leaves it (T23, T24)`);
    }
    if (Temporal.Instant.compare(was.revealAt, now) > 0) {
      const one = freeing(`${was.day} ${was.author}`);
      one.total += 1;
      if (was.mediaClass === "external_video") one.external += 1;
    }
  }
  for (const id of after.drops.keys()) {
    if (!before.drops.has(id)) problems.push(`a drop ${id} appeared with the leave`);
  }

  for (const [id, was] of before.slots) {
    const then = after.slots.get(id);
    if (then === undefined) {
      problems.push(`the reservation ${id} is gone`);
      continue;
    }
    // A membership interval is one club's, so the leaver's reservations are all in the club left.
    const leavers = was.interval === interval && was.state === "live";
    if (!leavers) {
      if (said(then) !== said(was)) problems.push(`the reservation ${id}, not the leaver's live one, changed`);
      continue;
    }
    if (settled !== undefined) settled.slotsEnded += 1;
    const lapsed = Temporal.Instant.compare(was.expiresAt, now) <= 0;
    const expected: ContributionSlot = lapsed
      ? { ...was, state: "expired", endedAt: was.expiresAt }
      : { ...was, state: "released", endedAt: now };
    if (said(then) !== said(expected))
      problems.push(
        lapsed
          ? `the leaver's lapsed reservation ${id} isn't expired at its own expires_at (T18)`
          : `the leaver's live reservation ${id} isn't released at the instant (T18: no phantom slots)`,
      );
    const one = freeing(`${was.day} ${was.interval}`);
    one.reserved += 1;
    if (was.mediaClass === "external_video") one.reservedExternal += 1;
  }
  for (const id of after.slots.keys()) {
    if (!before.slots.has(id)) problems.push(`a reservation ${id} appeared with the leave`);
  }

  for (const [key, was] of before.counters) {
    const then = after.counters.get(key);
    if (then === undefined) {
      problems.push(`the counter ${key} is gone`);
      continue;
    }
    const one = freed.get(key) ?? { total: 0, external: 0, reserved: 0, reservedExternal: 0 };
    const expected: ContributionCounter = {
      committedTotal: was.committedTotal - one.total,
      committedExternal: was.committedExternal - one.external,
      reservedTotal: was.reservedTotal - one.reserved,
      reservedExternal: was.reservedExternal - one.reservedExternal,
    };
    if (said(then) !== said(expected))
      problems.push(
        key.endsWith(` ${interval}`)
          ? `the leaver's counter ${key} isn't its drops' and live slots' after the leave (T18)`
          : `the counter ${key}, not the leaver's, changed`,
      );
  }
  for (const [key, was] of before.highlights) {
    const then = after.highlights.get(key);
    if (then === undefined) {
      problems.push(`the highlight ${key} is gone`);
      continue;
    }
    const cleared = was.drop !== null && withdrawnHere.has(was.drop);
    const expected: ContributionHighlight = cleared ? { drop: null, version: was.version + 1, updatedAt: now } : was;
    if (said(then) !== said(expected))
      problems.push(
        cleared
          ? `the leaver's highlight ${key} on a withdrawn drop isn't cleared at the instant (T22)`
          : `the highlight ${key} changed though its drop wasn't withdrawn`,
      );
  }
  return problems;
}
