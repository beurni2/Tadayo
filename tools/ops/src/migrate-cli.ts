// Applies db/migrations to the database at DATABASE_URL, which must connect as `tadayo_app`
// (`migrate.ts`). The `ops` workflow runs it against `dev` (docs/plans/B0.md, slice 10a).
//
//   DATABASE_URL=postgresql://tadayo_app:…@host:5432/postgres pnpm --filter @tadayo/ops migrate

import { join } from "node:path";
import postgres from "postgres";
import { migrate } from "./migrate.ts";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("migrate: set DATABASE_URL to connect as tadayo_app");
  process.exit(2);
}
// Postgres's warnings are shown, its routine notices (a table that already exists) aren't.
const sql = postgres(url, {
  max: 1,
  onnotice: (notice) => {
    if (notice["severity"] !== "NOTICE" && notice["severity"] !== "DEBUG" && notice["severity"] !== "LOG") {
      console.error(`migrate: ${String(notice["severity"])}: ${String(notice.message)}`);
    }
  },
});
try {
  const applied = await migrate(sql, join(import.meta.dirname, "..", "..", "..", "db", "migrations"), console.log);
  console.log(applied.length === 0 ? "migrate: nothing to apply" : `migrate: ${String(applied.length)} applied`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
