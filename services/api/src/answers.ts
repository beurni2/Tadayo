// The answers the API writes (the contract's errors, packages/contracts/src/errors.ts; T14, T52). Every
// answer with a body is for the caller alone, so it is `Cache-Control: private, no-store` and JSON, and
// an error's body is its code and the few facts its code names, never a message and never a value the
// caller sent. One function writes each kind, so the bytes of an answer don't depend on which of the
// causes behind it ran: the 401 for a missing header, a bad token and a deleting account is the same
// string (T14's one-answer rule; the gate's tests compare them byte for byte).

import { ERRORS, statusOf, type ErrorCodeName } from "@tadayo/contracts";
import type { Json, Refused } from "@tadayo/domain";
import type { FastifyReply } from "fastify";
import { allowanceBody, occurrenceBody } from "./bodies.ts";

/** Every answer with a body is for the caller alone (the contract; T11, T12). */
export const NO_STORE = "private, no-store";
export const JSON_TYPE = "application/json; charset=utf-8";

/** The facts an error's body may carry beyond its code (the contract's Error schema). */
export interface ErrorFacts {
  /** The first bad field of the request, by name: never its value. */
  readonly field?: string;
  /** The day the request asked for, as the contract's Occurrence (T4). */
  readonly target?: Json;
  /** The same person's next day, for the person to confirm, as the contract's Occurrence (T4). */
  readonly next_target?: Json;
  /** The caller's own allowance in `target`, as the contract's Allowance (T15, T17). */
  readonly allowance?: Json;
  readonly current_version?: number;
  /** The newer revision or proposal that replaced the one the request named. */
  readonly current_id?: string;
  /** The caller's own drop that already holds the photo or link in the day (T21). */
  readonly existing_drop_id?: string;
}

/** An error as the contract has it: its status, and a body of its code and `facts`. */
export function problem(reply: FastifyReply, code: ErrorCodeName, facts: ErrorFacts = {}): FastifyReply {
  return reply
    .code(statusOf(code))
    .header("cache-control", NO_STORE)
    .type(JSON_TYPE)
    .send(JSON.stringify({ code, ...facts }));
}

/** The `Idempotency-Key` header: a UUID. */
export const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isErrorCode(code: string): code is ErrorCodeName {
  return Object.hasOwn(ERRORS, code);
}

/**
 * A command's refusal as the contract's answer, each fact it names in the contract's shape, an explicit field
 * list (T55); a code that isn't the contract's is a bug, which is a 500.
 */
export function refusal(reply: FastifyReply, refused: Refused): FastifyReply {
  if (!isErrorCode(refused.code)) throw refused;
  const {
    field,
    target,
    next_target: next,
    allowance,
    current_version: version,
    current_id: current,
    existing_drop_id: existing,
  } = refused.facts;
  return problem(reply, refused.code, {
    ...(field === undefined ? {} : { field }),
    ...(target === undefined ? {} : { target: occurrenceBody(target) }),
    ...(next === undefined ? {} : { next_target: occurrenceBody(next) }),
    ...(allowance === undefined ? {} : { allowance: allowanceBody(allowance) }),
    ...(version === undefined ? {} : { current_version: version }),
    ...(current === undefined ? {} : { current_id: current }),
    ...(existing === undefined ? {} : { existing_drop_id: existing }),
  });
}

/** A success: `body` as JSON, which only the caller may keep. */
export function ok(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.code(200).header("cache-control", NO_STORE).type(JSON_TYPE).send(JSON.stringify(body));
}

/** A success that started work (the contract's 202): `body` as JSON, which only the caller may keep. */
export function accepted(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.code(202).header("cache-control", NO_STORE).type(JSON_TYPE).send(JSON.stringify(body));
}

/** A success that made something (the contract's 201): `body` as JSON, which only the caller may keep. */
export function created(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.code(201).header("cache-control", NO_STORE).type(JSON_TYPE).send(JSON.stringify(body));
}

/**
 * A success with nothing to say (the contract's 204): no body, and nothing for a cache to keep. Fastify sends a
 * 204 with no `Content-Type` and no `Content-Length`.
 */
export function noContent(reply: FastifyReply): FastifyReply {
  return reply.code(204).header("cache-control", NO_STORE).send();
}

/**
 * The one 401: no session, whatever is wrong with the token or the account behind it (T14, T27). It has
 * no `WWW-Authenticate`, as the contract declares none.
 */
export function unauthenticated(reply: FastifyReply): FastifyReply {
  return problem(reply, "UNAUTHENTICATED");
}

/**
 * A service the answer needs can't be reached: sign-in's keys, so no token is believed or refused (token.ts),
 * and never a 401, which the app answers by ending a session (FQ89); Storage, for an upload's signed URL or
 * its bytes (media/storage.ts); or the database, out of time on a lock or a statement, so nothing was committed
 * and the same request under the same key may be sent again (app.ts `failed`, the outside audit's A7). A 503
 * with no body.
 */
export function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).header("cache-control", NO_STORE).send();
}
