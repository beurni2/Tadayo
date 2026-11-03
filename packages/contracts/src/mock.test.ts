// The mock smoke test: Prism serves openapi.yaml as the ios lane will use it (TECH-DESIGN section 6). It
// proves the mock answers with the fixture scenes, with the headers the contract names, and refuses a
// request whose shape is wrong as the API does. The rules the document can't carry (grapheme counts, "only
// true") are the API's alone, named in their schemas' descriptions. It proves nothing about authorization,
// time or idempotency, which only the real API's tests can (T59).
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildDocument } from "./document.ts";
import { ApiError } from "./errors.ts";
import { OPERATIONS } from "./operations.ts";
import { registry } from "./registry.ts";
import { unknownKeys } from "./strict.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
let prism: ChildProcess | undefined;
let base = "";
let output = "";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("no port"));
      });
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  const child = spawn(
    `${root}node_modules/.bin/prism`,
    ["mock", "--host", "127.0.0.1", "--port", String(port), "openapi.yaml"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  prism = child;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Prism didn't start:\n${output}`));
    }, 45_000);
    const read = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes("Prism is listening")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Prism exited with ${String(code)}:\n${output}`));
    });
  });
});

afterAll(() => {
  prism?.kill();
});

const signedIn = { authorization: "Bearer a-mock-session" };
const document = buildDocument();

async function call(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; json: unknown; headers: Headers; type: string }> {
  const response = await fetch(base + path, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const type = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const json = text && type.startsWith("application/json") ? (JSON.parse(text) as unknown) : undefined;
  return { status: response.status, json, headers: response.headers, type };
}

function codeOf(json: unknown): string {
  const parsed = ApiError.safeParse(json);
  return parsed.success ? parsed.data.code : `not an error: ${JSON.stringify(json)}`;
}

describe("the Prism mock", () => {
  it("refuses a request without a session, and says no-store on the error too", async () => {
    const answer = await call("GET", "/v1/me");
    expect(answer.status).toBe(401);
    expect(codeOf(answer.json)).toBe("UNAUTHENTICATED");
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sends the contract's own header values: no-store on every answer, an ETag on every image", async () => {
    const me = await call("GET", "/v1/me", signedIn);
    expect(me.headers.get("cache-control")).toBe("private, no-store");
    const avatar = await call("GET", "/v1/me/avatar", { ...signedIn, accept: "image/jpeg" });
    expect(avatar.status).toBe(200);
    expect(avatar.type).toBe("image/jpeg");
    expect(avatar.headers.get("cache-control")).toBe("private, no-store");
    expect(avatar.headers.get("etag")).toBe('"mv_drp_sam_hill_1"');
  });

  it("answers an author preview with the link scene for the generated client's Accept order", async () => {
    const answer = await call("GET", "/v1/drops/drp_ben_13/author-preview", {
      ...signedIn,
      accept: "application/json, image/jpeg",
    });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ provider: "tiktok" });
  });

  it("refuses a name with a space at its end, as the API does (FQ70)", async () => {
    const answer = await call(
      "PATCH",
      "/v1/me",
      { ...signedIn, "idempotency-key": randomUUID() },
      { expected_version: 3, display_name: "Ben " },
    );
    expect(answer.status).toBe(400);
    expect(codeOf(answer.json)).toBe("INVALID_REQUEST");
  });

  it("answers with the default scene: Ben, in Sunday people", async () => {
    const answer = await call("GET", "/v1/me", signedIn);
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ display_name: "Ben" });
  });

  it("answers with the scene a `Prefer` header names", async () => {
    const answer = await call("GET", "/v1/clubs/club_sunday_people/home", { ...signedIn, prefer: "example=waiting" });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({ mode: "waiting" });
  });

  it("answers a public route without a session", async () => {
    const answer = await call("POST", "/v1/invitations/web-preview", {}, { token: "A".repeat(43) });
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ inviter_name: "Ben" });
  });

  it("answers a request it can't read with 400 INVALID_REQUEST, as the API does", async () => {
    const club = { name: "Kitchen table", timezone: "America/New_York" };
    const valid = await call("POST", "/v1/clubs", { ...signedIn, "idempotency-key": randomUUID() }, club);
    expect(valid.status, JSON.stringify(valid.json)).toBe(201);
    const noKey = await call("POST", "/v1/clubs", signedIn, club);
    expect(noKey.status).toBe(400);
    expect(codeOf(noKey.json)).toBe("INVALID_REQUEST");
    const unknownField = await call(
      "POST",
      "/v1/clubs",
      { ...signedIn, "idempotency-key": randomUUID() },
      { ...club, colour: "red" },
    );
    expect(unknownField.status).toBe(400);
    expect(codeOf(unknownField.json)).toBe("INVALID_REQUEST");
  });

  it("answers with an error scene a `Prefer` header names", async () => {
    const answer = await call(
      "POST",
      "/v1/occurrences/occ_sp_debby_2026_11_06/drops",
      { ...signedIn, "idempotency-key": randomUUID(), prefer: "code=409, example=OCCURRENCE_CLOSED" },
      { media: { kind: "external_video", source_id: "src_1" } },
    );
    expect(answer.status, JSON.stringify(answer.json)).toBe(409);
    expect(answer.json).toMatchObject({
      code: "OCCURRENCE_CLOSED",
      next_target: { id: expect.any(String) as unknown },
    });
  });

  // Every JSON read answers with its default scene, and the scene is what the schema says.
  const queryValues: Record<string, string> = { club_id: "club_sunday_people" };
  for (const op of OPERATIONS) {
    if (op.method !== "get" || !("json" in op.ok) || "binary" in op.ok) continue;
    const schema = op.ok.json;
    it(`GET ${op.path} answers with its default scene`, async () => {
      const path = op.path.replace(/\{[a-z_]+\}/g, "x_1");
      const query = new URLSearchParams();
      for (const [key, field] of Object.entries(op.query?.shape ?? {})) {
        if ((field as { safeParse: (value: unknown) => { success: boolean } }).safeParse(undefined).success) continue;
        const value = queryValues[key];
        if (value === undefined) throw new Error(`${op.id}: give the required query parameter ${key} a value here`);
        query.set(key, value);
      }
      const answer = await call("GET", query.size > 0 ? `${path}?${query.toString()}` : path, signedIn);
      expect(answer.status, JSON.stringify(answer.json)).toBe(op.ok.status);
      expect(answer.headers.get("cache-control")).toBe("private, no-store");
      const parsed = schema.safeParse(answer.json);
      expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe("");
      const name = registry.get(schema)?.id ?? "";
      expect(unknownKeys(document, { $ref: `#/components/schemas/${name}` }, answer.json)).toEqual([]);
    });
  }
});
