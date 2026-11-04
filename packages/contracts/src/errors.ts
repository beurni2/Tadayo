// Every error the API returns: one body for all of them, a code, and the facts the app needs to
// reconcile without losing work (T4). No message: the app owns its copy (T41 to T43).
import * as z from "zod";

import { Allowance, Id, Occurrence, Version } from "./common.ts";
import { named } from "./registry.ts";

/** Each code with its HTTP status and what it means. Spec 32's codes, TECH-DESIGN section 6's, and four more. */
export const ERRORS = {
  INVALID_REQUEST: [400, "The request doesn't match the contract. `field` names the first bad field, never its value."],
  CAPTION_CONTAINS_SOURCE: [400, "The caption holds the drop's own link: move the link into the video drop (T13)."],
  PROVIDER_UNSUPPORTED: [400, "Not a link Tadayo can add, or its provider is switched off (spec 17, 33)."],
  UNAUTHENTICATED: [401, "No valid session: sign in again."],
  PROFILE_INCOMPLETE: [
    403,
    "The account hasn't confirmed it's 18 or older (FQ13) or has no name yet: finish `PATCH /v1/me` first. " +
      "Until then it can only finish setup or leave (FQ69).",
  ],
  NOT_ALLOWED: [
    403,
    "Something the caller can see but can't do now: reacting to their own drop (spec 16), confirming a " +
      "day that clashes with another member's choice (FQ55), or revoking or replacing a link the candidate " +
      "has accepted with (handoff 4).",
  ],
  NOT_FOUND: [
    404,
    "Missing, or not the caller's to see: the two are the same answer, and say nothing about hidden content (T14).",
  ],
  OCCURRENCE_CLOSED: [
    409,
    "The day's cutoff has passed (T3). `target` is the day asked for and `next_target` the same person's next " +
      "day, for the person to confirm; nothing was moved (T4).",
  ],
  QUOTA_FULL: [
    409,
    "Six drops already, live reservations included (T17). `target`, the caller's `allowance`, and " +
      "`next_target`, the same person's next day, for the person to confirm; nothing was moved (T4).",
  ],
  EXTERNAL_LIMIT: [
    409,
    "Two video links already (T17). `target`, the caller's `allowance`, and `next_target`, the same " +
      "person's next day, for the person to confirm; nothing was moved (T4).",
  ],
  MEDIA_NOT_READY: [409, "The upload isn't ready yet: wait for `GET /v1/uploads/{upload_id}` to say ready."],
  VERSION_CONFLICT: [409, "Someone changed it first. `current_version` is the version now."],
  MEMBERSHIP_CHANGED: [
    409,
    "A membership changed since the action started: the person's, so `target`, the day asked for, must be chosen again (T4, " +
      "spec 32); the club's, so a newer schedule proposal (`current_id`) replaced this one; or the clubs a " +
      "block would leave.",
  ],
  ROSTER_CHANGED: [
    409,
    "The roster revision was replaced by a newer one (`current_id`): review the new roster and decide again (T7).",
  ],
  CLUB_FULL: [409, "The club already has six members (A01, T6)."],
  DUPLICATE_DROP: [
    409,
    "The caller already added this photo or link to this day (T21). `existing_drop_id` is the caller's own " +
      "drop, to offer View existing.",
  ],
  IDEMPOTENCY_CONFLICT: [
    409,
    "The same Idempotency-Key came again for the same operation with a different path, query or body " +
      "(T19). A key is the caller's own, for one operation.",
  ],
  INVITATION_EXPIRED: [
    410,
    "The link expired before anyone used it (G02-expired, FQ71). A revoked link, or one another account has " +
      "used, is NOT_FOUND, like an unknown one (FQ59, T7).",
  ],
  RATE_LIMITED: [429, "Too many requests: try again after `retry_after_seconds`."],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCodeName = keyof typeof ERRORS;
export const ERROR_CODES = Object.keys(ERRORS) as [ErrorCodeName, ...ErrorCodeName[]];

export const ErrorCode = named(
  "ErrorCode",
  ERROR_CODES.map((code) => `${code} (${String(ERRORS[code][0])}): ${ERRORS[code][1]}`).join("\n"),
  z.enum(ERROR_CODES),
);

export const ApiError = named(
  "Error",
  "Every error's body. Only the fields its code names are present.",
  z.object({
    code: ErrorCode,
    field: z.string().min(1).max(200).optional(),
    target: Occurrence.optional(),
    next_target: Occurrence.optional(),
    allowance: Allowance.optional(),
    existing_drop_id: Id.optional(),
    current_version: Version.optional(),
    current_id: Id.optional(),
    retry_after_seconds: z.int().min(1).max(86_400).optional(),
  }),
);

export function statusOf(code: ErrorCodeName): number {
  return ERRORS[code][0];
}
