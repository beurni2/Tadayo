// How the `ops` scripts run `flyctl` and read what it prints, against a made-up one (test/fake-fly.ts):
// the token and HOME and nothing else go to it, a call that hangs is cut short, and a failure is said
// with `flyctl`'s own first words and never anything else (docs/plans/api-b0-deploy.md, section 6; T56).

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, machine, type Reply } from "../test/fake-fly.ts";
import { flyOf, forDevApp, jsonOf, machineList, machines, why } from "./fly.ts";
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
    await fly.run(["status", "-a", "tadayo-api-dev"], { cwd: "/work" });
    expect(calls).toEqual([
      {
        command: "flyctl",
        args: ["status", "-a", "tadayo-api-dev"],
        options: { env: { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" }, timeoutMs: 120_000, cwd: "/work" },
      },
    ]);
  });

  it("lets a call set its own time limit, and no other option changes the environment", async () => {
    const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
    const fly = flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
    await fly.run(["deploy", "--app", "tadayo-api-dev"], { timeoutMs: 20 * 60 * 1000 });
    expect(calls[0]?.options).toEqual({
      env: { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" },
      timeoutMs: 20 * 60 * 1000,
    });
  });

  it("gives flyctl no HOME when there is none, or it is empty, rather than an empty one", async () => {
    for (const home of [undefined, ""]) {
      const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
      await flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: home }).run(["status", "-a", "tadayo-api-dev"]);
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

describe("forDevApp: a call is about tadayo-api-dev and no other app", () => {
  const DEV = "tadayo-api-dev";

  it("takes every call the scripts make: -a or --app with the dev app, and the calls that name none", () => {
    for (const args of [
      ["machine", "list", "-a", DEV, "--json"],
      ["ssh", "console", "-a", DEV, "--machine", "a1", "-q", "-C", "node /app/tools/ops/src/main.ts x --here"],
      ["machine", "stop", "w1", "-a", DEV],
      ["machine", "start", "w1", "--app", DEV],
      ["status", "-a", DEV],
      ["certs", "check", "api-dev.tadayo.app", "-a", DEV, "--json"],
      ["deploy", "--remote-only", "--app", DEV, "--config", "fly.toml", "--ha=false", "--yes"],
      ["orgs", "list", "--json"],
      ["apps", "create", DEV],
      ["apps", "create", DEV, "--org", "personal"],
      ["wireguard", "list", "tadayo-org", "--json"],
      [
        "wireguard",
        "remove",
        "tadayo-org",
        "interactive-runnervm0abc1-someone-example-invalid-01ARYZ6S41TSV4RRFFQ69G5FAV",
      ],
    ]) {
      expect(forDevApp(args), args.join(" ")).toBe(true);
    }
  });

  it("refuses a call with no app, another app, an app flag with nothing after it, or another app besides the dev one", () => {
    for (const args of [
      ["status"],
      ["deploy"],
      ["machine", "list", "--json"],
      ["machine", "list", "-a", "tadayo-api-prod", "--json"],
      ["machine", "list", "-a", `${DEV}x`],
      ["machine", "list", "-a", DEV.toUpperCase()],
      ["machine", "list", "-a"],
      ["machine", "stop", "w1", "--app"],
      ["machine", "stop", "w1", "-a", DEV, "-a", "another"],
      ["machine", "stop", "w1", "-a", "another", "-a", DEV],
      ["machine", "stop", "w1", "--app", "another", "-a", DEV],
    ]) {
      expect(forDevApp(args), args.join(" ")).toBe(false);
    }
  });

  it("refuses an app flag in a spelling it doesn't read, which flyctl would, even beside the dev app", () => {
    for (const args of [
      ["status", "--app=another"],
      ["status", `--app=${DEV}`],
      ["status", "-aanother"],
      ["status", "-a=another"],
      ["status", "-a", DEV, "--app=another"],
      ["status", "-a", DEV, "-aanother"],
    ]) {
      expect(forDevApp(args), args.join(" ")).toBe(false);
    }
  });

  it("takes the two calls that name none only in the one form each, not with other words after them", () => {
    for (const args of [
      ["orgs", "list"],
      ["orgs", "list", "--json", "--all"],
      ["orgs", "create", "x"],
      ["apps", "create"],
      ["apps", "create", "another"],
      ["apps", "create", "another", "--org", "personal"],
      ["apps", "create", DEV, "--org"],
      ["apps", "create", DEV, "--org", "--json"],
      ["apps", "create", DEV, "--region", "iad"],
      ["apps", "create", DEV, "--org", "personal", "--region", "iad"],
      ["apps", "list"],
      ["apps", "destroy", DEV],
    ]) {
      expect(forDevApp(args), args.join(" ")).toBe(false);
    }
  });

  it("takes the organization's WireGuard peers only to list them, or to remove one an SSH session made, in one form each", () => {
    const peer = "interactive-runnervm0abc1-someone-example-invalid-01ARYZ6S41TSV4RRFFQ69G5FAV";
    for (const args of [
      ["wireguard", "list"],
      ["wireguard", "list", "tadayo-org"],
      ["wireguard", "list", "tadayo-org", "--json", "--all"],
      ["wireguard", "list", "tadayo-org", "--all"],
      ["wireguard", "list", "Tadayo-Org", "--json"],
      ["wireguard", "list", "-a", DEV, "--json"],
      ["wireguard", "list", "--json", "tadayo-org"],
      ["wireguard", "remove", "tadayo-org"],
      ["wireguard", "remove", "tadayo-org", "static-laptop"],
      ["wireguard", "remove", "tadayo-org", "interactive-"],
      ["wireguard", "remove", "tadayo-org", `${peer} x`],
      ["wireguard", "remove", "tadayo-org", peer, "-a", DEV],
      ["wireguard", "remove", "-a", DEV],
      ["wireguard", "remove", "--org", peer],
      ["wireguard", "reset", "tadayo-org", "--json"],
      ["wireguard", "create", "tadayo-org", "iad", "interactive-x"],
      ["wireguard", "websockets", "disable", "x"],
      ["wireguard", "token-mode", "enable", "x"],
      ["wireguard", "list", "tadayo-org", "-a", DEV],
    ]) {
      expect(forDevApp(args), args.join(" ")).toBe(false);
    }
  });

  it("makes no call that doesn't name it: Fly.run refuses before anything is spawned, and says so without the arguments", async () => {
    const { spawn, calls } = fakeSpawn([["flyctl", {}]]);
    const fly = flyOf(spawn, { FLY_API_TOKEN: FAKE_FLY_TOKEN });
    for (const args of [["status"], ["machine", "list", "-a", "tadayo-api-prod", "--json"]]) {
      const error: unknown = await fly.run(args).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(OpsError);
      expect((error as OpsError).message).toBe(
        "flyctl: a call that doesn't name tadayo-api-dev, and no other app, isn't made",
      );
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

  it("says the Machines in words for a message: id, group and state each, `no group` for a Machine made another way, and `none`", () => {
    const base = { tag: undefined, image: undefined };
    expect(machineList([])).toBe("none");
    expect(
      machineList([
        { id: "a1", state: "stopped", group: "api", ...base },
        { id: "w1", state: "started", group: "worker", ...base },
        { id: "x1", state: "created", group: undefined, ...base },
      ]),
    ).toBe("a1 (api, stopped), w1 (worker, started), x1 (no group, created)");
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
