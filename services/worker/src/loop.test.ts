// The worker's loop with no database and no real waiting: passes the test controls, and a wait of a
// millisecond or of a minute that a stop must cut short.

import { describe, expect, it } from "vitest";
import { runLoop } from "./loop.ts";

/** A promise and the function that settles it. */
function gate<T = void>(): { promise: Promise<T>; open: (value: T) => void } {
  let open: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => (open = resolve));
  return { promise, open };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the worker's loop (spec 34)", () => {
  it("runs a pass at the start, before any wait", async () => {
    const stop = gate<string>();
    let passes = 0;
    const done = runLoop({
      pass: () => {
        passes += 1;
        return Promise.resolve();
      },
      everyMs: 3_600_000,
      stopped: stop.promise,
      failed: () => undefined,
    });
    await turn();
    expect(passes).toBe(1);
    stop.open("SIGTERM");
    await done;
    expect(passes).toBe(1);
  });

  it("runs one pass after another, each after the wait, never two at once", async () => {
    const stop = gate<string>();
    let running = 0;
    let most = 0;
    let passes = 0;
    const done = runLoop({
      pass: async () => {
        running += 1;
        most = Math.max(most, running);
        passes += 1;
        // A pass longer than the wait: the next still starts only after it.
        await new Promise((resolve) => setTimeout(resolve, 15));
        running -= 1;
        if (passes === 4) stop.open("SIGTERM");
      },
      everyMs: 1,
      stopped: stop.promise,
      failed: () => undefined,
    });
    await done;
    expect(passes).toBe(4);
    expect(most).toBe(1);
  });

  it("waits its whole wait between the end of one pass and the start of the next", async () => {
    const stop = gate<string>();
    const ended: number[] = [];
    const began: number[] = [];
    const done = runLoop({
      pass: async () => {
        began.push(performance.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        ended.push(performance.now());
        if (began.length === 3) stop.open("SIGTERM");
      },
      everyMs: 120,
      stopped: stop.promise,
      failed: () => undefined,
    });
    await done;
    expect(began).toHaveLength(3);
    // A timer may fire a millisecond early by its rounding, never by twenty.
    expect((began[1] ?? 0) - (ended[0] ?? 0)).toBeGreaterThanOrEqual(100);
    expect((began[2] ?? 0) - (ended[1] ?? 0)).toBeGreaterThanOrEqual(100);
  });

  it("ends a wait at once when it is told to stop: it doesn't sit out the minute", async () => {
    const stop = gate<string>();
    const done = runLoop({
      pass: () => Promise.resolve(),
      everyMs: 60_000,
      stopped: stop.promise,
      failed: () => undefined,
    });
    await turn();
    stop.open("SIGINT");
    // The test's own timeout (five seconds) fails it if the loop waited.
    await done;
  });

  it("lets a pass that is running finish when it is told to stop, and starts no other", async () => {
    const stop = gate<string>();
    const release = gate();
    const steps: string[] = [];
    const done = runLoop({
      pass: async () => {
        steps.push("began");
        await release.promise;
        steps.push("finished");
      },
      everyMs: 1,
      stopped: stop.promise,
      failed: () => undefined,
    });
    await turn();
    stop.open("SIGTERM");
    await turn();
    let ended = false;
    void done.then(() => (ended = true));
    await turn();
    expect(ended).toBe(false);
    release.open();
    await done;
    expect(steps).toEqual(["began", "finished"]);
  });

  it("reports a pass that throws and goes on to the next", async () => {
    const stop = gate<string>();
    const failures: unknown[] = [];
    let passes = 0;
    const done = runLoop({
      pass: () => {
        passes += 1;
        if (passes === 1) return Promise.reject(new Error("the database is away"));
        stop.open("SIGTERM");
        return Promise.resolve();
      },
      everyMs: 1,
      stopped: stop.promise,
      failed: (error) => failures.push(error),
    });
    await done;
    expect(passes).toBe(2);
    expect(failures).toHaveLength(1);
  });

  it("runs its first pass and no second when it was already told to stop", async () => {
    // The first pass is owed at the start whatever came before; the stop is seen as soon as it ends.
    let passes = 0;
    await runLoop({
      pass: () => {
        passes += 1;
        return Promise.resolve();
      },
      everyMs: 1,
      stopped: Promise.resolve("SIGTERM"),
      failed: () => undefined,
    });
    expect(passes).toBe(1);
  });

  it("refuses a wait that isn't positive, which would spin", async () => {
    const options = { pass: () => Promise.resolve(), stopped: new Promise(() => undefined), failed: () => undefined };
    await expect(runLoop({ ...options, everyMs: 0 })).rejects.toThrow(RangeError);
    await expect(runLoop({ ...options, everyMs: Number.NaN })).rejects.toThrow(RangeError);
  });
});
