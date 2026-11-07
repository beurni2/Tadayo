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

/** Connects, prepares the clock of `TADAYO_ENVIRONMENT` and builds the app, or throws. */
export async function startApi(env: Readonly<Record<string, string | undefined>>): Promise<Started> {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error("api: DATABASE_URL isn't set");
  const sql = connect(url);
  try {
    const clock = await prepareClock(env.TADAYO_ENVIRONMENT ?? "", sql);
    return { app: buildApp({ sql, clock }), sql, port: Number(env.PORT ?? "8080"), host: env.HOST ?? "0.0.0.0" };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
