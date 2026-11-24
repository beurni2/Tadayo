// `GET /v1/health` (the contract's `getHealth`; the outside audit's A7; docs/plans/api-b2-health-check.md): Fly's
// health check (fly.toml), which the app never calls. One `SELECT 1` through the API's own pool, outside a
// transaction: 204 with nothing in it when it comes back, and the bare 503 when it fails or hasn't come back
// within HEALTH_MS. Through the pool, so a pool whose every connection is taken, the stall A7 proved, fails the
// check too: the query waits for a connection, or behind a statement already running on one, and the bound ends
// the wait. The role's statement limit bounds only a statement that runs, never that wait, so the bound is this
// handler's own timer.
//
// One probe at a time: a check that comes while a `SELECT 1` is still out waits on that one, so however many checks
// time out during a stall, the pool holds one of them, which runs when a connection is free and is then dropped.
// The route is public and has no rate limit yet, so without this a flood during a stall would queue one query per
// call in postgres.js, with no bound (docs/LIMITATIONS.md, 2026-11-24).
//
// It reads no table and writes nothing, so every caller, signed in or not, gets the same answer from the same
// database (T14). Each check that sees a failure logs it once, by the error's class and code alone (logging.ts's
// `err`), never its message, which can quote a row or an address (T52); a probe that fails after every check on
// it gave up is logged by none.

import { noContent, unavailable } from "./answers.ts";
import type { Deps, Handler } from "./deps.ts";

/**
 * How long the check waits for the database, in milliseconds: under Fly's 3 s check timeout (fly.toml), so the
 * API's own answer is the one Fly reads; a `SELECT 1` on a free connection takes about a millisecond.
 */
export const HEALTH_MS = 2_000;

/** A probe's outcome as a value, never a rejection, so any number of checks can wait on the one probe. */
type Outcome = "answered" | { readonly error: unknown };

export function getHealthHandler(deps: Deps): Handler {
  let probe: Promise<Outcome> | undefined;
  const ask = (): Promise<Outcome> => {
    probe ??= deps.sql`SELECT 1`
      .then(
        (): Outcome => "answered",
        (error: unknown): Outcome => ({ error }),
      )
      .finally(() => {
        probe = undefined;
      });
    return probe;
  };
  return async (request, reply) => {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<"late">((resolve) => {
      timer = setTimeout(() => {
        resolve("late");
      }, HEALTH_MS);
    });
    let outcome: Outcome | "late";
    try {
      outcome = await Promise.race([ask(), late]);
    } finally {
      clearTimeout(timer);
    }
    if (outcome === "answered") return noContent(reply);
    if (outcome === "late") request.log.warn("database slow");
    else request.log.warn({ err: outcome.error }, "database unreachable");
    return unavailable(reply);
  };
}
