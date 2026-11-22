/// <reference lib="esnext.temporal" />
// Starting an upload, reading it and completing it over HTTP (the contract's `createUpload`, `getUpload` and
// `completeUpload`; spec 32, 33; TECH-DESIGN sections 5 and 6; T9, T12, T14, T19, T52, T55;
// docs/plans/api-b2-spike-uploads.md). Who may, the locks, the clock and the receipt are the domain's
// (packages/domain/src/media/upload.ts); Storage is ./storage.ts's. A handler parses the request by the contract's
// own schema, runs the command in one transaction, and writes what comes back as an explicit field list (T55).
//
// The signed upload URL is signed here, after the transaction commits, and is never stored (T12; the plan's
// section 0.3): the receipt keeps the answer without it, and a replay signs a new one for the same object while
// the upload is pending. A signing that fails is a 503 with no body, and the upload stays pending, so a retry
// under the same key signs again.
//
// Only the drop's photo purpose is built (the plan's section 0.2). The other three answer as the skeleton
// answers an unbuilt route, the neutral not-found, until their stage: a replacement with B4's edits, an avatar
// with its commit and image route, a conversation photo with B6's photo replies.

import { CreateUploadRequest } from "@tadayo/contracts";
import {
  contractInstant,
  createDropPhotoUpload,
  markPreparing,
  readOwnUpload,
  Refused,
  type Json,
  type MadeUpload,
  type OwnUpload,
  type ServerNow,
  type UploadAnswer,
} from "@tadayo/domain";
import type { FastifyRequest } from "fastify";
import { accepted, created, IDEMPOTENCY_KEY, ok, problem, refusal, unavailable } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";
import { profileFinished } from "../session.ts";
import { StorageUnavailable, type SignedPut } from "./storage.ts";

/** The contract's UploadStatus, and `Upload` without its URL: the caller's own upload, never a URL (T12). */
export function uploadBody(upload: UploadAnswer): Json {
  return {
    id: upload.id,
    purpose: upload.purpose,
    state: upload.state,
    ...(upload.state === "rejected" && upload.rejection !== null ? { rejection: upload.rejection } : {}),
    expires_at: contractInstant(upload.expiresAt),
  };
}

/**
 * The contract's SignedUpload: the one storage URL a client ever gets, for its own pending upload (T12). It is
 * good for Storage's own lifetime from the clock's sample, in the server's time (./storage.ts), and never later.
 */
export function signedUploadBody(signed: SignedPut, at: ServerNow): Json {
  return {
    url: signed.url,
    method: "PUT",
    headers: { ...signed.headers },
    expires_at: contractInstant(at.add({ seconds: signed.lifetimeSeconds })),
  };
}

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

export function createUploadHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = CreateUploadRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = badField(parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const body = parsed.data;
    // Only an avatar's upload works before the profile is finished (the contract); the gate let this route by.
    if (body.purpose !== "avatar" && !profileFinished(account)) return problem(reply, "PROFILE_INCOMPLETE");
    if (body.purpose !== "drop_photo") return problem(reply, "NOT_FOUND");
    let made: MadeUpload;
    try {
      made = await deps.sql.begin((tx) =>
        createDropPhotoUpload(
          tx,
          deps.clock,
          {
            userId: account.id,
            key,
            reservationId: body.reservation_id,
            contentType: body.content_type,
            byteSize: body.byte_size,
          },
          uploadBody,
        ),
      );
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    if (made.toSign === null) return created(reply, made.body);
    let signed: SignedPut;
    try {
      signed = await deps.storage.signUpload(made.toSign.objectKey, body.content_type);
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        request.log.warn({ err: error }, "storage unavailable");
        return unavailable(reply);
      }
      throw error;
    }
    return created(reply, {
      ...(made.body as Record<string, Json>),
      signed_upload: signedUploadBody(signed, made.toSign.at),
    });
  };
}

export function getUploadHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const input = { userId: account.id, uploadId: pathParam(request, "upload_id") };
    let own: OwnUpload;
    try {
      own = await deps.sql.begin("read only", async (tx) => readOwnUpload(tx, input, await deps.clock.sample(tx)));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, uploadBody(own.answer));
  };
}

export function completeUploadHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const input = { userId: account.id, uploadId: pathParam(request, "upload_id") };
    let own: OwnUpload;
    try {
      own = await deps.sql.begin("read only", async (tx) => readOwnUpload(tx, input, await deps.clock.sample(tx)));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    if (own.answer.state === "pending") {
      // The bytes first, before any lock: a missing object changes nothing.
      let there: boolean;
      try {
        there = await deps.storage.objectThere(own.objectKey);
      } catch (error) {
        if (error instanceof StorageUnavailable) {
          request.log.warn({ err: error }, "storage unavailable");
          return unavailable(reply);
        }
        throw error;
      }
      if (!there) return problem(reply, "MEDIA_NOT_READY");
    }
    let answer: UploadAnswer;
    try {
      answer = await deps.sql.begin((tx) => markPreparing(tx, deps.clock, input));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return accepted(reply, uploadBody(answer));
  };
}
