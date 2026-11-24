// `GET /v1/health` (the contract's `getHealth`; the outside audit's A7; docs/plans/api-b2-health-check.md), with no
// database: the route asks the API's own pool one `SELECT 1` and nothing else, answers 204 with nothing in it
// when that comes back, and the bare 503 when it fails or hasn't come back within HEALTH_MS, which stays under
// Fly's 3 s check timeout (fly.toml; tools/ops/src/deploy-files.test.ts pins it). Checks that come while a query
// is out share it, and once they give up on it the next check sends a new one, so a stall holds at most one query
// per bound, and one stuck query fails only the checks that waited on it. It is public: no session is read, so a missing
// or bad token changes nothing (T14). A failure is logged by the error's class and code alone (T52). On Postgres,
// with the pool held, it is tests/src/db/health.test.ts; every role's answer is the matrix's.

import type { Account, Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { HEALTH_MS } from "./health.ts";
import { noStorage } from "./testing.ts";

/** Fly's check timeout in fly.toml, which the API's own bound must beat so the API answers the check itself. */
const FLY_CHECK_TIMEOUT_MS = 3_000;
/** The answers, pinned here byte for byte, not taken from the app. */
const DONE = { status: 204, body: "", headers: { "cache-control": "private, no-store" } };
const UNAVAILABLE = { status: 503, body: "", headers: { "cache-control": "private, no-store", "content-length": "0" } };
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
/** What an error from the database may carry in its message: a row's value, an address. Never in a log line. */
const PERSONAL = "ana@example.com";

const account: Account = {
  id: "acct_ana",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 0,
  avatarVersion: null,
};

const open: FastifyInstance[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(open.splice(0).map((app) => app.close()));
});

interface Query {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

/**
 * An app whose pool answers every query with what `answer` returns, the queries it was asked, the times the
 * session was looked at, and the log's lines.
 */
async function appWith(answer: () => Promise<unknown>) {
  const queries: Query[] = [];
  let asked: () => void = () => undefined;
  const queried = new Promise<void>((resolve) => {
    asked = resolve;
  });
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ strings: [...strings], values });
      asked();
      return answer();
    },
    {
      end: () => Promise.resolve(),
      begin: () => Promise.reject(new Error("no transaction is expected")),
      unsafe: () => Promise.reject(new Error("no unsafe query is expected")),
    },
  ) as unknown as ApiSql;
  const lines: string[] = [];
  const sessions = { count: 0 };
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => {
      sessions.count += 1;
      return Promise.resolve(account);
    },
    storage: noStorage,
    log: { level: "debug", stream: { write: (line) => void lines.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  const send = async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
  /** The log's lines for the health check other than the request's own line. */
  const warnings = () =>
    lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => typeof line["msg"] === "string" && line["msg"].startsWith("database"));
  return { send, queries, queried, sessions, lines, warnings };
}

const health = (headers: Record<string, string> = {}): InjectOptions => ({ method: "GET", url: "/v1/health", headers });

/** Waits, on real turns of the event loop, until `count` checks each have their timer running: each is waiting. */
async function waiting(count: number) {
  for (let turn = 0; turn < 100 && vi.getTimerCount() < count; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(vi.getTimerCount()).toBe(count);
}

describe("the health check when the database answers (the outside audit's A7)", () => {
  it("answers 204 with nothing in it and nothing for a cache to keep, with no session", async () => {
    const { send, sessions, warnings } = await appWith(() => Promise.resolve([{ "?column?": 1 }]));
    expect(await send(health())).toEqual(DONE);
    expect(sessions.count).toBe(0);
    expect(warnings()).toEqual([]);
  });

  it("answers the same with a token that isn't one, and never looks at it: the route is public (T14)", async () => {
    const { send, sessions } = await appWith(() => Promise.resolve([{ "?column?": 1 }]));
    expect(await send(health({ authorization: "Bearer not.a.token" }))).toEqual(DONE);
    expect(await send(health({ authorization: "Basic YW5hOmFuYQ==" }))).toEqual(DONE);
    expect(sessions.count).toBe(0);
  });

  it("asks the database `SELECT 1` once, with nothing else: no table, no value, no transaction", async () => {
    const { send, queries } = await appWith(() => Promise.resolve([{ "?column?": 1 }]));
    await send(health());
    expect(queries).toEqual([{ strings: ["SELECT 1"], values: [] }]);
  });

  it("leaves no timer behind once it has answered", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { send } = await appWith(() => Promise.resolve([{ "?column?": 1 }]));
    expect(await send(health())).toEqual(DONE);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the health check when the database doesn't answer (the outside audit's A7; spec 34)", () => {
  it("answers the bare 503 when the query fails, and logs one warning by the error's class and code (T52)", async () => {
    const failure = Object.assign(new Error(`connection for ${PERSONAL} was refused`), {
      name: "PostgresError",
      code: "08006",
    });
    const { send, warnings, lines } = await appWith(() => Promise.reject(failure));
    expect(await send(health())).toEqual(UNAVAILABLE);
    const logged = warnings();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      level: 40,
      msg: "database unreachable",
      err: { type: "PostgresError", code: "08006" },
    });
    expect(Object.keys(logged[0]?.["err"] as object).sort()).toEqual(["code", "type"]);
    expect(lines.join("")).not.toContain(PERSONAL);
    expect(lines.join("")).not.toContain("refused");
  });

  it("answers the bare 503 at its bound when the query never comes back, and logs that it was slow", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { send, queried, warnings } = await appWith(() => new Promise(() => undefined));
    let answered: Awaited<ReturnType<typeof send>> | undefined;
    const pending = send(health()).then((response) => {
      answered = response;
      return response;
    });
    await queried;
    await vi.advanceTimersByTimeAsync(HEALTH_MS - 1);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(UNAVAILABLE);
    const logged = warnings();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 40, msg: "database slow" });
    expect(logged[0]).not.toHaveProperty("err");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs nothing more when a query it gave up on fails later", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let fail: (error: Error) => void = () => undefined;
    const { send, queried, warnings } = await appWith(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = send(health());
    await queried;
    await vi.advanceTimersByTimeAsync(HEALTH_MS);
    expect(await pending).toEqual(UNAVAILABLE);
    fail(Object.assign(new Error(`late, for ${PERSONAL}`), { name: "PostgresError", code: "57P01" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(warnings().map((line) => line["msg"])).toEqual(["database slow"]);
  });

  it("shares one query among the checks that come while it is out, and sends a new one once it has come back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let release: (rows: unknown) => void = () => undefined;
    let calls = 0;
    const { send, queries, queried } = await appWith(() => {
      calls += 1;
      return calls === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve([{ "?column?": 1 }]);
    });
    const first = send(health());
    await queried;
    const second = send(health());
    await waiting(2);
    release([{ "?column?": 1 }]);
    expect(await first).toEqual(DONE);
    expect(await second).toEqual(DONE);
    expect(queries).toHaveLength(1);
    expect(await send(health())).toEqual(DONE);
    expect(queries).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends a new query once the checks gave up on the one that is out, so one stuck query fails no check after them", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let fail: (error: Error) => void = () => undefined;
    let calls = 0;
    const { send, queries, queried, warnings } = await appWith(() => {
      calls += 1;
      return calls === 1
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : Promise.resolve([{ "?column?": 1 }]);
    });
    const first = send(health());
    await queried;
    const second = send(health());
    await waiting(2);
    await vi.advanceTimersByTimeAsync(HEALTH_MS);
    expect(await first).toEqual(UNAVAILABLE);
    expect(await second).toEqual(UNAVAILABLE);
    expect(queries).toHaveLength(1);
    expect(await send(health())).toEqual(DONE);
    expect(queries).toHaveLength(2);
    fail(Object.assign(new Error("stuck"), { name: "PostgresError", code: "57P01" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await send(health())).toEqual(DONE);
    expect(queries).toHaveLength(3);
    expect(warnings().map((line) => line["msg"])).toEqual(["database slow", "database slow"]);
  });

  it("gives up before Fly's own check timeout, so the API's answer is the one Fly reads", () => {
    expect(HEALTH_MS).toBeGreaterThan(0);
    expect(HEALTH_MS).toBeLessThan(FLY_CHECK_TIMEOUT_MS);
  });
});
