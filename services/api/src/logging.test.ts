// Logs carry no content (T52; TECH-DESIGN sections 5 and 8; docs/plans/B0.md, slice 8's "the log test
// finds no email address"): no caption, comment, note, source or signed URL, token, EXIF, push text or
// email address, and nothing that names a person. Fastify's own request lines are off, a request gets
// one line of ours (its random id, the operation, the status, the milliseconds), whatever else a
// change logs goes through the redaction list at any depth (the outside audit's A14), and an error is
// its class and its code.

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { Account, Clock } from "@tadayo/domain";
import { Refused } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { KeysUnavailable } from "./identity/token.ts";
import { REDACTED_FIELDS, requestId } from "./logging.ts";
import { noStorage, TEST_EMAIL } from "./testing.ts";
import type { Authenticate } from "./session.ts";

const READY: Account = {
  id: "acct_ana",
  state: "active",
  displayName: "Ana",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";

const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app that writes its log into `lines`, at `level`. */
async function logged(
  authenticate: Authenticate,
  options: { level?: string; begin?: (...args: unknown[]) => Promise<unknown> } = {},
) {
  const lines: string[] = [];
  const sql = {
    end: () => Promise.resolve(),
    begin: options.begin ?? (() => Promise.reject(new Error("no database"))),
  } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate,
    storage: noStorage,
    log: { level: options.level ?? "info", stream: { write: (line) => void lines.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  return { app, lines, inject: (request: InjectOptions) => app.inject(request) };
}

const parse = (lines: readonly string[]) => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe("the redaction list (T52)", () => {
  it("blanks every listed field, at the top, one level down and four levels down in a list", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const marker = "MARKER-must-never-appear";
    for (const field of REDACTED_FIELDS) {
      app.log.info(
        { [field]: marker, wrapper: { [field]: marker }, served: { home: { drops: [{ [field]: marker }] } } },
        "probe",
      );
    }
    expect(lines).toHaveLength(REDACTED_FIELDS.length);
    for (const entry of parse(lines)) {
      expect(JSON.stringify(entry)).not.toContain(marker);
    }
    expect(parse(lines)[0]).toMatchObject({ msg: "probe" });
    expect(lines.join("")).toContain("[redacted]");
  });

  it("blanks Home's whole answer logged by mistake, a field under another spelling and anything that isn't plain data (the outside audit's A14)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const caption = "a caption that must never be logged: sunset at the pier";
    const body = {
      mode: "day",
      club: { id: "clb_1", name: "Saturday People", timezone: "Europe/London" },
      day: { drops: [{ id: "drp_1", caption, author: { membership_id: "itv_1", display_name: "Ben" } }] },
    };
    class Holder {
      readonly inside: string;
      constructor(inside: string) {
        this.inside = inside;
      }
    }
    const looped: Record<string, unknown> = { id: "drp_1" };
    looped.self = looped;
    app.log.info({ served: { home: body } }, "served");
    app.log.info({ Caption: caption, signedURL: "https://s.example/o", "display-name": "Ben" }, "spelled");
    app.log.info({ held: new Holder(caption), bytes: Buffer.from(caption), looped }, "objects");
    const text = lines.join("");
    for (const content of [caption, "Saturday People", "Ben", "https://s.example"]) expect(text).not.toContain(content);
    const [served, spelled, objects] = parse(lines);
    // Ids, modes and timezones are left as they are: the line still says what happened.
    expect(served).toMatchObject({
      msg: "served",
      served: { home: { mode: "day", club: { id: "clb_1", name: "[redacted]", timezone: "Europe/London" } } },
    });
    expect(spelled).toMatchObject({ Caption: "[redacted]", signedURL: "[redacted]", "display-name": "[redacted]" });
    expect(objects).toMatchObject({
      held: "[redacted]",
      bytes: "[redacted]",
      looped: { id: "drp_1", self: "[circular]" },
    });
  });

  it("names the fields T52 lists: captions, comments, notes, source and signed URLs, tokens, EXIF, push text, email", () => {
    for (const field of [
      "caption",
      "comment",
      "note",
      "source_url",
      "signed_url",
      "upload_url",
      "token",
      "authorization",
      "exif",
      "push",
      "email",
      "phone",
      "display_name",
      "name",
      "headers",
      "body",
      "query",
      "apns_token",
      "removal_secret",
    ]) {
      expect(REDACTED_FIELDS, field).toContain(field);
    }
  });

  it("reduces an error to its class and its code, never its message, which can quote rows", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const error = Object.assign(new Error(`duplicate key (auth_subject)=(${randomUUID()}) ${TEST_EMAIL}`), {
      code: "23505",
    });
    app.log.error({ err: error }, "failed");
    const [entry] = parse(lines);
    expect(entry).toMatchObject({ err: { type: "Error", code: "23505" } });
    expect(Object.keys((entry as { err: object }).err).sort()).toEqual(["code", "type"]);
    expect(lines.join("")).not.toMatch(/duplicate|auth_subject|example\.invalid/);
    // And what isn't an error at all.
    lines.length = 0;
    app.log.error({ err: "ana@example.invalid said so" }, "failed");
    app.log.error({ err: null }, "failed");
    expect(lines.join("")).not.toContain("ana@");
  });

  it("drops a whole request or answer object logged by mistake, and doesn't merely blank it", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    app.log.info({ req: { url: "/v1/secret?email=a@b.invalid", headers: { authorization: "Bearer x" } } }, "oops");
    app.log.info({ res: { statusCode: 200, body: "caption" } }, "oops");
    expect(lines.join("")).not.toMatch(/secret|authorization|Bearer|caption|a@b/);
    // `redact` blanks a `req` or a `res` too, so the words above alone can't tell the serializers that drop
    // it from the list that blanks it: the key itself is gone, whichever layer is the one still standing.
    const entries = parse(lines);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("req");
      expect(entry).not.toHaveProperty("res");
    }
  });
});

describe("a request's log line", () => {
  it("is one line, with the request's random id, the operation, the status and the milliseconds, and nothing else", async () => {
    const { inject, lines } = await logged(() => Promise.resolve(READY));
    await inject({ method: "GET", url: "/v1/me" });
    const [entry, ...rest] = parse(lines);
    expect(rest).toEqual([]);
    expect(Object.keys(entry ?? {}).sort()).toEqual(["level", "ms", "msg", "op", "reqId", "status", "time"]);
    expect(entry).toMatchObject({ level: 30, msg: "request", op: "getMe", status: 200 });
    expect(typeof (entry as { ms: unknown }).ms).toBe("number");
  });

  it("carries no operation for a path nobody serves, and no path", async () => {
    const { inject, lines } = await logged(() => Promise.resolve(null));
    await inject({
      method: "GET",
      url: "/v1/very-secret-path/xyz?email=ana@example.invalid",
      headers: { "x-request-id": "evil" },
    });
    const [entry, ...rest] = parse(lines);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ msg: "request", status: 404 });
    expect(Object.keys(entry ?? {})).not.toContain("op");
    expect(lines.join("")).not.toMatch(/secret|xyz|example|evil/);
  });

  it("has an id that is random, not a counter, and never the caller's own header", async () => {
    const { inject, lines } = await logged(() => Promise.resolve(READY));
    for (let index = 0; index < 5; index += 1) {
      await inject({ method: "GET", url: "/v1/me", headers: { "x-request-id": "evil", "request-id": "evil" } });
    }
    const ids = parse(lines).map((entry) => entry["reqId"]);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(id).not.toMatch(/^req-/);
    }
    expect(lines.join("")).not.toContain("evil");
    expect(requestId()).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(requestId()).not.toBe(requestId());
  });

  it("holds Fastify's own lines back: no incoming request, no route not found, no completed request", async () => {
    const { inject, lines } = await logged(() => Promise.resolve(READY));
    await inject({ method: "GET", url: "/v1/nope" });
    await inject({ method: "GET", url: `/v1/drops/${"a".repeat(101)}` });
    await inject({ method: "PATCH", url: "/v1/me", headers: { "content-type": "application/json" }, payload: "{bad" });
    const messages = parse(lines).map((entry) => entry["msg"]);
    // Ours alone, one each: the id past its limit too, which Fastify answers before routing.
    expect(messages).toEqual(["request", "request", "request"]);
    expect(lines.join("")).not.toMatch(/incoming request|not found|request completed|request errored|\/v1\/nope/);
  });

  it("is written for an answer Fastify gives before routing too: an id past its limit, a broken escape (the outside audit's A14)", async () => {
    const { inject, lines } = await logged(() => Promise.resolve(READY));
    const urls = [
      `/v1/clubs/${"a".repeat(101)}`,
      `/v1/clubs/${"b".repeat(4096)}`,
      "/v1/clubs/%zz",
      "/v1/clubs/%",
      "/v1/clubs/%E0%A4%A",
    ];
    for (const url of urls) {
      const answer = await inject({ method: "GET", url });
      expect(answer.statusCode).toBe(404);
    }
    const entries = parse(lines);
    expect(entries).toHaveLength(urls.length);
    for (const entry of entries) {
      expect(entry).toMatchObject({ level: 30, msg: "request", status: 404 });
      expect(Object.keys(entry).sort()).toEqual(["level", "ms", "msg", "reqId", "status", "time"]);
    }
    expect(lines.join("")).not.toMatch(/clubs|aaaa|bbbb|%zz|%E0/);
  });

  it("honours the level: silent says nothing, warn says no request line", async () => {
    const quiet = await logged(() => Promise.resolve(READY), { level: "silent" });
    await quiet.inject({ method: "GET", url: "/v1/me" });
    expect(quiet.lines).toEqual([]);
    const warn = await logged(() => Promise.resolve(READY), { level: "warn" });
    await warn.inject({ method: "GET", url: "/v1/me" });
    expect(warn.lines).toEqual([]);
  });
});

describe("the log test: what reaches the log across the answers a request can get (T52)", () => {
  // What must never be in a line: an email address in a token's claims, a body, a query, a header and an
  // error's message, the token itself, a caption-like string and a sign-in subject.
  const SUBJECT = randomUUID();
  const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJmb28ifQ.c2lnbmF0dXJl-MARKER";
  const CAPTION = "a caption that must never be logged: sunset at the pier";
  // A name a person could really send (no space at either end, so the body is refused for its version, not its name).
  const NAME = CAPTION.slice(0, 19);
  const MARKERS = [
    TEST_EMAIL,
    TOKEN,
    CAPTION,
    NAME,
    SUBJECT,
    "ana@example.invalid",
    "leaky-header-value",
    "leaky-query-value",
  ];
  const carrying = {
    authorization: `Bearer ${TOKEN}`,
    "x-leaky": "leaky-header-value",
    "x-email": TEST_EMAIL,
    cookie: `session=${TOKEN}`,
  };

  it("finds no email address, token, caption or subject in a 200, 400, 401, 403, 404, 409, 503 or 500", async () => {
    const behaviours: Record<string, () => Promise<Account | null>> = {
      ready: () => Promise.resolve(READY),
      unfinished: () => Promise.resolve({ ...READY, displayName: null, ageConfirmed: false }),
      none: () => Promise.resolve(null),
      keys: () => Promise.reject(new KeysUnavailable("timeout", { cause: new Error(`fetch ${TEST_EMAIL} ${TOKEN}`) })),
      bug: () =>
        Promise.reject(Object.assign(new Error(`row (${SUBJECT}, ${TEST_EMAIL}) ${TOKEN}`), { code: "XX000" })),
    };
    let behaviour = "ready";
    const { inject, lines } = await logged(() => behaviours[behaviour]?.() ?? Promise.resolve(null), {
      begin: () => Promise.reject(new Refused("VERSION_CONFLICT", { current_version: 9 })),
    });
    const seen: number[] = [];
    const drive = async (which: string, request: InjectOptions) => {
      behaviour = which;
      const response = await inject({ ...request, headers: { ...carrying, ...request.headers } });
      seen.push(response.statusCode);
    };
    const json = { "content-type": "application/json", "idempotency-key": KEY };
    await drive("ready", { method: "GET", url: `/v1/me?email=${TEST_EMAIL}&q=leaky-query-value` }); // 200
    await drive("ready", {
      method: "PATCH",
      url: "/v1/me?leak=leaky-query-value",
      headers: json,
      payload: JSON.stringify({ expected_version: "x", display_name: CAPTION, email: TEST_EMAIL }),
    }); // 400
    await drive("none", { method: "GET", url: `/v1/me?email=${TEST_EMAIL}` }); // 401
    await drive("unfinished", { method: "GET", url: "/v1/clubs", payload: CAPTION }); // 403
    await drive("ready", { method: "GET", url: `/v1/drops/drp_x?caption=${encodeURIComponent(CAPTION)}` }); // 404
    await drive("ready", {
      method: "PATCH",
      url: "/v1/me",
      headers: json,
      payload: JSON.stringify({ expected_version: 1, display_name: NAME }),
    }); // 409
    await drive("keys", { method: "GET", url: "/v1/me" }); // 503
    await drive("bug", { method: "GET", url: "/v1/me" }); // 500
    expect(seen).toEqual([200, 400, 401, 403, 404, 409, 503, 500]);
    const text = lines.join("");
    for (const marker of MARKERS) expect(text, marker).not.toContain(marker);
    // Each request has its line, the two failures their error line, and nothing else.
    const entries = parse(lines);
    expect(entries.filter((entry) => entry["msg"] === "request")).toHaveLength(8);
    expect(
      entries
        .filter((entry) => entry["level"] === 50)
        .map((entry) => entry["msg"])
        .sort(),
    ).toEqual(["request failed", "sign-in keys unavailable"]);
    // The failure lines carry the class and the code, or the reason in one of five fixed words.
    expect(entries.find((entry) => entry["msg"] === "sign-in keys unavailable")).toMatchObject({ trouble: "timeout" });
    expect(entries.find((entry) => entry["msg"] === "request failed")).toMatchObject({
      err: { type: "Error", code: "XX000" },
    });
  });
});
