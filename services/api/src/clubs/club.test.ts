/// <reference lib="esnext.temporal" />
// The club's two routes as the contract has them (the contract's `createClub`, `getClub` and `ClubDetail`;
// T1, T14, T19, T55), with no database: the serializer's field list, held against every example the
// contract gives, read from the contract and not copied by hand, and everything `createClub` refuses before
// its command runs. The command, its receipt and the read are on Postgres
// (tests/src/db/create-club.test.ts), and every role's answers are the privacy matrix's
// (tests/src/privacy/club.ts).

import { ClubDetail as ClubDetailSchema } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import {
  Refused,
  type Account,
  type ChosenDay,
  type Clock,
  type ClubDetail,
  type CreatedClub,
  type ServerNow,
} from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { clubDetailBody, withServerNow } from "./club.ts";
import { noStorage } from "../testing.ts";

/** The time an answer is made at, as the clock samples it. */
const sample = (text: string) => Temporal.Instant.from(text) as ServerNow;

type Body = Record<string, unknown>;

/** A contract example's Occurrence as the domain holds a club's day. */
function day(value: unknown, phase: "open" | "collecting"): ChosenDay {
  const body = value as Body & { star: { membership_id: string; display_name: string; avatar_version?: string } };
  return {
    id: body["id"] as string,
    clubId: body["club_id"] as string,
    star: {
      membershipId: body.star.membership_id,
      displayName: body.star.display_name,
      avatarVersion: body.star.avatar_version ?? null,
    },
    localDate: body["local_date"] as string,
    revealAt: Temporal.Instant.from(body["reveal_at"] as string),
    closeAt: Temporal.Instant.from(body["close_at"] as string),
    phase,
  };
}

/** A contract example's ClubDetail as the domain's read would hold it: the serializer's input. */
function detail(value: Body): ClubDetail {
  const club = value["club"] as Body;
  return {
    club: {
      id: club["id"] as string,
      name: club["name"] as string,
      timezone: club["timezone"] as string,
      membershipId: club["my_membership_id"] as string,
      state: club["state"] as "active",
      memberCount: club["member_count"] as number,
      openDay: club["open_day"] === undefined ? null : day(club["open_day"], "open"),
      nextDay: club["next_day"] === undefined ? null : day(club["next_day"], "collecting"),
    },
    rosterVersion: value["roster_version"] as number,
    canPropose: value["can_propose"] as boolean,
    openRevisionId: (value["open_revision_id"] as string | undefined) ?? null,
  };
}

describe("the club's serializer against the contract's examples (T55)", () => {
  const examples = [
    ...Object.entries(successExamples("getClub") ?? {}),
    ...Object.entries(successExamples("createClub") ?? {}),
  ];

  it("has the contract's scenes to hold: two of getClub, with and without an open revision, and a new club", () => {
    expect(examples.map(([name]) => name)).toEqual(["sunday_people", "kitchen_table", "created"]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = withServerNow(sample(value["server_now"] as string), clubDetailBody(detail(value)));
    expect(made).toEqual(value);
    expect(ClubDetailSchema.strict().safeParse(made).success).toBe(true);
  });

  it("sends the server's instant in whole seconds, rounded down, and keeps it out of what a receipt stores", () => {
    const value = examples[0]?.[1].value as Body;
    const stored = clubDetailBody(detail(value));
    expect(Object.keys(stored).sort()).toEqual(["can_propose", "club", "roster_version"]);
    const made = withServerNow(sample("2026-11-06T14:41:00.999999Z"), stored) as Body;
    expect(made["server_now"]).toBe("2026-11-06T14:41:00Z");
  });

  it("sends no day and no open revision where there is none, and nothing else of a club", () => {
    const made = clubDetailBody({
      club: {
        id: "club_1",
        name: "Sunday people",
        timezone: "America/New_York",
        membershipId: "mem_1",
        state: "proposed",
        memberCount: 1,
        openDay: null,
        nextDay: null,
      },
      rosterVersion: 0,
      canPropose: true,
      openRevisionId: null,
    });
    expect(made).toEqual({
      club: {
        id: "club_1",
        name: "Sunday people",
        timezone: "America/New_York",
        my_membership_id: "mem_1",
        state: "proposed",
        member_count: 1,
      },
      roster_version: 0,
      can_propose: true,
    });
  });

  it("refuses to stamp a stored answer that isn't an object", () => {
    for (const stored of [null, "club", 3, []]) {
      expect(() => withServerNow(sample("2026-11-06T14:41:00Z"), stored)).toThrow();
    }
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

/** An app for Ben whose transactions are `begin`: what the routes do with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => Promise.resolve(account),
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

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});
const GOOD = '{"name":"Sunday people","timezone":"America/New_York"}';
/** A createClub request; a `key` of null sends no Idempotency-Key. */
const post = (payload: string, key: string | null = KEY): InjectOptions => ({
  method: "POST",
  url: "/v1/clubs",
  headers: { "content-type": "application/json", ...(key === null ? {} : { "idempotency-key": key }) },
  payload,
});

describe("what createClub refuses before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    let begun = 0;
    const answer = await appFor(() => {
      begun += 1;
      return Promise.reject(new Error("no database"));
    });
    for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
      const got = await answer(post('{"name":" "}', key));
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
    expect(begun).toBe(0);
  });

  it("names the first bad field in the contract's order, never a value, and reads no database for it", async () => {
    let begun = 0;
    const answer = await appFor(() => {
      begun += 1;
      return Promise.reject(new Error("no database"));
    });
    const cases: [unknown, string | undefined][] = [
      [{}, "name"],
      [{ timezone: "America/New_York" }, "name"],
      [{ name: "", timezone: "America/New_York" }, "name"],
      [{ name: " Sunday people", timezone: "America/New_York" }, "name"],
      [{ name: "a".repeat(41), timezone: "America/New_York" }, "name"],
      [{ name: "Sunday\npeople", timezone: "America/New_York" }, "name"],
      [{ name: "A\ud800B", timezone: "America/New_York" }, "name"],
      [{ name: 7, timezone: "America/New_York" }, "name"],
      [{ name: "Sunday people" }, "timezone"],
      [{ name: "Sunday people", timezone: "Mars/Olympus_Mons" }, "timezone"],
      [{ name: "Sunday people", timezone: "+05:00" }, "timezone"],
      [{ name: "Sunday people", timezone: "T07:00[Europe/London]" }, "timezone"],
      [{ name: "Sunday people", timezone: "" }, "timezone"],
      // The contract's order, not the body's.
      [{ timezone: "Nowhere/At_All", name: " " }, "name"],
      // An unknown key is no field of the contract's: refused, and never named or echoed.
      [{ name: "Sunday people", timezone: "America/New_York", cover: "upl_1" }, undefined],
      [{ name: "Sunday people", timezone: "America/New_York", members: ["Maya"] }, undefined],
      [[], undefined],
      [null, undefined],
      ["text", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/Sunday|Mars|Maya|upl_1|text|Nowhere/);
    }
    expect(begun).toBe(0);
  });

  it("refuses a body past the route's limit unread, and takes the largest body the contract allows", async () => {
    let reached = 0;
    const answer = await appFor(() => {
      reached += 1;
      return Promise.reject(new Error("no database"));
    });
    const limit = bodyLimitOf("createClub");
    expect(limit).toBe(17 * 1024);
    expect(limit).toBeLessThan(BODY_LIMIT);
    const good = '{"name":"Sunday people","timezone":"America/New_York"';
    // A body of exactly the limit is read and reaches the command; one byte more is never read.
    const sized = (bytes: number) => `${good}${" ".repeat(bytes - good.length - 1)}}`;
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    expect(await answer(post(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(reached).toBe(1);
    for (const bytes of [limit + 1, 70_000, BODY_LIMIT + 1]) {
      expect(await answer(post(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(reached).toBe(1);
    // The largest body the contract allows: a name of forty clusters of sixteen code points, each outside the
    // Basic Multilingual Plane, and the longest zone's length, every key and code unit written as an escape.
    const name = `\u{1F3F4}${"\u{E0067}".repeat(15)}`.repeat(40);
    expect(name).toHaveLength(1280);
    const escape = (text: string): string =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("name")}:${escape(name)},${escape("timezone")}:${escape("America/Argentina/ComodRivadavia")}}`;
    expect(Buffer.byteLength(largest)).toBeGreaterThan(7 * 1024);
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(await answer(post(largest))).toMatchObject({ status: 500, body: "" });
    expect(reached).toBe(2);
  });
});

describe("what createClub answers", () => {
  const stored = {
    club: {
      id: "club_1",
      name: "Sunday people",
      timezone: "America/New_York",
      my_membership_id: "mem_1",
      state: "proposed",
      member_count: 1,
    },
    roster_version: 0,
    can_propose: true,
  };

  it("answers 201 with the club and the clock's sample of this request, for the caller alone (T1)", async () => {
    const made: CreatedClub = {
      answer: stored,
      at: Temporal.Instant.from("2026-11-06T14:41:00.5Z") as CreatedClub["at"],
    };
    const answer = await appFor(() => Promise.resolve(made));
    const got = await answer(post(GOOD));
    expect(got.status).toBe(201);
    expect(JSON.parse(got.body)).toEqual({ server_now: "2026-11-06T14:41:00Z", ...stored });
    expect(ClubDetailSchema.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    expect(got.headers).toMatchObject({
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
    });
  });

  it("answers a refusal as the contract's error, with nothing of the request in it", async () => {
    for (const [code, status] of [
      ["IDEMPOTENCY_CONFLICT", 409],
      ["UNAUTHENTICATED", 401],
      ["PROFILE_INCOMPLETE", 403],
    ] as const) {
      const answer = await appFor(() => Promise.reject(new Refused(code)));
      expect(await answer(post(GOOD)), code).toMatchObject({ status, body: `{"code":"${code}"}` });
    }
    const answer = await appFor(() => Promise.reject(new Refused("INVALID_REQUEST", { field: "timezone" })));
    expect(await answer(post(GOOD))).toMatchObject(invalid("timezone"));
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    expect(await answer(post(GOOD))).toMatchObject({ status: 500, body: "" });
  });
});

describe("what getClub answers with no club to read", () => {
  it("answers the neutral not-found when the read finds nothing, and never a 200 with an empty body (T14)", async () => {
    const answer = await appFor(() => Promise.resolve(null));
    const got = await answer({ method: "GET", url: "/v1/clubs/club_1" });
    expect(got).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}' });
    expect(got.headers["cache-control"]).toBe("private, no-store");
  });
});
