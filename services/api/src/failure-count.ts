// The API's 5xx answers, counted for the founder's alert (the outside audit's B7; FQ150; packages/domain/src/
// failure-count.ts; docs/plans/api-b2-failure-alerts.md, section 1.2). Fly keeps no history of the log a check could
// read later, so each 5xx is counted in `app.failure_counts`, by the code `failed` gives it (app.ts: the error's class
// and code, as its log line shows them) or, for a 503 with no error of the server's own behind it (Storage or the
// sign-in keys away), by its status and operation (`503:createUpload`). The health check's 503 isn't counted
// (UNCOUNTED): Fly's proxy asks for it every 15 seconds, no person waits on it, and the database it found away is the
// one a count would be written to; the requests people make meanwhile are counted by their own 5xx.
//
// The count never touches the answer: it is made in Fastify's `onResponse` hook, once the answer has gone, and
// nothing waits for it. One write is under way at a time, one statement on the API's own pool, outside any
// transaction (a route's transaction stays the route's alone), and the counts that come meanwhile are summed into the
// next one, so a storm of 500s, or a database that is the reason for them, holds at most one of the pool's
// connections for its counts. The statement waits only on the same rows' locks, which the other writers hold for a
// transaction under their own limits (0020's header), and the role's own limits bound it too
// (db/migrations/0018_role_time_limits.sql). A write that fails is logged ("failure not
// counted", by its error's class and code alone) and its counts are kept for the next write, which the next failure
// starts: a database that is away isn't asked again in a loop. While writes fail, the counts held are bounded by
// PENDING_CODES. A count the process holds when it stops is lost; the log line of its failure stays (logging.ts).

import { countFailures, FAILURE_CODE } from "@tadayo/domain";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ApiSql } from "./connection.ts";
import { safeError } from "./logging.ts";

/** The operations whose 5xx isn't counted: the health check's, Fly's own (the header). */
export const UNCOUNTED: ReadonlySet<string> = new Set(["getHealth"]);

/** The most codes held while no write gets through; a further code is counted as `unknown`. */
export const PENDING_CODES = 256;

export interface FailureCounter {
  /** Counts one failure under `code`, never throwing and never waiting. */
  count(code: string): void;
}

/** The code a failure is counted under: its error's class and code, as `safeError` gives them to the log. */
export function failureCode(error: unknown): string {
  const { type, code } = safeError(error);
  return code === undefined ? type : `${type}:${code}`;
}

/** A counter writing through the pool `sql`, one write at a time, logging what it couldn't write on `log`. */
export function failureCounter(sql: ApiSql, log: FastifyBaseLogger): FailureCounter {
  const pending = new Map<string, number>();
  let writing = false;

  const hold = (code: string, n: number): void => {
    const key = pending.has(code) || pending.size < PENDING_CODES ? code : "unknown";
    pending.set(key, (pending.get(key) ?? 0) + n);
  };

  const write = async (): Promise<void> => {
    const batch = new Map(pending);
    pending.clear();
    writing = true;
    try {
      await countFailures(sql, "api", batch);
    } catch (error) {
      let kept = 0;
      for (const [code, n] of batch) {
        hold(code, n);
        kept += n;
      }
      log.warn({ err: error, kept }, "failure not counted");
      writing = false;
      return;
    }
    writing = false;
    // What came while this write was under way.
    if (pending.size > 0) void write();
  };

  return {
    count(code) {
      hold(FAILURE_CODE.test(code) ? code : "unknown", 1);
      if (!writing) void write();
    },
  };
}

/**
 * Counts every answer of 500 and above but the health check's, once it has gone (`onResponse`): by the code `failed`
 * set on the request, or by its status and the contract's operation.
 */
export function countEachFailure(app: FastifyInstance, counter: FailureCounter): void {
  app.decorateRequest("failure", null);
  app.addHook("onResponse", (request, reply, done) => {
    const operation = request.routeOptions.config.operation;
    if (reply.statusCode >= 500 && !(operation !== undefined && UNCOUNTED.has(operation))) {
      counter.count(request.failure ?? `${String(reply.statusCode)}:${operation ?? "none"}`);
    }
    done();
  });
}
