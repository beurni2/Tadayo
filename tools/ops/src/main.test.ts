// The `ops` entry as the runner and the Machine start it: `node tools/ops/src/main.ts <script> …`, a
// real process (docs/plans/B0.md, slices 10a and 10b; T52, T56). Every line it prints goes through the
// redactor, the error's too, a failure prints its message and never its stack, and a failure is exit
// code 1. A made-up `flyctl` is first on the child's PATH, so that what `flyctl` prints, which can hold
// a token, is what the entry has to hold back.

import { existsSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spawnProcess } from "./spawn.ts";

const MAIN = join(import.meta.dirname, "main.ts");
const REF = "abcdefghijklmnopqrst";
const REPO = join(import.meta.dirname, "..", "..", "..");
// Shaped like nothing the redactor's patterns know, so only the environment's own value holds it back.
const TOKEN = "unshaped-fly-token-value-0123456789";

/** A folder with a program called `name` that runs `script`, to put first on a child's PATH. */
async function tool(name: string, script: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tadayo-ops-bin-"));
  const file = join(dir, name);
  await writeFile(file, `#!/bin/sh\n${script}\n`);
  await chmod(file, 0o755);
  return dir;
}

const flyctl = (script: string) => tool("flyctl", script);

const entry = (args: string[], env: Record<string, string> = {}) =>
  spawnProcess(process.execPath, [MAIN, ...args], { env, timeoutMs: 30_000 });

describe("the ops entry", () => {
  it("names the scripts and fails, with nothing on standard output, when no script is named", async () => {
    const result = await entry([]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^ops: name a script; they are:\n {2}bootstrap: /);
    expect(result.stderr).toContain("\n  worker-scale: ");
  });

  it("names the scripts and fails when the one named isn't one", async () => {
    const result = await entry(["nonesuch"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^ops: no script is called "nonesuch"; they are:\n/);
  });

  it("holds back the environment's token from a failure's message, and prints no stack", async () => {
    const bin = await flyctl('echo "Error: the token $FLY_API_TOKEN was refused" >&2; exit 1');
    const result = await entry(["worker-scale", "--to", "stopped"], {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      FLY_API_TOKEN: TOKEN,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "couldn't list tadayo-api-dev's Machines: exit code 1: Error: the token [redacted] was refused\n",
    );
  });

  it("holds back the environment's token from a line a script says, and exits 0 when the script worked", async () => {
    const bin = await flyctl(`case "$2" in
  list) printf '%s' '[{"id":"a1","state":"started","config":{"metadata":{"fly_process_group":"api"}}}]' ;;
  exec) printf '{"stdout":"the key is %s"}' "$FLY_API_TOKEN" ;;
  *) echo "unexpected: $*" >&2; exit 2 ;;
esac`);
    const result = await entry(["storage-setup"], {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      FLY_API_TOKEN: TOKEN,
      SUPABASE_DEV_PROJECT_REF: REF,
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("the key is [redacted]\n");
    expect(result.code).toBe(0);
  });

  it("gives the scripts the repository's root: bootstrap names db/bootstrap.sql by its whole path", async () => {
    // A psql that says which file it was told to run, and fails, so that the entry prints it.
    const bin = await tool("psql", `grep "^.i " >&2; exit 3`);
    const password = "an-app-password-of-thirty-two-or-more-chars";
    const pooler = "aws-0-us-east-1.pooler.supabase.com:5432/postgres";
    const result = await entry(["bootstrap"], {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      DATABASE_ADMIN_URL: `postgresql://postgres.${REF}:an-admin-password@${pooler}`,
      DATABASE_URL: `postgresql://tadayo_app.${REF}:${password}@${pooler}`,
      DATABASE_APP_PASSWORD: password,
      SUPABASE_DEV_PROJECT_REF: REF,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    const named = /^bootstrap: psql failed \(exit 3\), nothing of the file is kept:\n\\i '(\/[^']+)'\n$/.exec(
      result.stderr,
    )?.[1];
    expect(named).toBe(join(REPO, "db", "bootstrap.sql"));
    expect(existsSync(named ?? "")).toBe(true);
  });

  it("prints a script's refusal as its own words, with no stack, and exits 1", async () => {
    // A script that is refused before it runs anything says its own words; none of them is a stack.
    const result = await entry(["worker-scale", "--to", "paused"], { FLY_API_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("worker-scale: --to takes stopped or started\n");
  });
});
