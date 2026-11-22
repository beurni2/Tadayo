// The API's Storage client against a fake fetch (docs/plans/api-b2-spike-uploads.md, section 3; T12, T52, T56):
// the sign call's path, method and headers, with the service key and upsert never turned on; the full URL;
// the token believed only for its own object with upsert off in it, and its lifetime read from it; Storage's
// Duplicate, for an object already there, read as no URL to give; the object check, read from Storage's own
// status and a body that is an object's; and nothing it holds in any error it throws. The probe reads tokens by the same rule, tested on the same tokens (tools/ops/src/supabase-probe.test.ts).

import { describe, expect, it } from "vitest";
import { signedLifetime, StorageUnavailable, supabaseStorage, type UploadStorage } from "./storage.ts";

const PROJECT = "https://tadayotestprojectref.supabase.co";
const KEY = "sb_secret_testkeynotreal0000000000";
const OBJECT = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(payload)}.c2lnbmF0dXJl`;
}
const TOKEN = jwt({ url: `uploads/${OBJECT}`, iat: 1_794_000_000, exp: 1_794_007_200, upsert: false });

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
  readonly redirect: string | undefined;
}

function fakeFetch(answer: (seen: Seen) => Response | Promise<Response>): { fetch: typeof fetch; seen: Seen[] } {
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
      body: typeof init?.body === "string" ? init.body : undefined,
      redirect: init?.redirect,
    };
    seen.push(one);
    return answer(one);
  }) as typeof fetch;
  return { fetch: fake, seen };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function storage(answer: (seen: Seen) => Response | Promise<Response>): { s: UploadStorage; seen: Seen[] } {
  const { fetch, seen } = fakeFetch(answer);
  return { s: supabaseStorage({ projectUrl: PROJECT, serviceKey: KEY, fetch }), seen };
}

/** Every text an error carries, so a test can say none of it holds what the client was given. */
async function failure(running: Promise<unknown>): Promise<string> {
  try {
    await running;
  } catch (error) {
    expect(error).toBeInstanceOf(StorageUnavailable);
    const e = error as Error;
    return `${e.name} ${e.message} ${e.stack ?? ""} ${JSON.stringify(e)}`;
  }
  throw new Error("expected a failure");
}

describe("signing an upload URL (T12)", () => {
  it("asks for one object in uploads with the service key, never turning upsert on", async () => {
    const { s, seen } = storage(() =>
      json(200, { url: `/object/upload/sign/uploads/${OBJECT}?token=${TOKEN}`, token: TOKEN }),
    );
    const signed = await s.signUpload(OBJECT);
    expect(seen).toHaveLength(1);
    const call = seen[0];
    expect(call?.url).toBe(`${PROJECT}/storage/v1/object/upload/sign/uploads/${OBJECT}`);
    expect(call?.method).toBe("POST");
    expect(call?.headers["apikey"]).toBe(KEY);
    expect(call?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(call?.headers["x-upsert"]).toBeUndefined();
    expect(call?.headers["user-agent"]).toBeUndefined();
    expect(call?.body).toBe("{}");
    expect(call?.redirect).toBe("error");
    expect(signed).toEqual({
      url: `${PROJECT}/storage/v1/object/upload/sign/uploads/${OBJECT}?token=${encodeURIComponent(TOKEN)}`,
      lifetimeSeconds: 7200,
    });
    expect(Object.keys(signed ?? {}).sort()).toEqual(["lifetimeSeconds", "url"]);
  });

  it("takes the token from the relative url when the answer has no token field", async () => {
    const { s } = storage(() => json(200, { url: `/object/upload/sign/uploads/${OBJECT}?token=${TOKEN}` }));
    expect((await s.signUpload(OBJECT))?.url).toBe(
      `${PROJECT}/storage/v1/object/upload/sign/uploads/${OBJECT}?token=${encodeURIComponent(TOKEN)}`,
    );
  });

  it("reads the lifetime from the token's own iat and exp, a minute to a day, and believes nothing else", () => {
    const claims = { url: `uploads/${OBJECT}`, upsert: false };
    expect(signedLifetime(TOKEN, OBJECT)).toBe(7200);
    expect(signedLifetime(jwt({ ...claims, iat: 100, exp: 160 }), OBJECT)).toBe(60);
    expect(signedLifetime(jwt({ ...claims, iat: 100, exp: 86_500 }), OBJECT)).toBe(86_400);
    for (const token of [
      jwt({ ...claims, iat: 100, exp: 159 }),
      jwt({ ...claims, iat: 100, exp: 86_501 }),
      jwt({ ...claims, iat: 100 }),
      jwt({ ...claims, exp: 7300 }),
      jwt({ ...claims, iat: "100", exp: 7300 }),
      jwt({ ...claims, iat: 100.5, exp: 7300 }),
      "not-a-jwt",
      "a.b",
      "a.!!.c",
      `${TOKEN}.extra`,
      // Padding and the other alphabet's characters aren't plain base64url.
      TOKEN.replace(/\.([^.]+)\./, (_, payload: string) => `.${payload}==.`),
      TOKEN.replace(/\.([^.]+)\./, (_, payload: string) => `.${payload.replaceAll("-", "+").replaceAll("_", "/")}+/.`),
    ]) {
      expect(signedLifetime(token, OBJECT), token).toBeUndefined();
    }
  });

  it("believes a token only for the object it asked for, with upsert off in the token, where Storage reads it (T12)", () => {
    const lifetime = { iat: 1_794_000_000, exp: 1_794_007_200 };
    const other = "ZyXwVuTsRqPoNmLkJiHgFeDcBa543210";
    expect(signedLifetime(jwt({ url: `uploads/${OBJECT}`, upsert: false, ...lifetime }), OBJECT)).toBe(7200);
    for (const payload of [
      { url: `uploads/${OBJECT}`, upsert: true },
      { url: `uploads/${OBJECT}`, upsert: "false" },
      { url: `uploads/${OBJECT}`, upsert: 0 },
      { url: `uploads/${OBJECT}` },
      { url: `uploads/${other}`, upsert: false },
      { url: `renditions/${OBJECT}`, upsert: false },
      { url: `/uploads/${OBJECT}`, upsert: false },
      { url: `uploads/${OBJECT}/x`, upsert: false },
      { url: OBJECT, upsert: false },
      { upsert: false },
    ]) {
      expect(signedLifetime(jwt({ ...payload, ...lifetime }), OBJECT), JSON.stringify(payload)).toBeUndefined();
    }
  });

  it("fails, saying nothing it holds, when Storage signs a token with upsert on or for another object", async () => {
    const lifetime = { iat: 1_794_000_000, exp: 1_794_007_200 };
    for (const token of [
      jwt({ url: `uploads/${OBJECT}`, upsert: true, ...lifetime }),
      jwt({ url: "uploads/ZyXwVuTsRqPoNmLkJiHgFeDcBa543210", upsert: false, ...lifetime }),
    ]) {
      const { s } = storage(() => json(200, { url: `/object/upload/sign/uploads/${OBJECT}?token=${token}`, token }));
      const text = await failure(s.signUpload(OBJECT));
      for (const secret of [KEY, OBJECT, token, "tadayotestprojectref"]) expect(text).not.toContain(secret);
    }
  });

  it("reads Storage's Duplicate, the object already there, as no URL to give, and no other 409 or refusal as it", async () => {
    // Storage refuses to sign for an object that is there, upsert off, with HTTP 400 and its own 409 in the body.
    for (const answer of [
      () => json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" }),
      () => json(409, { statusCode: "409" }),
    ]) {
      const { s, seen } = storage(answer);
      expect(await s.signUpload(OBJECT)).toBeNull();
      expect(seen).toHaveLength(1);
    }
    // A 200 is no refusal, whatever its body says.
    const { s } = storage(() => json(200, { statusCode: "409", token: TOKEN }));
    const text = await failure(s.signUpload(OBJECT));
    for (const secret of [KEY, OBJECT, TOKEN, "tadayotestprojectref"]) expect(text).not.toContain(secret);
  });

  it("fails, saying nothing it holds, on a refusal, a token it can't read, or no answer", async () => {
    const answers: (() => Response | Promise<Response>)[] = [
      () => json(400, { statusCode: "403", code: "AccessDenied", message: "denied" }),
      () => json(200, { statusCode: "500" }),
      () => json(200, { url: "/object/upload/sign/uploads/x" }),
      () => json(200, { token: jwt({ url: `uploads/${OBJECT}`, upsert: false, iat: 1, exp: 2 }) }),
      () => new Response("not json", { status: 200 }),
      () => Promise.reject(new Error(`connect failed ${PROJECT}`)),
    ];
    for (const answer of answers) {
      const { s } = storage(answer);
      const text = await failure(s.signUpload(OBJECT));
      for (const secret of [KEY, OBJECT, TOKEN, "tadayotestprojectref"]) expect(text).not.toContain(secret);
    }
  });

  it("refuses an object key the server didn't make, before any call", async () => {
    const { s, seen } = storage(() => json(200, { token: TOKEN }));
    await expect(s.signUpload("../renditions/x")).rejects.toThrow(TypeError);
    expect(seen).toHaveLength(0);
  });
});

describe("whether an upload's bytes are in", () => {
  it("asks for the object's details in uploads with the service key", async () => {
    const { s, seen } = storage(() => json(200, { name: OBJECT, bucket_id: "uploads" }));
    expect(await s.objectThere(OBJECT)).toBe(true);
    expect(seen[0]?.url).toBe(`${PROJECT}/storage/v1/object/info/uploads/${OBJECT}`);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.headers["apikey"]).toBe(KEY);
  });

  it("reads Storage's own not-found from the body of its 400, and from a 404", async () => {
    for (const answer of [
      () => json(400, { statusCode: "404", code: "not_found", error: "Object not found" }),
      () => json(404, { statusCode: "404" }),
    ]) {
      const { s } = storage(answer);
      expect(await s.objectThere(OBJECT)).toBe(false);
    }
  });

  it("fails on any other answer, never reading it as missing, nor a 200 whose body isn't an object's as there", async () => {
    for (const answer of [
      () => json(400, { statusCode: "403", code: "AccessDenied" }),
      () => json(400, {}),
      () => json(500, {}),
      () => new Response(null, { status: 400 }),
      () => Promise.reject(new Error("timeout")),
      () => new Response("not json", { status: 200 }),
      () => new Response(null, { status: 200 }),
      () => json(200, null),
      () => json(200, []),
      () => json(200, "uploads"),
      () => json(200, { statusCode: "500" }),
    ]) {
      const { s } = storage(answer);
      const text = await failure(s.objectThere(OBJECT));
      for (const secret of [KEY, OBJECT]) expect(text).not.toContain(secret);
    }
  });
});

describe("its configuration (T56)", () => {
  it("takes only a project's URL and a key with no spaces", () => {
    expect(() => supabaseStorage({ projectUrl: "https://example.com", serviceKey: KEY })).toThrow(/SUPABASE_URL/);
    expect(() => supabaseStorage({ projectUrl: PROJECT, serviceKey: "" })).toThrow(/SUPABASE_SERVICE_KEY/);
    expect(() => supabaseStorage({ projectUrl: PROJECT, serviceKey: "two words" })).toThrow(/SUPABASE_SERVICE_KEY/);
  });
});
