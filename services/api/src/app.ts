// The API's Fastify app (TECH-DESIGN sections 3 and 5). Every operation of the contract has its route
// (docs/plans/B0.md, slice 7), and the routes that aren't built yet answer the neutral NOT_FOUND (T14), so
// the privacy matrix and the leak scanner (tests/src/privacy) run over every path from the start. The
// routes come with their slices: slice 8 builds the sign-in gate (session.ts) and `GET /v1/me`,
// `PATCH /v1/me` and `GET /v1/clubs`.
//
// Whatever Fastify itself answers a request it routes is made to say nothing: an unknown path, another
// method, an id past the router's limit or a broken escape gets the same neutral not-found for every
// caller, the gate's included, and a body Fastify can't read gets the contract's INVALID_REQUEST, never
// the error's message. A request Node's parser can't read gets the contract's INVALID_REQUEST too, in
// place of Fastify's own words, unless an answer has already started on its connection, which then just
// closes, cutting that answer short. Node itself still answers two requests with its own empty answers,
// an HTTP/1.1 request without a Host header with a 400 and an Expect it doesn't know with a 417, and a
// closing server answers with Fastify's fixed 503, a JSON body of its own words with no Cache-Control;
// none of them carries an id, a path or anyone's data. Nothing is logged but the one line a request
// gets (logging.ts, T52).

import type { Socket } from "node:net";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { OPERATIONS } from "@tadayo/contracts";
import { JSON_TYPE, NO_STORE, problem } from "./answers.ts";
import { listClubsHandler } from "./clubs/list.ts";
import type { Deps, Handler } from "./deps.ts";
import { getMe, updateMeHandler } from "./identity/me.ts";
import { fastifyLogging, logEachRequest } from "./logging.ts";
import { installGate } from "./session.ts";

export type { Deps } from "./deps.ts";

const INVALID_BODY = '{"code":"INVALID_REQUEST"}';

/** The neutral not-found (T14): one answer for missing and for not the caller's to see. */
export function notFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return problem(reply, "NOT_FOUND");
}

function failed(error: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  // A body Fastify couldn't read: malformed or empty JSON, `__proto__` or `constructor.prototype`, a
  // type it has no parser for, or over the limit. Never the message, which can echo the request.
  if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
    return problem(reply, "INVALID_REQUEST");
  }
  // A bug, or a database that failed: logged by its class and code alone, since a message can quote rows
  // (T52), and answered with nothing.
  request.log.error({ err: error }, "request failed");
  return reply.code(500).header("cache-control", NO_STORE).send();
}

/**
 * A request Node's parser couldn't read (a raw byte or a space in the path, a method it doesn't
 * know, Transfer-Encoding beside Content-Length, two Content-Lengths, a version past HTTP/1.1,
 * headers past 16 KB, a request too slow to arrive): the contract's INVALID_REQUEST, then the
 * connection closes, as Node and Fastify close it. A reset connection gets nothing, and neither does
 * one whose answer to an earlier request has already started, its headers set: its bytes would land
 * inside that answer, so the connection just closes, which cuts that answer short. Node's own handler
 * holds back only once those headers have reached the socket; this holds back as soon as they exist.
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

/** The routes built so far, by operation id; every other operation answers the neutral not-found. */
function handlersOf(deps: Deps): Readonly<Record<string, Handler>> {
  return { getMe, updateMe: updateMeHandler(deps), listClubs: listClubsHandler(deps) };
}

/** The app, with a route for each operation of the contract. */
export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({
    ...fastifyLogging(deps.log),
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
  // The gate and the log line, before the routes, which then carry both.
  installGate(app, deps.authenticate);
  logEachRequest(app);
  const handlers = handlersOf(deps);
  for (const operation of OPERATIONS) {
    app.route({
      method: operation.method.toUpperCase(),
      url: operation.path.replace(/\{([a-z_]+)\}/g, ":$1"),
      config: {
        operation: operation.id,
        public: operation.public === true,
        beforeProfile: operation.beforeProfile === true,
      },
      handler: handlers[operation.id] ?? notFound,
    });
  }
  app.setNotFoundHandler(notFound);
  app.setErrorHandler(failed);
  // The app owns the connection: closing the app ends it, once its requests are answered.
  app.addHook("onClose", async () => {
    await deps.sql.end();
  });
  return app;
}
