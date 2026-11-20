/// <reference lib="esnext.temporal" />
// The leave route as the contract has it (the contract's `leaveClub`; spec 22; T14, T19, T26, T55), with
// no database: the serializer's field list, held against the contract's example, read from the contract
// and not copied by hand; everything refused before the command runs; and what the route answers. The
// command and its receipt are on Postgres (tests/src/db/leave-club.test.ts), and every role's answers are
// the privacy matrix's.

import { LeftClub } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import { Refused, type Account, type Clock } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { leftClubBody } from "./leave.ts";

type Body = Record<string, unknown>;

describe("the leave's serializer against the contract's example (T55)", () => {
  const examples = Object.entries(successExamples("leaveClub") ?? {});

  it("has the contract's scene to hold: a leave that keeps the drops", () => {
    expect(examples.map(([name]) => name)).toEqual(["kept"]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = leftClubBody({
      clubId: String(value["club_id"]),
      leftAt: Temporal.Instant.from(String(value["left_at"])),
      contributions: value["contributions"] === "withdraw" ? "withdraw" : "keep",
    });
    expect(made).toEqual(value);
    expect(LeftClub.strict().safeParse(made).success).toBe(true);
  });

  it("sends the instant in whole seconds, rounded down, and the choice as it was made", () => {
    expect(
      leftClubBody({
        clubId: "club_1",
        leftAt: Temporal.Instant.from("2026-11-13T14:41:00.999999Z"),
        contributions: "withdraw",
      }),
    ).toEqual({ club_id: "club_1", left_at: "2026-11-13T14:41:00Z", contributions: "withdraw" });
  });
});

const account: Account = {
  id: "acct_ben",
  state: "active",
  displayName: "Ben",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for Ben whose transactions are `begin`: what the route does with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => Promise.resolve(account),
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

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});
const LEAVE = "/v1/clubs/club_1/leave";
const KEEP = '{"contributions":"keep"}';
const post = (payload: string, key: string | null = KEY): InjectOptions => ({
  method: "POST",
  url: LEAVE,
  headers: { "content-type": "application/json", ...(key === null ? {} : { "idempotency-key": key }) },
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

describe("what leaveClub refuses before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
      const got = await answer(post('{"contributions":7}', key));
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
    expect(db.begun()).toBe(0);
  });

  it("names the choice when it is missing or isn't keep or withdraw, never a value, and reads no database for it", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "contributions"],
      [{ contributions: "" }, "contributions"],
      [{ contributions: "remove" }, "contributions"],
      [{ contributions: "Keep" }, "contributions"],
      [{ contributions: true }, "contributions"],
      [{ contributions: null }, "contributions"],
      [{ contributions: ["keep"] }, "contributions"],
      // An unknown key is no field of the contract's: refused, and never named or echoed.
      [{ contributions: "keep", reason: "moving away" }, undefined],
      [[], undefined],
      [null, undefined],
      ["text", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/remove|Keep|moving|text/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes a body up to its limit of 1 KiB and none above it, twice the largest valid one", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("contributions")}:${escape("withdraw")}}`;
    const limit = 1024;
    expect(bodyLimitOf("leaveClub")).toBe(limit);
    expect(limit).toBeLessThan(BODY_LIMIT);
    const sized = (bytes: number) => `${KEEP.slice(0, -1)}${" ".repeat(bytes - KEEP.length)}}`;
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    expect(await answer(post(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
    for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
      expect(await answer(post(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(db.begun()).toBe(1);
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(await answer(post(largest))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(2);
  });
});

describe("what the leave route answers", () => {
  const left = successExamples("leaveClub")?.["kept"]?.value as Body;
  const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };

  it("answers a leave with 200 and the answer as the command gave it, a replay with the same bytes", async () => {
    const answer = await appFor(() => Promise.resolve(left));
    const first = await answer(post(KEEP));
    expect(first).toMatchObject({ status: 200, body: JSON.stringify(left), headers });
    expect(await answer(post(KEEP))).toEqual(first);
  });

  it("reaches the command once for a well-formed leave, whichever the choice", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    expect(await answer(post('{"contributions":"withdraw"}'))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
  });

  it("maps each refusal: the neutral not-found, and a key used for another request", async () => {
    for (const [code, status, body] of [
      ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
      ["IDEMPOTENCY_CONFLICT", 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
    ] as const) {
      const answer = await appFor(() => Promise.reject(new Refused(code)));
      expect(await answer(post(KEEP)), code).toMatchObject({ status, body });
    }
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    expect(await answer(post(KEEP))).toMatchObject({ status: 500, body: "" });
  });
});
