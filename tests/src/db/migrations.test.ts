// The migration runner against the database (T53, T57; ADR-015): it runs as `tadayo_app`, it
// records what it applied, and a migration that fails, or would leave the schema open, or names
// a table without its schema, changes nothing.

import { copyFile, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMigration, migrate, readMigrations } from "@tadayo/ops";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql, MIGRATIONS } from "./harness.ts";

const app = appSql();
const admin = adminSql();
afterAll(async () => {
  await Promise.all([app.end(), admin.end()]);
});

/** A copy of db/migrations. */
async function copyOfMigrations(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tadayo-migrations-"));
  for (const name of await readdir(MIGRATIONS)) await copyFile(join(MIGRATIONS, name), join(dir, name));
  return dir;
}

/** A copy of db/migrations with one more file after them, which the tests expect to fail. */
async function withExtra(text: string): Promise<string> {
  const dir = await copyOfMigrations();
  const count = (await readdir(dir)).length;
  await writeFile(join(dir, `${String(count + 1).padStart(4, "0")}_probe.sql`), text);
  return dir;
}

async function ledger(): Promise<{ version: number; name: string; sha256: string }[]> {
  return app`SELECT version, name, sha256 FROM app.schema_migrations ORDER BY version`;
}

async function left(name: string): Promise<number> {
  const [row] = await app<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_catalog.pg_class WHERE relname = ${name}`;
  return row?.n ?? -1;
}

/** How many functions or procedures named `name` the schema app holds. */
async function routines(name: string): Promise<number> {
  const [row] = await app<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_catalog.pg_proc WHERE proname = ${name} AND pronamespace = 'app'::regnamespace
  `;
  return row?.n ?? -1;
}

describe("the runner (T57)", () => {
  it("has applied every file in db/migrations, each recorded with its SHA-256", async () => {
    const files = await readMigrations(MIGRATIONS);
    expect(await ledger()).toEqual(files.map(({ version, name, sha256 }) => ({ version, name, sha256 })));
  });

  it("applies nothing a second time", async () => {
    expect(await migrate(app, MIGRATIONS)).toEqual([]);
  });

  it("refuses to run as anyone but the schema's owner, a superuser above all (ADR-015)", async () => {
    await expect(migrate(admin, MIGRATIONS)).rejects.toThrow(
      /run as tadayo_app, the owner of the schema app, not as supabase_admin/,
    );
  });

  it("made everything in the schema as tadayo_app", async () => {
    const owners = await app<{ owner: string }[]>`
      SELECT DISTINCT c.relowner::regrole::text AS owner FROM pg_catalog.pg_class c
       WHERE c.relnamespace = 'app'::regnamespace
      UNION
      SELECT DISTINCT p.proowner::regrole::text FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'app'::regnamespace
      UNION
      SELECT DISTINCT t.typowner::regrole::text FROM pg_catalog.pg_type t WHERE t.typnamespace = 'app'::regnamespace
    `;
    expect(owners.map((row) => row.owner)).toEqual(["tadayo_app"]);
  });

  it("rolls back a migration that would leave a table without row-level security (T53)", async () => {
    const before = await ledger();
    await expect(migrate(app, await withExtra("CREATE TABLE app.probe_open (id int);"))).rejects.toThrow(
      /_probe\.sql would leave the schema app open \(T53\): the table app\.probe_open has no row-level security/,
    );
    expect(await ledger()).toEqual(before);
    expect(await left("probe_open")).toBe(0);
  });

  it("rolls back a migration that grants anything to an API role (T53)", async () => {
    const before = await ledger();
    const text = `
      CREATE TABLE app.probe_granted (id int);
      ALTER TABLE app.probe_granted ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON app.probe_granted TO authenticated;
    `;
    await expect(migrate(app, await withExtra(text))).rejects.toThrow(
      /app\.probe_granted grants SELECT to authenticated/,
    );
    expect(await ledger()).toEqual(before);
    expect(await left("probe_granted")).toBe(0);
  });

  // A file runs as the body of one PL/pgSQL EXECUTE, where Postgres itself refuses whatever
  // would begin, end or split the transaction, however the file hides it (review findings
  // privacy 4 and records 1 of PR #17, and privacy 2, 3 and 6 of its check).
  it("rolls back a migration that begins, ends or splits its transaction, keeping nothing of it (T53)", async () => {
    const before = await ledger();
    const made =
      "CREATE TABLE app.probe_committed (id int);\nALTER TABLE app.probe_committed ENABLE ROW LEVEL SECURITY;\n";
    for (const text of [
      "BEGIN;\nCREATE TABLE app.probe_committed (id int);\nCOMMIT;\n",
      `${made}COMMIT;\nSELECT 1 / 0;\n`,
      `${made}COMMIT AND CHAIN;\n`,
      `${made}SAVEPOINT here;\n`,
      `${made}ROLLBACK;\n`,
      `${made}-- a comment that ends at a carriage return\rCOMMIT;\n`,
      `${made}SELECT 1 AS é$$; COMMIT; SELECT 1 AS x$$;\n`,
      `${made}DO $$ BEGIN COMMIT; END $$;\n`,
      `${made}CREATE PROCEDURE app.probe_commits() LANGUAGE plpgsql AS $$ BEGIN COMMIT; END $$;\nCALL app.probe_commits();\n`,
    ]) {
      await expect(migrate(app, await withExtra(text)), text).rejects.toThrow(
        /_probe\.sql begins, ends or splits its transaction \((EXECUTE of transaction commands is not implemented|invalid transaction termination)\)/,
      );
      expect(await ledger()).toEqual(before);
      expect(await left("probe_committed")).toBe(0);
      expect(await routines("probe_commits")).toBe(0);
    }
  });

  it("runs a function whose body is BEGIN ATOMIC ... END, whatever its statements end with", async () => {
    const file = {
      version: 99,
      name: "probe",
      sha256: "0".repeat(64),
      text: [
        "CREATE FUNCTION app.probe_atomic(x int) RETURNS text LANGUAGE sql IMMUTABLE",
        "BEGIN ATOMIC",
        "  SELECT CASE WHEN x > 0 THEN 'some' ELSE 'none' END;",
        "END;",
      ].join("\n"),
    };
    const rollback = new Error("rolled back");
    await expect(
      app.begin(async (tx) => {
        await applyMigration(tx, file);
        const [row] = await tx<{ answer: string }[]>`SELECT app.probe_atomic(1) AS answer`;
        expect(row?.answer).toBe("some");
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("checks the schema after the file's deferred triggers have run, and refuses a trigger on the ledger (T53)", async () => {
    const before = await ledger();
    const deferred = `
      CREATE TABLE app.probe_deferred (id int);
      ALTER TABLE app.probe_deferred ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION app.probe_open() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        GRANT SELECT ON app.probe_deferred TO anon;
        RETURN NULL;
      END
      $$;
      CREATE CONSTRAINT TRIGGER probe_open AFTER INSERT ON app.probe_deferred
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.probe_open();
      INSERT INTO app.probe_deferred VALUES (1);
    `;
    await expect(migrate(app, await withExtra(deferred))).rejects.toThrow(
      /_probe\.sql would leave the schema app open \(T53\): app\.probe_deferred grants SELECT to anon/,
    );
    const onTheLedger = `
      CREATE FUNCTION app.probe_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER probe_ledger AFTER INSERT ON app.schema_migrations
        FOR EACH ROW EXECUTE FUNCTION app.probe_ledger();
    `;
    await expect(migrate(app, await withExtra(onTheLedger))).rejects.toThrow(
      /the ledger app\.schema_migrations has the trigger probe_ledger/,
    );
    expect(await ledger()).toEqual(before);
    expect(await left("probe_deferred")).toBe(0);
  });

  it("closes a cursor the file holds and drops its temporary objects, so neither runs later (T53)", async () => {
    // Held, the cursor's query would run at the commit; the temporary domain would stand in for
    // the type "char" in the check, which names every type with its schema too (finding runner 2
    // of PR #17's narrow check).
    const file = {
      version: 99,
      name: "probe",
      sha256: "0".repeat(64),
      text: `
        CREATE TABLE app.probe_held (id int);
        ALTER TABLE app.probe_held ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION app.probe_hold() RETURNS boolean LANGUAGE plpgsql AS $$
        BEGIN
          GRANT SELECT ON app.probe_held TO anon;
          RETURN true;
        END
        $$;
        DECLARE probe_cursor CURSOR WITH HOLD FOR SELECT app.probe_hold();
        CREATE DOMAIN pg_temp."char" AS pg_catalog."char" CHECK (app.probe_hold());
      `,
    };
    const rollback = new Error("rolled back");
    await expect(
      app.begin(async (tx) => {
        await applyMigration(tx, file);
        const [row] = await tx<{ cursors: number; temporary: number; granted: boolean }[]>`
          SELECT (SELECT count(*)::int FROM pg_catalog.pg_cursors WHERE name = 'probe_cursor') AS cursors,
                 (SELECT count(*)::int FROM pg_catalog.pg_type WHERE typnamespace = pg_catalog.pg_my_temp_schema()) AS temporary,
                 pg_catalog.has_table_privilege('anon', 'app.probe_held', 'SELECT') AS granted
        `;
        expect(row).toEqual({ cursors: 0, temporary: 0, granted: false });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("records the file before running it, so code the file puts on the ledger runs only when the next file is recorded, before that file's check (T53)", async () => {
    const probe = (version: number, name: string, text: string) => ({ version, name, sha256: "0".repeat(64), text });
    const stamping = probe(
      99,
      "probe",
      `
        CREATE TABLE app.probe_stamped (id int);
        ALTER TABLE app.probe_stamped ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION app.probe_stamp() RETURNS timestamptz LANGUAGE plpgsql AS $$
        BEGIN
          GRANT SELECT ON app.probe_stamped TO anon;
          RETURN pg_catalog.now();
        END
        $$;
        ALTER TABLE app.schema_migrations ALTER COLUMN applied_at SET DEFAULT app.probe_stamp();
      `,
    );
    const rollback = new Error("rolled back");
    await expect(
      app.begin(async (tx) => {
        await applyMigration(tx, stamping);
        const [row] = await tx<{ granted: boolean }[]>`
          SELECT pg_catalog.has_table_privilege('anon', 'app.probe_stamped', 'SELECT') AS granted
        `;
        expect(row).toEqual({ granted: false });
        await expect(applyMigration(tx, probe(100, "probe_next", "SELECT 1;"))).rejects.toThrow(
          /0100_probe_next\.sql would leave the schema app open \(T53\): app\.probe_stamped grants SELECT to anon/,
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("checks the schema with the search path empty, whatever the file set it to (T53)", async () => {
    // An operator found ahead of pg_catalog's would run the file's code inside the check.
    const file = {
      version: 99,
      name: "probe",
      sha256: "0".repeat(64),
      text: `
        CREATE TABLE app.probe_path (id int);
        ALTER TABLE app.probe_path ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION app.probe_equal(name, name) RETURNS boolean LANGUAGE plpgsql AS $$
        BEGIN
          GRANT SELECT ON app.probe_path TO anon;
          RETURN pg_catalog.nameeq($1, $2);
        END
        $$;
        CREATE OPERATOR app.= (FUNCTION = app.probe_equal, LEFTARG = name, RIGHTARG = name);
        SET search_path = app, pg_catalog;
      `,
    };
    const rollback = new Error("rolled back");
    await expect(
      app.begin(async (tx) => {
        await applyMigration(tx, file);
        const [row] = await tx<{ granted: boolean }[]>`
          SELECT pg_catalog.has_table_privilege('anon', 'app.probe_path', 'SELECT') AS granted
        `;
        expect(row).toEqual({ granted: false });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("checks the schema again after each commit, and stops loudly if something that ran at the commit opened it (T53)", async () => {
    const before = await ledger();
    const version = (await readMigrations(MIGRATIONS)).length + 1;
    // The first deferred trigger defers again, so the second runs at the commit, after the check
    // inside the transaction (finding runner 1 of PR #17's narrow check).
    const text = `
      CREATE TABLE app.probe_relay (id int);
      ALTER TABLE app.probe_relay ENABLE ROW LEVEL SECURITY;
      CREATE TABLE app.probe_late (id int);
      ALTER TABLE app.probe_late ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION app.probe_relay() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        SET CONSTRAINTS ALL DEFERRED;
        INSERT INTO app.probe_late VALUES (1);
        RETURN NULL;
      END
      $$;
      CREATE FUNCTION app.probe_late() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        GRANT SELECT ON app.probe_late TO anon;
        RETURN NULL;
      END
      $$;
      CREATE CONSTRAINT TRIGGER probe_relay AFTER INSERT ON app.probe_relay
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.probe_relay();
      CREATE CONSTRAINT TRIGGER probe_late AFTER INSERT ON app.probe_late
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.probe_late();
      INSERT INTO app.probe_relay VALUES (1);
    `;
    try {
      await expect(migrate(app, await withExtra(text))).rejects.toThrow(
        /_probe\.sql committed, and the schema app was open after its commit \(T53\): app\.probe_late grants SELECT to anon; nothing more is applied/,
      );
    } finally {
      // It did commit: take it away, as an operator would with a migration of its own.
      await app.begin(async (tx) => {
        await tx`DROP TABLE IF EXISTS app.probe_relay, app.probe_late`;
        await tx`DROP FUNCTION IF EXISTS app.probe_relay(), app.probe_late()`;
        await tx`DELETE FROM app.schema_migrations WHERE version = ${version}`;
      });
    }
    expect(await ledger()).toEqual(before);
    expect(await left("probe_late")).toBe(0);
  });

  it("names the file when its deferred checks fail, and keeps nothing of it (T57)", async () => {
    const before = await ledger();
    const text = `
      CREATE TABLE app.probe_parent (id int PRIMARY KEY);
      ALTER TABLE app.probe_parent ENABLE ROW LEVEL SECURITY;
      CREATE TABLE app.probe_child (parent int REFERENCES app.probe_parent DEFERRABLE INITIALLY DEFERRED);
      ALTER TABLE app.probe_child ENABLE ROW LEVEL SECURITY;
      INSERT INTO app.probe_child VALUES (1);
    `;
    await expect(migrate(app, await withExtra(text))).rejects.toThrow(
      /_probe\.sql failed: insert or update on table "probe_child" violates foreign key constraint/,
    );
    expect(await ledger()).toEqual(before);
    expect(await left("probe_child")).toBe(0);
  });

  it("rolls back a migration that names a table without its schema", async () => {
    const before = await ledger();
    await expect(migrate(app, await withExtra("CREATE TABLE probe_unqualified (id int);"))).rejects.toThrow(
      /_probe\.sql failed: no schema has been selected to create in/,
    );
    expect(await ledger()).toEqual(before);
  });

  it("rolls back a migration that fails part way, with nothing of it left", async () => {
    const text = `
      CREATE TABLE app.probe_partial (id int);
      ALTER TABLE app.probe_partial ENABLE ROW LEVEL SECURITY;
      SELECT 1 / 0;
    `;
    await expect(migrate(app, await withExtra(text))).rejects.toThrow(/_probe\.sql failed: division by zero/);
    expect(await left("probe_partial")).toBe(0);
  });

  it("refuses to go on when an applied migration's file has changed", async () => {
    const dir = await copyOfMigrations();
    const [first] = await readMigrations(MIGRATIONS);
    if (!first) throw new Error("no migrations");
    await writeFile(join(dir, `0001_${first.name}.sql`), `${first.text}\n-- edited\n`);
    await expect(migrate(app, dir)).rejects.toThrow(/migration 1 \(close_data_api\) has changed since it was applied/);
  });
});
