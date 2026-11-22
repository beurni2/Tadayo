/// <reference lib="esnext.temporal" />
// One contributor's counter in one day, under its row lock (spec 11, 31; T3, T17, T18; TECH-DESIGN section 5
// and 6; db/migrations/0006_contributions.sql, 0010_allowance_by_role.sql). The counter's row is what
// serializes the allowance: every command that takes or gives back a slot holds it `FOR NO KEY UPDATE`, in the
// fixed order (club, occurrence, membership intervals, counter, then a reservation or a drop), and samples the clock
// only after it, so two devices racing for the last slot are put in order and the second sees the first's
// slot (Q10). The row's CHECKs on each role's limits are only the last guard behind that (T17).
//
// A reservation lapses at its `expires_at` with nothing to run (T18): `settleLapsed`, under the lock and with
// the clock's sample after it, marks the counter's live reservations whose time has come `expired`, ended at
// their own `expires_at`, and takes them off the counts, in one statement, before anything reads them. It is
// the only writer of that state, so the counts are always the live reservations', and a lapsed slot counts
// for nothing from its `expires_at` on, whether or not anyone has asked since (createDrop's "a reservation
// that has lapsed counts as none"). A job that purges lapsed uploads (B3) settles through it too.
//
// The counter's limits are written once, by its own BEFORE INSERT trigger, from the day's star interval and
// the row's (0010), never from here.

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import type { CounterRow, MediaClass } from "./allowance.ts";

/** Whose counter, in which day: a membership interval's in one occurrence of one club (ND04). */
export interface CounterKey {
  readonly day: string;
  readonly interval: string;
  readonly club: string;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`counter: ${what} came back as no count`);
  return value;
}

function rowOf(row: Readonly<Record<string, unknown>> | undefined): CounterRow {
  if (row === undefined) throw new Error("counter: the row this command holds is gone");
  return {
    committedTotal: count(row["committed_total"], "committed_total"),
    committedExternal: count(row["committed_external"], "committed_external"),
    reservedTotal: count(row["reserved_total"], "reserved_total"),
    reservedExternal: count(row["reserved_external"], "reserved_external"),
    totalLimit: count(row["total_limit"], "total_limit"),
    photoLimit: count(row["photo_limit"], "photo_limit"),
    externalLimit: count(row["external_limit"], "external_limit"),
  };
}

/**
 * Makes the counter's row if it has none, and takes its lock, `FOR NO KEY UPDATE`, until the transaction ends.
 * Two commands making the same row at once queue on its key, and the second finds the first's. The lock is
 * the weaker of the two exclusive ones: the row's key never changes (`contribution_counters_keep`), and it
 * conflicts with itself and `FOR SHARE` as `FOR UPDATE` does, but not with the `FOR KEY SHARE` a foreign key
 * check takes (a drop, a highlight or a reservation naming the counter), so a commit that inserts one of those
 * and then waits for the lock can't deadlock with a command that holds it.
 */
export async function lockCounter(tx: QuerySql, key: CounterKey): Promise<void> {
  await bound(tx)`
    INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id)
    VALUES (${key.day}, ${key.interval}, ${key.club})
    ON CONFLICT (occurrence_id, interval_id) DO NOTHING`;
  const rows = await bound(tx)`
    SELECT 1 AS held FROM app.contribution_counters
     WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval} AND club_id = ${key.club}
       FOR NO KEY UPDATE`;
  if (rows.length !== 1) throw new Error("counter: no row to hold");
}

/**
 * Settles the counter's lapsed reservations at `at`, the clock's sample after its lock, and returns the row as
 * it then stands: each live reservation whose `expires_at` is at or before `at` becomes `expired`, ended at its
 * own `expires_at`, and leaves the counts. The caller holds the lock (`lockCounter`).
 */
export async function settleLapsed(tx: QuerySql, key: CounterKey, at: Temporal.Instant): Promise<CounterRow> {
  const settled = await bound(tx)`
    WITH lapsed AS (
      UPDATE app.reservations SET state = 'expired', ended_at = expires_at
       WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}
         AND state = 'live' AND expires_at <= ${at}::pg_catalog.timestamptz
      RETURNING media_class
    )
    UPDATE app.contribution_counters
       SET reserved_total = reserved_total - (SELECT pg_catalog.count(*) FROM lapsed)::pg_catalog.int2,
           reserved_external = reserved_external
             - (SELECT pg_catalog.count(*) FROM lapsed WHERE media_class = 'external_video')::pg_catalog.int2
     WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}
       AND EXISTS (SELECT FROM lapsed)
    RETURNING committed_total, committed_external, reserved_total, reserved_external,
              total_limit, photo_limit, external_limit`;
  if (settled[0] !== undefined) return rowOf(settled[0]);
  const rows = await bound(tx)`
    SELECT committed_total, committed_external, reserved_total, reserved_external,
           total_limit, photo_limit, external_limit
      FROM app.contribution_counters
     WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}`;
  return rowOf(rows[0]);
}

/** A slot just held. */
export interface HeldSlot {
  readonly id: string;
  readonly row: CounterRow;
}

/**
 * Holds one slot of `media` in the counter, live from `at` until `expiresAt`, made by the request whose
 * Idempotency-Key is `requestKey` (T19: the reservation's own last guard, `UNIQUE (interval_id,
 * request_key)`), and counts it. The caller holds the lock and has checked the limits.
 */
export async function holdSlot(
  tx: QuerySql,
  key: CounterKey,
  slot: {
    readonly media: MediaClass;
    readonly at: Temporal.Instant;
    readonly expiresAt: Temporal.Instant;
    readonly requestKey: string;
  },
): Promise<HeldSlot> {
  const id = newId("rsv");
  await bound(tx)`
    INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
    VALUES (${id}, ${key.day}, ${key.interval}, ${slot.media}, ${slot.requestKey}::pg_catalog.uuid,
            ${slot.at}::pg_catalog.timestamptz, ${slot.expiresAt}::pg_catalog.timestamptz)`;
  const external = slot.media === "external_video" ? "1" : "0";
  const rows = await bound(tx)`
    UPDATE app.contribution_counters
       SET reserved_total = reserved_total + 1,
           reserved_external = reserved_external + ${external}::pg_catalog.int2
     WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}
    RETURNING committed_total, committed_external, reserved_total, reserved_external,
              total_limit, photo_limit, external_limit`;
  return { id, row: rowOf(rows[0]) };
}

/**
 * Gives back the live reservation `id` of the counter at `at`: `released`, ended then, and off the counts.
 * Returns the row as it then stands, or throws when the reservation isn't live in this counter, which the
 * caller has read under the lock.
 */
export async function freeSlot(tx: QuerySql, key: CounterKey, id: string, at: Temporal.Instant): Promise<CounterRow> {
  const rows = await bound(tx)`
    WITH freed AS (
      UPDATE app.reservations SET state = 'released', ended_at = ${at}::pg_catalog.timestamptz
       WHERE id = ${id} AND occurrence_id = ${key.day} AND interval_id = ${key.interval} AND state = 'live'
      RETURNING media_class
    )
    UPDATE app.contribution_counters
       SET reserved_total = reserved_total - 1,
           reserved_external = reserved_external
             - (SELECT pg_catalog.count(*) FROM freed WHERE media_class = 'external_video')::pg_catalog.int2
     WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}
       AND EXISTS (SELECT FROM freed)
    RETURNING committed_total, committed_external, reserved_total, reserved_external,
              total_limit, photo_limit, external_limit`;
  if (rows[0] === undefined) throw new Error("counter: the reservation to give back isn't live in this counter");
  return rowOf(rows[0]);
}
