// How the `ops` scripts run `flyctl` and read what it prints, against a made-up one (test/fake-fly.ts):
// the token and HOME and nothing else go to it, a call that hangs is cut short, and a failure is said
// with `flyctl`'s own first words and never anything else (docs/plans/api-b0-deploy.md, section 6; T56).

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, machine, type Reply } from "../test/fake-fly.ts";
import { flyOf, jsonOf, machines, why } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

const spawned = (over: Partial<Parameters<typeof why>[0]> = {}) => ({
  code: 1,
  timedOut: false,
  stdout: "",
  stderr: "",
  ...over,
});

describe("flyOf: flyctl with the Fly token and HOME and nothing else", () => {
  it("gives flyctl the token and HOME, the call's own directory, and two minutes", async () => {
    const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
    const fly = flyOf(spawn, {
      FLY_API_TOKEN: FAKE_FLY_TOKEN,
      HOME: "/home/runner",
      AWS_SECRET: "not for flyctl",
      PATH: "/bin",
    });
    await fly.run(["status"], { cwd: "/work" });
    expect(calls).toEqual([
      {
        command: "flyctl",
        args: ["status"],
        options: { env: { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" }, timeoutMs: 120_000, cwd: "/work" },
      },
    ]);
  });

  it("lets a call set its own time limit, and no other option changes the environment", async () => {
    const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
    const fly = flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
    await fly.run(["deploy"], { timeoutMs: 20 * 60 * 1000 });
    expect(calls[0]?.options).toEqual({
      env: { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" },
      timeoutMs: 20 * 60 * 1000,
    });
  });

  it("gives flyctl no HOME when there is none, or it is empty, rather than an empty one", async () => {
    for (const home of [undefined, ""]) {
      const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
      await flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: home }).run(["status"]);
      expect(calls[0]?.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN });
    }
  });

  it("refuses a missing or empty token before it runs anything, by name", () => {
    const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
    for (const env of [{}, { FLY_API_TOKEN: "" }, { FLY_API_TOKEN: `${FAKE_FLY_TOKEN}\n` }]) {
      expect(() => flyOf(spawn, env)).toThrow(/FLY_API_TOKEN/);
    }
    expect(calls).toEqual([]);
  });
});

describe("why: what a failed call says, for a message", () => {
  it("says the exit code and the first lines of what it printed, standard error before standard output", () => {
    expect(why(spawned({ code: 1, stderr: "Error: no\n  \nsecond\nthird\nfourth\nfifth\n", stdout: "ignored" }))).toBe(
      "exit code 1: Error: no / second / third",
    );
    expect(why(spawned({ code: 2, stderr: "  \n", stdout: "from\nstandard output" }))).toBe(
      "exit code 2: from / standard output",
    );
  });

  it("says only the code when the call printed nothing, and says when a signal ended it", () => {
    expect(why(spawned({ code: 3 }))).toBe("exit code 3");
    expect(why(spawned({ code: null }))).toBe("no exit code");
  });

  it("cuts a long line at 200 characters and keeps the shorter ones whole", () => {
    expect(why(spawned({ stderr: `${"x".repeat(200)}\n${"y".repeat(201)}` }))).toBe(
      `exit code 1: ${"x".repeat(200)} / ${"y".repeat(200)}…`,
    );
  });

  it("says that a call ran out of time, whatever it printed", () => {
    expect(why(spawned({ code: null, timedOut: true, stderr: "Error: slow" }))).toBe("it ran out of time");
  });
});

describe("jsonOf and machines: what flyctl's list of Machines says", () => {
  it("reads standard output as JSON, and says nothing when it isn't", () => {
    expect(jsonOf(spawned({ code: 0, stdout: '[{"id":"a"}]' }))).toEqual([{ id: "a" }]);
    expect(jsonOf(spawned({ code: 0, stdout: "not json" }))).toBeUndefined();
    expect(jsonOf(spawned({ code: 0, stdout: "" }))).toBeUndefined();
  });

  it("lists the app's Machines with their state, process group, image tag and image", async () => {
    const { spawn, calls } = fakeSpawn([
      ["flyctl machine list", json([machine("a1", "api", "started", "sha-1"), { id: "x9", state: "stopped" }])],
    ]);
    const list = await machines(flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN }));
    expect(calls.map((call) => call.args)).toEqual([["machine", "list", "-a", "tadayo-api-dev", "--json"]]);
    expect(list).toEqual([
      {
        id: "a1",
        state: "started",
        group: "api",
        tag: "sha-1",
        image: "registry.fly.io/tadayo-api-dev:sha-1",
      },
      { id: "x9", state: "stopped", group: undefined, tag: undefined, image: undefined },
    ]);
  });

  it("refuses a list it can't read, saying why with flyctl's own words and never the token", async () => {
    const cases: [Reply, RegExp][] = [
      [
        { code: 1, stderr: "Error: no access" },
        /^couldn't list tadayo-api-dev's Machines: exit code 1: Error: no access$/,
      ],
      [{ code: null, timedOut: true }, /^couldn't list tadayo-api-dev's Machines: it ran out of time$/],
      [{ stdout: "not json" }, /^flyctl's list of tadayo-api-dev's Machines isn't a list$/],
      [{ stdout: "{}" }, /^flyctl's list of tadayo-api-dev's Machines isn't a list$/],
      [json([{ id: "a1" }]), /^flyctl's list of tadayo-api-dev's Machines has an entry with no id or no state$/],
      [
        json([{ state: "started" }]),
        /^flyctl's list of tadayo-api-dev's Machines has an entry with no id or no state$/,
      ],
      [json([null]), /^flyctl's list of tadayo-api-dev's Machines has an entry with no id or no state$/],
      [
        json([{ id: 7, state: "started" }]),
        /^flyctl's list of tadayo-api-dev's Machines has an entry with no id or no state$/,
      ],
    ];
    for (const [reply, expected] of cases) {
      const { spawn } = fakeSpawn([["flyctl machine list", reply]]);
      const error: unknown = await machines(flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN })).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      const message = error instanceof OpsError ? error.message : "not an OpsError";
      expect(message).toMatch(expected);
      expect(message).not.toContain(FAKE_FLY_TOKEN);
    }
  });
});
