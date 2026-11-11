// Sign-in tokens (spec 23; T1, T27, T52, T53; docs/plans/B0.md, slice 8). Supabase Auth owns sign-in
// and signs a token for each person who has signed in; the API believes only a token it can verify
// against the project's own public keys. Supabase serves them as a key set at
// `<project>/auth/v1/.well-known/jwks.json`, and only for a project on asymmetric signing keys (the
// tadayo-dev project's is ECC P-256, ES256); a project still on the legacy shared secret serves an
// empty set. A shared secret is never taken: no algorithm here is a keyed hash, so a public key can't
// be presented as one, and `none` is no algorithm.
//
// Two outcomes only, and the difference matters to the app, which ends a session on a 401 (FQ89):
// - no session: the token is bad, whatever is wrong with it (its shape, algorithm, key, signature,
//   issuer, audience, role, expiry or subject): `null`;
// - can't tell: the keys can't be read (unreachable, slow, malformed, empty, or paused after a
//   failure): `KeysUnavailable`. Never a 401: a hiccup at Supabase must not sign people out.
// What comes out is the token's subject and nothing else. The claims, the email address among them,
// never leave this module: no email, no phone, no claim is kept, passed on or logged (spec 23, T52).
//
// A token's expiry is Supabase's time, read by the library's own clock and not the server's: T1's clock
// decides drops, and dev's offset must not expire real tokens. No line here reads a clock
// (`one-clock.test.ts`); the pause after a failure is a timer.

import {
  createRemoteJWKSet,
  customFetch,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

/** The keys a verifier reads: jose's resolver, and a view of what it holds, to tell an empty set from an unknown key. */
export type KeySet = JWTVerifyGetKey & { jwks(): JSONWebKeySet | undefined };

/**
 * Why the keys can't say whether a token is good: `unreachable` is no usable answer at all (the network,
 * a status other than 200, a body that isn't JSON); `timeout` an answer too slow; `malformed` a body that
 * isn't a key set, or a key that can't be used; `empty` a key set with no key (a project on its legacy
 * secret); `paused` no fetch tried, for a few seconds after one failed.
 */
export type Trouble = "unreachable" | "timeout" | "malformed" | "empty" | "paused";

/** The keys can't be read, so no token can be judged: can't tell, which is not no session. */
export class KeysUnavailable extends Error {
  readonly trouble: Trouble;
  constructor(trouble: Trouble, options?: ErrorOptions) {
    // The reason alone: what the keys' server said, or the network, never goes into a message.
    super(`sign-in keys unavailable: ${trouble}`, options);
    this.name = "KeysUnavailable";
    this.trouble = trouble;
  }
}

/** A verifier: the token's subject, or null when the token is no session; throws KeysUnavailable when it can't tell. */
export type Verifier = (token: string) => Promise<string | null>;

/** The algorithms Supabase signs with for a project on asymmetric keys. */
const ALGORITHMS = ["ES256", "RS256"];
const AUDIENCE = "authenticated";
/** More than this is no token: Supabase's are a few hundred bytes, and a header can't carry 16 KB. */
const MAX_TOKEN = 8192;
const COMPACT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why the key set can't be read when `error` came from it, or null when it can: a token whose key the
 * set doesn't hold, or holds twice, is about the token.
 */
function troubleOf(error: unknown): Trouble | null {
  if (error instanceof KeysUnavailable) return error.trouble;
  if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) return null;
  if (error instanceof errors.JWKSTimeout) return "timeout";
  // A key in the set that WebCrypto refuses to import is a DOMException, not one of the library's own.
  if (
    error instanceof errors.JWKSInvalid ||
    error instanceof errors.JWKInvalid ||
    error instanceof errors.JOSENotSupported ||
    error instanceof DOMException
  ) {
    return "malformed";
  }
  return "unreachable";
}

/**
 * The verifier of the project that signs with `keys` as `options.issuer`: ES256 or RS256, the key's id
 * named, the issuer exact, the audience `authenticated`, `exp` and `sub` there, the role `authenticated`,
 * a `sub` that is a UUID, and not an anonymous person (the app never signs one in).
 */
export function verifierFor(keys: KeySet, options: { readonly issuer: string }): Verifier {
  // Only what the key set throws is about the keys; any other error of the library is about the token.
  const resolve: JWTVerifyGetKey = async (header, token) => {
    // A token names the key that signed it: Supabase's auth server writes the id of a signing key that has
    // one, and the key sets in its documentation carry one (a legacy-secret token is HS256, which this
    // verifier doesn't take); no real token has been seen yet, and Gate 0's first sign-in is that check.
    // Without a name the library picks the one key of the algorithm the set holds, and refuses when it
    // holds two (a rotation puts two there), so whether such a token is a session would depend on the set
    // and no token is worth that.
    if (typeof header.kid !== "string" || header.kid === "") throw new errors.JWSInvalid("a token with no key id");
    try {
      return await keys(header, token);
    } catch (error) {
      const trouble = troubleOf(error);
      if (error instanceof KeysUnavailable) throw error;
      if (error instanceof errors.JWKSNoMatchingKey && (keys.jwks()?.keys.length ?? 0) === 0) {
        // A set with no key at all is the project's, not the token's: it isn't on asymmetric keys.
        throw new KeysUnavailable("empty", { cause: error });
      }
      if (trouble === null) throw error;
      throw new KeysUnavailable(trouble, { cause: error });
    }
  };
  return async (token) => {
    if (token.length > MAX_TOKEN || !COMPACT.test(token)) return null;
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, resolve, {
        algorithms: ALGORITHMS,
        issuer: options.issuer,
        audience: AUDIENCE,
        requiredClaims: ["exp", "sub"],
      }));
    } catch (error) {
      // The library's own errors are the token's (bad shape, signature, claim or expiry) and KeysUnavailable
      // is not one of them; anything else is a bug, which is an error.
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
    if (payload.role !== AUDIENCE) return null;
    if (payload["is_anonymous"] !== undefined && payload["is_anonymous"] !== false) return null;
    const subject = payload.sub;
    if (typeof subject !== "string" || !UUID.test(subject)) return null;
    return subject.toLowerCase();
  };
}

export interface RemoteKeyOptions {
  /** How long a fetched key set is trusted, ms: Supabase's own edge keeps it 10 minutes, and asks for no longer here. */
  cacheMaxAge?: number;
  /** After a fetch, how long an unknown key id waits before another fetch, ms. */
  cooldown?: number;
  /** How long a fetch may take, ms. */
  timeout?: number;
  /** After a failed fetch, how long no fetch is tried and every token is can't tell, ms. */
  pause?: number;
  /** The fetch, for a test. */
  fetch?: typeof fetch;
}

/**
 * The key set at `url`, fetched when it is missing or older than `cacheMaxAge`, and again for an unknown
 * key id once `cooldown` has passed (a rotated key is found without waiting out the cache). After a
 * failed fetch, whatever the cause, it tries no other for `pause`: a key set that is down, with a stream
 * of tokens arriving, would otherwise be asked once for each (and a caller without a session could set
 * that stream going).
 */
export function remoteKeys(url: URL, options: RemoteKeyOptions = {}): KeySet {
  const pause = options.pause ?? 5_000;
  const send = options.fetch ?? fetch;
  let paused = false;
  const rest = (): void => {
    if (paused) return;
    paused = true;
    // A timer, not a clock: nothing here asks what time it is.
    setTimeout(() => {
      paused = false;
    }, pause).unref();
  };
  const remote = createRemoteJWKSet(url, {
    cacheMaxAge: options.cacheMaxAge ?? 10 * 60_000,
    cooldownDuration: options.cooldown ?? 30_000,
    timeoutDuration: options.timeout ?? 3_000,
    [customFetch]: (resource, init) => {
      if (paused) return Promise.reject(new KeysUnavailable("paused"));
      return send(resource, init);
    },
  });
  const keys: JWTVerifyGetKey = async (header, token) => {
    try {
      return await remote(header, token);
    } catch (error) {
      if (!(error instanceof KeysUnavailable) && troubleOf(error) !== null) rest();
      throw error;
    }
  };
  return Object.assign(keys, { jwks: () => remote.jwks() });
}

export interface SupabaseProject {
  /** `https://<ref>.supabase.co`. */
  readonly origin: string;
  /** The `iss` of its tokens. */
  readonly issuer: string;
  /** Where it serves its public keys. */
  readonly keys: URL;
}

/**
 * A project from its URL, which must be exactly `https://<its 20 lowercase letters>.supabase.co`, with no
 * path, port, credentials, query or fragment: a typo, a dashboard address or a URL with a password in it
 * stops the API instead of being believed. The message never repeats the value.
 */
export function supabaseProject(value: string): SupabaseProject {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("api: SUPABASE_URL isn't a URL");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z]{20}\.supabase\.co$/.test(url.hostname) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("api: SUPABASE_URL isn't a project's URL, https://<its 20 letters>.supabase.co");
  }
  return {
    origin: url.origin,
    issuer: `${url.origin}/auth/v1`,
    keys: new URL(`${url.origin}/auth/v1/.well-known/jwks.json`),
  };
}

/** The verifier of the Supabase project at `url`, reading its keys from Supabase. */
export function supabaseVerifier(url: string): Verifier {
  const project = supabaseProject(url);
  return verifierFor(remoteKeys(project.keys), { issuer: project.issuer });
}
