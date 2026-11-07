// The API's skeleton on its own, with no database (T14; docs/plans/B0.md, slice 7): every operation
// of the contract has its route and answers the neutral not-found, and so does whatever Fastify
// itself answers a request it routes: an unknown path, another method, an id past the router's
// limit or a broken escape. A body Fastify can't read gets the contract's INVALID_REQUEST, never the
// error's message. The privacy matrix (tests/src/privacy) runs every route as every role on top.

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
      ["GET", "/v1/drops/drp_x/../../me"],
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
