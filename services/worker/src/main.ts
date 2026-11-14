// The worker's entry. A failure writes its message alone, never the error object, its cause or its
// stack, which could carry the database URL's password (T52, T56), and exits 1.
//
// With nothing to run yet, a worker that started has finished what it can check: the database
// answered and the clock is ready. It ends its connection and stays up, doing nothing, until a
// SIGTERM or SIGINT (Fly stops a Machine with one of them), then exits 0. Its handlers are in place
// before it says it started, so a signal sent as soon as that line is read stops it cleanly too, never
// by the signal's default action, with no exit code. A process that exited at
// once would leave its Machine stopped, since fly.toml's `[[restart]] on-failure` restarts a failure
// and not a clean exit, so `worker-scale --to started` would start it and find it stopped again.
// B1's first job replaces the wait with its loop (start.ts).

import { startWorker } from "./start.ts";

try {
  const { sql } = await startWorker(process.env);
  await sql.end();
  // A timer holds the process open: nothing else does, now that the connection is closed.
  const hold = setInterval(() => undefined, 60_000);
  const stopped = new Promise<string>((resolve) => {
    process.once("SIGTERM", () => {
      resolve("SIGTERM");
    });
    process.once("SIGINT", () => {
      resolve("SIGINT");
    });
  });
  process.stdout.write("worker: started, with no jobs yet\n");
  const signal = await stopped;
  clearInterval(hold);
  process.stdout.write(`worker: stopped on ${signal}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "worker: failed to start"}\n`);
  process.exit(1);
}
