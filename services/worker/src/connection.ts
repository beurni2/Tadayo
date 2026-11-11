/// <reference lib="esnext.temporal" />
// The worker's connection to Postgres (TECH-DESIGN section 5), made as the API's is: as
// `tadayo_app`, through the configuration's URL, with the time module's INSTANT_TYPE for every
// `timestamptz`, so an instant crosses whole, to the microsecond (T1, T3), and encrypted whatever the
// URL says, unless its host is a plainly written loopback one (transportOptions).

import { INSTANT_TYPE, transportOptions } from "@tadayo/domain";
import postgres from "postgres";

export type WorkerSql = postgres.Sql<{ instant: Temporal.Instant }>;

export function connect(url: string): WorkerSql {
  return postgres(url, { types: { instant: INSTANT_TYPE }, ...transportOptions(url) });
}
