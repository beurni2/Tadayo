// The privacy matrix runs in a database of its own (the outside audit's B8; ./global-setup.ts), so the
// worlds it commits never reach the database the database tests use, whichever of the two runs first.
// Every file of the matrix connects through DATABASE_URL and DATABASE_ADMIN_URL (../db/harness.ts), which
// each file's worker takes from the setup's environment, as this file's connections do: what holds here
// holds for each of them. The setup refuses a copy that gives other rights than the original; this test
// holds that, and the copy's time limits, again from inside, against the original by name.

import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { adminSql, appSql } from "../db/harness.ts";
import { MATRIX_DATABASE, SOURCE_VARIABLE, onDatabase, rightsOn } from "./global-setup.ts";

const LIMITS = ["lock_timeout", "statement_timeout", "idle_in_transaction_session_timeout"] as const;

async function limitsOf(sql: postgres.Sql): Promise<string[]> {
  const shown: string[] = [];
  for (const name of LIMITS) {
    const [row] = await sql<{ value: string }[]>`SELECT pg_catalog.current_setting(${name}) AS value`;
    shown.push(`${name} ${row?.value ?? "none"}`);
  }
  return shown;
}

describe("the matrix's own database (the outside audit's B8)", () => {
  it("is a copy of the migrated database ci gives, reached as tadayo_app and as the admin, with the rights PUBLIC and tadayo_app have on the original and tadayo_app's time limits there", async () => {
    const source = process.env[SOURCE_VARIABLE] ?? "";
    expect(source).not.toBe("");
    expect(source).not.toBe(MATRIX_DATABASE);
    const app = appSql();
    const admin = adminSql();
    const appOnSource = postgres(onDatabase(process.env.DATABASE_URL ?? "", source), {
      max: 1,
      onnotice: () => undefined,
    });
    try {
      const [asApp] = await app<{ database: string }[]>`SELECT pg_catalog.current_database() AS database`;
      const [asAdmin] = await admin<{ database: string }[]>`SELECT pg_catalog.current_database() AS database`;
      expect(asApp?.database).toBe(MATRIX_DATABASE);
      expect(asAdmin?.database).toBe(MATRIX_DATABASE);
      // Migrated, as the copy of a migrated database is.
      const [migrated] = await app<{ owner: string }[]>`
        SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname = 'app'`;
      expect(migrated?.owner).toBe("tadayo_app");
      // What PUBLIC and tadayo_app may do at the database's level, as on the original; tadayo_app may
      // connect but make nothing there, as db/bootstrap.sql leaves it.
      const here = await rightsOn(admin, MATRIX_DATABASE);
      expect(here).toEqual(await rightsOn(admin, source));
      expect(here).toContain("tadayo_app CONNECT yes");
      expect(here).toContain("tadayo_app CREATE no");
      // tadayo_app's time limits (migration 0018), as it has them on the original, none of them off.
      const limits = await limitsOf(app);
      expect(limits).toEqual(await limitsOf(appOnSource));
      for (const limit of limits) expect(limit.endsWith(" 0")).toBe(false);
    } finally {
      await app.end();
      await admin.end();
      await appOnSource.end();
    }
  });
});
