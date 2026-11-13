// `bootstrap` without a database: what it hands psql, and what it never does (T56). The database
// side, with the real psql and Postgres, is tests/src/db/ops-bootstrap.test.ts.

import { describe, expect, it } from "vitest";
import { runBootstrap, SHORTEST_PASSWORD } from "./bootstrap.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawn, SpawnOptions } from "./spawn.ts";

const PASSWORD = "a-random-password-of-more-than-32-characters";
const FILE = "/repo/db/bootstrap.sql";
const PG_ENV = {
  PGHOST: "db.example",
  PGUSER: "postgres.x",
  PGPASSWORD: "the-admin-password",
  PGSSLMODE: "verify-full",
};

interface Call {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
}

function recording(result: { code: number | null; stderr?: string; stdout?: string; timedOut?: boolean }) {
  const calls: Call[] = [];
  const spawn: Spawn = (command, args, options = {}) => {
    calls.push({ command, args, options });
    return Promise.resolve({
      code: result.code,
      timedOut: result.timedOut ?? false,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    });
  };
  return { calls, spawn };
}

describe("runBootstrap", () => {
  it("runs psql with the admin's connection in its environment and the file as a script on standard input", async () => {
    const { calls, spawn } = recording({ code: 0 });
    await runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file: FILE, spawn });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.command).toBe("psql");
    expect(call?.args).toEqual(["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", "-"]);
    expect(call?.options.env).toEqual(PG_ENV);
    // psql is cut off after two minutes, as the message for a timeout says.
    expect(call?.options.timeoutMs).toBe(120_000);
    expect(call?.options.input).toMatch(
      /^\\set app_password 'SCRAM-SHA-256\$4096:[^']+'\n\\i '\/repo\/db\/bootstrap\.sql'\n$/,
    );
  });

  it("puts the password nowhere: not in an argument, not in the environment, not in the script", async () => {
    const { calls, spawn } = recording({ code: 0 });
    await runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file: FILE, spawn });
    const everything = JSON.stringify(calls.map((call) => [call.command, call.args, call.options.env]));
    expect(everything).not.toContain(PASSWORD);
    expect(calls[0]?.options.input ?? "").not.toContain(PASSWORD);
    // The verifier is in the script alone.
    expect(everything).not.toContain("SCRAM-SHA-256");
  });

  it("sends a different verifier each time, since each has a salt of its own", async () => {
    const scripts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { calls, spawn } = recording({ code: 0 });
      await runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file: FILE, spawn });
      scripts.push(calls[0]?.options.input ?? "");
    }
    expect(scripts[0]).not.toBe(scripts[1]);
  });

  it("refuses a password that is short or not printable ASCII before it starts anything, by name", async () => {
    for (const password of [
      "",
      "short",
      "x".repeat(SHORTEST_PASSWORD - 1),
      `${"x".repeat(40)}ä`,
      `${"x".repeat(40)}\n`,
    ]) {
      const { calls, spawn } = recording({ code: 0 });
      await expect(
        runBootstrap({ pgEnv: PG_ENV, password, file: FILE, spawn }),
        JSON.stringify(password),
      ).rejects.toThrow(/DATABASE_APP_PASSWORD/);
      expect(calls).toHaveLength(0);
    }
  });

  it("takes a password of exactly 32 characters, the founder's minimum, and refuses one of 31", async () => {
    // The number is the plan's (docs/plans/B0.md, section 1.3), written here and not read from the code.
    expect(SHORTEST_PASSWORD).toBe(32);
    const { calls, spawn } = recording({ code: 0 });
    await runBootstrap({ pgEnv: PG_ENV, password: "x".repeat(32), file: FILE, spawn });
    expect(calls).toHaveLength(1);
    await expect(runBootstrap({ pgEnv: PG_ENV, password: "x".repeat(31), file: FILE, spawn })).rejects.toThrow(
      /DATABASE_APP_PASSWORD/,
    );
    expect(calls).toHaveLength(1);
  });

  it("refuses a file path that isn't plain, which would end its quotes", async () => {
    for (const file of ["bootstrap.sql", "/repo/it's/bootstrap.sql", "/repo/a b/bootstrap.sql", "/repo/\nx.sql", ""]) {
      const { calls, spawn } = recording({ code: 0 });
      await expect(runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file, spawn }), file).rejects.toThrow(OpsError);
      expect(calls).toHaveLength(0);
    }
  });

  it("fails with psql's own words when it exits non-zero, holding back the password and the verifier it was given", async () => {
    let sent = "";
    const spawn: Spawn = (_command, _args, options = {}) => {
      sent = options.input ?? "";
      const verifier = /'(SCRAM-SHA-256\$[^']+)'/.exec(sent)?.[1] ?? "";
      return Promise.resolve({
        code: 3,
        timedOut: false,
        stdout: "",
        stderr: `psql:<stdin>:2: ERROR:  bad thing near '${verifier}' and ${PASSWORD}\nLINE 1: ALTER ROLE tadayo_app WITH LOGIN PASSWORD '${verifier}'\n`,
      });
    };
    let message = "";
    try {
      await runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file: FILE, spawn });
    } catch (error) {
      expect(error).toBeInstanceOf(OpsError);
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("ERROR:  bad thing");
    expect(message).toContain("exit 3");
    expect(message).not.toContain(PASSWORD);
    expect(message).not.toMatch(/SCRAM-SHA-256/);
    expect(sent).toContain("SCRAM-SHA-256");
  });

  it("says when psql isn't there, and when it doesn't finish", async () => {
    await expect(
      runBootstrap({ pgEnv: PG_ENV, password: PASSWORD, file: FILE, spawn: recording({ code: 127 }).spawn }),
    ).rejects.toThrow(/psql isn't installed/);
    await expect(
      runBootstrap({
        pgEnv: PG_ENV,
        password: PASSWORD,
        file: FILE,
        spawn: recording({ code: null, timedOut: true }).spawn,
      }),
    ).rejects.toThrow(/didn't finish/);
  });
});
