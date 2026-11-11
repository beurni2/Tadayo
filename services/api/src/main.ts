// The API's entry: start, then listen. A failure writes its message alone, never the error object,
// its cause or its stack, which could carry the database URL's password (T52, T56), and stops the
// process before it listens.

import { startApi } from "./start.ts";

try {
  const { app, port, host } = await startApi(process.env);
  const address = await app.listen({ port, host });
  process.stdout.write(`api: listening at ${address}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "api: failed to start"}\n`);
  process.exit(1);
}
