/// <reference lib="esnext.temporal" />
// The API's connection to Postgres (TECH-DESIGN section 5): as `tadayo_app`, through the URL the
// configuration gives (Supabase's session pooler on `dev` and `prod`), with the time module's
// INSTANT_TYPE for every `timestamptz`, so an instant crosses whole, to the microsecond, as a
// Temporal.Instant both ways (T1, T3). The link is encrypted whatever the URL says, unless its
// host is a plainly written loopback one (transportOptions: the pooler's string carries no
// `sslmode`, and the code doesn't rely on one).

import { INSTANT_TYPE, transportOptions } from "@tadayo/domain";
import postgres from "postgres";

export type ApiSql = postgres.Sql<{ instant: Temporal.Instant }>;

/**
 * The most connections the API opens; postgres.js queues the rest (the outside audit's A7). Supabase's session
 * pooler gives each one a server connection of its own from a pool of 15 by default: two APIs during a rolling
 * deploy, the worker's two (services/worker/src/connection.ts) and one for a migration or an `ops` script
 * fit in it (docs/plans/api-b2-db-limits.md, section 0.5). Each request holds one for milliseconds, and
 * every wait on the database is bounded (TRANSACTION_LIMITS, and the role's own limits).
 */
export const API_POOL = 6;

/**
 * The limits every transaction of the API sets for itself as its first statement, as the worker's do
 * (services/worker/src/generation.ts `LOCK_WAIT_MS`, `STATEMENT_MS`): a lock waited on for 5 s and a statement run
 * for 10 s end it, and `failed` (app.ts) answers the bare 503 (the outside audit's A7). The role carries the same
 * as its session defaults (db/migrations/0018_role_time_limits.sql), but a role's defaults reach only a server
 * session that starts after them, and Supabase's session pooler hands its sessions from one client to the next,
 * and a connection string's startup parameters replace them; these hold whatever the session is. `SET LOCAL`, in
 * one simple-protocol message: one round trip, no snapshot taken, allowed in a read-only transaction.
 */
export const TRANSACTION_LIMITS = "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'";

export function connect(url: string): ApiSql {
  const sql: ApiSql = postgres(url, { max: API_POOL, types: { instant: INSTANT_TYPE }, ...transportOptions(url) });
  const begin = sql.begin.bind(sql) as (...args: unknown[]) => Promise<unknown>;
  // Every `begin` of the API, with or without its options ("read only"), takes the limits before its body runs.
  // A body may return an array of queries, which postgres.js runs inside the transaction before its commit; the
  // async wrapper hides the array from postgres.js, so it runs them itself, as postgres.js would.
  sql.begin = ((...args: unknown[]) => {
    const body = args.at(-1) as (tx: postgres.TransactionSql<{ instant: Temporal.Instant }>) => unknown;
    return begin(...args.slice(0, -1), async (tx: postgres.TransactionSql<{ instant: Temporal.Instant }>) => {
      await tx.unsafe(TRANSACTION_LIMITS).simple();
      const result = body(tx);
      return Array.isArray(result) ? Promise.all(result) : result;
    });
  }) as ApiSql["begin"];
  return sql;
}
