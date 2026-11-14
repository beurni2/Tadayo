// Loaded into an entry's process with --import by startup.test.ts: the process sends itself the signal
// TADAYO_TEST_SIGNAL_AT_READY names at the instant it writes the line that says it is up ("api:
// listening at", "worker: started"), the earliest moment a test reading that line, or a deploy, could
// send one. An entry that writes the line before its handlers are in place ends then, by the signal's
// default action, with no exit code, as ci run 43529336129's worker did.

export {};

const signal = process.env["TADAYO_TEST_SIGNAL_AT_READY"];
if (signal !== "SIGTERM" && signal !== "SIGINT") {
  throw new Error("signal-at-ready: set TADAYO_TEST_SIGNAL_AT_READY to SIGTERM or SIGINT");
}
const ready = /^(api: listening at |worker: started)/;
const write = process.stdout.write.bind(process.stdout) as (chunk: unknown, ...rest: unknown[]) => boolean;
process.stdout.write = (chunk: unknown, ...rest: unknown[]) => {
  const written = write(chunk, ...rest);
  if (typeof chunk === "string" && ready.test(chunk)) process.kill(process.pid, signal);
  return written;
};
