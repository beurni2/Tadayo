/// <reference lib="esnext.temporal" />
// The roster's row of the privacy matrix (B2's generation slice: `listMembers`, the contract's `Members`;
// spec 09, 32; T9, T14, T15, T33, T49, T55; FQ26, FQ75, FQ98, FQ114): what each role must get, judged from
// the world's rows apart from the query the route runs.
//
// - Who: an account that is active, with an active interval in a club that isn't suspended (schedule.ts's
//   `viewerIn`, the rule getSchedule is judged by). Everyone else the gate lets through gets the neutral
//   not-found, byte for byte.
// - What: the server's instant in whole seconds, the club with the viewer's own interval, and every active
//   member who has a name to show, the same list for every member (T55): the contract's Person, the
//   position from 1 with no gap, the member's next day and whether they are next. Nothing else: no `cover`
//   (FQ41, B4) and no `open_revision` (B1) yet, so a field beyond these fails the row.
// - The order (FQ98, FQ114): while a first-days proposal is open, or no week is in force today, the order
//   they joined, then their interval ids byte by byte; otherwise the week in force today from Monday, a
//   member with two days by the earlier, then anyone with no day in it, in the order they joined.
// - `next_day`: the member's next day as account.ts's `daysOf` gives a club's, among that member's own days
//   (the caller passes it in as `nextOf`); `next_up`: the member who is the star of the club's next day.
//
// The leak scanner reads the same answers for ids and names the viewer may not see; it can't judge the
// order or whose day is next, so this row does.

import { NEUTRAL, pinnedProblems, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import { sameBody, viewerIn, WEEK, type ScheduleSeen, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const MEMBERS_JUDGED: ReadonlySet<string> = new Set(["listMembers"]);

/** A club's next day, or one member's when `star` names their interval: the contract's Occurrence, or undefined. */
export type NextOf = (star?: string) => unknown;

const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/** The intervals of `club`'s active members who have a name to show, in roster order. */
export function orderOf(world: ScheduleWorld, club: string, now: Temporal.Instant): string[] {
  const row = world.clubs.get(club);
  if (row === undefined) return [];
  const joined = [...world.members]
    .filter(([, member]) => member.club === club && member.active && member.name !== null)
    .sort(([a, one], [b, other]) => Temporal.Instant.compare(one.joinedAt, other.joinedAt) || byBytes(a, b))
    .map(([interval]) => interval);
  const firstDaysOpen = [...world.proposals.values()].some(
    (proposal) => proposal.club === club && proposal.reason === "activation" && proposal.state === "open",
  );
  const today = now.toZonedDateTimeISO(row.timezone).toPlainDate().toString();
  const inForce = world.versions
    .filter((version) => version.club === club && version.effectiveFrom <= today)
    .sort((a, b) => byBytes(a.effectiveFrom, b.effectiveFrom))
    .at(-1);
  if (firstDaysOpen || inForce === undefined) return joined;
  const earliest = (interval: string) => {
    const days = inForce.assignments.filter((day) => day.star === interval).map((day) => WEEK.indexOf(day.weekday));
    return days.length === 0 ? WEEK.length : Math.min(...days);
  };
  return joined
    .map((interval, at) => ({ interval, at }))
    .sort((a, b) => earliest(a.interval) - earliest(b.interval) || a.at - b.at)
    .map((member) => member.interval);
}

/** The contract's Members of `club` for the account `account` at `now`, or undefined: the neutral not-found. */
export function membersFor(
  world: ScheduleWorld,
  club: string,
  account: string | null,
  now: Temporal.Instant,
  nextOf: NextOf,
): Record<string, unknown> | undefined {
  const viewer = viewerIn(world, club, account);
  const row = world.clubs.get(club);
  if (viewer === undefined || row === undefined) return undefined;
  const clubNext = nextOf();
  const nextStar = isObject(clubNext) && isObject(clubNext.star) ? clubNext.star.membership_id : undefined;
  return {
    server_now: second(now),
    club: { id: club, name: row.name, timezone: row.timezone, my_membership_id: viewer },
    members: orderOf(world, club, now).map((interval, index) => {
      const member = world.members.get(interval);
      const next = nextOf(interval);
      return {
        person: {
          membership_id: interval,
          display_name: member?.name,
          ...(member === undefined || member.avatar === null ? {} : { avatar_version: member.avatar }),
        },
        position: index + 1,
        ...(next === undefined ? {} : { next_day: next }),
        next_up: nextStar === interval,
      };
    }),
  };
}

/** What the roster's judge knows of a cell: the schedule's rows, the viewer, the instant and the days. */
export interface MembersSeen extends ScheduleSeen {
  nextOf: NextOf;
}

/** listMembers' answer for `club` in a cell. */
export function membersExpected(seen: () => MembersSeen, club: string): Expected {
  return (answer) => {
    const { schedule, account, now, nextOf } = seen();
    const want = membersFor(schedule, club, account, now, nextOf);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameBody("the club's Members", want)(answer);
  };
}
