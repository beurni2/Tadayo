/// <reference lib="esnext.temporal" />
// `dev-clock`: makes `app.dev_clock` on `dev` when it's missing and moves it forward (docs/plans/
// B0.md, slice 10a; ADR-013; T3, T53). The table is the offset `dev`'s server clock adds to
// Postgres's own, so a gate can show the 7 AM reveal, the 1 AM close and a cutoff race on demand
// (tools/ops/sql/dev_clock.sql, packages/domain/src/time/clock.ts).
//
// This runs inside the transaction its caller opened, as `tadayo_app`, which the file refuses to be
// made by anyone else. It never drops the table, disables a trigger or replaces the function, which
// the table's owner could; the only statements that change the table are the file's own `CREATE`s,
// when the table is missing, and the one upsert of its row.
//   - It refuses first if the schema `app` isn't closed (`closedProblems`), so it never works on a
//     database a migration left open.
//   - It makes the table only when its caller gives it the file that makes it, and only on a
//     database that has no occurrence. `dev-clock` gives it the file, from the repository;
//     `spike-time`, on the API's Machine, whose image has no `tools/ops/sql`, doesn't, so it moves
//     only a table that is there. A table missing from a database that has days in it may have been
//     dropped after the clock moved, and a new one starts at no offset, which is a clock moved back:
//     a day that had opened would take new drops, and a day that had closed would reopen (T3).
//   - A move is to an instant, never by an amount, so running the same command twice can't move the
//     clock twice. The new offset is the instant less Postgres's own clock, to the microsecond.
//     It only grows (the table's triggers refuse anything else, and this says why first) and it
//     may not run more than `LONGEST_OFFSET_DAYS` ahead of Postgres's clock: it never comes back,
//     so a typo in the year would otherwise stay.
//   - After it, the table is checked as the API checks it at start-up (`prepareClock('dev')`), so a
//     clock this leaves is one `dev`'s API starts on, and the schema is checked closed again.

import { prepareClock } from "@tadayo/domain";
import type postgres from "postgres";
import { closedProblems } from "./migrate.ts";
import { OpsError } from "./ops-error.ts";

/** The furthest the dev clock may run ahead of Postgres's own, in days: it never moves back. */
export const LONGEST_OFFSET_DAYS = 366;
const MICROSECONDS_PER_DAY = 86_400_000_000n;

export interface DevClockOptions {
  /**
   * The text of `tools/ops/sql/dev_clock.sql`, which makes the table when it's missing. Without it,
   * a missing table is refused and nothing is made.
   */
  readonly makeSql?: string;
  /** Move the clock forward to this instant. Without it the clock is only reported. */
  readonly to?: Temporal.Instant;
}

export interface DevClockReport {
  /** True when this run made the table. */
  readonly made: boolean;
  /** The offset after the run, in microseconds, and the one it found. */
  readonly offsetMicroseconds: bigint;
  readonly offsetBeforeMicroseconds: bigint;
  /** Postgres's own clock when the run read it, and what `dev`'s clock read at that moment. */
  readonly postgresNow: Temporal.Instant;
  readonly devNow: Temporal.Instant;
}

const instantOf = (microseconds: bigint) => Temporal.Instant.fromEpochNanoseconds(microseconds * 1000n);

/**
 * The offset that puts the dev clock at `target`, given the offset it has and Postgres's own clock
 * (epoch microseconds), or an OpsError if that would move the clock back or too far ahead.
 */
export function moveOffset(current: bigint, postgresNowMicroseconds: bigint, target: Temporal.Instant): bigint {
  const offset = target.epochNanoseconds / 1000n - postgresNowMicroseconds;
  if (offset < current) {
    throw new OpsError(
      `dev-clock: dev's clock reads ${instantOf(postgresNowMicroseconds + current).toString()} now, which is after ` +
        `${target.toString()}: the clock only moves forward (T3), so nothing is changed`,
    );
  }
  if (offset > BigInt(LONGEST_OFFSET_DAYS) * MICROSECONDS_PER_DAY) {
    throw new OpsError(
      `dev-clock: ${target.toString()} is more than ${String(LONGEST_OFFSET_DAYS)} days ahead of Postgres's own clock, ` +
        "and the dev clock never moves back, so nothing is changed: is the year right?",
    );
  }
  return offset;
}

function whole(value: unknown, what: string): bigint {
  if (typeof value !== "string" || !/^-?[0-9]{1,19}$/.test(value)) {
    throw new OpsError(`dev-clock: ${what} came back as ${String(value)}, not a whole number of microseconds`);
  }
  return BigInt(value);
}

// Every operator and type is pg_catalog's by name, as the clocks' samples are.
async function read(tx: postgres.TransactionSql): Promise<{ postgresNow: bigint; offset: bigint }> {
  const [row] = await tx<{ now_us: string; offset_us: string }[]>`
    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)
             ::pg_catalog.int8::pg_catalog.text AS now_us,
           coalesce((SELECT offset_microseconds FROM app.dev_clock), 0)::pg_catalog.text AS offset_us`;
  return { postgresNow: whole(row?.now_us, "Postgres's clock"), offset: whole(row?.offset_us, "the offset") };
}

/**
 * Makes the dev clock if it's missing, moves it to `options.to` if given, and reports it. `tx` is
 * the caller's transaction, which commits only if this returns.
 */
export async function devClock(tx: postgres.TransactionSql, options: DevClockOptions): Promise<DevClockReport> {
  const open = await closedProblems(tx);
  if (open.length > 0) {
    throw new OpsError(`dev-clock: the schema app isn't closed (T53), so nothing is changed: ${open.join("; ")}`);
  }
  const [exists] = await tx<{ present: boolean }[]>`
    SELECT EXISTS (SELECT FROM pg_catalog.pg_class c
                     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'app' AND c.relname = 'dev_clock') AS present`;
  if (typeof exists?.present !== "boolean") throw new OpsError("dev-clock: the check for app.dev_clock got no answer");
  const made = !exists.present;
  if (made && options.makeSql === undefined) {
    throw new OpsError("dev-clock: app.dev_clock is missing, and only `ops dev-clock` makes it, so nothing is changed");
  }
  if (made && options.makeSql !== undefined) {
    const [days] = await tx<{ any: boolean }[]>`SELECT EXISTS (SELECT FROM app.occurrences) AS any`;
    if (days?.any !== false) {
      throw new OpsError(
        "dev-clock: app.dev_clock is missing and the database has occurrences, so it isn't made again: a new one " +
          "starts at no offset, which could be the clock moved back, reopening a day that has closed (T3); " +
          "inspect the database",
      );
    }
    await tx.unsafe(options.makeSql);
  }
  // The checks the API runs at start-up on `dev`: the table is a table the owner can read, with its
  // three triggers on and row-level security as the file makes it (T53).
  try {
    await prepareClock("dev", tx);
  } catch (error) {
    throw new OpsError(`dev-clock: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  let reading = await read(tx);
  const before = reading.offset;
  if (options.to) {
    const offset = moveOffset(reading.offset, reading.postgresNow, options.to);
    await tx`
      INSERT INTO app.dev_clock (offset_microseconds) VALUES (${offset.toString()}::pg_catalog.int8)
      ON CONFLICT (only_row) DO UPDATE SET offset_microseconds = EXCLUDED.offset_microseconds`;
    reading = await read(tx);
  }
  const after = await closedProblems(tx);
  if (after.length > 0) {
    throw new OpsError(`dev-clock: would leave the schema app open (T53), so nothing is changed: ${after.join("; ")}`);
  }
  return {
    made,
    offsetMicroseconds: reading.offset,
    offsetBeforeMicroseconds: before,
    postgresNow: instantOf(reading.postgresNow),
    devNow: instantOf(reading.postgresNow + reading.offset),
  };
}
