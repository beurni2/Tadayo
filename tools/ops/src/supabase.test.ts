// The small client `storage-setup` and `supabase-probe` call a Supabase project with, against a
// `fetch` that records what it was asked and answers as Storage, Auth and the gateway do (T53, T56):
// which key goes in which header, a time limit on every call, Storage's status in the body, and a
// message that says what a reply was without a word of its body.

import { describe, expect, it } from "vitest";
import { FAKE_PUBLISHABLE, FAKE_SECRET } from "../test/fake-supabase.ts";
import { OpsError } from "./ops-error.ts";
import * as supabase from "./supabase.ts";

const PROJECT = "https://abcdefghijklmnopqrst.supabase.co";

interface Seen {
  readonly url: string;
  readonly init: RequestInit;
  readonly headers: Record<string, string>;
}

function recorder(answer: () => Response | Promise<Response> = () => new Response("{}", { status: 200 })) {
  const seen: Seen[] = [];
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const given = init ?? {};
    seen.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      init: given,
      headers: { ...(given.headers as Record<string, string>) },
    });
    return Promise.resolve(answer());
  }) as typeof fetch;
  return { fetcher, seen };
}

const failure = async (action: Promise<unknown>): Promise<string> =>
  action.then(
    () => "it didn't fail",
    (caught: unknown) => (caught instanceof OpsError ? caught.message : `not an OpsError: ${String(caught)}`),
  );

describe("projectUrl: only https://<twenty letters>.supabase.co", () => {
  it("takes a project's URL, with or without its trailing slash, and gives it without", () => {
    expect(supabase.projectUrl(PROJECT)).toBe(PROJECT);
    expect(supabase.projectUrl(`${PROJECT}/`)).toBe(PROJECT);
  });

  it("refuses plain http, another host or length, capitals, a path, a query and anything around it", () => {
    for (const bad of [
      "",
      "abcdefghijklmnopqrst",
      PROJECT.replace("https", "http"),
      PROJECT.replace("supabase.co", "supabase.com"),
      PROJECT.replace("abcdefghijklmnopqrst", "abcdefghijklmnopqrs"),
      PROJECT.replace("abcdefghijklmnopqrst", "abcdefghijklmnopqrstu"),
      PROJECT.replace("abcdefghijklmnopqrst", "ABCDEFGHIJKLMNOPQRST"),
      `${PROJECT}/rest/v1`,
      `${PROJECT}?x=1`,
      `${PROJECT}#x`,
      ` ${PROJECT}`,
      `${PROJECT}\n`,
      `${PROJECT}.evil.example`,
      "https://x.abcdefghijklmnopqrst.supabase.co",
      "https://user@abcdefghijklmnopqrst.supabase.co",
      "https://abcdefghijklmnopqrst.supabase.co:8443",
    ]) {
      expect(() => supabase.projectUrl(bad), JSON.stringify(bad)).toThrow(
        /^SUPABASE_URL isn't a Supabase project's URL/,
      );
    }
  });
});

describe("send: the key each caller has, in the header it goes in", () => {
  it("sends the service key and the public key as apikey and as the bearer, as supabase-js does", async () => {
    for (const [kind, key] of [
      ["service", FAKE_SECRET],
      ["anon", FAKE_PUBLISHABLE],
    ] as const) {
      const { fetcher, seen } = recorder();
      await supabase.send(fetcher, PROJECT, "/storage/v1/bucket", { caller: { kind, key } });
      expect(seen[0]?.headers).toEqual({ apikey: key, authorization: `Bearer ${key}` });
    }
  });

  it("sends a signed-in user's token as the bearer and the public key as apikey", async () => {
    const { fetcher, seen } = recorder();
    await supabase.send(fetcher, PROJECT, "/auth/v1/user", {
      caller: { kind: "user", key: FAKE_PUBLISHABLE, token: "a-user-token" },
    });
    expect(seen[0]?.headers).toEqual({ apikey: FAKE_PUBLISHABLE, authorization: "Bearer a-user-token" });
  });

  it("sends no key at all for a call with no caller: a signed upload URL's token is in its query", async () => {
    const { fetcher, seen } = recorder();
    await supabase.send(fetcher, PROJECT, "/storage/v1/object/upload/sign/uploads/a?token=t", { method: "PUT" });
    expect(seen[0]?.headers).toEqual({});
  });

  it("sets a content type for a JSON body or for bytes, and no User-Agent, which a secret key's request mustn't have", async () => {
    const { fetcher, seen } = recorder();
    await supabase.send(fetcher, PROJECT, "/a", { method: "POST", json: { a: 1 }, caller: { kind: "anon", key: "k" } });
    await supabase.send(fetcher, PROJECT, "/b", {
      method: "PUT",
      body: Uint8Array.of(1, 2, 3),
      contentType: "image/png",
      headers: { "accept-profile": "app" },
    });
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    expect(seen[0]?.init.body).toBe('{"a":1}');
    expect(seen[1]?.headers).toEqual({ "accept-profile": "app", "content-type": "image/png" });
    expect(new Uint8Array(seen[1]?.init.body as ArrayBuffer)).toEqual(Uint8Array.of(1, 2, 3));
    for (const call of seen) {
      expect(Object.keys(call.headers).map((name) => name.toLowerCase())).not.toContain("user-agent");
    }
  });

  it("asks with GET unless told otherwise, at the project's URL, and with a time limit that hasn't run out", async () => {
    const { fetcher, seen } = recorder();
    await supabase.send(fetcher, PROJECT, "/storage/v1/bucket");
    await supabase.send(fetcher, PROJECT, "/storage/v1/bucket", { method: "DELETE" });
    expect(seen.map((call) => call.init.method)).toEqual(["GET", "DELETE"]);
    expect(seen.map((call) => call.url)).toEqual([`${PROJECT}/storage/v1/bucket`, `${PROJECT}/storage/v1/bucket`]);
    for (const call of seen) {
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
      expect(call.init.signal?.aborted).toBe(false);
    }
  });
});

describe("send: what a reply is", () => {
  const reply =
    (status: number, body: string): (() => Response) =>
    () =>
      new Response(body, { status });

  it("keeps the status, the body's bytes, and the body as JSON when it is one", async () => {
    const { fetcher } = recorder(reply(200, '{"a":[1]}'));
    const got = await supabase.send(fetcher, PROJECT, "/a");
    expect(got.status).toBe(200);
    expect(got.logical).toBe(200);
    expect(got.json).toEqual({ a: [1] });
    expect(new TextDecoder().decode(got.bytes)).toBe('{"a":[1]}');
    const plain = await supabase.send(recorder(reply(502, "<html>bad gateway</html>")).fetcher, PROJECT, "/a");
    expect(plain.json).toBeUndefined();
    expect(plain.logical).toBe(502);
    expect(plain.code).toBeUndefined();
  });

  it("reads Storage's status and code from the body, since it answers every error with HTTP 400", async () => {
    const got = await supabase.send(
      recorder(reply(400, '{"statusCode":"403","code":"AccessDenied","error":"Unauthorized"}')).fetcher,
      PROJECT,
      "/a",
    );
    expect(got.status).toBe(400);
    expect(got.logical).toBe(403);
    expect(got.code).toBe("AccessDenied");
  });

  it("takes a body's status only as three digits in a string, and its code only as a string", async () => {
    for (const body of [
      '{"statusCode":403}',
      '{"statusCode":"40"}',
      '{"statusCode":"4030"}',
      '{"statusCode":"abc"}',
      '{"statusCode":"40a"}',
      '{"statusCode":null}',
      "[]",
      "null",
      '"403"',
    ]) {
      const got = await supabase.send(recorder(reply(400, body)).fetcher, PROJECT, "/a");
      expect(got.logical, body).toBe(400);
    }
    const noCode = await supabase.send(recorder(reply(400, '{"code":7,"statusCode":"404"}')).fetcher, PROJECT, "/a");
    expect(noCode.code).toBeUndefined();
    expect(noCode.logical).toBe(404);
  });

  it("says where it got no answer, by the path without its query, and never a header, a key or a body", async () => {
    for (const [options, expected] of [
      [{}, "GET /storage/v1/bucket: no answer from the project"],
      [{ method: "DELETE" as const }, "DELETE /storage/v1/bucket: no answer from the project"],
    ] as const) {
      const message = await failure(
        supabase.send(
          () => Promise.reject(new TypeError(`fetch failed for ${FAKE_SECRET}`)),
          PROJECT,
          "/storage/v1/bucket?token=a-secret-token",
          { ...options, caller: { kind: "service", key: FAKE_SECRET } },
        ),
      );
      expect(message).toBe(expected);
      expect(message).not.toContain(FAKE_SECRET);
      expect(message).not.toContain("a-secret-token");
    }
  });

  it("says it got no answer when the body stops before it is whole, as it does when the call gets none", async () => {
    const stopped = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("terminated"));
          },
        }),
        { status: 200 },
      );
    const message = await failure(supabase.send(recorder(stopped).fetcher, PROJECT, "/a?x=1"));
    expect(message).toBe("GET /a: no answer from the project");
  });
});

describe("describe: what a reply was, for a message, and never its body", () => {
  const replyOf = (over: Partial<supabase.Reply>): supabase.Reply => ({
    status: 200,
    logical: 200,
    code: undefined,
    json: undefined,
    bytes: new Uint8Array(),
    ...over,
  });

  it("says the HTTP status, Storage's own status when it differs, and the code", () => {
    expect(supabase.describe(replyOf({}))).toBe("HTTP 200");
    expect(supabase.describe(replyOf({ status: 401, logical: 401 }))).toBe("HTTP 401");
    expect(supabase.describe(replyOf({ status: 400, logical: 403, code: "AccessDenied" }))).toBe(
      "HTTP 400, status 403, AccessDenied",
    );
    expect(supabase.describe(replyOf({ status: 400, logical: 400, code: "InvalidRequest" }))).toBe(
      "HTTP 400, InvalidRequest",
    );
  });

  it("says a code only when it is a plain word of at most 40 letters, digits and underscores", () => {
    expect(supabase.describe(replyOf({ code: "a".repeat(40) }))).toBe(`HTTP 200, ${"a".repeat(40)}`);
    for (const code of ["", "a".repeat(41), "has space", "semi;colon", "new\nline", "a-b", `${FAKE_SECRET} x`]) {
      expect(supabase.describe(replyOf({ code })), JSON.stringify(code)).toBe("HTTP 200");
    }
  });
});
