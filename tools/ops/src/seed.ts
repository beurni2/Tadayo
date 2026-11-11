// `seed`: applies the files in `db/seed/` to `dev`, as `tadayo_app` (docs/plans/B0.md, slice 10a;
// docs/TECH-DESIGN.md sections 3 and 9; ADR-021). The folder is where B1's fixture clubs and the
// spikes' few occurrences go; until the first of them it's empty, and `seed` says so.
//
// A seed file is test data for `dev`, so it can run again: it writes rows by fixed ids and says
// `ON CONFLICT DO NOTHING`, or removes what it wrote first. The runner doesn't remember which
// files it ran, unlike the migrations'. Seeds never read or change the founder's account or the
// tester's, or anything their accounts add (ADR-021, T52): that is for the review of each file.
//
// Each file runs in a transaction of its own, the way a migration does (migrate.ts) and for the
// same reasons: with the search path empty, so every name is written with its schema; as the body
// of one PL/pgSQL EXECUTE, where Postgres refuses BEGIN, COMMIT and ROLLBACK, so a file can't end
// the transaction before the schema is checked; and the schema `app` must still be closed to
// everyone but its owner afterwards (`closedProblems`, T53), or nothing of the file is kept.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";
import { closedProblems } from "./migrate.ts";
import { OpsError } from "./ops-error.ts";

export interface SeedFile {
  readonly name: string;
  readonly text: string;
}

const FILE_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** The seeds in `dir`, by name; none if the folder isn't there. Any other file there fails. */
export async function readSeeds(dir: string): Promise<SeedFile[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files: SeedFile[] = [];
  for (const entry of entries) {
    if (!FILE_NAME.test(entry)) throw new OpsError(`seed: ${entry} isn't a seed; name it words.sql (lower case)`);
    let text: string;
    try {
      text = UTF8.decode(await readFile(join(dir, entry)));
    } catch {
      throw new OpsError(`seed: ${entry} isn't UTF-8 text; save it as UTF-8`);
    }
    if (text.includes("\0")) throw new OpsError(`seed: ${entry} holds a NUL character, which Postgres can't take`);
    files.push({ name: entry, text });
  }
  return files;
}

/** Runs one seed in `tx`, the transaction `seed` opened for it, or throws and leaves it to roll back. */
export async function applySeed(tx: postgres.TransactionSql, file: SeedFile): Promise<void> {
  try {
    await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
    await tx`SELECT pg_catalog.set_config('tadayo.seed', ${file.text}, true)`;
    await tx.unsafe("DO $run$ BEGIN EXECUTE pg_catalog.current_setting('tadayo.seed'); END $run$").simple();
    await tx`SELECT pg_catalog.set_config('tadayo.seed', '', true)`;
    await tx.unsafe("SET CONSTRAINTS ALL IMMEDIATE; CLOSE ALL; DISCARD TEMP").simple();
    // Last, since the file may have set it: an operator found ahead of pg_catalog's would run in the check.
    await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EXECUTE of transaction commands is not implemented|invalid transaction termination/.test(message)) {
      throw new OpsError(
        `seed: ${file.name} begins, ends or splits its transaction (${message}); each file runs in one ` +
          "transaction of its own, and keeps nothing of this one",
        { cause: error },
      );
    }
    throw new OpsError(`seed: ${file.name} failed: ${message}`, { cause: error });
  }
  const problems = await closedProblems(tx);
  if (problems.length > 0) {
    throw new OpsError(`seed: ${file.name} would leave the schema app open (T53): ${problems.join("; ")}`);
  }
}

/** Applies every seed in `dir`, one transaction each, and returns the names it applied. */
export async function seed(sql: postgres.Sql, dir: string, say: (line: string) => void): Promise<string[]> {
  const files = await readSeeds(dir);
  const applied: string[] = [];
  for (const file of files) {
    await sql.begin((tx) => applySeed(tx, file));
    say(`seed: applied ${file.name}`);
    applied.push(file.name);
  }
  if (files.length === 0) say("seed: no seed files in db/seed yet");
  return applied;
}
