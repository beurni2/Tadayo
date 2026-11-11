// The API's way of stopping: the order it closes things in, that it does it once, and what it does
// about a connection that would hold the stop up past what Fly waits for (fly.toml's `kill_timeout`).
// The first group has no process, no signal and no server (stubs and fake timers); the second has a
// real Fastify on a real socket, since what keeps a connection open is the server's own.

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { Agent, request } from "node:http";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { END_SECONDS, GRACE_MS, SWEEP_MS, stopOnSignal } from "./shutdown.ts";

function rig(sqlFails = false) {
  const events = new EventEmitter();
  const order: string[] = [];
  const closing = Promise.withResolvers<undefined>();
  const failures: string[] = [];
  const connections = { idle: 0, all: 0 };
  const ends: { timeout: number }[] = [];
  const done = stopOnSignal({
    app: {
      close: () => {
        order.push("app.close");
        return closing.promise;
      },
      server: {
        closeIdleConnections: () => {
          connections.idle += 1;
        },
        closeAllConnections: () => {
          connections.all += 1;
          order.push("closeAllConnections");
        },
      },
    },
    sql: {
      end: (options) => {
        order.push("sql.end");
        ends.push(options);
        return sqlFails ? Promise.reject(new Error("host=db.internal password=hunter2")) : Promise.resolve();
      },
    },
    say: (line) => order.push(line),
    fail: (message) => {
      failures.push(message);
    },
    events,
  });
  return { events, order, closing, failures, connections, ends, done };
}

describe("stopOnSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops listening and lets the requests in flight finish before it ends the database's connection, on SIGTERM", async () => {
    const { events, order, closing, done } = rig();
    expect(order).toEqual([]);
    events.emit("SIGTERM");
    // The server is closing, and its requests aren't done: the database is still in use.
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close"]);
    closing.resolve(undefined);
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end", "api: stopped"]);
  });

  it("does the same on SIGINT", async () => {
    const { events, order, closing, done } = rig();
    events.emit("SIGINT");
    closing.resolve(undefined);
    await done;
    expect(order).toEqual(["api: stopping on SIGINT", "app.close", "sql.end", "api: stopped"]);
  });

  it("closes once: after the first signal it lets go of both, so a second one ends the process as it would have", async () => {
    const { events, order, closing, done } = rig();
    events.emit("SIGTERM");
    expect(events.listenerCount("SIGTERM")).toBe(0);
    expect(events.listenerCount("SIGINT")).toBe(0);
    events.emit("SIGINT");
    events.emit("SIGTERM");
    closing.resolve(undefined);
    await done;
    expect(order.filter((line) => line === "app.close")).toHaveLength(1);
  });

  it("does nothing until a signal comes", async () => {
    const { events, order, connections } = rig();
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
    expect(order).toEqual([]);
    expect(connections).toEqual({ idle: 0, all: 0 });
    expect(events.listenerCount("SIGTERM")).toBe(1);
    expect(events.listenerCount("SIGINT")).toBe(1);
  });

  it("ends the connections left idle, every sweep, while the server closes, and stops sweeping once it has", async () => {
    const { events, closing, connections, done } = rig();
    events.emit("SIGTERM");
    expect(connections.idle).toBe(0);
    await vi.advanceTimersByTimeAsync(SWEEP_MS * 3);
    expect(connections.idle).toBe(3);
    closing.resolve(undefined);
    await done;
    // Neither timer is left to hold the process open, or to act after the stop.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
    expect(connections).toEqual({ idle: 3, all: 0 });
  });

  it("ends the connections still in use only when the grace is over, says so, and goes on to end the database's connection", async () => {
    const { events, order, closing, failures, connections, done } = rig();
    events.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(connections.all).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(connections.all).toBe(1);
    expect(order).toEqual([
      "api: stopping on SIGTERM",
      "app.close",
      "api: requests still running after 25 seconds are ended",
      "closeAllConnections",
    ]);
    closing.resolve(undefined);
    await done;
    expect(order.slice(4)).toEqual(["sql.end", "api: stopped"]);
    expect(failures).toEqual([]);
    // Once, and the sweeps stop.
    const sweeps = connections.idle;
    await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
    expect(connections).toEqual({ idle: sweeps, all: 1 });
  });

  it("does not wait for the grace when the server closes before it", async () => {
    const { events, order, closing, connections, done } = rig();
    events.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(GRACE_MS - SWEEP_MS);
    closing.resolve(undefined);
    await done;
    // The grace's timer is cleared, so a process that has stopped isn't held open for what is left of it.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(GRACE_MS);
    expect(connections.all).toBe(0);
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end", "api: stopped"]);
  });

  it("still ends the database's connection when closing the server fails, and says so without the error's own words", async () => {
    const { events, order, closing, failures, done } = rig();
    events.emit("SIGTERM");
    closing.reject(new Error("password=hunter2 near the socket"));
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end"]);
    expect(failures).toEqual(["api: the server didn't close cleanly"]);
  });

  it("says the server didn't close cleanly when it fails after the grace too", async () => {
    const { events, order, closing, failures, done } = rig();
    events.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(GRACE_MS);
    closing.reject(new Error("password=hunter2 near the socket"));
    await done;
    expect(order).toEqual([
      "api: stopping on SIGTERM",
      "app.close",
      "api: requests still running after 25 seconds are ended",
      "closeAllConnections",
      "sql.end",
    ]);
    expect(failures).toEqual(["api: the server didn't close cleanly"]);
  });

  it("says when the database's connection doesn't end cleanly, without the error's own words, and doesn't say it stopped", async () => {
    const { events, order, closing, failures, done } = rig(true);
    events.emit("SIGTERM");
    closing.resolve(undefined);
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end"]);
    expect(failures).toEqual(["api: the database's connection didn't end cleanly"]);
  });

  it("says both failures, in order, and still finishes, when neither the server nor the database's connection closes cleanly", async () => {
    const { events, order, closing, failures, done } = rig(true);
    events.emit("SIGTERM");
    closing.reject(new Error("password=hunter2 near the socket"));
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end"]);
    expect(failures).toEqual([
      "api: the server didn't close cleanly",
      "api: the database's connection didn't end cleanly",
    ]);
    expect(JSON.stringify([order, failures])).not.toContain("hunter2");
  });

  it("sweeps often enough that a connection left idle is ended long before the grace is over", () => {
    expect(SWEEP_MS).toBeGreaterThan(0);
    expect(SWEEP_MS * 10).toBeLessThanOrEqual(GRACE_MS);
  });

  it("gives the database's connection END_SECONDS to end, after which postgres.js closes it with queries still running", async () => {
    const { events, closing, ends, done } = rig();
    events.emit("SIGTERM");
    closing.resolve(undefined);
    await done;
    expect(ends).toEqual([{ timeout: END_SECONDS }]);
  });

  it("fits the grace and the database's end inside what Fly waits for before it kills the Machine, with time to spare", () => {
    const toml = readFileSync(join(import.meta.dirname, "..", "..", "..", "fly.toml"), "utf8");
    const killTimeout = Number(/^kill_timeout = (\d+)$/m.exec(toml)?.[1]);
    expect(killTimeout).toBeGreaterThan(0);
    expect(END_SECONDS).toBeGreaterThan(0);
    expect(GRACE_MS + END_SECONDS * 1000).toBeLessThanOrEqual((killTimeout - 2) * 1000);
  });
});

// ---- A real server, a real socket and a client that keeps its connection.

const clients: Agent[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
});

/** A client that keeps a connection after its response, as browsers, Fly's proxy and `fetch` do. */
function keepAliveClient(): Agent {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  clients.push(agent);
  return agent;
}

function get(port: number, path: string, agent: Agent): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path, agent }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({ status: response.statusCode ?? 0, body });
      });
    });
    sent.on("error", reject);
    sent.end();
  });
}

async function serve() {
  const app = Fastify();
  const arrived = Promise.withResolvers<undefined>();
  const finish = Promise.withResolvers<undefined>();
  app.get("/slow", async () => {
    arrived.resolve(undefined);
    await finish.promise;
    return { answer: "late" };
  });
  app.get("/fast", () => ({ answer: "now" }));
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { app, arrived: arrived.promise, finish, port: Number(new URL(address).port) };
}

function stopping(app: Awaited<ReturnType<typeof serve>>["app"], graceMs?: number) {
  const events = new EventEmitter();
  const order: string[] = [];
  const done = stopOnSignal({
    app,
    sql: {
      end: () => {
        order.push("sql.end");
        return Promise.resolve();
      },
    },
    say: (line) => order.push(line),
    fail: (message) => order.push(`failed: ${message}`),
    events,
    sweepMs: 10,
    ...(graceMs === undefined ? {} : { graceMs }),
  });
  return { events, order, done };
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

describe("stopOnSignal, with a real server", () => {
  it("lets a request in flight finish, and then ends its connection instead of waiting out the keep-alive time", async () => {
    const { app, arrived, finish, port } = await serve();
    const answer = get(port, "/slow", keepAliveClient());
    await arrived;
    const { events, order, done } = stopping(app);
    events.emit("SIGTERM");
    // Several sweeps pass, and the request is not cut.
    await pause(60);
    expect(order).toEqual(["api: stopping on SIGTERM"]);
    finish.resolve(undefined);
    expect(await answer).toEqual({ status: 200, body: '{"answer":"late"}' });
    // Fastify keeps a connection a request has finished on for 72 seconds: the stop must not.
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "sql.end", "api: stopped"]);
  });

  it("stops at once when a client holds a connection that no request is on", async () => {
    const { app, port } = await serve();
    expect(await get(port, "/fast", keepAliveClient())).toEqual({ status: 200, body: '{"answer":"now"}' });
    const { events, order, done } = stopping(app);
    events.emit("SIGTERM");
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "sql.end", "api: stopped"]);
  });

  it("ends a request still in flight when the grace is over, says so, and stops", async () => {
    const { app, arrived, finish, port } = await serve();
    const answer = get(port, "/slow", keepAliveClient());
    const refused = expect(answer).rejects.toThrow();
    await arrived;
    const { events, order, done } = stopping(app, 100);
    events.emit("SIGTERM");
    await done;
    await refused;
    expect(order).toEqual([
      "api: stopping on SIGTERM",
      "api: requests still running after 0.1 seconds are ended",
      "sql.end",
      "api: stopped",
    ]);
    finish.resolve(undefined);
  });
});
