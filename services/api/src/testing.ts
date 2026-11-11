// A signer for tests (T53): the verifier's own tests, the gate's and the privacy matrix's all sign a
// sign-in token the way Supabase does, with an ES256 key whose public half is in a key set, so what
// they prove is what the real verifier does with a real token. Outside the package's main entry
// (`@tadayo/api/testing`), as the domain's own testing module is, so no product code imports it.
//
// It reads no clock: a token's lifetime is left to the library (`1h` from its own time), and an
// expiry or a not-before a test wants is an absolute second, so the clock that decides a token's
// life stays Supabase's and jose's, never the server's (T1; `one-clock.test.ts`).

import { randomUUID } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWK,
  type JWTHeaderParameters,
} from "jose";
import type { KeySet } from "./identity/token.ts";

/** A project's URL, as Supabase's: 20 lowercase letters before `.supabase.co`. */
export const TEST_PROJECT_URL = "https://tadayotestprojectref.supabase.co";

/** The address every test token carries, so a test can look for it where it must never appear (T52). */
export const TEST_EMAIL = "signed-in.person@example.invalid";

export interface TokenOptions {
  /** The header's algorithm: ES256 by default, HS256 with a `secret`; an RSA algorithm wants an RSA `key` made for it, `none` writes an unsecured token. */
  alg?: "ES256" | "RS256" | "RS512" | "PS256" | "none";
  /** The header's key id: this signer's by default, none at all for `null`. */
  kid?: string | null;
  /** Sign with this key instead of the signer's. */
  key?: CryptoKey;
  /** Sign with a shared secret instead (HS256), as a project on the legacy secret would. */
  secret?: Uint8Array;
  /** Replaces a claim, or leaves it out when `null`: `iss`, `aud`, `sub`, `exp`, `nbf`, `iat`, `role`, others added. */
  claims?: Readonly<Record<string, unknown>>;
}

export interface TestSigner {
  readonly issuer: string;
  /** The key id of the key that signs, as the key set lists it. */
  readonly kid: string;
  /** The key set's document, as `/auth/v1/.well-known/jwks.json` serves it. */
  readonly jwks: JSONWebKeySet;
  /** The key set, as the verifier reads it. */
  readonly keys: KeySet;
  /** A token for the account `subject`, as Supabase issues one, with `options` applied. */
  token(subject: string, options?: TokenOptions): Promise<string>;
  /** The private key, for a test that signs a token of another shape. */
  readonly privateKey: CryptoKey;
}

function unsecured(payload: Readonly<Record<string, unknown>>): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(payload)}.`;
}

/** A signer of its own key and key set: two of them are two projects. */
export async function testSigner(project: string = TEST_PROJECT_URL): Promise<TestSigner> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = randomUUID();
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig", key_ops: ["verify"] };
  const jwks: JSONWebKeySet = { keys: [jwk] };
  const issuer = `${project}/auth/v1`;
  return {
    issuer,
    kid,
    jwks,
    keys: createLocalJWKSet(jwks),
    privateKey,
    async token(subject, options = {}) {
      const merged: Record<string, unknown> = {
        iss: issuer,
        aud: "authenticated",
        sub: subject,
        role: "authenticated",
        email: TEST_EMAIL,
        phone: "",
        is_anonymous: false,
        session_id: randomUUID(),
        ...options.claims,
      };
      const claims = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null));
      if (options.alg === "none") return unsecured({ exp: 4_102_444_800, ...claims });
      const header: JWTHeaderParameters = {
        alg: options.alg ?? (options.secret === undefined ? "ES256" : "HS256"),
        typ: "JWT",
      };
      if (options.kid !== null) header.kid = options.kid ?? kid;
      const jwt = new SignJWT(claims).setProtectedHeader(header);
      // The library's own clock gives a token its lifetime, unless a test names an absolute second.
      if (options.claims?.iat === undefined) jwt.setIssuedAt();
      if (options.claims?.exp === undefined) jwt.setExpirationTime("1h");
      return jwt.sign(options.secret ?? options.key ?? privateKey);
    },
  };
}
