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
import { Fault, InputFault, RangeFault } from "@tadayo/domain/fault";
import Fastify, { type FastifyInstance, type InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type Deps } from "./app.ts";
import type { ApiSql } from "./connection.ts";
import { KeysUnavailable } from "./identity/token.ts";
import {
  ERROR_MESSAGE,
  fastifyLogging,
  REDACTED_FIELDS,
  redactBindings,
  redacted,
  REPLY_SENT_MESSAGE,
  requestId,
} from "./logging.ts";
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

  it("blanks a key the list doesn't spell when a word of it is a content word, and keeps the request line's own keys (the round-1 review)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const marker = "MARKER-must-never-appear";
    const spelled = [
      "signed_upload_url",
      "signedUploadUrl",
      "media_url",
      "photoUrl",
      "photoURLs",
      "avatar_url",
      "thumbnail_url",
      "object_key",
      "storage_path",
      "post_id",
      "provider_post_id",
      "drop_caption",
      "captionText",
      "comment_text",
      "search_text",
      "labels",
      "clubName2",
      // The round-2 review.
      "search_query",
      "searchQuery",
      "content",
      "reason",
      "username",
      "nickname",
    ];
    app.log.info({ deep: [{ inside: Object.fromEntries(spelled.map((key) => [key, marker])) }] }, "spelled");
    expect(lines.join("")).not.toContain(marker);
    for (const key of spelled) expect(redacted(key), key).toBe(true);
    for (const key of ["reqId", "op", "preflight", "status", "ms", "trouble", "mode", "timezone", "id", "drop_id"])
      expect(redacted(key), key).toBe(false);
  });

  it("blanks a child logger's bindings as it blanks a line's own fields, and keeps a request's id", async () => {
    const { app, lines, inject } = await logged(() => Promise.resolve(READY));
    app.log
      .child({ caption: "SECRET-CAPTION", club: { name: "Club Name Here" }, photoUrl: "https://s.example/o" })
      .info({ op: "probe" }, "child line");
    app.log.child({ step: 1 }).child({ comment_text: "SECRET-COMMENT" }).info("grandchild line");
    const [child, grandchild] = parse(lines);
    expect(child).toMatchObject({
      msg: "child line",
      op: "probe",
      caption: "[redacted]",
      club: { name: "[redacted]" },
    });
    expect(grandchild).toMatchObject({ msg: "grandchild line", step: 1, comment_text: "[redacted]" });
    expect(lines.join("")).not.toMatch(/SECRET-CAPTION|SECRET-COMMENT|Club Name Here|s\.example/);
    lines.length = 0;
    await inject({ method: "GET", url: "/v1/me" });
    const [line] = parse(lines);
    expect(line?.reqId).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("blanks bindings set later, a child's whose own log formatter would keep them, and a `msg` among a line's fields (the round-2 review)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const later = app.log.child({ step: 2 });
    (later as unknown as { setBindings(bindings: object): void }).setBindings({
      caption: "SECRET-SET-CAPTION",
      deep: { inner: { comment_text: "SECRET-SET-COMMENT" } },
    });
    later.info("set later");
    app.log
      .child({ step: 3 }, { formatters: { log: (fields: object) => fields } })
      .info({ caption: "SECRET-OWN-CAPTION", deep: { inner: { photoUrl: "https://s.example/own" } } }, "own formatter");
    app.log.info({ msg: "SECRET-MSG-FIELD", op: "probe" });
    const [set, own, field] = parse(lines);
    expect(set).toMatchObject({
      msg: "set later",
      step: 2,
      caption: "[redacted]",
      deep: { inner: { comment_text: "[redacted]" } },
    });
    expect(own).toMatchObject({
      msg: "own formatter",
      step: 3,
      caption: "[redacted]",
      deep: { inner: { photoUrl: "[redacted]" } },
    });
    expect(field).toMatchObject({ msg: "[redacted]", op: "probe" });
    expect(lines.join("")).not.toMatch(/SECRET-|s\.example/);
  });

  it("keeps pino's ways: a child's falsy log formatter falls back to its parent's, a formatter is called as pino calls it, and absent bindings pass (the round-3 review)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    for (const log of [null, false, undefined]) {
      // pino reads a falsy formatter as none, so the child keeps its parent's, and the redaction with it.
      const options = { formatters: { log } } as unknown as Parameters<typeof app.log.child>[1];
      app.log.child({ step: 4 }, options).info({ caption: "SECRET-FALLBACK" }, "fallback");
    }
    let seen: string | undefined;
    const own = {
      formatters: {
        log: function remember(this: { log?: unknown } | undefined, fields: object) {
          seen = typeof this?.log;
          return fields;
        },
      },
    };
    app.log.child({ step: 5 }, own).info({ caption: "SECRET-THIS" }, "this");
    const settable = app.log.child({ step: 6 }) as unknown as { setBindings(bindings: unknown): void };
    expect(() => {
      settable.setBindings(undefined);
    }).not.toThrow();
    expect(() => {
      settable.setBindings(null);
    }).not.toThrow();
    const entries = parse(lines);
    expect(entries).toHaveLength(4);
    for (const entry of entries.slice(0, 3)) expect(entry).toMatchObject({ msg: "fallback", caption: "[redacted]" });
    expect(entries[3]).toMatchObject({ msg: "this", caption: "[redacted]" });
    // pino calls a log formatter as a method of the child's formatters, which hold it.
    expect(seen).toBe("function");
    expect(lines.join("")).not.toContain("SECRET-");
  });

  it("blanks what a child's own bindings formatter brings, and lets pino refuse falsy bindings as pino does (the round-4 review)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const given: unknown[] = [];
    let self = "unset";
    const own = {
      formatters: {
        bindings: function bring(this: unknown, bindings: Record<string, unknown>) {
          given.push(bindings);
          self = typeof this;
          return { ...bindings, extra: { deeper: { caption: "SECRET-BINDINGS" } } };
        },
      },
    };
    const formatted = app.log.child({ step: 7, note: "SECRET-GIVEN" }, own);
    formatted.info("bound");
    // Its later bindings go through its own formatter too, in pino's `setBindings`.
    (formatted as unknown as { setBindings(bindings: unknown): void }).setBindings({ later: 1 });
    formatted.info("later");
    // A formatter that returns no object is pino's to deal with, as it is without the wrapper.
    app.log
      .child({ step: 8 }, { formatters: { bindings: () => undefined } } as unknown as Parameters<
        typeof app.log.child
      >[1])
      .info("none");
    for (const bindings of [0, "", false, null, undefined])
      expect(() => app.log.child(bindings as unknown as Record<string, unknown>), String(bindings)).toThrow(
        "missing bindings for child Pino",
      );
    const entries = parse(lines);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      msg: "bound",
      step: 7,
      note: "[redacted]",
      extra: { deeper: { caption: "[redacted]" } },
    });
    expect(entries[1]).toMatchObject({ msg: "later", later: 1, extra: { deeper: { caption: "[redacted]" } } });
    expect(entries[2]).toMatchObject({ msg: "none" });
    expect(entries[2]).not.toHaveProperty("step");
    // The formatter gets the bindings already blanked, and pino calls it with no `this`.
    expect(given[0]).toMatchObject({ note: "[redacted]" });
    expect(given[1]).toEqual({ later: 1 });
    expect(self).toBe("undefined");
    expect(lines.join("")).not.toContain("SECRET-");
  });

  it("keeps pino's own redaction of the list beneath it, at the top and one level down, as `main` had (the round-2 review)", () => {
    const options = fastifyLogging({ level: "info" }).logger as unknown as {
      redact: { paths: string[]; censor: string };
    };
    expect(options.redact.censor).toBe("[redacted]");
    for (const field of REDACTED_FIELDS) {
      expect(options.redact.paths, field).toContain(field);
      expect(options.redact.paths, field).toContain(`*.${field}`);
    }
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

  it("gives a line with an error and no message of its own a fixed one, never the error's, which pino would copy (the round-2 review)", async () => {
    const { app, lines } = await logged(() => Promise.resolve(READY));
    const error = () =>
      Object.assign(new Error(`duplicate key value (caption)=(SECRET-ROW) ${TEST_EMAIL}`), { code: "23505" });
    app.log.error(error());
    app.log.error({ err: error() });
    app.log.child({ step: 1 }).warn({ err: error() });
    app.log.error({ err: "SECRET-STRING-ERROR" });
    const entries = parse(lines);
    expect(entries).toHaveLength(4);
    for (const entry of entries.slice(0, 3)) {
      expect(entry).toMatchObject({ msg: ERROR_MESSAGE, err: { type: "Error", code: "23505" } });
    }
    expect(lines.join("")).not.toMatch(/SECRET-ROW|duplicate|example\.invalid|SECRET-STRING-ERROR/);
    // A message of its own stays.
    lines.length = 0;
    app.log.error({ err: error() }, "failed");
    expect(parse(lines)[0]).toMatchObject({ msg: "failed" });
    // Fastify's own warning for a second answer to a request, whose error quotes the request's URL.
    const own: string[] = [];
    const bare = Fastify(fastifyLogging({ level: "info", stream: { write: (line) => void own.push(line) } }));
    redactBindings(bare.log);
    bare.get("/twice", (_request, reply) => {
      void reply.send("one");
      void reply.send("two");
      return reply;
    });
    bare.get("/raw", (_request, reply) => {
      reply.raw.writeHead(200);
      void reply.send("x");
      return reply;
    });
    open.push(bare);
    await bare.inject({ method: "GET", url: "/twice?caption=SECRET-QUERY" });
    const warned = parse(own).filter((entry) => entry.err !== undefined);
    expect(warned.length).toBeGreaterThan(0);
    for (const entry of warned) expect(entry.msg).toBe(ERROR_MESSAGE);
    expect(own.join("")).not.toContain("SECRET-QUERY");
    // And its warning for an answer sent after one went out on `reply.raw`, whose message quotes the URL
    // (the round-3 review): only its fixed start stays.
    own.length = 0;
    // Fastify then throws its own error for the headers already sent, and the injected request with it.
    await bare.inject({ method: "GET", url: "/raw?caption=SECRET-RAW" }).catch(() => undefined);
    const raw = parse(own).filter((entry) => typeof entry.msg === "string" && entry.msg.startsWith(REPLY_SENT_MESSAGE));
    expect(raw.length).toBeGreaterThan(0);
    for (const entry of raw) expect(entry.msg).toBe(REPLY_SENT_MESSAGE);
    expect(own.join("")).not.toContain("SECRET-RAW");
    // An `err` pino doesn't count as one, being falsy, gets no message either, as in pino.
    lines.length = 0;
    app.log.warn({ err: 0 });
    app.log.warn({ err: "" });
    for (const entry of parse(lines)) expect(entry).not.toHaveProperty("msg");
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

  it("logs a failure of the code's own by its class and site code, and never its message (the outside audit's B7)", async () => {
    // Before B7 such an error was a plain Error with no code, so its line said "Error" and nothing else.
    const faults = [
      new Fault("propose_roster_6", `clubs: the club vanished under its own lock (${SUBJECT}, ${TEST_EMAIL})`),
      new InputFault("upload_1", `media: the caller is an account id, not ${TOKEN}`),
      new RangeFault("civil_1", `time: ${CAPTION} isn't an IANA time zone (T2, FQ19)`),
    ];
    for (const fault of faults) {
      const { inject, lines } = await logged(() => Promise.reject(fault));
      expect((await inject({ method: "GET", url: "/v1/me", headers: carrying })).statusCode).toBe(500);
      const failed = parse(lines).filter((entry) => entry["msg"] === "request failed");
      expect(
        failed.map((entry) => entry["err"]),
        fault.code,
      ).toEqual([{ type: fault.name, code: fault.code }]);
      const text = lines.join("");
      for (const marker of MARKERS) expect(text, marker).not.toContain(marker);
      expect(text, fault.code).not.toContain(fault.message.slice(0, 12));
    }
  });
});
