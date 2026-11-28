// The worker's entry as a process, with no database (ADR-013, T52, T56): the environment's value
// goes to the time module as it is, so a missing or mistyped one stops the worker; so does a missing
// or mistyped Supabase setting, before it connects; and a failure writes its message alone, never the
// database URL's password or Storage's key.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = join(import.meta.dirname, "main.ts");

/**
 * Runs the entry with `env` alone (and PATH), and returns its exit code and output. With `root`, as root: directly when
 * this process is root (the session), else through `sudo -n` (CI's runner, whose sudo needs no password), which fails
 * the test on a runner that can do neither, never skips it.
 */
function run(
  env: Record<string, string>,
  root = false,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const settings = { PATH: process.env.PATH ?? "", ...env };
  const [command, args, given] =
    !root || process.getuid?.() === 0
      ? [process.execPath, [ENTRY], settings]
      : [
          "sudo",
          [
            "-n",
            "/usr/bin/env",
            "-i",
            ...Object.entries(settings).map(([k, v]) => `${k}=${v}`),
            process.execPath,
            ENTRY,
          ],
          process.env,
        ];
  return new Promise((done, failed) => {
    const child = spawn(command, args, { env: given });
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
/** The photo safety provider, as fly.toml names it for dev (FQ8; the outside audit's B7). */
const SAFETY = { TADAYO_SAFETY_PROVIDER: "none" };

// Each test starts the entry as a process, some of them several times, and each start is given 20 seconds
// before it is killed (`run`); vitest's default of 5 seconds for a whole test is less than a few slow starts
// take on a busy runner (`ci` run 43183039976), so the tests here get the time their processes are given.
describe("the worker's entry (ADR-013)", { timeout: 60_000 }, () => {
  it("stops when TADAYO_ENVIRONMENT is missing, empty or neither dev nor prod", async () => {
    for (const environment of [undefined, "", "Dev", "staging", "production"]) {
      const result = await run({
        DATABASE_URL: NOWHERE,
        ...SUPABASE,
        ...SAFETY,
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

  it("stops before it connects when TADAYO_SAFETY_PROVIDER is missing, empty or names no provider it knows, echoing none", async () => {
    // Each environment names the provider that screens its photos (the outside audit's B7): none of these is one, and
    // the database's URL leads nowhere, so a worker that took any of them would fail later and say something else.
    const marker = `marker${randomBytes(8).toString("hex")}`;
    for (const [setting, said] of [
      [
        {},
        /^worker: TADAYO_SAFETY_PROVIDER isn't set: each environment names its photo safety provider \(none for the closed trial, FQ8\)\n$/,
      ],
      [{ TADAYO_SAFETY_PROVIDER: "" }, /^worker: TADAYO_SAFETY_PROVIDER isn't set/],
      [{ TADAYO_SAFETY_PROVIDER: "None" }, /^worker: TADAYO_SAFETY_PROVIDER names no provider the worker knows\n$/],
      [{ TADAYO_SAFETY_PROVIDER: " none" }, /^worker: TADAYO_SAFETY_PROVIDER names no provider the worker knows\n$/],
      [{ TADAYO_SAFETY_PROVIDER: "toString" }, /^worker: TADAYO_SAFETY_PROVIDER names no provider the worker knows\n$/],
      [{ TADAYO_SAFETY_PROVIDER: marker }, /^worker: TADAYO_SAFETY_PROVIDER names no provider the worker knows\n$/],
    ] as const) {
      const result = await run({ DATABASE_URL: NOWHERE, TADAYO_ENVIRONMENT: "prod", ...SUPABASE, ...setting });
      expect(result.code, JSON.stringify(setting)).toBe(1);
      expect(result.stderr, JSON.stringify(setting)).toMatch(said);
      expect(result.stdout + result.stderr).not.toContain(marker);
      expect(result.stdout).not.toMatch(/started/);
    }
  });

  it("stops before it connects when TADAYO_PHOTO_USER is set but it wasn't started as root with its own user effective", async () => {
    // This process is root (the session) or the runner's user (CI): neither is the start fly.toml gives the worker.
    const result = await run({
      DATABASE_URL: NOWHERE,
      TADAYO_ENVIRONMENT: "prod",
      ...SUPABASE,
      TADAYO_PHOTO_USER: "tadayo-image",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "worker: TADAYO_PHOTO_USER is set, but the worker wasn't started as root with its own user effective (fly.toml's worker command)\n",
    );
    expect(result.stdout).not.toMatch(/started/);
  });

  it("in the image (NODE_ENV=production), stops before it reads anything when started as root alone", async () => {
    // The audit's A6: a start as plain root prepared strangers' photos as root. The image sets TADAYO_PHOTO_USER (the
    // Dockerfile); with it or without it, a start that isn't fly.toml's worker command stops before its first setting
    // is read, here DATABASE_URL, which isn't given.
    for (const photo of [{ TADAYO_PHOTO_USER: "tadayo-image" }, {}]) {
      const result = await run({ NODE_ENV: "production", ...photo }, true);
      expect(result.code, JSON.stringify(photo)).toBe(1);
      // As root alone: root's ids, with what the kernel says of the rest after them (privileges.ts, startFactsSaid).
      expect(result.stderr, JSON.stringify(photo)).toMatch(
        /^worker: in production it starts only as fly\.toml's worker command starts it, root turned to its own user, never as root alone or as one user alone \(it found uid 0, euid 0, egid 0, NoNewPrivs [01], CapBnd [0-9a-f]{16}, CapInh [0-9a-f]{16}, Groups (?:[0-9 ]+|none)\)\n$/,
      );
      expect(result.stdout).toBe("");
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
      const result = await run({ DATABASE_URL: url, TADAYO_ENVIRONMENT: "prod", ...SUPABASE, ...SAFETY });
      expect(result.code, url).toBe(1);
      expect(result.stderr, url).not.toBe("");
      expect(result.stdout + result.stderr, url).not.toContain(marker);
      expect(result.stdout, url).not.toMatch(/started/);
    }
  });
});
