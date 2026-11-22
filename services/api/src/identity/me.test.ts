// `GET /v1/me` and `PATCH /v1/me` as the contract has them (spec 23; FQ13, FQ69; T19, T55), with no
// database: the serializer's field list, and everything the route refuses before the command runs. The
// command itself, its receipts and its races are against Postgres (tests/src/db/update-me.test.ts).

import { Me } from "@tadayo/contracts";
import { Refused, type Account, type Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { firstBadField, meBody } from "./me.ts";
import { noStorage } from "../testing.ts";

const account = (over: Partial<Account> = {}): Account => ({
  id: "acct_ana",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
  ...over,
});

const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for `caller`, whose transactions are `begin`: what the route does with the database, no database. */
async function appFor(
  caller: Account,
  begin: (...args: unknown[]) => Promise<unknown> = () => Promise.reject(new Error("no database")),
) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => Promise.resolve(caller),
    storage: noStorage,
    log: { level: "silent" },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  return async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
}

describe("GET /v1/me (spec 23, T55)", () => {
  it("answers the contract's Me for the caller, for the caller alone, and nothing else", async () => {
    const answer = await appFor(account({ displayName: "Ana", avatarVersion: "v_abc", version: 3 }));
    const got = await answer({ method: "GET", url: "/v1/me" });
    expect(got.status).toBe(200);
    expect(got.headers["cache-control"]).toBe("private, no-store");
    expect(got.headers["content-type"]).toBe("application/json; charset=utf-8");
    const body: unknown = JSON.parse(got.body);
    expect(body).toEqual({
      id: "acct_ana",
      display_name: "Ana",
      avatar_version: "v_abc",
      age_confirmed: true,
      version: 3,
    });
    expect(Me.safeParse(body).success).toBe(true);
  });

  it("leaves the name and the avatar out when there are none, and says the age is not confirmed", async () => {
    const answer = await appFor(account({ displayName: null, avatarVersion: null, ageConfirmed: false, version: 0 }));
    const got = await answer({ method: "GET", url: "/v1/me" });
    expect(JSON.parse(got.body)).toEqual({ id: "acct_ana", age_confirmed: false, version: 0 });
  });

  it("is open to a caller whose profile isn't finished: it must read its own version to finish it (FQ69)", async () => {
    const answer = await appFor(account({ displayName: null, ageConfirmed: false }));
    expect((await answer({ method: "GET", url: "/v1/me" })).status).toBe(200);
  });

  it("is an explicit field list: whatever else an account object carries never reaches the answer (T55)", () => {
    const rich = { ...account({ avatarVersion: "v_abc" }), email: "a@b.invalid", phone: "+10000000000", subject: "x" };
    expect(Object.keys(meBody(rich as Account) as object).sort()).toEqual([
      "age_confirmed",
      "avatar_version",
      "display_name",
      "id",
      "version",
    ]);
    expect(JSON.stringify(meBody(rich as Account))).not.toMatch(/a@b|phone|subject|\+1000/);
  });
});

describe("PATCH /v1/me: what is refused before the command runs (the contract's INVALID_REQUEST)", () => {
  const send = (answer: Awaited<ReturnType<typeof appFor>>, payload: unknown, headers: Record<string, string> = {}) =>
    answer({
      method: "PATCH",
      url: "/v1/me",
      headers: { "content-type": "application/json", "idempotency-key": KEY, ...headers },
      payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const invalid = (field?: string) => ({
    status: 400,
    body: JSON.stringify(field === undefined ? { code: "INVALID_REQUEST" } : { code: "INVALID_REQUEST", field }),
  });

  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong with the body", async () => {
    const answer = await appFor(account());
    for (const key of [
      undefined,
      "",
      "abc",
      KEY.slice(1),
      `${KEY}0`,
      "5f1c9a1e3b0a4a549d0e0a3a7d5f2c11",
      `${KEY}, ${KEY}`,
    ]) {
      const headers = { "content-type": "application/json" } as Record<string, string>;
      if (key !== undefined) headers["idempotency-key"] = key;
      // A body that is JSON but wrong; one that isn't JSON at all is refused by Fastify first, with no field.
      const got = await answer({ method: "PATCH", url: "/v1/me", headers, payload: '{"display_name":""}' });
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
    }
  });

  it("takes the key the app makes, a UUIDv7 (TECH-DESIGN section 4), in either case, and a UUIDv4 as well", async () => {
    const answer = await appFor(account());
    for (const key of [
      "018f3b8e-0f4a-7c3e-9b2d-5e8a6f1c4d20",
      "018F3B8E-0F4A-7C3E-9B2D-5E8A6F1C4D20",
      "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11",
    ]) {
      // The key passes, so the refusal is the body's: a request with no version.
      expect(await send(answer, {}, { "idempotency-key": key }), key).toMatchObject(invalid("expected_version"));
    }
  });

  it("names the first bad field in the contract's order, and never a value", async () => {
    const answer = await appFor(account());
    const cases: [unknown, string | undefined][] = [
      [{}, "expected_version"],
      [{ expected_version: "1" }, "expected_version"],
      [{ expected_version: -1 }, "expected_version"],
      [{ expected_version: 1.5 }, "expected_version"],
      [{ expected_version: null }, "expected_version"],
      [{ expected_version: 0, display_name: "" }, "display_name"],
      [{ expected_version: 0, display_name: " Ben" }, "display_name"],
      [{ expected_version: 0, display_name: "Ben " }, "display_name"],
      [{ expected_version: 0, display_name: "B".repeat(41) }, "display_name"],
      [{ expected_version: 0, display_name: "​" }, "display_name"],
      [{ expected_version: 0, display_name: "Ben‮X" }, "display_name"],
      [{ expected_version: 0, display_name: 7 }, "display_name"],
      // A lone surrogate, which Postgres would keep as U+FFFD: the contract refuses it, ahead of a later bad field.
      [{ expected_version: 0, display_name: "A\ud800B" }, "display_name"],
      [{ expected_version: 0, display_name: "\udc00", age_confirmed: false }, "display_name"],
      [{ expected_version: 0, age_confirmed: false }, "age_confirmed"],
      [{ expected_version: 0, age_confirmed: "true" }, "age_confirmed"],
      [{ expected_version: 0, avatar_upload_id: "" }, "avatar_upload_id"],
      [{ expected_version: 0, avatar_upload_id: "not an id!" }, "avatar_upload_id"],
      // The contract's order, not the body's: the first of the fields it names that is bad.
      [{ avatar_upload_id: "", display_name: "", age_confirmed: false }, "expected_version"],
      [{ expected_version: 0, avatar_upload_id: "", age_confirmed: false, display_name: "" }, "display_name"],
      [{ expected_version: 0, avatar_upload_id: "", age_confirmed: false }, "age_confirmed"],
      // An unknown key is no field of the contract's: refused, and never named or echoed.
      [{ expected_version: 0, email: "ana@example.invalid" }, undefined],
      [{ expected_version: 0, display_name: "Ben", __proto__x: 1, role: "admin" }, undefined],
      // Not an object at all.
      [[], undefined],
      [[{ expected_version: 0 }], undefined],
      [null, undefined],
      [7, undefined],
      ["text", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await send(answer, payload);
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.headers["cache-control"]).toBe("private, no-store");
      // Whatever the caller sent, none of it comes back.
      expect(got.body).not.toMatch(/ana@example|admin|text|Ben/);
    }
  });

  it("refuses a name that isn't well formed before any transaction, whatever the version: the API refuses a name rather than changing it", async () => {
    let begun = 0;
    const answer = await appFor(account(), () => {
      begun += 1;
      return Promise.reject(new Error("no database"));
    });
    for (const name of ["A\ud800B", "\udc00", "Ana\ud83d", "\ude00Ana", "\ud83d\ud83d", "\ude00\ud83d"]) {
      // Before the version is read, too: a stale one is no reason to answer anything else.
      for (const version of [3, 7]) {
        expect(
          await send(answer, { expected_version: version, display_name: name }),
          JSON.stringify(name),
        ).toMatchObject(invalid("display_name"));
      }
    }
    expect(begun).toBe(0);
    // A surrogate pair is an emoji, which is well formed: the request reaches the command.
    expect(await send(answer, { expected_version: 3, display_name: "Ana \u{1F600}" })).toMatchObject({
      status: 500,
      body: "",
    });
    expect(begun).toBe(1);
  });

  it("names only a path that is a field of the contract's, whatever issues the parser gives (a second lock)", () => {
    // The parser gives an unknown key no path today, so the route alone can't show this list: it is held
    // shut here, with the issues a later contract that let a key through would give.
    const named = (...paths: PropertyKey[][]) => firstBadField(paths.map((path) => ({ path })));
    expect(named(["email"])).toBeUndefined();
    expect(named(["email"], ["role"], ["display_name"], ["expected_version"])).toBe("display_name");
    expect(named([], [3], [Symbol("display_name")], ["constructor"], ["__proto__"], ["toString"])).toBeUndefined();
    expect(named(["avatar_upload_id", 0], ["age_confirmed"])).toBe("avatar_upload_id");
    expect(named(["Display_Name"], [" display_name"], ["display_name "])).toBeUndefined();
  });

  it("refuses a body that isn't JSON, a content type that isn't JSON and no body at all, with INVALID_REQUEST alone", async () => {
    const answer = await appFor(account());
    for (const [headers, payload] of [
      [{ "content-type": "application/json" }, "{bad"],
      [{ "content-type": "application/json" }, ""],
      [{ "content-type": "text/plain" }, '{"expected_version":0}'],
      [{ "content-type": "application/xml" }, "<me/>"],
      [{}, '{"expected_version":0}'],
    ] as const) {
      const got = await answer({
        method: "PATCH",
        url: "/v1/me",
        headers: { "idempotency-key": KEY, ...headers },
        payload,
      });
      expect(got, JSON.stringify(headers) + payload.slice(0, 8)).toMatchObject({
        status: 400,
        body: '{"code":"INVALID_REQUEST"}',
      });
    }
  });
});

describe("PATCH /v1/me: how much body it will read", () => {
  const send = (answer: Awaited<ReturnType<typeof appFor>>, payload: string) =>
    answer({
      method: "PATCH",
      url: "/v1/me",
      headers: { "content-type": "application/json", "idempotency-key": KEY },
      payload,
    });
  /** A body of exactly `bytes`, a name of `a`s in it. */
  const sized = (bytes: number): string => {
    const head = '{"expected_version":3,"display_name":"';
    return `${head}${"a".repeat(bytes - head.length - 2)}"}`;
  };

  it("refuses a body past the route's limit unread, with INVALID_REQUEST and no field: a million-character name is never counted", async () => {
    const answer = await appFor(account());
    const limit = bodyLimitOf("updateMe");
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    // A body of exactly the limit is read, and the contract refuses its name for its length: the field is named.
    expect(await send(answer, sized(limit))).toMatchObject({
      status: 400,
      body: '{"code":"INVALID_REQUEST","field":"display_name"}',
    });
    // One byte more is never read: Fastify refuses it from its Content-Length, so the answer has no field,
    // which a parse would have given.
    for (const bytes of [limit + 1, 70_000, 1_000_000]) {
      expect(await send(answer, sized(bytes)), String(bytes)).toMatchObject({
        status: 400,
        body: '{"code":"INVALID_REQUEST"}',
      });
    }
  });

  it("takes the largest body the contract allows, every key and code unit written as an escape: the limit shuts nothing valid out", async () => {
    // Forty clusters of sixteen code points, the most `text()` allows: a black flag and fifteen tag characters
    // each, all outside the Basic Multilingual Plane, so 640 code points are 1,280 code units, each written as
    // a six-byte escape, beside the other fields at their longest, their keys escaped too.
    const name = `\u{1F3F4}${"\u{E0067}".repeat(15)}`.repeat(40);
    // Each surrogate pair as one character: the code points.
    expect(name.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "x")).toHaveLength(640);
    expect(name).toHaveLength(1280);
    const escape = (text: string): string =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const payload =
      `{${escape("expected_version")}:2147483647,${escape("display_name")}:${escape(name)},` +
      `${escape("avatar_upload_id")}:${escape("a".repeat(64))},${escape("age_confirmed")}:true}`;
    expect(Buffer.byteLength(payload)).toBeGreaterThan(8 * 1024);
    expect(Buffer.byteLength(payload)).toBeLessThan(bodyLimitOf("updateMe") / 2);
    let reached = false;
    const answer = await appFor(account(), () => {
      reached = true;
      return Promise.reject(new Error("no database"));
    });
    // It was read, parsed and passed to the command, which the stand-in database fails: a bare 500.
    expect(await send(answer, payload)).toMatchObject({ status: 500, body: "" });
    expect(reached).toBe(true);
  });
});

describe("PATCH /v1/me: a refused command is the contract's answer", () => {
  const body = { expected_version: 3, display_name: "Ben" };
  async function refused(error: Error) {
    const answer = await appFor(account(), () => Promise.reject(error));
    return answer({
      method: "PATCH",
      url: "/v1/me",
      headers: { "content-type": "application/json", "idempotency-key": KEY },
      payload: JSON.stringify(body),
    });
  }

  it.each([
    [new Refused("VERSION_CONFLICT", { current_version: 7 }), 409, '{"code":"VERSION_CONFLICT","current_version":7}'],
    [new Refused("IDEMPOTENCY_CONFLICT"), 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
    [new Refused("MEDIA_NOT_READY"), 409, '{"code":"MEDIA_NOT_READY"}'],
    [new Refused("NOT_FOUND"), 404, '{"code":"NOT_FOUND"}'],
    [
      new Refused("INVALID_REQUEST", { field: "avatar_upload_id" }),
      400,
      '{"code":"INVALID_REQUEST","field":"avatar_upload_id"}',
    ],
    [new Refused("UNAUTHENTICATED"), 401, '{"code":"UNAUTHENTICATED"}'],
  ])("answers %s as %i %s", async (error, status, text) => {
    const got = await refused(error);
    expect(got.status).toBe(status);
    expect(got.body).toBe(text);
    expect(got.headers["cache-control"]).toBe("private, no-store");
    expect(got.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("answers a refusal whose code isn't the contract's with a bare 500: it is a bug, and says nothing", async () => {
    const got = await refused(new Refused("TEAPOT", { field: "display_name" }));
    expect(got).toMatchObject({ status: 500, body: "" });
  });

  it("answers an error that isn't a refusal, such as the database failing, with a bare 500 and nothing of the error", async () => {
    const got = await refused(new Error("duplicate key value (auth_subject)=(secret) ben@example.invalid"));
    expect(got).toMatchObject({ status: 500, body: "" });
    expect(JSON.stringify(got)).not.toMatch(/secret|ben@/);
  });
});
