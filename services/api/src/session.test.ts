// The sign-in gate (spec 23; T14, T27; docs/plans/B0.md, slice 8), with no database: one hook, driven by
// each contract route's flags, decides before the body is read, and Fastify's own answers stay neutral
// for everyone. `authenticate` is the gate's one seam, so each case here hands it the answer it names:
// an account, no session, or can't tell. The real `authenticate`'s tokens are in token.test.ts and, end to
// end against Postgres, in tests/src/db/sign-in.test.ts and the privacy matrix.

import { OPERATIONS } from "@tadayo/contracts";
import type { Account, Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { KeysUnavailable } from "./identity/token.ts";
import { bearerToken, sessions, type Authenticate } from "./session.ts";
import { noStorage } from "./testing.ts";

const account = (over: Partial<Account> = {}): Account => ({
  id: "acct_a",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 0,
  avatarVersion: null,
  ...over,
});

/** Pinned here byte for byte, not taken from the app. */
const UNAUTHENTICATED = {
  status: 401,
  body: '{"code":"UNAUTHENTICATED"}',
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "26",
  },
};
const PROFILE_INCOMPLETE = {
  status: 403,
  body: '{"code":"PROFILE_INCOMPLETE"}',
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "29",
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
const UNAVAILABLE = { status: 503, body: "", headers: { "cache-control": "private, no-store", "content-length": "0" } };
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);

const sql = { end: () => Promise.resolve() } as unknown as ApiSql;
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app whose `authenticate` is `authenticate`, and a count of how often the gate asked it. */
async function appWith(authenticate: Authenticate) {
  const asked = { count: 0, headers: [] as (string | undefined)[] };
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: (header) => {
      asked.count += 1;
      asked.headers.push(header);
      return authenticate(header);
    },
    storage: noStorage,
    log: { level: "silent" },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  const answer = async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
  return { answer, asked };
}

/** An operation's own path, with a made-up id where it takes one. */
const urlOf = (path: string) => path.replace(/\{[a-z_]+\}/g, "drp_x");
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
  "createReservation",
  "releaseReservation",
  "createDrop",
  "createUpload",
  "getUpload",
  "completeUpload",
  "registerDevice",
  "removeDevice",
]);
const unbuilt = OPERATIONS.filter((operation) => !BUILT.has(operation.id));
/**
 * The public operations, all built: each is sent `{}`, which its handler refuses by its first field before it opens
 * a transaction, so the answer is the route's own and never the gate's.
 */
const PUBLIC = OPERATIONS.filter((operation) => operation.public === true);
const FIRST_FIELD: Readonly<Record<string, string>> = { previewInvitationWeb: "token", removeDevice: "removal_secret" };
const emptyBody = (operation: (typeof OPERATIONS)[number]): InjectOptions => ({
  method: operation.method.toUpperCase(),
  url: urlOf(operation.path),
  headers: { "content-type": "application/json" },
  payload: "{}",
});
/** Pinned byte for byte: the route's INVALID_REQUEST naming `field`. */
const invalidField = (field: string) => {
  const body = `{"code":"INVALID_REQUEST","field":"${field}"}`;
  return {
    status: 400,
    body,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
      "content-length": String(body.length),
    },
  };
};
const unbuiltBeforeProfile = unbuilt.filter(
  (operation) => operation.public !== true && operation.beforeProfile === true,
);
const unbuiltOther = unbuilt.filter((operation) => operation.public !== true && operation.beforeProfile !== true);

describe("the route classes the gate tells apart (the contract's public and beforeProfile)", () => {
  it("has the two gated classes among the operations nobody has built, and every public one built, so each is tried below", () => {
    expect([
      unbuilt.some((op) => op.public === true),
      unbuiltBeforeProfile.length > 0,
      unbuiltOther.length > 0,
    ]).toEqual([false, true, true]);
    expect(PUBLIC.every((operation) => BUILT.has(operation.id) && FIRST_FIELD[operation.id] !== undefined)).toBe(true);
    // The contract's seven flagged operations beside the two public ones.
    expect(
      OPERATIONS.filter((operation) => operation.public === true)
        .map((operation) => operation.id)
        .sort(),
    ).toEqual(["previewInvitationWeb", "removeDevice"]);
  });
});

describe("a caller with no session (T14)", () => {
  it("gets the one 401 on every route that isn't public, and the gate asked once", async () => {
    const { answer, asked } = await appWith(() => Promise.resolve(null));
    for (const operation of [
      ...unbuiltBeforeProfile,
      ...unbuiltOther,
      ...OPERATIONS.filter((op) => BUILT.has(op.id) && op.public !== true),
    ]) {
      const got = await answer({ method: operation.method.toUpperCase(), url: urlOf(operation.path) });
      expect(got, operation.id).toEqual(UNAUTHENTICATED);
    }
    expect(asked.count).toBe(OPERATIONS.filter((op) => op.public !== true).length);
  });

  it("is judged before the body is read: a body Fastify couldn't read is still a 401, never a 400", async () => {
    const { answer } = await appWith(() => Promise.resolve(null));
    for (const [type, payload] of [
      ["application/json", "{bad"],
      ["application/json", ""],
      ["application/json", '{"__proto__":{"admin":true}}'],
      ["application/xml", "<club/>"],
      ["application/json", JSON.stringify({ name: "x".repeat(1_100_000) })],
    ] as const) {
      const got = await answer({ method: "PATCH", url: "/v1/me", headers: { "content-type": type }, payload });
      expect(got, `${type} ${payload.slice(0, 12)}`).toEqual(UNAUTHENTICATED);
    }
  });

  it("is told the same 401 whichever header it sent, since the gate hands over the header and nothing else", async () => {
    const { answer, asked } = await appWith(() => Promise.resolve(null));
    const headers = [
      undefined,
      "",
      "Bearer",
      "Bearer x",
      "Basic dXNlcjpwYXNz",
      "bearer  x",
      "Bearer a.b.c",
      "x".repeat(20_000),
    ];
    for (const header of headers) {
      const request: InjectOptions = { method: "GET", url: "/v1/me" };
      if (header !== undefined) request.headers = { authorization: header };
      expect(await answer(request), String(header).slice(0, 12)).toEqual(UNAUTHENTICATED);
    }
    expect(asked.headers).toEqual(headers);
  });
});

describe("a signed-in caller", () => {
  it("passes every route when its profile is finished, to the neutral answers of the routes nobody has built", async () => {
    const { answer } = await appWith(() => Promise.resolve(account()));
    for (const operation of unbuilt) {
      const got = await answer({ method: operation.method.toUpperCase(), url: urlOf(operation.path) });
      expect(got, operation.id).toEqual(NEUTRAL);
    }
  });

  it("gets 403 PROFILE_INCOMPLETE on a route that isn't beforeProfile until the age is confirmed and there is a name (FQ13, FQ69)", async () => {
    const unfinished = [
      account({ ageConfirmed: false, displayName: null }),
      account({ ageConfirmed: true, displayName: null }),
      // Not reachable in the schema (a name needs the age first, 0003), but the gate asks for both.
      account({ ageConfirmed: false, displayName: "Ana" }),
    ];
    for (const caller of unfinished) {
      const { answer } = await appWith(() => Promise.resolve(caller));
      for (const operation of unbuiltOther) {
        expect(
          await answer({ method: operation.method.toUpperCase(), url: urlOf(operation.path) }),
          operation.id,
        ).toEqual(PROFILE_INCOMPLETE);
      }
      // The beforeProfile routes are open to it: it can finish setup or leave.
      for (const operation of unbuiltBeforeProfile) {
        expect(
          await answer({ method: operation.method.toUpperCase(), url: urlOf(operation.path) }),
          operation.id,
        ).toEqual(NEUTRAL);
      }
    }
  });
});

describe("the public routes", () => {
  it("never ask who is calling, whatever the header says, and make no account", async () => {
    const { answer, asked } = await appWith(() => Promise.reject(new Error("asked")));
    for (const operation of PUBLIC) {
      for (const authorization of [undefined, "Bearer a.b.c", "garbage"]) {
        const request = emptyBody(operation);
        if (authorization !== undefined) request.headers = { ...request.headers, authorization };
        expect(await answer(request), operation.id).toEqual(invalidField(FIRST_FIELD[operation.id] ?? ""));
      }
    }
    expect(asked.count).toBe(0);
  });
});

describe("what Fastify answers itself, for every caller (T14)", () => {
  it("is the neutral not-found, and the gate is never asked", async () => {
    const { answer, asked } = await appWith(() => Promise.resolve(null));
    for (const [method, url] of [
      ["GET", "/"],
      ["GET", "/v1/debug"],
      ["GET", "/v1/me/"],
      ["PUT", "/v1/me"],
      ["HEAD", "/v1/me"],
      ["OPTIONS", "/v1/me"],
      ["GET", `/v1/drops/${"a".repeat(101)}`],
      ["GET", "/v1/drops/%zz"],
    ] as const) {
      expect(
        await answer({ method, url, headers: { authorization: "Bearer a.b.c" } }),
        `${method} ${url.slice(0, 20)}`,
      ).toEqual(NEUTRAL);
    }
    expect(asked.count).toBe(0);
  });

  it("gates an id of 65 to 100 characters, which Fastify's router takes: no session is a 401, not a not-found", async () => {
    const { answer } = await appWith(() => Promise.resolve(null));
    expect(await answer({ method: "GET", url: `/v1/drops/${"a".repeat(100)}` })).toEqual(UNAUTHENTICATED);
  });
});

describe("when the keys that check tokens can't be read (FQ89)", () => {
  it("answers 503 with nothing in it on every route that isn't public, never a 401, which signs the app out", async () => {
    for (const trouble of ["unreachable", "timeout", "malformed", "empty", "paused"] as const) {
      const { answer } = await appWith(() => Promise.reject(new KeysUnavailable(trouble)));
      for (const operation of [...unbuiltBeforeProfile, ...unbuiltOther]) {
        expect(
          await answer({ method: operation.method.toUpperCase(), url: urlOf(operation.path) }),
          operation.id,
        ).toEqual(UNAVAILABLE);
      }
      // The public routes need no keys.
      for (const operation of PUBLIC) {
        expect(await answer(emptyBody(operation)), operation.id).toEqual(invalidField(FIRST_FIELD[operation.id] ?? ""));
      }
    }
  });
});

describe("anything else that goes wrong while telling who is calling is a bug (500, nothing in it)", () => {
  it("answers 500 with an empty body, and never echoes the error", async () => {
    const { answer } = await appWith(() =>
      Promise.reject(new Error("duplicate key (auth_subject)=(secret) a@b.invalid")),
    );
    const got = await answer({ method: "GET", url: "/v1/clubs" });
    expect(got).toEqual({
      status: 500,
      body: "",
      headers: { "cache-control": "private, no-store", "content-length": "0" },
    });
  });
});

describe("the bearer header", () => {
  it.each([
    ["Bearer a.b.c", "a.b.c"],
    ["bearer a.b.c", "a.b.c"],
    ["BEARER a.b.c", "a.b.c"],
    ["BeArEr x", "x"],
  ])("reads %j as the token %j", (header, token) => {
    expect(bearerToken(header)).toBe(token);
  });

  it.each([
    undefined,
    "",
    "Bearer",
    "Bearer ",
    "Bearer  a.b.c",
    " Bearer a.b.c",
    "Bearer a.b.c ",
    "Bearer a b",
    "Basic a.b.c",
    "Bearera.b.c",
    "Token a.b.c",
    "Bearer\ta.b.c",
  ])("reads %j as no token", (header) => {
    expect(bearerToken(header)).toBeNull();
  });
});

describe("the real authenticate (sessions): a verified subject, its account, active only", () => {
  /** A `sql` whose reads answer `rows` in turn, and whose `begin` runs its body on the same: no database. */
  function fakeSql(reads: Record<string, unknown>[][]) {
    const calls = { queries: 0, begins: 0 };
    const next = () => {
      calls.queries += 1;
      return Promise.resolve(reads.shift() ?? []);
    };
    const query = Object.assign(next, {
      begin: (body: (tx: unknown) => Promise<unknown>) => {
        calls.begins += 1;
        return body(query);
      },
    });
    return { sql: query as unknown as ApiSql, calls };
  }
  const row = (state: string) => ({
    id: "acct_a",
    state,
    display_name: "Ana",
    age_confirmed: true,
    version: 0,
    avatar_version: null,
  });
  const clock = { sample: () => Promise.resolve(Temporal.Instant.from("2026-11-11T05:00:00Z")) } as unknown as Clock;

  it("asks nothing of the verifier or the database for a header that isn't a bearer token", async () => {
    const { sql: fake, calls } = fakeSql([]);
    const authenticate = sessions({ verifier: () => Promise.reject(new Error("asked")), sql: fake, clock });
    for (const header of [undefined, "", "Basic x", "Bearer", "Bearer  x"])
      expect(await authenticate(header)).toBeNull();
    expect(calls).toEqual({ queries: 0, begins: 0 });
  });

  it("is no session, with no database read, when the verifier says the token is bad", async () => {
    const { sql: fake, calls } = fakeSql([]);
    const authenticate = sessions({ verifier: () => Promise.resolve(null), sql: fake, clock });
    expect(await authenticate("Bearer a.b.c")).toBeNull();
    expect(calls).toEqual({ queries: 0, begins: 0 });
  });

  it("lets can't-tell through untouched, with no database read", async () => {
    const { sql: fake, calls } = fakeSql([]);
    const trouble = new KeysUnavailable("timeout");
    const authenticate = sessions({ verifier: () => Promise.reject(trouble), sql: fake, clock });
    await expect(authenticate("Bearer a.b.c")).rejects.toBe(trouble);
    expect(calls).toEqual({ queries: 0, begins: 0 });
  });

  it("finds an active account with one read and makes none", async () => {
    const { sql: fake, calls } = fakeSql([[row("active")]]);
    const authenticate = sessions({
      verifier: () => Promise.resolve("00000000-0000-4000-8000-000000000001"),
      sql: fake,
      clock,
    });
    expect(await authenticate("Bearer a.b.c")).toMatchObject({ id: "acct_a", state: "active" });
    expect(calls).toEqual({ queries: 1, begins: 0 });
  });

  it("is no session for an account whose deletion has begun, and makes no new one (T27)", async () => {
    const { sql: fake, calls } = fakeSql([[row("deleting")]]);
    const authenticate = sessions({
      verifier: () => Promise.resolve("00000000-0000-4000-8000-000000000001"),
      sql: fake,
      clock,
    });
    expect(await authenticate("Bearer a.b.c")).toBeNull();
    expect(calls).toEqual({ queries: 1, begins: 0 });
  });

  it("makes the account on the first request, in one transaction, and returns it", async () => {
    // find (none), then createAccount: the insert, then the read of what it made.
    const { sql: fake, calls } = fakeSql([[], [], [row("active")]]);
    const authenticate = sessions({
      verifier: () => Promise.resolve("00000000-0000-4000-8000-000000000001"),
      sql: fake,
      clock,
    });
    expect(await authenticate("Bearer a.b.c")).toMatchObject({ id: "acct_a" });
    expect(calls.begins).toBe(1);
  });

  it("is no session when the account made has vanished, as only a finished deletion does", async () => {
    const { sql: fake } = fakeSql([[], [], []]);
    const authenticate = sessions({
      verifier: () => Promise.resolve("00000000-0000-4000-8000-000000000001"),
      sql: fake,
      clock,
    });
    expect(await authenticate("Bearer a.b.c")).toBeNull();
  });
});
