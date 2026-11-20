/// <reference lib="esnext.temporal" />
// Signing in, from a token to an answer, on the real pieces against Postgres as `tadayo_app` (spec 23;
// T1, T14, T19, T27, T52, T53, T55; FQ13, FQ69, FQ89): a token signed as Supabase signs it, verified
// against the project's key set by the real verifier, its subject mapped by the real `sessions` to the
// account made on the first request, the gate's decision and the routes' answers. The pieces have their
// own tests (identity/token.test.ts, session.test.ts, identity.test.ts, update-me.test.ts); these prove
// they fit: the acceptance of slice 8 (docs/plans/B0.md).

import { randomBytes, randomUUID } from "node:crypto";
import { buildApp, connect, KeysUnavailable, sessions, verifierFor, type KeySet } from "@tadayo/api";
import { testSigner, TEST_EMAIL, type TestSigner } from "@tadayo/api/testing";
import { ClubList, Me } from "@tadayo/contracts";
import { fakeClock } from "@tadayo/domain/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { worldSql } from "./harness.ts";
import { AT } from "./world.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");

/** The server's clock for these tests: whole microseconds, with a fraction a rounded-down instant must drop. */
const clock = fakeClock("2026-11-11T05:00:00.123456Z");
const JSON_HEADERS = { "content-type": "application/json" };

const api = connect(DATABASE_URL);
const world = worldSql(4);
let signer: TestSigner;
let app: FastifyInstance;
let unreadable: FastifyInstance;

beforeAll(async () => {
  signer = await testSigner();
  const verifier = verifierFor(signer.keys, { issuer: signer.issuer });
  app = buildApp({ sql: api, clock, authenticate: sessions({ verifier, sql: api, clock }), log: { level: "silent" } });
  await app.ready();
  // A project whose keys can't be read at all, as when Supabase can't be reached.
  const down: KeySet = Object.assign(() => Promise.reject(new KeysUnavailable("unreachable")), {
    jwks: () => undefined,
  });
  const lost = verifierFor(down, { issuer: signer.issuer });
  unreadable = buildApp({
    sql: api,
    clock,
    authenticate: sessions({ verifier: lost, sql: api, clock }),
    log: { level: "silent" },
  });
  await unreadable.ready();
});

afterAll(async () => {
  await Promise.all([app.close(), unreadable.close(), world.end()]);
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** `request` as the caller with `token` makes it. */
const call = (
  token: string | undefined,
  request: { method: "GET" | "PATCH" | "POST"; url: string; headers?: Record<string, string>; payload?: unknown },
  on: FastifyInstance = app,
) =>
  on.inject({
    method: request.method,
    url: request.url,
    headers: { ...(token === undefined ? {} : bearer(token)), ...request.headers },
    ...(request.payload === undefined ? {} : { payload: JSON.stringify(request.payload) }),
  });

/** An answer as bytes, without its Date: what two answers must share to be told apart by nothing. */
async function bytesOf(token: string | undefined, url = "/v1/me", on: FastifyInstance = app): Promise<string> {
  const response = await call(token, { method: "GET", url }, on);
  const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => name !== "date"));
  return JSON.stringify({ status: response.statusCode, headers, body: response.body });
}

const usersOf = async (subject: string) =>
  world<{ id: string; state: string }[]>`SELECT id, state FROM app.users WHERE auth_subject = ${subject}`;

describe("the first sign-in (spec 23)", () => {
  it("makes the person's account on their first request, answers it as the contract's Me and finds it again", async () => {
    const subject = randomUUID();
    const token = await signer.token(subject);
    const first = await call(token, { method: "GET", url: "/v1/me" });
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("private, no-store");
    const body: unknown = JSON.parse(first.body);
    expect(Me.safeParse(body).success).toBe(true);
    // No name, no age confirmation and version 0: a new account's profile isn't finished (FQ69).
    expect(body).toEqual({
      id: expect.stringMatching(/^acct_[A-Za-z0-9_-]{22}$/) as string,
      age_confirmed: false,
      version: 0,
    });
    const again = await call(await signer.token(subject), { method: "GET", url: "/v1/me" });
    expect(JSON.parse(again.body)).toEqual(body);
    const rows = await usersOf(subject);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: (body as { id: string }).id, state: "active" });
    // The email address in the token's claims is nowhere in the answer or the row (T52, T55; spec 23).
    expect(first.body).not.toContain(TEST_EMAIL);
    const [row] = await world<
      { text: string }[]
    >`SELECT to_jsonb(u)::text AS text FROM app.users u WHERE u.auth_subject = ${subject}`;
    expect(row?.text).not.toContain("example.invalid");
    expect(row?.text).not.toContain(TEST_EMAIL);
  });

  it("makes one account when the first request is retried at once, twenty times, on one token or on a fresh token each", async () => {
    const subject = randomUUID();
    const tokens = await Promise.all(Array.from({ length: 20 }, () => signer.token(subject)));
    const answers = await Promise.all(
      tokens.map((token, index) => call(index % 2 === 0 ? tokens[0] : token, { method: "GET", url: "/v1/me" })),
    );
    expect(answers.map((one) => one.statusCode)).toEqual(Array.from({ length: 20 }, () => 200));
    expect(new Set(answers.map((one) => (JSON.parse(one.body) as { id: string }).id)).size).toBe(1);
    expect(await usersOf(subject)).toHaveLength(1);
  });

  it("gives two people two accounts, and the same person the same one whatever token they hold", async () => {
    const [ana, ben] = [randomUUID(), randomUUID()];
    const idOf = async (subject: string) =>
      (JSON.parse((await call(await signer.token(subject), { method: "GET", url: "/v1/me" })).body) as { id: string })
        .id;
    const ids = [await idOf(ana), await idOf(ben), await idOf(ana)];
    expect(ids[0]).toBe(ids[2]);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("a new account's clubs (FQ13, FQ69)", () => {
  const profile = (version: number, key: string = randomUUID()) => ({
    method: "PATCH" as const,
    url: "/v1/me",
    headers: { ...JSON_HEADERS, "idempotency-key": key },
    payload: { expected_version: version },
  });

  it("is two empty lists and the server's instant once the profile is finished, for the caller alone", async () => {
    const token = await signer.token(randomUUID());
    const sent = profile(0);
    const finished = await call(token, {
      ...sent,
      payload: { expected_version: 0, age_confirmed: true, display_name: "Ana" },
    });
    expect(finished.statusCode).toBe(200);
    expect(JSON.parse(finished.body)).toMatchObject({ display_name: "Ana", age_confirmed: true, version: 1 });
    const clubs = await call(token, { method: "GET", url: "/v1/clubs" });
    expect(clubs.statusCode).toBe(200);
    expect(clubs.headers["cache-control"]).toBe("private, no-store");
    expect(clubs.headers["content-type"]).toBe("application/json; charset=utf-8");
    const body: unknown = JSON.parse(clubs.body);
    // The server's instant, whole seconds rounded down (the contract's instant), from the server's clock.
    expect(body).toEqual({ server_now: "2026-11-11T05:00:00Z", clubs: [], invitations: [] });
    expect(ClubList.safeParse(body).success).toBe(true);
  });

  it("is PROFILE_INCOMPLETE until both the age and the name are in: the gate's answer for a route that isn't beforeProfile", async () => {
    const token = await signer.token(randomUUID());
    const incomplete = '{"code":"PROFILE_INCOMPLETE"}';
    const asked = await call(token, { method: "GET", url: "/v1/clubs" });
    expect([asked.statusCode, asked.body]).toEqual([403, incomplete]);
    // Beforehand the account can read itself and finish its profile: those routes are open to it.
    expect((await call(token, { method: "GET", url: "/v1/me" })).statusCode).toBe(200);
    const age = await call(token, { ...profile(0), payload: { expected_version: 0, age_confirmed: true } });
    expect(JSON.parse(age.body)).toEqual({ id: expect.any(String) as string, age_confirmed: true, version: 1 });
    expect((await call(token, { method: "GET", url: "/v1/clubs" })).body).toBe(incomplete);
    const named = await call(token, { ...profile(1), payload: { expected_version: 1, display_name: "Ana" } });
    expect(JSON.parse(named.body)).toMatchObject({ display_name: "Ana", version: 2 });
    expect((await call(token, { method: "GET", url: "/v1/clubs" })).statusCode).toBe(200);
  });

  it("answers a retried finish with the first answer, a stale one with the version and a changed one with a conflict (T19)", async () => {
    const token = await signer.token(randomUUID());
    const key = randomUUID();
    const body = { expected_version: 0, age_confirmed: true, display_name: "Ana" };
    const first = await call(token, { ...profile(0, key), payload: body });
    const retried = await call(token, { ...profile(0, key), payload: body });
    expect([retried.statusCode, retried.body]).toEqual([200, first.body]);
    const stale = await call(token, { ...profile(0), payload: { expected_version: 0, display_name: "Ana B" } });
    expect([stale.statusCode, stale.body]).toEqual([409, '{"code":"VERSION_CONFLICT","current_version":1}']);
    const changed = await call(token, { ...profile(0, key), payload: { expected_version: 0, display_name: "Ana C" } });
    expect([changed.statusCode, changed.body]).toEqual([409, '{"code":"IDEMPOTENCY_CONFLICT"}']);
    for (const answer of [first, retried, stale, changed])
      expect(answer.headers["cache-control"]).toBe("private, no-store");
    // Nothing changed after the first: the account is what the first request made it.
    expect(JSON.parse((await call(token, { method: "GET", url: "/v1/me" })).body)).toMatchObject({
      display_name: "Ana",
      version: 1,
    });
  });
});

describe("a token that is no session (T14, T53)", () => {
  it("is the one 401, byte for byte, whatever is wrong with it, and makes no account", async () => {
    const subject = randomUUID();
    const elsewhere = await testSigner();
    const bad: Record<string, string | undefined> = {
      "no header": undefined,
      "not a token": "garbage",
      "another project's key": await elsewhere.token(subject),
      "another project's issuer": await signer.token(subject, {
        claims: { iss: "https://otherprojectrefabcdef.supabase.co/auth/v1" },
      }),
      expired: await signer.token(subject, { claims: { iat: 1_700_000_000, exp: 1_700_003_600 } }),
      "not yet valid": await signer.token(subject, { claims: { nbf: 4_102_444_800 } }),
      "another audience": await signer.token(subject, { claims: { aud: "anon" } }),
      "the service role": await signer.token(subject, { claims: { role: "service_role" } }),
      anonymous: await signer.token(subject, { claims: { is_anonymous: true } }),
      "no subject": await signer.token(subject, { claims: { sub: null } }),
      "a subject that isn't a UUID": await signer.token(subject, { claims: { sub: "ana" } }),
      unsecured: await signer.token(subject, { alg: "none" }),
      "a shared secret": await signer.token(subject, { secret: new TextEncoder().encode("a".repeat(32)) }),
    };
    const none = await bytesOf(undefined);
    expect(JSON.parse(none)).toMatchObject({ status: 401, body: '{"code":"UNAUTHENTICATED"}' });
    for (const [what, token] of Object.entries(bad)) {
      expect(await bytesOf(token), what).toBe(none);
      // A body or a bad request is never reached: the gate is first.
      const sent = await call(token, {
        method: "PATCH",
        url: "/v1/me",
        headers: JSON_HEADERS,
        payload: { expected_version: "x" },
      });
      expect(sent.statusCode, what).toBe(401);
    }
    // Not one of them made an account for the subject, and a good token for it still works.
    expect(await usersOf(subject)).toEqual([]);
    expect((await call(await signer.token(subject), { method: "GET", url: "/v1/me" })).statusCode).toBe(200);
    expect(await usersOf(subject)).toHaveLength(1);
  });

  it("isn't asked for on a public route: no header is read there, so a good token makes no account and a bad one changes nothing", async () => {
    const subject = randomUUID();
    const good = await signer.token(subject);
    // One route that isn't built yet, and the web preview with a token nobody made: each is the neutral
    // not-found, the same for a good session token, a bad one and none (never the gate's 401).
    const unmade = randomBytes(32).toString("base64url");
    for (const [url, payload] of [
      ["/v1/device-removals", {}],
      ["/v1/invitations/web-preview", { token: unmade }],
    ] as const) {
      const answers = await Promise.all(
        [good, "garbage", undefined].map((token) =>
          call(token, { method: "POST", url, headers: JSON_HEADERS, payload }),
        ),
      );
      expect(
        answers.map((answer) => [answer.statusCode, answer.body]),
        url,
      ).toEqual(Array.from({ length: 3 }, () => [404, '{"code":"NOT_FOUND"}']));
    }
    expect(await usersOf(subject)).toEqual([]);
  });

  it("is that same 401 for an account whose deletion has begun, at once, on the token it was signed in with (T27)", async () => {
    const subject = randomUUID();
    const token = await signer.token(subject);
    expect((await call(token, { method: "GET", url: "/v1/me" })).statusCode).toBe(200);
    await world`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE auth_subject = ${subject}`;
    expect(await bytesOf(token)).toBe(await bytesOf(undefined));
    // And a new token for the same person is no way back in, and makes no second account.
    expect(await bytesOf(await signer.token(subject))).toBe(await bytesOf(undefined));
    expect(await usersOf(subject)).toHaveLength(1);
  });

  it("is a 503 with nothing in it, never a 401, when the keys that check tokens can't be read (FQ89)", async () => {
    const subject = randomUUID();
    const response = await call(await signer.token(subject), { method: "GET", url: "/v1/me" }, unreadable);
    expect([response.statusCode, response.body]).toEqual([503, ""]);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    // Not a session ended by a hiccup: no 401, and no account made for a token that wasn't judged.
    expect(await usersOf(subject)).toEqual([]);
  });
});
