// `storage-setup` against a made-up Supabase project (test/fake-supabase.ts): the two buckets, as
// the plan declares them, made once and left alone, never touching an object (T12, T53).

import { describe, expect, it } from "vitest";
import { FAKE_PUBLISHABLE, FAKE_SECRET, FAKE_URL, fakeSupabase, type Fake } from "../test/fake-supabase.ts";
import { OpsError } from "./ops-error.ts";
import { ALLOWED_TYPES, BUCKETS, FILE_SIZE_LIMIT, storageSetup } from "./storage-setup.ts";

async function run(fake: Fake) {
  const said: string[] = [];
  await storageSetup({ fetch: fake.fetch, url: FAKE_URL, serviceKey: FAKE_SECRET, say: (line) => said.push(line) });
  return said;
}

const writes = (fake: Fake) => fake.calls.filter((call) => call.method !== "GET");

describe("storageSetup", () => {
  it("declares D09's limit and the three image types, in numbers a reader can check", () => {
    expect(BUCKETS).toEqual(["uploads", "renditions"]);
    // 20 MiB, in bytes: Supabase reads a string like "20MB" as decimal, so the limit is sent as an integer.
    expect(FILE_SIZE_LIMIT).toBe(20 * 1024 * 1024);
    expect(FILE_SIZE_LIMIT).toBe(20_971_520);
    expect(ALLOWED_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("makes both buckets when they're missing: private, with the limit and the types", async () => {
    const fake = fakeSupabase();
    const said = await run(fake);
    expect([...fake.buckets.keys()].sort()).toEqual(["renditions", "uploads"]);
    for (const bucket of fake.buckets.values()) {
      expect(bucket.public).toBe(false);
      expect(bucket.file_size_limit).toBe(FILE_SIZE_LIMIT);
      expect(bucket.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp"]);
    }
    expect(said).toEqual(["storage-setup: uploads: created", "storage-setup: renditions: created"]);
  });

  it("makes nothing when they're as declared, and a second run writes nothing at all", async () => {
    const fake = fakeSupabase();
    await run(fake);
    fake.calls.length = 0;
    const said = await run(fake);
    expect(writes(fake)).toEqual([]);
    expect(said).toEqual([
      "storage-setup: uploads: already as declared",
      "storage-setup: renditions: already as declared",
    ]);
  });

  it("makes a bucket private again, and sets its limit and types, when it was made another way, and says what it changed", async () => {
    const fake = fakeSupabase({
      buckets: [
        { name: "uploads", public: true, file_size_limit: 50_000_000, allowed_mime_types: null },
        { name: "renditions", file_size_limit: FILE_SIZE_LIMIT, allowed_mime_types: ["image/png", "image/gif"] },
      ],
    });
    const said = await run(fake);
    expect(said[0]).toBe(
      "storage-setup: uploads: changed: it was public; its size limit was 50000000 bytes; it allowed any type",
    );
    expect(said[1]).toBe("storage-setup: renditions: changed: it allowed other types");
    for (const bucket of fake.buckets.values()) {
      expect(bucket.public).toBe(false);
      expect(bucket.file_size_limit).toBe(FILE_SIZE_LIMIT);
      expect([...(bucket.allowed_mime_types ?? [])].sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    }
  });

  it("takes the types in any order as the same", async () => {
    const fake = fakeSupabase({
      buckets: [
        {
          name: "uploads",
          file_size_limit: FILE_SIZE_LIMIT,
          allowed_mime_types: ["image/webp", "image/jpeg", "image/png"],
        },
        {
          name: "renditions",
          file_size_limit: FILE_SIZE_LIMIT,
          allowed_mime_types: ["image/png", "image/webp", "image/jpeg"],
        },
      ],
    });
    const said = await run(fake);
    expect(said).toEqual([
      "storage-setup: uploads: already as declared",
      "storage-setup: renditions: already as declared",
    ]);
    expect(writes(fake)).toEqual([]);
  });

  it("touches only the buckets' own routes, as the service key: never an object, never a delete", async () => {
    const fake = fakeSupabase({ buckets: [{ name: "uploads", public: true }] });
    fake.objects.set("uploads/probe/a.png", new Uint8Array([1]));
    await run(fake);
    for (const call of fake.calls) {
      expect(call.path, `${call.method} ${call.path}`).toMatch(/^\/storage\/v1\/bucket(\/[a-z]+)?$/);
      expect(call.method).not.toBe("DELETE");
      expect(call.who).toBe("service");
    }
    expect([...fake.objects.keys()]).toEqual(["uploads/probe/a.png"]);
  });

  it("treats a bucket that appears between the look and the make as there, and goes on to make it as declared", async () => {
    const fake = fakeSupabase();
    const inner = fake.fetch;
    let raced = false;
    // The first look at `uploads` finds nothing; then someone makes it public before the make.
    const racing = (async (input: string | URL | Request, init?: RequestInit) => {
      const response = await inner(input, init);
      const request = new Request(input, init);
      if (!raced && request.method === "GET" && request.url.endsWith("/storage/v1/bucket/uploads")) {
        raced = true;
        fake.buckets.set("uploads", {
          id: "uploads",
          name: "uploads",
          owner: "",
          public: true,
          created_at: "x",
          updated_at: "x",
          file_size_limit: null,
          allowed_mime_types: null,
        });
      }
      return response;
    }) as typeof fetch;
    const said: string[] = [];
    await storageSetup({ fetch: racing, url: FAKE_URL, serviceKey: FAKE_SECRET, say: (line) => said.push(line) });
    expect(fake.buckets.get("uploads")?.public).toBe(false);
    expect(said[0]).toMatch(/^storage-setup: uploads: changed: it was public/);
  });

  it("stops, naming the bucket and what the project answered, when the service key is refused", async () => {
    const fake = fakeSupabase({ serviceKeyRefused: true });
    const error = await run(fake).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(OpsError);
    const message = error instanceof Error ? error.message : "";
    expect(message).toMatch(/uploads/);
    expect(message).toMatch(/HTTP 401/);
    expect(message).not.toContain(FAKE_SECRET);
    expect(fake.buckets.size).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });

  it("doesn't take a server error for a missing bucket: it makes nothing", async () => {
    const fake = fakeSupabase({ failing: "GET /storage/v1/bucket/uploads" });
    await expect(run(fake)).rejects.toThrow(/uploads.*HTTP 500/);
    expect(fake.buckets.size).toBe(0);
    expect(writes(fake)).toEqual([]);
  });

  it("says what it couldn't do, naming the bucket and the project's status, when the make or the update fails", async () => {
    const make = fakeSupabase({ failing: "POST /storage/v1/bucket" });
    await expect(run(make)).rejects.toThrow(/^storage-setup: uploads: couldn't make it: HTTP 500$/);
    expect(make.buckets.size).toBe(0);
    const set = fakeSupabase({
      buckets: [{ name: "uploads", public: true }],
      failing: "PUT /storage/v1/bucket/uploads",
    });
    await expect(run(set)).rejects.toThrow(/^storage-setup: uploads: couldn't set it: HTTP 500$/);
    expect(set.buckets.get("uploads")?.public).toBe(true);
  });

  it("fails when a bucket isn't there after the project said it made it, rather than say it is made", async () => {
    const fake = fakeSupabase();
    const inner = fake.fetch;
    // A project that answers the make with success and makes nothing.
    const forgetful = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === "POST" && request.url.endsWith("/storage/v1/bucket")) {
        return new Response(JSON.stringify({ name: "uploads" }), { status: 200 });
      }
      return inner(input, init);
    }) as typeof fetch;
    await expect(
      storageSetup({ fetch: forgetful, url: FAKE_URL, serviceKey: FAKE_SECRET, say: () => undefined }),
    ).rejects.toThrow(/^storage-setup: uploads: it isn't there after it was made$/);
  });

  it("fails when a bucket still isn't as declared after the update, rather than say it is", async () => {
    const fake = fakeSupabase({ buckets: [{ name: "uploads", public: true }] });
    const inner = fake.fetch;
    // A server that ignores `public: false`.
    const stubborn = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method === "PUT" && request.url.endsWith("/storage/v1/bucket/uploads")) {
        return new Response(JSON.stringify({ message: "Successfully updated" }), { status: 200 });
      }
      return inner(input, init);
    }) as typeof fetch;
    await expect(
      storageSetup({ fetch: stubborn, url: FAKE_URL, serviceKey: FAKE_SECRET, say: () => undefined }),
    ).rejects.toThrow(/uploads isn't as declared after the update: it is public/);
  });

  it("sends the service key and never the public one, and prints neither", async () => {
    const fake = fakeSupabase();
    const said = await run(fake);
    expect(JSON.stringify(said)).not.toContain(FAKE_SECRET);
    expect(JSON.stringify(said)).not.toContain(FAKE_PUBLISHABLE);
    expect(new Set(fake.calls.map((call) => call.who))).toEqual(new Set(["service"]));
  });
});
