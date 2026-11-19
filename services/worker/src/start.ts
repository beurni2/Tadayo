// The worker's startup: the configuration, the database and the server's clock. The environment's
// value goes to the time module as it is, so a missing or mistyped one stops the worker instead of
// picking a clock (ADR-013). Its jobs run in the loop main.ts starts (loop.ts); the first is the days each
// club's week makes (generation.ts).

import { prepareClock, type Clock } from "@tadayo/domain";
import { connect, type WorkerSql } from "./connection.ts";

export interface Started {
  sql: WorkerSql;
  clock: Clock;
}

/** Connects and prepares the clock of `TADAYO_ENVIRONMENT`, or throws. */
export async function startWorker(env: Readonly<Record<string, string | undefined>>): Promise<Started> {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("worker: DATABASE_URL isn't set");
  const sql = connect(url);
  try {
    return { sql, clock: await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql) };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
