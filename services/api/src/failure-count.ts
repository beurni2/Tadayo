// The API's 5xx answers, counted for the founder's alert (the outside audit's B7; FQ150; packages/domain/src/
// failure-count.ts; docs/plans/api-b2-failure-alerts.md, section 1.2). Fly keeps no history of the log a check could
// read later, so each 5xx is counted in `app.failure_counts`, by the code `failed` gives it (app.ts: the error's class
// and code, as its log line shows them) or, for a 503 with no error of the server's own behind it (Storage or the
// sign-in keys away), by its status and operation (`503:createUpload`). The health check's 503 isn't counted
// (UNCOUNTED): Fly's proxy asks for it every 15 seconds, no person waits on it, and the database it found away is the
// one a count would be written to; the requests people make meanwhile are counted by their own 5xx. Any other answer
// of the health check from 500 up is counted, as a fault of the server's own.
//
// The count never touches the answer: it is made in Fastify's `onSend` hook, as the answer goes out, and nothing waits
// for it. `onSend` runs for an answer whose client has already gone too, where `onResponse` doesn't (it waits for the
// answer to finish on the socket): a slow request that ends in a 503 after its person left is a failure all the same.
// Fastify's own 503 to a request that reaches it while it closes is written without hooks, and isn't counted.
//
// One write is under way at a time, a transaction of its own on the API's pool, so it takes the API's limits
// (connection.ts: TRANSACTION_LIMITS) and stays outside any route's transaction; the counts that come meanwhile are
// summed into the next one, so a storm of 500s, or a database that is the reason for them, holds at most one of the
// pool's connections for its counts. A write that fails is logged ("failure not counted", by its error's class and
// code alone) and its counts are kept, and written again after RETRY_FIRST_MS, then after twice as long each time up to
// RETRY_LAST_MS until a write gets through: a database that is away isn't asked in a loop, and the counts of an outage
// still reach the table once it is back, with no further failure needed to send them. While writes fail, the counts
// held are bounded by PENDING_CODES. A count the process holds when it stops is lost; the log line of its failure stays
// (logging.ts). A write whose commit went through but whose answer was lost on the way back is kept and written again,
// so a count is at least once, never lost to that (docs/LIMITATIONS.md, 2026-11-28).

import { countFailures, FAILURE_CODE } from "@tadayo/domain";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { ApiSql } from "./connection.ts";
import { safeError } from "./logging.ts";

/** The operations whose 503 isn't counted: the health check's, Fly's own (the header). */
export const UNCOUNTED: ReadonlySet<string> = new Set(["getHealth"]);

/** The most codes held while no write gets through; a further code is counted as `unknown`. */
export const PENDING_CODES = 256;

/** How long kept counts wait before they are written again, first and at most (the header). */
export const RETRY_FIRST_MS = 30_000;
export const RETRY_LAST_MS = 300_000;

export interface FailureCounter {
  /** Counts one failure under `code`, never throwing and never waiting. */
  count(code: string): void;
  /** Drops a write that waits to be tried again, as the app closes: what it held is lost, as at any stop. */
  stop(): void;
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
  let retry: NodeJS.Timeout | undefined;
  let wait = RETRY_FIRST_MS;

  const hold = (code: string, n: number): void => {
    const key = pending.has(code) || pending.size < PENDING_CODES ? code : "unknown";
    pending.set(key, (pending.get(key) ?? 0) + n);
  };

  const write = async (): Promise<void> => {
    const batch = new Map(pending);
    pending.clear();
    writing = true;
    try {
      await sql.begin((tx) => countFailures(tx, "api", batch));
    } catch (error) {
      let kept = 0;
      for (const [code, n] of batch) {
        hold(code, n);
        kept += n;
      }
      log.warn({ err: error, kept }, "failure not counted");
      writing = false;
      // Tried again on its own, later each time; the timer never keeps the process alive.
      retry = setTimeout(() => {
        retry = undefined;
        void write();
      }, wait);
      retry.unref();
      wait = Math.min(wait * 2, RETRY_LAST_MS);
      return;
    }
    writing = false;
    wait = RETRY_FIRST_MS;
    // What came while this write was under way.
    if (pending.size > 0) void write();
  };

  return {
    count(code) {
      hold(FAILURE_CODE.test(code) ? code : "unknown", 1);
      // While a write is under way, or kept counts wait to be tried again, this one joins them.
      if (!writing && retry === undefined) void write();
    },
    stop() {
      clearTimeout(retry);
      retry = undefined;
    },
  };
}

/**
 * Counts every answer of 500 and above but the health check's 503, as it goes out (`onSend`): by the code `failed`
 * set on the request, or by its status and the contract's operation.
 */
export function countEachFailure(app: FastifyInstance, counter: FailureCounter): void {
  app.decorateRequest("failure", null);
  app.addHook("onSend", (request, reply, payload, done) => {
    const status = reply.statusCode;
    const operation = request.routeOptions.config.operation;
    const healthCheck = status === 503 && operation !== undefined && UNCOUNTED.has(operation);
    if (status >= 500 && !healthCheck) {
      counter.count(request.failure ?? `${String(status)}:${operation ?? "none"}`);
    }
    done(null, payload);
  });
  app.addHook("onClose", (_instance, done) => {
    counter.stop();
    done();
  });
}
