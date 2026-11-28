// One commit per idempotency key (T19; docs/TECH-DESIGN.md section 6; the contract's
// Idempotency-Key, packages/contracts/src/document.ts).
//
// A key is the caller's own, for one operation: `app.idempotency_receipts` holds one receipt per
// caller, operation and key. The receipt keeps a hash of the request, so a retry can be told
// from a reuse: the same path, query and body is the same request and gets the stored response;
// anything else under the same key is IDEMPOTENCY_CONFLICT, even when only the drop in the path
// or the reason in the query differs (review finding p2 of PR #14). The hash covers the request
// as parsed (the path's parameters, the query's values and the body's JSON), so a retry that
// spells the same request differently (keys in another order, a percent-encoded path) is still
// the same request.

import { createHash } from "node:crypto";
import { Fault } from "../fault.ts";

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface IdempotentRequest {
  /** The contract's operation id, such as `removeDrop`. */
  readonly operation: string;
  /** The path's parameters, decoded, such as `{ drop_id: "drp_…" }`. */
  readonly path: Readonly<Record<string, string>>;
  /** The query's parameters, decoded; a repeated one keeps its order. */
  readonly query: Readonly<Record<string, string | readonly string[]>>;
  /** The body as parsed JSON, or null when there is none. */
  readonly body: Json;
}

/** JSON with every object's keys in code-point order. Throws on what JSON can't carry. */
function canonical(value: Json, at: string): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Fault("request_1", `idempotency: ${at} is ${String(value)}, which JSON can't carry`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map((item, index) => canonical(item, `${at}[${String(index)}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as { readonly [key: string]: Json };
    const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys
      .map((key) => {
        const item = record[key];
        if (item === undefined)
          throw new Fault("request_2", `idempotency: ${at}.${key} is undefined, which JSON can't carry`);
        return `${JSON.stringify(key)}:${canonical(item, `${at}.${key}`)}`;
      })
      .join(",")}}`;
  }
  throw new Fault("request_3", `idempotency: ${at} is a ${typeof value}, which JSON can't carry`);
}

/** The receipt's `request_hash`: SHA-256, in hex, of the operation, path, query and body. */
export function requestHash(request: IdempotentRequest): string {
  const text = canonical(
    { operation: request.operation, path: request.path, query: request.query, body: request.body },
    "request",
  );
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * What a request under a key that already has a receipt gets: the stored response when it is
 * the same request, IDEMPOTENCY_CONFLICT otherwise (T19).
 */
export function replayOutcome(storedHash: string, request: IdempotentRequest): "replay" | "IDEMPOTENCY_CONFLICT" {
  return storedHash === requestHash(request) ? "replay" : "IDEMPOTENCY_CONFLICT";
}
