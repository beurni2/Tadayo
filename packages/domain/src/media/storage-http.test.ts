import { describe, expect, it } from "vitest";
import { storageProject, storageServiceKey, storageStatus } from "./storage-http.ts";

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
