/// <reference lib="esnext.temporal" />
// Whose an upload is, on its own (./upload.ts; spec 33; T9, T12, T14): its owner's until a microsecond before
// its expires_at, and nobody's at it or after, nor anyone else's ever. The same rule runs on real rows in
// tests/src/db/uploads.test.ts.

import { describe, expect, it } from "vitest";
import type { ServerNow } from "../time/clock.ts";
import { ownsUpload, type UploadOwnership } from "./upload.ts";

const serverNow = (instant: Temporal.Instant) => instant as ServerNow;
const EXPIRES = Temporal.Instant.from("2026-11-07T21:00:00.123456Z");
const BENS: UploadOwnership = { owner: "usr_ben", expiresAt: EXPIRES };

describe("whose an upload is (ownsUpload; T9, T12, T14)", () => {
  it("is its owner's until its expires_at, and nobody's from it on", () => {
    expect(ownsUpload(BENS, "usr_ben", serverNow(EXPIRES.subtract({ hours: 24 })))).toBe(true);
    expect(ownsUpload(BENS, "usr_ben", serverNow(EXPIRES.subtract({ microseconds: 1 })))).toBe(true);
    expect(ownsUpload(BENS, "usr_ben", serverNow(EXPIRES))).toBe(false);
    expect(ownsUpload(BENS, "usr_ben", serverNow(EXPIRES.add({ microseconds: 1 })))).toBe(false);
  });

  it("is never another account's, and an upload nobody has is nobody's", () => {
    const early = serverNow(EXPIRES.subtract({ hours: 1 }));
    for (const other of ["usr_cleo", "usr_ben2", "USR_BEN", ""]) expect(ownsUpload(BENS, other, early)).toBe(false);
    expect(ownsUpload(null, "usr_ben", early)).toBe(false);
  });
});
