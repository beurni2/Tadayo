// The API's startup: the configuration, the database and the server's clock, before anything
// listens. The environment's value goes to the time module as it is, so a missing or mistyped one
// stops the API instead of picking a clock (ADR-013).

import { prepareClock } from "@tadayo/domain";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { connect, type ApiSql } from "./connection.ts";

export interface Started {
  app: FastifyInstance;
  sql: ApiSql;
  port: number;
  host: string;
}

/**
 * The port in PORT: 8080 when it isn't set, else a whole number to 65535 in digits, 0 asking the
 * system for a free one (the tests). An empty or other value stops the API, so a blank setting
 * never leaves it listening where nothing reaches it.
 */
function portOf(value: string | undefined): number {
  if (value === undefined) return 8080;
  if (!/^[0-9]{1,5}$/.test(value) || Number(value) > 65_535) throw new Error("api: PORT isn't a port");
  return Number(value);
}

/** Connects, prepares the clock of `TADAYO_ENVIRONMENT` and builds the app, or throws. */
export async function startApi(env: Readonly<Record<string, string | undefined>>): Promise<Started> {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("api: DATABASE_URL isn't set");
  const port = portOf(env.PORT);
  const sql = connect(url);
  try {
    const clock = await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql);
    return { app: buildApp({ sql, clock }), sql, port, host: env.HOST ?? "0.0.0.0" };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
