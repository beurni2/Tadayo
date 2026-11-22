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
//
// One route isn't an operation of the contract: the browser's preflight before the signed-out invitation
// page's request from tadayo.app, beside `previewInvitationWeb`'s route, which allows that page alone to
// read its answers (web-origin.ts).

import type { Socket } from "node:net";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { OPERATIONS } from "@tadayo/contracts";
import { JSON_TYPE, NO_STORE, problem } from "./answers.ts";
import { listClubsHandler } from "./clubs/list.ts";
import { createClubHandler, getClubHandler } from "./clubs/club.ts";
import { listMembersHandler } from "./clubs/members.ts";
import { getHomeHandler } from "./clubs/home.ts";
import { acceptInvitationHandler, previewInvitationHandler, previewInvitationWebHandler } from "./clubs/invitation.ts";
import {
  approveRosterHandler,
  createInvitationHandler,
  declineRosterHandler,
  getRosterRevisionHandler,
  proposeRosterHandler,
  revokeInvitationHandler,
} from "./clubs/roster.ts";
import { leaveClubHandler } from "./clubs/leave.ts";
import type { Deps, Handler } from "./deps.ts";
import { createReservationHandler, releaseReservationHandler } from "./drops/reservations.ts";
import { getMe, updateMeHandler } from "./identity/me.ts";
import { chooseScheduleDaysHandler, confirmScheduleDaysHandler, getScheduleHandler } from "./schedule/routes.ts";
import { fastifyLogging, logEachRequest } from "./logging.ts";
import { installGate } from "./session.ts";
import { END_SECONDS } from "./shutdown.ts";
import { WEB_OPERATION, allowWebOrigin, preflight } from "./web-origin.ts";

export type { Deps } from "./deps.ts";

const INVALID_BODY = '{"code":"INVALID_REQUEST"}';

/**
 * The most a request body may hold, for every route (Fastify's own limit is 1 MiB). The largest body the
 * contract lets any operation take is under 96,600 bytes (a report or a comment: a string's `maxLength`
 * counts code points, and a code point outside the Basic Multilingual Plane is written as two six-byte
 * escapes, docs/LIMITATIONS.md), so 128 KiB shuts no valid request out:
 * `tests/src/privacy/body-limits.test.ts` measures each operation's longest body from `openapi.yaml` and
 * holds it to its route's limit. What a body costs to check no longer grows with its size past each field's
 * own guard, since the contract's `text()` stops at it (a name of a million characters is refused before its
 * graphemes are counted); parsing 128 KiB of JSON takes well under a millisecond. Past the limit Fastify
 * answers from the Content-Length it was sent, before it reads a byte (and closes the connection), and
 * `failed` makes that the contract's INVALID_REQUEST.
 */
export const BODY_LIMIT = 128 * 1024;

/**
 * A route that takes little is given less: `updateMe`'s largest valid body is under 8,500 bytes (a name of
 * 640 code points, the most the contract keeps, each outside the Basic Multilingual Plane and written as
 * two escapes, every key escaped too, and an avatar's id and the rest), so its limit is 17 KiB, the least
 * whole number of KiB that keeps that body under half of it, as `me.test.ts` asks. A schedule command's is
 * a version and at most two weekdays, under 350 bytes with every key and character written as an escape, so
 * its limit is 1 KiB (`schedule/routes.test.ts`). `createClub`'s largest valid body is a name of the same
 * 640 code points and a zone of 64 characters, under 8,500 bytes written the same way, so it takes
 * `updateMe`'s 17 KiB (`clubs/club.test.ts`). `proposeRoster`'s is five labels of 640 code points each, under
 * 40,000 bytes written the same way, so its limit is 80 KiB; `createInvitation`'s is one id of 64 characters,
 * under 500 bytes, so its limit is 1 KiB (`clubs/roster.test.ts`). A roster decision's is one version, under
 * 150 bytes, so 1 KiB. An invitation's token is at most 128 characters, 768 bytes with each written as an
 * escape, so a preview's body is under 850 bytes and its limit 2 KiB; accepting adds an id of 64 characters
 * and a version, under 1,450 bytes in all, so 3 KiB (`clubs/invitation.test.ts`). A leave's is one choice,
 * under 250 bytes, so 1 KiB (`clubs/leave.test.ts`). A reservation's is one media class, under 200 bytes
 * written the same way, so 1 KiB (`drops/reservations.test.ts`).
 */
const ROUTE_BODY_LIMITS: Readonly<Record<string, number>> = {
  updateMe: 17 * 1024,
  createClub: 17 * 1024,
  proposeRoster: 80 * 1024,
  createInvitation: 1024,
  approveRoster: 1024,
  declineRoster: 1024,
  previewInvitationWeb: 2 * 1024,
  previewInvitation: 2 * 1024,
  acceptInvitation: 3 * 1024,
  leaveClub: 1024,
  createReservation: 1024,
  chooseScheduleDays: 1024,
  confirmScheduleDays: 1024,
};

/** The most `operation`'s request body may hold, in bytes. */
export function bodyLimitOf(operation: string): number {
  return ROUTE_BODY_LIMITS[operation] ?? BODY_LIMIT;
}

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
  return {
    getMe,
    updateMe: updateMeHandler(deps),
    listClubs: listClubsHandler(deps),
    createClub: createClubHandler(deps),
    getClub: getClubHandler(deps),
    listMembers: listMembersHandler(deps),
    getHome: getHomeHandler(deps),
    proposeRoster: proposeRosterHandler(deps),
    getRosterRevision: getRosterRevisionHandler(deps),
    createInvitation: createInvitationHandler(deps),
    revokeInvitation: revokeInvitationHandler(deps),
    approveRoster: approveRosterHandler(deps),
    declineRoster: declineRosterHandler(deps),
    previewInvitationWeb: previewInvitationWebHandler(deps),
    previewInvitation: previewInvitationHandler(deps),
    acceptInvitation: acceptInvitationHandler(deps),
    leaveClub: leaveClubHandler(deps),
    getSchedule: getScheduleHandler(deps),
    chooseScheduleDays: chooseScheduleDaysHandler(deps),
    confirmScheduleDays: confirmScheduleDaysHandler(deps),
    createReservation: createReservationHandler(deps),
    releaseReservation: releaseReservationHandler(deps),
  };
}

/** The app, with a route for each operation of the contract. */
export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({
    ...fastifyLogging(deps.log),
    bodyLimit: BODY_LIMIT,
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
    const url = operation.path.replace(/\{([a-z_]+)\}/g, ":$1");
    const fromPage = operation.id === WEB_OPERATION;
    app.route({
      method: operation.method.toUpperCase(),
      url,
      bodyLimit: bodyLimitOf(operation.id),
      config: {
        operation: operation.id,
        public: operation.public === true,
        beforeProfile: operation.beforeProfile === true,
      },
      ...(fromPage ? { onRequest: allowWebOrigin } : {}),
      handler: handlers[operation.id] ?? notFound,
    });
    // The preflight answers in its `onRequest` hook, before a body is read; its handler never runs. It has
    // no contract operation, so the gate's hook passes it by.
    if (fromPage) {
      app.route({
        method: "OPTIONS",
        url,
        config: { preflight: operation.id },
        // Fastify's way to answer from a hook: send, and don't call its `done`.
        onRequest: (request, reply) => {
          void preflight(request, reply);
        },
        handler: preflight,
      });
    }
  }
  app.setNotFoundHandler(notFound);
  app.setErrorHandler(failed);
  // The app owns the connection: closing the app ends it, once its requests are answered or cut
  // (shutdown.ts). Queries still running get `END_SECONDS`, and then postgres.js closes it anyway,
  // so the end can't outlast what Fly waits for.
  app.addHook("onClose", async () => {
    await deps.sql.end({ timeout: END_SECONDS });
  });
  return app;
}
