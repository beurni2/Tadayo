// The worker's loop (spec 34; T1): one pass at the start, then one each `everyMs`, never two at once,
// until it is told to stop. A stop ends the wait at once and waits for a pass that is running to return,
// so no transaction is cut off. How soon a running pass returns is the pass's own business: the worker's
// one job stops after the club it is on (generation.ts), which its lock and statement limits bound.
//
// The timer only decides when the worker looks again. What a pass does, and what a day is, comes from
// the server's clock, sampled inside each job's own transaction (T1): nothing here reads a clock, and a
// tick that comes late or early changes nothing a job decides.
//
// A pass that throws (the database is away) is reported and tried again at the next tick: the worker
// stays up, since a worker that exited cleanly would leave its Machine stopped (fly.toml).

import { RangeFault } from "@tadayo/domain/fault";

export interface Loop {
  /** One pass. A throw is reported, and the loop goes on. */
  readonly pass: () => Promise<void>;
  /** The wait between the end of one pass and the start of the next, in milliseconds. */
  readonly everyMs: number;
  /** Settles when the worker is told to stop. */
  readonly stopped: Promise<unknown>;
  /** Told of a pass that threw. */
  readonly failed: (error: unknown) => void;
}

/** Runs passes until `stopped` settles; resolves once the last pass has finished. */
export async function runLoop(loop: Loop): Promise<void> {
  if (!Number.isFinite(loop.everyMs) || loop.everyMs <= 0)
    throw new RangeFault("worker_loop_1", "worker: the loop's wait is positive");
  let told = false;
  const stopNow = () => {
    told = true;
  };
  // Read through a function: it changes between two reads the compiler would take for one.
  const stopping = (): boolean => told;
  const stop = loop.stopped.then(stopNow, stopNow);
  while (!stopping()) {
    try {
      await loop.pass();
    } catch (error) {
      loop.failed(error);
    }
    if (stopping()) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, loop.everyMs);
    });
    await Promise.race([tick, stop]);
    clearTimeout(timer);
  }
}
