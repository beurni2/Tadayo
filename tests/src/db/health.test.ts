// `GET /v1/health` on Postgres, through the API's own pool (the contract's `getHealth`; the outside audit's A7;
// docs/plans/api-b2-health-check.md, section 2.3): 204 when the database answers; the bare 503 within the bound
// while every one of the pool's connections is held, the stall A7 proved, during which Fly's TCP check had kept
// reporting the Machine healthy; and 204 again once they are let go. The route on its own, with no database, is
// services/api/src/health.test.ts.

import { buildApp, connect, HEALTH_MS } from "@tadayo/api";
import { noStorage } from "@tadayo/api/testing";
import type { Clock } from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");

/** How late past the bound the 503 may come: Fastify, the timer's turn and a loaded runner. */
const MARGIN_MS = 1_000;

const api = connect(DATABASE_URL);
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    sql: api,
    clock: {} as Clock,
    // The route is public: a session looked at would fail the test.
    authenticate: () => Promise.reject(new Error("the health check reads no session")),
    storage: noStorage,
    log: { level: "silent" },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await api.end({ timeout: 5 });
});

const health = async () => {
  const started = performance.now();
  const response = await app.inject({ method: "GET", url: "/v1/health" });
  return {
    status: response.statusCode,
    body: response.body,
    cache: response.headers["cache-control"],
    ms: performance.now() - started,
  };
};

describe("the health check on Postgres (the outside audit's A7)", () => {
  it("answers 204 with nothing in it when the database answers", async () => {
    expect(await health()).toMatchObject({ status: 204, body: "", cache: "private, no-store" });
  });

  it("answers the bare 503 within its bound while every connection of the pool is held, and 204 once they're free", async () => {
    const size = api.options.max;
    expect(size).toBeGreaterThan(0);
    let letGo: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    let holding = 0;
    let allHeld: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      allHeld = resolve;
    });
    // Each transaction takes a connection of its own and keeps it until it is let go.
    const holders = Array.from({ length: size }, () =>
      api.begin(async (tx) => {
        await tx`SELECT 1`;
        holding += 1;
        if (holding === size) allHeld();
        await released;
      }),
    );
    await held;
    try {
      const stalled = await health();
      expect(stalled).toMatchObject({ status: 503, body: "", cache: "private, no-store" });
      expect(stalled.ms).toBeGreaterThanOrEqual(HEALTH_MS - 50);
      expect(stalled.ms).toBeLessThan(HEALTH_MS + MARGIN_MS);
    } finally {
      letGo();
      await Promise.all(holders);
    }
    expect(await health()).toMatchObject({ status: 204, body: "", cache: "private, no-store" });
  });
});
