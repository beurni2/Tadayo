// Migrates the test database once, as `tadayo_app`, before any test file runs (ADR-015).

import { migrate } from "@tadayo/ops";
import { appSql, MIGRATIONS } from "./harness.ts";

export async function setup(): Promise<void> {
  const sql = appSql();
  try {
    await migrate(sql, MIGRATIONS);
  } finally {
    await sql.end();
  }
}
