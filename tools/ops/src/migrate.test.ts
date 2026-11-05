// The runner's reading of db/migrations and its plan, without a database (T57). The database
// side is in tests/src/db/migrations.test.ts.

import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pendingMigrations, readMigrations, type MigrationFile } from "./migrate.ts";

async function folder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tadayo-migrations-"));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

describe("readMigrations", () => {
  it("reads the files in order, with each one's SHA-256", async () => {
    const files = await readMigrations(await folder({ "0002_b.sql": "SELECT 2;", "0001_a.sql": "SELECT 1;" }));
    expect(files.map((f) => [f.version, f.name, f.text])).toEqual([
      [1, "a", "SELECT 1;"],
      [2, "b", "SELECT 2;"],
    ]);
    // sha256("SELECT 1;")
    expect(files[0]?.sha256).toBe("17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a");
  });

  it("refuses a gap, a repeat, or a first number other than 0001", async () => {
    await expect(readMigrations(await folder({ "0001_a.sql": "", "0003_c.sql": "" }))).rejects.toThrow(
      /expected migration 0002, found 0003_c\.sql/,
    );
    await expect(readMigrations(await folder({ "0001_a.sql": "", "0001_b.sql": "" }))).rejects.toThrow(
      /expected migration 0002, found 0001_b\.sql/,
    );
    await expect(readMigrations(await folder({ "0002_b.sql": "" }))).rejects.toThrow(/expected migration 0001/);
  });

  it("refuses any other file in the folder", async () => {
    for (const name of ["0001_A.sql", "1_a.sql", "0001-a.sql", "0001_a.txt", "README.md", "0001_.sql", "0001_a_.sql"]) {
      await expect(readMigrations(await folder({ [name]: "" })), name).rejects.toThrow(/isn't a migration/);
    }
  });

  it("reads the repository's own migrations", async () => {
    const dir = join(import.meta.dirname, "..", "..", "..", "db", "migrations");
    const files = await readMigrations(dir);
    expect(files.length).toBe((await readdir(dir)).length);
    expect(files[0]?.name).toBe("close_data_api");
  });
});

describe("pendingMigrations (T57: a migration is never edited once applied)", () => {
  const file = (version: number, name: string, sha256: string): MigrationFile => ({ version, name, sha256, text: "" });
  const files = [file(1, "a", "1".repeat(64)), file(2, "b", "2".repeat(64)), file(3, "c", "3".repeat(64))];
  const applied = (n: number) => files.slice(0, n).map(({ version, name, sha256 }) => ({ version, name, sha256 }));

  it("returns what follows what was applied", () => {
    expect(pendingMigrations(files, []).map((f) => f.version)).toEqual([1, 2, 3]);
    expect(pendingMigrations(files, applied(2)).map((f) => f.version)).toEqual([3]);
    expect(pendingMigrations(files, applied(3))).toEqual([]);
  });

  it("refuses an applied migration whose file changed, or was renamed", () => {
    const changed = applied(2).map((row) => (row.version === 2 ? { ...row, sha256: "f".repeat(64) } : row));
    expect(() => pendingMigrations(files, changed)).toThrow(/migration 2 \(b\) has changed since it was applied/);
    const renamed = applied(2).map((row) => (row.version === 1 ? { ...row, name: "z" } : row));
    expect(() => pendingMigrations(files, renamed)).toThrow(/migration 1 \(z\) has changed/);
  });

  it("refuses an applied migration with no file", () => {
    expect(() => pendingMigrations(files.slice(0, 1), applied(2))).toThrow(
      /has migration 2 \(b\), and db\/migrations has no such file/,
    );
  });

  it("refuses applied migrations that don't run from 1 with no gap", () => {
    const [first, , third] = applied(3);
    if (!first || !third) throw new Error("no rows");
    expect(() => pendingMigrations(files, [first, third])).toThrow(/don't run from 1 with no gap/);
  });
});
