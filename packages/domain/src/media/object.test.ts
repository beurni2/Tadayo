/// <reference lib="esnext.temporal" />
// An upload's object key and its life (docs/plans/api-b2-spike-uploads.md, sections 0.4, 0.6 and 3).

import { describe, expect, it } from "vitest";
import { newObjectKey, OBJECT_KEY, UPLOAD_HOURS, uploadExpiry } from "./object.ts";

describe("an upload's object key (T12, T21)", () => {
  it("is 32 characters of base64url, 24 random bytes, a new one every time", () => {
    const keys = Array.from({ length: 200 }, () => newObjectKey());
    for (const key of keys) {
      expect(key).toMatch(OBJECT_KEY);
      expect(Buffer.from(key, "base64url")).toHaveLength(24);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("an upload's life", () => {
  it("ends 24 hours after its intent, to the microsecond", () => {
    expect(UPLOAD_HOURS).toBe(24);
    expect(uploadExpiry(Temporal.Instant.from("2026-11-06T21:00:00.123456Z")).toString()).toBe(
      "2026-11-07T21:00:00.123456Z",
    );
  });
});
