// The by-hand migrate entry (`migrate-cli.ts`) is for a local Postgres only: it asks for
// DATABASE_URL, and refuses a host that isn't local before it connects to anything, since `ops
// migrate` is what checks that a database is `tadayo-dev`'s, uses TLS and redacts what it prints.
// A real process is run: the file is a program, not a function.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "migrate-cli.ts");

function run(databaseUrl: string | undefined) {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "" };
  if (databaseUrl !== undefined) env["DATABASE_URL"] = databaseUrl;
  const done = spawnSync(process.execPath, [CLI], { env, encoding: "utf8", timeout: 20_000 });
  return { code: done.status, stdout: done.stdout, stderr: done.stderr };
}

describe("migrate-cli", () => {
  it("asks for DATABASE_URL, and exits 2 without it", () => {
    const result = run(undefined);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe("migrate: set DATABASE_URL to connect as tadayo_app\n");
  });

  it("refuses a host that isn't local, and points to ops migrate, before it connects, saying nothing of the string", () => {
    for (const host of [
      "aws-0-us-east-1.pooler.supabase.com:5432",
      "db.example.com",
      "10.0.0.5",
      "localhost.example.com",
    ]) {
      const result = run(`postgresql://tadayo_app.abcdefghijklmnopqrst:hunter2-hunter2@${host}/postgres`);
      expect(result.code, host).toBe(2);
      expect(result.stderr, host).toBe(
        "migrate: this entry is for a local Postgres, and DATABASE_URL names another host. For tadayo-dev, run ops migrate: node tools/ops/src/main.ts migrate\n",
      );
      expect(result.stdout + result.stderr, host).not.toContain("hunter2");
    }
  });
});
