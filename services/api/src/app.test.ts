// The API's app on its own, with no database and a signed-in caller the tests supply (T14;
// docs/plans/B0.md, slices 7 and 8): every operation of the contract has its route, those nobody has
// built answer the neutral not-found, and so does whatever Fastify itself answers a request it routes:
// an unknown path, another method, an id past the router's limit or a broken escape. A body Fastify
// can't read, and a request Node's parser can't, get the contract's INVALID_REQUEST, never the error's
// message; the second is sent over a socket of its own, since `inject` never reaches the parser. The
// sign-in gate has its own tests (session.test.ts), and the privacy matrix (tests/src/privacy) runs
// every route as every role on top.

import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { OPERATIONS } from "@tadayo/contracts";
import type { Account, Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, routesOf, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { END_SECONDS } from "./shutdown.ts";

/** The neutral not-found, pinned here byte for byte, not taken from the app. */
const NEUTRAL = {
  status: 404,
  body: '{"code":"NOT_FOUND"}',
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "20",
  },
};
const INVALID = {
  status: 400,
  body: '{"code":"INVALID_REQUEST"}',
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "26",
  },
};
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);

const ended: { count: number; options: unknown[] } = { count: 0, options: [] };
const sql = {
  end: (options?: unknown) => {
    ended.count += 1;
    ended.options.push(options);
    return Promise.resolve();
  },
} as unknown as ApiSql;

/** Who is calling: an account with its profile finished, which every route lets through. */
const READY: Account = {
  id: "acct_ready",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 0,
  avatarVersion: null,
};
const deps: Deps = { sql, clock: {} as Clock, authenticate: () => Promise.resolve(READY), log: { level: "silent" } };
/** The operations slice 8 builds; every other answers the neutral not-found (T14). */
const BUILT = new Set([
  "getMe",
  "updateMe",
  "listClubs",
  "createClub",
  "getClub",
  "listMembers",
  "proposeRoster",
  "getRosterRevision",
  "createInvitation",
  "revokeInvitation",
  "previewInvitationWeb",
  "previewInvitation",
  "acceptInvitation",
  "approveRoster",
  "declineRoster",
  "leaveClub",
  "getHome",
  "getSchedule",
  "chooseScheduleDays",
  "confirmScheduleDays",
]);
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp(deps);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

/** The answer to `request`, with the transport's own headers left out. */
async function answer(request: InjectOptions) {
  const response = await app.inject(request);
  const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
  return { status: response.statusCode, body: response.body, headers };
}

describe("the skeleton's routes (T14)", () => {
  it("has one route for each operation of the contract, the signed-out page's preflight, and no other", () => {
    const contract = OPERATIONS.map(
      (operation) => `${operation.method.toUpperCase()} ${operation.path.replace(/\{([a-z_]+)\}/g, ":$1")}`,
    );
    // The browser's preflight before tadayo.app's request (web-origin.ts), pinned here by its method and path:
    // a preflight isn't an operation of the contract, and it is the only route that isn't one.
    expect([...routesOf(app)].sort()).toEqual([...contract, "OPTIONS /v1/invitations/web-preview"].sort());
    expect(routesOf(app)).toHaveLength(68);
  });

  it("answers every operation nobody has built yet with the neutral not-found, and nothing else", async () => {
    const unbuilt = OPERATIONS.filter((operation) => !BUILT.has(operation.id));
    expect(unbuilt).toHaveLength(47);
    for (const operation of unbuilt) {
      const url = operation.path.replace(/\{[a-z_]+\}/g, "drp_x");
      expect(await answer({ method: operation.method.toUpperCase(), url }), operation.id).toEqual(NEUTRAL);
    }
  });
});

describe("what Fastify answers itself, made to say nothing (T14)", () => {
  it("answers an unknown path, another method, HEAD and OPTIONS with the neutral not-found", async () => {
    for (const [method, url] of [
      ["GET", "/"],
      ["GET", "/v1/debug"],
      ["GET", "/v2/me"],
      ["GET", "/v1/me/"],
      ["GET", "//v1/me"],
      ["DELETE", "/v1/me"],
      ["PUT", "/v1/me"],
      ["POST", "/v1/me"],
      ["TRACE", "/v1/me"],
      ["HEAD", "/v1/me"],
      ["OPTIONS", "/v1/me"],
      ["OPTIONS", "/v1/drops/drp_x"],
    ] as const) {
      expect(await answer({ method, url }), `${method} ${url}`).toEqual(NEUTRAL);
    }
  });

  it("answers an id past the router's limit and a broken escape with the neutral not-found, never echoing the path", async () => {
    for (const id of ["a".repeat(101), "a".repeat(4096), "%zz", "%", "%E0%A4%A", "%00", "..%2F"]) {
      expect(await answer({ method: "GET", url: `/v1/drops/${id}` }), id.slice(0, 12)).toEqual(NEUTRAL);
    }
  });

  it("answers a body it can't read with INVALID_REQUEST alone, never the error's message", async () => {
    for (const [type, payload] of [
      ["application/json", "{bad"],
      ["application/json", ""],
      ["application/json", '{"__proto__":{"admin":true}}'],
      ["application/json", '{"club":{"constructor":{"prototype":{"admin":true}}}}'],
      ["application/xml", "<club/>"],
      ["application/json", JSON.stringify({ name: "x".repeat(1_100_000) })],
    ] as const) {
      const got = await answer({ method: "POST", url: "/v1/clubs", headers: { "content-type": type }, payload });
      expect(got, `${type} ${payload.slice(0, 20)}`).toEqual(INVALID);
    }
  });

  it("reads a body up to its limit and refuses one past it unread, with INVALID_REQUEST alone, whatever the route", async () => {
    // A body of exactly `bytes`, JSON, for a request that answers the neutral not-found once it has read it.
    const sized = (bytes: number): string => {
      const head = '{"name":"';
      return `${head}${"x".repeat(bytes - head.length - 2)}"}`;
    };
    // No source names the limit (the review of slice 8 chose it), so this test holds its value: moving it is
    // an edit of this line. tests/src/privacy/body-limits.test.ts holds it above what any valid body needs.
    expect(BODY_LIMIT, "the general limit is 128 KiB").toBe(128 * 1024);
    // A route of the contract, which carries the limit itself, and the two kinds of request only the app's
    // own limit holds, since Fastify's not-found context takes no route's: a path the contract hasn't and a
    // method the path hasn't. A route nobody has built answers the neutral not-found once it has read its body.
    for (const [method, url] of [
      ["POST", "/v1/reports"],
      ["POST", "/v1/nowhere"],
      ["POST", "/v1/me"],
      ["PUT", "/v1/me"],
    ] as const) {
      const send = (bytes: number) =>
        answer({ method, url, headers: { "content-type": "application/json" }, payload: sized(bytes) });
      expect(await send(BODY_LIMIT), `${method} ${url}, the limit itself`).toEqual(NEUTRAL);
      expect(await send(BODY_LIMIT + 1), `${method} ${url}, one byte past it`).toEqual(INVALID);
      expect(await send(1_000_000), `${method} ${url}, a megabyte`).toEqual(INVALID);
    }
    // Every route has the limit, and none has a higher one: a route with its own is lower.
    for (const operation of OPERATIONS) expect(bodyLimitOf(operation.id), operation.id).toBeLessThanOrEqual(BODY_LIMIT);
    expect(bodyLimitOf("updateMe")).toBe(17 * 1024);
    expect(bodyLimitOf("createReport")).toBe(BODY_LIMIT);
  });

  it("ends its connection when it closes, giving queries still running END_SECONDS before postgres.js closes it anyway", async () => {
    const other = buildApp(deps);
    await other.ready();
    const before = ended.count;
    await other.close();
    expect(ended.count).toBe(before + 1);
    expect(ended.options.at(-1)).toEqual({ timeout: END_SECONDS });
  });
});

describe("what Node's parser answers, over a socket of its own (T14)", () => {
  let listening: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    listening = buildApp(deps);
    await listening.listen({ port: 0, host: "127.0.0.1" });
    port = (listening.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await listening.close();
  });

  /** What the app answers `bytes`, written as they are, with the transport's own headers left out, but those `keep` names. */
  function raw(
    bytes: string,
    keep: readonly string[] = [],
  ): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    return new Promise((done) => {
      const socket = connect(port, "127.0.0.1");
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", () => undefined);
      const timer = setTimeout(() => socket.destroy(), 5_000);
      socket.on("close", () => {
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString("latin1");
        const split = text.indexOf("\r\n\r\n");
        const [line = "", ...fields] = (split < 0 ? text : text.slice(0, split)).split("\r\n");
        const headers: Record<string, string> = {};
        for (const field of fields) {
          const colon = field.indexOf(":");
          const name = field.slice(0, colon).toLowerCase();
          if (!TRANSPORT.has(name) || keep.includes(name)) headers[name] = field.slice(colon + 1).trim();
        }
        let body = split < 0 ? "" : text.slice(split + 4);
        if (headers["transfer-encoding"] === "chunked") {
          let decoded = "";
          for (let size = parseInt(body, 16); size > 0; size = parseInt(body, 16)) {
            const start = body.indexOf("\r\n") + 2;
            decoded += body.slice(start, start + size);
            body = body.slice(start + size + 2);
          }
          body = decoded;
        }
        done({ status: Number(line.split(" ")[1]), body, headers });
      });
      socket.write(bytes, "latin1");
    });
  }

  it("answers a request the parser can't read with INVALID_REQUEST alone, in place of Fastify's own words", async () => {
    const host = "Host: 127.0.0.1\r\n";
    for (const request of [
      `GET /v1/drops/caf\u00c3\u00a9 HTTP/1.1\r\n${host}\r\n`,
      `GET /v1/drops/a b HTTP/1.1\r\n${host}\r\n`,
      `FOO /v1/me HTTP/1.1\r\n${host}\r\n`,
      `POST /v1/clubs HTTP/1.1\r\n${host}Transfer-Encoding: chunked\r\nContent-Length: 3\r\n\r\n0\r\n\r\n`,
      `POST /v1/clubs HTTP/1.1\r\n${host}Content-Length: 1\r\nContent-Length: 2\r\n\r\nab`,
      `GET /v1/me HTTP/1.2\r\n${host}\r\n`,
      `GET /v1/me HTTP/1.1\r\n${host}X-Big: ${"a".repeat(17_000)}\r\n\r\n`,
      "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n",
    ]) {
      expect(await raw(request), request.slice(0, 40)).toEqual({ ...INVALID, headers: { ...INVALID.headers } });
    }
  });

  it("answers a path with dot segments, sent as it is, with the neutral not-found", async () => {
    for (const path of ["/v1/drops/drp_x/../../me", "/v1/drops/drp_x/%2e%2e/%2e%2e/me", "/v1/./me"]) {
      expect(await raw(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`), path).toEqual(NEUTRAL);
    }
  });

  it("refuses a body past the limit before any of it is sent, and closes the connection, wherever the request goes", async () => {
    // Only the head of each request goes out, declaring one byte more than the limit: an app that waited for
    // the body would wait for ever, and `raw` would end the socket after 5 seconds with no answer to read.
    for (const [method, path] of [
      ["POST", "/v1/clubs"],
      ["POST", "/v1/nowhere"],
      ["POST", "/v1/me"],
      ["PUT", "/v1/me"],
    ] as const) {
      const head = `${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${String(BODY_LIMIT + 1)}\r\n\r\n`;
      expect(await raw(head, ["connection"]), `${method} ${path}`).toEqual({
        ...INVALID,
        headers: { ...INVALID.headers, connection: "close" },
      });
    }
  }, 20_000);

  it("keeps a connection open with Fastify's own timeout, the one Keep-Alive the leak scanner allows", async () => {
    const headers = await new Promise<IncomingHttpHeaders>((done, fail) => {
      const request = httpRequest(
        { host: "127.0.0.1", port, path: "/v1/me", agent: false, headers: { connection: "keep-alive" } },
        (response) => {
          done(response.headers);
          response.destroy();
        },
      );
      request.on("error", fail);
      request.end();
    });
    // tests/src/privacy/scanner.ts TRANSPORT pins this value.
    expect({ connection: headers.connection, keepAlive: headers["keep-alive"] }).toEqual({
      connection: "keep-alive",
      keepAlive: "timeout=72",
    });
  });

  it("writes nothing into an answer already under way when a request pipelined behind it can't be read", async () => {
    // A route that starts its answer and finishes it later, as a media route streams its bytes.
    const streaming = buildApp(deps);
    streaming.get("/stream", (_request, reply) => {
      reply.raw.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "private, no-store" });
      reply.raw.write("first|");
      setTimeout(() => reply.raw.end("last"), 300);
      return reply.hijack();
    });
    await streaming.listen({ port: 0, host: "127.0.0.1" });
    const at = (streaming.server.address() as AddressInfo).port;
    const text = await new Promise<string>((done) => {
      const socket = connect(at, "127.0.0.1");
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", () => undefined);
      socket.on("close", () => {
        done(Buffer.concat(chunks).toString("latin1"));
      });
      socket.write("GET /stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
      setTimeout(() => socket.write("FOO / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"), 100);
      setTimeout(() => socket.destroy(), 2_000);
    });
    await streaming.close();
    expect(text.startsWith("HTTP/1.1 200 OK\r\n")).toBe(true);
    expect(text).toContain("first|");
    expect(text).not.toContain("INVALID_REQUEST");
    expect(text.match(/HTTP\/1\.1 /g)).toHaveLength(1);
  });

  it("leaves Node's own two answers empty: no Host header, and an Expect it doesn't know", async () => {
    for (const [request, status] of [
      ["GET /v1/me HTTP/1.1\r\nConnection: close\r\n\r\n", 400],
      ["GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1\r\nExpect: bogus\r\nConnection: close\r\n\r\n", 417],
    ] as const) {
      const got = await raw(request);
      expect(got.status, request.slice(0, 40)).toBe(status);
      expect(got.body, request.slice(0, 40)).toBe("");
    }
  });
});
