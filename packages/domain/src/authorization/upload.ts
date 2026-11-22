/// <reference lib="esnext.temporal" />
// Whose an upload is (spec 32, 33; T9, T12, T14; docs/plans/api-b2-spike-uploads.md, section 0.6): the
// authorization module's rule for `getUpload`, `completeUpload` and a replay of `createUpload`
// (packages/domain/src/media/upload.ts). A command never states it again (T9).
//
// An upload is its owner's account's alone, and only while it lives: from its `expires_at` on it is nobody's,
// as an id nobody has (T14). It belongs to the account, not to a membership interval: its state and expiry
// say nothing about any day, and nothing reaches a day through it until the commit, which checks the
// reservation's interval and the day again (`ownsReservation`, ./add-target.ts). So an account that left its
// club still reads its own upload's state until it lapses, and can do nothing with it.

import type { ServerNow } from "../time/clock.ts";

/** What the rule reads of an upload: its owner, and when it lapses. */
export interface UploadOwnership {
  readonly owner: string;
  readonly expiresAt: Temporal.Instant;
}

/** Whether `upload` is the account `userId`'s own and still lives at `now`, the caller's sample. */
export function ownsUpload<U extends UploadOwnership>(upload: U | null, userId: string, now: ServerNow): upload is U {
  return upload !== null && upload.owner === userId && Temporal.Instant.compare(now, upload.expiresAt) < 0;
}
