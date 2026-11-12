// A by-hand entry that applies db/migrations to a LOCAL Postgres (a developer's own, or CI's
// service) at DATABASE_URL, which must connect as `tadayo_app` (`migrate.ts`). It refuses any other
// host: `tadayo-dev` is migrated by `ops migrate` (`node tools/ops/src/main.ts migrate`, run.ts),
// which checks that the database is dev's, requires TLS and redacts what it prints, and this
// entry does none of those (docs/plans/B0.md, slice 10a).
//
//   DATABASE_URL=postgresql://tadayo_app:…@localhost:5432/postgres pnpm --filter @tadayo/ops migrate

import { join } from "node:path";
import { transportOptions } from "@tadayo/domain";
import postgres from "postgres";
import { migrate } from "./migrate.ts";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("migrate: set DATABASE_URL to connect as tadayo_app");
  process.exit(2);
}
// The database link asks for TLS of every host but a plainly written loopback one, so a host that
// would be given TLS is a host that isn't local.
if (transportOptions(url).ssl !== undefined) {
  console.error(
    "migrate: this entry is for a local Postgres, and DATABASE_URL names another host. For tadayo-dev, run ops migrate: node tools/ops/src/main.ts migrate",
  );
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
