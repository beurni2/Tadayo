// What a choice and a confirmation get in a club's first days (the contract's `ScheduleChoiceRequest` and
// `ScheduleConfirmRequest`; spec 05; book p11; T6; FQ48, FQ55, FQ57, FQ99, FQ102).
//
// Nobody is moved and no winner is picked: a choice may take a free day, a day one other member holds
// (which makes it contested), a contested day, or none; only a day another member has confirmed is
// refused. A confirmation is of exactly the days the caller holds, `days_per_member` of them, and of none
// that anyone else holds too, so a contested day is confirmed by nobody until all but one have chosen
// another, and in a club of two or three a member whose one day is contested confirms neither (FQ99).
//
// A membership change has no choosing (FQ56): its confirmation is of the days it proposes for the caller.

import { WEEKDAYS, type Weekday } from "./propose.ts";
import { confirmerOf, holdersOf, type ProposalMember, type WeekFacts } from "./view.ts";

function callerOf(callerId: string, facts: WeekFacts): ProposalMember {
  const caller = facts.members.find((member) => member.id === callerId);
  if (caller === undefined || !caller.active) {
    throw new Error("schedule: the proposal doesn't include the caller as an active member (FQ100, T14)");
  }
  return caller;
}

/** The request's weekdays from Monday. Throws on what the contract's schema refuses before any rule. */
function fromMonday(weekdays: readonly Weekday[], least: 0 | 1): Weekday[] {
  if (weekdays.length < least || weekdays.length > 2) {
    throw new RangeError(least === 1 ? "schedule: one or two weekdays" : "schedule: none, one or two weekdays");
  }
  if (new Set(weekdays).size !== weekdays.length) throw new RangeError("schedule: each weekday only once (T6)");
  for (const weekday of weekdays) {
    if (!WEEKDAYS.includes(weekday)) throw new RangeError("schedule: not a weekday that can be someone's day (T6)");
  }
  return WEEKDAYS.filter((weekday) => weekdays.includes(weekday));
}

/** The days the caller holds from now on, or the refusal. */
export function judgeChoice(
  callerId: string,
  facts: WeekFacts,
  weekdays: readonly Weekday[],
): "NOT_ALLOWED" | { readonly held: readonly Weekday[] } {
  const caller = callerOf(callerId, facts);
  const held = fromMonday(weekdays, 0);
  // After confirming, nothing is chosen again (FQ57).
  if (caller.confirmed) return "NOT_ALLOWED";
  if (held.length > facts.daysPerMember) return "NOT_ALLOWED";
  // Only a confirmed day is taken (FQ48), and it stays its owner's even when they have left (FQ102).
  if (held.some((weekday) => confirmerOf(facts, weekday) !== undefined)) return "NOT_ALLOWED";
  return { held };
}

/** The days the caller confirms, or the refusal. */
export function judgeConfirmation(
  callerId: string,
  facts: WeekFacts,
  weekdays: readonly Weekday[],
): "NOT_ALLOWED" | { readonly days: readonly Weekday[] } {
  const caller = callerOf(callerId, facts);
  const days = fromMonday(weekdays, 1);
  if (caller.confirmed) return "NOT_ALLOWED";
  // Exactly the days the caller holds, so a confirmation never confirms days the caller didn't see.
  const held = WEEKDAYS.filter((weekday) => caller.held.includes(weekday));
  if (held.length !== days.length || held.some((weekday, index) => weekday !== days[index])) return "NOT_ALLOWED";
  if (days.length !== facts.daysPerMember) return "NOT_ALLOWED";
  for (const weekday of days) {
    if (confirmerOf(facts, weekday) !== undefined) return "NOT_ALLOWED";
    if (holdersOf(facts, weekday).some((member) => member.id !== caller.id)) return "NOT_ALLOWED";
  }
  return { days };
}

/**
 * The refusal of a membership change's confirmation, or null: the weekdays are exactly the days the change
 * proposes for the caller, who hasn't confirmed it before (the contract's `ScheduleConfirmRequest`; FQ56).
 */
export function judgeChangeConfirmation(
  callerId: string,
  facts: WeekFacts,
  weekdays: readonly Weekday[],
): "NOT_ALLOWED" | null {
  const caller = callerOf(callerId, facts);
  const days = fromMonday(weekdays, 1);
  if (caller.confirmed) return "NOT_ALLOWED";
  const proposed = WEEKDAYS.filter((weekday) => caller.held.includes(weekday));
  if (proposed.length !== facts.daysPerMember) return "NOT_ALLOWED";
  if (proposed.length !== days.length || proposed.some((weekday, index) => weekday !== days[index])) {
    return "NOT_ALLOWED";
  }
  return null;
}

/**
 * Whether the first days apply: every member they include who is still active has confirmed (a late
 * joiner is never one of them, FQ100), and at least one such member is left.
 */
export function everyoneConfirmed(facts: WeekFacts): boolean {
  const active = facts.members.filter((member) => member.active);
  return active.length > 0 && active.every((member) => member.confirmed);
}
