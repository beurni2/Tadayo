// What the routes share: the dependencies `buildApp` is given, and a route's handler.

import type { Account, Clock } from "@tadayo/domain";
import { Fault } from "@tadayo/domain/fault";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiSql } from "./connection.ts";
import type { FailureCounter } from "./failure-count.ts";
import type { LogConfig } from "./logging.ts";
import type { UploadStorage } from "./media/storage.ts";
import type { Authenticate } from "./session.ts";
import "./context.ts";

/**
 * What the routes use: the database, the server's clock (T1), who is calling (`authenticate`, the gate's
 * one seam, which a test replaces), Storage for uploads (media/storage.ts, which a test replaces too) and
 * where the logs go. `failures` counts each 5xx for the founder's alert (failure-count.ts); left out, the
 * app counts them in `sql`, as it does in production. A route test whose fake `sql` counts the route's own
 * transactions gives one that counts nothing, since the count of a 5xx is a transaction of its own.
 */
export interface Deps {
  sql: ApiSql;
  clock: Clock;
  authenticate: Authenticate;
  storage: UploadStorage;
  log: LogConfig;
  failures?: FailureCounter;
}

/** A route's handler: it answers, or throws, which is a 500. */
export type Handler = (request: FastifyRequest, reply: FastifyReply) => FastifyReply | Promise<FastifyReply>;

/** The account the gate loaded: every route that isn't public has one by the time its handler runs. */
export function signedIn(request: FastifyRequest): Account {
  if (request.account === null) throw new Fault("api_deps_1", "api: a handler ran without the gate's account");
  return request.account;
}
