/// <reference lib="esnext.temporal" />
// The worker's connection to Postgres (TECH-DESIGN section 5), made as the API's is: as
// `tadayo_app`, through the configuration's URL, with the time module's INSTANT_TYPE for every
// `timestamptz`, so an instant crosses whole, to the microsecond (T1, T3), and encrypted whatever the
// URL says, unless its host is a plainly written loopback one (transportOptions). A notice Postgres
// sends is dropped: the driver would print it whole, and a notice can quote a row's values (T52).

import { INSTANT_TYPE, transportOptions } from "@tadayo/domain";
import postgres from "postgres";

export type WorkerSql = postgres.Sql<{ instant: Temporal.Instant }>;
/** A transaction on the worker's connection. */
export type WorkerTx = postgres.TransactionSql<{ instant: Temporal.Instant }>;

/**
 * The most connections the worker opens (the outside audit's A7): its two loops, generation and the outbox
 * (main.ts), each run one transaction at a time. With the API's six it fits Supabase's session pool
 * (services/api/src/connection.ts `API_POOL`; docs/plans/api-b2-db-limits.md, section 0.5).
 */
export const WORKER_POOL = 2;

export function connect(url: string): WorkerSql {
  return postgres(url, {
    max: WORKER_POOL,
    types: { instant: INSTANT_TYPE },
    onnotice: () => undefined,
    ...transportOptions(url),
  });
}
