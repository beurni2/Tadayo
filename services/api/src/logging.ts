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
// 3. Whatever else a later change logs goes through `redact`, which blanks every field that could hold
//    content, at the top and one level down, and an `err` is reduced to its class name and its code.
// The request id is random, 96 bits, never Fastify's counter and never a header the caller sent.
//
// Time is pino's own (`time` in each line), which is not the server's clock (T1): nothing here reads one.

import { randomBytes } from "node:crypto";
import { LogController, type FastifyInstance, type FastifyServerOptions } from "fastify";

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
 * subject, and whole requests and answers. `redact` blanks each one, and `*.field` blanks it one level
 * down, so a later `log.info({ request: { caption } })` comes out blanked too.
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
  // Names
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

/** The paths pino blanks: each field at the top and one level down. */
const PATHS = REDACTED_FIELDS.flatMap((field) => [field, `*.${field}`]);

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
      redact: { paths: PATHS, censor: BLANKED },
      serializers: { err: safeError, req: () => undefined, res: () => undefined },
      // Fastify types a serializer's result as its own request, error and answer shapes; these return less.
    } as unknown as NonNullable<FastifyServerOptions["logger"]>,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: requestId,
    requestIdHeader: false,
  };
}

/** The one line a request gets, when its answer has gone: id, operation, status and milliseconds. */
export function logEachRequest(app: FastifyInstance): void {
  app.addHook("onResponse", (request, reply, done) => {
    request.log.info(
      {
        op: request.routeOptions.config.operation,
        preflight: request.routeOptions.config.preflight,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      "request",
    );
    done();
  });
}
