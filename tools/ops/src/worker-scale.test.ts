// `worker-scale` against a made-up `flyctl` (test/fake-fly.ts): the one worker Machine of
// `tadayo-api-dev` stopped and started, never the API's, and the state checked afterwards rather than
// assumed. Fly leaves a Machine that was stopped by hand stopped across deploys (docs/plans/
// api-b0-deploy.md, section 6), so this is how a spike pauses the worker.

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, lineOf, machine, type Route } from "../test/fake-fly.ts";
import { flyOf } from "./fly.ts";
import { OpsError } from "./ops-error.ts";
import { workerScale } from "./worker-scale.ts";

const LIST = "flyctl machine list -a tadayo-api-dev --json";
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };

async function run(to: "stopped" | "started", routes: readonly Route[]) {
  const { spawn, calls } = fakeSpawn(routes);
  const said: string[] = [];
  const slept: number[] = [];
  const outcome = await workerScale({
    fly: flyOf(spawn, ENV),
    to,
    say: (line) => said.push(line),
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, said, slept, outcome };
}

/** The worker's states over successive lists, the API's Machine started throughout. */
const worker = (...states: string[]): Route => [
  LIST,
  (_call, earlier) =>
    json([
      machine("a1", "api", "started"),
      machine("w1", "worker", states[Math.min(earlier, states.length - 1)] ?? "started"),
    ]),
];

describe("workerScale to stopped", () => {
  it("stops the worker Machine and not the API's, then reads its state", async () => {
    const result = await run("stopped", [worker("started", "stopped"), ["flyctl machine stop", {}]]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, "flyctl machine stop w1 -a tadayo-api-dev -s SIGTERM", LIST]);
    expect(result.said).toEqual([
      "worker-scale: stopping the worker Machine",
      "worker-scale: the worker Machine is stopped",
    ]);
  });

  it("waits while it stops, a few seconds at a time", async () => {
    const result = await run("stopped", [
      worker("started", "stopping", "stopping", "stopped"),
      ["flyctl machine stop", {}],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.slept).toEqual([3000, 3000]);
    expect(result.calls.filter((call) => call === LIST)).toHaveLength(4);
  });

  it("says what it found when the Machine isn't stopped in time, and not that it is", async () => {
    const result = await run("stopped", [worker("started", "stopping"), ["flyctl machine stop", {}]]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: the worker Machine is stopping, 30 seconds after it was told to stop",
    );
    expect(result.slept).toHaveLength(10);
    expect(result.said).not.toContain("worker-scale: the worker Machine is stopped");
  });

  it("does nothing to a Machine that is stopped already, or only waits for one that is on its way", async () => {
    const already = await run("stopped", [worker("stopped")]);
    expect(already.calls).toEqual([LIST]);
    expect(already.said).toEqual(["worker-scale: the worker Machine is already stopped"]);
    const waiting = await run("stopped", [worker("stopping", "stopped")]);
    expect(waiting.outcome).toBeUndefined();
    expect(waiting.calls.filter((call) => call.startsWith("flyctl machine stop"))).toEqual([]);
  });

  it("takes a suspended Machine as stopped", async () => {
    const result = await run("stopped", [worker("suspended")]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST]);
  });
});

describe("workerScale to started", () => {
  it("starts a stopped worker Machine and reads its state", async () => {
    const result = await run("started", [worker("stopped", "started"), ["flyctl machine start", {}]]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, "flyctl machine start w1 -a tadayo-api-dev", LIST]);
    expect(result.said).toEqual([
      "worker-scale: starting the worker Machine",
      "worker-scale: the worker Machine is started",
    ]);
  });

  it("does nothing to one that is started already", async () => {
    const result = await run("started", [worker("started")]);
    expect(result.calls).toEqual([LIST]);
    expect(result.said).toEqual(["worker-scale: the worker Machine is already started"]);
  });
});

describe("workerScale refuses", () => {
  it("an app with no worker Machine, or two (a standby would start with it), changing nothing", async () => {
    const none = await run("stopped", [[LIST, json([machine("a1", "api", "started")])]]);
    expect((none.outcome as OpsError).message).toBe("worker-scale: the app has no worker Machine; deploy first");
    const two = await run("started", [
      [LIST, json([machine("w1", "worker", "stopped"), machine("w2", "worker", "stopped")])],
    ]);
    expect((two.outcome as OpsError).message).toBe(
      "worker-scale: the app has 2 worker Machines, and dev has one: nothing was changed",
    );
    expect(two.calls).toEqual([LIST]);
  });

  it("a Machine in a state it has no move for, changing nothing", async () => {
    const result = await run("started", [worker("destroying")]);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: the worker Machine is destroying: nothing was changed",
    );
    expect(result.calls).toEqual([LIST]);
  });

  it("an answer it can't read, with flyctl's own words and never the token", async () => {
    const failed = await run("stopped", [
      [LIST, { code: 1, stderr: `Error: no access with ${FAKE_FLY_TOKEN}\nsecond line` }],
    ]);
    expect(failed.outcome).toBeInstanceOf(OpsError);
    expect((failed.outcome as OpsError).message).toMatch(
      /^couldn't list tadayo-api-dev's Machines: exit code 1: Error: no access with /,
    );
    const notAList = await run("stopped", [[LIST, json({ id: "x" })]]);
    expect((notAList.outcome as OpsError).message).toBe("flyctl's list of tadayo-api-dev's Machines isn't a list");
    const noState = await run("stopped", [[LIST, json([{ id: "w1" }])]]);
    expect((noState.outcome as OpsError).message).toMatch(/no id or no state/);
  });

  it("a stop that flyctl refuses, saying so and not that the Machine is stopped", async () => {
    const result = await run("stopped", [
      worker("started"),
      ["flyctl machine stop", { code: 1, stderr: "Error: machine is locked" }],
    ]);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: flyctl couldn't stop the worker Machine: exit code 1: Error: machine is locked",
    );
    expect(result.said).not.toContain("worker-scale: the worker Machine is stopped");
  });
});

describe("workerScale calls flyctl", () => {
  it("with the Fly token and HOME and nothing else, and names the app in every call", async () => {
    const result = await run("stopped", [worker("started", "stopped"), ["flyctl machine stop", {}]]);
    for (const call of result.raw) {
      expect(call.command).toBe("flyctl");
      expect(call.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
      expect(call.args).toContain("tadayo-api-dev");
    }
    expect(JSON.stringify(result.said)).not.toContain(FAKE_FLY_TOKEN);
  });
});
