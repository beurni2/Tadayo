// `deploy-branch`: puts a branch's head commit on `tadayo-api-dev`, and only when that commit's `ci`
// run is green (docs/plans/B0.md, slice 10a; docs/plans/api-b0-deploy.md, section 6; ADR-025; T58).
// The spikes use it to try server code on `dev` before it merges; the next `deploy-dev` run, on a
// merge to `main`, replaces what it put there.
//
// What it makes sure of, in this order, before anything is built:
//   - the checkout it was started in is the branch's head on GitHub, and has no change and no file
//     that git doesn't know, since the build takes the files as they are, not the commit's;
//   - the `ci` runs of that exact commit, on that branch, are all done and at least one passed.
//     `ci` runs on every push (`.github/workflows/ci.yml`) and a branch keeps only its newest run, so
//     the head is the one commit that is sure to have a whole run, and it is the only candidate.
// Then it builds on Fly's builder, tags the image `sha-<commit>`, and, once `flyctl` says it is done,
// reads the Machines back and checks that the started ones run that image, instead of taking
// `flyctl`'s word. A Machine that is stopped stays as it is, and is `worker-scale`'s. When `flyctl`
// fails a deploy, each Machine a line of its failure names (`smoke checks for <id> failed`, `failed to
// update machine <id>`) gets its events and its last lines in Fly's log printed (fly.ts
// `machineReport`): flyctl 0.5.8 says it will show them, and printed none on PR #118's merge.
//
// GitHub's answers are read for the status and the fields it needs, and its words are never printed:
// a refusal says the status, which is what the person can act on.

import { DEV_APP, GITHUB_REPOSITORY } from "./environment.ts";
import { machineList, machineReport, machines, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawn } from "./spawn.ts";

export interface DeployBranchInput {
  readonly fly: Fly;
  readonly spawn: Spawn;
  readonly fetch: typeof fetch;
  /** `GITHUB_TOKEN`: it reads the branch and the workflow's runs, and writes nothing. */
  readonly githubToken: string;
  /** The checkout the workflow made: where `git` and `flyctl deploy` run. */
  readonly repo: string;
  readonly branch: string;
  readonly say: (line: string) => void;
}

const GITHUB = "https://api.github.com";
const GITHUB_MS = 30_000;
const GIT_MS = 30_000;
// A build on Fly's builder, a rolling update and the health checks.
const DEPLOY_MS = 20 * 60 * 1000;

const COMMIT = /^[0-9a-f]{40}$/;
const BRANCH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const linesOf = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

/** The Machines a failed deploy's lines name: each id in a line that says something failed, once, in order. */
export function failedMachines(text: string): string[] {
  const ids: string[] = [];
  for (const line of text.split("\n")) {
    if (!/fail/i.test(line)) continue;
    for (const [id] of line.matchAll(/\b[0-9a-f]{14}\b/g)) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** A branch's name as the repository uses them: parts of letters, digits and . _ - between single slashes. */
function checkBranch(branch: string): void {
  const parts = branch.split("/");
  const ok =
    branch.length <= 100 &&
    !branch.includes("..") &&
    !branch.endsWith(".") &&
    parts.every((part) => BRANCH_PART.test(part) && !part.endsWith(".lock"));
  if (!ok) {
    throw new OpsError(
      "deploy-branch: --branch takes a branch's name: letters, digits and . _ - in parts between single slashes",
    );
  }
}

const refusal = (reason: string) => new OpsError(`deploy-branch: refused: ${reason}`);

interface CiRun {
  readonly id: number;
  readonly status: string;
  readonly conclusion: string | null;
}

export async function deployBranch(input: DeployBranchInput): Promise<void> {
  const { fly, say, branch } = input;
  checkBranch(branch);

  const git = async (args: readonly string[]): Promise<string> => {
    const result = await input.spawn("git", args, { cwd: input.repo, timeoutMs: GIT_MS });
    if (result.code !== 0) throw new OpsError(`deploy-branch: git couldn't say what the checkout is: ${why(result)}`);
    return result.stdout;
  };
  const head = (await git(["rev-parse", "HEAD"])).trim();
  if (!COMMIT.test(head)) throw new OpsError("deploy-branch: git's answer about the checkout isn't a commit");
  if ((await git(["status", "--porcelain", "--untracked-files=all"])).trim() !== "") {
    throw refusal("the checkout isn't clean, so the build wouldn't be the commit");
  }

  const github = async (path: string, what: string): Promise<unknown> => {
    let response: Response;
    try {
      response = await input.fetch(`${GITHUB}${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${input.githubToken}`,
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(GITHUB_MS),
      });
    } catch {
      throw new OpsError("deploy-branch: no answer from GitHub");
    }
    if (response.status !== 200) {
      throw new OpsError(`deploy-branch: GitHub answered HTTP ${String(response.status)} to the request for ${what}`);
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  };

  const onGitHub = record(
    record(await github(`/repos/${GITHUB_REPOSITORY}/branches/${branch}`, `the branch ${branch}`))?.["commit"],
  )?.["sha"];
  if (typeof onGitHub !== "string" || !COMMIT.test(onGitHub)) {
    throw new OpsError(`deploy-branch: GitHub's answer about the branch ${branch} has no commit`);
  }
  const short = head.slice(0, 12);
  if (onGitHub !== head) {
    throw refusal(`the checkout is at ${short}, and ${branch} is at ${onGitHub.slice(0, 12)} on GitHub`);
  }
  say(`deploy-branch: ${branch} is at ${head}`);

  const listed = record(
    await github(
      `/repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${head}&per_page=100`,
      "the ci runs",
    ),
  )?.["workflow_runs"];
  if (!Array.isArray(listed)) throw new OpsError("deploy-branch: GitHub's answer about the ci runs isn't a list");
  // GitHub's own filter is asked for, and its answer is checked again: a run counts only when it is
  // this commit's, on this branch, from a push (not a run of some merge of it).
  const runs: CiRun[] = [];
  for (const entry of listed as unknown[]) {
    const run = record(entry);
    if (run?.["head_sha"] !== head || run["head_branch"] !== branch || run["event"] !== "push") continue;
    const id = run["id"];
    if (typeof id !== "number" || !Number.isInteger(id)) continue;
    const status = run["status"];
    const conclusion = run["conclusion"];
    runs.push({
      id,
      status: typeof status === "string" ? status : "unknown",
      conclusion: typeof conclusion === "string" ? conclusion : null,
    });
  }
  // A run that was cancelled or skipped proves nothing either way, so it is set aside; any other one
  // that isn't a pass stops the deploy, and so does one that isn't done, even when another passed.
  const failed = runs.find(
    (run) => run.status === "completed" && !["success", "cancelled", "skipped"].includes(run.conclusion ?? ""),
  );
  if (failed !== undefined) throw refusal(`the ci run for ${short} failed (${failed.conclusion ?? "no conclusion"})`);
  const running = runs.find((run) => run.status !== "completed");
  if (running !== undefined) throw refusal(`the ci run for ${short} is still running (${running.status})`);
  const passed = runs.find((run) => run.conclusion === "success");
  if (passed === undefined) {
    throw refusal(
      runs.length === 0 ? `no ci run for ${short} on ${branch}` : `every ci run for ${short} was cancelled or skipped`,
    );
  }
  say(`deploy-branch: its ci run, ${String(passed.id)}, passed`);

  const label = `sha-${head}`;
  say(`deploy-branch: deploying ${head} to ${DEV_APP}`);
  const deployed = await fly.run(
    [
      "deploy",
      "--remote-only",
      "--app",
      DEV_APP,
      "--config",
      "fly.toml",
      "--image-label",
      label,
      "--ha=false",
      "--strategy",
      "rolling",
      "--yes",
    ],
    { cwd: input.repo, timeoutMs: DEPLOY_MS },
  );
  // What the build and the update printed is the log of the deploy, and the only one there is.
  for (const text of [deployed.stdout, deployed.stderr]) for (const line of linesOf(text)) say(line);
  if (deployed.code !== 0) {
    for (const id of failedMachines(`${deployed.stdout}\n${deployed.stderr}`)) {
      for (const line of await machineReport(fly, id, "deploy-branch")) say(line);
    }
    throw new OpsError(`deploy-branch: flyctl couldn't deploy the commit: ${why(deployed)}`);
  }

  const now = await machines(fly);
  const started = now.filter((machine) => machine.state === "started");
  if (!started.some((machine) => machine.group === "api")) {
    // `flyctl deploy` leaves a Machine that is stopped as it was, so a crash at start shows up here.
    throw new OpsError(
      `deploy-branch: flyctl deployed, but no API Machine of ${DEV_APP} is started (the app's Machines: ${machineList(now)}); if it stopped on its own, Fly's log of ${DEV_APP} says why`,
    );
  }
  const runsLabel = (machine: { tag: string | undefined; image: string | undefined }) =>
    machine.tag === label || (machine.image ?? "").endsWith(`:${label}`);
  const behind = started.filter((machine) => !runsLabel(machine));
  if (behind.length > 0) {
    throw new OpsError(
      `deploy-branch: flyctl deployed, but a Machine of ${DEV_APP} doesn't run the image ${label}: ${behind
        .map((machine) => `${machine.id} (${machine.group ?? "no group"})`)
        .join(", ")}`,
    );
  }
  const worker = now.find((machine) => machine.group === "worker");
  say(
    `deploy-branch: ${head} is deployed: ${worker?.state === "started" ? "the API and the worker run" : "the API runs"} the image ${label}`,
  );
  if (worker === undefined) say("deploy-branch: the app has no worker Machine");
  else if (worker.state !== "started") say(`deploy-branch: the worker Machine is ${worker.state}`);
  say("deploy-branch: the next deploy-dev run, on a merge to main, replaces it");
}
