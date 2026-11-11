// The sign-in token's verifier (spec 23; T1, T27, T53; docs/plans/B0.md, slice 8): what each kind of
// token and each state of the key set comes to, with no database. Tokens are signed by the test
// signer the gate's tests and the privacy matrix use, so what is proved here is what the real
// verifier does with a real token.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, importJWK, type CryptoKey } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_EMAIL, testSigner, type TestSigner, type TokenOptions } from "../testing.ts";
import { KeysUnavailable, remoteKeys, supabaseProject, verifierFor, type KeySet, type Verifier } from "./token.ts";

const SUB = "6f1c0c9e-39a5-4c7d-b2a5-0f4a7b3b2f11";
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

describe("a token against the keys the verifier holds", () => {
  const cases: {
    name: string;
    options: TokenOptions | ((other: TestSigner) => TokenOptions);
    expected: string | null;
  }[] = [
    { name: "a token as Supabase issues one", options: {}, expected: SUB },
    {
      name: "a subject in capitals, which is the same account",
      options: { claims: { sub: SUB.toUpperCase() } },
      expected: SUB,
    },
    { name: "an expired token, by one second", options: { claims: { exp: nowSeconds() - 1 } }, expected: null },
    { name: "an expired token, long ago", options: { claims: { exp: 1 } }, expected: null },
    { name: "a token not yet valid", options: { claims: { nbf: nowSeconds() + 3600 } }, expected: null },
    { name: "a token with no expiry", options: { claims: { exp: null } }, expected: null },
    { name: "a token whose expiry isn't a number", options: { claims: { exp: "soon" } }, expected: null },
    {
      name: "a token signed by another key under this key's id",
      options: (other) => ({ key: other.privateKey }),
      expected: null,
    },
    {
      name: "a token of another project: its own key and id",
      options: (other) => ({ key: other.privateKey, kid: other.kid }),
      expected: null,
    },
    { name: "a token whose key id the set doesn't hold", options: { kid: "no-such-key" }, expected: null },
    { name: "a token with no key id", options: { kid: null }, expected: null },
    { name: "a token whose key id is empty", options: { kid: "" }, expected: null },
    { name: "an unsecured token (alg none)", options: { alg: "none" }, expected: null },
    {
      name: "a token keyed with the public key as a shared secret (HS256)",
      options: (other) => ({ secret: new TextEncoder().encode(JSON.stringify(other.jwks.keys[0])) }),
      expected: null,
    },
    {
      name: "a token keyed with a legacy shared secret, as the anon and service keys are",
      options: { secret: randomBytes(32), claims: { iss: "supabase", role: "anon", sub: null } },
      expected: null,
    },
    {
      name: "a token of another issuer",
      options: { claims: { iss: "https://otherprojectrefabcde.supabase.co/auth/v1" } },
      expected: null,
    },
    {
      name: "an issuer with a trailing slash",
      options: { claims: { iss: "https://tadayotestprojectref.supabase.co/auth/v1/" } },
      expected: null,
    },
    { name: "a token with no issuer", options: { claims: { iss: null } }, expected: null },
    { name: "a token for another audience", options: { claims: { aud: "anon" } }, expected: null },
    { name: "a token with no audience", options: { claims: { aud: null } }, expected: null },
    {
      name: "a token for an audience that is a list without ours",
      options: { claims: { aud: ["other"] } },
      expected: null,
    },
    { name: "a service role's token", options: { claims: { role: "service_role" } }, expected: null },
    { name: "an anon role's token", options: { claims: { role: "anon" } }, expected: null },
    { name: "a token with no role", options: { claims: { role: null } }, expected: null },
    { name: "an anonymous person's token", options: { claims: { is_anonymous: true } }, expected: null },
    { name: "an is_anonymous that is text", options: { claims: { is_anonymous: "false" } }, expected: null },
    { name: "a token with no subject", options: { claims: { sub: null } }, expected: null },
    { name: "a subject that isn't a UUID", options: { claims: { sub: "someone" } }, expected: null },
    { name: "a subject that is a number", options: { claims: { sub: 12 } }, expected: null },
    {
      name: "a subject that is a UUID with something after it",
      options: { claims: { sub: `${SUB}x` } },
      expected: null,
    },
    {
      name: "a token carrying no email, phone or session",
      options: { claims: { email: null, phone: null, session_id: null } },
      expected: SUB,
    },
  ];

  it.each(cases)("$name", async ({ options, expected }) => {
    const signer = await testSigner();
    const other = await testSigner();
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    const token = await signer.token(SUB, typeof options === "function" ? options(other) : options);
    expect(await verify(token)).toBe(expected);
  });

  it("refuses a token with no key id whether the set holds one key of its algorithm or two, as a rotation leaves it (T53)", async () => {
    const signer = await testSigner();
    const next = await testSigner();
    const sets: KeySet[] = [signer.keys, createLocalJWKSet({ keys: [...signer.jwks.keys, ...next.jwks.keys] })];
    for (const keys of sets) {
      const verify = verifierFor(keys, { issuer: signer.issuer });
      expect(await verify(await signer.token(SUB, { kid: null }))).toBeNull();
      expect(await verify(await signer.token(SUB, { kid: "" }))).toBeNull();
      // The key named, the same token is a session in both sets.
      expect(await verify(await signer.token(SUB))).toBe(SUB);
    }
  });

  it("refuses a token signed with RS256 when the set holds only an ES256 key", async () => {
    const signer = await testSigner();
    const rsa = await generateKeyPair("RS256", { modulusLength: 2048 });
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    expect(await verify(await signer.token(SUB, { alg: "RS256", key: rsa.privateKey }))).toBeNull();
  });

  it("takes RS256 from an RSA key the set holds, as a project on RSA signing keys signs, and no other algorithm of it", async () => {
    const signer = await testSigner();
    const rsa = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
    const kid = "rsa-signing-key";
    const privateJwk = await exportJWK(rsa.privateKey);
    const keys = createLocalJWKSet({
      keys: [...signer.jwks.keys, { ...(await exportJWK(rsa.publicKey)), kid, use: "sig" }],
    });
    const verify = verifierFor(keys, { issuer: signer.issuer });
    // The one RSA key, signing under three algorithms: only the one Supabase signs with is a session.
    const as = async (alg: "RS256" | "RS512" | "PS256") =>
      signer.token(SUB, { alg, kid, key: (await importJWK(privateJwk, alg)) as CryptoKey });
    expect(await verify(await as("RS256"))).toBe(SUB);
    expect(await verify(await as("RS512"))).toBeNull();
    expect(await verify(await as("PS256"))).toBeNull();
  });

  it("refuses what isn't a compact token, or is too long to be one", async () => {
    const signer = await testSigner();
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    const good = await signer.token(SUB);
    const [header = "", payload = "", signature = ""] = good.split(".");
    for (const text of [
      "",
      " ",
      "a",
      "a.b",
      "a.b.c",
      "a.b.c.d",
      "a.b.c.d.e",
      "....",
      `${good} `,
      ` ${good}`,
      `${good}\n`,
      `${header}.${payload}`,
      `${header}.${payload}.`,
      `${header}..${signature}`,
      `Bearer ${good}`,
      `${header}.${payload}.${signature}.`,
      `${header}.${payload}.${signature}x`,
      `${header}.${payload}.${"A".repeat(9000)}`,
      `${"A".repeat(9000)}.${payload}.${signature}`,
      "é.é.é",
      "eyJhbGciOiJFUzI1NiJ9.e30.AAAA",
    ]) {
      expect(await verify(text), JSON.stringify(text.slice(0, 40))).toBeNull();
    }
    // A signature cut short or altered is no signature. The change is to the first character, all of whose
    // bits are the signature's: the last one carries four bits of padding, which the decoder ignores, so
    // changing it can leave the same bytes, and the same signature.
    expect(await verify(`${header}.${payload}.${signature.slice(0, -2)}`)).toBeNull();
    expect(
      await verify(`${header}.${payload}.${signature.replace(/^./, signature.startsWith("A") ? "B" : "A")}`),
    ).toBeNull();
    // And a changed payload under the same signature.
    const forged = Buffer.from(
      JSON.stringify({ iss: signer.issuer, aud: "authenticated", sub: SUB, role: "authenticated", exp: 4_102_444_800 }),
    ).toString("base64url");
    expect(await verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("takes a token as large as Supabase's can grow and refuses one past 8 KB, however good its signature", async () => {
    const signer = await testSigner();
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    // Real tokens are a few hundred bytes, and a profile claim can add more. These two are signed by the
    // key and are good in every other way, so that only their size is wrong.
    const roomy = await signer.token(SUB, { claims: { user_metadata: "x".repeat(4_000) } });
    const huge = await signer.token(SUB, { claims: { user_metadata: "x".repeat(8_000) } });
    expect(roomy.length).toBeLessThan(8_192);
    expect(huge.length).toBeGreaterThan(8_192);
    expect(await verify(roomy)).toBe(SUB);
    expect(await verify(huge)).toBeNull();
  });

  it("answers null, and never throws, for anything of the right shape that isn't a token the keys signed", async () => {
    const signer = await testSigner();
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    const part = (value: unknown): string =>
      Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
    const headers: unknown[] = [
      {},
      [],
      null,
      "x",
      7,
      { alg: "ES256" },
      { alg: "ES256", kid: signer.kid },
      { alg: "ES256", kid: 7 },
      { alg: ["ES256"], kid: signer.kid },
      { alg: "ES256", kid: signer.kid, crit: ["x"] },
      { alg: "ES256", kid: signer.kid, crit: [] },
      { alg: "ES256", kid: signer.kid, b64: false, crit: ["b64"] },
      { alg: "ES256", kid: signer.kid, jwk: signer.jwks.keys[0] },
      { alg: "ES256", kid: signer.kid, jku: "https://evil.example/keys" },
      { alg: "ES256", kid: signer.kid, x5u: "https://evil.example/cert" },
      { alg: "ES256", kid: signer.kid, zip: "DEF" },
      { alg: "ES256", kid: "__proto__" },
      { alg: "ES256", kid: "constructor" },
    ];
    const payloads: unknown[] = [{}, [], null, "x", 7, { sub: SUB }, { exp: 1 }, { __proto__: null, sub: SUB }, "{"];
    for (const h of headers) {
      for (const p of payloads) {
        for (const s of ["", "AAAA", randomBytes(64).toString("base64url")]) {
          const token = `${part(h)}.${part(p)}.${s}`;
          const outcome = await verify(token).then(
            (value) => value,
            (error: unknown) => error,
          );
          expect(outcome, token.slice(0, 60)).toBeNull();
        }
      }
    }
  });

  it("gives the subject and nothing of the token's claims (spec 23, T52)", async () => {
    const signer = await testSigner();
    const verify = verifierFor(signer.keys, { issuer: signer.issuer });
    const answer = await verify(await signer.token(SUB, { claims: { phone: "+15555550123" } }));
    expect(answer).toBe(SUB);
    expect(typeof answer).toBe("string");
    expect(String(answer)).not.toContain(TEST_EMAIL);
    expect(String(answer)).not.toContain("5555550123");
  });
});

/** A server standing for Supabase's key set, which a test steers answer by answer. */
interface Served {
  readonly url: URL;
  hits(): number;
  answer(handler: (response: ServerResponse, request: IncomingMessage) => void): void;
  close(): Promise<void>;
}

const open: Served[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(open.splice(0).map((served) => served.close()));
});

async function serve(first: (response: ServerResponse, request: IncomingMessage) => void): Promise<Served> {
  let handler = first;
  let hits = 0;
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer((request, response) => {
    hits += 1;
    handler(response, request);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const served: Served = {
    url: new URL(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/auth/v1/.well-known/jwks.json`),
    hits: () => hits,
    answer: (next) => {
      handler = next;
    },
    close: () =>
      new Promise<void>((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          done();
        });
      }),
  };
  open.push(served);
  return served;
}

const keysOf =
  (signer: TestSigner) =>
  (response: ServerResponse): void => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(signer.jwks));
  };
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function troubleOf(verify: Verifier, token: string): Promise<string> {
  try {
    const answer = await verify(token);
    return `answered ${String(answer)}`;
  } catch (error) {
    return error instanceof KeysUnavailable ? error.trouble : `threw ${String(error)}`;
  }
}

describe("the key set at Supabase's address", () => {
  it("is fetched once and kept: many tokens, one fetch, even all at once", async () => {
    const signer = await testSigner();
    const server = await serve(keysOf(signer));
    const verify = verifierFor(remoteKeys(server.url), { issuer: signer.issuer });
    const tokens = await Promise.all(Array.from({ length: 20 }, () => signer.token(SUB)));
    expect(await Promise.all(tokens.map((token) => verify(token)))).toEqual(tokens.map(() => SUB));
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    expect(server.hits()).toBe(1);
  });

  it("isn't fetched again for a token whose key id it lacks, inside the cooldown: no stream of such tokens makes one", async () => {
    const signer = await testSigner();
    const server = await serve(keysOf(signer));
    const verify = verifierFor(remoteKeys(server.url), { issuer: signer.issuer });
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    for (let i = 0; i < 25; i += 1)
      expect(await verify(await signer.token(SUB, { kid: `unknown-${String(i)}` }))).toBeNull();
    expect(server.hits()).toBe(1);
  });

  it("finds a rotated key once the cooldown has passed, which is 30 seconds from the last fetch, with the old key still good", async () => {
    const before = await testSigner();
    const after = await testSigner();
    const server = await serve(keysOf(before));
    // The clock is the date alone, moved by the test: a wall-clock window of a few milliseconds fails on a slow machine.
    const start = Date.parse("2026-11-11T05:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const verify = verifierFor(remoteKeys(server.url), { issuer: before.issuer });
    expect(await verify(await before.token(SUB))).toBe(SUB);
    server.answer((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: [...before.jwks.keys, ...after.jwks.keys] }));
    });
    // The new key isn't there yet, and the cooldown hasn't passed: no session, for now, and no fetch.
    vi.setSystemTime(start + 29_000);
    expect(await verify(await after.token(SUB, { claims: { iss: before.issuer } }))).toBeNull();
    expect(server.hits()).toBe(1);
    vi.setSystemTime(start + 31_000);
    expect(await verify(await after.token(SUB, { claims: { iss: before.issuer } }))).toBe(SUB);
    expect(await verify(await before.token(SUB))).toBe(SUB);
    expect(server.hits()).toBe(2);
  });

  it("trusts a fetched key set for ten minutes, asks again after that, and keeps no older copy for when it can't (T53)", async () => {
    const signer = await testSigner();
    const server = await serve(keysOf(signer));
    const start = Date.parse("2026-11-11T05:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    const verify = verifierFor(remoteKeys(server.url), { issuer: signer.issuer });
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    vi.setSystemTime(start + 10 * 60_000 - 1_000);
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    expect(server.hits()).toBe(1);
    // Ten minutes on it is asked again, and when it can't answer there is no old copy to fall back on.
    server.answer((response) => {
      response.writeHead(500);
      response.end();
    });
    vi.setSystemTime(start + 10 * 60_000 + 1_000);
    expect(await troubleOf(verify, await signer.token(SUB))).toBe("unreachable");
    expect(server.hits()).toBe(2);
  });

  it("gives a fetch three seconds and rests five after a failure, when it isn't told otherwise", async () => {
    const signer = await testSigner();
    const server = await serve((response) => {
      response.writeHead(500);
      response.end();
    });
    const timers = vi.spyOn(globalThis, "setTimeout");
    const fetches = vi.spyOn(AbortSignal, "timeout");
    const verify = verifierFor(remoteKeys(server.url), { issuer: signer.issuer });
    expect(await troubleOf(verify, await signer.token(SUB))).toBe("unreachable");
    // The numbers the other tests replace with their own are the ones the API runs with.
    expect(fetches).toHaveBeenCalledWith(3_000);
    expect(timers).toHaveBeenCalledWith(expect.any(Function), 5_000);
  });

  it("is can't tell, never no session, when it can't be read: down, an error, not JSON, not a key set, slow", async () => {
    const signer = await testSigner();
    const token = await signer.token(SUB);
    const down = await serve(keysOf(signer));
    const url = down.url;
    await down.close();
    expect(await troubleOf(verifierFor(remoteKeys(url, { pause: 1 }), { issuer: signer.issuer }), token)).toBe(
      "unreachable",
    );
    const answers: [string, string, (response: ServerResponse) => void][] = [
      [
        "a server error",
        "unreachable",
        (response) => {
          response.writeHead(500);
          response.end("boom");
        },
      ],
      [
        "a redirect",
        "unreachable",
        (response) => {
          response.writeHead(302, { location: "http://127.0.0.1:1/x" });
          response.end();
        },
      ],
      [
        "a page that isn't JSON",
        "unreachable",
        (response) => {
          response.writeHead(200, { "content-type": "text/html" });
          response.end("<html>no</html>");
        },
      ],
      [
        "JSON that isn't a key set",
        "malformed",
        (response) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"hello":"world"}');
        },
      ],
      [
        "a key set whose key is unusable",
        "malformed",
        (response) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ keys: [{ kty: "EC", crv: "P-256", kid: signer.kid, alg: "ES256" }] }));
        },
      ],
      ["a server that never answers", "timeout", () => undefined],
    ];
    for (const [what, trouble, handler] of answers) {
      const server = await serve(handler);
      const verify = verifierFor(remoteKeys(server.url, { timeout: 150, pause: 1 }), { issuer: signer.issuer });
      expect(await troubleOf(verify, token), what).toBe(trouble);
    }
  });

  it("is can't tell when it holds no key at all, a project still on its legacy secret, and a token is no session when it holds keys", async () => {
    const signer = await testSigner();
    const empty = await serve((response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"keys":[]}');
    });
    const verify = verifierFor(remoteKeys(empty.url), { issuer: signer.issuer });
    expect(await troubleOf(verify, await signer.token(SUB))).toBe("empty");
    expect(await troubleOf(verify, await signer.token(SUB, { kid: "other" }))).toBe("empty");
    const full = await serve(keysOf(signer));
    const verifyFull = verifierFor(remoteKeys(full.url), { issuer: signer.issuer });
    expect(await verifyFull(await signer.token(SUB, { kid: "other" }))).toBeNull();
  });

  it("is let alone for a few seconds after a failure, so a down key set isn't asked once for each token", async () => {
    const signer = await testSigner();
    const server = await serve((response) => {
      response.writeHead(500);
      response.end();
    });
    const verify = verifierFor(remoteKeys(server.url, { pause: 150 }), { issuer: signer.issuer });
    const token = await signer.token(SUB);
    expect(await troubleOf(verify, token)).toBe("unreachable");
    expect(server.hits()).toBe(1);
    for (let i = 0; i < 20; i += 1) expect(await troubleOf(verify, token)).toBe("paused");
    expect(server.hits()).toBe(1);
    // It is back when the pause ends, and one good answer ends the trouble.
    await sleep(200);
    server.answer(keysOf(signer));
    expect(await verify(token)).toBe(SUB);
    expect(server.hits()).toBe(2);
    expect(await verify(token)).toBe(SUB);
    expect(server.hits()).toBe(2);
  });

  it("pauses again after the next failure, and not before it", async () => {
    const signer = await testSigner();
    const server = await serve((response) => {
      response.writeHead(503);
      response.end();
    });
    const verify = verifierFor(remoteKeys(server.url, { pause: 80 }), { issuer: signer.issuer });
    const token = await signer.token(SUB);
    expect(await troubleOf(verify, token)).toBe("unreachable");
    await sleep(120);
    expect(await troubleOf(verify, token)).toBe("unreachable");
    expect(server.hits()).toBe(2);
    expect(await troubleOf(verify, token)).toBe("paused");
    expect(server.hits()).toBe(2);
  });

  it("serves a token it holds keys for, whatever its own pause: a fresh key set is used without a fetch", async () => {
    const signer = await testSigner();
    const server = await serve(keysOf(signer));
    const verify = verifierFor(remoteKeys(server.url, { pause: 10_000, cooldown: 1 }), { issuer: signer.issuer });
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    server.answer((response) => {
      response.writeHead(500);
      response.end();
    });
    await sleep(10);
    // An unknown key id now tries a fetch, which fails and pauses; a key the set holds is still good.
    expect(await troubleOf(verify, await signer.token(SUB, { kid: "rotated" }))).toBe("unreachable");
    expect(await verify(await signer.token(SUB))).toBe(SUB);
    expect(await troubleOf(verify, await signer.token(SUB, { kid: "rotated-again" }))).toBe("paused");
  });
});

describe("a project's URL (SUPABASE_URL)", () => {
  it("gives the issuer and the key set's address of a project", () => {
    const project = supabaseProject("https://rhsycmycocbzakrydahi.supabase.co");
    expect(project.origin).toBe("https://rhsycmycocbzakrydahi.supabase.co");
    expect(project.issuer).toBe("https://rhsycmycocbzakrydahi.supabase.co/auth/v1");
    expect(project.keys.href).toBe("https://rhsycmycocbzakrydahi.supabase.co/auth/v1/.well-known/jwks.json");
    expect(supabaseProject("https://rhsycmycocbzakrydahi.supabase.co/").issuer).toBe(project.issuer);
  });

  it("refuses what isn't one, without repeating it", () => {
    const secret = "hunter2-marker";
    for (const value of [
      "",
      "not a url",
      "http://rhsycmycocbzakrydahi.supabase.co",
      "https://rhsycmycocbzakrydahi.supabase.co/auth/v1",
      "https://rhsycmycocbzakrydahi.supabase.co/rest/v1/",
      "https://rhsycmycocbzakrydahi.supabase.co:8443",
      `https://user:${secret}@rhsycmycocbzakrydahi.supabase.co`,
      "https://rhsycmycocbzakrydahi.supabase.co?x=1",
      "https://rhsycmycocbzakrydahi.supabase.co#x",
      "https://supabase.com/dashboard/project/rhsycmycocbzakrydahi",
      "https://RHSYCMYCOCBZAKRYDAHI.supabase.co.evil.example",
      "https://rhsycmycocbzakrydahi.supabase.co.evil.example",
      "https://evil.example/rhsycmycocbzakrydahi.supabase.co",
      "https://xrhsycmycocbzakrydahi.supabase.co",
      "https://rhsycmycocbzakrydah.supabase.co",
      "https://rhsycmycocbzakrydah1.supabase.co",
      "https://sub.rhsycmycocbzakrydahi.supabase.co",
      "https://rhsycmycocbzakrydahi.supabase.in",
      "https://127.0.0.1:54321",
      "http://localhost:54321",
    ]) {
      let message = "";
      try {
        supabaseProject(value);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message, value).toMatch(/^api: SUPABASE_URL isn't a/);
      expect(message, value).not.toContain(secret);
    }
  });
});
