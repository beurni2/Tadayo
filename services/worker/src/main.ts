// The worker's entry. A failure writes its message alone, never the error object, its cause or its
// stack, which could carry the database URL's password (T52, T56), and exits 1.
//
// Once the database has answered and the clock is ready, it runs its loop (loop.ts): a pass of its one
// job so far, the days each club's week makes (generation.ts), at the start and then every minute, until
// a SIGTERM or SIGINT (Fly stops a Machine with one of them). Then it lets a running pass finish, ends
// its connection and exits 0. Its handlers are in place before it says it started, so a signal sent as
// soon as that line is read stops it cleanly too, never by the signal's default action, with no exit
// code. A pass that fails is reported, by the error's class and code alone, and tried again at the next
// tick: a process that exited would leave its Machine stopped, since fly.toml's `[[restart]] on-failure`
// restarts a failure and not a clean exit.

import { describeFailure, generationPass, passLines } from "./generation.ts";
import { runLoop } from "./loop.ts";
import { startWorker } from "./start.ts";

/** A pass a minute: a newly confirmed day gets its dates within about a minute (spec 05). */
const PASS_EVERY_MS = 60_000;

try {
  const { sql, clock } = await startWorker(process.env);
  const stopped = new Promise<string>((resolve) => {
    process.once("SIGTERM", () => {
      resolve("SIGTERM");
    });
    process.once("SIGINT", () => {
      resolve("SIGINT");
    });
  });
  process.stdout.write("worker: started, making days every minute\n");
  await runLoop({
    pass: async () => {
      const result = await generationPass(sql, clock);
      for (const line of passLines(result)) {
        (line.includes("failed") ? process.stderr : process.stdout).write(`${line}\n`);
      }
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
