// How an endpoint is declared. `document.ts` turns each into an OpenAPI operation, adding the errors
// every endpoint of its kind can return, so a declaration lists only its own.
import type * as z from "zod";

import type { ErrorCodeName } from "./errors.ts";

export type Method = "get" | "post" | "put" | "patch" | "delete";

// Every answer with a body says `Cache-Control: private, no-store`, and every image its ETag: `document.ts`
// adds both, so no operation can leave them out.
export type Success =
  | { status: 200 | 201 | 202; json: z.ZodType }
  | { status: 204 }
  | { status: 200; binary: "image/jpeg" }
  | { status: 200; binary: "image/jpeg"; json: z.ZodType };

export interface Operation {
  /** The operationId, which names the generated Swift client's method. */
  id: string;
  method: Method;
  path: `/v1/${string}`;
  summary: string;
  /** What it does and the sources it follows (spec, book, invariants). */
  description: string;
  /** No session: the caller is signed out (an invitation's preview) or has just logged out. */
  public?: true;
  /** Needs an Idempotency-Key, created when the action starts and reused on every retry (T19). */
  idempotent?: true;
  /** Works before the profile is complete (no PROFILE_INCOMPLETE). */
  beforeProfile?: true;
  /**
   * Its 503, with no body, is part of what it says: the health check's answer when the database doesn't answer
   * (the outside audit's A7). Another operation's 503, when a service it needs can't be reached, stays out of the
   * document.
   */
  unavailable?: true;
  query?: z.ZodObject;
  body?: z.ZodType;
  ok: Success;
  /** The errors this endpoint returns beyond those `document.ts` adds for every endpoint of its kind. */
  errors?: ErrorCodeName[];
}

/**
 * The errors every endpoint of a kind can return. The neutral NOT_FOUND belongs to an endpoint that names something
 * that may be missing or not the caller's: by a path parameter, or, for a public one, by a token or a secret in its
 * body. A public endpoint with neither names nothing (the health check).
 */
export function standardErrors(op: Operation): ErrorCodeName[] {
  const codes: ErrorCodeName[] = ["INVALID_REQUEST"];
  if (!op.public) codes.push("UNAUTHENTICATED");
  if (!op.public && !op.beforeProfile) codes.push("PROFILE_INCOMPLETE");
  if (op.path.includes("{") || (op.public && op.body)) codes.push("NOT_FOUND");
  if (op.idempotent) codes.push("IDEMPOTENCY_CONFLICT");
  codes.push("RATE_LIMITED");
  return codes;
}

/** The path's parameters, in order. */
export function pathParameters(path: string): string[] {
  return [...path.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1] ?? "");
}
