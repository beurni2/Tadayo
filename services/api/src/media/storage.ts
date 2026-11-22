// The API's one Storage client: it signs the upload URL of a pending upload and asks whether that upload's
// bytes are in (TECH-DESIGN sections 5 and 6; ADR-009, ADR-015; T12, T52, T53, T56;
// docs/plans/api-b2-spike-uploads.md, section 1, "Storage"). It holds the service key, which only the API and
// the worker have (Fly secrets), and reaches only the private bucket `uploads`, one object at a time, by the
// key the server made.
//
// What it knows of Storage, read from its source (`supabase/storage`, `src/http/routes/object/`) and from the
// Supabase probe's runs on `dev` after every deploy (tools/ops/src/supabase-probe.ts):
// - `POST /storage/v1/object/upload/sign/<bucket>/<key>` signs a token for one object. Upsert comes from the
//   sign call's `x-upsert` header alone, `'true'` to turn it on, and is carried in the token: the `PUT` reads it
//   from the verified token, never from its own header. This client never sends it, so upsert is off, and once
//   bytes are put nobody can put over them (T12). The answer is `{ url, token }`, `url` relative; the full URL is
//   built here in the form the probe's `PUT` uses.
// - The token says what Storage will do with the `PUT`: its `url` claim names the one object, `<bucket>/<key>`,
//   and its `upsert` claim is the one the `PUT` obeys. So the client believes a token only when its `url` is the
//   object it asked for and its `upsert` is `false`, read where Storage decides it, never assumed from the call it
//   made (T12). The probe reads every token it signs by the same rule (tools/ops/src/supabase-probe.ts).
// - The token's lifetime is Storage's setting, which the caller can't choose. It is read from the token's own
//   `iat` and `exp`, never assumed, and a token whose lifetime can't be read, or isn't a minute to a day, is an
//   error. Only the lifetime is used: the route gives the server clock's sample plus it, in the server's time
//   like every instant the API gives (T1), since `dev`'s clock leads the wall clock Storage reads.
// - `GET /storage/v1/object/info/<bucket>/<key>` answers an object's details, or Storage's not-found. Storage
//   answers every error with HTTP 400 and the real status in the body's `statusCode` (tools/ops/src/supabase.ts),
//   so the client reads that, never the HTTP status alone. An object is there only on a 200 whose body is a JSON
//   object; its not-found is a 404 in the body or in the HTTP status; anything else is an error, never either.
// - A secret key goes in `apikey` and again as the bearer, as `supabase-js` does; no call sets a `User-Agent`.
//
// Nothing it is given or answers is logged: not the key, a token, a URL or an object's key (T52, T56). A failure
// is a `StorageUnavailable` with a fixed message, which the route answers 503 with no body.

/** The bucket of originals, private, with D09's limits (tools/ops/src/storage-setup.ts). */
export const UPLOADS_BUCKET = "uploads";

/** The shortest and longest signed lifetime this client believes: a minute, and a day. */
export const SIGNED_LIFETIME = { least: 60, most: 86_400 } as const;

const TIMEOUT_MS = 10_000;

/**
 * A signed `PUT` for one object: the full URL, and how long Storage keeps it good. The headers to send are the
 * route's, by name (T55).
 */
export interface SignedPut {
  readonly url: string;
  /** Whole seconds from the token's `iat` to its `exp`. */
  readonly lifetimeSeconds: number;
}

/** What the upload routes ask of Storage. */
export interface UploadStorage {
  /** A write-only URL for the one object `objectKey` in `uploads`, with upsert off in its token. */
  signUpload(objectKey: string): Promise<SignedPut>;
  /** Whether the object `objectKey` is in `uploads`. */
  objectThere(objectKey: string): Promise<boolean>;
}

/** Storage couldn't be asked, or answered something this client doesn't believe. Its message names no value. */
export class StorageUnavailable extends Error {
  constructor(what: string) {
    super(`storage: ${what}`);
    this.name = "StorageUnavailable";
  }
}

/** The project's URL, which must be `https://<twenty letters>.supabase.co`, as the sign-in verifier requires. */
function projectBase(value: string): string {
  const match = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(value);
  if (!match) throw new Error("api: SUPABASE_URL isn't a project's URL, https://<its 20 letters>.supabase.co");
  return `https://${match[1] ?? ""}.supabase.co`;
}

/** An object key as the server makes it (packages/domain/src/media/object.ts), or a programming error. */
function checkedKey(objectKey: string): string {
  if (!/^[A-Za-z0-9_-]{32}$/.test(objectKey)) throw new TypeError("storage: an object key is 32 base64url characters");
  return objectKey;
}

/** Storage's own status: the body's `statusCode` when it has one, else the HTTP status. */
function logicalStatus(status: number, json: unknown): number {
  if (typeof json === "object" && json !== null) {
    const code = (json as Record<string, unknown>)["statusCode"];
    if (typeof code === "string" && /^[0-9]{3}$/.test(code)) return Number(code);
    if (typeof code === "number" && Number.isInteger(code)) return code;
  }
  return status;
}

/** A JWT's payload as JSON, or undefined: the token isn't verified here, only read for what Storage put in it. */
function payloadOf(token: string): unknown {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The lifetime in whole seconds of a token Storage signed for the object `objectKey` in `uploads`, from its own
 * `iat` and `exp`, or undefined when the token can't be believed: each of its three parts plain base64url, its
 * `url` that one object, its `upsert` `false`, so a second `PUT` can't put over the first (T12), and its lifetime
 * a minute to a day.
 */
export function signedLifetime(token: string, objectKey: string): number | undefined {
  const payload = payloadOf(token);
  if (typeof payload !== "object" || payload === null) return undefined;
  const { url, upsert, iat, exp } = payload as Record<string, unknown>;
  if (url !== `${UPLOADS_BUCKET}/${objectKey}` || upsert !== false) return undefined;
  if (typeof iat !== "number" || typeof exp !== "number" || !Number.isInteger(iat) || !Number.isInteger(exp)) {
    return undefined;
  }
  const lifetime = exp - iat;
  return lifetime >= SIGNED_LIFETIME.least && lifetime <= SIGNED_LIFETIME.most ? lifetime : undefined;
}

/** The token in a sign call's answer: its `token`, else the `token` of its relative `url`. */
function tokenOf(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const { token, url } = json as Record<string, unknown>;
  if (typeof token === "string" && token !== "") return token;
  if (typeof url !== "string") return undefined;
  const found = new URL(url, "https://storage.invalid").searchParams.get("token");
  return found === null || found === "" ? undefined : found;
}

export interface SupabaseStorageOptions {
  /** The project's URL (`SUPABASE_URL`). */
  readonly projectUrl: string;
  /** The service key (`SUPABASE_SERVICE_KEY`), from Fly secrets (T56). */
  readonly serviceKey: string;
  readonly fetch?: typeof fetch;
}

/** The client against a hosted project. */
export function supabaseStorage(options: SupabaseStorageOptions): UploadStorage {
  const base = projectBase(options.projectUrl);
  const key = options.serviceKey;
  if (typeof key !== "string" || key === "" || /\s/.test(key)) throw new Error("api: SUPABASE_SERVICE_KEY isn't a key");
  const send = options.fetch ?? fetch;
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  async function call(path: string, init: RequestInit, what: string): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await send(`${base}${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StorageUnavailable(`${what} got no answer`);
    }
    let json: unknown;
    try {
      json = JSON.parse(await response.text()) as unknown;
    } catch {
      json = undefined;
    }
    return { status: response.status, json };
  }

  return {
    async signUpload(objectKey) {
      const object = checkedKey(objectKey);
      const { status, json } = await call(
        `/storage/v1/object/upload/sign/${UPLOADS_BUCKET}/${object}`,
        { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}" },
        "signing an upload URL",
      );
      if (status !== 200 || logicalStatus(status, json) !== 200) {
        throw new StorageUnavailable(`signing an upload URL answered ${String(logicalStatus(status, json))}`);
      }
      const token = tokenOf(json);
      const lifetime = token === undefined ? undefined : signedLifetime(token, object);
      if (token === undefined || lifetime === undefined) {
        throw new StorageUnavailable("signing an upload URL gave no token this client believes");
      }
      return {
        url: `${base}/storage/v1/object/upload/sign/${UPLOADS_BUCKET}/${object}?token=${encodeURIComponent(token)}`,
        lifetimeSeconds: lifetime,
      };
    },

    async objectThere(objectKey) {
      const object = checkedKey(objectKey);
      const { status, json } = await call(
        `/storage/v1/object/info/${UPLOADS_BUCKET}/${object}`,
        { method: "GET", headers: auth },
        "asking for an object",
      );
      const logical = logicalStatus(status, json);
      if (status === 200 && logical === 200 && typeof json === "object" && json !== null && !Array.isArray(json)) {
        return true;
      }
      if (logical === 404) return false;
      throw new StorageUnavailable(`asking for an object answered ${String(logical)}`);
    },
  };
}
