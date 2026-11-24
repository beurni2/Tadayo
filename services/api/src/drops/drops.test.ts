/// <reference lib="esnext.temporal" />
// The route that adds a drop to a day as the contract has it (the contract's `createDrop`, for a photo; spec 06,
// 10, 32; T4, T8, T13, T15, T17, T19, T20, T21, T52, T55; docs/plans/api-b2-spike-commit.md, section 3), with no
// database: the receipt's field list, held against the contract's example, read from the contract and not copied by
// hand; everything refused before the command runs, the key first; each refusal's body; the body's limit; and a log
// that keeps no caption, upload or hash. The command, its locks, the cutoff, the receipt and the audience are on
// Postgres (tests/src/db/create-drop.test.ts), and every role's answers are the privacy matrix's.

import { ApiError, DropReceipt } from "@tadayo/contracts";
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
import { noStorage } from "../testing.ts";
import { dropReceiptBody } from "./drops.ts";

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

const added = successExamples("createDrop")?.["added"]?.value as Body;

describe("the receipt's serializer against the contract's example (T15, T20, T22, T55)", () => {
  it("has the contract's scene to hold: Ben's photo added to Debby's Friday", () => {
    expect(Object.keys(successExamples("createDrop") ?? {})).toEqual(["added"]);
  });

  it("makes it field for field, and no other", () => {
    const made = dropReceiptBody({
      dropId: String(added["drop_id"]),
      occurrence: dayOf(added["occurrence"]),
      mediaClass: "photo",
      version: 1,
      allowance: allowanceOf(added["allowance"]),
      highlight: { dropId: null, version: 0 },
    });
    expect(made).toEqual(added);
    expect(DropReceipt.strict().safeParse(made).success).toBe(true);
  });

  it("names the caller's highlighted drop when there is one, and its version", () => {
    const made = dropReceiptBody({
      dropId: "drp_ben_14",
      occurrence: dayOf(added["occurrence"]),
      mediaClass: "photo",
      version: 1,
      allowance: allowanceOf(added["allowance"]),
      highlight: { dropId: "drp_ben_13", version: 3 },
    }) as Body;
    expect(made["highlight"]).toEqual({ drop_id: "drp_ben_13", version: 3 });
    expect(Object.keys(made)).toEqual([
      "drop_id",
      "occurrence",
      "media_class",
      "state",
      "version",
      "allowance",
      "highlight",
    ]);
    expect(DropReceipt.strict().safeParse(made).success).toBe(true);
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
async function appFor(begin: (...args: unknown[]) => Promise<unknown>, clock: Clock = {} as Clock, lines?: string[]) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock,
    authenticate: () => Promise.resolve(account),
    storage: noStorage,
    log:
      lines === undefined
        ? { level: "silent" }
        : { level: "info", stream: { write: (line: string) => void lines.push(line) } },
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
const DROPS = "/v1/occurrences/occ_sat/drops";
const PHOTO = { media: { kind: "photo", upload_id: "upl_ferry" } };
const post = (payload: string, key: string | null = KEY, url = DROPS): InjectOptions => ({
  method: "POST",
  url,
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
const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };

/** `count` grapheme clusters, each a letter with fifteen combining accents: sixteen UTF-16 units apiece. */
const heavy = (count: number) => `a${"́".repeat(15)}`.repeat(count);

describe("what createDrop refuses before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
      const got = await answer(post('{"media":7,"audience":["mem_cleo"]}', key));
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
    expect(db.begun()).toBe(0);
  });

  it("names the first bad field, never its value: the media, the reservation and the caption", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "media"],
      [{ media: null }, "media"],
      [{ media: { kind: "photo" } }, "media"],
      [{ media: { kind: "photo", upload_id: "upl ferry" } }, "media"],
      [{ media: { kind: "photo", source_id: "src_ferry" } }, "media"],
      [{ media: { kind: "external_video", upload_id: "upl_ferry" } }, "media"],
      [{ media: { kind: "audio", upload_id: "upl_ferry" } }, "media"],
      [{ media: { kind: "photo", upload_id: "upl_ferry", width: 1200 } }, "media"],
      [{ ...PHOTO, reservation_id: "rsv one" }, "reservation_id"],
      [{ ...PHOTO, reservation_id: 7 }, "reservation_id"],
      [{ ...PHOTO, caption: 7 }, "caption"],
      [{ ...PHOTO, caption: heavy(141) }, "caption"],
      [{ ...PHOTO, caption: "x".repeat(141) }, "caption"],
      [{ ...PHOTO, caption: "Ferry \uD83C" }, "caption"],
      [[], undefined],
      [null, undefined],
      ["photo", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload).slice(0, 80)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/ferry|Ferry|upl_|rsv|audio|1200/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes no audience, role, time, highlight or other day from the body: any other field is refused, unnamed (T4, T8, T17)", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const extra of [
      { audience: ["mem_cleo"] },
      { audience_interval_ids: ["mem_cleo"] },
      { is_star: true },
      { role: "star" },
      { submitted_at: "2026-11-06T21:00:00Z" },
      { highlight: true },
      { occurrence_id: "occ_other" },
      { interval_id: "mem_ana" },
      { state: "held" },
    ]) {
      const got = await answer(post(JSON.stringify({ ...PHOTO, ...extra })));
      expect(got, JSON.stringify(extra)).toMatchObject(invalid());
      expect(got.body).not.toMatch(/mem_|star|occ_other|held|2026/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes a caption of 140 grapheme clusters, the heaviest kind among them, and an empty one", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const caption of [heavy(140), "x".repeat(140), "🌅".repeat(140), ""]) {
      expect(await answer(post(JSON.stringify({ ...PHOTO, caption })))).toMatchObject({ status: 500, body: "" });
    }
    expect(db.begun()).toBe(4);
  });

  it("takes a body up to its limit of 29 KiB and none above it, the least whole KiB over twice the largest valid one", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    // The largest body the contract allows: every string escaped, each UTF-16 unit as six bytes, the longest
    // ids, the longest kind, and a caption of 140 clusters of sixteen units each, the most `Caption` lets through.
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const id = "i".repeat(64);
    const largest =
      `{${escape("reservation_id")}:${escape(id)},${escape("media")}:{${escape("kind")}:${escape("external_video")},` +
      `${escape("source_id")}:${escape(id)}},${escape("caption")}:${escape(heavy(140))}}`;
    expect(JSON.parse(largest)).toMatchObject({ caption: heavy(140) });
    const limit = 29 * 1024;
    expect(bodyLimitOf("createDrop")).toBe(limit);
    expect(limit).toBeLessThan(BODY_LIMIT);
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(Buffer.byteLength(largest)).toBeGreaterThanOrEqual((limit - 1024) / 2);
    expect(await answer(post(largest))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
    const good = JSON.stringify(PHOTO);
    const sized = (bytes: number) => `${good.slice(0, -1)}${" ".repeat(bytes - good.length)}}`;
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    expect(await answer(post(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(2);
    for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
      expect(await answer(post(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(db.begun()).toBe(2);
  });
});

/**
 * A transaction that answers every statement with no rows and keeps the values bound to them, and a clock
 * whose sample is a fixed instant: enough for the command to read its day and find none.
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

describe("what createDrop answers", () => {
  it("answers a drop added with 201 and the receipt as the command gave it, a replay alike", async () => {
    const answer = await appFor(() => Promise.resolve(added));
    const first = await answer(post(JSON.stringify({ ...PHOTO, caption: "Ferry" })));
    expect(first).toMatchObject({ status: 201, body: JSON.stringify(added), headers });
    expect(await answer(post(JSON.stringify({ ...PHOTO, caption: "Ferry" })))).toEqual(first);
  });

  it("hands the command the signed-in account and the path's day; a day nobody has is the neutral not-found", async () => {
    const db = recording();
    const answer = await appFor(db.begin as never, db.clock);
    expect(await answer(post(JSON.stringify({ ...PHOTO, caption: "Ferry" })))).toMatchObject({
      status: 404,
      body: '{"code":"NOT_FOUND"}',
      headers,
    });
    expect(db.bound).toContain("acct_ben");
    expect(db.bound).toContain("occ_sat");
    // Nothing of the body reached a statement before the day was found: not the caption, not the upload.
    expect(db.bound).not.toContain("Ferry");
    expect(db.bound).not.toContain("upl_ferry");
  });

  it("answers a day id that can't be one with the neutral not-found, as one nobody has, asking nothing (T14)", async () => {
    const db = recording();
    const answer = await appFor(db.begin as never, db.clock);
    expect(await answer(post(JSON.stringify(PHOTO), KEY, "/v1/occurrences/occ.sat/drops"))).toMatchObject({
      status: 404,
      body: '{"code":"NOT_FOUND"}',
      headers,
    });
    expect(db.bound).toEqual([]);
  });

  it("maps the bare refusals: not found, a key used for another request, a day whose star has gone, a photo not ready", async () => {
    for (const [code, status] of [
      ["NOT_FOUND", 404],
      ["IDEMPOTENCY_CONFLICT", 409],
      ["MEMBERSHIP_CHANGED", 409],
      ["MEDIA_NOT_READY", 409],
    ] as const) {
      const answer = await appFor(() => Promise.reject(new Refused(code)));
      expect(await answer(post(JSON.stringify(PHOTO))), code).toMatchObject({
        status,
        body: `{"code":"${code}"}`,
        headers,
      });
    }
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    expect(await answer(post(JSON.stringify(PHOTO)))).toMatchObject({ status: 500, body: "" });
  });
});

describe("a refusal's facts against the contract's scenes (T4, T15, T21)", () => {
  /** The domain's facts for the contract's scene of `code`. */
  const factsOf = (scene: Body): RefusalFacts => ({
    ...(scene["target"] === undefined ? {} : { target: dayOf(scene["target"]) }),
    ...(scene["next_target"] === undefined ? {} : { next_target: dayOf(scene["next_target"]) }),
    ...(scene["allowance"] === undefined ? {} : { allowance: allowanceOf(scene["allowance"]) }),
    ...(typeof scene["existing_drop_id"] === "string" ? { existing_drop_id: scene["existing_drop_id"] } : {}),
  });

  it.each(["OCCURRENCE_CLOSED", "QUOTA_FULL", "PHOTO_LIMIT", "DUPLICATE_DROP", "MEDIA_NOT_READY"] as const)(
    "makes %s field for field, in the contract's order",
    async (code) => {
      const scene = errorExample(code) as Body;
      const answer = await appFor(() => Promise.reject(new Refused(code, factsOf(scene))));
      const got = await answer(post(JSON.stringify(PHOTO)));
      expect(got).toMatchObject({ status: 409, headers });
      expect(JSON.parse(got.body)).toEqual(scene);
      expect(Object.keys(JSON.parse(got.body) as Body)).toEqual(Object.keys(scene));
      expect(ApiError.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    },
  );

  it("sends DUPLICATE_DROP with the caller's own drop and nothing else", async () => {
    const answer = await appFor(() =>
      Promise.reject(new Refused("DUPLICATE_DROP", { existing_drop_id: "drp_ben_13" })),
    );
    expect(await answer(post(JSON.stringify(PHOTO)))).toMatchObject({
      status: 409,
      body: '{"code":"DUPLICATE_DROP","existing_drop_id":"drp_ben_13"}',
      headers,
    });
  });
});

describe("the log keeps no caption, upload or hash (T52; TECH-DESIGN section 5, Logging)", () => {
  it("writes nothing of the body for a drop added, a refusal or a database that failed", async () => {
    const lines: string[] = [];
    const caption = "Meet me at the ferry, 4 Rue Lepic";
    const outcomes: (() => Promise<unknown>)[] = [
      () => Promise.resolve(added),
      () => Promise.reject(new Refused("DUPLICATE_DROP", { existing_drop_id: "drp_ben_13" })),
      () => Promise.reject(new Error(`insert failed: caption ${caption}, upload upl_ferry`)),
    ];
    let next = 0;
    const answer = await appFor(
      () => (outcomes[next++] ?? outcomes[0])?.() ?? Promise.resolve(added),
      {} as Clock,
      lines,
    );
    const body = JSON.stringify({ ...PHOTO, reservation_id: "rsv_ben_7", caption });
    expect((await answer(post(body))).status).toBe(201);
    expect((await answer(post(body))).status).toBe(409);
    expect((await answer(post(body))).status).toBe(500);
    const text = lines.join("");
    expect(text).toContain("request failed");
    for (const secret of [caption, "Rue Lepic", "upl_ferry", "rsv_ben_7", KEY]) expect(text).not.toContain(secret);
  });
});
