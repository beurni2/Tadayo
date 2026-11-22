/// <reference lib="esnext.temporal" />
// The reservations' rows of the privacy matrix (B2's reservations slice: `createReservation` and
// `releaseReservation`, the contract's Reservation and ReleasedReservation; spec 06, 11, 32; addendum 2; T3, T4,
// T9, T14, T15, T17, T18, T19, T20; FQ50, FQ63; docs/plans/api-b2-reservations.md): what each role must get,
// judged from the world's rows and the time alone, apart from the statements the routes run.
//
// - Who may add to a day: an account that is active, with an active interval in the day's club, a club that
//   isn't suspended, and a day that is scheduled (`adderOf`). Everyone else the gate lets through gets the
//   neutral not-found, byte for byte.
// - A day whose star's interval ended, or whose star asked to delete their account, before its reveal never
//   opens: MEMBERSHIP_CHANGED, with no fact (the plan's section 0.5).
// - From the reveal on: OCCURRENCE_CLOSED with the day as the contract's Occurrence at that instant (open until
//   its close, past after it) and the star's next day that reveals after both, when there is one (T3, T4).
// - Then the caller's own allowance in the day, for their role there (the star's six, six and two, anyone
//   else's three, two and one; T17, addendum 2): their drops in the day by that interval, but those withdrawn
//   before its reveal, and their live slots that haven't lapsed (T18). QUOTA_FULL when the whole allowance is
//   used, then EXTERNAL_LIMIT for a link or PHOTO_LIMIT for a photo, each with the day, the allowance and the
//   next day; otherwise 201 with a new slot of the caller's, lapsing 30 minutes on or at the reveal if that
//   comes first, in whole seconds, and the allowance with it counted (`heldProblems` holds the row it made).
// - A release: the neutral not-found unless the slot is of the caller's active interval in a club that isn't
//   suspended, on a day that is scheduled (held and closed days included); then its state (released when still
//   live, expired once lapsed, or as it ended), the caller's own drop that used it when consumed (T20), and the
//   caller's allowance with it off the counts.
//
// The leak scanner reads the same answers (scanner.ts: an allowance counts no more than the viewer's own, with
// their own role's limits; a Reservation's day of a club they are in); it can't judge a refusal's order, an
// exact count, an instant or a row, so this file does.

import { daysOf, occurrenceOf } from "./account.ts";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import { canonical } from "./schedule.ts";
import type { Answer, MediaClass, WorldFacts } from "./scanner.ts";

/** The operations whose rows this file judges. */
export const RESERVATION_JUDGED: ReadonlySet<string> = new Set(["createReservation", "releaseReservation"]);

/** createReservation's ordinary request (specsFor: a key and no body): the contract refuses it. */
export const RESERVE_NO_BODY: Answer = pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}');

/** A day whose star has gone before its reveal: the person's membership changed, with no fact (FQ63). */
export const MEMBERSHIP_CHANGED: Answer = pinned(409, "Conflict", '{"code":"MEMBERSHIP_CHANGED"}');

/** The table each cell sends to its day, in order: two photos, three links, three photos (the plan's section 3). */
export const RESERVE_TABLE: readonly MediaClass[] = [
  "photo",
  "photo",
  "external_video",
  "external_video",
  "external_video",
  "photo",
  "photo",
  "photo",
];

/** How long a slot holds before it lapses, at most (T18; the plan's section 0.4). */
const SLOT_MINUTES = 30;

const before = (a: Temporal.Instant, b: Temporal.Instant) => Temporal.Instant.compare(a, b) < 0;
const later = (a: Temporal.Instant, b: Temporal.Instant) => (before(a, b) ? b : a);
const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/**
 * The interval of `account` that may add to the day `day`, or give back a slot in it: the account is active,
 * its interval in the day's club is, the club isn't suspended and the day is scheduled. Undefined otherwise.
 */
export function adderOf(world: WorldFacts, account: string | null, day: string): string | undefined {
  const theDay = world.days.get(day);
  if (account === null || theDay === undefined || theDay.status !== "scheduled") return undefined;
  if (world.accounts.get(account)?.state !== "active") return undefined;
  if (world.clubs.get(theDay.club)?.suspendedAt !== null) return undefined;
  for (const [interval, member] of world.members) {
    if (member.club === theDay.club && member.account === account && member.leftAt === null) return interval;
  }
  return undefined;
}

/** Whether the day's star left, or asked to delete their account, before its reveal (FQ63). */
function held(world: WorldFacts, day: string): boolean {
  const theDay = world.days.get(day);
  const star = theDay === undefined ? undefined : world.members.get(theDay.star);
  if (theDay === undefined || star === undefined) return true;
  const asked = world.accounts.get(star.account)?.deletionRequestedAt ?? null;
  return (
    (star.leftAt !== null && before(star.leftAt, theDay.revealAt)) || (asked !== null && before(asked, theDay.revealAt))
  );
}

/** The caller's counts in one day and their role's limits, as the contract's Allowance. */
export interface AllowanceBody {
  added: number;
  reserved: number;
  limit: number;
  photo_added: number;
  photo_reserved: number;
  photo_limit: number;
  external_added: number;
  external_reserved: number;
  external_limit: number;
  is_star: boolean;
}

/**
 * The allowance of `interval` in `day` at `now`, `change` slots added (one held) or taken away (one given
 * back): its drops in the day but those withdrawn before the reveal, its live slots that haven't lapsed, and
 * the limits of its role there (T15, T17, T18).
 */
export function allowanceIn(
  world: WorldFacts,
  day: string,
  interval: string,
  now: Temporal.Instant,
  change: { media: MediaClass; by: 1 | -1 } | null = null,
): AllowanceBody {
  const theDay = world.days.get(day);
  if (theDay === undefined) throw new Error("allowanceIn: no such day");
  const drops = [...world.drops.values()].filter(
    (drop) =>
      drop.day === day &&
      drop.author === interval &&
      !(drop.state === "withdrawn" && drop.endedAt !== null && before(drop.endedAt, theDay.revealAt)),
  );
  const slots = [...world.reservations.values()].filter(
    (slot) => slot.day === day && slot.interval === interval && slot.state === "live" && before(now, slot.expiresAt),
  );
  const count = (items: readonly { media: MediaClass }[], media: MediaClass) =>
    items.filter((item) => item.media === media).length;
  const star = theDay.star === interval;
  const heldPhotos = count(slots, "photo") + (change?.media === "photo" ? change.by : 0);
  const heldLinks = count(slots, "external_video") + (change?.media === "external_video" ? change.by : 0);
  return {
    added: drops.length,
    reserved: heldPhotos + heldLinks,
    limit: star ? 6 : 3,
    photo_added: count(drops, "photo"),
    photo_reserved: heldPhotos,
    photo_limit: star ? 6 : 2,
    external_added: count(drops, "external_video"),
    external_reserved: heldLinks,
    external_limit: star ? 2 : 1,
    is_star: star,
  };
}

/** The day as the contract's Occurrence at `now`: collecting before its reveal, open until its close, past after. */
function dayAt(world: WorldFacts, day: string, now: Temporal.Instant): Record<string, unknown> | undefined {
  const theDay = world.days.get(day);
  if (theDay === undefined) return undefined;
  const phase = before(now, theDay.revealAt) ? "collecting" : before(now, theDay.closeAt) ? "open" : "past";
  return occurrenceOf(world, day, phase);
}

/** The star's next day that reveals after both `now` and the day's own reveal, for a refusal to offer (T4). */
function nextOf(world: WorldFacts, day: string, now: Temporal.Instant): unknown {
  const theDay = world.days.get(day);
  if (theDay === undefined) return undefined;
  return daysOf(world, theDay.club, later(now, theDay.revealAt), theDay.star).next;
}

/** What createReservation must answer, from the world's rows before it. */
export type ReserveOutcome =
  | { kind: "pinned"; answer: Answer }
  | { kind: "refused"; code: string; body: Record<string, unknown> }
  | { kind: "held"; interval: string; body: Record<string, unknown> };

/** What the world's rows give `account` asking at `now` for a slot of `media` in `day` (the rule above). */
export function reserveOutcome(
  world: WorldFacts,
  account: string | null,
  day: string,
  media: MediaClass,
  now: Temporal.Instant,
): ReserveOutcome {
  const interval = adderOf(world, account, day);
  const theDay = world.days.get(day);
  if (interval === undefined || theDay === undefined) return { kind: "pinned", answer: NEUTRAL };
  if (held(world, day)) return { kind: "pinned", answer: MEMBERSHIP_CHANGED };
  const target = dayAt(world, day, now);
  const next = nextOf(world, day, now);
  const facts = (code: string, allowance?: AllowanceBody) => ({
    code,
    target,
    ...(next === undefined ? {} : { next_target: next }),
    ...(allowance === undefined ? {} : { allowance }),
  });
  if (!before(now, theDay.revealAt))
    return { kind: "refused", code: "OCCURRENCE_CLOSED", body: facts("OCCURRENCE_CLOSED") };
  const allowance = allowanceIn(world, day, interval, now);
  const photos = allowance.photo_added + allowance.photo_reserved;
  const links = allowance.external_added + allowance.external_reserved;
  const code =
    allowance.added + allowance.reserved >= allowance.limit
      ? "QUOTA_FULL"
      : media === "external_video" && links >= allowance.external_limit
        ? "EXTERNAL_LIMIT"
        : media === "photo" && photos >= allowance.photo_limit
          ? "PHOTO_LIMIT"
          : null;
  if (code !== null) return { kind: "refused", code, body: facts(code, allowance) };
  const lapses = now.add({ minutes: SLOT_MINUTES });
  return {
    kind: "held",
    interval,
    body: {
      occurrence_id: day,
      media_class: media,
      expires_at: second(before(lapses, theDay.revealAt) ? lapses : theDay.revealAt),
      allowance: allowanceIn(world, day, interval, now, { media, by: 1 }),
    },
  };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How `body` differs from `want`, field by field, as `what`. */
function fieldProblems(what: string, body: Record<string, unknown>, want: Record<string, unknown>): string[] {
  if (canonical(body) === canonical(want)) return [];
  const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
  return keys
    .filter((key) => canonical(body[key]) !== canonical(want[key]))
    .map(
      (key) => `${what}'s ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`,
    );
}

/** An answer of `status` that only the caller may keep, whose body is JSON: its body, or the problems. */
function bodyOf(answer: Answer, status: number, what: string): Record<string, unknown> | string[] {
  if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with ${what}`];
  if (answer.headers["cache-control"] !== "private, no-store") return [`${what} without private, no-store`];
  if (answer.headers["content-type"] !== "application/json; charset=utf-8") return [`${what} not as JSON`];
  const body = parsed(answer);
  return isObject(body) ? body : [`not ${what}`];
}

/** createReservation's answer for `outcome`: the pinned refusal, the refusal with its facts, or the slot held. */
export function reserveExpected(outcome: ReserveOutcome): Expected {
  if (outcome.kind === "pinned") return outcome.answer;
  if (outcome.kind === "refused") {
    return (answer) => {
      const body = bodyOf(answer, 409, outcome.code);
      return Array.isArray(body) ? body : fieldProblems(outcome.code, body, outcome.body);
    };
  }
  return (answer) => {
    const body = bodyOf(answer, 201, "the slot held");
    if (Array.isArray(body)) return body;
    const { id, ...rest } = body;
    return [
      ...(typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? [] : ["the slot held has no id"]),
      ...fieldProblems("the slot held", rest, outcome.body),
    ];
  };
}

/**
 * What is wrong with the world after `answer`, given the world before it and the outcome it was judged by: a
 * slot held is a new reservation of the caller's interval, live, of its media, in its day, lapsing when the
 * answer says, and no other reservation was made or changed but the caller's own lapsed ones, settled; a
 * refusal made and changed no reservation (T19: it leaves nothing).
 */
export function heldProblems(
  previous: WorldFacts,
  after: WorldFacts,
  answer: Answer,
  outcome: ReserveOutcome,
  now: Temporal.Instant,
): string[] {
  const problems: string[] = [];
  const made = [...after.reservations.keys()].filter((id) => !previous.reservations.has(id));
  const body = parsed(answer);
  const id = isObject(body) && typeof body.id === "string" ? body.id : undefined;
  if (outcome.kind === "held") {
    if (made.length !== 1 || made[0] !== id)
      problems.push(`the slot held made ${JSON.stringify(made)}, not its own id`);
    const slot = id === undefined ? undefined : after.reservations.get(id);
    if (
      slot !== undefined &&
      (slot.interval !== outcome.interval ||
        slot.day !== outcome.body.occurrence_id ||
        slot.media !== outcome.body.media_class ||
        slot.state !== "live" ||
        second(slot.expiresAt) !== outcome.body.expires_at)
    )
      problems.push("the slot held isn't the caller's live slot of its media in its day, lapsing when it says");
  } else if (made.length > 0) problems.push(`a refusal made ${JSON.stringify(made)} (T19)`);
  for (const [other, was] of previous.reservations) {
    const now_ = after.reservations.get(other);
    if (now_ === undefined) problems.push(`${other} is gone`);
    else if (now_.state !== was.state) {
      // A refusal rolls back whatever it settled; a slot held settles the caller's own lapsed slots first.
      const settled =
        outcome.kind === "held" &&
        was.state === "live" &&
        now_.state === "expired" &&
        !before(now, was.expiresAt) &&
        was.interval === outcome.interval;
      if (!settled) problems.push(`${other} went from ${was.state} to ${now_.state}`);
    }
  }
  return problems;
}

/** What releaseReservation must answer, from the world's rows before it. */
export type ReleaseOutcome =
  { kind: "pinned"; answer: Answer } | { kind: "released"; interval: string; body: Record<string, unknown> };

/** What the world's rows give `account` giving back the reservation `id` at `now` (the rule above). */
export function releaseOutcome(
  world: WorldFacts,
  account: string | null,
  id: string,
  now: Temporal.Instant,
): ReleaseOutcome {
  const slot = world.reservations.get(id);
  if (slot === undefined) return { kind: "pinned", answer: NEUTRAL };
  const interval = adderOf(world, account, slot.day);
  if (interval === undefined || interval !== slot.interval) return { kind: "pinned", answer: NEUTRAL };
  const live = slot.state === "live" && before(now, slot.expiresAt);
  const state = live ? "released" : slot.state === "live" ? "expired" : slot.state;
  return {
    kind: "released",
    interval,
    body: {
      id,
      state,
      ...(state === "consumed" && slot.drop !== null ? { drop_id: slot.drop } : {}),
      allowance: allowanceIn(world, slot.day, interval, now, live ? { media: slot.media, by: -1 } : null),
    },
  };
}

/** releaseReservation's answer for `outcome`. */
export function releaseExpected(outcome: ReleaseOutcome): Expected {
  if (outcome.kind === "pinned") return outcome.answer;
  return (answer) => {
    const body = bodyOf(answer, 200, "the released slot");
    return Array.isArray(body) ? body : fieldProblems("the released slot", body, outcome.body);
  };
}

/** What is wrong with the reservation `id` after its release: it ended as the answer says, and nothing else changed. */
export function releasedProblems(
  previous: WorldFacts,
  after: WorldFacts,
  id: string,
  outcome: ReleaseOutcome,
  now: Temporal.Instant,
): string[] {
  const problems: string[] = [];
  if (after.reservations.size !== previous.reservations.size) problems.push("a release made or lost a reservation");
  for (const [other, was] of previous.reservations) {
    const now_ = after.reservations.get(other);
    if (now_ === undefined) continue;
    if (other === id && outcome.kind === "released") {
      if (now_.state !== outcome.body.state) problems.push(`${id} is ${now_.state}, not ${String(outcome.body.state)}`);
      continue;
    }
    if (now_.state === was.state) continue;
    const settled =
      outcome.kind === "released" &&
      was.state === "live" &&
      now_.state === "expired" &&
      was.interval === outcome.interval &&
      !before(now, was.expiresAt);
    if (!settled) problems.push(`${other} went from ${was.state} to ${now_.state}`);
  }
  return problems;
}

/** Whether `expected` takes `answer`: for the tests of this file. */
export function takes(expected: Expected, answer: Answer): string[] {
  return typeof expected === "function" ? expected(answer) : pinnedProblems(answer, expected);
}
