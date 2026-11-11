// `onMachine` against a made-up `flyctl` (test/fake-fly.ts): a command run inside the API's Machine,
// where the Supabase service key is (docs/plans/api-b0-deploy.md, section 6; T56). `flyctl machine
// exec` exits 0 even when the command failed, so the exit code is read from its answer.

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, lineOf, machine, type Route } from "../test/fake-fly.ts";
import { flyOf } from "./fly.ts";
import { onMachine } from "./on-machine.ts";
import { OpsError } from "./ops-error.ts";

const LIST = "flyctl machine list -a tadayo-api-dev --json";
const COMMAND = ["node", "/app/tools/ops/src/main.ts", "storage-setup", "--here", "--ref", "abcdefghijklmnopqrst"];
const EXEC = `flyctl machine exec a1 ${COMMAND.join(" ")} -a tadayo-api-dev --json --timeout 300`;
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };

const machines = json([machine("w1", "worker", "started"), machine("a1", "api", "started")]);

async function run(routes: readonly Route[], command: readonly string[] = COMMAND) {
  const { spawn, calls } = fakeSpawn(routes);
  const said: string[] = [];
  const outcome = await onMachine({
    fly: flyOf(spawn, ENV),
    label: "storage-setup",
    command,
    say: (line) => said.push(line),
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, said, outcome };
}

const answer = (stdout: string, stderr = "", exit_code = 0) => json({ stdout, stderr, exit_code, exit_signal: 0 });

describe("onMachine", () => {
  it("runs the command in the API's started Machine, as one string, and says what it printed", async () => {
    const result = await run([
      [LIST, machines],
      [EXEC, answer("first\nsecond\n", "a warning\n")],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, EXEC]);
    expect(result.raw[1]?.args).toEqual([
      "machine",
      "exec",
      "a1",
      COMMAND.join(" "),
      "-a",
      "tadayo-api-dev",
      "--json",
      "--timeout",
      "300",
    ]);
    expect(result.said).toEqual(["first", "second", "a warning"]);
  });

  it("gives the call a little longer than it gave the command, and flyctl the token and nothing else", async () => {
    const result = await run([
      [LIST, machines],
      [EXEC, answer("")],
    ]);
    expect(result.raw[1]?.options.timeoutMs).toBe(330_000);
    for (const call of result.raw)
      expect(call.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
  });

  it("fails, with the exit code and after saying what the command printed, when the command failed", async () => {
    const result = await run([
      [LIST, machines],
      [EXEC, answer("half of it\n", "set SUPABASE_SERVICE_KEY\n", 1)],
    ]);
    expect(result.said).toEqual(["half of it", "set SUPABASE_SERVICE_KEY"]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe("storage-setup: it failed on the Machine, with exit code 1");
  });

  it("fails when flyctl can't run it, saying why, or answers with something it can't read", async () => {
    const refused = await run([
      [LIST, machines],
      [EXEC, { code: 1, stderr: "Error: machine is not running" }],
    ]);
    expect((refused.outcome as OpsError).message).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: machine is not running",
    );
    for (const stdout of [
      "not json",
      JSON.stringify({ stdout: "x" }),
      JSON.stringify({ exit_code: "0" }),
      JSON.stringify([]),
    ]) {
      const result = await run([
        [LIST, machines],
        [EXEC, { stdout }],
      ]);
      expect((result.outcome as OpsError).message, stdout).toBe(
        "storage-setup: flyctl's answer about the command isn't one it can read",
      );
    }
  });

  it("fails when the API has no started Machine, and runs nothing", async () => {
    const stopped = await run([[LIST, json([machine("a1", "api", "stopped"), machine("w1", "worker", "started")])]]);
    expect((stopped.outcome as OpsError).message).toBe("storage-setup: the API has no started Machine; deploy first");
    expect(stopped.calls).toEqual([LIST]);
  });

  it("takes only plain words for the command, so nothing in it is read as anything else", async () => {
    for (const command of [
      [],
      ["node", ""],
      ["node", "a b"],
      ["node", "x;rm"],
      ["node", "$(id)"],
      ["node", "a\nb"],
      ["node", "'x'"],
    ]) {
      const result = await run([], command);
      expect(result.outcome, JSON.stringify(command)).toBeInstanceOf(OpsError);
      expect(result.calls, JSON.stringify(command)).toEqual([]);
    }
  });
});
