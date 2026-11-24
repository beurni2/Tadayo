/// <reference lib="esnext.temporal" />
// The API's database time limits, on Postgres as `tadayo_app` (the outside audit's A7;
// docs/plans/api-b2-db-limits.md; spec 34; T19, T52): the role's own session defaults, which
// db/migrations/0018_role_time_limits.sql sets; the limits each of the API's transactions sets for itself
// (services/api/src/connection.ts TRANSACTION_LIMITS), which hold whatever its session started with; and the
// audit's own reproduction through the real app, the real gate and the real connection: one held row, ten
// requests waiting on it, and another person's read.
// Without the limits the read waits for as long as the row is held, and the waiting requests answer only
// once it's let go; with them, every wait ends within the lock limit and answers the bare 503, the read gets
// a connection once one is free, and the same request under the same key commits once afterwards.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { buildApp, connect, sessions, verifierFor } from "@tadayo/api";
import { noStorage, testSigner, type TestSigner } from "@tadayo/api/testing";
import { fakeClock } from "@tadayo/domain/testing";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { worldSql } from "./harness.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");

/** The limits the role carries and each transaction sets, in milliseconds (the migration's values). */
const LOCK_MS = 5_000;
const STATEMENT_MS = 10_000;
/** What a machine under load may add to a wait, in milliseconds. */
const MARGIN_MS = 3_000;
/** What a session's two wait limits are now. */
const SETTINGS = `SELECT pg_catalog.current_setting('lock_timeout') AS lock,
                         pg_catalog.current_setting('statement_timeout') AS statement`;
type Settings = { lock: string; statement: string };
const JSON_HEADERS = { "content-type": "application/json" };

const clock = fakeClock("2026-11-24T15:00:00.123456Z");
const api = connect(DATABASE_URL);
const world = worldSql(2);
let signer: TestSigner;
let app: FastifyInstance;

beforeAll(async () => {
  signer = await testSigner();
  const verifier = verifierFor(signer.keys, { issuer: signer.issuer });
  app = buildApp({
    sql: api,
    clock,
    authenticate: sessions({ verifier, sql: api, clock }),
    storage: noStorage,
    log: { level: "silent" },
  });
  await app.ready();
});

afterAll(async () => {
  await Promise.all([app.close(), world.end()]);
});

/** `request` as the holder of `token` makes it, with how long it took to answer, in milliseconds. */
async function timed(
  token: string,
  request: { method: "GET" | "PATCH"; url: string; headers?: Record<string, string>; payload?: unknown },
) {
  const sent = performance.now();
  const response = await app.inject({
    method: request.method,
    url: request.url,
    headers: { authorization: `Bearer ${token}`, ...request.headers },
    ...(request.payload === undefined ? {} : { payload: JSON.stringify(request.payload) }),
  });
  return { response, ms: performance.now() - sent };
}

/** The name change `key` asks for, on the account at `version`. */
const rename = (key: string, version: number) => ({
  method: "PATCH" as const,
  url: "/v1/me",
  headers: { ...JSON_HEADERS, "idempotency-key": key },
  payload: { expected_version: version, display_name: "Ana Maria" },
});

/** A person with a finished profile: their token, account id and version. */
async function person(name: string) {
  const token = await signer.token(randomUUID());
  const made = await timed(token, {
    ...rename(randomUUID(), 0),
    payload: { expected_version: 0, age_confirmed: true, display_name: name },
  });
  expect(made.response.statusCode).toBe(200);
  const body = JSON.parse(made.response.body) as { id: string; version: number };
  return { token, id: body.id, version: body.version };
}

describe("the role's time limits (the outside audit's A7)", () => {
  it("are the role's own session defaults, which a new session as `tadayo_app` starts with", async () => {
    const [role] = await world<{ rolconfig: string[] | null }[]>`
      SELECT rolconfig FROM pg_catalog.pg_roles WHERE rolname = current_user`;
    expect([...(role?.rolconfig ?? [])].sort()).toEqual([
      "idle_in_transaction_session_timeout=15s",
      "lock_timeout=5s",
      "statement_timeout=10s",
    ]);
    const fresh = postgres(DATABASE_URL, { max: 1, onnotice: () => undefined });
    try {
      const [shown] = await fresh<{ lock: string; statement: string; idle: string }[]>`
        SELECT pg_catalog.current_setting('lock_timeout') AS lock,
               pg_catalog.current_setting('statement_timeout') AS statement,
               pg_catalog.current_setting('idle_in_transaction_session_timeout') AS idle`;
      expect(shown).toEqual({ lock: "5s", statement: "10s", idle: "15s" });
    } finally {
      await fresh.end();
    }
  });

  it("are set again by each of the API's transactions, so they hold though its session started without them", async () => {
    // A session whose own limits are off, as a server session older than the migration, or one whose
    // connection string names other values, would be.
    const url = new URL(DATABASE_URL);
    url.searchParams.set("lock_timeout", "0");
    url.searchParams.set("statement_timeout", "0");
    const loose = connect(url.toString());
    const settings = async (sql: Pick<typeof loose, "unsafe">) => (await sql.unsafe<Settings[]>(SETTINGS))[0];
    const cleo = await person("Cleo");
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding: Promise<unknown> = Promise.resolve();
    try {
      expect(await settings(loose)).toEqual({ lock: "0", statement: "0" });
      expect(await loose.begin(async (tx) => settings(tx))).toEqual({ lock: "5s", statement: "10s" });
      expect(await loose.begin("read only", async (tx) => settings(tx))).toEqual({
        lock: "5s",
        statement: "10s",
      });
      // `SET LOCAL`: the session's own come back once the transaction ends.
      expect(await settings(loose)).toEqual({ lock: "0", statement: "0" });

      // A wait on a held row ends at the lock limit with 55P03, and a statement at the statement limit with
      // 57014, each as the PostgresError `failed` (services/api/src/app.ts) answers with the bare 503.
      let locked: () => void = () => undefined;
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      holding = world.begin(async (tx) => {
        await tx`SELECT 1 FROM app.users WHERE id = ${cleo.id} FOR UPDATE`;
        locked();
        await released;
      });
      await isLocked;
      let sent = performance.now();
      await expect(
        loose.begin(async (tx) => tx`SELECT 1 FROM app.users WHERE id = ${cleo.id} FOR UPDATE`),
      ).rejects.toMatchObject({ name: "PostgresError", code: "55P03" });
      expect(performance.now() - sent).toBeLessThan(LOCK_MS + MARGIN_MS);
      release();
      await holding;
      sent = performance.now();
      await expect(loose.begin(async (tx) => tx`SELECT pg_catalog.pg_sleep(11)`)).rejects.toMatchObject({
        name: "PostgresError",
        code: "57014",
      });
      expect(performance.now() - sent).toBeLessThan(STATEMENT_MS + MARGIN_MS);
      // The connection is still there for the next request.
      expect(await settings(loose)).toEqual({ lock: "0", statement: "0" });
    } finally {
      release();
      await holding;
      await loose.end();
    }
  }, 60_000);

  it("end the waits on a held row with the bare 503, let another person read meanwhile, and leave the same request to commit once later", async () => {
    const ana = await person("Ana");
    const ben = await person("Ben");
    const keys = Array.from({ length: 10 }, () => randomUUID());

    // Another connection holds Ana's row, as an `ops` script or a hung link to the pooler might.
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holding = world.begin(async (tx) => {
      await tx`SELECT 1 FROM app.users WHERE id = ${ana.id} FOR UPDATE`;
      locked();
      await released;
    });
    await isLocked;
    // Let it go after a bound in any case, so a run without the limits fails rather than hangs: as late as the
    // last rename may answer, and before the holder's own transaction has been idle for the role's 15 seconds.
    const bound = setTimeout(release, 2 * LOCK_MS + MARGIN_MS);

    try {
      const renames = keys.map((key) => timed(ana.token, rename(key, ana.version)));
      // Every connection the app has is waiting on Ana's row before Ben asks.
      let waiting = 0;
      for (let tries = 0; tries < 100 && waiting < api.options.max; tries += 1) {
        if (tries > 0) await sleep(30);
        const [row] = await world<{ count: number }[]>`
            SELECT pg_catalog.count(*)::int AS count FROM pg_catalog.pg_stat_activity
             WHERE usename = current_user AND wait_event_type = 'Lock'`;
        waiting = row?.count ?? 0;
      }
      expect(waiting, "the API's connections waiting on Ana's row").toBe(api.options.max);
      const benRead = timed(ben.token, { method: "GET", url: "/v1/me" });

      const read = await benRead;
      expect(read.response.statusCode).toBe(200);
      expect((JSON.parse(read.response.body) as { id: string }).id).toBe(ben.id);
      expect(read.ms).toBeLessThan(LOCK_MS + MARGIN_MS);

      const answered = await Promise.all(renames);
      for (const [index, { response, ms }] of answered.entries()) {
        expect(
          { status: response.statusCode, body: response.body, cache: response.headers["cache-control"] },
          `rename ${String(index)}`,
        ).toEqual({ status: 503, body: "", cache: "private, no-store" });
        // The first wave waits once; the rest wait for a connection, then once themselves.
        expect(ms, `rename ${String(index)}`).toBeLessThan(2 * LOCK_MS + MARGIN_MS);
      }
    } finally {
      clearTimeout(bound);
      release();
      await holding;
    }

    // Nothing was committed, and no receipt was kept: the same request under its key commits once now.
    const again = await timed(ana.token, rename(keys[3] ?? "", ana.version));
    expect(again.response.statusCode).toBe(200);
    expect(JSON.parse(again.response.body)).toMatchObject({ display_name: "Ana Maria", version: ana.version + 1 });
    const replayed = await timed(ana.token, rename(keys[3] ?? "", ana.version));
    expect(replayed.response.body).toBe(again.response.body);
    const [row] = await world<{ version: number; name: string }[]>`
        SELECT version, display_name AS name FROM app.users WHERE id = ${ana.id}`;
    expect(row).toEqual({ version: ana.version + 1, name: "Ana Maria" });
  }, 60_000);
});
