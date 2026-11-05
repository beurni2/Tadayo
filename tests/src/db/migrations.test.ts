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

  it("refuses a migration with its own BEGIN and COMMIT before running any of it (T53)", async () => {
    const before = await ledger();
    const text = `
      BEGIN;
      CREATE TABLE app.probe_committed (id int);
      COMMIT;
    `;
    await expect(migrate(app, await withExtra(text))).rejects.toThrow(/_probe\.sql has its own BEGIN/);
    expect(await ledger()).toEqual(before);
    expect(await left("probe_committed")).toBe(0);
  });

  it("fails loudly if a file it runs ends its transaction, which readMigrations refuses first", async () => {
    const before = await ledger();
    // Only a COMMIT, so the transaction it ends had nothing of the file's to keep.
    const file = { version: 99, name: "probe", sha256: "0".repeat(64), text: "COMMIT;" };
    await expect(app.begin((tx) => applyMigration(tx, file))).rejects.toThrow(
      /0099_probe\.sql ended the runner's transaction/,
    );
    expect(await ledger()).toEqual(before);
  });

  it("rolls back a migration that names a table without its schema", async () => {
    const before = await ledger();
    await expect(migrate(app, await withExtra("CREATE TABLE probe_unqualified (id int);"))).rejects.toThrow(
      /no schema has been selected to create in/,
    );
    expect(await ledger()).toEqual(before);
  });

  it("rolls back a migration that fails part way, with nothing of it left", async () => {
    const text = `
      CREATE TABLE app.probe_partial (id int);
      ALTER TABLE app.probe_partial ENABLE ROW LEVEL SECURITY;
      SELECT 1 / 0;
    `;
    await expect(migrate(app, await withExtra(text))).rejects.toThrow(/division by zero/);
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
