/// <reference lib="esnext.temporal" />
// The `ops` scripts, wired as `tools/ops/src/main.ts` wires them, against the local Postgres and
// the real psql (docs/plans/B0.md, slice 10a). The scripts' guard wants a pooler's host and a
// project reference in the connection string, so the strings here are made up; `connect` and
// `spawn` send each one to the test server instead, and the tests check what the script handed
// them. The dev clock is committed here and dropped again, and the application role's password
// is changed and put back, in `finally`: the test files run one at a time (vitest.db.config.ts).

import { copyFile, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareClock } from "@tadayo/domain";
import { pgEnvOf, runScript, spawnProcess, type DevDatabaseUrl, type OpsContext, type Spawn } from "@tadayo/ops";
import { FAKE_PUBLISHABLE, FAKE_SECRET, FAKE_URL, fakeSupabase, type Leak } from "@tadayo/ops/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminSql, appSql, MIGRATIONS, rolledBack, type Tx } from "./harness.ts";

const REF = "abcdefghijklmnopqrst";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const CI_PASSWORD = "tadayo-app-ci-only";
const NEW_PASSWORD = "a-new-password-of-more-than-32-characters-2";
const ADMIN_PASSWORD = "an-admin-password-of-the-made-up-string";
const REPO = join(import.meta.dirname, "..", "..", "..");

const realAppUrl = process.env.DATABASE_URL ?? "";
const realAdminUrl = process.env.DATABASE_ADMIN_URL ?? "";

const app = appSql();
const admin = adminSql();

const DROP_CLOCK = "DROP TABLE IF EXISTS app.dev_clock; DROP FUNCTION IF EXISTS app.dev_clock_forward()";
async function dropClock(): Promise<void> {
  await app.unsafe(DROP_CLOCK).simple();
}
beforeAll(dropClock);
afterAll(async () => {
  await dropClock();
  await admin.unsafe(`ALTER ROLE tadayo_app WITH PASSWORD '${CI_PASSWORD}'`);
  await admin.end();
  await app.end();
});

const made = (password: string) => ({
  SUPABASE_DEV_PROJECT_REF: REF,
  DATABASE_URL: `postgresql://tadayo_app.${REF}:${password}@${POOLER}:5432/postgres`,
  DATABASE_ADMIN_URL: `postgresql://postgres.${REF}:${ADMIN_PASSWORD}@${POOLER}:5432/postgres`,
  DATABASE_APP_PASSWORD: password,
});

interface Run {
  lines: string[];
  connected: string[];
  psql: { env: Readonly<Record<string, string>> | undefined; input: string | undefined }[];
}

/** A context whose connections go to the test server: as tadayo_app, with the password the string carries. */
function context(args: string[], env: Record<string, string>): { ctx: OpsContext; run: Run } {
  const run: Run = { lines: [], connected: [], psql: [] };
  const spawn: Spawn = (command, spawnArgs, options = {}) => {
    run.psql.push({ env: options.env, input: options.input });
    // psql goes to the test server as its administrator, over a connection with no TLS.
    const local = { ...pgEnvOf(realAdminUrl as DevDatabaseUrl), PGSSLMODE: "disable" };
    return spawnProcess(command, spawnArgs, { ...options, env: local });
  };
  const ctx: OpsContext = {
    env,
    args,
    repo: REPO,
    spawn,
    fetch: () => Promise.reject(new Error("no network here")),
    connect: (url: DevDatabaseUrl) => {
      run.connected.push(url);
      const real = new URL(realAppUrl);
      real.password = new URL(url).password;
      return postgres(real.href, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
    },
    sleep: () => Promise.resolve(),
    say: (line) => run.lines.push(line),
  };
  return { ctx, run };
}

describe("the scripts against the local Postgres", () => {
  it("migrate: connects with the string it was given, applies nothing on a migrated database, and says so", async () => {
    const env = made(CI_PASSWORD);
    const { ctx, run } = context([], env);
    await runScript("migrate", ctx);
    expect(run.connected).toEqual([env.DATABASE_URL]);
    expect(run.lines).toEqual(["migrate: nothing to apply"]);
  });

  it("migrate: says how many it applied when a migration is new, and applies it only once", async () => {
    // A repository with db/migrations as it is and one more file after them, which commits a closed table.
    const repo = await mkdtemp(join(tmpdir(), "tadayo-ops-migrate-"));
    const folder = join(repo, "db", "migrations");
    await mkdir(folder, { recursive: true });
    for (const name of await readdir(MIGRATIONS)) await copyFile(join(MIGRATIONS, name), join(folder, name));
    const version = (await readdir(folder)).length + 1;
    await writeFile(
      join(folder, `${String(version).padStart(4, "0")}_ops_script_probe.sql`),
      "CREATE TABLE app.ops_script_probe (x integer);\nALTER TABLE app.ops_script_probe ENABLE ROW LEVEL SECURITY;\n",
    );
    try {
      const first = context([], made(CI_PASSWORD));
      await runScript("migrate", { ...first.ctx, repo });
      expect(first.run.lines.at(-1)).toBe("migrate: 1 applied");
      const again = context([], made(CI_PASSWORD));
      await runScript("migrate", { ...again.ctx, repo });
      expect(again.run.lines).toEqual(["migrate: nothing to apply"]);
    } finally {
      // It did commit: take it away, as an operator would with a migration of its own.
      await app.begin(async (tx) => {
        await tx`DROP TABLE IF EXISTS app.ops_script_probe`;
        await tx`DELETE FROM app.schema_migrations WHERE version = ${version}`;
      });
    }
  });

  it("seed: says there are no seeds yet while db/seed is empty or absent", async () => {
    const { ctx, run } = context([], made(CI_PASSWORD));
    await runScript("seed", ctx);
    expect(run.lines).toEqual(["seed: no seed files in db/seed yet"]);
  });

  it("dev-clock: makes the table once, reports it, moves it forward to an instant, and refuses to go back", async () => {
    try {
      const first = context([], made(CI_PASSWORD));
      await runScript("dev-clock", first.ctx);
      expect(first.run.lines[0]).toBe("dev-clock: made app.dev_clock");
      expect(first.run.lines[1]).toMatch(/Postgres reads \S+, and dev's clock reads \S+, 0 seconds ahead$/);

      const target = Temporal.Now.instant().add({ hours: 48 });
      const moved = context(["--to", target.toString()], made(CI_PASSWORD));
      await runScript("dev-clock", moved.ctx);
      expect(moved.run.lines[0]).toBe("dev-clock: app.dev_clock was there");
      const ahead = Number(/, (\d+) seconds ahead$/.exec(moved.run.lines[1] ?? "")?.[1]);
      expect(ahead).toBeGreaterThanOrEqual(48 * 3600 - 5);
      expect(ahead).toBeLessThanOrEqual(48 * 3600 + 5);
      // A dev's API starts on it, and a prod's refuses it (ADR-013).
      await expect(prepareClock("dev", app)).resolves.toBeDefined();
      await expect(prepareClock("prod", app)).rejects.toThrow(/prod refuses a dev clock/);

      const back = context(["--to", Temporal.Now.instant().add({ hours: 24 }).toString()], made(CI_PASSWORD));
      await expect(runScript("dev-clock", back.ctx)).rejects.toThrow(/only moves forward/);
    } finally {
      await dropClock();
    }
  });

  it("dev-clock: a refusal leaves no table behind, and the connection it opened is closed", async () => {
    const tooFar = Temporal.Now.instant()
      .add({ hours: 24 * 400 })
      .toString();
    const { ctx } = context(["--to", tooFar], made(CI_PASSWORD));
    const connections: postgres.Sql[] = [];
    const tracked: OpsContext = {
      ...ctx,
      connect: (url) => {
        const sql = ctx.connect(url);
        connections.push(sql);
        return sql;
      },
    };
    await expect(runScript("dev-clock", tracked)).rejects.toThrow(/366 days/);
    const [connection] = connections;
    expect(connections).toHaveLength(1);
    if (!connection) throw new Error("no connection was opened");
    await expect(connection`SELECT 1`).rejects.toThrow(/CONNECTION_ENDED/);
    const [row] = await app<
      { present: boolean }[]
    >`SELECT pg_catalog.to_regclass('app.dev_clock') IS NOT NULL AS present`;
    expect(row?.present).toBe(false);
  });

  it("bootstrap: gives tadayo_app the password it is given, hands psql the admin's connection from its own string, and logs in", async () => {
    try {
      const env = made(NEW_PASSWORD);
      const { ctx, run } = context([], env);
      await runScript("bootstrap", ctx);
      expect(run.lines).toEqual(["bootstrap: db/bootstrap.sql ran", "bootstrap: tadayo_app logs in with DATABASE_URL"]);
      expect(run.psql).toHaveLength(1);
      expect(run.psql[0]?.env?.["PGHOST"]).toBe(POOLER);
      expect(run.psql[0]?.env?.["PGUSER"]).toBe(`postgres.${REF}`);
      expect(JSON.stringify(run.psql[0]?.env)).not.toContain(NEW_PASSWORD);
      expect(run.psql[0]?.input).not.toContain(NEW_PASSWORD);
      // The password is the one given: the old one no longer logs in.
      const old = postgres(realAppUrl, { max: 1, onnotice: () => undefined, connect_timeout: 10 });
      await expect(old`SELECT 1`).rejects.toThrow(/password authentication failed/);
      await old.end();
      expect(run.connected).toEqual([env.DATABASE_URL]);
    } finally {
      await admin.unsafe(`ALTER ROLE tadayo_app WITH PASSWORD '${CI_PASSWORD}'`);
    }
  }, 60_000);
});

// What Storage's own migrations leave, which ci's database lacks: two tables with row-level security on.
const STORAGE_STAND_IN = `
  DROP SCHEMA IF EXISTS storage CASCADE;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`;

describe("storage-setup and supabase-probe on the Machine (--here), against the local Postgres and a made-up project", () => {
  // `REF` is the made-up project's own. What a Machine has: fly.toml's `[env]` and the founder's two secrets.
  const MACHINE_ENV = {
    SUPABASE_URL: FAKE_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SERVICE_KEY: FAKE_SECRET,
    DATABASE_URL: `postgresql://tadayo_app.${REF}:a-password-of-the-made-up-string@${POOLER}:5432/postgres`,
  };

  /**
   * `storage-setup`, then `supabase-probe`, as the runner starts them one after the other on the
   * Machine, with the probe's database connection on a transaction that is rolled back, in a
   * database that has a Storage. `before` changes the database first.
   */
  async function onTheMachine(leaks: readonly Leak[] = [], before?: (tx: Tx) => Promise<void>) {
    return rolledBack(admin, async (tx: Tx) => {
      await tx.unsafe(STORAGE_STAND_IN);
      await before?.(tx);
      const fake = fakeSupabase({ leaks });
      const lines: string[] = [];
      const context = (args: string[]): OpsContext => ({
        env: MACHINE_ENV,
        args,
        repo: REPO,
        spawn: spawnProcess,
        fetch: fake.fetch,
        // The transaction stands in for the connection; ending a connection is nothing to it.
        connect: () => Object.assign(tx, { end: () => Promise.resolve() }) as unknown as postgres.Sql,
        sleep: () => Promise.resolve(),
        say: (line) => lines.push(line),
      });
      await runScript("storage-setup", context(["--here", "--ref", REF]));
      const setup = lines.splice(0);
      const outcome = await runScript("supabase-probe", context(["--here", "--ref", REF])).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      return { setup, lines, outcome, fake };
    });
  }

  it("makes the two buckets, and then finds the project closed: the run's id first, every check ok, the count last", async () => {
    const { setup, lines, outcome, fake } = await onTheMachine();
    expect(setup.length).toBeGreaterThan(0);
    expect(outcome, lines.join("\n")).toBeUndefined();
    expect(lines[0]).toMatch(/^supabase-probe: run [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const checks = lines.slice(1, -1);
    expect(checks.length).toBeGreaterThan(60);
    for (const line of checks) expect(line.startsWith("supabase-probe: ok    "), line).toBe(true);
    expect(lines.at(-1)).toBe(`supabase-probe: all ${String(checks.length)} checks passed`);
    // The database's three checks come first, and the doors' after them.
    expect(checks[0]).toBe(
      "supabase-probe: ok    database: nothing in app is open to anon, authenticated, service_role or PUBLIC",
    );
    expect(checks.some((line) => line.includes("anon: REST schema_migrations"))).toBe(true);
    // Nothing is left behind but the buckets storage-setup made.
    expect(fake.users.size).toBe(0);
    expect(fake.objects.size).toBe(0);
    expect([...fake.buckets.keys()].sort()).toEqual(["renditions", "uploads"]);
    expect(JSON.stringify([setup, lines])).not.toContain(FAKE_SECRET);
    expect(JSON.stringify([setup, lines])).not.toContain(FAKE_PUBLISHABLE);
  });

  it("fails, saying how many checks failed and which, when a door leaks, and still cleans up", async () => {
    const { lines, outcome, fake } = await onTheMachine(["graphql"]);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/^supabase-probe: 2 of \d+ checks failed$/);
    const failed = lines.filter((line) => line.startsWith("supabase-probe: FAIL  "));
    expect(failed.map((line) => line.split(":").slice(0, 3).join(":"))).toEqual([
      "supabase-probe: FAIL  anon: GraphQL",
      "supabase-probe: FAIL  user: GraphQL",
    ]);
    expect(fake.users.size).toBe(0);
    expect(fake.objects.size).toBe(0);
  });

  it("fails, naming the table, when Storage's tables have a policy: the database layer is part of the run", async () => {
    const { lines, outcome } = await onTheMachine([], async (tx) => {
      await tx.unsafe("CREATE POLICY one ON storage.objects FOR SELECT USING (true)");
    });
    expect((outcome as Error).message).toMatch(/^supabase-probe: 1 of \d+ checks failed$/);
    expect(lines.filter((line) => line.includes("FAIL"))).toEqual([
      "supabase-probe: FAIL  database: Storage's buckets and objects have row-level security and no policy: storage.objects has 1 policy",
    ]);
  });
});
