// The API's entry as a process, with no database (ADR-013, T52, T56): the environment's value goes
// to the time module as it is, so a missing or mistyped one stops the API before it listens, and a
// failure writes its message alone, never the database URL's password. The same holds for the Supabase
// project's URL (a token is believed only against the right project's keys) and the log level.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = join(import.meta.dirname, "main.ts");

/** Runs the entry with `env` alone (and PATH), and returns its exit code and output. */
function run(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [ENTRY], { env: { PATH: process.env.PATH ?? "", PORT: "0", ...env } });
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

/** A Supabase project's URL, shaped as theirs are (20 lowercase letters), which nothing here ever fetches. */
const PROJECT = "https://abcdefghijklmnopqrst.supabase.co";

/** The settings that are right, to which a test adds the one that is wrong. */
const RIGHT = { DATABASE_URL: NOWHERE, SUPABASE_URL: PROJECT, TADAYO_ENVIRONMENT: "prod" };

describe("the API's entry (ADR-013)", () => {
  it("stops before it listens when TADAYO_ENVIRONMENT is missing, empty or neither dev nor prod", async () => {
    for (const environment of [undefined, "", "Dev", "staging", "production"]) {
      const result = await run({
        DATABASE_URL: NOWHERE,
        SUPABASE_URL: PROJECT,
        ...(environment === undefined ? {} : { TADAYO_ENVIRONMENT: environment }),
      });
      expect(result.code, String(environment)).toBe(1);
      expect(result.stderr, String(environment)).toMatch(/not dev or prod/);
      expect(result.stdout, String(environment)).not.toMatch(/listening/);
    }
  });

  it("stops before it connects when PORT is set but isn't a port: empty, a word, too big, or not whole", async () => {
    for (const port of ["", "abc", "65536", "80.5", " 8080", "-1"]) {
      const result = await run({ ...RIGHT, PORT: port });
      expect(result.code, JSON.stringify(port)).toBe(1);
      expect(result.stderr, JSON.stringify(port)).toMatch(/PORT isn't a port/);
      expect(result.stdout, JSON.stringify(port)).not.toMatch(/listening/);
    }
  });

  it("stops before it listens when DATABASE_URL is missing", async () => {
    const result = await run({ SUPABASE_URL: PROJECT, TADAYO_ENVIRONMENT: "prod" });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/DATABASE_URL isn't set/);
    expect(result.stdout).not.toMatch(/listening/);
  });

  it("stops before it connects when SUPABASE_URL is missing or empty, so it never runs believing no token", async () => {
    for (const value of [undefined, ""]) {
      const rest = Object.fromEntries(Object.entries(RIGHT).filter(([name]) => name !== "SUPABASE_URL"));
      const result = await run({ ...rest, ...(value === undefined ? {} : { SUPABASE_URL: value }) });
      expect(result.code, String(value)).toBe(1);
      expect(result.stderr, String(value)).toMatch(/SUPABASE_URL isn't set/);
      expect(result.stdout, String(value)).not.toMatch(/listening/);
    }
  });

  it("stops when SUPABASE_URL isn't exactly a project's URL, and never repeats what it was given", async () => {
    const marker = `marker${randomBytes(8).toString("hex")}`;
    for (const value of [
      "abcdefghijklmnopqrst.supabase.co",
      "http://abcdefghijklmnopqrst.supabase.co",
      "https://abcdefghijklmnopqrst.supabase.co/auth/v1",
      "https://abcdefghijklmnopqrst.supabase.co:8443",
      `https://user:${marker}@abcdefghijklmnopqrst.supabase.co`,
      `https://abcdefghijklmnopqrst.supabase.co/?key=${marker}`,
      "https://supabase.com/dashboard/project/abcdefghijklmnopqrst",
      "https://ABCDEFGHIJKLMNOPQRST.supabase.co.evil.example",
      marker,
    ]) {
      const result = await run({ ...RIGHT, SUPABASE_URL: value });
      expect(result.code, value).toBe(1);
      expect(result.stderr, value).toMatch(/SUPABASE_URL isn't/);
      expect(result.stdout + result.stderr, value).not.toContain(marker);
      expect(result.stdout, value).not.toMatch(/listening/);
    }
  });

  it("stops before it connects when LOG_LEVEL is set but isn't one of pino's levels, so a typo never silences the logs", async () => {
    for (const level of ["", "verbose", "INFO", "warning", " info"]) {
      const result = await run({ ...RIGHT, LOG_LEVEL: level });
      expect(result.code, JSON.stringify(level)).toBe(1);
      expect(result.stderr, JSON.stringify(level)).toMatch(/LOG_LEVEL isn't a log level/);
      expect(result.stdout, JSON.stringify(level)).not.toMatch(/listening/);
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
      const result = await run({ ...RIGHT, DATABASE_URL: url });
      expect(result.code, url).toBe(1);
      expect(result.stderr, url).not.toBe("");
      expect(result.stdout + result.stderr, url).not.toContain(marker);
      expect(result.stdout, url).not.toMatch(/listening/);
    }
  });
});
