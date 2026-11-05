// T53 and ADR-015: Supabase's data API reads nothing of Tadayo's. The schema `app` is closed to
// `anon`, `authenticated`, `service_role` and PUBLIC; every table has row-level security on with
// no policy, as a backstop; and the migration runner refuses a migration that would open it.

import { closedProblems } from "@tadayo/ops";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";

const app = appSql();
const admin = adminSql();
afterAll(async () => {
  await Promise.all([app.end(), admin.end()]);
});

const API_ROLES = ["anon", "authenticated", "service_role"] as const;

async function tables(): Promise<string[]> {
  const rows = await app<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'app'::regnamespace AND c.relkind IN ('r', 'p') ORDER BY 1
  `;
  return rows.map((row) => row.name);
}

describe("T53: anon, authenticated and service_role read nothing", () => {
  it("leaves the schema closed after every migration", async () => {
    expect(await closedProblems(app)).toEqual([]);
  });

  it("has tables to check", async () => {
    expect(await tables()).toContain("schema_migrations");
  });

  for (const role of API_ROLES) {
    it(`gives ${role} no privilege on the schema or anything in it`, async () => {
      const [found] = await admin<{ schema: boolean; tables: string[]; routines: string[]; sequences: string[] }[]>`
        SELECT pg_catalog.has_schema_privilege(${role}, 'app', 'USAGE, CREATE') AS schema,
               ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
                      WHERE c.relnamespace = 'app'::regnamespace
                        AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
                                 THEN pg_catalog.has_table_privilege(${role}, c.oid,
                                        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                                 ELSE false END) AS tables,
               ARRAY(SELECT p.proname::text FROM pg_catalog.pg_proc p
                      WHERE p.pronamespace = 'app'::regnamespace
                        AND pg_catalog.has_function_privilege(${role}, p.oid, 'EXECUTE')) AS routines,
               ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
                      WHERE c.relnamespace = 'app'::regnamespace
                        AND CASE WHEN c.relkind = 'S'
                                 THEN pg_catalog.has_sequence_privilege(${role}, c.oid, 'USAGE, SELECT, UPDATE')
                                 ELSE false END) AS sequences
      `;
      expect(found).toEqual({ schema: false, tables: [], routines: [], sequences: [] });
    });

    it(`refuses ${role} every table of the schema`, async () => {
      const names = await tables();
      await rolledBack(admin, async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        for (const name of names) {
          await expectRefused(tx, REFUSED.privilege, (sp) => sp`SELECT 1 FROM ${sp("app")}.${sp(name)} LIMIT 1`);
        }
      });
    });
  }

  it("shows anon and authenticated no row even if a grant slipped in, and service_role, which bypasses row-level security, is held only by the missing grants", async () => {
    const counts = await rolledBack(admin, async (tx) => {
      await tx`GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role`;
      await tx`GRANT SELECT ON app.schema_migrations TO anon, authenticated, service_role`;
      const seen = { anon: -1, authenticated: -1, service_role: -1 };
      for (const role of API_ROLES) {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        const [row] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app.schema_migrations`;
        seen[role] = row?.n ?? -1;
        await tx`RESET ROLE`;
      }
      const [owner] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app.schema_migrations`;
      return { ...seen, superuser: owner?.n ?? -1 };
    });
    expect(counts.anon).toBe(0);
    expect(counts.authenticated).toBe(0);
    expect(counts.superuser).toBeGreaterThan(0);
    expect(counts.service_role).toBe(counts.superuser);
  });

  it("gives every table row-level security, unforced, with no policy, and tadayo_app as its owner", async () => {
    const rows = await app<{ name: string; rls: boolean; forced: boolean; policies: number; owner: string }[]>`
      SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid) AS policies,
             c.relowner::regrole::text AS owner
        FROM pg_catalog.pg_class c
       WHERE c.relnamespace = 'app'::regnamespace AND c.relkind IN ('r', 'p')
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, row.name).toEqual({ name: row.name, rls: true, forced: false, policies: 0, owner: "tadayo_app" });
    }
  });
});

describe("T53: the runner's check finds whatever would open the schema", () => {
  const found = (body: (tx: Tx) => Promise<unknown>) =>
    rolledBack(app, async (tx) => {
      await body(tx);
      return closedProblems(tx);
    });

  it("a table without row-level security", async () => {
    expect(await found((tx) => tx`CREATE TABLE app.probe_open (id int)`)).toEqual([
      "the table app.probe_open has no row-level security",
    ]);
  });

  it("a table that forces it", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE TABLE app.probe_forced (id int)`;
        await tx`ALTER TABLE app.probe_forced ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY`;
      }),
    ).toEqual(["the table app.probe_forced forces row-level security"]);
  });

  it("a policy", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE TABLE app.probe_policy (id int)`;
        await tx`ALTER TABLE app.probe_policy ENABLE ROW LEVEL SECURITY`;
        await tx`CREATE POLICY everyone ON app.probe_policy USING (true)`;
      }),
    ).toEqual(["the table app.probe_policy has the policy everyone"]);
  });

  it("a grant on a table, a sequence, a function or the schema, to an API role or PUBLIC", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE TABLE app.probe_granted (id int GENERATED ALWAYS AS IDENTITY)`;
        await tx`ALTER TABLE app.probe_granted ENABLE ROW LEVEL SECURITY`;
        await tx`GRANT SELECT ON app.probe_granted TO anon`;
        await tx`GRANT USAGE ON SEQUENCE app.probe_granted_id_seq TO PUBLIC`;
        await tx`CREATE FUNCTION app.probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'`;
        await tx`GRANT EXECUTE ON FUNCTION app.probe_fn() TO service_role`;
        await tx`GRANT USAGE ON SCHEMA app TO authenticated`;
      }),
    ).toEqual([
      "app.probe_fn grants EXECUTE to service_role",
      "app.probe_granted grants SELECT to anon",
      "app.probe_granted_id_seq grants USAGE to PUBLIC",
      "the schema app grants USAGE to authenticated",
    ]);
  });

  it("a function made after migration 0001 isn't PUBLIC's to execute", async () => {
    expect(await found((tx) => tx`CREATE FUNCTION app.probe_default() RETURNS int LANGUAGE sql AS 'SELECT 1'`)).toEqual(
      [],
    );
  });

  it("an object another role owns", async () => {
    const problems = await rolledBack(admin, async (tx) => {
      await tx`CREATE TABLE app.probe_foreign (id int)`;
      await tx`ALTER TABLE app.probe_foreign ENABLE ROW LEVEL SECURITY`;
      return closedProblems(tx);
    });
    expect(problems).toEqual(["app.probe_foreign belongs to supabase_admin"]);
  });
});
