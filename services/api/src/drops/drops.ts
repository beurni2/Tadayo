/// <reference lib="esnext.temporal" />
// Adding a drop to a day over HTTP (the contract's `createDrop`, for a photo; spec 06, 07, 11, 14, 32; T3, T4,
// T8, T9, T14, T15, T17, T19, T20, T21, T52, T55; docs/plans/api-b2-spike-commit.md). Who may add, the upload's
// rule, the caller's role and limits, the locks, the cutoff, the audience and the receipt are the domain's
// (packages/domain/src/drops/commit.ts): the handler parses the request by the contract's own schema, runs the
// command in one transaction, and writes what comes back as an explicit field list (T55). The body is strict, so
// it can carry no audience, role, time or target (T4, T8, T17). Nothing here logs the caption, the upload or the
// key (T52): a refusal's body is its code and the facts its code names.

import { CreateDropRequest } from "@tadayo/contracts";
import {
  createDrop,
  Refused,
  type CreateDropInput,
  type DropReceiptAnswer,
  type DropRender,
  type Json,
} from "@tadayo/domain";
import type { FastifyRequest } from "fastify";
import { created, IDEMPOTENCY_KEY, problem, refusal } from "../answers.ts";
import { allowanceBody, occurrenceBody, starBody } from "../bodies.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/**
 * The contract's `DropReceipt`: the caller's own drop, the day it is in, its kind, state and version, the caller's
 * own allowance and highlight in that day (T15, T20, T22). No caption, upload or URL (TECH-DESIGN section 6).
 */
export function dropReceiptBody(receipt: DropReceiptAnswer): Json {
  return {
    drop_id: receipt.dropId,
    occurrence: occurrenceBody(receipt.occurrence),
    media_class: receipt.mediaClass,
    state: "added",
    version: receipt.version,
    allowance: allowanceBody(receipt.allowance),
    highlight: {
      ...(receipt.highlight.dropId === null ? {} : { drop_id: receipt.highlight.dropId }),
      version: receipt.highlight.version,
    },
  };
}

/** The commit's answers: the receipt, and its day's star alone, which a replay names as members see them now (FQ139). */
export const dropRender: DropRender = { receipt: dropReceiptBody, star: starBody };

/** The path's `name`, or "" when it has none, which no command takes for an id. */
function pathParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Readonly<Record<string, unknown>> | null)?.[name];
  return typeof value === "string" ? value : "";
}

/** The request's first bad field by the contract's schema, by name. */
function badField(issues: readonly { readonly path: readonly PropertyKey[] }[]): string | undefined {
  const named = issues.map((issue) => issue.path[0]).find((field) => typeof field === "string");
  return typeof named === "string" ? named : undefined;
}

export function createDropHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = CreateDropRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = badField(parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const { reservation_id: reservationId, media, caption } = parsed.data;
    const input: CreateDropInput = {
      userId: account.id,
      key,
      occurrenceId: pathParam(request, "occurrence_id"),
      reservationId,
      media:
        media.kind === "photo"
          ? { kind: "photo", uploadId: media.upload_id }
          : { kind: "external_video", sourceId: media.source_id },
      caption,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => createDrop(tx, deps.clock, input, dropRender));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return created(reply, response);
  };
}
