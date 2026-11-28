// The week a club's first days propose (spec 05; T6; FQ98).
//
// Spec 05's table gives two days each to a club of two or three and one each to four, five or six, and
// its examples hand the weekdays out from Monday in the order the members joined: one day each takes
// Monday onwards; two days each takes a first day the same way and a second three days later, so a
// pair gets Monday and Thursday, Tuesday and Friday. Sunday is never anyone's day. It is only a
// proposal: each member chooses and confirms (FQ48, FQ55), and nothing here moves anyone.

import { Fault, RangeFault } from "../fault.ts";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

function checkCount(memberCount: number): void {
  if (!Number.isInteger(memberCount) || memberCount < 2 || memberCount > 6) {
    throw new RangeFault(
      "propose_1",
      `schedule: a week is proposed for two to six members, not ${String(memberCount)} (A01)`,
    );
  }
}

/** Spec 05's table: the days each member has in a club of `memberCount`. */
export function daysPerMember(memberCount: number): 1 | 2 {
  checkCount(memberCount);
  return memberCount <= 3 ? 2 : 1;
}

/** Each member's proposed weekdays, the members in the order they joined, a member's days from Monday. */
export function proposedWeek(memberCount: number): readonly (readonly Weekday[])[] {
  const days = daysPerMember(memberCount);
  const week: Weekday[][] = [];
  for (let member = 0; member < memberCount; member += 1) {
    const own: Weekday[] = [];
    for (let nth = 0; nth < days; nth += 1) {
      const day = WEEKDAYS[member + nth * 3];
      if (day === undefined)
        throw new Fault("propose_2", "schedule: spec 05's table gave a member a day past Saturday");
      own.push(day);
    }
    week.push(own);
  }
  return week;
}
