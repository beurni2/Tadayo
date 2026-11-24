/// <reference lib="esnext.temporal" />
// A sign-in's name and a token's key (./devices.ts), with no database: the commands themselves run on Postgres
// in tests/src/db/devices.test.ts.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apnsTokenOf, ENDED_KEEP, PURGE_BATCH, signInOf } from "./devices.ts";

describe("a sign-in's name: the SHA-256 of its removal secret (TECH-DESIGN section 6 (a))", () => {
  it("is the secret's SHA-256 in hex, the same for the same secret and new for a new one", () => {
    const secret = "Ab0_-".repeat(9).slice(0, 43);
    expect(signInOf(secret)).toBe(createHash("sha256").update(secret, "ascii").digest("hex"));
    expect(signInOf(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(signInOf(`${secret}x`)).not.toBe(signInOf(secret));
    expect(signInOf("a".repeat(128))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes only the contract's secret: base64url, 43 to 128 characters", () => {
    for (const secret of [
      "a".repeat(42),
      "a".repeat(129),
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)}+`,
      `${"a".repeat(42)}/`,
      "",
    ]) {
      expect(() => signInOf(secret), secret).toThrow(TypeError);
    }
    expect(() => signInOf(7 as unknown as string)).toThrow(TypeError);
  });
});

describe("a token's key: lowercase hex, so one device is one key whatever its case (T52)", () => {
  it("lowercases the contract's token, and keeps its length", () => {
    expect(apnsTokenOf("AB".repeat(32))).toBe("ab".repeat(32));
    expect(apnsTokenOf("0f".repeat(8))).toBe("0f".repeat(8));
    expect(apnsTokenOf("C".repeat(512))).toBe("c".repeat(512));
  });

  it("takes only hex of 16 to 512 characters", () => {
    for (const token of ["a".repeat(15), "a".repeat(513), `${"a".repeat(15)}g`, `${"a".repeat(16)} `, ""]) {
      expect(() => apnsTokenOf(token), token).toThrow(TypeError);
    }
    expect(() => apnsTokenOf(null as unknown as string)).toThrow(TypeError);
  });
});

describe("the ended sign-ins' keep", () => {
  it("is 8 days, past the week an access token lives, and a purge takes at most 100 rows", () => {
    expect(ENDED_KEEP.total({ unit: "hours" })).toBe(192);
    expect(PURGE_BATCH).toBe(100);
  });
});
