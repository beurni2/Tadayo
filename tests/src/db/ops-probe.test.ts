// `tools/ops`' `supabase-probe`, database layer, against Postgres made like Supabase's, as the roles
// the probe meets there (docs/plans/B0.md, slice 10a; T12, T53): what it reads as `tadayo_app`, which
// is how it runs on a Machine of the API's app, and what it says when the schema `app` or Storage's
// two tables are open. The API layer, against a made-up project, is tools/ops/src/supabase-probe.test.ts.
// Every change is made in a transaction that rolls back, as supabase_admin, since ci's database has no
// Storage (and a project's own might not have the stand-in's shape): each test makes its own.

import { databaseChecks, type Check } from "@tadayo/ops";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql, rolledBack, type Tx } from "./harness.ts";

const app = appSql();
const admin = adminSql();
afterAll(async () => {
  await app.end();
  await admin.end();
});

const CLOSED = "database: nothing in app is open to anon, authenticated, service_role or PUBLIC";
const TABLES = "database: app has tables for REST to be asked for";
const SEALED = "database: Storage's buckets and objects have row-level security and no policy";

const byName = (checks: readonly Check[], name: string) => checks.find((check) => check.name === name);

/** What Storage's own migrations leave: two tables with row-level security on and no policy. */
async function withStorage(tx: Tx): Promise<void> {
  await tx.unsafe(`
    DROP SCHEMA IF EXISTS storage CASCADE;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);
}

describe("databaseChecks, as tadayo_app on the migrated database", () => {
  it("finds the schema closed and lists its tables, reading only the catalogs", async () => {
    const { checks, tables } = await databaseChecks(app);
    expect(byName(checks, CLOSED)).toEqual({ name: CLOSED, ok: true });
    expect(byName(checks, TABLES)).toEqual({ name: TABLES, ok: true });
    const listed = await app<{ name: string }[]>`
      SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'app' ORDER BY tablename`;
    expect(tables).toEqual(listed.map((row) => row.name));
    expect(tables).toContain("schema_migrations");
    // It asks about Storage whatever the database has: what it says is the next tests'.
    expect(byName(checks, SEALED)).toBeDefined();
    expect(checks.map((check) => check.name)).toEqual([CLOSED, TABLES, SEALED]);
  });
});

describe("databaseChecks on the schema app", () => {
  it("names what is open to an API role, three at most, and counts the rest", async () => {
    await rolledBack(admin, async (tx) => {
      await tx.unsafe("GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON app.schema_migrations TO anon");
      const { checks } = await databaseChecks(tx);
      expect(byName(checks, CLOSED)).toEqual({
        name: CLOSED,
        ok: false,
        note:
          "app.schema_migrations grants DELETE to anon; app.schema_migrations grants INSERT to anon; " +
          "app.schema_migrations grants SELECT to anon; and 2 more",
      });
    });
  });

  it("names a policy, a table without row-level security and a grant to PUBLIC, as the migrations' own check does", async () => {
    await rolledBack(admin, async (tx) => {
      await tx.unsafe(`
        CREATE POLICY ops_probe_all ON app.schema_migrations USING (true);
        GRANT SELECT ON app.schema_migrations TO PUBLIC;
      `);
      const { checks } = await databaseChecks(tx);
      expect(byName(checks, CLOSED)).toEqual({
        name: CLOSED,
        ok: false,
        note: "app.schema_migrations grants SELECT to PUBLIC; the table app.schema_migrations has the policy ops_probe_all",
      });
    });
    await rolledBack(admin, async (tx) => {
      await tx.unsafe("ALTER TABLE app.schema_migrations DISABLE ROW LEVEL SECURITY");
      const { checks } = await databaseChecks(tx);
      expect(byName(checks, CLOSED)?.note).toBe("the table app.schema_migrations has no row-level security");
    });
  });

  it("lists tables and partitioned tables of app, and not their partitions, views or other schemas' tables", async () => {
    await rolledBack(admin, async (tx) => {
      await tx.unsafe(`
        CREATE TABLE app.ops_probe_t (n integer);
        CREATE TABLE app.ops_probe_p (n integer) PARTITION BY RANGE (n);
        CREATE TABLE app.ops_probe_p1 PARTITION OF app.ops_probe_p FOR VALUES FROM (0) TO (10);
        CREATE VIEW app.ops_probe_v AS SELECT 1 AS n;
        CREATE SCHEMA ops_probe_other;
        CREATE TABLE ops_probe_other.ops_probe_o (n integer);
      `);
      const { tables } = await databaseChecks(tx);
      expect(tables.filter((name) => name.startsWith("ops_probe"))).toEqual(["ops_probe_p", "ops_probe_t"]);
    });
  });

  it("fails, saying so, when the schema has no table for REST to be asked for", async () => {
    await rolledBack(admin, async (tx) => {
      await tx.unsafe(`
        DROP SCHEMA app CASCADE;
        CREATE SCHEMA app;
      `);
      const { checks, tables } = await databaseChecks(tx);
      expect(tables).toEqual([]);
      expect(byName(checks, TABLES)).toEqual({ name: TABLES, ok: false, note: "it has none" });
    });
  });
});

describe("databaseChecks on Storage's tables", () => {
  it("passes when buckets and objects have row-level security on and no policy", async () => {
    await rolledBack(admin, async (tx) => {
      await withStorage(tx);
      const { checks } = await databaseChecks(tx);
      expect(byName(checks, SEALED)).toEqual({ name: SEALED, ok: true });
    });
  });

  it("fails, naming each table, when Storage's tables aren't there, so a probe of the wrong database passes nothing", async () => {
    await rolledBack(admin, async (tx) => {
      await tx.unsafe("DROP SCHEMA IF EXISTS storage CASCADE");
      const { checks } = await databaseChecks(tx);
      expect(byName(checks, SEALED)).toEqual({
        name: SEALED,
        ok: false,
        note: "storage.buckets isn't there; storage.objects isn't there",
      });
    });
  });

  it("fails on a policy on objects, one or more, and on one on buckets", async () => {
    await rolledBack(admin, async (tx) => {
      await withStorage(tx);
      await tx.unsafe("CREATE POLICY one ON storage.objects FOR SELECT USING (true)");
      expect(byName((await databaseChecks(tx)).checks, SEALED)?.note).toBe("storage.objects has 1 policy");
      await tx.unsafe("CREATE POLICY two ON storage.objects FOR DELETE USING (true)");
      expect(byName((await databaseChecks(tx)).checks, SEALED)?.note).toBe("storage.objects has 2 policies");
      await tx.unsafe("CREATE POLICY three ON storage.buckets FOR INSERT WITH CHECK (true)");
      expect(byName((await databaseChecks(tx)).checks, SEALED)?.note).toBe(
        "storage.buckets has 1 policy; storage.objects has 2 policies",
      );
    });
  });

  it("fails when row-level security is off, which would open every object to every role with a grant", async () => {
    await rolledBack(admin, async (tx) => {
      await withStorage(tx);
      await tx.unsafe("ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY");
      expect(byName((await databaseChecks(tx)).checks, SEALED)?.note).toBe("storage.objects has no row-level security");
      await tx.unsafe("CREATE POLICY one ON storage.objects FOR SELECT USING (true)");
      expect(byName((await databaseChecks(tx)).checks, SEALED)?.note).toBe(
        "storage.objects has no row-level security; storage.objects has 1 policy",
      );
    });
  });

  it("looks only at buckets and objects: a policy on another Storage table isn't an object's", async () => {
    await rolledBack(admin, async (tx) => {
      await withStorage(tx);
      await tx.unsafe(`
        CREATE TABLE storage.ops_probe_other (n integer);
        ALTER TABLE storage.ops_probe_other ENABLE ROW LEVEL SECURITY;
        CREATE POLICY other ON storage.ops_probe_other USING (true);
      `);
      expect(byName((await databaseChecks(tx)).checks, SEALED)).toEqual({ name: SEALED, ok: true });
    });
  });
});
