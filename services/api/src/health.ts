// `GET /v1/health` (the contract's `getHealth`; the outside audit's A7; docs/plans/api-b2-health-check.md): Fly's
// health check (fly.toml), which the app never calls. One `SELECT 1` through the API's own pool, outside a
// transaction: 204 with nothing in it when it comes back, and the bare 503 when it fails or hasn't come back
// within HEALTH_MS. Through the pool, so a pool whose every connection is taken, the stall A7 proved, fails the
// check too: the query waits for a connection and the bound ends the wait. The role's statement limit bounds only
// a statement that runs, never that wait, so the bound is this handler's own timer.
//
// It reads no table and writes nothing, so every caller, signed in or not, gets the same answer from the same
// database (T14). A failure is logged once, by the error's class and code alone (logging.ts's `err`), never its
// message, which can quote a row or an address (T52). The query the timer gave up on stays queued for a
// connection and runs when one is free: it takes no lock and holds its connection for one round trip, and what it
// comes back with is dropped.

import { noContent, unavailable } from "./answers.ts";
import type { Deps, Handler } from "./deps.ts";

/**
 * How long the check waits for the database, in milliseconds: under Fly's 3 s check timeout (fly.toml), so the
 * API's own answer is the one Fly reads; a `SELECT 1` on a free connection takes about a millisecond.
 */
export const HEALTH_MS = 2_000;

export function getHealthHandler(deps: Deps): Handler {
  return async (request, reply) => {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => {
        resolve("late");
      }, HEALTH_MS);
    });
    // Settled either way, so a query that fails after the timer won is never an unhandled rejection.
    const asked = deps.sql`SELECT 1`.then(
      () => "answered" as const,
      (error: unknown) => ({ error }),
    );
    let outcome: Awaited<typeof asked> | "late";
    try {
      outcome = await Promise.race([asked, late]);
    } finally {
      clearTimeout(timer);
    }
    if (outcome === "answered") return noContent(reply);
    if (outcome === "late") request.log.warn("database slow");
    else request.log.warn({ err: outcome.error }, "database unreachable");
    return unavailable(reply);
  };
}
