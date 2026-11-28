// The API's failure counter on its own, with a fake pool (the outside audit's B7; ./failure-count.ts;
// docs/plans/api-b2-failure-alerts.md, section 1.2): the code a failure is counted under, one write at a time with
// what came meanwhile summed into the next, a write that fails kept, logged with no message and tried again on a
// timer that waits longer each time, the codes it holds bounded, and a 5xx counted as it goes out, even to a client
// that has gone. The counts on Postgres, through the app, are tests/src/db/failure-counts.test.ts; the app's own 5xx,
// counted, are in app.test.ts.

import { Fault, InputFault, RangeFault } from "@tadayo/domain/fault";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { ApiSql } from "./connection.ts";
import "./context.ts";
import {
  countEachFailure,
  failureCode,
  failureCounter,
  PENDING_CODES,
  RETRY_FIRST_MS,
  RETRY_LAST_MS,
  UNCOUNTED,
} from "./failure-count.ts";

/**
 * A pool whose every write the test answers: each statement waits until the test settles it. A write is a
 * transaction of its own (`begin`), and `outside` counts the statements made on the pool outside one.
 */
function pool() {
  const writes: { source: unknown; counts: Record<string, number>; settle: (error?: Error) => void }[] = [];
  const statement = (_template: TemplateStringsArray, ...values: unknown[]) =>
    new Promise((resolve, reject) => {
      writes.push({
        source: values[0],
        counts: JSON.parse(values[1] as string) as Record<string, number>,
        settle: (error) => {
          if (error === undefined) resolve([]);
          else reject(error);
        },
      });
    });
  const seen = { outside: 0 };
  const onPool = (template: TemplateStringsArray, ...values: unknown[]) => {
    seen.outside += 1;
    return statement(template, ...values);
  };
  const sql = Object.assign(onPool, {
    begin: (body: (tx: typeof statement) => Promise<unknown>) => body(statement),
  }) as unknown as ApiSql;
  return { sql, writes, seen };
}

/** A logger that keeps each warning's fields and message. */
function logger() {
  const warnings: { fields: unknown; message: unknown }[] = [];
  const log = {
    warn: (fields: unknown, message: unknown) => {
      warnings.push({ fields, message });
    },
  } as unknown as FastifyBaseLogger;
  return { log, warnings };
}

const ticks = () => new Promise((resolve) => setImmediate(resolve));

describe("failureCode", () => {
  it("is the error's class and code as the log line shows them, never its message (T52)", () => {
    const cases: [unknown, string][] = [
      [new Fault("propose_roster_6", "the club vanished: ana@example.invalid"), "Fault:propose_roster_6"],
      [new InputFault("upload_1", "not an id: eyJhbGciOi"), "InputFault:upload_1"],
      [new RangeFault("civil_1", "no zone: Mars/Olympus"), "RangeFault:civil_1"],
      [
        Object.assign(new Error("duplicate key (ana)"), { name: "PostgresError", code: "23505" }),
        "PostgresError:23505",
      ],
      [Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" }), "Error:ECONNREFUSED"],
      [new TypeError("Cannot read properties of undefined (reading 'ana')"), "TypeError"],
      // A code a library filled with something else is left out, as the log line leaves it out.
      [Object.assign(new Error("x"), { code: "https://example.invalid/ana" }), "Error"],
      [Object.assign(new Error("x"), { code: 42 }), "Error"],
      [Object.assign(new Error("x"), { name: "a name with spaces" }), "unknown"],
      ["a thrown string: ana@example.invalid", "unknown"],
      [null, "unknown"],
      [undefined, "unknown"],
    ];
    for (const [error, code] of cases) expect(failureCode(error), code).toBe(code);
  });
});

describe("failureCounter", () => {
  it("writes a count as the API's, at once, one write at a time, with what came meanwhile summed into the next", async () => {
    const { sql, writes } = pool();
    const { log, warnings } = logger();
    const counter = failureCounter(sql, log);
    counter.count("Fault:home_3");
    await ticks();
    expect(writes.map((write) => [write.source, write.counts])).toEqual([["api", { "Fault:home_3": 1 }]]);
    counter.count("Fault:home_3");
    counter.count("PostgresError:23505");
    counter.count("Fault:home_3");
    await ticks();
    expect(writes).toHaveLength(1);
    writes[0]?.settle();
    await vi.waitFor(() => {
      expect(writes).toHaveLength(2);
    });
    expect(writes[1]?.counts).toEqual({ "Fault:home_3": 2, "PostgresError:23505": 1 });
    writes[1]?.settle();
    await ticks();
    expect(writes).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("writes in a transaction of its own, so the API's time limits hold it (connection.ts)", async () => {
    const { sql, writes, seen } = pool();
    const { log } = logger();
    failureCounter(sql, log).count("Fault:home_3");
    await ticks();
    expect(writes).toHaveLength(1);
    expect(seen.outside).toBe(0);
  });

  it("keeps a write that failed, logs it by the error's class and code alone, and tries it again on its own", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { sql, writes } = pool();
      const { log, warnings } = logger();
      const counter = failureCounter(sql, log);
      counter.count("Fault:home_3");
      await ticks();
      writes[0]?.settle(Object.assign(new Error("terminating connection: ana@example.invalid"), { code: "57P01" }));
      await ticks();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toBe("failure not counted");
      expect(JSON.stringify(warnings[0]?.fields)).not.toContain("ana@example.invalid");
      expect(warnings[0]?.fields).toMatchObject({ kept: 1 });
      // A failure meanwhile joins the kept counts: the database that is away isn't asked again at once.
      counter.count("Fault:home_3");
      await ticks();
      expect(writes).toHaveLength(1);
      // Tried again after 30 seconds, then twice as long each time, five minutes at most, until a write gets through.
      const waits = [RETRY_FIRST_MS, 60_000, 120_000, 240_000, RETRY_LAST_MS, RETRY_LAST_MS];
      for (const [n, wait] of waits.entries()) {
        vi.advanceTimersByTime(wait - 1);
        await ticks();
        expect(writes, `before try ${String(n + 2)}`).toHaveLength(n + 1);
        vi.advanceTimersByTime(1);
        await ticks();
        expect(writes, `try ${String(n + 2)}`).toHaveLength(n + 2);
        expect(writes[n + 1]?.counts).toEqual({ "Fault:home_3": 2 });
        if (n < waits.length - 1) writes[n + 1]?.settle(new Error("still away"));
        await ticks();
      }
      writes.at(-1)?.settle();
      await ticks();
      expect(warnings).toHaveLength(waits.length);
      // Once a write has got through, the next failure is written at once, and its first retry waits 30 seconds again.
      counter.count("PostgresError:55P03");
      await ticks();
      expect(writes).toHaveLength(waits.length + 2);
      writes.at(-1)?.settle(new Error("away again"));
      await ticks();
      vi.advanceTimersByTime(RETRY_FIRST_MS);
      await ticks();
      expect(writes).toHaveLength(waits.length + 3);
      expect(writes.at(-1)?.counts).toEqual({ "PostgresError:55P03": 1 });
      // As the app closes, a retry that waits is dropped.
      writes.at(-1)?.settle(new Error("away for good"));
      await ticks();
      counter.stop();
      vi.advanceTimersByTime(RETRY_LAST_MS);
      await ticks();
      expect(writes).toHaveLength(waits.length + 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never throws, even when the pool throws as it is asked", async () => {
    const { log, warnings } = logger();
    const ended = () => {
      throw new Error("CONNECTION_ENDED: ana@example.invalid");
    };
    const sql = Object.assign(ended, { begin: ended }) as unknown as ApiSql;
    const counter = failureCounter(sql, log);
    try {
      expect(() => {
        counter.count("Fault:home_3");
      }).not.toThrow();
      await vi.waitFor(() => {
        expect(warnings.map((warning) => warning.message)).toEqual(["failure not counted"]);
      });
      expect(JSON.stringify(warnings)).not.toContain("ana@example.invalid");
    } finally {
      counter.stop();
    }
  });

  it(`holds at most ${String(PENDING_CODES)} codes while it can't write: any further one is counted as unknown`, async () => {
    const { sql, writes } = pool();
    const { log } = logger();
    const counter = failureCounter(sql, log);
    counter.count("Fault:first_1");
    await ticks();
    for (let n = 0; n < PENDING_CODES + 10; n += 1) counter.count(`Fault:site_${String(n)}`);
    // A code already held is still counted under its own name.
    counter.count("Fault:site_0");
    writes[0]?.settle();
    await vi.waitFor(() => {
      expect(writes).toHaveLength(2);
    });
    const next = writes[1]?.counts ?? {};
    expect(Object.keys(next)).toHaveLength(PENDING_CODES + 1);
    expect(next["unknown"]).toBe(10);
    expect(next["Fault:site_0"]).toBe(2);
  });

  it("counts a code outside the table's pattern as unknown", async () => {
    const { sql, writes } = pool();
    const { log } = logger();
    failureCounter(sql, log).count("not a code: ana@example.invalid");
    await ticks();
    expect(writes[0]?.counts).toEqual({ unknown: 1 });
  });
});

describe("countEachFailure", () => {
  /** A counter that keeps each code it is given, and whether it was stopped. */
  function keeping() {
    const counted: string[] = [];
    const state = { stopped: false };
    const counter = {
      count: (code: string) => void counted.push(code),
      stop: () => {
        state.stopped = true;
      },
    };
    return { counted, state, counter };
  }

  it("counts each answer from 500 up but the health check's 503, by the request's code or its status and operation", async () => {
    const { counted, state, counter } = keeping();
    const app = Fastify();
    countEachFailure(app, counter);
    const route = (url: string, operation: string, status: number, failure?: string) => {
      app.get(url, { config: { operation } }, (request, reply) => {
        if (failure !== undefined) request.failure = failure;
        return reply.code(status).send();
      });
    };
    route("/coded", "getMe", 500, "Fault:home_3");
    route("/plain", "createUpload", 503);
    route("/bad-gateway", "getClub", 502);
    route("/health", "getHealth", 503);
    route("/health-broken", "getHealth", 500);
    route("/refused", "getMe", 409);
    route("/fine", "getMe", 200);
    for (const url of ["/coded", "/plain", "/bad-gateway", "/health", "/health-broken", "/refused", "/fine"]) {
      await app.inject({ method: "GET", url });
    }
    expect(state.stopped).toBe(false);
    await app.close();
    expect(counted).toEqual(["Fault:home_3", "503:createUpload", "502:getClub", "500:getHealth"]);
    expect([...UNCOUNTED]).toEqual(["getHealth"]);
    // Closing the app drops a retry that waits.
    expect(state.stopped).toBe(true);
  });

  it("counts a 5xx whose client has gone before it was answered, over a socket of its own", async () => {
    const { counted, counter } = keeping();
    const app = Fastify();
    countEachFailure(app, counter);
    const gone = Promise.withResolvers<undefined>();
    app.get("/slow", { config: { operation: "getClubs" } }, async (request, reply) => {
      // The answer is made only once its client has gone.
      await new Promise((resolve) => request.raw.socket.once("close", resolve));
      gone.resolve(undefined);
      return reply.code(503).send();
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    try {
      const { port } = app.server.address() as AddressInfo;
      const asked = httpRequest({ host: "127.0.0.1", port, path: "/slow" });
      asked.on("error", () => undefined);
      asked.end();
      setTimeout(() => asked.destroy(), 50);
      await gone.promise;
      await vi.waitFor(() => {
        expect(counted).toEqual(["503:getClubs"]);
      });
    } finally {
      await app.close();
    }
  });
});
