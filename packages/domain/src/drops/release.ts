/// <reference lib="esnext.temporal" />
// Giving back a held slot (the contract's `releaseReservation`; spec 11; T9, T14, T15, T18, T20;
// docs/plans/api-b2-reservations.md), one command in one READ COMMITTED transaction the caller opens. It takes
// no Idempotency-Key, as the contract has it: repeating it returns the same state, since a reservation that has
// ended never changes again (`app.reservations_guard`).
//
// 1. Whose it is, with no lock: the reservation's interval is the caller's active interval, in a club that
//    isn't suspended, for a day that is scheduled (../authorization/add-target.ts `ownsReservation`, the
//    rule's first conditions and the interval). Anyone else's, an earlier interval's after the account rejoined, a former member's, and an id
//    nobody has all get the neutral NOT_FOUND (T14). A held day's slot can be given back like any other: the
//    slot is the caller's own.
// 2. The locks, in TECH-DESIGN's order: the club's row, the day's and the caller's membership `FOR SHARE`,
//    the counter `FOR NO KEY UPDATE` (./counter.ts), then the reservation's row, `FOR NO KEY UPDATE` too: its
//    key never changes (`reservations_keep`). A drop's photo upload naming it takes the same counter's lock
//    first and then reads it `FOR SHARE` in its guard (migration 0016), so the two wait on each other only
//    at the counter, in one order. Every change of a reservation's state is made under its counter's lock,
//    so what the command reads after it stays true until it commits.
// 3. The clock, sampled after the locks (T1), and step 1 again.
// 4. The counter's lapsed reservations settled, this one among them if its time has come (T18). A slot still
//    live is then given back: `released`, ended at the sample, and off the counts.
// 5. The answer: its state, the caller's own drop that used it when it was consumed, so a commit whose answer
//    was lost isn't shown as not added (T20), and the caller's own allowance in the day (T15).

import { loadAddTarget, ownsReservation } from "../authorization/add-target.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { allowanceOf, type Allowance } from "./allowance.ts";
import { freeSlot, lockCounter, settleLapsed, type CounterKey } from "./counter.ts";

export interface ReleaseReservationInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The path's reservation. */
  readonly reservationId: string;
}

/** What became of the reservation: the contract's ReleasedReservation. */
export interface ReleasedAnswer {
  readonly id: string;
  readonly state: "released" | "expired" | "consumed";
  /** The caller's own drop that used it, when it was consumed (T20). */
  readonly dropId: string | null;
  /** The caller's own allowance in the reservation's day (T15). */
  readonly allowance: Allowance;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly string[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const STATES = ["live", "released", "expired", "consumed"] as const;

interface SlotRow {
  readonly day: string;
  readonly interval: string;
  readonly state: (typeof STATES)[number];
  readonly dropId: string | null;
}

function slotOf(row: Readonly<Record<string, unknown>> | undefined): SlotRow | null {
  if (row === undefined) return null;
  const { occurrence_id: day, interval_id: interval, state, drop_id: dropId } = row;
  if (
    typeof day !== "string" ||
    typeof interval !== "string" ||
    typeof state !== "string" ||
    !(STATES as readonly string[]).includes(state) ||
    !(dropId === null || typeof dropId === "string")
  ) {
    throw new Error("drops: a reservation came back in a shape the command doesn't know");
  }
  return { day, interval, state: state as SlotRow["state"], dropId };
}

/** Gives back the caller's reservation, in `tx`, and says what became of it. Throws `Refused`. */
export async function releaseReservation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: ReleaseReservationInput,
): Promise<ReleasedAnswer> {
  const { userId, reservationId } = input;
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("drops: the caller is an account id");
  if (typeof reservationId !== "string") throw new TypeError("drops: the reservation is an id");
  // An id that can't be one names no reservation, as one nobody has.
  if (!ID.test(reservationId)) throw new Refused("NOT_FOUND");

  // 1. Whose it is, with no lock.
  const first = await clock.sample(tx);
  const seen = slotOf(
    (
      await bound(tx)`
        SELECT occurrence_id, interval_id, state, drop_id FROM app.reservations WHERE id = ${reservationId}`
    )[0],
  );
  if (seen === null) throw new Refused("NOT_FOUND");
  const facts = await loadAddTarget(tx, userId, seen.day);
  if (!ownsReservation(facts, seen, first)) throw new Refused("NOT_FOUND");

  // 2. The locks.
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${facts.day.clubId} FOR SHARE`;
  await bound(tx)`SELECT id FROM app.occurrences WHERE id = ${facts.day.id} FOR SHARE`;
  await bound(tx)`SELECT interval_id FROM app.memberships WHERE interval_id = ${seen.interval} FOR SHARE`;
  const key: CounterKey = { day: seen.day, interval: seen.interval, club: facts.day.clubId };
  await lockCounter(tx, key);
  await bound(tx)`SELECT id FROM app.reservations WHERE id = ${reservationId} FOR NO KEY UPDATE`;

  // 3. The clock, and step 1 again.
  const at = await clock.sample(tx);
  const again = await loadAddTarget(tx, userId, seen.day);
  if (!ownsReservation(again, seen, at)) throw new Refused("NOT_FOUND");
  const isStar = seen.interval === again.day.starInterval;

  // 4. Lapses settled, then the slot given back if it is still live.
  let row = await settleLapsed(tx, key, at);
  const now = slotOf(
    (
      await bound(tx)`
        SELECT occurrence_id, interval_id, state, drop_id FROM app.reservations WHERE id = ${reservationId}`
    )[0],
  );
  if (now === null) throw new Error("drops: the reservation this command holds is gone");
  let state = now.state;
  if (state === "live") {
    row = await freeSlot(tx, key, reservationId, at);
    state = "released";
  }

  // 5. The answer.
  return {
    id: reservationId,
    state,
    dropId: state === "consumed" ? now.dropId : null,
    allowance: allowanceOf(row, isStar),
  };
}
