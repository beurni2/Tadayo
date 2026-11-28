// The roster's stable order (the contract's `Member.position`; spec 09: "stable roster order", never a
// ranking; FQ26, FQ98, FQ114). A pure rule over facts the roster's read loads.
//
// - In the club's first days, until the first-days proposal has applied, and before a club has any week
//   in force: every member in the order they joined, so no row moves when a member chooses or confirms,
//   and the order shows no proposed day (FQ98).
// - Afterwards: the week in force today from Monday, a member with two days by the earlier (FQ26), then
//   anyone with no day in force, in the order they joined.
//
// Members who joined at the same instant are in the order of their interval ids, byte by byte (FQ114):
// the caller gives the members already in that order (`ORDER BY joined_at, interval_id COLLATE "C"`),
// as the first days' proposal takes them (./open.ts).

import { WEEKDAYS, type Weekday } from "./propose.ts";
import { Fault, RangeFault } from "../fault.ts";

export interface OrderFacts {
  /** The active members' intervals, in the order they joined. */
  readonly joined: readonly string[];
  /** Whether a first-days proposal is open: the club's first days haven't applied. */
  readonly firstDaysOpen: boolean;
  /** The days of the week in force today, or null when no week is in force. */
  readonly inForce: readonly { readonly weekday: Weekday; readonly starInterval: string }[] | null;
}

/** The members' intervals in roster order: position 1 first. */
export function rosterOrder(facts: OrderFacts): string[] {
  const joined = [...facts.joined];
  if (new Set(joined).size !== joined.length) throw new Fault("order_1", "schedule: a member is in the roster twice");
  if (facts.firstDaysOpen || facts.inForce === null) return joined;
  const earliest = new Map<string, number>();
  for (const day of facts.inForce) {
    const index = WEEKDAYS.indexOf(day.weekday);
    if (index < 0) throw new RangeFault("order_2", `schedule: ${day.weekday} can't be someone's day (T6)`);
    const known = earliest.get(day.starInterval);
    if (known === undefined || index < known) earliest.set(day.starInterval, index);
  }
  // A stable sort: members with a day by their earliest weekday (no two share one), the rest after,
  // kept in join order.
  const rank = (id: string) => earliest.get(id) ?? WEEKDAYS.length;
  return joined
    .map((id, at) => ({ id, at }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.at - b.at)
    .map((member) => member.id);
}
