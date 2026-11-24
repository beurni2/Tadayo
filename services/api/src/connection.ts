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
 * every wait on the database is bounded by the role's limits (db/migrations/0018_role_time_limits.sql).
 */
export const API_POOL = 6;

export function connect(url: string): ApiSql {
  return postgres(url, { max: API_POOL, types: { instant: INSTANT_TYPE }, ...transportOptions(url) });
}
