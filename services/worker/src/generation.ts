// The worker's first job: the days each club's week makes (spec 05: "Generate upcoming occurrences
// several weeks ahead"; spec 34; FQ115). One pass visits every club that has a week and runs the domain's
// `makeDays` for it in a transaction of its own, so one club's failure undoes nothing of another's and
// stops no other club's days. The rule, the lock and the clock's sample are the domain's
// (packages/domain/src/schedule/make-days.ts): nothing here decides what a day is.
//
// No club can hold the others up. Each club's transaction waits at most LOCK_WAIT_MS for a lock (the
// club's row, which every schedule command takes) and gives each statement at most STATEMENT_MS; past
// either, that club's run fails, is reported, and the pass goes on to the next club. The club is tried
// again at the next pass. A pass told to stop finishes the club it is on and visits no other. The limits
// are each statement's, not the club's: a club's run is three statements and an insert for each day, so
// its worst case is longer than either number, though each statement is small. The read of the work list
// has no limit, and nothing here times out a connection that has gone silent. If a stop outlasts the 30
// seconds Fly gives (fly.toml, `kill_timeout`), Fly ends the process; every club's days are one
// transaction, so nothing is left half made (docs/LIMITATIONS.md).
//
// What it reports carries no content and names nobody (T52, T56): counts, and for a failure the club's
// opaque id (T52 allows opaque ids, and a failure nobody can trace to its club can't be put right), the
// error's class and its code, never its message, which Postgres fills with row values, and never the
// error itself, whose cause could carry the database URL.

import { clubsWithAWeek, makeDays, type Clock } from "@tadayo/domain";
import type { WorkerSql } from "./connection.ts";

/** The longest a club's run waits for a lock, in milliseconds. */
export const LOCK_WAIT_MS = 5_000;
/** The longest one statement of a club's run may take, in milliseconds. */
export const STATEMENT_MS = 10_000;

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface PassResult {
  /** Clubs visited. */
  readonly clubs: number;
  /** Days made, over all of them. */
  readonly made: number;
  /** Clubs whose run failed: each one's id, then `describeFailure`'s words. */
  readonly failures: readonly string[];
}

/** An error as the worker's lines may carry it: its class and its code, nothing it says. */
export function describeFailure(error: unknown): string {
  const name = error instanceof Error ? error.constructor.name : "a thrown value";
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code) ? `${name} ${code}` : name;
}

/**
 * One pass over `clubs`' ids (every club with a week, unless given): each club's days, in its own
 * transaction, under the two limits above. Once `stopping` answers true it visits no further club.
 * Throws only when the work list can't be read.
 */
export async function generationPass(
  sql: WorkerSql,
  clock: Clock,
  clubs: (sql: WorkerSql) => Promise<readonly string[]> = clubsWithAWeek,
  stopping: () => boolean = () => false,
): Promise<PassResult> {
  const ids = await clubs(sql);
  let visited = 0;
  let made = 0;
  const failures: string[] = [];
  for (const id of ids) {
    if (stopping()) break;
    visited += 1;
    try {
      made += await sql.begin(async (tx) => {
        await tx`
          SELECT pg_catalog.set_config('lock_timeout', ${`${String(LOCK_WAIT_MS)}ms`}, true),
                 pg_catalog.set_config('statement_timeout', ${`${String(STATEMENT_MS)}ms`}, true)`;
        return makeDays(tx, clock, id);
      });
    } catch (error) {
      // An id is the work list's, from the database; anything else isn't repeated.
      failures.push(`${ID.test(id) ? id : "a club with no id"}: ${describeFailure(error)}`);
    }
  }
  return { clubs: visited, made, failures };
}

/** The lines a pass writes, by where each goes: nothing when it made nothing and nothing failed. */
export function passLines(result: PassResult): { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  if (result.made > 0) out.push(`worker: made ${String(result.made)} ${result.made === 1 ? "day" : "days"}`);
  return { out, err: result.failures.map((failure) => `worker: a club's days failed: ${failure}`) };
}
