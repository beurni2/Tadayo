/// <reference lib="esnext.temporal" />
// The one entry for every `ops` script (docs/plans/B0.md, slices 10a and 10b; TECH-DESIGN section
// 9): `node tools/ops/src/main.ts <script> [--option value …]`. Each script reads its variables
// from the environment, takes its options from the arguments, and prints lines through `say`,
// which `main.ts` runs through the redactor (output.ts). A script acts on `tadayo-dev` and
// nothing else (environment.ts): a database is `dev`'s only by the project reference in its
// connection string, and the Fly app is one constant. Every effect on the world comes through
// the context's `connect`, `spawn` and `fetch`, so a test gives each a fake.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type postgres from "postgres";
import { runBootstrap } from "./bootstrap.ts";
import { certificateRefusal } from "./database.ts";
import { deployBranch } from "./deploy-branch.ts";
import { devClock } from "./dev-clock.ts";
import {
  devDatabaseUrl,
  devProjectRef,
  MACHINE_MAIN,
  pgEnvOf,
  readVariables,
  type DevDatabaseUrl,
} from "./environment.ts";
import { flyAppCreate } from "./fly-app-create.ts";
import { flyOf } from "./fly.ts";
import { migrate } from "./migrate.ts";
import { onMachine } from "./on-machine.ts";
import { OpsError } from "./ops-error.ts";
import { seed } from "./seed.ts";
import type { Spawn } from "./spawn.ts";
import { BUCKETS, storageSetup } from "./storage-setup.ts";
import { projectUrl } from "./supabase.ts";
import {
  apiChecks,
  BUDGET_MS,
  databaseChecks,
  dataApiChecks,
  DEADLINE_MS,
  reportLine,
  type Check,
} from "./supabase-probe.ts";
import { workerScale } from "./worker-scale.ts";

export interface OpsContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly args: readonly string[];
  /** The repository's root: where `db/` and `tools/` are. */
  readonly repo: string;
  readonly spawn: Spawn;
  readonly fetch: typeof fetch;
  /** Opens a connection to a database `devDatabaseUrl` has checked. */
  readonly connect: (url: DevDatabaseUrl) => postgres.Sql;
  /** Waits; a test gives one that doesn't. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly say: (line: string) => void;
}

interface Script {
  readonly about: string;
  readonly run: (ctx: OpsContext) => Promise<void>;
}

/** The arguments as options, or an OpsError that names what's wrong; no positional argument is taken. */
function optionsOf<Spec extends Record<string, { type: "string" | "boolean" }>>(
  args: readonly string[],
  spec: Spec,
  script: string,
) {
  try {
    return parseArgs({ args: [...args], options: spec, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new OpsError(`${script}: ${error instanceof Error ? error.message : "the arguments aren't understood"}`);
  }
}

/** The script that opens a connection, and the variable its string came from, for what it says when it can't. */
interface Site {
  readonly script: string;
  readonly variable: string;
}

async function withDatabase<T>(
  ctx: OpsContext,
  site: Site,
  url: DevDatabaseUrl,
  body: (db: postgres.Sql) => Promise<T>,
): Promise<T> {
  const db = ctx.connect(url);
  try {
    // The driver connects when it is first asked something, so what fails here is the connection and
    // not the script's own work. Its words (Supavisor's, mostly) name neither the variable nor the
    // step that failed, so they come after ours.
    try {
      await db`SELECT 1`;
    } catch (error) {
      const refusal = certificateRefusal(error);
      if (refusal !== undefined)
        throw new OpsError(`${site.script}: couldn't connect with ${site.variable}: ${refusal}.`);
      const reason = error instanceof Error && error.message !== "" ? error.message : "no reason was given";
      throw new OpsError(
        `${site.script}: couldn't connect with ${site.variable}: ${reason}. Has ops bootstrap run, and does ${site.variable} hold the password it set?`,
      );
    }
    return await body(db);
  } finally {
    await db.end();
  }
}

/** `DATABASE_URL`, the connection as `tadayo_app`, checked to be `dev`'s. */
function appUrl(ctx: OpsContext): DevDatabaseUrl {
  const variables = readVariables(ctx.env, ["DATABASE_URL", "SUPABASE_DEV_PROJECT_REF"]);
  return devDatabaseUrl(variables.DATABASE_URL, variables.SUPABASE_DEV_PROJECT_REF);
}

function instantOf(text: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(text);
  } catch {
    throw new OpsError("dev-clock: --to takes an instant with its offset, such as 2026-11-14T06:59:50Z");
  }
}

const microsecondsText = (microseconds: bigint) => `${(microseconds / 1_000_000n).toString()} seconds`;

const bootstrapScript: Script = {
  about: "give tadayo_app its password, and make the schema app and its extensions (db/bootstrap.sql)",
  async run(ctx) {
    optionsOf(ctx.args, {}, "bootstrap");
    const variables = readVariables(ctx.env, [
      "DATABASE_ADMIN_URL",
      "DATABASE_APP_PASSWORD",
      "DATABASE_URL",
      "SUPABASE_DEV_PROJECT_REF",
    ]);
    const admin = devDatabaseUrl(
      variables.DATABASE_ADMIN_URL,
      variables.SUPABASE_DEV_PROJECT_REF,
      "DATABASE_ADMIN_URL",
    );
    const app = devDatabaseUrl(variables.DATABASE_URL, variables.SUPABASE_DEV_PROJECT_REF);
    // Two secrets name one password, and nothing else would tell them apart before the next step fails.
    if (decodeURIComponent(new URL(app).password) !== variables.DATABASE_APP_PASSWORD) {
      throw new OpsError("bootstrap: DATABASE_URL and DATABASE_APP_PASSWORD hold different passwords for tadayo_app");
    }
    await runBootstrap({
      pgEnv: pgEnvOf(admin),
      password: variables.DATABASE_APP_PASSWORD,
      file: join(ctx.repo, "db", "bootstrap.sql"),
      spawn: ctx.spawn,
    });
    ctx.say("bootstrap: db/bootstrap.sql ran");
    // The role the next scripts use, with the password just set.
    const me = await withDatabase(
      ctx,
      { script: "bootstrap", variable: "DATABASE_URL" },
      app,
      async (db) => (await db<{ me: string }[]>`SELECT current_user AS me`)[0]?.me,
    );
    if (me !== "tadayo_app") throw new OpsError(`bootstrap: DATABASE_URL connects as ${String(me)}, not tadayo_app`);
    ctx.say("bootstrap: tadayo_app logs in with DATABASE_URL");
  },
};

const migrateScript: Script = {
  about: "apply db/migrations to tadayo-dev as tadayo_app",
  async run(ctx) {
    optionsOf(ctx.args, {}, "migrate");
    const url = appUrl(ctx);
    const applied = await withDatabase(ctx, { script: "migrate", variable: "DATABASE_URL" }, url, (db) =>
      migrate(db, join(ctx.repo, "db", "migrations"), ctx.say),
    );
    ctx.say(applied.length === 0 ? "migrate: nothing to apply" : `migrate: ${String(applied.length)} applied`);
  },
};

const seedScript: Script = {
  about: "apply the files in db/seed, each in its own transaction, as tadayo_app",
  async run(ctx) {
    optionsOf(ctx.args, {}, "seed");
    const url = appUrl(ctx);
    await withDatabase(ctx, { script: "seed", variable: "DATABASE_URL" }, url, (db) =>
      seed(db, join(ctx.repo, "db", "seed"), ctx.say),
    );
  },
};

const devClockScript: Script = {
  about: "make app.dev_clock if it's missing, and with --to <instant> move it forward to then",
  async run(ctx) {
    const { to } = optionsOf(ctx.args, { to: { type: "string" } }, "dev-clock");
    const url = appUrl(ctx);
    const target = to === undefined ? undefined : instantOf(to);
    const makeSql = await readFile(join(ctx.repo, "tools", "ops", "sql", "dev_clock.sql"), "utf8");
    const report = await withDatabase(ctx, { script: "dev-clock", variable: "DATABASE_URL" }, url, (db) =>
      db.begin((tx) => devClock(tx, target === undefined ? { makeSql } : { makeSql, to: target })),
    );
    ctx.say(`dev-clock: ${report.made ? "made app.dev_clock" : "app.dev_clock was there"}`);
    ctx.say(
      `dev-clock: Postgres reads ${report.postgresNow.toString()}, and dev's clock reads ` +
        `${report.devNow.toString()}, ${microsecondsText(report.offsetMicroseconds)} ahead`,
    );
  },
};

// ---- The scripts that need Supabase's service key run on the API's Machine, where Fly keeps it
// (on-machine.ts): the runner starts the same script there with `--here --ref <dev's reference>`.

const HERE = { here: { type: "boolean" }, ref: { type: "string" } } as const;

type Where = { readonly here: false } | { readonly here: true; readonly ref: string };

/** `--here --ref <reference>` for the Machine's half, neither for the runner's. */
function whereOf(
  options: { readonly here?: boolean | undefined; readonly ref?: string | undefined },
  script: string,
): Where {
  if (options.here !== true) {
    if (options.ref !== undefined) throw new OpsError(`${script}: --ref goes with --here`);
    return { here: false };
  }
  if (options.ref === undefined) throw new OpsError(`${script}: --here takes --ref <the dev project's reference>`);
  return { here: true, ref: options.ref };
}

/** On the Machine: `SUPABASE_URL` must be the project `--ref` names, which the runner says is dev's. */
function machineProject(url: string, ref: string, script: string): string {
  const project = projectUrl(url);
  if (project !== `https://${ref}.supabase.co`) {
    throw new OpsError(`${script}: SUPABASE_URL isn't the project --ref names, which is tadayo-dev's`);
  }
  return project;
}

/**
 * Starts `<script> --here --ref <reference>` on the API's Machine, says what it prints, and puts
 * each of its lines in `heard` as it is said, so that they are there also when it fails; the
 * runner's own lines about the run's WireGuard peer are said, and aren't among them.
 */
async function onTheMachine(ctx: OpsContext, script: string, ref: string, heard: string[] = []): Promise<string[]> {
  await onMachine({
    fly: flyOf(ctx.spawn, ctx.env),
    label: script,
    command: ["node", MACHINE_MAIN, script, "--here", "--ref", ref],
    say: (line) => {
      heard.push(line);
      ctx.say(line);
    },
    note: ctx.say,
  });
  return heard;
}

const storageSetupScript: Script = {
  about: "make the private buckets uploads and renditions, on the API's Machine, where the service key is",
  async run(ctx) {
    const where = whereOf(optionsOf(ctx.args, HERE, "storage-setup"), "storage-setup");
    if (where.here) {
      const variables = readVariables(ctx.env, ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]);
      const url = machineProject(variables.SUPABASE_URL, where.ref, "storage-setup");
      await storageSetup({ fetch: ctx.fetch, url, serviceKey: variables.SUPABASE_SERVICE_KEY, say: ctx.say });
      return;
    }
    const variables = readVariables(ctx.env, ["FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF"]);
    const heard = await onTheMachine(ctx, "storage-setup", devProjectRef(variables.SUPABASE_DEV_PROJECT_REF));
    // An exit status of 0 isn't enough: flyctl also exits 0 for a session that closed before the
    // command ran (on-machine.ts), so each bucket's own line is what says the Machine got that far.
    for (const bucket of BUCKETS) {
      if (!heard.some((line) => line.startsWith(`storage-setup: ${bucket}: `))) {
        throw new OpsError(
          `storage-setup: the Machine's report ended before it said what became of ${bucket}; run it again, since it makes only what is missing`,
        );
      }
    }
  },
};

/** The Machine's half of the probe: the database as the API's role reads it, then Supabase's three doors. */
async function probeOnMachine(ctx: OpsContext, ref: string): Promise<void> {
  const variables = readVariables(ctx.env, [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "DATABASE_URL",
  ]);
  const url = machineProject(variables.SUPABASE_URL, ref, "supabase-probe");
  const database = devDatabaseUrl(variables.DATABASE_URL, ref);
  // The time limits run from here, so that the database's checks count against them too, and the
  // clean-up still ends before the runner gives up on the command (supabase-probe.ts, DEADLINE_MS).
  const budget = AbortSignal.timeout(BUDGET_MS);
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  // What a failed clean-up leaves is named by this id (`probe/<run>/…`, `probe-<run>@probe.invalid`,
  // the buckets `probe-<run>-anon` and `probe-<run>-user`).
  const run = randomUUID();
  ctx.say(`supabase-probe: run ${run}`);
  const report = await withDatabase(ctx, { script: "supabase-probe", variable: "DATABASE_URL" }, database, (db) =>
    databaseChecks(db),
  );
  const api = await apiChecks({
    fetch: ctx.fetch,
    url,
    publishableKey: variables.SUPABASE_PUBLISHABLE_KEY,
    serviceKey: variables.SUPABASE_SERVICE_KEY,
    tables: report.tables,
    id: () => run,
    budget,
    deadline,
  });
  const checks: Check[] = [...report.checks, ...api];
  for (const check of checks) ctx.say(`supabase-probe: ${reportLine(check)}`);
  const failed = checks.filter((check) => !check.ok).length;
  if (failed > 0) throw new OpsError(`supabase-probe: ${String(failed)} of ${String(checks.length)} checks failed`);
  ctx.say(`supabase-probe: all ${String(checks.length)} checks passed`);
}

/** The Machine's half's last line, on stdout when every check passed, on stderr (the failure) when not. */
const PROBE_PASSED = /^supabase-probe: all \d+ checks passed$/;
const PROBE_FAILED = /^supabase-probe: \d+ of \d+ checks failed$/;
/** What the probe makes, by the names its clean-up deletes them by (supabase-probe.ts). */
const PROBE_LEFTOVERS =
  "the project may hold what the probe makes: a user whose address starts with probe- and ends with @probe.invalid, objects under probe/ in uploads and renditions, and buckets whose names start with probe-. Delete them by those names";

/** The runner's half: the project's own settings, through the Management API, then the Machine's half. */
async function probeFromRunner(ctx: OpsContext): Promise<void> {
  const variables = readVariables(ctx.env, ["FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]);
  const ref = devProjectRef(variables.SUPABASE_DEV_PROJECT_REF);
  const settings = await dataApiChecks(ctx.fetch, ref, variables.SUPABASE_ACCESS_TOKEN);
  for (const check of settings) ctx.say(`supabase-probe: ${reportLine(check)}`);
  // Both halves say what they found; the run fails if either failed. The Machine's half says its
  // run's id before it makes anything and ends by saying how its checks went, and every line it
  // printed comes back, also from a session that failed or was cut short (on-machine.ts). So a
  // report with the first line and not the last is one whose command, or whose session, was ended
  // part way, and the probe's own clean-up may not have run; an exit status of 0 doesn't rule that
  // out, since flyctl also exits 0 for a session that closed before the command ran. A report
  // without the run's id is one that failed before it made anything (a Machine without the service
  // key, say), or whose command never started.
  const heard: string[] = [];
  let onMachineFailure: OpsError | undefined;
  try {
    await onTheMachine(ctx, "supabase-probe", ref, heard);
  } catch (error) {
    if (!(error instanceof OpsError)) throw error;
    onMachineFailure = error;
  }
  const started = heard.some((line) => line.startsWith("supabase-probe: run "));
  const passed = heard.some((line) => PROBE_PASSED.test(line));
  const ended = passed || heard.some((line) => PROBE_FAILED.test(line));
  if (heard.length === 0) {
    ctx.say(`supabase-probe: nothing came back from the Machine. If its command had started, ${PROBE_LEFTOVERS}`);
  } else if (started && !ended) {
    ctx.say(`supabase-probe: the Machine's report ended before its checks did, so ${PROBE_LEFTOVERS}`);
  }
  if (onMachineFailure !== undefined) throw onMachineFailure;
  if (!passed) {
    throw new OpsError("supabase-probe: the Machine's report doesn't say its checks passed, so it proves nothing");
  }
  if (settings.some((check) => !check.ok)) throw new OpsError("supabase-probe: the Data API check failed");
  ctx.say("supabase-probe: every check passed");
}

const supabaseProbeScript: Script = {
  about:
    "check that the dev project is closed: its Data API, its database as the API's role reads it, and its three public doors",
  async run(ctx) {
    const where = whereOf(optionsOf(ctx.args, HERE, "supabase-probe"), "supabase-probe");
    await (where.here ? probeOnMachine(ctx, where.ref) : probeFromRunner(ctx));
  },
};

// ---- The scripts that call Fly, and GitHub, from the runner.

const workerScaleScript: Script = {
  about: "stop or start the worker Machine of tadayo-api-dev: --to stopped or --to started",
  async run(ctx) {
    const { to } = optionsOf(ctx.args, { to: { type: "string" } }, "worker-scale");
    if (to !== "stopped" && to !== "started") throw new OpsError("worker-scale: --to takes stopped or started");
    await workerScale({ fly: flyOf(ctx.spawn, ctx.env), to, say: ctx.say, sleep: ctx.sleep });
  },
};

const flyAppCreateScript: Script = {
  about:
    "make the Fly app tadayo-api-dev if it isn't there, and request the certificate of api-dev.tadayo.app (--org <slug> when the token sees several organizations)",
  async run(ctx) {
    const { org } = optionsOf(ctx.args, { org: { type: "string" } }, "fly-app-create");
    await flyAppCreate({ fly: flyOf(ctx.spawn, ctx.env), ...(org === undefined ? {} : { org }), say: ctx.say });
  },
};

const deployBranchScript: Script = {
  about: "deploy a branch's head commit to tadayo-api-dev, when that commit's ci run is green: --branch <name>",
  async run(ctx) {
    const { branch } = optionsOf(ctx.args, { branch: { type: "string" } }, "deploy-branch");
    if (branch === undefined) throw new OpsError("deploy-branch: --branch <name> is needed");
    const variables = readVariables(ctx.env, ["FLY_API_TOKEN", "GITHUB_TOKEN"]);
    await deployBranch({
      fly: flyOf(ctx.spawn, ctx.env),
      spawn: ctx.spawn,
      fetch: ctx.fetch,
      githubToken: variables.GITHUB_TOKEN,
      repo: ctx.repo,
      branch,
      say: ctx.say,
    });
  },
};

/** Every script, by the name it's run with. */
export const SCRIPTS: Readonly<Record<string, Script>> = {
  bootstrap: bootstrapScript,
  "deploy-branch": deployBranchScript,
  "dev-clock": devClockScript,
  "fly-app-create": flyAppCreateScript,
  migrate: migrateScript,
  seed: seedScript,
  "storage-setup": storageSetupScript,
  "supabase-probe": supabaseProbeScript,
  "worker-scale": workerScaleScript,
};

/** Runs the script `name`, or throws an OpsError: an unknown name lists the ones there are. */
export async function runScript(name: string | undefined, ctx: OpsContext): Promise<void> {
  const script = name === undefined ? undefined : Object.hasOwn(SCRIPTS, name) ? SCRIPTS[name] : undefined;
  if (!script) {
    const lines = Object.entries(SCRIPTS).map(([key, value]) => `  ${key}: ${value.about}`);
    throw new OpsError(
      `ops: ${name === undefined ? "name a script" : `no script is called ${JSON.stringify(name)}`}; they are:\n${lines.join("\n")}`,
    );
  }
  await script.run(ctx);
}
