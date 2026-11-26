/// <reference lib="esnext.temporal" />
// An upload's object in Storage, and how long an upload lives (spec 33; TECH-DESIGN sections 5 and 6; T12, T21;
// docs/plans/api-b2-spike-uploads.md, sections 0.4 and 0.6).

import { randomBytes } from "node:crypto";

import type { ServerNow } from "../time/clock.ts";

/** How long an upload lives from its intent, then counts as gone (the contract's examples; FQ15). */
export const UPLOAD_HOURS = 24;

/** An object key as `newObjectKey` makes it: 32 characters of base64url. */
export const OBJECT_KEY = /^[A-Za-z0-9_-]{32}$/;

/**
 * A new object key: 24 random bytes in base64url, 32 characters. Never derived from the account, the day or the
 * bytes, so it says nothing of whose it is or what it holds (T12, T21); it leaves the server only inside the
 * signed upload URL of its own pending upload.
 */
export function newObjectKey(): string {
  return randomBytes(24).toString("base64url");
}

/** When an upload made at `at` lapses: 24 hours on. */
export function uploadExpiry(at: ServerNow): Temporal.Instant {
  return at.add({ hours: UPLOAD_HOURS });
}
