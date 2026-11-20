// What a change of a club's members does to its first days (spec 04, 05; T6, T33; A01; FQ16, FQ48, FQ55,
// FQ100, FQ102, FQ123; docs/plans/api-b2-first-days-roster.md, section 3). A pure rule: it reads no clock
// and no database. ./settle.ts reads the facts under the club's row and writes what this says, for every
// command that starts or ends a membership.
//
// - Nobody has confirmed: every active member is part of the first days (FQ55), so a join or a leave is a
//   revision of the proposed week. Where spec 05's table keeps the days each member has, nobody is moved:
//   a leaver's days are free, and a new member is proposed days nobody holds, the table's days for their
//   place when they are free, else the first free days from Monday. Where the table changes them (between
//   three and four members), the whole week is proposed again and every member holds their proposed days,
//   earlier choices set aside (FQ102). With one member left, the first days end with no successor.
// - A day is confirmed: nothing is revised, and a new member isn't included (FQ100). A leave applies the
//   first days when it leaves only confirmed members among those they include; ends them when the club's
//   one member left hasn't confirmed, or when nobody they include is left (FQ123); else changes nothing,
//   and then no version moves (T33).
// - No first days are open: new ones open when the last ended with no successor and the club has two
//   members again (FQ102: "the join that restarts the club opens new first days").

import { daysPerMember, proposedWeek, WEEKDAYS, type Weekday } from "./propose.ts";

/** One member the open first days include. */
export interface FirstDaysMember {
  /** The membership interval's id. */
  readonly id: string;
  /** Whether that membership is still active. */
  readonly active: boolean;
  readonly confirmed: boolean;
  /** The days they hold in the proposal's current week. A member who left holds nothing, whatever this says. */
  readonly held: readonly Weekday[];
}

export interface RosterChangeFacts {
  /** The club's active members, by membership interval, in the order they joined (FQ98, FQ114). */
  readonly active: readonly string[];
  /** The club's open first days, or null. */
  readonly open: null | { readonly daysPerMember: 1 | 2; readonly members: readonly FirstDaysMember[] };
  /** With none open: the club's last proposal is first days that ended superseded, with nothing after them. */
  readonly endedWithoutSuccessor: boolean;
}

/** A member and the days proposed for them, which they hold until they choose. */
export interface ProposedDays {
  readonly id: string;
  /** From Monday. */
  readonly days: readonly Weekday[];
}

export type FirstDaysChange =
  | { readonly kind: "nothing" }
  /** Every member the first days include who is still active has confirmed: they apply. */
  | { readonly kind: "apply" }
  /** Superseded with no successor; `reopen` when new first days open at once for the members who remain. */
  | { readonly kind: "end"; readonly reopen: boolean }
  /** New first days for the club's active members. */
  | { readonly kind: "open" }
  | {
      readonly kind: "revise";
      readonly daysPerMember: 1 | 2;
      /** The whole week is proposed again: `proposed` names every active member. Else only the new ones. */
      readonly newWeek: boolean;
      /** The members the proposal gains, in the order they joined. */
      readonly added: readonly string[];
      readonly proposed: readonly ProposedDays[];
    };

const fromMonday = (days: readonly Weekday[]): Weekday[] => WEEKDAYS.filter((weekday) => days.includes(weekday));

export function firstDaysAfter(facts: RosterChangeFacts): FirstDaysChange {
  const { active, open } = facts;
  if (active.length > 6) throw new RangeError("schedule: a club has at most six members (A01)");
  if (new Set(active).size !== active.length) throw new Error("schedule: each active member is listed once");

  if (open === null) {
    return facts.endedWithoutSuccessor && active.length >= 2 ? { kind: "open" } : { kind: "nothing" };
  }
  if (open.members.length === 0) throw new Error("schedule: an open proposal includes its members");
  const included = open.members.filter((member) => member.active);
  if (included.some((member) => !active.includes(member.id))) {
    throw new Error("schedule: a member the proposal has as active isn't among the club's active members");
  }

  if (open.members.some((member) => member.confirmed)) {
    if (included.length === 0) return { kind: "end", reopen: active.length >= 2 };
    if (included.every((member) => member.confirmed)) return { kind: "apply" };
    return active.length < 2 ? { kind: "end", reopen: false } : { kind: "nothing" };
  }

  // Nobody has confirmed: a revision for the club's members as they now are.
  if (active.length < 2) return { kind: "end", reopen: false };
  const per = daysPerMember(active.length);
  const week = proposedWeek(active.length);
  const added = active.filter((id) => !open.members.some((member) => member.id === id));
  if (per !== open.daysPerMember) {
    return {
      kind: "revise",
      daysPerMember: per,
      newWeek: true,
      added,
      proposed: active.map((id, place) => ({ id, days: week[place] ?? [] })),
    };
  }
  const taken = new Set<Weekday>(included.flatMap((member) => member.held));
  const proposed = added.map((id): ProposedDays => {
    const days: Weekday[] = [];
    // The table's days for their place that nobody holds, then the first free days from Monday.
    const wanted = (week[active.indexOf(id)] ?? []).filter((weekday) => !taken.has(weekday));
    for (const weekday of [...wanted, ...WEEKDAYS]) {
      if (days.length === per) break;
      if (taken.has(weekday)) continue;
      taken.add(weekday);
      days.push(weekday);
    }
    if (days.length !== per) throw new Error("schedule: the week has no free day left for a new member");
    return { id, days: fromMonday(days) };
  });
  return { kind: "revise", daysPerMember: per, newWeek: false, added, proposed };
}
