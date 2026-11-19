// The worker's entry. A failure writes its message alone, never the error object, its cause or its
// stack, which could carry the database URL's password (T52, T56), and exits 1.
//
// Once the database has answered and the clock is ready, it runs its loop (loop.ts): a pass of its one
// job so far, the days each club's week makes (generation.ts), at the start and then every minute, until
// a SIGTERM or SIGINT (Fly stops a Machine with one of them). Then the pass that is running finishes the
// club it is on and visits no other (generation.ts), and the worker ends its connection and exits 0. Its
// handlers are in place before it says it started, so a signal sent as soon as that line is read stops
// it cleanly too, never by the signal's default action, with no exit code; they stay in place, so a
// second signal changes nothing and the stop under way still finishes. A pass that fails is reported, by the error's class and code alone, and tried again at the next
// tick: a process that exited would leave its Machine stopped, since fly.toml's `[[restart]] on-failure`
// restarts a failure and not a clean exit.

import { describeFailure, generationPass, passLines } from "./generation.ts";
import { runLoop } from "./loop.ts";
import { startWorker } from "./start.ts";

/** A pass a minute: a newly confirmed day gets its dates within about a minute (spec 05). */
const PASS_EVERY_MS = 60_000;

try {
  const { sql, clock } = await startWorker(process.env);
  let stopping = false;
  const stopped = new Promise<string>((resolve) => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        stopping = true;
        resolve(signal);
      });
    }
  });
  process.stdout.write("worker: started, making days every minute\n");
  await runLoop({
    pass: async () => {
      const lines = passLines(await generationPass(sql, clock, undefined, () => stopping));
      for (const line of lines.out) process.stdout.write(`${line}\n`);
      for (const line of lines.err) process.stderr.write(`${line}\n`);
    },
    everyMs: PASS_EVERY_MS,
    stopped,
    failed: (error) => {
      process.stderr.write(`worker: a pass failed: ${describeFailure(error)}\n`);
    },
  });
  await sql.end();
  process.stdout.write(`worker: stopped on ${await stopped}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "worker: failed to start"}\n`);
  process.exit(1);
}
