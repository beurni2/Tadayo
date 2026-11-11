// The API's skeleton on its own, with no database (T14; docs/plans/B0.md, slice 7): every operation
// of the contract has its route and answers the neutral not-found, and so does whatever Fastify
// itself answers a request it routes: an unknown path, another method, an id past the router's
// limit or a broken escape. A body Fastify can't read, and a request Node's parser can't, get the
// contract's INVALID_REQUEST, never the error's message; the second is sent over a socket of its
// own, since `inject` never reaches the parser. The privacy matrix (tests/src/privacy) runs every
// route as every role on top.

import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { OPERATIONS } from "@tadayo/contracts";
import type { Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, routesOf } from "./app.ts";
import type { ApiSql } from "./connection.ts";

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

const ended = { count: 0 };
const sql = {
  end: () => {
    ended.count += 1;
    return Promise.resolve();
  },
} as unknown as ApiSql;
let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ sql, clock: {} as Clock });
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
  it("has one route for each operation of the contract, and no other", () => {
    const contract = OPERATIONS.map(
      (operation) => `${operation.method.toUpperCase()} ${operation.path.replace(/\{([a-z_]+)\}/g, ":$1")}`,
    );
    expect([...routesOf(app)].sort()).toEqual(contract.sort());
    expect(routesOf(app)).toHaveLength(66);
  });

  it("answers every operation with the neutral not-found, and nothing else", async () => {
    for (const operation of OPERATIONS) {
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
      ["PATCH", "/v1/me"],
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

  it("ends its connection when it closes", async () => {
    const other = buildApp({ sql, clock: {} as Clock });
    await other.ready();
    const before = ended.count;
    await other.close();
    expect(ended.count).toBe(before + 1);
  });
});

describe("what Node's parser answers, over a socket of its own (T14)", () => {
  let listening: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    listening = buildApp({ sql, clock: {} as Clock });
    await listening.listen({ port: 0, host: "127.0.0.1" });
    port = (listening.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await listening.close();
  });

  /** What the app answers `bytes`, written as they are, with the transport's own headers left out. */
  function raw(bytes: string): Promise<{ status: number; body: string; headers: Record<string, string> }> {
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
          if (!TRANSPORT.has(name)) headers[name] = field.slice(colon + 1).trim();
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
    const streaming = buildApp({ sql, clock: {} as Clock });
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
