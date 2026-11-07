/// <reference lib="esnext.temporal" />
// The API's connection to Postgres (TECH-DESIGN section 5): as `tadayo_app`, through the URL the
// configuration gives (Supabase's session pooler on `dev` and `prod`), with the time module's
// INSTANT_TYPE for every `timestamptz`, so an instant crosses whole, to the microsecond, as a
// Temporal.Instant both ways (T1, T3).

import { INSTANT_TYPE } from "@tadayo/domain";
import postgres from "postgres";

export type ApiSql = postgres.Sql<{ instant: Temporal.Instant }>;

export function connect(url: string): ApiSql {
  return postgres(url, { types: { instant: INSTANT_TYPE } });
}
