// The worker's Storage client against a fake fetch (docs/plans/api-b2-spike-prepare.md section 5; T12, T52, T56):
// each call's path, method and headers, with the service key; the original read from the private bucket and cut
// off past 20 MiB; Storage's own not-found of the object (NoSuchKey) read as no object, and any other 404 as Storage
// away (the outside audit's B1); a rendition put with upsert on; and nothing it holds in any error it throws.

import { describe, expect, it } from "vitest";
import { renditionKey, StorageUnavailable, workerStorage, type WorkerStorage } from "./storage.ts";

const PROJECT = "https://tadayotestprojectref.supabase.co";
const KEY = "sb_secret_testkeynotreal0000000000";
const OBJECT = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const MiB = 1024 * 1024;

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array | undefined;
  readonly redirect: string | undefined;
  readonly signal: AbortSignal | undefined;
}

function storage(answer: (seen: Seen) => Response | Promise<Response>): { s: WorkerStorage; seen: Seen[] } {
  const seen: Seen[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name] = value;
    });
    const one: Seen = {
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? "GET",
      headers,
      body: init?.body instanceof Uint8Array ? init.body : undefined,
      redirect: init?.redirect,
      signal: init?.signal ?? undefined,
    };
    seen.push(one);
    return answer(one);
  }) as typeof fetch;
  return { s: workerStorage({ projectUrl: PROJECT, serviceKey: KEY, fetch: fake }), seen };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Every text an error carries, so a test can say none of it holds what the client was given. */
async function failure(running: Promise<unknown>): Promise<string> {
  try {
    await running;
  } catch (error) {
    expect(error).toBeInstanceOf(StorageUnavailable);
    const e = error as Error & { cause?: unknown; code?: unknown };
    expect(e.code).toBe("storage.unavailable");
    const cause =
      e.cause instanceof Error ? [e.cause.message, e.cause.stack ?? ""].join("\n") : JSON.stringify(e.cause ?? null);
    return [e.message, e.stack ?? "", cause].join("\n");
  }
  throw new Error("expected the call to fail");
}

describe("reading an original", () => {
  it("asks for the one object in uploads with the service key, refusing redirects, with a time limit", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const { s, seen } = storage(() => new Response(bytes, { status: 200 }));
    expect(Array.from((await s.readOriginal(OBJECT)) ?? [])).toEqual(Array.from(bytes));
    expect(seen).toHaveLength(1);
    const [one] = seen;
    expect(one?.url).toBe(`${PROJECT}/storage/v1/object/authenticated/uploads/${OBJECT}`);
    expect(one?.method).toBe("GET");
    expect(one?.headers["apikey"]).toBe(KEY);
    expect(one?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(one?.headers["user-agent"]).toBeUndefined();
    expect(one?.redirect).toBe("error");
    expect(one?.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives no object only for Storage's own not-found of the object, NoSuchKey, as Storage sends it", async () => {
    // Storage's sources: ERRORS.NoSuchKey, rendered with HTTP 400 and the status in the body (supabase/storage).
    const own = { statusCode: "404", code: "NoSuchKey", error: "not_found", message: "Object not found" };
    expect(await storage(() => json(400, own)).s.readOriginal(OBJECT)).toBeNull();
    expect(await storage(() => json(404, own)).s.readOriginal(OBJECT)).toBeNull();
  });

  it("fails as Storage unavailable for any other 404: a plain one, one with no Storage body, a missing bucket, a lost object", async () => {
    for (const answer of [
      () => new Response("Not Found", { status: 404 }),
      () => json(404, { message: "Object not found" }),
      () => json(400, { statusCode: "404", error: "not_found" }),
      () =>
        json(400, { statusCode: "404", code: "NoSuchBucket", error: "Bucket not found", message: "Bucket not found" }),
      () => json(400, { statusCode: "404", code: "S3Error", error: "NotFound", message: "NotFound" }),
      () => json(400, { statusCode: "403", code: "NoSuchKey" }),
    ]) {
      const said = await failure(storage(answer).s.readOriginal(OBJECT));
      for (const held of [KEY, OBJECT, PROJECT, "tadayotestprojectref"]) expect(said).not.toContain(held);
    }
  });

  it("reads no further than 20 MiB and a byte, so a larger object is refused as too large, not held whole", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(MiB);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const read = await storage(() => new Response(endless, { status: 200 })).s.readOriginal(OBJECT);
    expect(read?.length).toBe(20 * MiB + 1);
    expect(pulled).toBeLessThanOrEqual(22);
  });

  it("gives exactly 20 MiB as it is", async () => {
    const whole = new Uint8Array(20 * MiB).fill(7);
    expect((await storage(() => new Response(whole, { status: 200 })).s.readOriginal(OBJECT))?.length).toBe(20 * MiB);
  });

  it("fails, saying nothing it holds, for any other answer or none", async () => {
    for (const answer of [
      () => json(400, { statusCode: "403", error: "Unauthorized" }),
      () => json(500, { statusCode: "500" }),
      () => new Response("<html>bad gateway</html>", { status: 502 }),
      () => json(400, { statusCode: "400", error: "Invalid" }),
      () => Promise.reject(new TypeError(`fetch failed for ${PROJECT} with ${KEY}`)),
    ]) {
      const said = await failure(storage(answer).s.readOriginal(OBJECT));
      for (const held of [KEY, OBJECT, PROJECT, "tadayotestprojectref"]) expect(said).not.toContain(held);
    }
  });

  it("fails, saying nothing, when the body breaks off", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error(`reset by ${PROJECT}`));
      },
    });
    const said = await failure(storage(() => new Response(broken, { status: 200 })).s.readOriginal(OBJECT));
    expect(said).not.toContain(PROJECT);
  });

  it("refuses a key that isn't one the server makes, before any call", async () => {
    const { s, seen } = storage(() => new Response(new Uint8Array(1)));
    await expect(s.readOriginal("../renditions/x")).rejects.toThrow(TypeError);
    await expect(s.readOriginal(`${OBJECT}/full`)).rejects.toThrow(TypeError);
    expect(seen).toHaveLength(0);
  });
});

describe("putting a rendition", () => {
  it("puts the JPEG at its key in renditions with upsert on, with the service key", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 9]);
    const { s, seen } = storage(() => json(200, { Key: `renditions/${OBJECT}/full`, Id: "x" }));
    await s.putRendition(renditionKey(OBJECT, "full"), bytes);
    const [one] = seen;
    expect(one?.url).toBe(`${PROJECT}/storage/v1/object/renditions/${OBJECT}/full`);
    expect(one?.method).toBe("POST");
    expect(one?.headers["content-type"]).toBe("image/jpeg");
    expect(one?.headers["x-upsert"]).toBe("true");
    expect(one?.headers["apikey"]).toBe(KEY);
    expect(one?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(one?.body).toEqual(bytes);
    expect(one?.redirect).toBe("error");
    expect(one?.signal).toBeInstanceOf(AbortSignal);
  });

  it("names each rendition from its upload's own object key and its kind", () => {
    expect(renditionKey(OBJECT, "display")).toBe(`${OBJECT}/display`);
    expect(renditionKey(OBJECT, "full")).toBe(`${OBJECT}/full`);
    expect(() => renditionKey("short", "full")).toThrow(TypeError);
  });

  it("fails, saying nothing it holds, for any answer but Storage's 200", async () => {
    for (const answer of [
      () => json(400, { statusCode: "409", error: "Duplicate" }),
      () => json(400, { statusCode: "413", error: "Payload too large" }),
      () => json(200, { statusCode: "500" }),
      () => Promise.reject(new Error(KEY)),
    ]) {
      const said = await failure(storage(answer).s.putRendition(renditionKey(OBJECT, "display"), new Uint8Array(4)));
      for (const held of [KEY, OBJECT, PROJECT]) expect(said).not.toContain(held);
    }
  });

  it("refuses a key that isn't a rendition's, before any call", async () => {
    const { s, seen } = storage(() => json(200, {}));
    await expect(s.putRendition(OBJECT, new Uint8Array(1))).rejects.toThrow(TypeError);
    await expect(s.putRendition(`${OBJECT}/thumbnail`, new Uint8Array(1))).rejects.toThrow(TypeError);
    await expect(s.putRendition(`../uploads/${OBJECT}`, new Uint8Array(1))).rejects.toThrow(TypeError);
    expect(seen).toHaveLength(0);
  });
});

describe("its settings", () => {
  it("refuses a project URL or a key that isn't one, naming neither", () => {
    expect(() => workerStorage({ projectUrl: "https://example.com", serviceKey: KEY })).toThrow(
      "worker: SUPABASE_URL isn't a project's URL",
    );
    expect(() => workerStorage({ projectUrl: PROJECT, serviceKey: "" })).toThrow(
      "worker: SUPABASE_SERVICE_KEY isn't a key",
    );
  });
});
