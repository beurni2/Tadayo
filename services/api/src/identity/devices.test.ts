/// <reference lib="esnext.temporal" />
// The device routes as the contract has them (the contract's `registerDevice` and `removeDevice`; spec 21, 23;
// T14, T52, T55; TECH-DESIGN section 6, device registration (a) to (e)), with no database: the serializer's
// field list held against the contract's example, read from the contract and not copied by hand; everything
// refused before a transaction, by its first bad field and never its value; what the routes answer; that the
// secret reaches the database only as its hash; and that no token or secret is in an answer or a log line. The
// commands, their locks and the ended sign-ins are on Postgres (tests/src/db/devices.test.ts), and every role's
// answers are the privacy matrix's.

import { createHash } from "node:crypto";
import { DeviceRegistration as DeviceRegistrationSchema } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import { Refused, type Account, type Clock, type DeviceRegistration, type ServerNow } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import type { Authenticate } from "../session.ts";
import { noStorage } from "../testing.ts";
import { deviceRegistrationBody } from "./devices.ts";

type Body = Record<string, unknown>;

const account: Account = {
  id: "acct_ben",
  state: "active",
  displayName: "Ben",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
/** A token and a secret as an iPhone and the app make them; each is looked for in every answer and log line. */
const TOKEN = "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90";
const SECRET = "q8Zt3kV0pX1mN5bR7cL2wH9dJ4sF6gY0aE3uT8iO1zQ";
const SECRET_HASH = createHash("sha256").update(SECRET).digest("hex");
const REGISTER = {
  apns_token: TOKEN,
  apns_environment: "production",
  timezone: "America/New_York",
  removal_secret: SECRET,
};

const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for Ben whose transactions are `begin`, and its log lines. */
async function appFor(
  begin: (...args: unknown[]) => Promise<unknown>,
  options: { clock?: Clock; authenticate?: Authenticate } = {},
) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const lines: string[] = [];
  const asked = { count: 0 };
  const authenticate = options.authenticate ?? (() => Promise.resolve(account));
  const deps: Deps = {
    sql,
    clock: options.clock ?? ({} as Clock),
    authenticate: (header) => {
      asked.count += 1;
      return authenticate(header);
    },
    storage: noStorage,
    log: { level: "debug", stream: { write: (line) => void lines.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  const answer = async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
  return { answer, lines, asked };
}

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});
const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };
const neutral = { status: 404, body: '{"code":"NOT_FOUND"}', headers };
const put = (payload: string): InjectOptions => ({
  method: "PUT",
  url: "/v1/devices/current",
  headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
  payload,
});
const remove = (payload: string): InjectOptions => ({
  method: "POST",
  url: "/v1/device-removals",
  headers: { "content-type": "application/json" },
  payload,
});
const none = () => {
  let begun = 0;
  return {
    begin: () => {
      begun += 1;
      return Promise.reject(new Error("no database"));
    },
    begun: () => begun,
  };
};

/** Fails if `text` holds the token, in any case, or the secret. */
function expectNeither(text: string, what: string): void {
  expect(text.toLowerCase(), what).not.toContain(TOKEN.toLowerCase());
  expect(text, what).not.toContain(SECRET);
}

describe("the registration's serializer against the contract's example (T55)", () => {
  const examples = Object.entries(successExamples("registerDevice") ?? {});

  it("has the contract's scene to hold: registered in New York", () => {
    expect(examples.map(([name]) => name)).toEqual(["registered"]);
  });

  it.each(examples)("makes %s field for field, with no token and no secret", (_name, example) => {
    const value = example.value as Body;
    const made = deviceRegistrationBody({
      apnsEnvironment: value["apns_environment"] === "sandbox" ? "sandbox" : "production",
      timezone: String(value["timezone"]),
      registeredAt: Temporal.Instant.from(String(value["registered_at"])) as ServerNow,
    });
    expect(made).toEqual(value);
    expect(Object.keys(made as Body)).toEqual(["apns_environment", "timezone", "registered_at"]);
    expect(DeviceRegistrationSchema.strict().safeParse(made).success).toBe(true);
  });

  it("sends the time in whole seconds, rounded down, as every instant of the contract", () => {
    const made = deviceRegistrationBody({
      apnsEnvironment: "sandbox",
      timezone: "Asia/Tokyo",
      registeredAt: Temporal.Instant.from("2026-11-24T03:30:00.999999Z") as ServerNow,
    }) as Body;
    expect(made).toEqual({
      apns_environment: "sandbox",
      timezone: "Asia/Tokyo",
      registered_at: "2026-11-24T03:30:00Z",
    });
  });
});

describe("what registerDevice refuses before any transaction", () => {
  it("names the first bad field, never its value", async () => {
    const db = none();
    const { answer } = await appFor(db.begin);
    const cases: [Body, string][] = [
      [{ ...REGISTER, apns_token: undefined }, "apns_token"],
      [{ ...REGISTER, apns_token: TOKEN.slice(0, 15) }, "apns_token"],
      [{ ...REGISTER, apns_token: `${TOKEN}g` }, "apns_token"],
      [{ ...REGISTER, apns_token: "a".repeat(513) }, "apns_token"],
      [{ ...REGISTER, apns_token: ` ${TOKEN}` }, "apns_token"],
      [{ ...REGISTER, apns_token: 7 }, "apns_token"],
      [{ ...REGISTER, apns_environment: "development" }, "apns_environment"],
      [{ ...REGISTER, apns_environment: "Production" }, "apns_environment"],
      [{ ...REGISTER, timezone: "+05" }, "timezone"],
      [{ ...REGISTER, timezone: "T07+05" }, "timezone"],
      [{ ...REGISTER, timezone: "" }, "timezone"],
      [{ ...REGISTER, timezone: "A".repeat(65) }, "timezone"],
      [{ ...REGISTER, removal_secret: SECRET.slice(0, 42) }, "removal_secret"],
      [{ ...REGISTER, removal_secret: `${SECRET}=` }, "removal_secret"],
      [{ ...REGISTER, removal_secret: "a".repeat(129) }, "removal_secret"],
      [{ ...REGISTER, removal_secret: null }, "removal_secret"],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(put(JSON.stringify(payload)));
      expect(got, `${field} ${JSON.stringify(payload).slice(0, 40)}`).toMatchObject({ ...invalid(field), headers });
      expectNeither(got.body, field);
    }
    expect(db.begun()).toBe(0);
  });

  it("refuses any key past the contract's four, and a body that isn't an object, unnamed", async () => {
    const db = none();
    const { answer } = await appFor(db.begin);
    for (const payload of [
      { ...REGISTER, user_id: "acct_ana" },
      { ...REGISTER, sign_in: SECRET_HASH },
      { ...REGISTER, registered_at: "2026-01-01T00:00:00Z" },
      [],
      null,
      "token",
    ]) {
      const got = await answer(put(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload).slice(0, 40)).toMatchObject(invalid());
      expect(got.body).not.toMatch(/acct_ana|2026/);
      expectNeither(got.body, "unknown key");
    }
    expect(db.begun()).toBe(0);
  });

  it("takes a body up to its limit of 10 KiB and none above it, twice the largest valid one", async () => {
    const db = none();
    const { answer } = await appFor(db.begin);
    // The largest body the contract allows: the longest token and secret, the longest zone the server resolves
    // (as clubs/club.test.ts), every key and character written as an escape.
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("apns_token")}:${escape("f".repeat(512))},${escape("apns_environment")}:${escape("production")},${escape("timezone")}:${escape("America/Argentina/ComodRivadavia")},${escape("removal_secret")}:${escape("_".repeat(128))}}`;
    const limit = 10 * 1024;
    expect(bodyLimitOf("registerDevice")).toBe(limit);
    expect(limit).toBeLessThan(BODY_LIMIT);
    const valid = JSON.stringify(REGISTER);
    const sized = (bytes: number) => `${valid.slice(0, -1)}${" ".repeat(bytes - valid.length)}}`;
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    expect(await answer(put(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
    for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
      expect(await answer(put(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(db.begun()).toBe(1);
    expect(JSON.parse(largest)).toMatchObject({ apns_environment: "production" });
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(await answer(put(largest))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(2);
  });
});

describe("what removeDevice refuses before any transaction", () => {
  it("names the secret when it is missing or isn't one, never its value, and refuses any other key unnamed", async () => {
    const db = none();
    const { answer, asked } = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "removal_secret"],
      [{ removal_secret: "" }, "removal_secret"],
      [{ removal_secret: SECRET.slice(0, 42) }, "removal_secret"],
      [{ removal_secret: `${SECRET}.` }, "removal_secret"],
      [{ removal_secret: [SECRET] }, "removal_secret"],
      [{ removal_secret: SECRET, apns_token: TOKEN }, undefined],
      [{ removal_secret: SECRET, user_id: "acct_ana" }, undefined],
      [[], undefined],
      [null, undefined],
      [SECRET, undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(remove(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject({ ...invalid(field), headers });
      expectNeither(got.body, String(field));
      expect(got.body).not.toContain("acct_ana");
    }
    expect(db.begun()).toBe(0);
    expect(asked.count).toBe(0);
  });

  it("takes a body up to its limit of 2 KiB and none above it, twice the largest valid one", async () => {
    const db = none();
    const { answer } = await appFor(db.begin);
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("removal_secret")}:${escape("-".repeat(128))}}`;
    const limit = 2 * 1024;
    expect(bodyLimitOf("removeDevice")).toBe(limit);
    const valid = JSON.stringify({ removal_secret: SECRET });
    const sized = (bytes: number) => `${valid.slice(0, -1)}${" ".repeat(bytes - valid.length)}}`;
    expect(await answer(remove(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
    for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
      expect(await answer(remove(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(db.begun()).toBe(1);
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(await answer(remove(largest))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(2);
  });
});

/**
 * A transaction that answers every statement with no rows and keeps the values bound to them, and a clock
 * whose sample is a fixed instant: enough to see what a command hands the database.
 */
function recording() {
  const bound: unknown[] = [];
  const tx = (_template: TemplateStringsArray, ...values: unknown[]) => {
    bound.push(...values);
    return Promise.resolve([]);
  };
  const clock: Clock = {
    sample: () => Promise.resolve(Temporal.Instant.from("2026-11-24T03:30:00Z") as ServerNow),
  };
  return { begin: (body: (sql: typeof tx) => Promise<unknown>) => body(tx), clock, bound };
}

describe("what the device routes answer", () => {
  const registered: DeviceRegistration = {
    apnsEnvironment: "production",
    timezone: "America/New_York",
    registeredAt: Temporal.Instant.from("2026-11-09T14:41:00Z") as ServerNow,
  };

  it("answers a registration with 200 and the registration as stored, with no token and no secret", async () => {
    const { answer } = await appFor(() => Promise.resolve(registered));
    const got = await answer(put(JSON.stringify(REGISTER)));
    expect(got).toMatchObject({
      status: 200,
      body: JSON.stringify(successExamples("registerDevice")?.["registered"]?.value),
      headers,
    });
    expectNeither(got.body, "200");
  });

  it("answers a removal that removed a registration with 204, nothing in it, and never asks who is calling", async () => {
    const { answer, asked } = await appFor(() => Promise.resolve("removed"), {
      authenticate: () => Promise.reject(new Error("asked")),
    });
    for (const authorization of [undefined, "Bearer a.b.c", "garbage"]) {
      const request = remove(JSON.stringify({ removal_secret: SECRET }));
      if (authorization !== undefined) request.headers = { ...request.headers, authorization };
      expect(await answer(request), String(authorization)).toEqual({
        status: 204,
        body: "",
        headers: { "cache-control": "private, no-store" },
      });
    }
    expect(asked.count).toBe(0);
  });

  it("answers a removal that found nothing with the neutral not-found, which also ends the app's removal (T14)", async () => {
    const { answer } = await appFor(() => Promise.resolve("none"));
    expect(await answer(remove(JSON.stringify({ removal_secret: SECRET })))).toMatchObject(neutral);
  });

  it("hands the database the secret's hash and the token in lowercase, never the secret or the token as sent", async () => {
    const db = recording();
    const { answer } = await appFor(db.begin as never, { clock: db.clock });
    // No account row comes back, so the command stops at the account: a deletion that began since the gate.
    expect(await answer(put(JSON.stringify(REGISTER)))).toMatchObject({ status: 401 });
    const text = JSON.stringify(db.bound);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(TOKEN);
    expect(text).toContain(SECRET_HASH);
    expect(text).toContain(TOKEN.toLowerCase());
    expect(db.bound).toContain("acct_ben");

    const removal = recording();
    const { answer: removing } = await appFor(removal.begin as never, { clock: removal.clock });
    expect(await removing(remove(JSON.stringify({ removal_secret: SECRET })))).toMatchObject(neutral);
    expect(JSON.stringify(removal.bound)).not.toContain(SECRET);
    expect(JSON.stringify(removal.bound)).toContain(SECRET_HASH);
  });

  it("maps the refusals: an ended or another account's sign-in is the neutral not-found; a zone the server can't resolve names the zone", async () => {
    for (const [refused, status, body] of [
      [new Refused("NOT_FOUND"), 404, '{"code":"NOT_FOUND"}'],
      [new Refused("INVALID_REQUEST", { field: "timezone" }), 400, '{"code":"INVALID_REQUEST","field":"timezone"}'],
      [new Refused("UNAUTHENTICATED"), 401, '{"code":"UNAUTHENTICATED"}'],
      [new Refused("PROFILE_INCOMPLETE"), 403, '{"code":"PROFILE_INCOMPLETE"}'],
    ] as const) {
      const { answer } = await appFor(() => Promise.reject(refused));
      const got = await answer(put(JSON.stringify(REGISTER)));
      expect(got, refused.code).toMatchObject({ status, body, headers });
    }
  });

  it("refuses a zone of the right shape that the server can't resolve, naming the zone and not its value", async () => {
    const db = recording();
    const { answer } = await appFor(db.begin as never, { clock: db.clock });
    for (const timezone of ["Mars/Olympus_Mons", "BST", "Etc/GMT+99"]) {
      const got = await answer(put(JSON.stringify({ ...REGISTER, timezone })));
      expect(got, timezone).toMatchObject({ ...invalid("timezone"), headers });
      expect(got.body).not.toContain(timezone);
    }
    // Refused before any statement: nothing was locked or read.
    expect(db.bound).toEqual([]);
  });

  it("answers a database that failed with nothing", async () => {
    const { answer } = await appFor(() => Promise.reject(new Error(`no database ${TOKEN} ${SECRET}`)));
    for (const request of [put(JSON.stringify(REGISTER)), remove(JSON.stringify({ removal_secret: SECRET }))]) {
      expect(await answer(request)).toMatchObject({ status: 500, body: "" });
    }
  });

  it("writes no token and no secret into any log line, whatever the answer", async () => {
    for (const begin of [
      () => Promise.resolve(registered),
      () => Promise.reject(new Refused("NOT_FOUND")),
      () => Promise.reject(new Error(`no database ${TOKEN} ${SECRET}`)),
    ]) {
      const { answer, lines } = await appFor(begin);
      await answer(put(JSON.stringify(REGISTER)));
      await answer(put(JSON.stringify({ ...REGISTER, timezone: "+05" })));
      await answer(remove(JSON.stringify({ removal_secret: SECRET })));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expectNeither(line, line.slice(0, 60));
    }
  });
});
