// The worker's startup: the configuration, Storage, the database and the server's clock. The environment's value
// goes to the time module as it is, so a missing or mistyped one stops the worker instead of picking a clock
// (ADR-013). A missing or mistyped SUPABASE_URL or SUPABASE_SERVICE_KEY stops it too, before it connects: its
// preparation reads originals and writes renditions with the service key (./storage.ts; T56), which Fly's secrets
// give both process groups. Its jobs run in the loops main.ts starts (loop.ts): the days each club's week makes
// (generation.ts), and the outbox's events (outbox.ts), of which the first is a photo's preparation (prepare.ts).

import { prepareClock, type Clock } from "@tadayo/domain";
import { connect, type WorkerSql } from "./connection.ts";
import { workerStorage, type WorkerStorage } from "./storage.ts";

export interface Started {
  sql: WorkerSql;
  clock: Clock;
  storage: WorkerStorage;
}

/** Reads Storage's settings, connects and prepares the clock of `TADAYO_ENVIRONMENT`, or throws. */
export async function startWorker(env: Readonly<Record<string, string | undefined>>): Promise<Started> {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("worker: DATABASE_URL isn't set");
  const project = env.SUPABASE_URL;
  if (project === undefined || project === "") throw new Error("worker: SUPABASE_URL isn't set");
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (serviceKey === undefined || serviceKey === "") throw new Error("worker: SUPABASE_SERVICE_KEY isn't set");
  const storage = workerStorage({ projectUrl: project, serviceKey });
  const sql = connect(url);
  try {
    return { sql, clock: await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql), storage };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
