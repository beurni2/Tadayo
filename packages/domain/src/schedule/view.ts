// What one member sees of a club's first days (the contract's `ScheduleSlot` and `Schedule`, T55; FQ46,
// FQ48, FQ55, FQ78, FQ102; T33, T49).
//
// The facts are every member's holds and confirmations. The view carries a name only where the contract
// gives this viewer one:
//   - a confirmed day names its owner to everyone (book p11, FQ78), with its first date while the owner
//     is still a member;
//   - a day the viewer holds with others names all its holders, the viewer included, in the order they
//     joined (FQ46: only they see any name on it);
//   - a day one other member holds names that member only to a viewer still choosing, for the day picker
//     (FQ48); a viewer who has confirmed sees it with no name, as the club's week shows it;
//   - a day two or more others hold says only that it has no reveal: no names, no count (FQ46).
// Nothing here says who chose and who holds by proposal, and nothing counts anyone (T33).
//
// A membership change is a new member's pick of the free days (FQ125 to FQ127, FQ131), and the first days'
// view is its view too, on facts `pickWeekFacts` makes: every day of the club's latest week whose member is
// still in the club is a confirmed day of that member, so it is taken (yours, for a new member who has
// confirmed it), and a member who left, of the week or of the pick, holds nothing, so their days are free.
// `pickViewFor` then shows a first date only on the viewer's own confirmed day (FQ130): a day of the week in
// force first opened long ago, and its date says nothing to a new member.

import { WEEKDAYS, type Weekday } from "./propose.ts";

/** One member a first-days proposal includes. */
export interface ProposalMember {
  /** The membership interval's id. */
  readonly id: string;
  /** Whether that membership is still active. A member who left holds nothing (FQ102). */
  readonly active: boolean;
  /** Whether they have confirmed: `held` is then what they confirmed, for good (FQ57). */
  readonly confirmed: boolean;
  /** The days the proposal gave them (spec 05). */
  readonly suggested: readonly Weekday[];
  /** The days they hold: the proposed ones until they first choose, then what they last chose (FQ48). */
  readonly held: readonly Weekday[];
}

export interface WeekFacts {
  readonly daysPerMember: 1 | 2;
  /** The proposal's members, in the order they joined (FQ98). */
  readonly members: readonly ProposalMember[];
  /** Each confirmed day's first local date (FQ79), for the days whose owner is still a member. */
  readonly firstDates: Readonly<Partial<Record<Weekday, string>>>;
  /**
   * The members the proposal includes, where `members` lists others too: a membership change's facts list
   * every member with a day in the week, and only these are asked anything (`pickWeekFacts`).
   */
  readonly asked?: readonly string[];
}

export type SlotState = "yours" | "taken" | "available" | "clash" | "no_reveal";

export interface SlotView {
  readonly weekday: Weekday;
  readonly state: SlotState;
  /** On `taken` only: the member who confirmed it. */
  readonly owner?: string;
  /** On `clash` only: every holder, the viewer included, in the order they joined. */
  readonly holders?: readonly string[];
  /** On `available` only, for a viewer still choosing: the one other member who holds it. */
  readonly heldBy?: string;
  /** On a confirmed day whose owner is still a member. */
  readonly firstDate?: string;
  /** The proposal gave this day to the viewer. */
  readonly suggested: boolean;
}

export interface ProposalView {
  readonly slots: readonly SlotView[];
  /** The weekdays the viewer holds, from Monday. */
  readonly myDays: readonly Weekday[];
  readonly myState: "choosing" | "confirmed";
}

/** Whether `member` holds `weekday` without having confirmed it: what makes a day held or contested. */
function holds(member: ProposalMember, weekday: Weekday): boolean {
  return member.active && !member.confirmed && member.held.includes(weekday);
}

/** The member who confirmed `weekday`, still a member or not. */
export function confirmerOf(facts: WeekFacts, weekday: Weekday): ProposalMember | undefined {
  return facts.members.find((member) => member.confirmed && member.held.includes(weekday));
}

/** The members who hold `weekday` and haven't confirmed, in the order they joined. */
export function holdersOf(facts: WeekFacts, weekday: Weekday): readonly ProposalMember[] {
  return facts.members.filter((member) => holds(member, weekday));
}

/** The active member `id` the proposal includes, or undefined (FQ100, T14). */
export function includedMember(facts: WeekFacts, id: string): ProposalMember | undefined {
  if (facts.asked !== undefined && !facts.asked.includes(id)) return undefined;
  const found = facts.members.find((member) => member.id === id);
  return found?.active === true ? found : undefined;
}

/** The first days as the member `viewerId` sees them. Throws for anyone the proposal doesn't include. */
export function viewFor(viewerId: string, facts: WeekFacts): ProposalView {
  const viewer = includedMember(facts, viewerId);
  if (viewer === undefined) {
    throw new Error("schedule: the proposal doesn't include the viewer as an active member (FQ100, T14)");
  }
  const slots = WEEKDAYS.map((weekday): SlotView => {
    const suggested = viewer.suggested.includes(weekday);
    const confirmer = confirmerOf(facts, weekday);
    if (confirmer !== undefined) {
      const date = confirmer.active ? facts.firstDates[weekday] : undefined;
      return {
        weekday,
        state: confirmer.id === viewer.id ? "yours" : "taken",
        ...(confirmer.id === viewer.id ? {} : { owner: confirmer.id }),
        ...(date === undefined ? {} : { firstDate: date }),
        suggested,
      };
    }
    const holders = holdersOf(facts, weekday);
    if (holders.some((member) => member.id === viewer.id)) {
      return holders.length === 1
        ? { weekday, state: "yours", suggested }
        : { weekday, state: "clash", holders: holders.map((member) => member.id), suggested };
    }
    if (holders.length >= 2) return { weekday, state: "no_reveal", suggested };
    const [other] = holders;
    return {
      weekday,
      state: "available",
      ...(other === undefined || viewer.confirmed ? {} : { heldBy: other.id }),
      suggested,
    };
  });
  return {
    slots,
    myDays: WEEKDAYS.filter((weekday) => viewer.held.includes(weekday)),
    myState: viewer.confirmed ? "confirmed" : "choosing",
  };
}

/** One day of the club's latest week, for a membership change's facts. */
export interface LatestDay {
  readonly weekday: Weekday;
  readonly star: string;
  /** Whether the star's membership is still active. */
  readonly starActive: boolean;
  readonly firstDate: string;
}

/**
 * A membership change's facts: the members it includes, as their rows say (`members`, in the order they
 * joined), one who has left holding nothing; then each other active member with a day in the club's latest
 * week (`latest`), confirmed on those days, whom it doesn't include (`asked`); and every first date of the
 * latest week.
 */
export function pickWeekFacts(
  daysPerMember: 1 | 2,
  members: readonly ProposalMember[],
  latest: readonly LatestDay[],
): WeekFacts {
  const listed = new Set(members.map((member) => member.id));
  const stars = new Map<string, Weekday[]>();
  const firstDates: Partial<Record<Weekday, string>> = {};
  for (const day of latest) {
    if (!day.starActive) continue;
    firstDates[day.weekday] = day.firstDate;
    if (listed.has(day.star)) continue;
    stars.set(day.star, [...(stars.get(day.star) ?? []), day.weekday]);
  }
  return {
    daysPerMember,
    members: [
      ...members.map((member) => (member.active ? member : { ...member, held: [] })),
      ...[...stars].map(([id, days]): ProposalMember => ({
        id,
        active: true,
        confirmed: true,
        suggested: [],
        held: WEEKDAYS.filter((weekday) => days.includes(weekday)),
      })),
    ],
    firstDates,
    asked: members.map((member) => member.id),
  };
}

/**
 * A membership change as the member `viewerId` sees it: the first days' view of `pickWeekFacts`' facts,
 * with a first date only on the viewer's own confirmed day (FQ130). Throws for anyone it doesn't include.
 */
export function pickViewFor(viewerId: string, facts: WeekFacts): ProposalView {
  const view = viewFor(viewerId, facts);
  return {
    ...view,
    // Every field but the date, by name, on any day not the viewer's.
    slots: view.slots.map((slot): SlotView =>
      slot.state === "yours"
        ? slot
        : {
            weekday: slot.weekday,
            state: slot.state,
            ...(slot.owner === undefined ? {} : { owner: slot.owner }),
            ...(slot.holders === undefined ? {} : { holders: slot.holders }),
            ...(slot.heldBy === undefined ? {} : { heldBy: slot.heldBy }),
            suggested: slot.suggested,
          },
    ),
  };
}
