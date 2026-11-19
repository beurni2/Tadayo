/// <reference lib="esnext.temporal" />
// The club's week for one caller (the contract's `getSchedule` and `Schedule`; spec 05; T1, T9, T14, T55):
// the schedule in force today, if it has a day, and the open proposal, if it includes the caller. One
// statement reads it (./week.ts), so it is one snapshot, and the caller's `now` is the clock's sample,
// taken first.
//
// - `current` is the latest version in force on the club's local date at `now`, with the days confirmed
//   in it, from Monday. A version with no day yet, as the first days' is before anyone confirms, gives no
//   `current`. A day whose star has no name to show is left out, never sent nameless (FQ75, as Home's
//   days are: ../authorization/days.ts).
// - `proposal` is the club's open one as the caller sees it (`answerOf`), only when it includes the
//   caller's own membership: a member who joined after it gets `current` alone (FQ100).
//
// Anyone the authorization module gives nothing of the club gets null, the neutral not-found (T14).

import type { QuerySql } from "../authorization/read-sql.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";
import type { Weekday } from "./propose.ts";
import { answerOf, loadWeek, type ProposalAnswer, type SchedulePerson } from "./week.ts";

export interface CurrentWeek {
  /** The local date the schedule is in force from. */
  readonly effectiveFrom: string;
  /** From Monday; at least one. */
  readonly assignments: readonly { readonly weekday: Weekday; readonly person: SchedulePerson }[];
}

export interface ScheduleSight {
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
    /** The caller's own membership interval in it. */
    readonly membershipId: string;
  };
  readonly current: CurrentWeek | null;
  readonly proposal: ProposalAnswer | null;
}

/** The week of `clubId` as the account `userId` sees it at `now`, or null (T14). */
export async function readSchedule(
  tx: QuerySql,
  userId: string,
  clubId: string,
  now: ServerNow,
): Promise<ScheduleSight | null> {
  const week = await loadWeek(tx, userId, clubId, "open");
  if (week === null) return null;
  // Dates in ISO form compare as text.
  const today = now.toZonedDateTimeISO(clubTimeZone(week.club.timezone)).toPlainDate().toString();
  const inForce = week.versions.filter((version) => version.effectiveFrom <= today).at(-1);
  const assignments = (inForce?.assignments ?? []).flatMap((assignment) =>
    assignment.person === null ? [] : [{ weekday: assignment.weekday, person: assignment.person }],
  );
  const included = week.proposal?.facts.members.some((member) => member.id === week.membershipId) === true;
  return {
    club: { ...week.club, membershipId: week.membershipId },
    current:
      inForce === undefined || assignments.length === 0 ? null : { effectiveFrom: inForce.effectiveFrom, assignments },
    proposal: week.proposal !== null && included ? answerOf(week.proposal, week.membershipId) : null,
  };
}
