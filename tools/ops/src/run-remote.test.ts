// The scripts that reach Fly, GitHub and Supabase's HTTP surface, as `run.ts` wires them: what each
// needs of the environment, what it refuses before it calls anyone, and what it asks of whom
// (docs/plans/api-b0-deploy.md, sections 4 to 6; T52, T56). The calls go to a made-up `flyctl` and
// `git` (test/fake-fly.ts) and a made-up Supabase project (test/fake-supabase.ts); what each script
// does with the answers is in its own test file, and the database side of `supabase-probe` is
// tests/src/db/ops-scripts.test.ts.

import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, lineOf, machine, type RecordedCall, type Route } from "../test/fake-fly.ts";
import { FAKE_PUBLISHABLE, FAKE_SECRET, FAKE_URL, fakeSupabase } from "../test/fake-supabase.ts";
import { runScript, type OpsContext } from "./run.ts";

const REF = "abcdefghijklmnopqrst";
const OTHER_REF = "tsrqponmlkjihgfedcba";
const OTHER_URL = `https://${OTHER_REF}.supabase.co`;
const ACCESS_TOKEN = ["sbp", "_", "0123456789abcdef".repeat(3)].join("");
const GITHUB_TOKEN = ["ghs", "_", "G".repeat(36)].join("");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const BRANCH = "api/b0-spike-links";
const HOST = "aws-0-us-east-1.pooler.supabase.com";

const ENV = {
  FLY_API_TOKEN: FAKE_FLY_TOKEN,
  HOME: "/home/runner",
  SUPABASE_DEV_PROJECT_REF: REF,
  SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
  GITHUB_TOKEN,
};
/** What a Machine of the app has: fly.toml's `[env]` and the two secrets the founder sets. */
const MACHINE_ENV = {
  SUPABASE_URL: FAKE_URL,
  SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
  SUPABASE_SERVICE_KEY: FAKE_SECRET,
  DATABASE_URL: `postgresql://tadayo_app.${REF}:a-password-of-the-made-up-string@${HOST}:5432/postgres`,
};

const LIST = "flyctl machine list -a tadayo-api-dev --json";
const MAIN = "/app/tools/ops/src/main.ts";
const exec = (script: string) =>
  `flyctl machine exec a1 node ${MAIN} ${script} --here --ref ${REF} -a tadayo-api-dev --json --timeout 300`;
/** What `flyctl machine exec --json` prints: an empty `stdout` and a zero `exit_code` are left out (on-machine.test.ts). */
const answer = (stdout: string, exit_code = 0) =>
  json({ ...(stdout === "" ? {} : { stdout }), ...(exit_code === 0 ? {} : { exit_code }) });
const started = json([machine("a1", "api", "started"), machine("w1", "worker", "started")]);

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
  readonly apikey: string | null;
}

interface Harness {
  readonly ctx: OpsContext;
  readonly said: string[];
  readonly calls: RecordedCall[];
  readonly lines: () => string[];
  readonly requests: Seen[];
  readonly sleeps: number[];
  readonly connected: string[];
}

function harness(
  options: {
    env?: Record<string, string | undefined>;
    args?: string[];
    routes?: readonly Route[];
    /** By `host + path + query`; what isn't there is a 404. */
    web?: Record<string, { status: number; body?: unknown }>;
    fetch?: typeof fetch;
  } = {},
): Harness {
  const { spawn, calls } = fakeSpawn(options.routes ?? []);
  const said: string[] = [];
  const requests: Seen[] = [];
  const sleeps: number[] = [];
  const connected: string[] = [];
  const web = options.web ?? {};
  const fetcher: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push({
      url: `${url.host}${url.pathname}${url.search}`,
      authorization: request.headers.get("authorization"),
      apikey: request.headers.get("apikey"),
    });
    if (options.fetch) return options.fetch(input, init);
    const reply = web[`${url.host}${url.pathname}${url.search}`];
    if (reply === undefined) return Promise.reject(new Error("no network here"));
    return Promise.resolve(new Response(JSON.stringify(reply.body ?? {}), { status: reply.status }));
  };
  const ctx: OpsContext = {
    env: options.env ?? ENV,
    args: options.args ?? [],
    repo: "/repo",
    spawn,
    fetch: fetcher,
    connect: (url) => {
      connected.push(url);
      throw new Error("no database here");
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    say: (line) => said.push(line),
  };
  return { ctx, said, calls, lines: () => calls.map(lineOf), requests, sleeps, connected };
}

/** An environment without the named variables. */
const without = (env: Record<string, string>, ...names: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)));

const message = (error: unknown) => (error instanceof Error ? error.message : `not an Error: ${String(error)}`);
const failure = (script: string, ctx: OpsContext) =>
  runScript(script, ctx).then(
    () => "it didn't fail",
    (error: unknown) => message(error),
  );

/** The scripts that call Fly from the runner, each with arguments that are fine. */
const FLY_SCRIPTS: readonly (readonly [string, readonly string[]])[] = [
  ["worker-scale", ["--to", "stopped"]],
  ["fly-app-create", []],
  ["deploy-branch", ["--branch", BRANCH]],
  ["storage-setup", []],
  ["supabase-probe", []],
];

describe("every script that calls Fly", () => {
  it("needs the Fly token, and names it when it isn't set, before it calls anyone", async () => {
    for (const [name, args] of FLY_SCRIPTS) {
      const h = harness({ env: without(ENV, "FLY_API_TOKEN"), args: [...args] });
      expect(await failure(name, h.ctx), name).toMatch(/^set .*FLY_API_TOKEN/);
      expect(h.calls, name).toEqual([]);
      expect(h.requests, name).toEqual([]);
    }
  });

  it("takes no option it doesn't know and no loose word, before it calls anyone", async () => {
    for (const [name, args] of FLY_SCRIPTS) {
      for (const extra of [["--nope"], ["loose"], ["--", "x"]]) {
        const h = harness({ args: [...args, ...extra] });
        expect(await failure(name, h.ctx), `${name} ${extra.join(" ")}`).toMatch(/^[a-z-]+: /);
        expect(h.calls, name).toEqual([]);
        expect(h.requests, name).toEqual([]);
      }
    }
  });

  it("gives flyctl the token and HOME, and nothing else of the environment", async () => {
    const h = harness({ args: ["--to", "stopped"], routes: [[LIST, json([machine("w1", "worker", "stopped")])]] });
    await runScript("worker-scale", h.ctx);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
  });
});

describe("worker-scale", () => {
  it("takes --to stopped or --to started, and nothing else", async () => {
    for (const args of [[], ["--to", "paused"], ["--to", ""], ["--to", "Stopped"], ["--to"]]) {
      const h = harness({ args });
      expect(await failure("worker-scale", h.ctx), args.join(" ")).toMatch(/^worker-scale: /);
      expect(h.calls).toEqual([]);
    }
    const none = harness({ args: [] });
    expect(await failure("worker-scale", none.ctx)).toBe("worker-scale: --to takes stopped or started");
  });

  it("stops the worker, waiting with the context's sleep between the times it looks", async () => {
    let listed = 0;
    const h = harness({
      args: ["--to", "stopped"],
      routes: [
        [
          LIST,
          () => {
            listed += 1;
            return json([machine("a1", "api", "started"), machine("w1", "worker", listed < 3 ? "started" : "stopped")]);
          },
        ],
        ["flyctl machine stop w1 -a tadayo-api-dev -s SIGTERM", {}],
      ],
    });
    await runScript("worker-scale", h.ctx);
    expect(h.sleeps).toEqual([3000]);
    expect(h.said).toEqual([
      "worker-scale: stopping the worker Machine",
      "worker-scale: the worker Machine is stopped",
    ]);
  });
});

describe("fly-app-create", () => {
  it("takes an organization's slug, and refuses anything else before it calls flyctl", async () => {
    for (const args of [["--org", ""], ["--org", "Two Words"], ["--org=-flag"], ["--org", "a/b"]]) {
      const h = harness({ args });
      expect(await failure("fly-app-create", h.ctx), args.join(" ")).toMatch(
        /^fly-app-create: --org takes an organization's slug/,
      );
      expect(h.calls).toEqual([]);
    }
    // A value that looks like another option is refused by the argument parser itself.
    const dashed = harness({ args: ["--org", "-flag"] });
    expect(await failure("fly-app-create", dashed.ctx)).toMatch(/^fly-app-create: /);
    expect(dashed.calls).toEqual([]);
  });

  it("makes nothing when the app is there and its certificate is issued, and passes --org on when it makes the app", async () => {
    const issued = json({ configured: true, status: "Ready", certificates: [{ status: "active" }] });
    const there = harness({
      routes: [
        ["flyctl status -a tadayo-api-dev", {}],
        ["flyctl certs check api-dev.tadayo.app", issued],
      ],
    });
    await runScript("fly-app-create", there.ctx);
    expect(there.said[0]).toBe("fly-app-create: tadayo-api-dev is there");

    const fresh = harness({
      args: ["--org", "tadayo"],
      routes: [
        ["flyctl status -a tadayo-api-dev", { code: 1 }],
        ["flyctl apps create tadayo-api-dev --org tadayo", {}],
        ["flyctl certs check api-dev.tadayo.app", issued],
      ],
    });
    await runScript("fly-app-create", fresh.ctx);
    expect(fresh.lines()).toContain("flyctl apps create tadayo-api-dev --org tadayo");
  });
});

describe("deploy-branch", () => {
  it("needs --branch, and the GitHub token, before it asks git or anyone", async () => {
    const noBranch = harness({ args: [] });
    expect(await failure("deploy-branch", noBranch.ctx)).toBe("deploy-branch: --branch <name> is needed");
    const noToken = harness({ env: without(ENV, "GITHUB_TOKEN"), args: ["--branch", BRANCH] });
    expect(await failure("deploy-branch", noToken.ctx)).toBe("set GITHUB_TOKEN");
    for (const h of [noBranch, noToken]) {
      expect(h.calls).toEqual([]);
      expect(h.requests).toEqual([]);
    }
  });

  it("deploys from the checkout it was started in, asking GitHub with the token it was given", async () => {
    const h = harness({
      args: ["--branch", BRANCH],
      routes: [
        ["git rev-parse HEAD", { stdout: `${SHA}\n` }],
        ["git status --porcelain", { stdout: "" }],
        ["flyctl deploy", {}],
        [LIST, json([machine("a1", "api", "started", `sha-${SHA}`), machine("w1", "worker", "started", `sha-${SHA}`)])],
      ],
      web: {
        [`api.github.com/repos/beurni2/tadayo/branches/${BRANCH}`]: { status: 200, body: { commit: { sha: SHA } } },
        [`api.github.com/repos/beurni2/tadayo/actions/workflows/ci.yml/runs?head_sha=${SHA}&per_page=100`]: {
          status: 200,
          body: {
            workflow_runs: [
              { id: 7, status: "completed", conclusion: "success", head_sha: SHA, head_branch: BRANCH, event: "push" },
            ],
          },
        },
      },
    });
    await runScript("deploy-branch", h.ctx);
    expect(h.requests.map((request) => request.authorization)).toEqual([
      `Bearer ${GITHUB_TOKEN}`,
      `Bearer ${GITHUB_TOKEN}`,
    ]);
    const deploy = h.calls.find((call) => call.args[0] === "deploy");
    expect(deploy?.options.cwd).toBe("/repo");
    expect(h.said).toContain(`deploy-branch: ${SHA} is deployed: the API and the worker run the image sha-${SHA}`);
    expect(JSON.stringify(h.said)).not.toContain(GITHUB_TOKEN);
  });
});

describe("storage-setup on the runner", () => {
  it("runs itself on the API's Machine, with --here and the dev project's reference, and says what it printed", async () => {
    const h = harness({
      routes: [
        [LIST, started],
        [exec("storage-setup"), answer("storage-setup: uploads is there\n")],
      ],
    });
    await runScript("storage-setup", h.ctx);
    expect(h.lines()).toEqual([LIST, exec("storage-setup")]);
    expect(h.said).toEqual(["storage-setup: uploads is there"]);
    // Nothing of Supabase is asked from here: the service key isn't here.
    expect(h.requests).toEqual([]);
  });

  it("needs the dev project's reference, and one that is a reference", async () => {
    const none = harness({ env: without(ENV, "SUPABASE_DEV_PROJECT_REF") });
    expect(await failure("storage-setup", none.ctx)).toBe("set SUPABASE_DEV_PROJECT_REF");
    for (const ref of ["abc", "ABCDEFGHIJKLMNOPQRST", `${REF}x`, "abcdefghij-lmnopqrst"]) {
      const h = harness({ env: { ...ENV, SUPABASE_DEV_PROJECT_REF: ref } });
      expect(await failure("storage-setup", h.ctx), ref).toBe(
        "SUPABASE_DEV_PROJECT_REF isn't a Supabase project reference: twenty lowercase letters",
      );
      expect(h.calls).toEqual([]);
    }
  });

  it("fails when it fails on the Machine, after saying what it printed", async () => {
    const h = harness({
      routes: [
        [LIST, started],
        [exec("storage-setup"), answer("storage-setup: uploads: couldn't make it\n", 1)],
      ],
    });
    expect(await failure("storage-setup", h.ctx)).toBe("storage-setup: it failed on the Machine, with exit code 1");
    expect(h.said).toEqual(["storage-setup: uploads: couldn't make it"]);
  });

  it("takes --ref only with --here, and --here only with --ref", async () => {
    const refOnly = harness({ args: ["--ref", REF] });
    expect(await failure("storage-setup", refOnly.ctx)).toBe("storage-setup: --ref goes with --here");
    const hereOnly = harness({ args: ["--here"], env: MACHINE_ENV });
    expect(await failure("storage-setup", hereOnly.ctx)).toBe(
      "storage-setup: --here takes --ref <the dev project's reference>",
    );
    for (const h of [refOnly, hereOnly]) {
      expect(h.calls).toEqual([]);
      expect(h.requests).toEqual([]);
    }
  });
});

describe("storage-setup on the Machine (--here)", () => {
  const args = ["--here", "--ref", REF];

  it("makes the buckets of the project it is in, with the service key, and prints no key", async () => {
    const fake = fakeSupabase();
    const h = harness({ args, env: MACHINE_ENV, fetch: fake.fetch });
    await runScript("storage-setup", h.ctx);
    expect(fake.buckets.has("uploads") && fake.buckets.has("renditions")).toBe(true);
    expect(h.requests.length).toBeGreaterThan(0);
    for (const request of h.requests) {
      expect(request.url.startsWith(`${REF}.supabase.co/storage/v1/`)).toBe(true);
      expect(request.apikey).toBe(FAKE_SECRET);
    }
    expect(JSON.stringify(h.said)).not.toContain(FAKE_SECRET);
    expect(h.calls).toEqual([]);
  });

  it("refuses a Machine whose SUPABASE_URL isn't the project --ref names, before it sends the key anywhere", async () => {
    const h = harness({ args, env: { ...MACHINE_ENV, SUPABASE_URL: OTHER_URL } });
    expect(await failure("storage-setup", h.ctx)).toBe(
      "storage-setup: SUPABASE_URL isn't the project --ref names, which is tadayo-dev's",
    );
    expect(h.requests).toEqual([]);
    const strange = harness({ args, env: { ...MACHINE_ENV, SUPABASE_URL: `${FAKE_URL}.evil.example` } });
    expect(await failure("storage-setup", strange.ctx)).toMatch(/^SUPABASE_URL isn't a Supabase project's URL/);
    expect(strange.requests).toEqual([]);
  });

  it("names the variables a Machine hasn't got", async () => {
    const h = harness({ args, env: without(MACHINE_ENV, "SUPABASE_SERVICE_KEY", "SUPABASE_URL") });
    expect(await failure("storage-setup", h.ctx)).toBe("set SUPABASE_URL, SUPABASE_SERVICE_KEY");
    expect(h.requests).toEqual([]);
  });
});

describe("supabase-probe on the runner", () => {
  const settings = (db_schema: string) => ({
    [`api.supabase.com/v1/projects/${REF}/postgrest`]: {
      status: 200,
      body: { db_schema, jwt_secret: "must-never-be-printed" },
    },
  });
  const MACHINE_PASSES = [
    [LIST, started],
    [
      exec("supabase-probe"),
      answer("supabase-probe: run r1\nsupabase-probe: ok    control: the service key lists the buckets\n"),
    ],
  ] as const satisfies readonly Route[];

  it("asks the Management API from here, with the access token, and the rest on the Machine, and passes when both do", async () => {
    const h = harness({ routes: MACHINE_PASSES, web: settings("pg_pgrst_no_exposed_schemas") });
    await runScript("supabase-probe", h.ctx);
    expect(h.requests).toEqual([
      { url: `api.supabase.com/v1/projects/${REF}/postgrest`, authorization: `Bearer ${ACCESS_TOKEN}`, apikey: null },
    ]);
    expect(h.lines()).toEqual([LIST, exec("supabase-probe")]);
    expect(h.said).toEqual([
      "supabase-probe: ok    the Data API's settings expose no schema",
      "supabase-probe: run r1",
      "supabase-probe: ok    control: the service key lists the buckets",
      "supabase-probe: every check passed",
    ]);
    expect(JSON.stringify(h.said)).not.toContain("must-never-be-printed");
    expect(JSON.stringify(h.said)).not.toContain(ACCESS_TOKEN);
  });

  it("still runs the Machine's checks when the Data API check fails, and then fails, naming the schema and not the secret", async () => {
    const h = harness({ routes: MACHINE_PASSES, web: settings("public, storage") });
    expect(await failure("supabase-probe", h.ctx)).toBe("supabase-probe: the Data API check failed");
    expect(h.said[0]).toBe(
      "supabase-probe: FAIL  the Data API's settings expose no schema: it exposes public, storage",
    );
    expect(h.lines()).toEqual([LIST, exec("supabase-probe")]);
    expect(JSON.stringify(h.said)).not.toContain("must-never-be-printed");
  });

  it("fails with the Machine's failure, after both have said what they found", async () => {
    const h = harness({
      routes: [
        [LIST, started],
        [
          exec("supabase-probe"),
          answer("supabase-probe: run r1\nsupabase-probe: FAIL  anon: list the buckets: answered HTTP 200\n", 1),
        ],
      ],
      web: settings(""),
    });
    expect(await failure("supabase-probe", h.ctx)).toBe("supabase-probe: it failed on the Machine, with exit code 1");
    // The report came back, so it names what is left; nothing is said about what might be.
    expect(h.said).toEqual([
      "supabase-probe: ok    the Data API's settings expose no schema",
      "supabase-probe: run r1",
      "supabase-probe: FAIL  anon: list the buckets: answered HTTP 200",
    ]);
  });

  it("says what the project may hold when the Machine's report never came back, and still fails with the call's own failure", async () => {
    for (const reply of [
      { code: 1, stderr: "Error: deadline exceeded" },
      { timedOut: true, code: null },
      json({ stdout: "an answer that isn't a report", exit_signal: 9 }),
    ]) {
      const h = harness({
        routes: [
          [LIST, started],
          [exec("supabase-probe"), reply],
        ],
        web: settings(""),
      });
      const failed = await failure("supabase-probe", h.ctx);
      expect(failed).toMatch(/^supabase-probe: /);
      const hint = h.said.at(-1) ?? "";
      expect(hint).toMatch(/^supabase-probe: the Machine's report didn't come back\./);
      expect(hint).toContain("probe-");
      expect(hint).toContain("@probe.invalid");
      expect(hint).toContain("probe/");
      expect(hint).toContain("uploads and renditions");
    }
  });

  it("needs the access token, and says the Management API didn't answer as a failed check", async () => {
    const none = harness({ env: without(ENV, "SUPABASE_ACCESS_TOKEN") });
    expect(await failure("supabase-probe", none.ctx)).toBe("set SUPABASE_ACCESS_TOKEN");
    expect(none.calls).toEqual([]);
    const silent = harness({ routes: MACHINE_PASSES });
    expect(await failure("supabase-probe", silent.ctx)).toBe("supabase-probe: the Data API check failed");
    expect(silent.said[0]).toBe(
      "supabase-probe: FAIL  the Data API's settings expose no schema: no answer from the project",
    );
  });
});

describe("supabase-probe on the Machine (--here)", () => {
  const args = ["--here", "--ref", REF];

  it("refuses a project that isn't the one --ref names, a database that isn't dev's, and a missing key, before anything is opened", async () => {
    const wrongProject = harness({ args, env: { ...MACHINE_ENV, SUPABASE_URL: OTHER_URL } });
    expect(await failure("supabase-probe", wrongProject.ctx)).toBe(
      "supabase-probe: SUPABASE_URL isn't the project --ref names, which is tadayo-dev's",
    );
    const wrongDatabase = harness({
      args,
      env: { ...MACHINE_ENV, DATABASE_URL: `postgresql://tadayo_app.${OTHER_REF}:a-password@${HOST}:5432/postgres` },
    });
    expect(await failure("supabase-probe", wrongDatabase.ctx)).toMatch(
      /^DATABASE_URL isn't a connection to tadayo-dev's database/,
    );
    const noKey = harness({ args, env: without(MACHINE_ENV, "SUPABASE_PUBLISHABLE_KEY") });
    expect(await failure("supabase-probe", noKey.ctx)).toBe("set SUPABASE_PUBLISHABLE_KEY");
    for (const h of [wrongProject, wrongDatabase, noKey]) {
      expect(h.connected).toEqual([]);
      expect(h.requests).toEqual([]);
      expect(h.said).toEqual([]);
    }
  });

  it("is told the project by --ref, so a runner with another one in its environment can't point it elsewhere", async () => {
    // The environment's own SUPABASE_DEV_PROJECT_REF is the runner's; a Machine has no say in it.
    const h = harness({ args: ["--here", "--ref", OTHER_REF], env: { ...MACHINE_ENV, SUPABASE_DEV_PROJECT_REF: REF } });
    expect(await failure("supabase-probe", h.ctx)).toMatch(/SUPABASE_URL isn't the project --ref names/);
    expect(h.connected).toEqual([]);
  });
});
