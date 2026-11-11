// `tools/ops`' `seed` against Postgres, as `tadayo_app` (docs/plans/B0.md, slice 10a; T53): each
// file in a transaction of its own, with the search path empty, no way to end the transaction
// from inside, and the schema still closed afterwards. Nearly every test rolls back; the one that
// runs the whole folder commits a closed table of its own and drops it again.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySeed, OpsError, seed } from "@tadayo/ops";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appSql, rolledBack, type Tx } from "./harness.ts";

const app = appSql();
const DROP = "DROP TABLE IF EXISTS app.ops_seed_probe";
beforeAll(async () => {
  await app.unsafe(DROP);
});
afterAll(async () => {
  await app.unsafe(DROP);
  await app.end();
});

const CLOSED_TABLE = `
  CREATE TABLE app.ops_seed_probe (n integer PRIMARY KEY);
  ALTER TABLE app.ops_seed_probe ENABLE ROW LEVEL SECURITY;
  INSERT INTO app.ops_seed_probe (n) VALUES (1);
`;

async function exists(tx: Tx | typeof app, name: string): Promise<boolean> {
  const [row] = await tx<{ present: boolean }[]>`SELECT pg_catalog.to_regclass(${name}) IS NOT NULL AS present`;
  return row?.present === true;
}

describe("applySeed", () => {
  it("runs the file in the caller's transaction", async () => {
    await rolledBack(app, async (tx) => {
      await applySeed(tx, { name: "probe.sql", text: CLOSED_TABLE });
      const [row] = await tx<{ n: number }[]>`SELECT n FROM app.ops_seed_probe`;
      expect(row?.n).toBe(1);
    });
    expect(await exists(app, "app.ops_seed_probe")).toBe(false);
  });

  it("runs it with the search path empty, so every name must carry its schema", async () => {
    await rolledBack(app, async (tx) => {
      await expect(
        applySeed(tx, { name: "bare.sql", text: "CREATE TABLE ops_seed_bare (x integer);" }),
      ).rejects.toThrow(/seed: bare\.sql failed/);
    });
  });

  it("runs it with the search path empty even when the connection's isn't: a file that reads it finds it empty", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe("SET LOCAL search_path = public, pg_catalog");
      await applySeed(tx, {
        name: "reads.sql",
        text: "SELECT pg_catalog.set_config('tadayo.seen_path', pg_catalog.current_setting('search_path'), true);",
      });
      const [row] = await tx<{ seen: string }[]>`SELECT pg_catalog.current_setting('tadayo.seen_path') AS seen`;
      expect(row?.seen).toBe("");
    });
  });

  it("leaves nothing of the file in the session: its text is cleared, and so is the search path it may have set", async () => {
    await rolledBack(app, async (tx) => {
      await applySeed(tx, { name: "path.sql", text: "SELECT pg_catalog.set_config('search_path', 'public', true);" });
      const [row] = await tx<{ text: string; path: string }[]>`
        SELECT pg_catalog.current_setting('tadayo.seed') AS text, pg_catalog.current_setting('search_path') AS path`;
      expect(row).toEqual({ text: "", path: "" });
    });
  });

  it("refuses a file that would leave the schema open, and names it (T53)", async () => {
    await rolledBack(app, async (tx) => {
      const text = "CREATE TABLE app.ops_seed_open (x integer);";
      await expect(applySeed(tx, { name: "open.sql", text })).rejects.toThrow(
        /seed: open\.sql would leave the schema app open.*ops_seed_open/,
      );
    });
  });

  it("refuses a file that begins, ends or splits the transaction, which would keep what it wrote before the check", async () => {
    for (const text of [
      "COMMIT;",
      "ROLLBACK;",
      "BEGIN; SELECT 1; COMMIT;",
      "SAVEPOINT a;",
      `${CLOSED_TABLE} COMMIT;`,
    ]) {
      await rolledBack(app, async (tx) => {
        await expect(applySeed(tx, { name: "ends.sql", text }), text).rejects.toThrow(
          /begins, ends or splits its transaction/,
        );
      });
    }
    expect(await exists(app, "app.ops_seed_probe")).toBe(false);
  });

  it("names the file when its own SQL fails", async () => {
    await rolledBack(app, async (tx) => {
      await expect(applySeed(tx, { name: "broken.sql", text: "SELECT 1/0;" })).rejects.toThrow(
        /seed: broken\.sql failed: division by zero/,
      );
    });
  });
});

describe("seed, the folder", () => {
  it("applies the files in name order, one transaction each: a failing file keeps nothing, the earlier ones stay", async () => {
    await app.unsafe(DROP);
    const dir = await mkdtemp(join(tmpdir(), "tadayo-seed-db-"));
    await writeFile(join(dir, "a_probe.sql"), CLOSED_TABLE);
    await writeFile(join(dir, "b_broken.sql"), "INSERT INTO app.ops_seed_probe (n) VALUES (2); SELECT 1/0;");
    await writeFile(join(dir, "c_never.sql"), "INSERT INTO app.ops_seed_probe (n) VALUES (3);");
    const said: string[] = [];
    await expect(seed(app, dir, (line) => said.push(line))).rejects.toThrow(/seed: b_broken\.sql failed/);
    expect(said).toEqual(["seed: applied a_probe.sql"]);
    const rows = await app<{ n: number }[]>`SELECT n FROM app.ops_seed_probe ORDER BY n`;
    expect(rows.map((row) => row.n)).toEqual([1]);
  });

  it("runs the same files again when it is run again, and says what it applied", async () => {
    await app.unsafe(DROP);
    const dir = await mkdtemp(join(tmpdir(), "tadayo-seed-db-"));
    await writeFile(
      join(dir, "a_probe.sql"),
      `CREATE TABLE IF NOT EXISTS app.ops_seed_probe (n integer PRIMARY KEY);
       ALTER TABLE app.ops_seed_probe ENABLE ROW LEVEL SECURITY;
       INSERT INTO app.ops_seed_probe (n) VALUES (7) ON CONFLICT DO NOTHING;`,
    );
    const said: string[] = [];
    expect(await seed(app, dir, (line) => said.push(line))).toEqual(["a_probe.sql"]);
    expect(await seed(app, dir, (line) => said.push(line))).toEqual(["a_probe.sql"]);
    expect(said).toEqual(["seed: applied a_probe.sql", "seed: applied a_probe.sql"]);
    const rows = await app<{ n: number }[]>`SELECT n FROM app.ops_seed_probe`;
    expect(rows.map((row) => row.n)).toEqual([7]);
  });

  it("throws an OpsError for a folder with something that isn't a seed in it, applying nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tadayo-seed-db-"));
    await writeFile(join(dir, "a_probe.sql"), CLOSED_TABLE);
    await writeFile(join(dir, "README.md"), "not a seed");
    await expect(seed(app, dir, () => undefined)).rejects.toThrow(OpsError);
  });
});
