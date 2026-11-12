// `deploy-branch` against a made-up GitHub and `flyctl` (test/fake-fly.ts): a branch's head commit is
// deployed to `tadayo-api-dev` only when that commit's `ci` run is green, and it is that exact commit
// that is built and then found running (docs/plans/B0.md, slice 10a; ADR-025; T58). The spikes use
// it to put server code on `dev` before it merges.

import { describe, expect, it, vi } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, json, lineOf, machine, type Route } from "../test/fake-fly.ts";
import { deployBranch } from "./deploy-branch.ts";
import { flyOf } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const BRANCH = "api/b0-spike-links";
const REPO = "/work/tadayo";
const TOKEN = ["ghs", "_", "G".repeat(36)].join("");
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };
const LABEL = `sha-${SHA}`;

const BRANCH_PATH = `/repos/beurni2/tadayo/branches/${BRANCH}`;
const RUNS_PATH = `/repos/beurni2/tadayo/actions/workflows/ci.yml/runs?head_sha=${SHA}&per_page=100`;

const ci = (over: Record<string, unknown> = {}) => ({
  id: 101,
  status: "completed",
  conclusion: "success",
  head_sha: SHA,
  head_branch: BRANCH,
  event: "push",
  run_attempt: 1,
  ...over,
});

interface Scene {
  head?: string;
  porcelain?: string;
  branchSha?: string;
  runs?: unknown[];
  github?: Record<string, { status: number; body?: unknown }>;
  deploy?: Route;
  machines?: unknown[];
}

async function run(scene: Scene = {}, branch = BRANCH) {
  const routes: Route[] = [
    ["git rev-parse HEAD", { stdout: `${scene.head ?? SHA}\n` }],
    ["git status --porcelain", { stdout: scene.porcelain ?? "" }],
    scene.deploy ?? ["flyctl deploy", {}],
    [
      "flyctl machine list",
      json(scene.machines ?? [machine("a1", "api", "started", LABEL), machine("w1", "worker", "started", LABEL)]),
    ],
  ];
  const { spawn, calls } = fakeSpawn(routes);
  const seen: {
    url: string;
    authorization: string | null;
    accept: string | null;
    version: string | null;
    limited: boolean;
  }[] = [];
  const answers = scene.github ?? {
    [BRANCH_PATH]: { status: 200, body: { name: BRANCH, commit: { sha: scene.branchSha ?? SHA } } },
    [RUNS_PATH]: { status: 200, body: { total_count: 1, workflow_runs: scene.runs ?? [ci()] } },
  };
  const fetcher: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    seen.push({
      url: `${url.host}${url.pathname}${url.search}`,
      authorization: request.headers.get("authorization"),
      accept: request.headers.get("accept"),
      version: request.headers.get("x-github-api-version"),
      // A call that hangs is cut short: it carries a time limit that hasn't run out.
      limited: init?.signal instanceof AbortSignal && !init.signal.aborted,
    });
    const answer = answers[`${url.pathname}${url.search}`] ?? { status: 404, body: { message: "Not Found" } };
    return Promise.resolve(new Response(JSON.stringify(answer.body ?? {}), { status: answer.status }));
  };
  const said: string[] = [];
  const outcome = await deployBranch({
    fly: flyOf(spawn, ENV),
    spawn,
    fetch: fetcher,
    githubToken: TOKEN,
    repo: REPO,
    branch,
    say: (line) => said.push(line),
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, seen, said, outcome };
}

const message = (outcome: unknown) =>
  outcome instanceof OpsError ? outcome.message : `not an OpsError: ${String(outcome)}`;
const deployed = (calls: string[]) => calls.some((call) => call.startsWith("flyctl deploy"));

describe("deployBranch when the commit's ci run passed", () => {
  it("builds and deploys that exact commit, from the checkout, and finds it running", async () => {
    const result = await run();
    expect(result.outcome).toBeUndefined();
    const deploy = result.raw.find((call) => call.command === "flyctl" && call.args[0] === "deploy");
    expect(deploy?.args).toEqual([
      "deploy",
      "--remote-only",
      "--app",
      "tadayo-api-dev",
      "--config",
      "fly.toml",
      "--image-label",
      LABEL,
      "--ha=false",
      "--strategy",
      "rolling",
      "--yes",
    ]);
    expect(deploy?.options.cwd).toBe(REPO);
    expect(deploy?.options.env).toEqual({ FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" });
    expect(deploy?.options.timeoutMs).toBe(20 * 60 * 1000);
    expect(result.said).toEqual([
      `deploy-branch: ${BRANCH} is at ${SHA}`,
      "deploy-branch: its ci run, 101, passed",
      `deploy-branch: deploying ${SHA} to tadayo-api-dev`,
      `deploy-branch: ${SHA} is deployed: the API and the worker run the image ${LABEL}`,
      "deploy-branch: the next deploy-dev run, on a merge to main, replaces it",
    ]);
  });

  it("cuts every git call off after 30 seconds and every GitHub request after 30 seconds, and the deploy after 20 minutes", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const result = await run();
      expect(result.outcome).toBeUndefined();
      const gits = result.raw.filter((call) => call.command === "git");
      expect(gits).toHaveLength(2);
      expect(gits.map((call) => call.options.timeoutMs)).toEqual([30_000, 30_000]);
      expect(timeout.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([30_000, 30_000]);
      const deploy = result.raw.find((call) => call.command === "flyctl" && call.args[0] === "deploy");
      expect(deploy?.options.timeoutMs).toBe(20 * 60 * 1000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("asks GitHub for the branch's head and the ci runs of that commit, with the token, and nothing else", async () => {
    const result = await run();
    const asked = (path: string) => ({
      url: `api.github.com${path}`,
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      version: "2022-11-28",
      limited: true,
    });
    expect(result.seen).toEqual([asked(BRANCH_PATH), asked(RUNS_PATH)]);
    expect(JSON.stringify(result.said)).not.toContain(TOKEN);
    expect(JSON.stringify(result.said)).not.toContain(FAKE_FLY_TOKEN);
  });

  it("looks at the checkout before it asks anyone, and at the ci run before it deploys", async () => {
    const result = await run();
    expect(result.calls.slice(0, 2)).toEqual(["git rev-parse HEAD", "git status --porcelain --untracked-files=all"]);
    expect(result.calls.findIndex((call) => call.startsWith("flyctl deploy"))).toBe(2);
  });

  it("ignores a cancelled run of the same commit, and the runs of other commits and other branches", async () => {
    const result = await run({
      runs: [
        ci({ id: 1, conclusion: "cancelled" }),
        ci({ id: 2, head_sha: OTHER, conclusion: "failure" }),
        ci({ id: 3, head_branch: "api/another", conclusion: "failure" }),
        ci({ id: 4 }),
      ],
    });
    expect(result.outcome).toBeUndefined();
    expect(result.said).toContain("deploy-branch: its ci run, 4, passed");
  });

  it("takes a run only from a push: a run of some merge of the commit isn't the commit's", async () => {
    const merged = await run({
      runs: [ci({ id: 6, event: "pull_request" }), ci({ id: 7, event: "workflow_dispatch" })],
    });
    expect(message(merged.outcome)).toBe(`deploy-branch: refused: no ci run for ${SHA.slice(0, 12)} on ${BRANCH}`);
    const both = await run({ runs: [ci({ id: 6, event: "pull_request", conclusion: "failure" }), ci({ id: 7 })] });
    expect(both.outcome).toBeUndefined();
    expect(both.said).toContain("deploy-branch: its ci run, 7, passed");
  });

  it("doesn't take a run it can't read for one that passed", async () => {
    for (const odd of [{ id: "101" }, { id: 1.5 }, { id: null }]) {
      const result = await run({ runs: [ci(odd)] });
      expect(message(result.outcome), JSON.stringify(odd)).toBe(
        `deploy-branch: refused: no ci run for ${SHA.slice(0, 12)} on ${BRANCH}`,
      );
    }
    const noStatus = await run({ runs: [ci({ status: undefined, conclusion: "success" })] });
    expect(message(noStatus.outcome)).toBe(
      `deploy-branch: refused: the ci run for ${SHA.slice(0, 12)} is still running (unknown)`,
    );
    expect(deployed(noStatus.calls)).toBe(false);
  });
});

describe("deployBranch refuses a commit whose ci run isn't green, and deploys nothing", () => {
  it("when there is none, or none of this commit on this branch", async () => {
    for (const runs of [[], [ci({ head_sha: OTHER })], [ci({ head_branch: "main" })]]) {
      const result = await run({ runs });
      expect(message(result.outcome)).toBe(`deploy-branch: refused: no ci run for ${SHA.slice(0, 12)} on ${BRANCH}`);
      expect(deployed(result.calls)).toBe(false);
    }
  });

  it("when it is still running or waiting", async () => {
    for (const status of ["in_progress", "queued", "waiting", "pending", "requested"]) {
      const result = await run({ runs: [ci({ status, conclusion: null })] });
      expect(message(result.outcome), status).toBe(
        `deploy-branch: refused: the ci run for ${SHA.slice(0, 12)} is still running (${status})`,
      );
      expect(deployed(result.calls), status).toBe(false);
    }
  });

  it("when it failed, however GitHub says so", async () => {
    for (const conclusion of [
      "failure",
      "timed_out",
      "action_required",
      "startup_failure",
      "neutral",
      "stale",
      "anything else",
      null,
    ]) {
      const result = await run({ runs: [ci({ conclusion })] });
      expect(message(result.outcome), String(conclusion)).toBe(
        `deploy-branch: refused: the ci run for ${SHA.slice(0, 12)} failed (${conclusion ?? "no conclusion"})`,
      );
      expect(deployed(result.calls), String(conclusion)).toBe(false);
    }
  });

  it("when any run of it failed or is running, though another passed", async () => {
    const failed = await run({ runs: [ci({ id: 1 }), ci({ id: 2, conclusion: "failure" })] });
    expect(message(failed.outcome)).toMatch(/failed \(failure\)$/);
    const running = await run({ runs: [ci({ id: 1 }), ci({ id: 2, status: "in_progress", conclusion: null })] });
    expect(message(running.outcome)).toMatch(/still running \(in_progress\)$/);
    expect(deployed(failed.calls) || deployed(running.calls)).toBe(false);
  });

  it("when every run of it was cancelled", async () => {
    const result = await run({ runs: [ci({ conclusion: "cancelled" }), ci({ id: 2, conclusion: "skipped" })] });
    expect(message(result.outcome)).toBe(
      `deploy-branch: refused: every ci run for ${SHA.slice(0, 12)} was cancelled or skipped`,
    );
    expect(deployed(result.calls)).toBe(false);
  });
});

describe("deployBranch refuses a checkout that isn't the branch's head", () => {
  it("when the checkout is at another commit than the branch's head on GitHub", async () => {
    const result = await run({ branchSha: OTHER });
    expect(message(result.outcome)).toBe(
      `deploy-branch: refused: the checkout is at ${SHA.slice(0, 12)}, and ${BRANCH} is at ${OTHER.slice(0, 12)} on GitHub`,
    );
    expect(deployed(result.calls)).toBe(false);
    // It asked about the runs of no commit: only the head is a candidate.
    expect(result.seen).toHaveLength(1);
  });

  it("when the checkout has changes or files that git doesn't know, which the build would take", async () => {
    for (const porcelain of [" M services/api/src/main.ts\n", "?? services/api/src/new.ts\n", "A  Dockerfile\n"]) {
      const result = await run({ porcelain });
      expect(message(result.outcome), porcelain).toBe(
        "deploy-branch: refused: the checkout isn't clean, so the build wouldn't be the commit",
      );
      expect(result.seen, porcelain).toEqual([]);
      expect(deployed(result.calls), porcelain).toBe(false);
    }
  });

  it("when git's answer about the checkout isn't a commit, before it asks anyone", async () => {
    for (const head of ["", "HEAD", "0123456", SHA.toUpperCase(), `${SHA}0`, "not a commit"]) {
      const result = await run({ head });
      expect(message(result.outcome), head).toBe("deploy-branch: git's answer about the checkout isn't a commit");
      expect(result.calls, head).toEqual(["git rev-parse HEAD"]);
      expect(result.seen, head).toEqual([]);
    }
  });

  it("when git can't say what the checkout is", async () => {
    const { spawn } = fakeSpawn([["git rev-parse HEAD", { code: 128, stderr: "fatal: not a git repository" }]]);
    const error = await deployBranch({
      fly: flyOf(spawn, ENV),
      spawn,
      fetch: () => Promise.reject(new Error("no network here")),
      githubToken: TOKEN,
      repo: REPO,
      branch: BRANCH,
      say: () => undefined,
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(message(error)).toBe(
      "deploy-branch: git couldn't say what the checkout is: exit code 128: fatal: not a git repository",
    );
  });
});

describe("deployBranch refuses a branch name that isn't one", () => {
  it("before it runs anything", async () => {
    for (const branch of [
      "",
      "-x",
      "a b",
      "a..b",
      "a/",
      "/a",
      "a//b",
      "a.",
      "api/b0.",
      "x".repeat(101),
      "a;b",
      "a?b=c",
      "a#b",
      "a%2Fb",
      "main.lock",
    ]) {
      const result = await run({}, branch);
      expect(result.outcome, branch).toBeInstanceOf(OpsError);
      expect(result.calls, branch).toEqual([]);
      expect(result.seen, branch).toEqual([]);
    }
  });

  it("and takes the names the repository uses", async () => {
    for (const branch of [
      "main",
      "api/b0-deploy",
      "ios/b0-spike-links",
      "claude/project-thread-bj7aqm",
      "release-1.2",
    ]) {
      const result = await run(
        {
          github: {
            [`/repos/beurni2/tadayo/branches/${branch}`]: { status: 200, body: { commit: { sha: SHA } } },
            [RUNS_PATH]: { status: 200, body: { workflow_runs: [ci({ head_branch: branch })] } },
          },
        },
        branch,
      );
      expect(result.outcome, branch).toBeUndefined();
    }
  });
});

describe("deployBranch when GitHub or Fly doesn't answer as it should", () => {
  it("says the status GitHub gave, and not its words, and deploys nothing", async () => {
    for (const status of [401, 403, 404, 500]) {
      const result = await run({ github: { [BRANCH_PATH]: { status, body: { message: `secret words ${TOKEN}` } } } });
      expect(message(result.outcome), String(status)).toBe(
        `deploy-branch: GitHub answered HTTP ${String(status)} to the request for the branch ${BRANCH}`,
      );
      expect(deployed(result.calls)).toBe(false);
    }
    const runs = await run({
      github: {
        [BRANCH_PATH]: { status: 200, body: { commit: { sha: SHA } } },
        [RUNS_PATH]: { status: 403, body: { message: "Resource not accessible by integration" } },
      },
    });
    expect(message(runs.outcome)).toBe("deploy-branch: GitHub answered HTTP 403 to the request for the ci runs");
  });

  it("says it got no sense from GitHub when the answer isn't what it asked for", async () => {
    for (const body of [{}, { commit: {} }, { commit: { sha: "short" } }, []]) {
      const result = await run({ github: { [BRANCH_PATH]: { status: 200, body } } });
      expect(message(result.outcome)).toBe(`deploy-branch: GitHub's answer about the branch ${BRANCH} has no commit`);
    }
    const runs = await run({
      github: {
        [BRANCH_PATH]: { status: 200, body: { commit: { sha: SHA } } },
        [RUNS_PATH]: { status: 200, body: { workflow_runs: "none" } },
      },
    });
    expect(message(runs.outcome)).toBe("deploy-branch: GitHub's answer about the ci runs isn't a list");
  });

  it("says GitHub didn't answer, when it didn't", async () => {
    const { spawn } = fakeSpawn([
      ["git rev-parse HEAD", { stdout: `${SHA}\n` }],
      ["git status", { stdout: "" }],
    ]);
    const error = await deployBranch({
      fly: flyOf(spawn, ENV),
      spawn,
      fetch: () => Promise.reject(new TypeError("fetch failed")),
      githubToken: TOKEN,
      repo: REPO,
      branch: BRANCH,
      say: () => undefined,
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(message(error)).toBe("deploy-branch: no answer from GitHub");
  });

  it("doesn't call a deploy that flyctl failed one, with flyctl's own words", async () => {
    const result = await run({
      deploy: ["flyctl deploy", { code: 1, stderr: "Error: failed to fetch an image or build from source" }],
    });
    expect(message(result.outcome)).toBe(
      "deploy-branch: flyctl couldn't deploy the commit: exit code 1: Error: failed to fetch an image or build from source",
    );
    expect(result.said.some((line) => line.includes("is deployed"))).toBe(false);
  });

  it("doesn't take flyctl's word that it deployed: the Machines have to run the commit's image", async () => {
    const older = await run({
      machines: [machine("a1", "api", "started", "deployment-9"), machine("w1", "worker", "started", LABEL)],
    });
    expect(message(older.outcome)).toBe(
      `deploy-branch: flyctl deployed, but a Machine of tadayo-api-dev doesn't run the image ${LABEL}: a1 (api)`,
    );
    const none = await run({
      machines: [machine("a1", "api", "stopped", LABEL), machine("w1", "worker", "started", LABEL)],
    });
    expect(message(none.outcome)).toBe(
      "deploy-branch: flyctl deployed, but no API Machine of tadayo-api-dev is started (the app's Machines: a1 (api, stopped), w1 (worker, started)); if it stopped on its own, Fly's log of tadayo-api-dev says why",
    );
    expect(older.said.some((line) => line.includes("is deployed"))).toBe(false);
  });

  it("lets a stopped worker be, since a stopped Machine stays as it was and is the worker-scale's", async () => {
    const result = await run({
      machines: [machine("a1", "api", "started", LABEL), machine("w1", "worker", "stopped", "deployment-9")],
    });
    expect(result.outcome).toBeUndefined();
    expect(result.said).toContain(`deploy-branch: ${SHA} is deployed: the API runs the image ${LABEL}`);
    expect(result.said).toContain("deploy-branch: the worker Machine is stopped");
  });

  it("says when the app has no worker Machine at all", async () => {
    const result = await run({ machines: [machine("a1", "api", "started", LABEL)] });
    expect(result.outcome).toBeUndefined();
    expect(result.said).toContain(`deploy-branch: ${SHA} is deployed: the API runs the image ${LABEL}`);
    expect(result.said).toContain("deploy-branch: the app has no worker Machine");
  });

  it("reads the image from a Machine's config, or from its image reference's tag, whichever has it", async () => {
    const bare = (id: string, group: string, tag: string) => ({
      id,
      state: "started",
      config: { image: `registry.fly.io/tadayo-api-dev:${tag}`, metadata: { fly_process_group: group } },
    });
    const same = await run({ machines: [bare("a1", "api", LABEL), bare("w1", "worker", LABEL)] });
    expect(same.outcome).toBeUndefined();
    // And the other way round: the image reference has the tag, and the config's image names a digest.
    const pinned = (id: string, group: string, tag: string) => ({
      id,
      state: "started",
      image_ref: { registry: "registry.fly.io", repository: "tadayo-api-dev", tag },
      config: { image: "registry.fly.io/tadayo-api-dev@sha256:0", metadata: { fly_process_group: group } },
    });
    const byTag = await run({ machines: [pinned("a1", "api", LABEL), pinned("w1", "worker", LABEL)] });
    expect(byTag.outcome).toBeUndefined();
    const byOtherTag = await run({ machines: [pinned("a1", "api", "deployment-9"), pinned("w1", "worker", LABEL)] });
    expect(message(byOtherTag.outcome)).toContain(": a1 (api)");
    const older = await run({ machines: [bare("a1", "api", "deployment-9"), bare("w1", "worker", LABEL)] });
    expect(message(older.outcome)).toBe(
      `deploy-branch: flyctl deployed, but a Machine of tadayo-api-dev doesn't run the image ${LABEL}: a1 (api)`,
    );
    // A tag that only ends like the label is another image's.
    const lookalike = await run({ machines: [bare("a1", "api", `x${LABEL}`), bare("w1", "worker", LABEL)] });
    expect(message(lookalike.outcome)).toContain(": a1 (api)");
  });

  it("says what flyctl printed, line by line, whether or not it worked", async () => {
    const worked = await run({
      deploy: ["flyctl deploy", { stdout: "==> Building image\n", stderr: "--> Pushing image done\n" }],
    });
    expect(worked.said.slice(3, 5)).toEqual(["==> Building image", "--> Pushing image done"]);
    const failed = await run({
      deploy: ["flyctl deploy", { code: 1, stdout: "==> Building image\n", stderr: "Error: boom\n" }],
    });
    expect(failed.said.slice(-2)).toEqual(["==> Building image", "Error: boom"]);
  });
});
