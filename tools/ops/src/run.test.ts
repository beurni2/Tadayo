// The scripts' entry without a database or a network: what each refuses before it touches
// anything, what it hands psql, and that the connection it opens is closed. The database side,
// with the real psql and Postgres, is tests/src/db/ops-scripts.test.ts.

import { join } from "node:path";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import { OpsError } from "./ops-error.ts";
import { runScript, SCRIPTS, type OpsContext } from "./run.ts";
import type { Spawn, SpawnOptions } from "./spawn.ts";

const REF = "abcdefghijklmnopqrst";
const OTHER_REF = "tsrqponmlkjihgfedcba";
const APP_PASSWORD = "a-random-password-of-more-than-32-characters";
const ADMIN_PASSWORD = "the-admin-password-which-is-another-one";
const HOST = "aws-0-us-east-1.pooler.supabase.com";
const appUrl = (ref = REF, password = APP_PASSWORD, host = HOST) =>
  `postgresql://tadayo_app.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
const adminUrl = (ref = REF) => `postgresql://postgres.${ref}:${ADMIN_PASSWORD}@${HOST}:5432/postgres`;

const ENV = {
  DATABASE_URL: appUrl(),
  DATABASE_ADMIN_URL: adminUrl(),
  DATABASE_APP_PASSWORD: APP_PASSWORD,
  SUPABASE_DEV_PROJECT_REF: REF,
};

interface Harness {
  ctx: OpsContext;
  said: string[];
  connected: string[];
  ended: { count: number };
  spawned: { command: string; args: readonly string[]; options: SpawnOptions }[];
}

/** A context that touches nothing: a connection that answers `rows` to any query, a psql that exits `code`. */
function harness(
  options: {
    env?: Record<string, string | undefined>;
    args?: string[];
    rows?: Record<string, unknown>[];
    code?: number;
    connectFails?: boolean;
    /** What the first query is refused with, as a pooler refuses a role it doesn't know or a wrong password. */
    queryFails?: string;
  } = {},
): Harness {
  const said: string[] = [];
  const connected: string[] = [];
  const ended = { count: 0 };
  const spawned: Harness["spawned"] = [];
  const spawn: Spawn = (command, args, spawnOptions = {}) => {
    spawned.push({ command, args, options: spawnOptions });
    return Promise.resolve({ code: options.code ?? 0, timedOut: false, stdout: "", stderr: "" });
  };
  const ctx: OpsContext = {
    env: options.env ?? ENV,
    args: options.args ?? [],
    repo: "/repo",
    spawn,
    fetch: () => Promise.reject(new Error("no network here")),
    connect: (url) => {
      connected.push(url);
      if (options.connectFails) throw new Error("connected");
      const answer = () =>
        options.queryFails === undefined
          ? Promise.resolve(options.rows ?? [])
          : Promise.reject(new Error(options.queryFails));
      const sql = Object.assign(answer, {
        end: () => {
          ended.count += 1;
          return Promise.resolve();
        },
      });
      return sql as unknown as postgres.Sql;
    },
    sleep: () => Promise.resolve(),
    say: (line) => said.push(line),
  };
  return { ctx, said, connected, ended, spawned };
}

const DATABASE_SCRIPTS = ["bootstrap", "dev-clock", "migrate", "seed"];

describe("runScript", () => {
  it("runs nothing for a name it doesn't have, and lists the ones it has", async () => {
    for (const name of ["", "drop-everything", "constructor", "__proto__", "toString"]) {
      const { ctx, connected, spawned } = harness();
      await expect(runScript(name, ctx), name).rejects.toThrow(/no script is called/);
      expect(connected).toEqual([]);
      expect(spawned).toEqual([]);
    }
    const { ctx } = harness();
    const message = await runScript(undefined, ctx).then(
      () => "",
      (error: unknown) => (error instanceof Error ? error.message : ""),
    );
    for (const name of Object.keys(SCRIPTS)) expect(message).toContain(name);
    expect(message).toContain("name a script");
  });

  it("refuses a database that isn't tadayo-dev's, before it connects or starts anything", async () => {
    // What each script is given, and the scripts that read it: the admin's string is bootstrap's alone.
    const refused: [Record<string, string>, string[]][] = [
      [{ DATABASE_URL: appUrl(OTHER_REF) }, DATABASE_SCRIPTS],
      [{ DATABASE_URL: appUrl(REF, APP_PASSWORD, "localhost") }, DATABASE_SCRIPTS],
      [{ DATABASE_URL: appUrl(REF, APP_PASSWORD, "db.rhsycmycocbzakrydahi.supabase.co") }, DATABASE_SCRIPTS],
      [{ DATABASE_ADMIN_URL: adminUrl(OTHER_REF) }, ["bootstrap"]],
      [{ DATABASE_ADMIN_URL: `postgresql://postgres:${ADMIN_PASSWORD}@localhost:5432/postgres` }, ["bootstrap"]],
    ];
    for (const [change, scripts] of refused) {
      for (const script of scripts) {
        const { ctx, connected, spawned, said } = harness({ env: { ...ENV, ...change }, connectFails: true });
        await expect(runScript(script, ctx), `${script} ${Object.keys(change).join()}`).rejects.toThrow(OpsError);
        expect(connected, script).toEqual([]);
        expect(spawned, script).toEqual([]);
        expect(said, script).toEqual([]);
      }
    }
  });

  it("refuses a prod configuration: the reference it is told is dev's and the string's is another's", async () => {
    // `SUPABASE_DEV_PROJECT_REF` is dev's by its name; a database named by another reference is never touched.
    for (const script of DATABASE_SCRIPTS) {
      const { ctx, connected } = harness({ env: { ...ENV, SUPABASE_DEV_PROJECT_REF: OTHER_REF }, connectFails: true });
      await expect(runScript(script, ctx), script).rejects.toThrow(/project reference/);
      expect(connected, script).toEqual([]);
    }
  });

  it("names the variable that isn't set, never its value", async () => {
    for (const script of DATABASE_SCRIPTS) {
      const without = Object.fromEntries(Object.entries(ENV).filter(([key]) => key !== "SUPABASE_DEV_PROJECT_REF"));
      const { ctx } = harness({ env: without });
      await expect(runScript(script, ctx), script).rejects.toThrow(/set SUPABASE_DEV_PROJECT_REF/);
    }
    const { ctx } = harness({ env: { ...ENV, DATABASE_URL: "" } });
    await expect(runScript("migrate", ctx)).rejects.toThrow(/set DATABASE_URL/);
  });

  it("takes no option it doesn't know and no loose word, before it connects", async () => {
    for (const script of DATABASE_SCRIPTS) {
      for (const args of [["--by", "1h"], ["now"], ["--", "x"]]) {
        const { ctx, connected, spawned } = harness({ args, connectFails: true });
        await expect(runScript(script, ctx), `${script} ${args.join(" ")}`).rejects.toThrow(OpsError);
        expect(connected).toEqual([]);
        expect(spawned).toEqual([]);
      }
    }
  });
});

describe("a connection that the database refuses", () => {
  const REFUSED = 'password authentication failed for user "tadayo_app"';

  it("says which script and which variable, the driver's words, and what to look at, then closes it", async () => {
    // bootstrap runs psql first, and then asks the role's own connection.
    for (const script of DATABASE_SCRIPTS) {
      const { ctx: made, ended } = harness({ queryFails: REFUSED });
      // dev-clock reads its SQL file before it connects, so the repository is the real one.
      const ctx: OpsContext = { ...made, repo: join(import.meta.dirname, "..", "..", "..") };
      await expect(runScript(script, ctx), script).rejects.toThrow(
        new OpsError(
          `${script}: couldn't connect with DATABASE_URL: ${REFUSED}. Has ops bootstrap run, and does DATABASE_URL hold the password it set?`,
        ),
      );
      expect(ended.count, script).toBe(1);
    }
  });

  it("says that no reason was given when the driver's error has no words, or isn't an Error", async () => {
    for (const thrown of [new Error(""), "refused"]) {
      const { ctx } = harness();
      const refusing: OpsContext = {
        ...ctx,
        connect: (url) => {
          const sql = ctx.connect(url);
          // A driver can reject with anything; the cast is only for the type of a rejection.
          return Object.assign(() => Promise.reject(thrown as Error), {
            end: (options?: { timeout?: number }) => sql.end(options),
          }) as unknown as postgres.Sql;
        },
      };
      await expect(runScript("migrate", refusing), String(thrown)).rejects.toThrow(
        new OpsError(
          "migrate: couldn't connect with DATABASE_URL: no reason was given. Has ops bootstrap run, and does DATABASE_URL hold the password it set?",
        ),
      );
    }
  });

  it("is not said of a script's own failure: what its queries answer is the script's to say", async () => {
    // The connection works (the first query is answered) and a later query fails: its words are the script's.
    const { ctx } = harness();
    let asked = 0;
    const later: OpsContext = {
      ...ctx,
      connect: (url) => {
        const sql = ctx.connect(url);
        return Object.assign(
          () => {
            asked += 1;
            return asked === 1 ? Promise.resolve([]) : Promise.reject(new Error('relation "x" does not exist'));
          },
          { end: (options?: { timeout?: number }) => sql.end(options) },
        ) as unknown as postgres.Sql;
      },
    };
    await expect(runScript("bootstrap", later)).rejects.toThrow(/^relation "x" does not exist$/);
    // And a script's own check after the connection says its own words.
    const { ctx: another } = harness({ rows: [{ me: "postgres" }] });
    await expect(runScript("bootstrap", another)).rejects.toThrow(
      /^bootstrap: DATABASE_URL connects as postgres, not tadayo_app$/,
    );
  });
});

describe("dev-clock's --to", () => {
  it("takes an instant with its offset only, and refuses anything else before it connects", async () => {
    for (const to of ["2026-11-14T06:59:50", "tomorrow", "2026-11-14", "", "1700000000", "2026-11-14T06:59:50+25:00"]) {
      const { ctx, connected } = harness({ args: ["--to", to], connectFails: true });
      await expect(runScript("dev-clock", ctx), JSON.stringify(to)).rejects.toThrow(/takes an instant with its offset/);
      expect(connected).toEqual([]);
    }
  });

  it("wants a value", async () => {
    const { ctx, connected } = harness({ args: ["--to"], connectFails: true });
    await expect(runScript("dev-clock", ctx)).rejects.toThrow(OpsError);
    expect(connected).toEqual([]);
  });
});

describe("bootstrap", () => {
  it("refuses a DATABASE_URL that holds another password than DATABASE_APP_PASSWORD, before psql", async () => {
    const env = { ...ENV, DATABASE_URL: appUrl(REF, "another-password-of-more-than-32-characters!") };
    const { ctx, spawned, connected } = harness({ env, connectFails: true });
    await expect(runScript("bootstrap", ctx)).rejects.toThrow(/hold different passwords/);
    expect(spawned).toEqual([]);
    expect(connected).toEqual([]);
  });

  it("runs psql once with the admin's connection in its environment, then checks the role logs in", async () => {
    const { ctx, spawned, connected, ended, said } = harness({ rows: [{ me: "tadayo_app" }] });
    await runScript("bootstrap", ctx);
    expect(spawned).toHaveLength(1);
    const [call] = spawned;
    expect(call?.command).toBe("psql");
    expect(call?.options.env?.["PGUSER"]).toBe(`postgres.${REF}`);
    expect(call?.options.env?.["PGPASSWORD"]).toBe(ADMIN_PASSWORD);
    expect(call?.options.input).toContain("/repo/db/bootstrap.sql");
    // Then the application's connection, which closes.
    expect(connected).toEqual([appUrl()]);
    expect(ended.count).toBe(1);
    expect(said).toEqual(["bootstrap: db/bootstrap.sql ran", "bootstrap: tadayo_app logs in with DATABASE_URL"]);
  });

  it("says nothing of a password, in what it prints or in what it hands psql but the verifier's script", async () => {
    const { ctx, spawned, said } = harness({ rows: [{ me: "tadayo_app" }] });
    await runScript("bootstrap", ctx);
    const everything = JSON.stringify([said, spawned.map((call) => [call.command, call.args])]);
    expect(everything).not.toContain(APP_PASSWORD);
    expect(everything).not.toContain(ADMIN_PASSWORD);
  });

  it("fails when psql does, and leaves it at that: it doesn't connect", async () => {
    const { ctx, connected } = harness({ code: 3 });
    await expect(runScript("bootstrap", ctx)).rejects.toThrow(/psql failed/);
    expect(connected).toEqual([]);
  });

  it("fails when DATABASE_URL connects as another role", async () => {
    const { ctx, ended } = harness({ rows: [{ me: "postgres" }] });
    await expect(runScript("bootstrap", ctx)).rejects.toThrow(/not tadayo_app/);
    expect(ended.count).toBe(1);
  });
});
