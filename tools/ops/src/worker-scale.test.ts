// `worker-scale` against a made-up `flyctl` (test/fake-fly.ts): the one worker Machine of
// `tadayo-api-dev` stopped and started, never the API's, and the state checked afterwards rather than
// assumed. Fly leaves a Machine that was stopped by hand stopped across deploys (docs/plans/
// api-b0-deploy.md, section 6), so this is how a spike pauses the worker.

import { describe, expect, it } from "vitest";
import {
  eventRow,
  FAKE_FLY_TOKEN,
  fakeSpawn,
  json,
  lineOf,
  logEntries,
  machine,
  machineStatus,
  type Route,
  WORKER_ID,
} from "../test/fake-fly.ts";
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

/** The same, for the worker Machine by a real Machine's id, whose events and log a start reads. */
const realWorker = (...states: string[]): Route => [
  LIST,
  (_call, earlier) =>
    json([
      machine("a1", "api", "started"),
      machine(WORKER_ID, "worker", states[Math.min(earlier, states.length - 1)] ?? "started"),
    ]),
];
const STATUS = `flyctl machine status ${WORKER_ID} -a tadayo-api-dev`;
const LOGS = `flyctl logs -a tadayo-api-dev --machine ${WORKER_ID} --no-tail --json`;
const START = `flyctl machine start ${WORKER_ID} -a tadayo-api-dev`;
/** The worker's events before the start: stopped by hand, and an old crash, both from before. */
const OLD = [
  eventRow("stopped", "exit", "2026-11-25T02:52:00.000Z", { code: 0, requested: true }),
  eventRow("exited", "exit", "2026-11-25T02:50:12.000Z", { code: 1 }),
];
/** The Machine's events, the first answer before the start and the second after it. */
const events = (after: readonly string[]): Route => [
  STATUS,
  (_call, earlier) => machineStatus(WORKER_ID, earlier === 0 ? OLD : [...after, ...OLD]),
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
  it("starts a stopped worker Machine, watches it for 30 seconds, and prints its events and its log", async () => {
    const result = await run("started", [
      realWorker("stopped", "started"),
      events([eventRow("started", "start", "2026-11-25T05:00:01.000Z")]),
      [START, {}],
      [
        LOGS,
        logEntries([
          "worker: started, making days every minute and preparing uploads, each photo under a user of its own",
        ]),
      ],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, STATUS, START, LIST, LIST, LIST, LIST, LIST, LIST, LIST, STATUS, LOGS]);
    expect(result.slept).toEqual([5000, 5000, 5000, 5000, 5000, 5000]);
    expect(result.said[0]).toBe("worker-scale: starting the worker Machine");
    expect(result.said).toContain(`worker-scale: Machine ${WORKER_ID}'s last lines in Fly's log:`);
    expect(result.said).toContain(
      "  2026-11-25T02:50:00.000Z [info] worker: started, making days every minute and preparing uploads, each photo under a user of its own",
    );
    expect(result.said.at(-1)).toBe("worker-scale: the worker Machine is started, and stayed started for 30 seconds");
  });

  it("fails a start whose process exits by itself and is started again, though the Machine shows as started", async () => {
    const result = await run("started", [
      realWorker("stopped", "started"),
      events([
        eventRow("started", "start", "2026-11-25T05:00:04.000Z"),
        eventRow("exited", "exit", "2026-11-25T05:00:03.000Z", { code: 1 }),
        eventRow("started", "start", "2026-11-25T05:00:01.000Z"),
      ]),
      [START, {}],
      [LOGS, logEntries(["worker: the photo user's processes couldn't all be ended as it started"])],
    ]);
    expect(result.outcome).toBeInstanceOf(OpsError);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: the worker Machine started, but its process exited by itself within 30 seconds (exit code 1) and Fly started it again; its events and its lines in Fly's log are above",
    );
    expect(result.said).toContain(
      "  2026-11-25T02:50:00.000Z [info] worker: the photo user's processes couldn't all be ended as it started",
    );
    expect(result.said).not.toContain("worker-scale: the worker Machine is started, and stayed started for 30 seconds");
  });

  it("counts only the start's own exits: an old crash and a stop asked for, from before, don't fail it", async () => {
    const result = await run("started", [
      realWorker("stopped", "started"),
      events([]),
      [START, {}],
      [LOGS, logEntries([])],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.said).toContain(`worker-scale: Fly's log holds no line of Machine ${WORKER_ID}`);
  });

  it("doesn't count an exit Fly was asked for, such as a restart asked for during the watch, as a failed start", async () => {
    const result = await run("started", [
      realWorker("stopped", "started"),
      events([
        eventRow("started", "start", "2026-11-25T05:00:09.000Z"),
        eventRow("exited", "exit", "2026-11-25T05:00:08.000Z", { code: 0, requested: true }),
        eventRow("started", "start", "2026-11-25T05:00:01.000Z"),
      ]),
      [START, {}],
      [LOGS, logEntries([])],
    ]);
    expect(result.outcome).toBeUndefined();
    expect(result.said.at(-1)).toBe("worker-scale: the worker Machine is started, and stayed started for 30 seconds");
  });

  it("fails a start that stops within the watch, saying the state it found, after the events and the log", async () => {
    const result = await run("started", [
      realWorker("stopped", "started", "started", "stopped"),
      events([eventRow("exited", "exit", "2026-11-25T05:00:03.000Z", { code: 1 })]),
      [START, {}],
      [LOGS, logEntries(["worker: TADAYO_PHOTO_USER is set, but the worker wasn't started as root"])],
    ]);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: the worker Machine started, then was stopped within 30 seconds; its events and its lines in Fly's log are above",
    );
    expect(result.slept).toEqual([5000, 5000]);
    expect(result.said.some((line) => line.includes("wasn't started as root"))).toBe(true);
  });

  it("prints the events and the log when the Machine never shows as started", async () => {
    const result = await run("started", [
      realWorker("stopped", "starting"),
      events([]),
      [START, {}],
      [LOGS, logEntries(["Machine is restarting"])],
    ]);
    expect((result.outcome as OpsError).message).toBe(
      "worker-scale: the worker Machine is starting, 30 seconds after it was told to start",
    );
    expect(result.said).toContain("  2026-11-25T02:50:00.000Z [info] Machine is restarting");
  });

  it("still starts and watches when flyctl can't say the events or read the log, and says so", async () => {
    const result = await run("started", [worker("stopped", "started"), ["flyctl machine start", {}]]);
    expect(result.outcome).toBeUndefined();
    expect(result.calls.filter((call) => call !== LIST)).toEqual(["flyctl machine start w1 -a tadayo-api-dev"]);
    expect(result.said).toEqual([
      "worker-scale: starting the worker Machine",
      "worker-scale: flyctl couldn't say Machine w1's events",
      "worker-scale: flyctl couldn't read Machine w1's lines in Fly's log",
      "worker-scale: the worker Machine is started, and stayed started for 30 seconds",
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
