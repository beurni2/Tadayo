// The worker's entry as a process, with no database (ADR-013, T52, T56): the environment's value
// goes to the time module as it is, so a missing or mistyped one stops the worker; so does a missing
// or mistyped Supabase setting, before it connects; and a failure writes its message alone, never the
// database URL's password or Storage's key.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = join(import.meta.dirname, "main.ts");

/** Runs the entry with `env` alone (and PATH), and returns its exit code and output. */
function run(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [ENTRY], { env: { PATH: process.env.PATH ?? "", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.on("error", failed);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}

/** A database URL to a port nothing answers on. */
const NOWHERE = "postgres://tadayo_app:password@127.0.0.1:1/tadayo";
/** Storage's settings, in the forms the worker takes; nothing is called with them here. */
const SUPABASE = {
  SUPABASE_URL: "https://tadayotestprojectref.supabase.co",
  SUPABASE_SERVICE_KEY: "sb_secret_testkeynotreal0000",
};

// Each test starts the entry as a process, some of them several times, and each start is given 20 seconds
// before it is killed (`run`); vitest's default of 5 seconds for a whole test is less than a few slow starts
// take on a busy runner (`ci` run 43183039976), so the tests here get the time their processes are given.
describe("the worker's entry (ADR-013)", { timeout: 60_000 }, () => {
  it("stops when TADAYO_ENVIRONMENT is missing, empty or neither dev nor prod", async () => {
    for (const environment of [undefined, "", "Dev", "staging", "production"]) {
      const result = await run({
        DATABASE_URL: NOWHERE,
        ...SUPABASE,
        ...(environment === undefined ? {} : { TADAYO_ENVIRONMENT: environment }),
      });
      expect(result.code, String(environment)).toBe(1);
      expect(result.stderr, String(environment)).toMatch(/not dev or prod/);
      expect(result.stdout, String(environment)).not.toMatch(/started/);
    }
  });

  it("stops when DATABASE_URL is missing", async () => {
    const result = await run({ TADAYO_ENVIRONMENT: "prod", ...SUPABASE });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/DATABASE_URL isn't set/);
  });

  it("stops before it connects when a Supabase setting is missing or isn't one, naming neither value", async () => {
    const marker = `marker${randomBytes(8).toString("hex")}`;
    for (const [settings, said] of [
      [{ SUPABASE_SERVICE_KEY: SUPABASE.SUPABASE_SERVICE_KEY }, /SUPABASE_URL isn't set/],
      [{ SUPABASE_URL: SUPABASE.SUPABASE_URL }, /SUPABASE_SERVICE_KEY isn't set/],
      [{ ...SUPABASE, SUPABASE_URL: `https://${marker}.example.com` }, /SUPABASE_URL isn't a project's URL/],
      [{ ...SUPABASE, SUPABASE_SERVICE_KEY: `${marker} ${marker}` }, /SUPABASE_SERVICE_KEY isn't a key/],
    ] as const) {
      const result = await run({ DATABASE_URL: NOWHERE, TADAYO_ENVIRONMENT: "prod", ...settings });
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(said);
      expect(result.stdout + result.stderr).not.toContain(marker);
      expect(result.stdout).not.toMatch(/started/);
    }
  });

  it("writes the failure's message alone, never the database URL's password (T52, T56)", async () => {
    const marker = `marker${randomBytes(8).toString("hex")}`;
    for (const url of [
      `postgres://tadayo_app:${marker}@127.0.0.1:notaport/tadayo`,
      `postgres://tadayo_app:${marker}%zz@127.0.0.1:1/tadayo`,
      `postgres://tadayo_app:${marker}@[::1/tadayo`,
      `postgres://tadayo_app:${marker}@127.0.0.1:1/tadayo`,
    ]) {
      const result = await run({ DATABASE_URL: url, TADAYO_ENVIRONMENT: "prod", ...SUPABASE });
      expect(result.code, url).toBe(1);
      expect(result.stderr, url).not.toBe("");
      expect(result.stdout + result.stderr, url).not.toContain(marker);
      expect(result.stdout, url).not.toMatch(/started/);
    }
  });
});
