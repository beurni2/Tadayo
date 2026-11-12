// `onMachine` against a made-up `flyctl` (test/fake-fly.ts): a command run inside the API's Machine,
// where the Supabase service key is (docs/plans/api-b0-deploy.md, section 6; T56). `flyctl machine
// exec` exits 0 even when the command failed, so the exit code is read from its answer, which leaves
// out every field that is empty or zero (flyctl 0.5.8's source: Go's `omitempty`): a command that
// worked answers with no `exit_code`.

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

/** What `flyctl machine exec --json` prints: an empty `stdout` or `stderr` and a zero `exit_code` are left out. */
const answer = (stdout: string, stderr = "", exit_code = 0) =>
  json({
    ...(stdout === "" ? {} : { stdout }),
    ...(stderr === "" ? {} : { stderr }),
    ...(exit_code === 0 ? {} : { exit_code }),
  });

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
      "",
      "null",
      '"worked"',
      JSON.stringify([]),
      JSON.stringify({ exit_code: "0" }),
      JSON.stringify({ exit_code: null }),
      JSON.stringify({ exit_code: 1.5 }),
      JSON.stringify({ stdout: 1 }),
      JSON.stringify({ stdout: "x", stderr: null }),
      JSON.stringify({ exit_signal: "9" }),
      // A key flyctl doesn't print: a renamed `exit_code` must not read as a command that worked.
      JSON.stringify({ stdout: "x", exitCode: 1 }),
      JSON.stringify({ stdout: "x", status: "failed" }),
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

  it("reads a command that worked from an answer with no exit code, as flyctl leaves a zero out", async () => {
    const printedOnly = await run([
      [LIST, machines],
      [EXEC, { stdout: JSON.stringify({ stdout: "storage-setup: done\n" }) }],
    ]);
    expect(printedOnly.outcome).toBeUndefined();
    expect(printedOnly.said).toEqual(["storage-setup: done"]);

    const nothingPrinted = await run([
      [LIST, machines],
      [EXEC, { stdout: "{}" }],
    ]);
    expect(nothingPrinted.outcome).toBeUndefined();
    expect(nothingPrinted.said).toEqual([]);

    // The Machines API's own spelling, with the zeros in, reads the same.
    const spelledOut = await run([
      [LIST, machines],
      [EXEC, { stdout: JSON.stringify({ stdout: "ok\n", stderr: "", exit_code: 0, exit_signal: 0 }) }],
    ]);
    expect(spelledOut.outcome).toBeUndefined();
    expect(spelledOut.said).toEqual(["ok"]);
  });

  it("fails when the command was ended by a signal, even with no exit code in the answer", async () => {
    const result = await run([
      [LIST, machines],
      [EXEC, { stdout: JSON.stringify({ stderr: "killed\n", exit_signal: 9 }) }],
    ]);
    expect(result.said).toEqual(["killed"]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe("storage-setup: it was ended on the Machine by signal 9");
  });

  it("fails when the API has no started Machine, names the Machines there are, and runs nothing", async () => {
    const stopped = await run([[LIST, json([machine("a1", "api", "stopped"), machine("w1", "worker", "started")])]]);
    // A Machine that stopped on its own: deploying again won't start it, and the reason is in Fly's log.
    expect((stopped.outcome as OpsError).message).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: a1 (api, stopped), w1 (worker, started)); if it stopped on its own, Fly's log of tadayo-api-dev says why",
    );
    expect(stopped.calls).toEqual([LIST]);
    // No Machine at all, or a worker only: nothing has been deployed yet.
    const none = await run([[LIST, json([])]]);
    expect((none.outcome as OpsError).message).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: none); deploy first",
    );
    const workerOnly = await run([[LIST, json([machine("w1", "worker", "started")])]]);
    expect((workerOnly.outcome as OpsError).message).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: w1 (worker, started)); deploy first",
    );
    expect(none.calls).toEqual([LIST]);
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
