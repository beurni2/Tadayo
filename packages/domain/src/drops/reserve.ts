/// <reference lib="esnext.temporal" />
// Holding a slot in a day before an upload (the contract's `createReservation`; spec 11, 32; T1, T3, T4, T9,
// T14, T15, T17, T18, T19; addendum 2; docs/plans/api-b2-reservations.md), one command in one READ COMMITTED
// transaction the caller opens (TECH-DESIGN section 5). A refusal throws `Refused`, which rolls it back, so a
// refused request leaves nothing, its receipt included.
//
// 1. Who may add to the day, with no lock (../authorization/add-target.ts): someone the club gives nothing,
//    a suspended club or a day that is suspended, cancelled or nobody's never reaches the receipt: NOT_FOUND,
//    for a first request and a retry alike (T14; FQ112's default).
// 2. The receipt (T19): the same request under the same key gets its first answer back, as it was, after the
//    cutoff, midnight or a release; another request under it is IDEMPOTENCY_CONFLICT; a key an earlier
//    interval of the account used names nothing to this one (`reserveAsMember`, FQ112).
// 3. The locks, in TECH-DESIGN's order: the club's row and the day's `FOR SHARE`, which hold off a suspension,
//    a cancellation and the club's own commands until this one commits; the caller's and the star's membership
//    rows `FOR SHARE`, which hold off a leave; then the counter, made if missing, `FOR UPDATE`, which puts
//    every slot of the caller's in that day in one order (./counter.ts). Two contributors never wait for each
//    other's counter.
// 4. The clock, sampled after the locks (T1, T3): a request that waited across 07:00 reads the time after it.
// 5. The rule again, on the facts read under the locks: NOT_FOUND (a leave, a suspension or a rejoin came in
//    between); MEMBERSHIP_CHANGED for a held day, whose star has gone (FQ63; the plan's section 0.5); from
//    the reveal on, OCCURRENCE_CLOSED with the day and the same person's next day (T3, T4); then the lapsed
//    reservations settled and the caller's limits by role (T17): QUOTA_FULL, EXTERNAL_LIMIT or PHOTO_LIMIT,
//    QUOTA_FULL first, each with the day, the caller's own allowance and the next day (T4, T15).
// 6. The slot: live from the sample for 30 minutes, never past the day's reveal (T18; the plan's section 0.4).
// 7. The answer, made by `render`, stored in the receipt, and answered as the receipt keeps it.

import {
  addTargetOutcome,
  loadAddTarget,
  loadLaterDays,
  nextTargetOf,
  type AddTargetFacts,
} from "../authorization/add-target.ts";
import type { PlacedDay } from "../authorization/days.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveAsMember, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { allowanceOf, limitRefusal, MEDIA_CLASSES, type Allowance, type MediaClass } from "./allowance.ts";
import { holdSlot, lockCounter, settleLapsed, type CounterKey } from "./counter.ts";

/** How long a reservation holds its slot before it lapses, at most: never past the day's reveal (T18). */
export const RESERVATION_MINUTES = 30;

export interface CreateReservationInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's day. */
  readonly occurrenceId: string;
  /** The body's kind of drop the slot is for. */
  readonly mediaClass: MediaClass;
}

/** A slot held: the contract's Reservation. */
export interface ReservationAnswer {
  readonly id: string;
  readonly occurrenceId: string;
  readonly mediaClass: MediaClass;
  /** When it lapses, at most 30 minutes on, never after the day's reveal (T18). */
  readonly expiresAt: Temporal.Instant;
  /** The caller's own allowance in the day, this slot counted (T15, T17). */
  readonly allowance: Allowance;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly string[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: CreateReservationInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("drops: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("drops: the idempotency key is a UUID");
  }
  if (!MEDIA_CLASSES.includes(input.mediaClass))
    throw new TypeError("drops: the media class is photo or external_video");
  if (typeof input.occurrenceId !== "string") throw new TypeError("drops: the day is an id");
}

/** When a slot held at `at` lapses: 30 minutes on, or the day's reveal if that comes first (T18). */
export function reservationExpiry(at: Temporal.Instant, revealAt: Temporal.Instant): Temporal.Instant {
  const later = at.add({ minutes: RESERVATION_MINUTES });
  return Temporal.Instant.compare(later, revealAt) < 0 ? later : revealAt;
}

/**
 * Takes the club's and the day's rows, then the caller's and the star's membership rows, each `FOR SHARE`,
 * in TECH-DESIGN's order, the intervals by id byte by byte. A refusal never needs them released: its
 * transaction rolls back.
 */
async function lockDay(tx: QuerySql, facts: AddTargetFacts, interval: string): Promise<void> {
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${facts.day.clubId} FOR SHARE`;
  await bound(tx)`SELECT id FROM app.occurrences WHERE id = ${facts.day.id} FOR SHARE`;
  await bound(tx)`
    SELECT interval_id FROM app.memberships
     WHERE interval_id IN (${interval}, ${facts.day.starInterval})
     ORDER BY interval_id COLLATE "C"
       FOR SHARE`;
}

/** The same person's next day after `facts`' day, read under the locks, for a refusal to offer (T4). */
async function nextTarget(tx: QuerySql, facts: AddTargetFacts, at: ServerNow): Promise<PlacedDay | undefined> {
  const next = nextTargetOf(facts, await loadLaterDays(tx, facts.day), at);
  return next ?? undefined;
}

/**
 * Holds one slot of the caller's in the day, in `tx`, and returns what `render` makes of it, which is also what
 * the receipt stores and a replay returns. Throws `Refused`.
 */
export async function createReservation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: CreateReservationInput,
  render: (reservation: ReservationAnswer) => Json,
): Promise<Json> {
  check(input);
  const { userId, occurrenceId, mediaClass } = input;
  // An id that can't be one names no day, as one nobody has.
  if (!ID.test(occurrenceId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation: "createReservation",
      path: { occurrence_id: occurrenceId },
      query: {},
      body: { media_class: mediaClass },
    },
  };

  // 1. Who may add to the day, with no lock.
  const first = await clock.sample(tx);
  const seen = await loadAddTarget(tx, userId, occurrenceId);
  const looked = addTargetOutcome(seen, first);
  if (seen === null || looked.kind === "not_found" || seen.viewerInterval === null) throw new Refused("NOT_FOUND");
  const interval = seen.viewerInterval;

  // 2. The receipt.
  const stored = await reserveAsMember(tx, receipt, first, interval);
  if (stored !== null) return stored.replay;

  // 3. The locks.
  await lockDay(tx, seen, interval);
  const key: CounterKey = { day: seen.day.id, interval, club: seen.day.clubId };
  await lockCounter(tx, key);

  // 4. The clock.
  const at = await clock.sample(tx);

  // 5. The rule again, under the locks.
  const facts = await loadAddTarget(tx, userId, occurrenceId);
  const outcome = addTargetOutcome(facts, at);
  if (facts === null || outcome.kind === "not_found" || facts.viewerInterval !== interval) {
    throw new Refused("NOT_FOUND");
  }
  if (outcome.kind === "held") throw new Refused("MEMBERSHIP_CHANGED");
  if (outcome.kind === "closed") {
    const next = await nextTarget(tx, facts, at);
    throw new Refused("OCCURRENCE_CLOSED", {
      ...(outcome.target === null ? {} : { target: outcome.target }),
      ...(next === undefined ? {} : { next_target: next }),
    });
  }
  const before = allowanceOf(await settleLapsed(tx, key, at), outcome.isStar);
  const refusal = limitRefusal(before, mediaClass);
  if (refusal !== null) {
    const next = await nextTarget(tx, facts, at);
    throw new Refused(refusal, {
      target: outcome.target,
      allowance: before,
      ...(next === undefined ? {} : { next_target: next }),
    });
  }

  // 6. The slot.
  const expiresAt = reservationExpiry(at, facts.day.revealAt);
  const held = await holdSlot(tx, key, { media: mediaClass, at, expiresAt, requestKey: input.key });

  // 7. The answer.
  const body = render({
    id: held.id,
    occurrenceId: facts.day.id,
    mediaClass,
    expiresAt,
    allowance: allowanceOf(held.row, outcome.isStar),
  });
  return completeReceipt(tx, receipt, body, 201);
}
