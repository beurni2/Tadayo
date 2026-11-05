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
      const [found] = await admin<
        {
          schema: boolean;
          tables: string[];
          columns: string[];
          routines: string[];
          sequences: string[];
          types: string[];
        }[]
      >`
        SELECT pg_catalog.has_schema_privilege(${role}, 'app', 'USAGE, CREATE') AS schema,
               ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
                      WHERE c.relnamespace = 'app'::regnamespace
                        AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
                                 THEN pg_catalog.has_table_privilege(${role}, c.oid,
                                        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                                 ELSE false END) AS tables,
               -- Every column, the system columns (ctid, xmin, tableoid, ...) too, which
               -- has_any_column_privilege leaves out.
               ARRAY(SELECT c.relname::text || '.' || a.attname::text
                       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
                      WHERE c.relnamespace = 'app'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                        AND a.attnum <> 0 AND NOT a.attisdropped
                        AND pg_catalog.has_column_privilege(${role}, c.oid, a.attnum,
                              'SELECT, INSERT, UPDATE, REFERENCES')) AS columns,
               ARRAY(SELECT p.proname::text FROM pg_catalog.pg_proc p
                      WHERE p.pronamespace = 'app'::regnamespace
                        AND pg_catalog.has_function_privilege(${role}, p.oid, 'EXECUTE')) AS routines,
               ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
                      WHERE c.relnamespace = 'app'::regnamespace
                        AND CASE WHEN c.relkind = 'S'
                                 THEN pg_catalog.has_sequence_privilege(${role}, c.oid, 'USAGE, SELECT, UPDATE')
                                 ELSE false END) AS sequences,
               -- Domains, enums, ranges and composite types made on their own. A table's row type
               -- and every array type keep Postgres's default, PUBLIC's USAGE, and are reached only
               -- through the schema, which is closed.
               ARRAY(SELECT t.typname::text FROM pg_catalog.pg_type t
                      WHERE t.typnamespace = 'app'::regnamespace
                        AND (t.typtype IN ('d', 'e', 'r', 'm')
                             OR (t.typtype = 'c' AND EXISTS (SELECT FROM pg_catalog.pg_class c
                                                              WHERE c.oid = t.typrelid AND c.relkind = 'c')))
                        AND pg_catalog.has_type_privilege(${role}, t.oid, 'USAGE')) AS types
      `;
      expect(found).toEqual({ schema: false, tables: [], columns: [], routines: [], sequences: [], types: [] });
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
        await tx`CREATE FUNCTION app.probe_public() RETURNS int LANGUAGE sql AS 'SELECT 1'`;
        await tx`GRANT EXECUTE ON FUNCTION app.probe_public() TO PUBLIC`;
        await tx`GRANT USAGE ON SCHEMA app TO authenticated`;
      }),
    ).toEqual([
      "app.probe_fn grants EXECUTE to service_role",
      "app.probe_granted grants SELECT to anon",
      "app.probe_granted_id_seq grants USAGE to PUBLIC",
      "app.probe_public grants EXECUTE to PUBLIC",
      "the schema app grants USAGE to authenticated",
    ]);
  });

  it("a grant on a column, which a grant on the table doesn't show (review finding privacy 3 of PR #17)", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE TABLE app.probe_columns (id int, note text)`;
        await tx`ALTER TABLE app.probe_columns ENABLE ROW LEVEL SECURITY`;
        await tx`GRANT SELECT (note) ON app.probe_columns TO service_role`;
        await tx`GRANT UPDATE (id) ON app.probe_columns TO PUBLIC`;
      }),
    ).toEqual(["app.probe_columns.id grants UPDATE to PUBLIC", "app.probe_columns.note grants SELECT to service_role"]);
  });

  it("a grant on a system column, such as ctid, xmin or tableoid (review finding privacy 5 of PR #17's check)", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE TABLE app.probe_system (id int)`;
        await tx`ALTER TABLE app.probe_system ENABLE ROW LEVEL SECURITY`;
        await tx`GRANT SELECT (ctid, xmin) ON app.probe_system TO anon`;
        await tx`GRANT SELECT (tableoid) ON app.probe_system TO service_role`;
      }),
    ).toEqual([
      "app.probe_system.ctid grants SELECT to anon",
      "app.probe_system.tableoid grants SELECT to service_role",
      "app.probe_system.xmin grants SELECT to anon",
    ]);
  });

  it("a trigger or a rule on the ledger, which would run a file's code when the runner records the next one", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE FUNCTION app.probe_ledger() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'`;
        await tx`
          CREATE TRIGGER probe_ledger BEFORE INSERT ON app.schema_migrations
            FOR EACH ROW EXECUTE FUNCTION app.probe_ledger()
        `;
        await tx`CREATE RULE probe_rule AS ON UPDATE TO app.schema_migrations DO INSTEAD NOTHING`;
      }),
    ).toEqual([
      "the ledger app.schema_migrations has the rule probe_rule",
      "the ledger app.schema_migrations has the trigger probe_ledger",
    ]);
  });

  it("never runs a type in the session's temporary schema, which comes first for type names even with the search path empty (review finding runner 2 of PR #17's second check)", async () => {
    expect(
      await found(async (tx) => {
        await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
        await tx`CREATE TABLE app.probe_temp_types (id int)`;
        await tx`ALTER TABLE app.probe_temp_types ENABLE ROW LEVEL SECURITY`;
        await tx`GRANT SELECT ON app.probe_temp_types TO anon`;
        await tx`
          CREATE FUNCTION app.probe_ran() RETURNS boolean LANGUAGE plpgsql
            AS 'BEGIN RAISE EXCEPTION ''a temporary type ran inside the check''; END'
        `;
        // "char" is cast for every relation; regrole and text for every problem found.
        await tx`CREATE DOMAIN pg_temp."char" AS pg_catalog."char" CHECK (VALUE IS NULL OR app.probe_ran())`;
        await tx`CREATE DOMAIN pg_temp.regrole AS pg_catalog.regrole CHECK (VALUE IS NULL OR app.probe_ran())`;
        await tx`CREATE DOMAIN pg_temp.text AS pg_catalog.text CHECK (VALUE IS NULL OR app.probe_ran())`;
      }),
    ).toEqual(["app.probe_temp_types grants SELECT to anon"]);
  });

  it("a grant on a type or domain", async () => {
    expect(
      await found(async (tx) => {
        await tx`CREATE DOMAIN app.probe_domain AS int`;
        await tx`GRANT USAGE ON DOMAIN app.probe_domain TO anon, PUBLIC`;
      }),
    ).toEqual(["the type app.probe_domain grants USAGE to PUBLIC", "the type app.probe_domain grants USAGE to anon"]);
  });

  it("a default privilege that would grant what the owner makes later", async () => {
    expect(
      await found(async (tx) => {
        await tx`ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon`;
        await tx`ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO authenticated`;
      }),
    ).toEqual([
      "the default privileges of tadayo_app grant EXECUTE on functions to authenticated",
      "the default privileges of tadayo_app grant SELECT on tables to anon",
    ]);
  });

  it("a type made after migration 0001 isn't PUBLIC's to use", async () => {
    expect(await found((tx) => tx`CREATE DOMAIN app.probe_default_domain AS int`)).toEqual([]);
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
      await tx`CREATE DOMAIN app.probe_foreign_domain AS int`;
      return closedProblems(tx);
    });
    // supabase_admin has no default privileges here, so its domain is also PUBLIC's to use.
    expect(problems).toEqual([
      "app.probe_foreign belongs to supabase_admin",
      "the type app.probe_foreign_domain belongs to supabase_admin",
      "the type app.probe_foreign_domain grants USAGE to PUBLIC",
    ]);
  });
});
