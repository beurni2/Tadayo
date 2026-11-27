// The privacy matrix runs in a database of its own (the outside audit's B8; ./global-setup.ts), so the
// worlds it commits never reach the database the database tests use, whichever of the two runs first.

import { describe, expect, it } from "vitest";
import { adminSql, appSql } from "../db/harness.ts";
import { MATRIX_DATABASE } from "./global-setup.ts";

describe("the matrix's own database (the outside audit's B8)", () => {
  it("is where every file of the matrix connects, as tadayo_app and as the admin, with what tadayo_app had on the original", async () => {
    const app = appSql();
    const admin = adminSql();
    try {
      const [asApp] = await app<{ database: string }[]>`SELECT pg_catalog.current_database() AS database`;
      const [asAdmin] = await admin<{ database: string }[]>`SELECT pg_catalog.current_database() AS database`;
      expect(asApp?.database).toBe(MATRIX_DATABASE);
      expect(asAdmin?.database).toBe(MATRIX_DATABASE);
      // Migrated, as the copy of a migrated database is, and tadayo_app may connect but make nothing at
      // the database's level, as db/bootstrap.sql leaves it on the original.
      const [migrated] = await app<{ owner: string }[]>`
        SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname = 'app'`;
      expect(migrated?.owner).toBe("tadayo_app");
      const [may] = await admin<{ connect: boolean; create: boolean }[]>`
        SELECT pg_catalog.has_database_privilege('tadayo_app', pg_catalog.current_database(), 'CONNECT') AS connect,
               pg_catalog.has_database_privilege('tadayo_app', pg_catalog.current_database(), 'CREATE') AS create`;
      expect(may).toEqual({ connect: true, create: false });
    } finally {
      await app.end();
      await admin.end();
    }
  });
});
