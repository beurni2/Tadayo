/// <reference lib="esnext.temporal" />
// The upload routes as the contract has them (the contract's `createUpload`, `getUpload` and `completeUpload`;
// spec 32, 33; T12, T14, T19, T52, T55; docs/plans/api-b2-spike-uploads.md, section 3), with no database: the
// serializers' field lists against the contract's examples, read from the contract and not copied by hand;
// everything refused before the command runs; the signed upload URL, signed after the transaction and only
// while the upload is pending; Storage out of reach; and the log. The commands, their locks, the cutoff and
// the receipt are on Postgres (tests/src/db/uploads.test.ts), and every role's answers are the privacy matrix's.

import { ApiError, statusOf, Upload, UploadStatus } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import {
  Refused,
  type Account,
  type Clock,
  type MadeUpload,
  type OwnUpload,
  type ServerNow,
  type UploadAnswer,
} from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { FAKE_SIGNED_SECONDS, fakeStorage, noStorage, type FakeStorage } from "../testing.ts";
import type { UploadStorage } from "./storage.ts";
import { signedUploadBody, uploadBody } from "./uploads.ts";

type Body = Record<string, unknown>;
const at = (text: string) => Temporal.Instant.from(text);

/** The contract's UploadStatus as the domain's answer. */
function answerOf(value: Body): UploadAnswer {
  return {
    id: String(value["id"]),
    purpose: value["purpose"] as UploadAnswer["purpose"],
    state: value["state"] as UploadAnswer["state"],
    rejection: (value["rejection"] as UploadAnswer["rejection"] | undefined) ?? null,
    expiresAt: at(String(value["expires_at"])),
  };
}

describe("the upload's serializers against the contract's examples (T12, T55)", () => {
  const statuses = [
    ...Object.entries(successExamples("getUpload") ?? {}).map(
      ([name, example]) => [`getUpload ${name}`, example] as const,
    ),
    ...Object.entries(successExamples("completeUpload") ?? {}).map(
      ([name, example]) => [`completeUpload ${name}`, example] as const,
    ),
  ];

  it("has the contract's scenes to hold: three reads and one complete", () => {
    expect(statuses.map(([name]) => name)).toEqual([
      "getUpload ready",
      "getUpload preparing",
      "getUpload rejected",
      "completeUpload preparing",
    ]);
  });

  it.each(statuses)("makes %s field for field, with no URL", (_name, example) => {
    const value = example.value as Body;
    const made = uploadBody(answerOf(value));
    expect(made).toEqual(value);
    expect(Object.keys(made as Body)).toEqual(Object.keys(value));
    expect(UploadStatus.strict().safeParse(made).success).toBe(true);
  });

  it("makes createUpload's pending drop photo field for field, its signed upload from Storage's lifetime and the clock's sample", () => {
    const value = successExamples("createUpload")?.["pending"]?.value as Body & { signed_upload: Body };
    const { signed_upload: signed, ...status } = value;
    expect(uploadBody(answerOf(status))).toEqual(status);
    // The upload lives 24 hours from its intent, and Storage's URL two hours from the same sample.
    const sample = at(String(status["expires_at"])).subtract({ hours: 24 }) as ServerNow;
    const made = signedUploadBody(
      {
        url: String(signed["url"]),
        headers: signed["headers"] as Record<string, string>,
        lifetimeSeconds: FAKE_SIGNED_SECONDS,
      },
      sample,
    );
    expect(made).toEqual(signed);
    expect(Object.keys(made as Body)).toEqual(Object.keys(signed));
    expect(Upload.strict().safeParse({ ...status, signed_upload: made }).success).toBe(true);
  });

  it("sends a rejection only for a rejected upload, and instants in whole seconds, rounded down", () => {
    const answer: UploadAnswer = {
      id: "upl_1",
      purpose: "drop_photo",
      state: "preparing",
      rejection: "unreadable",
      expiresAt: at("2026-11-07T21:00:00.999999Z"),
    };
    expect(uploadBody(answer)).toEqual({
      id: "upl_1",
      purpose: "drop_photo",
      state: "preparing",
      expires_at: "2026-11-07T21:00:00Z",
    });
    expect(uploadBody({ ...answer, state: "rejected" })).toMatchObject({ rejection: "unreadable" });
    const signed = signedUploadBody(
      { url: "https://x.supabase.co/u", headers: {}, lifetimeSeconds: 60 },
      at("2026-11-06T21:00:00.999999Z") as ServerNow,
    ) as Body;
    expect(signed["expires_at"]).toBe("2026-11-06T21:01:00Z");
  });
});

const finished: Account = {
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

interface AppOptions {
  clock?: Clock;
  storage?: UploadStorage;
  account?: Account;
  lines?: string[];
}

/** An app for Ben whose transactions are `begin`: what the route does with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>, options: AppOptions = {}) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const lines = options.lines;
  const deps: Deps = {
    sql,
    clock: options.clock ?? ({} as Clock),
    authenticate: () => Promise.resolve(options.account ?? finished),
    storage: options.storage ?? noStorage,
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

/** A database that answers each transaction with the next of `answers`, and counts them. */
function answering(...answers: unknown[]) {
  let begun = 0;
  return {
    begin: () => {
      const next = answers[begun];
      begun += 1;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    begun: () => begun,
  };
}
const none = () => answering(new Error("no database"), new Error("no database"), new Error("no database"));

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});
const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };
const neutral = { status: 404, body: '{"code":"NOT_FOUND"}', headers };
const PHOTO = { purpose: "drop_photo", reservation_id: "rsv_ben_1", content_type: "image/jpeg", byte_size: 2_500_000 };
const post = (payload: string, key: string | null = KEY): InjectOptions => ({
  method: "POST",
  url: "/v1/uploads",
  headers: { "content-type": "application/json", ...(key === null ? {} : { "idempotency-key": key }) },
  payload,
});
const read = (id = "upl_ben_1"): InjectOptions => ({ method: "GET", url: `/v1/uploads/${id}` });
const complete = (id = "upl_ben_1"): InjectOptions => ({ method: "POST", url: `/v1/uploads/${id}/complete` });

describe("what createUpload refuses before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
      const got = await answer(post('{"purpose":7}', key));
      expect(got, String(key)).toMatchObject(invalid("Idempotency-Key"));
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
    expect(db.begun()).toBe(0);
  });

  it("names the first bad field by the contract's schema, and never a value", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "purpose"],
      [{ ...PHOTO, purpose: "selfie" }, "purpose"],
      [{ ...PHOTO, purpose: "Drop_photo" }, "purpose"],
      [{ purpose: "drop_photo" }, "reservation_id"],
      [{ ...PHOTO, reservation_id: "rsv.ben" }, "reservation_id"],
      [{ ...PHOTO, content_type: "image/gif" }, "content_type"],
      [{ ...PHOTO, content_type: "image/heic" }, "content_type"],
      [{ ...PHOTO, byte_size: 0 }, "byte_size"],
      [{ ...PHOTO, byte_size: 20_971_521 }, "byte_size"],
      [{ ...PHOTO, byte_size: 1.5 }, "byte_size"],
      [{ ...PHOTO, byte_size: "100" }, "byte_size"],
      [[], undefined],
      [null, undefined],
      ["drop_photo", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/selfie|gif|heic|rsv\.ben/);
    }
    expect(db.begun()).toBe(0);
  });

  it("takes no filename, date, place, size in pixels, hash, owner or day: any key past its purpose's own is refused, unnamed", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const extra of [
      { filename: "IMG_0001.jpg" },
      { captured_at: "2026-11-06T20:00:00Z" },
      { location: "51.5,-0.1" },
      { width: 4032 },
      { sha256: "ab" },
      { owner_user_id: "acct_ana" },
      { occurrence_id: "occ_sat" },
      { drop_id: "drp_1" },
      { object_key: "uploads/x" },
    ]) {
      const got = await answer(post(JSON.stringify({ ...PHOTO, ...extra })));
      expect(got, JSON.stringify(extra)).toMatchObject(invalid());
      expect(got.body).not.toMatch(/IMG|acct_ana|occ_sat|drp_1|uploads/);
    }
    expect(db.begun()).toBe(0);
  });

  it("answers the three purposes not built yet with the neutral not-found, making nothing", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const unbuilt = [
      { purpose: "replacement", drop_id: "drp_ben_1", content_type: "image/jpeg", byte_size: 1000 },
      { purpose: "avatar", content_type: "image/png", byte_size: 1000 },
      { purpose: "conversation_photo", drop_id: "drp_sam_1", content_type: "image/webp", byte_size: 1000 },
    ];
    for (const payload of unbuilt) {
      expect(await answer(post(JSON.stringify(payload))), payload.purpose).toMatchObject(neutral);
    }
    expect(db.begun()).toBe(0);
  });

  it("answers PROFILE_INCOMPLETE for a drop's photo before the profile is finished, and the avatar's purpose the neutral not-found", async () => {
    for (const caller of [
      { ...finished, ageConfirmed: false, displayName: null },
      { ...finished, ageConfirmed: true, displayName: null },
    ]) {
      const db = none();
      const answer = await appFor(db.begin, { account: caller });
      const incomplete = { status: 403, body: '{"code":"PROFILE_INCOMPLETE"}', headers };
      expect(await answer(post(JSON.stringify(PHOTO)))).toMatchObject(incomplete);
      expect(
        await answer(
          post(JSON.stringify({ purpose: "replacement", drop_id: "drp_1", content_type: "image/jpeg", byte_size: 1 })),
        ),
      ).toMatchObject(incomplete);
      expect(
        await answer(post(JSON.stringify({ purpose: "avatar", content_type: "image/jpeg", byte_size: 1 }))),
      ).toMatchObject(neutral);
      expect(statusOf("PROFILE_INCOMPLETE")).toBe(403);
      expect(db.begun()).toBe(0);
    }
  });

  it("takes a body up to its limit of 2 KiB and none above it, over twice the largest valid one", async () => {
    const db = answering(...Array.from({ length: 4 }, () => new Error("no database")));
    const answer = await appFor(db.begin);
    const escape = (text: string) =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const largest = `{${escape("purpose")}:${escape("drop_photo")},${escape("reservation_id")}:${escape("r".repeat(64))},${escape("content_type")}:${escape("image/jpeg")},${escape("byte_size")}:20971520}`;
    const limit = 2048;
    expect(bodyLimitOf("createUpload")).toBe(limit);
    expect(limit).toBeLessThan(BODY_LIMIT);
    const text = JSON.stringify(PHOTO);
    const sized = (bytes: number) => `${text.slice(0, -1)}${" ".repeat(bytes - text.length)}}`;
    expect(Buffer.byteLength(sized(limit))).toBe(limit);
    expect(await answer(post(sized(limit)))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(1);
    for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
      expect(await answer(post(sized(bytes))), String(bytes)).toMatchObject(invalid());
    }
    expect(db.begun()).toBe(1);
    expect(Buffer.byteLength(largest)).toBeLessThan(850);
    expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
    expect(await answer(post(largest))).toMatchObject({ status: 500, body: "" });
    expect(db.begun()).toBe(2);
  });
});

const OBJECT = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const SAMPLE = at("2026-11-06T21:00:00.123456Z") as ServerNow;
const PENDING: Body = { id: "upl_ben_1", purpose: "drop_photo", state: "pending", expires_at: "2026-11-07T21:00:00Z" };
const madeOf = (toSign: MadeUpload["toSign"]): MadeUpload => ({ body: PENDING as MadeUpload["body"], toSign });
const ownOf = (state: UploadAnswer["state"]): OwnUpload => ({
  answer: { ...answerOf(PENDING), state },
  objectKey: OBJECT,
});

/**
 * A transaction that answers every statement with no rows and keeps the values bound to them, and a clock
 * whose sample is a fixed instant: enough for a command to read its reservation or upload and find none.
 */
function recording() {
  const bound: unknown[] = [];
  const tx = (_template: TemplateStringsArray, ...values: unknown[]) => {
    bound.push(...values);
    return Promise.resolve([]);
  };
  const clock: Clock = { sample: () => Promise.resolve(SAMPLE) };
  const begin = (...args: unknown[]) => {
    const body = args[args.length - 1] as (sql: typeof tx) => Promise<unknown>;
    return body(tx);
  };
  return { begin, clock, bound };
}

describe("what createUpload answers", () => {
  it("answers a new upload with 201, the command's answer and a signed upload for its object, signed after the transaction", async () => {
    const storage = fakeStorage();
    let committed = false;
    const signing = storage.signUpload.bind(storage);
    const seenCommitted: boolean[] = [];
    storage.signUpload = (objectKey, contentType) => {
      seenCommitted.push(committed);
      return signing(objectKey, contentType);
    };
    const answer = await appFor(
      () =>
        new Promise((resolve) =>
          setImmediate(() => {
            committed = true;
            resolve(madeOf({ objectKey: OBJECT, at: SAMPLE }));
          }),
        ),
      { storage },
    );
    const got = await answer(post(JSON.stringify({ ...PHOTO, content_type: "image/webp" })));
    expect(got).toMatchObject({ status: 201, headers });
    const body = JSON.parse(got.body) as Body & { signed_upload: Body };
    expect(Object.keys(body)).toEqual(["id", "purpose", "state", "expires_at", "signed_upload"]);
    expect(body).toMatchObject(PENDING);
    expect(body.signed_upload).toEqual({
      url: expect.stringMatching(
        new RegExp(
          `^https://tadayotestprojectref\\.supabase\\.co/storage/v1/object/upload/sign/uploads/${OBJECT}\\?token=`,
        ),
      ) as string,
      method: "PUT",
      headers: { "Content-Type": "image/webp", "x-upsert": "false" },
      expires_at: "2026-11-06T23:00:00Z",
    });
    expect(Upload.strict().safeParse(body).success).toBe(true);
    expect(storage.signed).toEqual([OBJECT]);
    expect(seenCommitted).toEqual([true]);
  });

  it("signs a new URL for the same object on a replay while the upload is pending, and none once it isn't", async () => {
    const storage = fakeStorage();
    const db = answering(
      madeOf({ objectKey: OBJECT, at: SAMPLE }),
      madeOf({ objectKey: OBJECT, at: SAMPLE }),
      madeOf(null),
    );
    const answer = await appFor(db.begin, { storage });
    const first = JSON.parse((await answer(post(JSON.stringify(PHOTO)))).body) as Body & { signed_upload: Body };
    const again = JSON.parse((await answer(post(JSON.stringify(PHOTO)))).body) as Body & { signed_upload: Body };
    expect(again.signed_upload["url"]).not.toBe(first.signed_upload["url"]);
    expect(storage.signed).toEqual([OBJECT, OBJECT]);
    const later = await answer(post(JSON.stringify(PHOTO)));
    expect(later).toMatchObject({ status: 201, body: JSON.stringify(PENDING), headers });
    expect(storage.signed).toHaveLength(2);
  });

  it("answers 503 with no body when Storage can't sign, and a retry under the same key signs", async () => {
    const storage = fakeStorage();
    const db = answering(madeOf({ objectKey: OBJECT, at: SAMPLE }), madeOf({ objectKey: OBJECT, at: SAMPLE }));
    const answer = await appFor(db.begin, { storage });
    storage.failing(true);
    expect(await answer(post(JSON.stringify(PHOTO)))).toEqual({
      status: 503,
      body: "",
      headers: { "cache-control": "private, no-store", "content-length": "0" },
    });
    storage.failing(false);
    const retried = await answer(post(JSON.stringify(PHOTO)));
    expect(retried.status).toBe(201);
    expect(JSON.parse(retried.body)).toHaveProperty("signed_upload");
  });

  it("hands the command the path of the body's reservation, and a reservation nobody has is the neutral not-found", async () => {
    const db = recording();
    const answer = await appFor(db.begin, { clock: db.clock });
    expect(await answer(post(JSON.stringify(PHOTO)))).toMatchObject(neutral);
    expect(db.bound).toContain("rsv_ben_1");
  });

  it("maps the command's refusals, and a database that failed is nothing", async () => {
    for (const [code, status] of [
      ["NOT_FOUND", 404],
      ["IDEMPOTENCY_CONFLICT", 409],
      ["MEMBERSHIP_CHANGED", 409],
    ] as const) {
      const answer = await appFor(() => Promise.reject(new Refused(code)));
      const got = await answer(post(JSON.stringify(PHOTO)));
      expect(got, code).toMatchObject({ status, body: `{"code":"${code}"}`, headers });
      expect(ApiError.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    }
    const failed = await appFor(() => Promise.reject(new Error("no database")));
    expect(await failed(post(JSON.stringify(PHOTO)))).toMatchObject({ status: 500, body: "" });
  });
});

describe("what getUpload and completeUpload answer", () => {
  it("reads the caller's own upload with 200 and its status, never a URL", async () => {
    const answer = await appFor(
      answering(ownOf("pending"), {
        ...ownOf("rejected"),
        answer: { ...ownOf("rejected").answer, rejection: "too_large" },
      }).begin,
    );
    expect(await answer(read())).toMatchObject({ status: 200, body: JSON.stringify(PENDING), headers });
    expect(JSON.parse((await answer(read())).body)).toEqual({ ...PENDING, state: "rejected", rejection: "too_large" });
  });

  it("answers anyone else's upload, one that has lapsed, and an id that can't be one with the neutral not-found", async () => {
    const db = recording();
    const answer = await appFor(db.begin, { clock: db.clock });
    expect(await answer(read("upl_nobody"))).toMatchObject(neutral);
    expect(db.bound).toContain("upl_nobody");
    expect(await answer(complete("upl_nobody"))).toMatchObject(neutral);
    const bound = db.bound.length;
    expect(await answer(read("upl%20one"))).toMatchObject(neutral);
    expect(await answer(complete("upl.one"))).toMatchObject(neutral);
    expect(db.bound).toHaveLength(bound);
  });

  it("asks Storage for a pending upload's object: MEDIA_NOT_READY while it isn't there, changing nothing", async () => {
    const storage = fakeStorage();
    const db = answering(ownOf("pending"), ownOf("pending"), { ...ownOf("preparing").answer });
    const answer = await appFor(db.begin, { storage });
    const got = await answer(complete());
    expect(got).toMatchObject({ status: 409, body: '{"code":"MEDIA_NOT_READY"}', headers });
    expect(statusOf("MEDIA_NOT_READY")).toBe(409);
    expect(db.begun()).toBe(1);
    storage.put(OBJECT);
    expect(await answer(complete())).toMatchObject({
      status: 202,
      body: JSON.stringify({ ...PENDING, state: "preparing" }),
      headers,
    });
    expect(db.begun()).toBe(3);
  });

  it("answers an upload already past pending as it is, 202, without asking Storage", async () => {
    const db = answering(ownOf("ready"), { ...ownOf("ready").answer });
    const answer = await appFor(db.begin, { storage: noStorage });
    const got = await answer(complete());
    expect(got).toMatchObject({ status: 202, body: JSON.stringify({ ...PENDING, state: "ready" }), headers });
    expect(UploadStatus.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
  });

  it("answers 503 with no body when Storage can't be asked, changing nothing", async () => {
    const storage = fakeStorage();
    storage.failing(true);
    const db = answering(ownOf("pending"), ownOf("preparing").answer);
    const answer = await appFor(db.begin, { storage });
    expect(await answer(complete())).toEqual({
      status: 503,
      body: "",
      headers: { "cache-control": "private, no-store", "content-length": "0" },
    });
    expect(db.begun()).toBe(1);
  });
});

describe("the log keeps no URL, token or object (T12, T52)", () => {
  it("writes nothing of a signed upload, Storage's failures or a completed upload's object", async () => {
    const lines: string[] = [];
    const storage: FakeStorage = fakeStorage();
    const db = answering(
      madeOf({ objectKey: OBJECT, at: SAMPLE }),
      madeOf({ objectKey: OBJECT, at: SAMPLE }),
      ownOf("pending"),
      ownOf("pending"),
      ownOf("preparing").answer,
    );
    const answer = await appFor(db.begin, { storage, lines });
    const signed = JSON.parse((await answer(post(JSON.stringify(PHOTO)))).body) as { signed_upload: { url: string } };
    const url = new URL(signed.signed_upload.url);
    const token = url.searchParams.get("token") ?? "none";
    storage.failing(true);
    expect((await answer(post(JSON.stringify(PHOTO)))).status).toBe(503);
    expect((await answer(complete())).status).toBe(503);
    storage.failing(false);
    storage.put(OBJECT);
    expect((await answer(complete())).status).toBe(202);
    const text = lines.join("");
    expect(text).toContain("storage unavailable");
    for (const secret of [OBJECT, token, signed.signed_upload.url, "token=", "tadayotestprojectref", "rsv_ben_1"]) {
      expect(text).not.toContain(secret);
    }
  });
});
