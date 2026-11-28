// Rows kept for good. A table whose rows a trigger never lets go (an audit trail, a sealed
// audience, a decision, a confirmed day, a highlight's version) refuses TRUNCATE too, with a
// trigger of its own, so no TRUNCATE, cascading or not, gets round the refused DELETE (T8, T22,
// T25, T28; review findings schema 10 and tests 2 of PR #17).

import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack } from "./harness.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

// pg_trigger.tgtype's bits (src/include/catalog/pg_trigger.h).
const ROW = 1;
const BEFORE = 2;
const DELETE = 8;
const TRUNCATE = 32;

interface Kept {
  name: string;
  refusesTruncate: boolean;
  referenced: boolean;
}

async function kept(): Promise<Kept[]> {
  return app<Kept[]>`
    SELECT c.relname AS name,
           EXISTS (SELECT FROM pg_catalog.pg_trigger t
                    WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
                      AND t.tgtype & ${TRUNCATE} <> 0 AND t.tgtype & ${BEFORE} <> 0 AND t.tgtype & ${ROW} = 0
                      AND t.tgfoid = 'app.refuse_change'::regproc) AS "refusesTruncate",
           EXISTS (SELECT FROM pg_catalog.pg_constraint f WHERE f.contype = 'f' AND f.confrelid = c.oid) AS referenced
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'app'::regnamespace AND c.relkind = 'r'
       AND EXISTS (SELECT FROM pg_catalog.pg_trigger t
                    WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
                      AND t.tgtype & ${DELETE} <> 0 AND t.tgtype & ${BEFORE} <> 0 AND t.tgtype & ${ROW} <> 0)
     ORDER BY 1
  `;
}

describe("rows kept for good can't be truncated", () => {
  it("gives every table that refuses a DELETE a trigger that refuses TRUNCATE", async () => {
    const tables = await kept();
    expect(tables.map((table) => table.name)).toEqual([
      "candidates",
      "clubs",
      "comment_removals",
      "comments",
      "deletion_tombstones",
      "drop_audience",
      "drop_removals",
      "drops",
      "failure_counts",
      "highlights",
      "invitations",
      "memberships",
      "moderation_cases",
      "occurrences",
      "operator_actions",
      "roster_approvals",
      "roster_revision_candidates",
      "roster_revision_members",
      "roster_revisions",
      "schedule_assignments",
      "schedule_proposal_days",
      "schedule_proposal_members",
      "schedule_proposals",
      "schedule_versions",
    ]);
    for (const table of tables) expect(table, table.name).toMatchObject({ refusesTruncate: true });
  });

  it("refuses TRUNCATE on each such table that no foreign key references, by its own trigger", async () => {
    const leaves = (await kept()).filter((table) => !table.referenced).map((table) => table.name);
    expect(leaves).toContain("highlights");
    expect(leaves).toContain("roster_approvals");
    expect(leaves).toContain("schedule_assignments");
    await rolledBack(app, async (tx) => {
      for (const name of leaves) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`TRUNCATE ${sp("app")}.${sp(name)}`,
          new RegExp(`^app\\.${name}: truncate refused`),
        );
      }
    });
  });

  // A cascading TRUNCATE fires the named table's own trigger before those of the tables it
  // reaches, so each table's message shows its own trigger refused it.
  it("refuses a cascading TRUNCATE on every such table, by the table's own trigger", async () => {
    const names = (await kept()).map((table) => table.name);
    expect(names).toContain("clubs");
    await rolledBack(app, async (tx) => {
      for (const name of names) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`TRUNCATE ${sp("app")}.${sp(name)} CASCADE`,
          new RegExp(`^app\\.${name}: truncate refused`),
        );
      }
    });
  });
});
