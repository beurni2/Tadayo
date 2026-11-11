// The worker's entry. A failure writes its message alone, never the error object, its cause or its
// stack, which could carry the database URL's password (T52, T56), and exits 1. With nothing to run
// yet, a worker that started ends its connection and exits 0.

import { startWorker } from "./start.ts";

try {
  const { sql } = await startWorker(process.env);
  await sql.end();
  process.stdout.write("worker: started, with no jobs yet\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "worker: failed to start"}\n`);
  process.exit(1);
}
