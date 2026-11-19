// The worker's first job: the days each club's week makes (spec 05: "Generate upcoming occurrences
// several weeks ahead"; spec 34; FQ115). One pass visits every club that has a week and runs the domain's
// `makeDays` for it in a transaction of its own, so one club's failure undoes nothing of another's and
// stops no other club's days. The rule, the lock and the clock's sample are the domain's
// (packages/domain/src/schedule/make-days.ts): nothing here decides what a day is.
//
// What it reports carries no content and names nobody (T52, T56): counts, and for a failure the error's
// class and its code, never its message, which Postgres fills with row values, and never the error itself,
// whose cause could carry the database URL.

import { clubsWithAWeek, makeDays, type Clock } from "@tadayo/domain";
import type { WorkerSql } from "./connection.ts";

export interface PassResult {
  /** Clubs visited. */
  readonly clubs: number;
  /** Days made, over all of them. */
  readonly made: number;
  /** Clubs whose run failed, each reported by `describeFailure` alone. */
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
 * transaction. Throws only when the work list can't be read.
 */
export async function generationPass(
  sql: WorkerSql,
  clock: Clock,
  clubs: (sql: WorkerSql) => Promise<readonly string[]> = clubsWithAWeek,
): Promise<PassResult> {
  const ids = await clubs(sql);
  let made = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      made += await sql.begin((tx) => makeDays(tx, clock, id));
    } catch (error) {
      failures.push(describeFailure(error));
    }
  }
  return { clubs: ids.length, made, failures };
}

/** The lines a pass writes: nothing when it made nothing and nothing failed. */
export function passLines(result: PassResult): string[] {
  const lines: string[] = [];
  if (result.made > 0) lines.push(`worker: made ${String(result.made)} ${result.made === 1 ? "day" : "days"}`);
  for (const failure of result.failures) lines.push(`worker: a club's days failed: ${failure}`);
  return lines;
}
