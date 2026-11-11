// The API's way of stopping, without a process or a signal: the order it closes things in, and
// that it does it once.

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { stopOnSignal } from "./shutdown.ts";

function rig() {
  const events = new EventEmitter();
  const order: string[] = [];
  const closing = Promise.withResolvers<undefined>();
  const failures: string[] = [];
  const done = stopOnSignal({
    app: {
      close: () => {
        order.push("app.close");
        return closing.promise;
      },
    },
    sql: {
      end: () => {
        order.push("sql.end");
        return Promise.resolve();
      },
    },
    say: (line) => order.push(line),
    fail: (message) => {
      failures.push(message);
    },
    events,
  });
  return { events, order, closing, failures, done };
}

describe("stopOnSignal", () => {
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

  it("still ends the database's connection when closing the server fails, and says so without the error's own words", async () => {
    const { events, order, closing, failures, done } = rig();
    events.emit("SIGTERM");
    closing.reject(new Error("password=hunter2 near the socket"));
    await done;
    expect(order).toEqual(["api: stopping on SIGTERM", "app.close", "sql.end"]);
    expect(failures).toEqual(["api: the server didn't close cleanly"]);
  });

  it("does nothing until a signal comes", () => {
    const { events, order } = rig();
    expect(order).toEqual([]);
    expect(events.listenerCount("SIGTERM")).toBe(1);
    expect(events.listenerCount("SIGINT")).toBe(1);
  });
});
