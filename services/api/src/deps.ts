// What the routes share: the dependencies `buildApp` is given, and a route's handler.

import type { Account, Clock } from "@tadayo/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiSql } from "./connection.ts";
import type { LogConfig } from "./logging.ts";
import type { Authenticate } from "./session.ts";
import "./context.ts";

/**
 * What the routes use: the database, the server's clock (T1), who is calling (`authenticate`, the gate's
 * one seam, which a test replaces) and where the logs go.
 */
export interface Deps {
  sql: ApiSql;
  clock: Clock;
  authenticate: Authenticate;
  log: LogConfig;
}

/** A route's handler: it answers, or throws, which is a 500. */
export type Handler = (request: FastifyRequest, reply: FastifyReply) => FastifyReply | Promise<FastifyReply>;

/** The account the gate loaded: every route that isn't public has one by the time its handler runs. */
export function signedIn(request: FastifyRequest): Account {
  if (request.account === null) throw new Error("api: a handler ran without the gate's account");
  return request.account;
}
