// A small client for the parts of a Supabase project's HTTP surface that `storage-setup` and
// `supabase-probe` use: Storage, Auth's admin routes, and the Data API's two doors, REST and
// GraphQL (docs/plans/api-b0-deploy.md, section 5; T53, T56). Read from the vendor's own sources on
// 11 November 2026, and not yet run against a hosted project: the first run is on `dev`, after the
// founder's steps, so what the hosted gateway answers is checked there.
//
// What it knows, and why it is written this way:
//   - A secret or publishable key (`sb_secret_…`, `sb_publishable_…`) is no JWT. It goes in the
//     `apikey` header, and `Authorization` carries a user's token, or the same key again: the
//     gateway accepts a key there only if it is byte-identical to `apikey`. A legacy `service_role`
//     JWT goes in both. So every call sends `apikey`, and a call that has no user sends the same key
//     as `Authorization`, as `supabase-js` does. A secret key is refused for a request that looks
//     like a browser's, so no call sets a `User-Agent`.
//   - Storage answers every error with HTTP 400 and the real status, as a string, in the body's
//     `statusCode`, with a `code` beside it (`NoSuchBucket`, `AccessDenied`, `BucketAlreadyExists`).
//     A reply's `logical` status is that, else the HTTP status. Nothing branches on the HTTP status
//     alone.
//   - A body is read whole and never printed: a refused call's body can be the thing a leak would
//     have returned, and a response from the Management API carries the project's JWT secret.

import { OpsError } from "./ops-error.ts";

/** Who calls: the service key, the public key alone, or the public key with a signed-in user's token. */
export type Caller =
  | { readonly kind: "service"; readonly key: string }
  | { readonly kind: "anon"; readonly key: string }
  | { readonly kind: "user"; readonly key: string; readonly token: string };

export interface Reply {
  readonly status: number;
  /** Storage's own status: the body's `statusCode` when it has one, else the HTTP status. */
  readonly logical: number;
  /** The body's `code` (`NoSuchBucket`, `AccessDenied`, …), when it has one. */
  readonly code: string | undefined;
  /** The body as JSON, when it is. */
  readonly json: unknown;
  /** The body as it came. */
  readonly bytes: Uint8Array;
}

export interface Send {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Omitted for a call that carries no key at all: a signed upload URL's token is in its query. */
  readonly caller?: Caller;
  readonly json?: unknown;
  readonly body?: Uint8Array;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

const TIMEOUT_MS = 20_000;

/** The project's URL, which must be `https://<twenty letters>.supabase.co`, as the verifier requires (T53). */
export function projectUrl(value: string): string {
  const match = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(value);
  if (!match)
    throw new OpsError("SUPABASE_URL isn't a Supabase project's URL: https:// and twenty letters before .supabase.co");
  return `https://${match[1] ?? ""}.supabase.co`;
}

function headersOf(send: Send): Record<string, string> {
  const headers: Record<string, string> = { ...send.headers };
  const caller = send.caller;
  if (caller) {
    headers["apikey"] = caller.key;
    headers["authorization"] = `Bearer ${caller.kind === "user" ? caller.token : caller.key}`;
  }
  if (send.json !== undefined) headers["content-type"] = "application/json";
  if (send.contentType !== undefined) headers["content-type"] = send.contentType;
  return headers;
}

function logicalOf(status: number, json: unknown): { logical: number; code: string | undefined } {
  if (typeof json !== "object" || json === null) return { logical: status, code: undefined };
  const record = json as Record<string, unknown>;
  const statusCode = record["statusCode"];
  const code = record["code"];
  const logical = typeof statusCode === "string" && /^[0-9]{3}$/.test(statusCode) ? Number(statusCode) : status;
  return { logical, code: typeof code === "string" ? code : undefined };
}

/**
 * One call. A network failure or a timeout, while it asks or while the body comes, is an OpsError
 * that names the path, never a header or a body.
 */
export async function send(fetcher: typeof fetch, base: string, path: string, options: Send = {}): Promise<Reply> {
  let response: Response;
  let bytes: Uint8Array;
  try {
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: headersOf(options),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (options.json !== undefined) init.body = JSON.stringify(options.json);
    // A copy, so the body is an ArrayBuffer of its own whatever view the caller holds.
    else if (options.body !== undefined) init.body = new Uint8Array(options.body).buffer;
    response = await fetcher(`${base}${path}`, init);
    // The signal still runs while the body comes, so a body that stops half-way ends here too.
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new OpsError(`${options.method ?? "GET"} ${path.split("?")[0] ?? path}: no answer from the project`);
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    json = undefined;
  }
  const { logical, code } = logicalOf(response.status, json);
  return { status: response.status, logical, code, json, bytes };
}

/** What a reply is, for a message: never its body. */
export function describe(reply: Reply): string {
  const parts = [`HTTP ${String(reply.status)}`];
  if (reply.logical !== reply.status) parts.push(`status ${String(reply.logical)}`);
  if (reply.code !== undefined && /^[A-Za-z0-9_]{1,40}$/.test(reply.code)) parts.push(reply.code);
  return parts.join(", ");
}
