// `seed`'s files, without a database: which are seeds, in what order, and what it says when there
// are none. Applying one, with Postgres, is tests/src/db/ops-seed.test.ts.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import { OpsError } from "./ops-error.ts";
import { readSeeds, seed } from "./seed.ts";

async function folder(files: Record<string, string | Uint8Array>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tadayo-seed-"));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

describe("readSeeds", () => {
  it("reads each file's text, by name", async () => {
    const dir = await folder({ "b_second.sql": "SELECT 2;", "a_first.sql": "SELECT 1;", "c.sql": "SELECT 3;" });
    expect(await readSeeds(dir)).toEqual([
      { name: "a_first.sql", text: "SELECT 1;" },
      { name: "b_second.sql", text: "SELECT 2;" },
      { name: "c.sql", text: "SELECT 3;" },
    ]);
  });

  it("finds none in a folder that isn't there yet", async () => {
    expect(await readSeeds(join(tmpdir(), "tadayo-no-such-seed-folder"))).toEqual([]);
  });

  it("refuses a file that isn't named like a seed, so nothing runs by accident", async () => {
    for (const name of [
      "README.md",
      "Upper.sql",
      "a-b.sql",
      "a.SQL",
      "a.sql.bak",
      ".hidden.sql",
      "a b.sql",
      "_a.sql",
    ]) {
      const dir = await folder({ [name]: "SELECT 1;" });
      await expect(readSeeds(dir), name).rejects.toThrow(OpsError);
    }
  });

  it("refuses text that isn't UTF-8 or holds a NUL, as the migrations do, so what runs is what was read", async () => {
    await expect(readSeeds(await folder({ "a.sql": new Uint8Array([0x53, 0xff, 0xfe]) }))).rejects.toThrow(/UTF-8/);
    await expect(readSeeds(await folder({ "a.sql": "SELECT 1;\0" }))).rejects.toThrow(/NUL/);
  });
});

describe("seed", () => {
  it("says there are none, and touches no database, when the folder has no files", async () => {
    const said: string[] = [];
    const sql = (() => {
      throw new Error("a database was used");
    }) as unknown as postgres.Sql;
    expect(await seed(sql, join(tmpdir(), "tadayo-no-such-seed-folder"), (line) => said.push(line))).toEqual([]);
    expect(said).toEqual(["seed: no seed files in db/seed yet"]);
  });
});
