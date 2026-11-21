// The one page outside the app that calls the API: the signed-out invitation page on tadayo.app (G02-web,
// apps/web/public/i.html). It reads the token from its link's fragment and sends it in the body of
// `previewInvitationWeb` (TECH-DESIGN section 1; T7, T52). A browser lets a page read an answer from
// another origin only when the answer allows the page's origin, and before a JSON POST it asks first, with a
// preflight (OPTIONS). So (docs/plans/api-b0-spike-links-web.md, section 2):
// - a request to `previewInvitationWeb` from exactly https://tadayo.app gets the allowance on whatever its
//   route answers, set before its body is read, so a refusal and a failure carry it too; every other
//   request, with no Origin or another one, and every other route, gets the same bytes as before. It
//   depends on a header the caller sends, never on who is calling or what the token names (T14). `Vary`
//   goes with it alone: every answer is `private, no-store`, so no cache keeps one to give another origin.
//   Two answers come before any route's hook, so they carry no allowance: Fastify's 503 while the server
//   closes, and the bare 400 for a request Node's parser can't read or that arrives too slowly (app.ts,
//   `clientError`). The page's browser reads either as a network error, which the page shows as a failure
//   to check, as it should;
// - the preflight answers every caller the same, before its body is read: it reads no header, no session and
//   no database. It is the one route outside the contract, which lists operations, not the browser's
//   questions; the routes' tests and the privacy matrix pin it by its method and path (T59).
// No credentials are ever allowed: the page sends no cookie and no Authorization, and the route is public.

import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { NO_STORE } from "./answers.ts";

/** The invitation page's origin: tadayo.app, where Cloudflare Pages serves `apps/web`. */
export const WEB_ORIGIN = "https://tadayo.app";

/** The one operation a page on WEB_ORIGIN may read: the signed-out invitation page's. */
export const WEB_OPERATION = "previewInvitationWeb";

/** How long a browser may keep the preflight's answer, in seconds. */
export const PREFLIGHT_MAX_AGE = 600;

/** A route's `onRequest` hook: a request from WEB_ORIGIN may read the answer, whatever it is. */
export function allowWebOrigin(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  if (request.headers.origin === WEB_ORIGIN) {
    void reply.header("access-control-allow-origin", WEB_ORIGIN).header("vary", "Origin");
  }
  done();
}

/**
 * The preflight's one answer, sent from its route's `onRequest` hook, before any body is read: 204, the
 * origin, the one method and the one header the page sends, and no body.
 */
export function preflight(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply
    .code(204)
    .header("access-control-allow-origin", WEB_ORIGIN)
    .header("access-control-allow-methods", "POST")
    .header("access-control-allow-headers", "content-type")
    .header("access-control-max-age", String(PREFLIGHT_MAX_AGE))
    .header("cache-control", NO_STORE)
    .send();
}
