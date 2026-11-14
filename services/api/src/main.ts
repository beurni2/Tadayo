// The API's entry: start, then listen. A failure writes its message alone, never the error object,
// its cause or its stack, which could carry the database URL's password (T52, T56), and stops the
// process before it listens. A SIGTERM or SIGINT stops it cleanly (shutdown.ts), and the process
// ends when the stop has finished, with the exit code the stop left (1 when something failed). The
// stop's handlers are in place before it says it listens, so a signal sent as soon as that line is read
// stops it cleanly too, never by the signal's default action, with no exit code.

import { stopOnSignal } from "./shutdown.ts";
import { startApi } from "./start.ts";

try {
  const { app, sql, port, host } = await startApi(process.env);
  const address = await app.listen({ port, host });
  const stopped = stopOnSignal({
    app,
    sql,
    say: (line) => process.stdout.write(`${line}\n`),
    fail: (message) => {
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  });
  process.stdout.write(`api: listening at ${address}\n`);
  void stopped.then(() => process.exit());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "api: failed to start"}\n`);
  process.exit(1);
}
