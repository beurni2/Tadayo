import { describe, expect, it } from "vitest";
import { storageNoSuchKey, storageProject, storageRefusal, storageServiceKey, storageStatus } from "./storage-http.ts";

const PROJECT = "https://abcdefghijklmnopqrst.supabase.co";

describe("the project's URL", () => {
  it("takes a project's URL, with or without its slash, and gives it without", () => {
    expect(storageProject(PROJECT, "worker")).toBe(PROJECT);
    expect(storageProject(`${PROJECT}/`, "api")).toBe(PROJECT);
  });

  it("refuses anything else, naming the setting and the process, never the value", () => {
    for (const value of [
      "",
      "http://abcdefghijklmnopqrst.supabase.co",
      "https://abcdefghijklmnopqrs.supabase.co",
      "https://abcdefghijklmnopqrst.supabase.co.example.com",
      "https://abcdefghijklmnopqrst.supabase.co/storage",
      "https://ABCDEFGHIJKLMNOPQRST.supabase.co",
    ]) {
      expect(() => storageProject(value, "worker")).toThrow(/^worker: SUPABASE_URL isn't a project's URL/);
      try {
        storageProject(value, "worker");
      } catch (error) {
        if (value !== "") expect((error as Error).message).not.toContain(value);
      }
    }
  });
});

describe("the service key", () => {
  it("takes a key as it is, and refuses an empty one or one with a space, never repeating it", () => {
    expect(storageServiceKey("sb_secret_abc", "worker")).toBe("sb_secret_abc");
    for (const value of ["", "sb_secret abc", "sb_secret_abc\n"]) {
      expect(() => storageServiceKey(value, "api")).toThrow("api: SUPABASE_SERVICE_KEY isn't a key");
    }
  });
});

describe("Storage's own status", () => {
  it("reads the body's statusCode, as a string or a number, over the HTTP status", () => {
    expect(storageStatus(400, { statusCode: "404", error: "not_found" })).toBe(404);
    expect(storageStatus(400, { statusCode: "409", error: "Duplicate" })).toBe(409);
    expect(storageStatus(400, { statusCode: 403 })).toBe(403);
  });

  it("falls back to the HTTP status for a body without one, or one that isn't three digits", () => {
    expect(storageStatus(200, { Key: "renditions/x" })).toBe(200);
    expect(storageStatus(502, undefined)).toBe(502);
    expect(storageStatus(400, { statusCode: "4040" })).toBe(400);
    expect(storageStatus(400, { statusCode: 4.5 })).toBe(400);
    expect(storageStatus(500, null)).toBe(500);
  });
});

// Storage's own answers, as its sources render them (`supabase/storage`, `src/internal/errors/codes.ts` and
// `storage-error.ts`, read on 2026-11-27): a body of `statusCode` as a string, `code`, `error` and `message`.
const NO_SUCH_KEY = { statusCode: "404", code: "NoSuchKey", error: "not_found", message: "Object not found" };

describe("Storage's own not-found of an object (the outside audit's B1)", () => {
  it("is NoSuchKey with its status 404 in the body, whatever the HTTP status", () => {
    expect(storageNoSuchKey(NO_SUCH_KEY)).toBe(true);
    expect(storageNoSuchKey({ statusCode: 404, code: "NoSuchKey" })).toBe(true);
  });

  it("is nothing else: another code, another status, no status in the body, or no body", () => {
    for (const json of [
      { statusCode: "404", code: "NoSuchBucket", error: "Bucket not found" },
      { statusCode: "500", code: "S3Error" },
      { statusCode: "403", code: "NoSuchKey" },
      { code: "NoSuchKey", message: "Object not found" },
      { statusCode: "404", error: "not_found" },
      { statusCode: "404", code: ["NoSuchKey"] },
      "NoSuchKey",
      null,
      undefined,
    ]) {
      expect(storageNoSuchKey(json)).toBe(false);
    }
  });
});

describe("Storage refusing the request itself (the outside audit's B1)", () => {
  it("is Storage's own body with a 4xx status but 408 and 429", () => {
    for (const json of [
      { statusCode: "413", code: "EntityTooLarge" },
      { statusCode: "415", code: "InvalidMimeType" },
      { statusCode: "400", code: "InvalidKey" },
      { statusCode: "403", code: "AccessDenied" },
      { statusCode: "400", code: "InvalidJWT" },
      { statusCode: "404", code: "NoSuchBucket" },
      { statusCode: 401, code: "InvalidJWT" },
      NO_SUCH_KEY,
    ]) {
      expect(storageRefusal(json)).toBe(true);
    }
  });

  it("is Storage away instead: a 408, a 429, a 5xx, the backend failing, a body with no code or no status, or no body", () => {
    for (const json of [
      { statusCode: "404", code: "S3Error", error: "NotFound" },
      { statusCode: "403", code: "S3Error", error: "AccessDenied" },
      { statusCode: "408", code: "RequestTimeout" },
      { statusCode: "429", code: "SlowDown" },
      { statusCode: "500", code: "InternalError" },
      { statusCode: "503", code: "S3Error" },
      { statusCode: "544", code: "DatabaseTimeout" },
      { statusCode: "403" },
      { code: "AccessDenied" },
      { statusCode: "403", code: "not a code" },
      "<html>Bad gateway</html>",
      null,
      undefined,
    ]) {
      expect(storageRefusal(json)).toBe(false);
    }
  });
});
