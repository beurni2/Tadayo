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
//   candidates at their labels and in their order with only its proposer's approval and no acceptance,
//   or, when its proposer left or nothing is left to carry, ended with every candidate it held (FQ121).
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
  if (carried.length === 0 || was.proposer === interval) {
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
  if (next.decisions.size !== 1 || next.decisions.get(was.proposer) !== "approved")
    problems.push("the new revision's approvals aren't its proposer's alone (FQ60)");
  for (const one of carried) {
    if (after.roster.candidates.get(one.id)?.state !== "open")
      problems.push(`the carried candidate ${one.id} was ended`);
  }
  return problems;
}
