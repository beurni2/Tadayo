// The privacy matrix's credentials (slice 8; spec 23; T14, T27, T53): the sign-in keys the API trusts, the
// app's own verifier for them, and the callers that real tokens make without a session. Every token is
// signed the way Supabase signs one, with a key whose public half is in the key set the verifier reads
// (`@tadayo/api/testing`), so what the matrix proves is what the real verifier and gate do with a real token,
// not what a stand-in says about it.

import { verifierFor, type Verifier } from "@tadayo/api";
import { testSigner, type TestSigner, type TokenOptions } from "@tadayo/api/testing";
import type { Caller } from "./harness.ts";

/** The project the API trusts, another project with a key of its own, and the verifier for the first. */
export interface Signing {
  signer: TestSigner;
  other: TestSigner;
  verifier: Verifier;
}

export async function signing(): Promise<Signing> {
  const signer = await testSigner();
  // Another Supabase project: twenty lowercase letters before `.supabase.co`, as theirs are.
  const other = await testSigner("https://anotherprojectrefxyz.supabase.co");
  return { signer, other, verifier: verifierFor(signer.keys, { issuer: signer.issuer }) };
}

/** `Bearer` and the token: the header a client sends. */
export const bearer = (token: string) => `Bearer ${token}`;

/** An absolute second, long past and far off: a token's own clock is Supabase's and the library's, never the server's. */
const PAST = 1_700_000_000;
const FUTURE = 4_102_444_800;

/**
 * The callers whose token is signed, carries a subject that is a real account's, and still isn't a session:
 * each way the verifier refuses a token (T53). `subject` is an account that exists, so a verifier that
 * accepted any of these would give its caller that account's session, and the matrix would see an answer
 * other than the gate's one 401.
 */
export async function tokenCallers(keys: Signing, subject: string): Promise<Caller[]> {
  const { signer, other } = keys;
  const as = async (name: string, options: TokenOptions, by: TestSigner = signer): Promise<Caller> => ({
    name,
    authorization: bearer(await by.token(subject, options)),
  });
  return Promise.all([
    as("an expired token", { claims: { iat: PAST - 3600, exp: PAST } }),
    as("a token that isn't valid yet", { claims: { nbf: FUTURE, exp: FUTURE + 3600 } }),
    as("a token with no expiry", { claims: { exp: null } }),
    as("a token signed by another key under this key's id", { key: other.privateKey }),
    as("a token of another project: its own key and id", {}, other),
    as("a token whose key id the set doesn't hold", { kid: "no-such-key" }),
    as("a token with no key id", { kid: null }),
    as("an unsecured token (alg none)", { alg: "none" }),
    as("a token keyed with a legacy shared secret (HS256)", {
      secret: new TextEncoder().encode("a-legacy-secret-the-api-must-never-read-0123456789"),
      claims: { iss: "supabase", role: "anon", sub: null },
    }),
    as("a token of another issuer", { claims: { iss: other.issuer } }),
    as("a token for another audience", { claims: { aud: "anon" } }),
    as("a service role's token", { claims: { role: "service_role" } }),
    as("an anon role's token", { claims: { role: "anon" } }),
    as("an anonymous person's token", { claims: { is_anonymous: true } }),
    as("a token with no subject", { claims: { sub: null } }),
    as("a token whose subject isn't a UUID", { claims: { sub: "someone" } }),
  ]);
}
