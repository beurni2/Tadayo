// The one page outside the app that calls the API, the signed-out invitation page on tadayo.app (G02-web,
// apps/web/public/i.html), may read `previewInvitationWeb`'s answers, and nothing else may read anything
// (web-origin.ts; T7, T14, T52; docs/plans/api-b0-spike-links-web.md, section 2). With no database: the
// routes' transaction is a function, as in clubs/invitation.test.ts. Every role's answer to the preflight
// is the privacy matrix's too (tests/src/privacy/matrix.test.ts).

import { OPERATIONS } from "@tadayo/contracts";
import type { Account, Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { WEB_OPERATION } from "./web-origin.ts";

const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
const HELD = `{"token":"${TOKEN}"}`;
const WEB = "/v1/invitations/web-preview";
const PAGE = "https://tadayo.app";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
/** What a request from the page adds to an answer, pinned here, not taken from the app. */
const ALLOWED = { "access-control-allow-origin": PAGE, vary: "Origin" };
/** The preflight's one answer, pinned byte for byte. */
const PREFLIGHT = {
  status: 204,
  body: "",
  headers: {
    "access-control-allow-origin": PAGE,
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "cache-control": "private, no-store",
  },
};
const NEUTRAL = {
  status: 404,
  body: '{"code":"NOT_FOUND"}',
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "20",
  },
};

const account: Account = {
  id: "acct_ana",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 0,
  avatarVersion: null,
};

const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app whose transactions are `begin`, counting the transactions begun and the sessions asked for. */
async function appFor(begin: () => Promise<unknown>, lines?: string[]) {
  let begun = 0;
  let asked = 0;
  const sql = {
    end: () => Promise.resolve(),
    begin: () => {
      begun += 1;
      return begin();
    },
  } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => {
      asked += 1;
      return Promise.resolve(account);
    },
    log:
      lines === undefined
        ? { level: "silent" }
        : { level: "trace", stream: { write: (line) => void lines.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  const answer = async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
  return Object.assign(answer, { begun: () => begun, asked: () => asked });
}

const post = (payload: string, origin?: string, url = WEB): InjectOptions => ({
  method: "POST",
  url,
  headers: { "content-type": "application/json", ...(origin === undefined ? {} : { origin }) },
  payload,
});

describe("the signed-out page's answers, read by a browser on tadayo.app", () => {
  it("adds the page's allowance to every answer of previewInvitationWeb asked from tadayo.app, and changes nothing else", async () => {
    const cases: [string, () => Promise<unknown>, string, number][] = [
      ["a live link", () => Promise.resolve({ inviterName: "Ben" }), HELD, 200],
      ["a link that names nothing", () => Promise.resolve(null), HELD, 404],
      ["a bad token", () => Promise.resolve(null), '{"token":"short"}', 400],
      ["a body past the route's limit", () => Promise.resolve(null), `{"token":"${"A".repeat(3000)}"}`, 400],
      ["a database that failed", () => Promise.reject(new Error("no database")), HELD, 500],
    ];
    for (const [name, begin, payload, status] of cases) {
      const answer = await appFor(begin);
      const without = await answer(post(payload));
      const from = await answer(post(payload, PAGE));
      expect(without.status, name).toBe(status);
      expect(without.headers, name).not.toHaveProperty("access-control-allow-origin");
      expect(without.headers, name).not.toHaveProperty("vary");
      expect(from, name).toEqual({ ...without, headers: { ...without.headers, ...ALLOWED } });
      expect(answer.asked(), name).toBe(0);
    }
  });

  it("allows no other origin: the answer is the one a request with no Origin gets", async () => {
    const answer = await appFor(() => Promise.resolve({ inviterName: "Ben" }));
    const without = await answer(post(HELD));
    for (const origin of [
      "https://tadayo.app.evil.example",
      "https://evil.example",
      "http://tadayo.app",
      "https://www.tadayo.app",
      "https://api-dev.tadayo.app",
      "https://tadayo.app/",
      "https://tadayo.app:443",
      "https://TADAYO.app",
      "null",
      "",
    ]) {
      expect(await answer(post(HELD, origin)), origin).toEqual(without);
    }
  });

  it("gives tadayo.app nothing on any other route: the app's own preview, the account, a club, an unknown path", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    const get = (url: string, origin?: string): InjectOptions => ({
      method: "GET",
      url,
      headers: origin === undefined ? {} : { origin },
    });
    for (const [name, request] of [
      ["the app's preview", (origin?: string) => post(HELD, origin, "/v1/invitations/preview")],
      [
        "a new club",
        (origin?: string) => post('{"name":"Kitchen table","timezone":"America/New_York"}', origin, "/v1/clubs"),
      ],
      ["the account", (origin?: string) => get("/v1/me", origin)],
      ["an unknown path", (origin?: string) => get("/v1/nowhere", origin)],
      ["the page's path with GET", (origin?: string) => get(WEB, origin)],
    ] as const) {
      const from = await answer(request(PAGE));
      expect(from, name).toEqual(await answer(request()));
      expect(from.headers, name).not.toHaveProperty("access-control-allow-origin");
    }
  });
});

describe("every operation of the contract, asked from tadayo.app", () => {
  it("answers as it would with no Origin, signed in or not, but for previewInvitationWeb, which adds the allowance alone", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    const ids: string[] = [];
    for (const operation of OPERATIONS) {
      const method = operation.method.toUpperCase();
      const url = operation.path.replace(/\{([a-z_]+)\}/g, (_match, name: string) => `${name}_1`);
      const body = method === "POST" || method === "PATCH" || method === "PUT";
      for (const signedIn of [false, true]) {
        const request = (origin?: string): InjectOptions => ({
          method,
          url,
          headers: {
            ...(body ? { "content-type": "application/json" } : {}),
            ...(signedIn ? { authorization: "Bearer a-session" } : {}),
            ...(origin === undefined ? {} : { origin }),
          },
          ...(body ? { payload: "{}" } : {}),
        });
        const without = await answer(request());
        const from = await answer(request(PAGE));
        const name = `${operation.id}${signedIn ? ", signed in" : ""}`;
        expect(without.headers, name).not.toHaveProperty("access-control-allow-origin");
        expect(from, name).toEqual(
          operation.id === WEB_OPERATION ? { ...without, headers: { ...without.headers, ...ALLOWED } } : without,
        );
      }
      ids.push(operation.id);
    }
    expect(ids).toContain(WEB_OPERATION);
    expect(ids).toHaveLength(OPERATIONS.length);
  });
});

describe("the preflight a browser sends before the page's request", () => {
  it("answers every caller the same, reading no session and no database", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    const asking = {
      origin: PAGE,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    };
    for (const headers of [
      {},
      asking,
      { ...asking, origin: "https://evil.example" },
      { ...asking, "access-control-request-method": "DELETE", "access-control-request-headers": "authorization" },
      { ...asking, authorization: "Bearer not-a-token" },
      { origin: PAGE, "content-type": "application/json" },
    ]) {
      const got = await answer({ method: "OPTIONS", url: WEB, headers });
      expect(got, JSON.stringify(headers)).toEqual(PREFLIGHT);
    }
    expect(answer.begun()).toBe(0);
    expect(answer.asked()).toBe(0);
  });

  it("answers the same when a body comes with it, unread", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    for (const payload of [HELD, "{bad", "x".repeat(200_000)]) {
      const got = await answer({
        method: "OPTIONS",
        url: WEB,
        headers: { origin: PAGE, "content-type": "application/json" },
        payload,
      });
      expect(got, payload.slice(0, 10)).toEqual(PREFLIGHT);
    }
  });

  it("is the only preflight: an OPTIONS anywhere else is still the neutral not-found", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    for (const url of [
      "/v1/invitations/preview",
      "/v1/invitations/accept",
      "/v1/me",
      "/v1/invitations/web-preview/",
      "/",
    ]) {
      expect(await answer({ method: "OPTIONS", url, headers: { origin: PAGE } }), url).toEqual(NEUTRAL);
    }
  });

  it("logs the preflight's one line, by what it answers for, and the token in no line (T52)", async () => {
    const lines: string[] = [];
    const answer = await appFor(() => Promise.resolve(null), lines);
    await answer({ method: "OPTIONS", url: WEB, headers: { origin: PAGE } });
    await answer(post(HELD, PAGE));
    const read = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(read.map(({ op, preflight, status }) => ({ op, preflight, status }))).toEqual([
      { op: undefined, preflight: "previewInvitationWeb", status: 204 },
      { op: "previewInvitationWeb", preflight: undefined, status: 404 },
    ]);
    for (const line of lines) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain("tadayo.app");
    }
  });
});
