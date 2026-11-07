// The API's Fastify app (TECH-DESIGN sections 3 and 5). In B0's slice 7 it is the skeleton: every
// operation of the contract has its route, and every route answers the neutral NOT_FOUND (T14;
// docs/plans/B0.md, slice 7), so the privacy matrix and the leak scanner (tests/src/privacy) run
// over every path from the start. The routes come with their slices, from slice 8.
//
// Nothing here reads the session, the database or the clock yet. Whatever Fastify itself answers
// a request it routes is made to say nothing either: an unknown path, another method, an id past
// the router's limit or a broken escape gets the same neutral not-found, and a body Fastify can't
// read gets the contract's INVALID_REQUEST, never the error's message. A request Node's parser
// can't read gets the contract's INVALID_REQUEST too, in place of Fastify's own words, unless an
// answer has already started on its connection, which then just closes, as Node closes it. Node
// itself still answers two requests with its own empty answers, an HTTP/1.1 request without a Host
// header with a 400 and an Expect it doesn't know with a 417, and a closing server answers with
// Fastify's fixed 503, a JSON body of its own words with no Cache-Control; none of them carries an
// id, a path or anyone's data.

import type { Socket } from "node:net";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { OPERATIONS } from "@tadayo/contracts";
import type { Clock } from "@tadayo/domain";
import type { ApiSql } from "./connection.ts";

/** What the routes will use: the database, through `connect`, and the server's clock (T1). */
export interface Deps {
  sql: ApiSql;
  clock: Clock;
}

/** Every answer with a body is for the caller alone (the contract; T11, T12). */
const NO_STORE = "private, no-store";
const JSON_TYPE = "application/json; charset=utf-8";
const INVALID_BODY = '{"code":"INVALID_REQUEST"}';

/** The neutral not-found (T14): one answer for missing and for not the caller's to see. */
export function notFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.code(404).header("cache-control", NO_STORE).type(JSON_TYPE).send('{"code":"NOT_FOUND"}');
}

function invalidRequest(error: FastifyError, _request: FastifyRequest, reply: FastifyReply): FastifyReply {
  // A body Fastify couldn't read: malformed or empty JSON, `__proto__` or `constructor.prototype`, a
  // type it has no parser for, or over the limit. Never the message, which can echo the request.
  if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.code(400).header("cache-control", NO_STORE).type(JSON_TYPE).send(INVALID_BODY);
  }
  return reply.code(500).header("cache-control", NO_STORE).send();
}

/**
 * A request Node's parser couldn't read (a raw byte or a space in the path, a method it doesn't
 * know, Transfer-Encoding beside Content-Length, two Content-Lengths, a version past HTTP/1.1,
 * headers past 16 KB, a request too slow to arrive): the contract's INVALID_REQUEST, then the
 * connection closes, as Node and Fastify close it. A reset connection gets nothing, and neither does
 * one whose answer to an earlier request has already started: its bytes would land inside that
 * answer, so the connection just closes, as Node's own handler does.
 */
function clientError(error: Error & { code?: string }, socket: Socket): void {
  if (error.code === "ECONNRESET" || socket.destroyed) return;
  const answering = (socket as Socket & { _httpMessage?: { headersSent?: boolean } | null })._httpMessage;
  if (socket.writable && !answering?.headersSent) {
    socket.write(
      `HTTP/1.1 400 Bad Request\r\nCache-Control: ${NO_STORE}\r\nContent-Type: ${JSON_TYPE}\r\n` +
        `Content-Length: ${String(INVALID_BODY.length)}\r\nConnection: close\r\n\r\n${INVALID_BODY}`,
    );
  }
  socket.destroy();
}

const recorded = new WeakMap<FastifyInstance, string[]>();

/** The routes `app` registered, as `METHOD /path`, for the matrix to hold against the contract. */
export function routesOf(app: FastifyInstance): readonly string[] {
  return recorded.get(app) ?? [];
}

/** The app, with a route for each operation of the contract. */
export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({
    logger: false,
    exposeHeadRoutes: false,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
    // Fastify's own answers to a request it routes (an id past its limit, a broken escape): neutral.
    frameworkErrors: (_error, request, reply) => {
      void notFound(request, reply);
    },
    clientErrorHandler: clientError,
  });
  const routes: string[] = [];
  recorded.set(app, routes);
  app.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) routes.push(`${method} ${route.url}`);
  });
  for (const operation of OPERATIONS) {
    app.route({
      method: operation.method.toUpperCase(),
      url: operation.path.replace(/\{([a-z_]+)\}/g, ":$1"),
      handler: notFound,
    });
  }
  app.setNotFoundHandler(notFound);
  app.setErrorHandler(invalidRequest);
  // The routes from slice 8 on read the database and the clock through `deps`; the skeleton's read
  // neither. The app owns the connection: closing the app ends it, once its requests are answered.
  app.addHook("onClose", async () => {
    await deps.sql.end();
  });
  return app;
}
