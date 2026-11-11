// The answers the API writes (the contract's errors, packages/contracts/src/errors.ts; T14, T52). Every
// answer with a body is for the caller alone, so it is `Cache-Control: private, no-store` and JSON, and
// an error's body is its code and the few facts its code names, never a message and never a value the
// caller sent. One function writes each kind, so the bytes of an answer don't depend on which of the
// causes behind it ran: the 401 for a missing header, a bad token and a deleting account is the same
// string (T14's one-answer rule; the gate's tests compare them byte for byte).

import type { ErrorCodeName } from "@tadayo/contracts";
import { statusOf } from "@tadayo/contracts";
import type { FastifyReply } from "fastify";

/** Every answer with a body is for the caller alone (the contract; T11, T12). */
export const NO_STORE = "private, no-store";
export const JSON_TYPE = "application/json; charset=utf-8";

/** The facts an error's body may carry beyond its code (the contract's Error schema). */
export interface ErrorFacts {
  /** The first bad field of the request, by name: never its value. */
  readonly field?: string;
  readonly current_version?: number;
}

/** An error as the contract has it: its status, and a body of its code and `facts`. */
export function problem(reply: FastifyReply, code: ErrorCodeName, facts: ErrorFacts = {}): FastifyReply {
  return reply
    .code(statusOf(code))
    .header("cache-control", NO_STORE)
    .type(JSON_TYPE)
    .send(JSON.stringify({ code, ...facts }));
}

/** A success: `body` as JSON, which only the caller may keep. */
export function ok(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.code(200).header("cache-control", NO_STORE).type(JSON_TYPE).send(JSON.stringify(body));
}

/**
 * The one 401: no session, whatever is wrong with the token or the account behind it (T14, T27). It has
 * no `WWW-Authenticate`, as the contract declares none.
 */
export function unauthenticated(reply: FastifyReply): FastifyReply {
  return problem(reply, "UNAUTHENTICATED");
}

/**
 * Sign-in can't be judged: the keys that check a token can't be read, so no token is believed or refused
 * (token.ts). A 503 with no body, never a 401, which the app answers by ending a session (FQ89).
 */
export function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).header("cache-control", NO_STORE).send();
}
