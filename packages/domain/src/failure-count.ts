// The failures the founder is told of (the outside audit's B7; FQ150; spec 34; db/migrations/0020_failure_counts.sql;
// docs/plans/api-b2-failure-alerts.md, section 1.1): the API counts each 5xx it answers (services/api/src/
// failure-count.ts) and the worker each outbox event that dies (services/worker/src/outbox.ts), and a check every 15
// minutes tells the founder what is new (tools/ops/src/failure-alert.ts). A count is a source, a code and a number,
// never an id, a name, a date or a message (T52), and a running total, so nothing here reads a clock (T1).

import type { QuerySql } from "./authorization/read-sql.ts";
import { InputFault } from "./fault.ts";

/** Who counts: the API and the worker (0020's `source`). */
export const FAILURE_SOURCES = ["api", "worker"] as const;
export type FailureSource = (typeof FAILURE_SOURCES)[number];

/**
 * A code as `app.failure_counts` takes it (0020): `app.outbox_events.last_error`'s alphabet and length (0009). It
 * can't hold a space, an `@`, a `/` or a `|`, so a code is never an address, a URL or a break in a Markdown table.
 */
export const FAILURE_CODE = /^[A-Za-z0-9_.:-]{1,200}$/;

/**
 * Adds `counts` (code to how many failures) to `source`'s running totals, in one statement in the caller's
 * transaction or pool: a code's first failure makes its row. The codes go in their "C" order, the order the check
 * marks them in (0020's header), so two writers never take the same rows' locks the other way round.
 */
export async function countFailures(
  sql: QuerySql,
  source: FailureSource,
  counts: ReadonlyMap<string, number>,
): Promise<void> {
  if (!(FAILURE_SOURCES as readonly string[]).includes(source))
    throw new InputFault("failure_count_1", "failures: a count's source is the API or the worker");
  for (const [code, n] of counts) {
    // Neither the code nor the number is quoted: a code that isn't one could be anything.
    if (!FAILURE_CODE.test(code))
      throw new InputFault("failure_count_2", "failures: a code is letters, digits and _ . : -, 200 at most");
    if (!Number.isSafeInteger(n) || n < 1)
      throw new InputFault("failure_count_3", "failures: a count is a whole number from 1");
  }
  if (counts.size === 0) return;
  const ordered = [...counts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // Bound as text and cast, so that postgres.js sends the object's text, not a JSON string of it.
  const json = JSON.stringify(Object.fromEntries(ordered.map((code) => [code, counts.get(code)])));
  const bind = sql as (template: TemplateStringsArray, ...values: readonly string[]) => PromiseLike<unknown>;
  await bind`
    INSERT INTO app.failure_counts AS f (source, code, total)
    SELECT ${source}, key, value::pg_catalog.int8
      FROM pg_catalog.jsonb_each_text(${json}::pg_catalog.text::pg_catalog.jsonb)
     ORDER BY key COLLATE "C"
    ON CONFLICT (source, code) DO UPDATE SET total = f.total + EXCLUDED.total`;
}
