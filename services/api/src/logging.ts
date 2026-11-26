// The API's logs (T52; TECH-DESIGN sections 5 and 8; docs/plans/B0.md, slice 8). Logs carry no content:
// no caption, comment, note, source or signed URL, token, EXIF, push text or email address, and nothing
// that names a person: request ids and opaque ids only. Three layers hold that, and any one of them
// is enough:
// 1. Fastify's own log lines are all off (`LogController` with `disableRequestLogging`): they carry the
//    path and the query (`Route GET:/v1/... not found`), `req` and `res` objects and an error's message,
//    which Postgres fills with row values. What is left of Fastify's is its one line for a request
//    refused while the server closes, which names no one.
// 2. The one line a request gets is ours (`logEachRequest`): its random id, the contract's operation id
//    (for the browser's preflight, `preflight` and the operation it is for: web-origin.ts), the status and
//    the milliseconds it took. No URL, header, body, address or claim ever goes in it.
// 3. Whatever else a later change logs, in a line's own fields or a child logger's bindings, goes through
//    `redact`, which blanks every field that could hold content at any depth: a key on the list in any case
//    and with or without `_` and `-` (`signedURL`, `Caption`), and a key with a word of REDACTED_WORDS in
//    it (`signed_upload_url`, `captionText`, `storage_path`); and any object that isn't a plain one or an
//    array. An `err` is reduced to its class name and its code (the outside audit's A14: pino's own
//    redaction went one level down, and read only the spellings it was given).
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
 * credential, a storage path, text people wrote, a name and a provider's post. Not the request line's own
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
  "exif",
  "metadata",
  "email",
  "phone",
  "name",
  "label",
] as const;

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
 * A line's own fields, or a child logger's bindings, `redact`ed, but its `err`, which its serializer reduces
 * to a class and a code.
 */
export function redactLine(fields: Record<string, unknown>): Record<string, unknown> {
  const { err, ...rest } = fields;
  const out = redact(rest, new Set()) as Record<string, unknown>;
  return err === undefined ? out : { ...out, err };
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
      // A line's own fields; a child logger's bindings are `redactBindings`'.
      formatters: { log: redactLine },
      serializers: { err: safeError, req: () => undefined, res: () => undefined },
      // Fastify types a serializer's result as its own request, error and answer shapes; these return less.
    } as unknown as NonNullable<FastifyServerOptions["logger"]>,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: requestId,
    requestIdHeader: false,
  };
}

/**
 * Every child logger's bindings `redact`ed as it is made, its children's too (the round-1 review): pino's
 * `formatters.log` reads only a line's own fields, and pino resets `formatters.bindings` for a child, so
 * `request.log.child({ caption })` would write the caption whole into each of its lines. pino makes a child
 * from its parent's prototype, so the root's own `child` is the one every logger of the app calls, Fastify's
 * request loggers included. A request's id (`reqId`) is no field of the list and stays.
 */
export function redactBindings(log: FastifyBaseLogger): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the logger it is made from
  const child = log.child;
  log.child = function redactedChild(this: FastifyBaseLogger, bindings, options) {
    return child.call(this, redactLine(bindings), options);
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
