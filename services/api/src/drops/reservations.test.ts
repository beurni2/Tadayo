/// <reference lib="esnext.temporal" />
// The reservation routes as the contract has them (the contract's `createReservation` and
// `releaseReservation`; spec 11, 32; T4, T14, T15, T17, T18, T19, T20, T55), with no database: the serializers'
// field lists and the refusals' facts, held against the contract's examples, read from the contract and not
// copied by hand; everything refused before the command runs; and what the routes answer. The commands, their
// locks, the cutoff and the receipt are on Postgres (tests/src/db/reservations.test.ts), and every role's
// answers are the privacy matrix's.

import { ApiError, Reservation, ReleasedReservation } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { errorExample, successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import {
  Refused,
  type Account,
  type Allowance,
  type Clock,
  type PlacedDay,
  type RefusalFacts,
  type ServerNow,
} from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { releasedBody, reservationBody } from "./reservations.ts";

type Body = Record<string, unknown>;

/** The contract's Allowance as the domain's, so a serializer can be held against an example. */
function allowanceOf(value: unknown): Allowance {
  const body = value as Record<string, number | boolean>;
  return {
    added: Number(body["added"]),
    reserved: Number(body["reserved"]),
    limit: Number(body["limit"]),
    photoAdded: Number(body["photo_added"]),
    photoReserved: Number(body["photo_reserved"]),
    photoLimit: Number(body["photo_limit"]),
    externalAdded: Number(body["external_added"]),
    externalReserved: Number(body["external_reserved"]),
    externalLimit: Number(body["external_limit"]),
    isStar: body["is_star"] === true,
  };
}

/** The contract's Occurrence as the domain's day. */
function dayOf(value: unknown): PlacedDay {
  const body = value as Body & { star: Body };
  return {
    id: String(body["id"]),
    clubId: String(body["club_id"]),
    star: {
      membershipId: String(body.star["membership_id"]),
      displayName: String(body.star["display_name"]),
      avatarVersion: typeof body.star["avatar_version"] === "string" ? body.star["avatar_version"] : null,
    },
    localDate: String(body["local_date"]),
    revealAt: Temporal.Instant.from(String(body["reveal_at"])),
    closeAt: Temporal.Instant.from(String(body["close_at"])),
    phase: body["phase"] as PlacedDay["phase"],
  };
}

/** A friend's allowance with one photo held: Ben's in Debby's Friday 13 November. */
const ONE_HELD: Allowance = {
  added: 0,
  reserved: 1,
  limit: 3,
  photoAdded: 0,
  photoReserved: 1,
  photoLimit: 2,
  externalAdded: 0,
  externalReserved: 0,
  externalLimit: 1,
  isStar: false,
};

describe("the reservation's serializer against the contract's example (T15, T18, T55)", () => {
  const examples = Object.entries(successExamples("createReservation") ?? {});

  it("has the contract's scene to hold: a slot held in Debby's Friday", () => {
    expect(examples.map(([name]) => name)).toEqual(["held"]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = reservationBody({
      id: String(value["id"]),
      occurrenceId: String(value["occurrence_id"]),
      mediaClass: value["media_class"] === "external_video" ? "external_video" : "photo",
      expiresAt: Temporal.Instant.from(String(value["expires_at"])),
      allowance: allowanceOf(value["allowance"]),
    });
    expect(made).toEqual(value);
    expect(Reservation.strict().safeParse(made).success).toBe(true);
  });

  it("sends when it lapses in whole seconds, rounded down, so the app never counts on a slot the server has let go", () => {
    const made = reservationBody({
      id: "rsv_1",
      occurrenceId: "occ_1",
      mediaClass: "external_video",
      expiresAt: Temporal.Instant.from("2026-11-10T15:11:00.999999Z"),
      allowance: ONE_HELD,
    }) as Body;
    expect(made["expires_at"]).toBe("2026-11-10T15:11:00Z");
    expect(made["media_class"]).toBe("external_video");
  });
});

describe("the released reservation's serializer against the contract's examples (T15, T20, T55)", () => {
  const examples = successExamples("releaseReservation") ?? {};

  it("has the contract's two scenes to hold: kept as a draft, and a commit whose answer was lost", () => {
    expect(Object.keys(examples)).toEqual(["released", "consumed"]);
  });

  it("makes the released one field for field", () => {
    const value = examples["released"]?.value as Body;
    const made = releasedBody({
      id: String(value["id"]),
      state: "released",
      dropId: null,
      allowance: allowanceOf(value["allowance"]),
    });
    expect(made).toEqual(value);
    expect(ReleasedReservation.strict().safeParse(made).success).toBe(true);
  });

  it("makes the consumed one field for field, with the caller's own allowance, which this API always sends", () => {
    // The contract keeps `allowance` optional and its example leaves it out; the answer here always has it,
    // the caller's own (T15), so the app can show what is left without asking again.
    const value = examples["consumed"]?.value as Body;
    const made = releasedBody({
      id: String(value["id"]),
      state: "consumed",
      dropId: String(value["drop_id"]),
      allowance: ONE_HELD,
    }) as Body;
    const { allowance, ...rest } = made;
    expect(rest).toEqual(value);
    expect(allowance).toEqual({
      added: 0,
      reserved: 1,
      limit: 3,
      photo_added: 0,
      photo_reserved: 1,
      photo_limit: 2,
      external_added: 0,
      external_reserved: 0,
      external_limit: 1,
      is_star: false,
    });
    expect(ReleasedReservation.strict().safeParse(made).success).toBe(true);
  });

  it("names a drop only for a consumed slot", () => {
    for (const state of ["released", "expired"] as const) {
      const made = releasedBody({ id: "rsv_1", state, dropId: "drp_1", allowance: ONE_HELD }) as Body;
      expect(Object.keys(made), state).toEqual(["id", "state", "allowance"]);
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

/** An app for Ben whose transactions are `begin`: what the route does with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>, clock: Clock = {} as Clock) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = { sql, clock, authenticate: () => Promise.resolve(account), log: { level: "silent" } };
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
const RESERVE = "/v1/occurrences/occ_sat/reservations";
const PHOTO = '{"media_class":"photo"}';
const post = (payload: string, key: string | null = KEY, url = RESERVE): InjectOptions => ({
  method: "POST",
  url,
  headers: { "content-type": "application/json", ...(key === null ? {} : { "idempotency-key": key }) },
  payload,
});
const release = (id = "rsv_1"): InjectOptions => ({ method: "DELETE", url: `/v1/reservations/${id}` });
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
const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };

describe("what createReservation refuses before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
      const got = await answer(post('{"media_class":7}', key));
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
    expect(db.begun()).toBe(0);
  });

  it("names the media class when it is missing or isn't photo or external_video, never a value", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "media_class"],
      [{ media_class: "" }, "media_class"],
      [{ media_class: "video" }, "media_class"],
      [{ media_class: "Photo" }, "media_class"],
      [{ media_class: null }, "media_class"],
      [{ media_class: 1 }, "media_class"],
      [{ media_class: ["photo"] }, "media_class"],
      [[], undefined],
      [null, undefined],
      ["photo", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/video|Photo/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes no role, limit or day from the body: any key past the media class is refused, unnamed (T17)", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const extra of [
      { is_star: true },
      { role: "star" },
      { limit: 6 },
      { external_limit: 2 },
      { occurrence_id: "occ_other" },
      { interval_id: "mem_ana" },
    ]) {
      const got = await answer(post(JSON.stringify({ media_class: "photo", ...extra })));
      expect(got, JSON.stringify(extra)).toMatchObject(invalid());
      expect(got.body).not.toMatch(/star|occ_other|mem_ana/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes a body up to its limit of 1 KiB and none above it, twice the largest valid one", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("media_class")}:${escape("external_video")}}`;
    const limit = 1024;
    expect(bodyLimitOf("createReservation")).toBe(limit);
    expect(limit).toBeLessThan(BODY_LIMIT);
    const sized = (bytes: number) => `${PHOTO.slice(0, -1)}${" ".repeat(bytes - PHOTO.length)}}`;
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

/**
 * A transaction that answers every statement with no rows and keeps the values bound to them, and a clock
 * whose sample is a fixed instant: enough for a command to read its day or reservation and find none.
 */
function recording() {
  const bound: unknown[] = [];
  const tx = (_template: TemplateStringsArray, ...values: unknown[]) => {
    bound.push(...values);
    return Promise.resolve([]);
  };
  const clock: Clock = { sample: () => Promise.resolve(Temporal.Instant.from("2026-11-06T20:00:00Z") as ServerNow) };
  return { begin: (body: (sql: typeof tx) => Promise<unknown>) => body(tx), clock, bound };
}

describe("what the reservation routes answer", () => {
  const held = successExamples("createReservation")?.["held"]?.value as Body;
  const released = successExamples("releaseReservation")?.["released"]?.value as Body;

  it("answers a slot held with 201 and the answer as the command gave it, a replay alike", async () => {
    const answer = await appFor(() => Promise.resolve(held));
    const first = await answer(post(PHOTO));
    expect(first).toMatchObject({ status: 201, body: JSON.stringify(held), headers });
    expect(await answer(post(PHOTO))).toEqual(first);
  });

  it("answers a release with 200 and what became of the slot, twice alike", async () => {
    const answer = await appFor(() =>
      Promise.resolve({
        id: "rsv_ben_2",
        state: "released",
        dropId: null,
        allowance: allowanceOf(released["allowance"]),
      }),
    );
    const first = await answer(release("rsv_ben_2"));
    expect(first).toMatchObject({ status: 200, body: JSON.stringify(released), headers });
    expect(await answer(release("rsv_ben_2"))).toEqual(first);
  });

  it("hands the command the signed-in account and the path's day, and nothing from the body but the media class", async () => {
    const db = recording();
    const answer = await appFor(db.begin as never, db.clock);
    expect(await answer(post(PHOTO))).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}', headers });
    expect(db.bound).toContain("acct_ben");
    expect(db.bound).toContain("occ_sat");
  });

  it("hands the release command the path's reservation, and a reservation nobody has is the neutral not-found", async () => {
    const db = recording();
    const answer = await appFor(db.begin as never, db.clock);
    expect(await answer(release("rsv_nobody"))).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}', headers });
    expect(db.bound).toContain("rsv_nobody");
  });

  it("answers an id that can't be one with the neutral not-found, as one nobody has (T14)", async () => {
    const db = recording();
    const answer = await appFor(db.begin as never, db.clock);
    const neutral = { status: 404, body: '{"code":"NOT_FOUND"}', headers };
    expect(await answer(post(PHOTO, KEY, "/v1/occurrences/occ.sat/reservations"))).toMatchObject(neutral);
    expect(await answer(release("rsv%20one"))).toMatchObject(neutral);
    expect(db.bound).toEqual([]);
  });

  it("maps the bare refusals: the neutral not-found, a key used for another request, and a day whose star has gone", async () => {
    for (const [code, status] of [
      ["NOT_FOUND", 404],
      ["IDEMPOTENCY_CONFLICT", 409],
      ["MEMBERSHIP_CHANGED", 409],
    ] as const) {
      const answer = await appFor(() => Promise.reject(new Refused(code)));
      expect(await answer(post(PHOTO)), code).toMatchObject({ status, body: `{"code":"${code}"}`, headers });
    }
    const answer = await appFor(() => Promise.reject(new Refused("NOT_FOUND")));
    expect(await answer(release())).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}', headers });
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    expect(await answer(post(PHOTO))).toMatchObject({ status: 500, body: "" });
    expect(await answer(release())).toMatchObject({ status: 500, body: "" });
  });
});

describe("a refusal's facts against the contract's scenes: the day, the caller's allowance, the next day (T4, T15)", () => {
  /** The domain's facts for the contract's scene of `code`. */
  const factsOf = (scene: Body): RefusalFacts => ({
    ...(scene["target"] === undefined ? {} : { target: dayOf(scene["target"]) }),
    ...(scene["next_target"] === undefined ? {} : { next_target: dayOf(scene["next_target"]) }),
    ...(scene["allowance"] === undefined ? {} : { allowance: allowanceOf(scene["allowance"]) }),
  });

  it.each(["OCCURRENCE_CLOSED", "QUOTA_FULL", "EXTERNAL_LIMIT", "PHOTO_LIMIT"] as const)(
    "makes %s field for field, in the contract's order",
    async (code) => {
      const scene = errorExample(code) as Body;
      const answer = await appFor(() => Promise.reject(new Refused(code, factsOf(scene))));
      const got = await answer(post(PHOTO));
      expect(got).toMatchObject({ status: 409, headers });
      expect(JSON.parse(got.body)).toEqual(scene);
      expect(Object.keys(JSON.parse(got.body) as Body)).toEqual(Object.keys(scene));
      expect(ApiError.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    },
  );

  it("sends MEMBERSHIP_CHANGED bare, where the contract's scene names the day: the reading of FQ63 until B6", async () => {
    // A held day has no phase to send before B6 (docs/QUESTIONS.md, "A reading of FQ63"), and the app already
    // holds the day it asked for. The contract lets `target` be left out; this pins that the route adds nothing.
    expect(errorExample("MEMBERSHIP_CHANGED")).toHaveProperty("target");
    const answer = await appFor(() => Promise.reject(new Refused("MEMBERSHIP_CHANGED")));
    const got = await answer(post(PHOTO));
    expect(got).toMatchObject({ status: 409, body: '{"code":"MEMBERSHIP_CHANGED"}', headers });
    expect(ApiError.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
  });

  it("sends a refusal's facts and nothing else of the command's: no reservation, no interval, no other member's counts", async () => {
    const scene = errorExample("QUOTA_FULL") as Body;
    const answer = await appFor(() => Promise.reject(new Refused("QUOTA_FULL", factsOf(scene))));
    const body = JSON.parse((await answer(post(PHOTO))).body) as Body;
    expect(Object.keys(body).sort()).toEqual(["allowance", "code", "next_target", "target"]);
    expect(Object.keys(body["allowance"] as Body).sort()).toEqual(
      [
        "added",
        "external_added",
        "external_limit",
        "external_reserved",
        "is_star",
        "limit",
        "photo_added",
        "photo_limit",
        "photo_reserved",
        "reserved",
      ].sort(),
    );
  });
});
