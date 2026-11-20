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
// The leak scanner reads the same answer for the club's id (scanner.ts's BARE: a club the caller has an
// interval in); it can't judge an instant, a choice or a row, so this file does.

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
 * What is wrong with the club's schedule proposals after `interval` left `club`, given the schedule's
 * rows before and after. Empty when the first days are what FQ102 and FQ123 make of the leave: their
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
    return of(after).map(whole).join("\n") === of(before).map(whole).join("\n")
      ? []
      : ["a leave changed the club's proposals though no first days were open"];
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
  const fresh = of(after).filter(([one]) => !before.proposals.has(one));
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
  const fresh = of(after).filter(([one]) => !before.proposals.has(one));
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
