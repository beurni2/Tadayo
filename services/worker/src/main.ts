// The worker's entry. A failure writes its message alone, never the error object, its cause or its
// stack, which could carry the database URL's password or Storage's key (T52, T56), and exits 1.
//
// Once Storage's settings are read, the database has answered and the clock is ready, it runs two loops (loop.ts)
// until a SIGTERM or SIGINT (Fly stops a Machine with one of them): the days each club's week makes (generation.ts),
// a pass at the start and then every minute; and the outbox's events (outbox.ts), a pass at the start and then a
// second after each pass ends, whose one handler so far prepares a photo (prepare.ts). On a signal, the generation
// pass that is running finishes the club it is on and visits no other, and the outbox pass finishes the event in
// hand and claims no other; then the worker ends its connection and exits 0. Its handlers are in place before it
// says it started, so a signal sent as soon as that line is read stops it cleanly too, never by the signal's default
// action, with no exit code; they stay in place, so a second signal changes nothing and the stop under way still
// finishes. A pass that fails is reported, by the error's class and code alone, and tried again at the next tick: a
// process that exited would leave its Machine stopped, since fly.toml's `[[restart]] on-failure` restarts a failure
// and not a clean exit.
//
// Importing ./image.ts, through prepare.ts, restricts `sharp` to the JPEG, PNG and WebP decoders before any loop
// starts (spec 33).

import { describeFailure, generationPass, passLines } from "./generation.ts";
import { runLoop } from "./loop.ts";
import { outboxPass } from "./outbox.ts";
import { PREPARE_TOPIC, prepareHandler } from "./prepare.ts";
import { noSafetyProvider } from "./safety.ts";
import { startWorker } from "./start.ts";

/** A pass a minute: a newly confirmed day gets its dates within about a minute (spec 05). */
const PASS_EVERY_MS = 60_000;
/** The outbox's wait between passes: a completed photo is taken up within about a second. */
const OUTBOX_EVERY_MS = 1_000;

try {
  const { sql, clock, storage } = await startWorker(process.env);
  let stopping = false;
  const stopped = new Promise<string>((resolve) => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        stopping = true;
        resolve(signal);
      });
    }
  });
  const handlers = {
    [PREPARE_TOPIC]: prepareHandler({
      sql,
      clock,
      storage,
      safety: noSafetyProvider,
      say: (line) => process.stdout.write(`${line}\n`),
    }),
  };
  process.stdout.write("worker: started, making days every minute and preparing uploads\n");
  await Promise.all([
    runLoop({
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
    }),
    runLoop({
      pass: async () => {
        await outboxPass(sql, clock, handlers, {
          warn: (line) => process.stderr.write(`${line}\n`),
          stopping: () => stopping,
        });
      },
      everyMs: OUTBOX_EVERY_MS,
      stopped,
      failed: (error) => {
        process.stderr.write(`worker: an outbox pass failed: ${describeFailure(error)}\n`);
      },
    }),
  ]);
  await sql.end();
  process.stdout.write(`worker: stopped on ${await stopped}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "worker: failed to start"}\n`);
  process.exit(1);
}
