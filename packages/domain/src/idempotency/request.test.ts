import { describe, expect, it } from "vitest";
import { replayOutcome, requestHash, type IdempotentRequest } from "./request.ts";

// removeDrop as the contract has it: DELETE /v1/drops/{drop_id}?reason=withdraw, with no body.
const withdraw: IdempotentRequest = {
  operation: "removeDrop",
  path: { drop_id: "drp_ben_1" },
  query: { reason: "withdraw" },
  body: null,
};

describe("T19: the same key is the same request, or a conflict", () => {
  it("replays the same operation, path, query and body", () => {
    expect(replayOutcome(requestHash(withdraw), { ...withdraw })).toBe("replay");
  });

  it("is a conflict on another drop of the same operation (review finding p2 of PR #14)", () => {
    expect(replayOutcome(requestHash(withdraw), { ...withdraw, path: { drop_id: "drp_ben_2" } })).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("is a conflict with another reason in the query", () => {
    expect(replayOutcome(requestHash(withdraw), { ...withdraw, query: { reason: "pictured" } })).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("is a conflict with a query parameter added, another operation, or a body added", () => {
    const stored = requestHash(withdraw);
    expect(replayOutcome(stored, { ...withdraw, query: { reason: "withdraw", as: "author" } })).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(replayOutcome(stored, { ...withdraw, operation: "updateDrop" })).toBe("IDEMPOTENCY_CONFLICT");
    expect(replayOutcome(stored, { ...withdraw, body: {} })).toBe("IDEMPOTENCY_CONFLICT");
    expect(replayOutcome(stored, { ...withdraw, body: { note: null } })).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("tells the parts apart, so a value can't move from one to another", () => {
    const inPath: IdempotentRequest = { operation: "op", path: { id: "a" }, query: {}, body: null };
    const inQuery: IdempotentRequest = { operation: "op", path: {}, query: { id: "a" }, body: null };
    const inBody: IdempotentRequest = { operation: "op", path: {}, query: {}, body: { id: "a" } };
    expect(new Set([requestHash(inPath), requestHash(inQuery), requestHash(inBody)]).size).toBe(3);
  });

  it("reads the request as parsed: keys in another order are the same request", () => {
    const a: IdempotentRequest = {
      operation: "createDrop",
      path: { occurrence_id: "occ_1" },
      query: {},
      body: { caption: "x", media: { kind: "photo", upload_id: "upl_1" } },
    };
    const b: IdempotentRequest = {
      operation: "createDrop",
      path: { occurrence_id: "occ_1" },
      query: {},
      body: { media: { upload_id: "upl_1", kind: "photo" }, caption: "x" },
    };
    expect(requestHash(a)).toBe(requestHash(b));
  });

  it("keeps an array's order and a repeated query parameter's order", () => {
    const one: IdempotentRequest = { operation: "op", path: {}, query: { m: ["a", "b"] }, body: [1, 2] };
    expect(requestHash(one)).not.toBe(requestHash({ ...one, query: { m: ["b", "a"] } }));
    expect(requestHash(one)).not.toBe(requestHash({ ...one, body: [2, 1] }));
  });

  it("tells a string from a number, and an empty body from none", () => {
    const base: IdempotentRequest = { operation: "op", path: {}, query: {}, body: { v: 1 } };
    expect(requestHash(base)).not.toBe(requestHash({ ...base, body: { v: "1" } }));
    expect(requestHash({ ...base, body: {} })).not.toBe(requestHash({ ...base, body: null }));
  });

  it("is SHA-256 in lower-case hex", () => {
    expect(requestHash(withdraw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses what JSON can't carry instead of hashing it as something else", () => {
    const bad = (body: unknown): IdempotentRequest => ({ operation: "op", path: {}, query: {}, body: body as never });
    expect(() => requestHash(bad({ v: Number.NaN }))).toThrow(/NaN/);
    expect(() => requestHash(bad({ v: Number.POSITIVE_INFINITY }))).toThrow(/Infinity/);
    expect(() => requestHash(bad({ v: undefined }))).toThrow(/undefined/);
    expect(() => requestHash(bad({ v: 1n }))).toThrow(/bigint/);
  });
});
