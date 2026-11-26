// The API's logs (T52; TECH-DESIGN sections 5 and 8; docs/plans/B0.md, slice 8). Logs carry no content:
// no caption, comment, note, source or signed URL, token, EXIF, push text or email address, and nothing
// that names a person: request ids and opaque ids only. Three layers hold that, and any one of them
// is enough:
// 1. Fastify's request lines are all off (`LogController` with `disableRequestLogging`): they carry the
//    path and the query (`Route GET:/v1/... not found`), `req` and `res` objects and an error's message,
//    which Postgres fills with row values. What is left of Fastify's own are lines about Fastify itself
//    (the address it listens on, a stream or a hook that failed, a request refused while the server
//    closes), which carry nothing of a request's, and its warning for an answer sent after one went out
//    on `reply.raw`, which quotes the request's URL and so keeps only its fixed start (`ownMessage`; the
//    round-3 review).
// 2. The one line a request gets is ours (`logEachRequest`): its random id, the contract's operation id
//    (for the browser's preflight, `preflight` and the operation it is for: web-origin.ts), the status and
//    the milliseconds it took. No URL, header, body, address or claim ever goes in it.
// 3. Whatever else a later change logs, in a line's own fields or a logger's bindings (a child's, or ones
//    set later), goes through `redact`, which blanks every field that could hold content at any depth: a
//    key on the list in any case and with or without `_` and `-` (`signedURL`, `Caption`), and a key with
//    a word of REDACTED_WORDS in it (`signed_upload_url`, `captionText`, `storage_path`); and any object
//    that isn't a plain one or an array (the outside audit's A14: pino's own redaction went one level down,
//    and read only the spellings it was given). pino's own redaction of the list, at the top and one level
//    down, stays beneath it, for a child that brings a log formatter of its own (the round-2 review). An
//    `err` is reduced to its class name and its code. A line's message is the fixed string our code or
//    Fastify passes: given an error and no message, pino would copy the error's message into it, so such
//    a line gets a fixed one (`ownMessage`; the round-2 review).
// The request id is random, 96 bits, never Fastify's counter and never a header the caller sent.
//
// Time is pino's own (`time` in each line), which is not the server's clock (T1): nothing here reads one.

import { randomBytes } from "node:crypto";
import {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";

export interface LogConfig {
  /** pino's level: `info` in production, `silent` for a test that doesn't read the log. */
  readonly level: string;
  /** Where the lines go: standard output when absent; a test passes its own to read them. */
  readonly stream?: { write(line: string): void };
}

const BLANKED = "[redacted]";

/**
 * Every key that could hold content or identify a person, named after T52's list and the fields the
 * API handles: credentials, content, URLs, push text, email and phone, names, the account and its sign-in
 * subject, and whole requests and answers. `redact` blanks each one at any depth, matching a key lower-cased
 * with `_` and `-` taken out, so a later `log.info({ served: { home: { drops: [{ caption }] } } })` comes
 * out blanked too.
 */
export const REDACTED_FIELDS = [
  // Tokens, keys and signatures
  "authorization",
  "cookie",
  "token",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "id_token",
  "idToken",
  "jwt",
  "apikey",
  "api_key",
  "apiKey",
  "secret",
  "password",
  "signature",
  "key",
  // Signed and source URLs, and any address a person could have pasted
  "url",
  "uri",
  "href",
  "link",
  "signed_url",
  "signedUrl",
  "upload_url",
  "uploadUrl",
  "source_url",
  "sourceUrl",
  "canonical_url",
  "canonicalUrl",
  "provider_id",
  "providerId",
  // Captions, comments, notes and push text
  "caption",
  "captions",
  "comment",
  "comments",
  "note",
  "notes",
  "text",
  "body",
  "title",
  "alert",
  "push",
  "payload",
  "message",
  // EXIF and the like
  "exif",
  "metadata",
  // Email, phone, address and device
  "email",
  "phone",
  "ip",
  "remoteAddress",
  "remote_address",
  "user_agent",
  "userAgent",
  // A device's push address and its sign-in (T52; db/migrations/0017_devices.sql)
  "apns_token",
  "apnsToken",
  "removal_secret",
  "removalSecret",
  "sign_in",
  "signIn",
  // Names: a person's, a club's and a candidate's
  "name",
  "display_name",
  "displayName",
  "club_name",
  "clubName",
  "inviter_name",
  "inviterName",
  "label",
  // The account and its sign-in
  "sub",
  "subject",
  "auth_subject",
  "authSubject",
  "claims",
  "account",
  "user",
  "me",
  // Whole requests and answers
  "req",
  "res",
  "request",
  "reply",
  "response",
  "headers",
  "query",
  "params",
] as const;

/**
 * The words that blank a key wherever they stand in it, as a word of its own (the round-1 review: a key the
 * list doesn't spell, such as `media_url`, `photoUrl` or `object_key`, came out whole): an address, a
 * credential, a storage path, text people wrote, a search, a reason someone gave, a name and a provider's
 * post (the round-2 review: `search_query`, `content`, `reason`, `username`). Not the request line's own
 * keys' words (`req` of `reqId`, `op`, `ms`).
 */
export const REDACTED_WORDS = [
  "authorization",
  "cookie",
  "token",
  "jwt",
  "secret",
  "password",
  "signature",
  "key",
  "url",
  "uri",
  "href",
  "link",
  "path",
  "provider",
  "post",
  "caption",
  "comment",
  "note",
  "text",
  "body",
  "title",
  "message",
  "payload",
  "content",
  "query",
  "search",
  "reason",
  "exif",
  "metadata",
  "email",
  "phone",
  "name",
  "username",
  "nickname",
  "label",
] as const;

/** The paths pino's own redaction blanks beneath `redact`: each field at the top and one level down, as `main` had. */
const PATHS = REDACTED_FIELDS.flatMap((field) => [field, `*.${field}`]);

/** A key as `redact` matches it: lower case, with `_` and `-` taken out. */
const squash = (key: string) => key.toLowerCase().replace(/[_-]/g, "");
const REDACTED = new Set<string>(REDACTED_FIELDS.map(squash));
const WORDS = new Set<string>(REDACTED_WORDS.flatMap((word) => [word, `${word}s`]));

/**
 * A key's words, as the leak scanner reads them: split at `_`, `-` and a space, at a capital after a small
 * letter or a digit, at the last capital of a run before a small letter (an acronym's plural `s` staying
 * with it), and between letters and digits; lower case.
 */
function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]{2,})s(?![a-z])/g, "$1S")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([A-Za-z])([0-9])/g, "$1_$2")
    .replace(/([0-9])([A-Za-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_\- ]+/);
}

/** Whether `redact` blanks a key: on the list in any of its spellings, or with a word of REDACTED_WORDS. */
export function redacted(key: string): boolean {
  return REDACTED.has(squash(key)) || wordsOf(key).some((word) => WORDS.has(word));
}

/**
 * `value` as a log line may hold it: each key on the list blanked at any depth, inside arrays too, and any
 * object that isn't a plain one or an array blanked whole, since its JSON form is its own to choose (a
 * class's `toJSON`, a buffer's bytes). A value met again inside itself is `[circular]`.
 */
function redact(value: unknown, within: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (within.has(value)) return "[circular]";
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return BLANKED;
  within.add(value);
  const out = Array.isArray(value)
    ? value.map((item: unknown) => redact(item, within))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, redacted(key) ? BLANKED : redact(child, within)]),
      );
  within.delete(value);
  return out;
}

/**
 * A line's own fields, or a logger's bindings, `redact`ed, but its `err`, which its serializer reduces to a
 * class and a code; and a `msg` among them blanked, which pino would write as the line's message.
 */
export function redactLine(fields: Record<string, unknown>): Record<string, unknown> {
  const { err, msg, ...rest } = fields;
  const out = redact(rest, new Set()) as Record<string, unknown>;
  if (msg !== undefined) out.msg = BLANKED;
  return err === undefined ? out : { ...out, err };
}

/** The message of a line that has an error and none of its own. */
export const ERROR_MESSAGE = "error";

/**
 * The fixed start of Fastify's warning for an answer sent after one went out on `reply.raw`
 * (`safeWriteHead`), whose rest quotes the request's URL, query and all: all of it a line keeps.
 */
export const REPLY_SENT_MESSAGE = "Reply was already sent";

/**
 * pino's `hooks.logMethod`: a line that has an error and no message of its own (`log.error(err)`,
 * `log.warn({ err })`, an `err` pino counts: one that isn't falsy) gets ERROR_MESSAGE, since pino would copy
 * the error's message into the line's `msg`, which no field's redaction reaches (the round-2 review:
 * Postgres quotes row values in it, and Fastify's error for a second answer to a request quotes the
 * request's URL); and Fastify's warning that quotes the URL in its message keeps only REPLY_SENT_MESSAGE,
 * without any format arguments (the round-3 review).
 */
function ownMessage(this: unknown, args: unknown[], method: (...args: unknown[]) => void): void {
  const [first, second] = args;
  // pino's message is the first argument when that is a string, and the second when an object comes first.
  const at = typeof first === "string" ? 0 : typeof second === "string" ? 1 : undefined;
  if (at !== undefined && (args[at] as string).startsWith(REPLY_SENT_MESSAGE)) {
    method.apply(this, [...args.slice(0, at), REPLY_SENT_MESSAGE]);
    return;
  }
  const fields = typeof first === "object" && first !== null ? (first as { err?: unknown; msg?: unknown }) : undefined;
  const erred = first instanceof Error || (Boolean(fields?.err) && fields?.msg === undefined);
  if (erred && second === undefined) method.apply(this, [first, ERROR_MESSAGE]);
  else method.apply(this, args);
}

/** An error as a log line may show it: its class and its code, never its message, which can quote rows. */
function safeError(error: unknown): { type: string; code?: string } {
  if (typeof error !== "object" || error === null) return { type: "unknown" };
  const { name, code } = error as { name?: unknown; code?: unknown };
  const described: { type: string; code?: string } = { type: typeof name === "string" ? name : "unknown" };
  if (typeof code === "string") described.code = code;
  return described;
}

/**
 * A request's id: 96 random bits as base64url. Never Fastify's counter, which tells how many requests
 * came before, and never the caller's own header, which would put their text in a log.
 */
export function requestId(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * What `Fastify({ ...fastifyLogging(config) })` takes: the logger, with Fastify's own request lines
 * off, a random id for each request and none from the caller.
 */
export function fastifyLogging(
  config: LogConfig,
): Pick<FastifyServerOptions, "logger" | "logController" | "genReqId" | "requestIdHeader"> {
  return {
    logger: {
      level: config.level,
      ...(config.stream === undefined ? {} : { stream: config.stream }),
      // Not the process id or the machine's name: a line is the request's, nothing about where it ran.
      base: null,
      // A line's own fields; a logger's bindings are `redactBindings`'.
      formatters: { log: redactLine },
      redact: { paths: PATHS, censor: BLANKED },
      hooks: { logMethod: ownMessage },
      serializers: { err: safeError, req: () => undefined, res: () => undefined },
      // Fastify types a serializer's result as its own request, error and answer shapes; these return less.
    } as unknown as NonNullable<FastifyServerOptions["logger"]>,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: requestId,
    requestIdHeader: false,
  };
}

/**
 * Every logger's bindings `redact`ed, as a child is made and as `setBindings` adds to them, its children's
 * too (the round-1 and round-2 reviews): pino's `formatters.log` reads only a line's own fields, and pino
 * resets `formatters.bindings` for a child, so `request.log.child({ caption })` would write the caption whole
 * into each of its lines. pino makes a child from its parent's prototype, so the root's own `child` and
 * `setBindings` are the ones every logger of the app calls, Fastify's request loggers included. A child that
 * brings a log formatter of its own gets it with `redactLine` after it, called as pino would call it; one
 * that brings none, or a falsy one, has its parent's, as in pino. Bindings that are absent pass as they
 * are, for pino to refuse or skip (the round-3 review). A request's id (`reqId`) is no field of the list
 * and stays.
 */
export function redactBindings(log: FastifyBaseLogger): void {
  // pino's loggers have it; Fastify's type of them leaves it out.
  const settable = log as FastifyBaseLogger & {
    setBindings?: (bindings: Record<string, unknown> | null | undefined) => void;
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the logger it is made from
  const child = log.child;
  const setBindings = settable.setBindings;
  log.child = function redactedChild(this: FastifyBaseLogger, bindings, options) {
    const own: unknown = options?.formatters?.log;
    const formatted =
      options === undefined || typeof own !== "function"
        ? options
        : {
            ...options,
            formatters: {
              ...options.formatters,
              // pino calls a formatter as a method of the formatters it was given.
              log: function redactedOwn(this: unknown, fields: object) {
                return redactLine((own as (fields: object) => unknown).call(this, fields) as Record<string, unknown>);
              },
            },
          };
    // Fastify's type says bindings are always there; a caller outside TypeScript can leave them out.
    const given = bindings as typeof bindings | null | undefined;
    return child.call(
      this,
      given === undefined || given === null ? (given as unknown as typeof bindings) : redactLine(given),
      formatted,
    );
  };
  // A logger with no `setBindings` has no bindings to set later.
  if (setBindings !== undefined)
    settable.setBindings = function redactedSetBindings(
      this: unknown,
      bindings: Record<string, unknown> | null | undefined,
    ) {
      setBindings.call(this, bindings === undefined || bindings === null ? bindings : redactLine(bindings));
    };
}

/** The one line a request gets, when its answer has gone: id, operation, status and milliseconds. */
export function requestLine(request: FastifyRequest, reply: FastifyReply): void {
  request.log.info(
    {
      op: request.routeOptions.config.operation,
      preflight: request.routeOptions.config.preflight,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    },
    "request",
  );
}

/**
 * `requestLine` for every request a route or the not-found handler answers. Fastify runs no hook for an answer
 * it gives before routing (an id past its limit, a broken escape), so `buildApp`'s `frameworkErrors` writes
 * that request's line itself, and every request Fastify reads has one (the privacy matrix counts them: the
 * outside audit's A14). A connection Node's parser refuses before there is a request (`clientError`'s raw
 * 400) has none: it has no request, no id and nothing of the caller's to log.
 */
export function logEachRequest(app: FastifyInstance): void {
  app.addHook("onResponse", (request, reply, done) => {
    requestLine(request, reply);
    done();
  });
}
