// The APNs sender against a fake APNs (./apns.ts; docs/plans/api-b2-spike-push.md, sections 2.5 and 2.6): an HTTP/2
// server of the test's own, in clear text, that reads each request as Apple would (its path, headers and provider
// token, checked with the test key's public half) and answers as each test tells it: every answer Apple's
// documentation lists that the sender sorts, a dropped stream, no answer, and no server at all. The key is made here,
// so no secret is in the repository.

import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import {
  constants,
  createServer,
  type Http2Server,
  type IncomingHttpHeaders,
  type ServerHttp2Stream,
} from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  APNS_TOPIC,
  apnsKeyFrom,
  apnsSender,
  PAYLOAD_LIMIT,
  providerToken,
  SERVER_ERROR_WAIT_SECONDS,
  TOKEN_REFRESH_SECONDS,
  type ApnsKey,
  type ApnsPush,
  type ApnsSender,
} from "./apns.ts";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const P8 = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const KEY: ApnsKey = apnsKeyFrom({ APNS_KEY_ID: "KEY1234567", APPLE_TEAM_ID: "TEAM123456", APNS_KEY_P8: P8 });

/** What the fake answers a request with. */
type Answer = { status: number; reason?: string; body?: string } | "drop" | "hang";

interface Seen {
  headers: IncomingHttpHeaders;
  body: string;
  session: unknown;
}

/** A fake APNs: it records each request and answers with the next of `answers`, 200 when there is none. */
class FakeApns {
  readonly seen: Seen[] = [];
  answers: Answer[] = [];
  readonly server: Http2Server;
  constructor() {
    this.server = createServer();
    this.server.on("stream", (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
      let body = "";
      // A stream the fake drops reports it on its own side too.
      stream.on("error", () => undefined);
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => (body += chunk));
      stream.on("end", () => {
        this.seen.push({ headers, body, session: stream.session });
        const answer = this.answers.shift() ?? { status: 200 };
        if (answer === "drop") stream.close(constants.NGHTTP2_INTERNAL_ERROR);
        else if (answer === "hang") return;
        else {
          stream.respond({ ":status": answer.status, "apns-id": "eabeae54-14a8-11e5-b60b-1697f925ec7b" });
          stream.end(
            answer.body ?? (answer.reason === undefined ? undefined : JSON.stringify({ reason: answer.reason })),
          );
        }
      });
    });
  }
  async listen(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${String((this.server.address() as AddressInfo).port)}`;
  }
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}

const production = new FakeApns();
const sandbox = new FakeApns();
let origins: { production: string; sandbox: string };
const senders: ApnsSender[] = [];
let realMs = Date.parse("2026-11-28T09:00:00Z");

beforeAll(async () => {
  origins = { production: await production.listen(), sandbox: await sandbox.listen() };
});
afterEach(() => {
  for (const sender of senders.splice(0)) sender.close();
  production.seen.length = 0;
  production.answers = [];
  sandbox.seen.length = 0;
  sandbox.answers = [];
  realMs = Date.parse("2026-11-28T09:00:00Z");
});
afterAll(async () => {
  for (const server of [production, sandbox]) server.server.unref();
  await Promise.race([Promise.all([production.close(), sandbox.close()]), new Promise((r) => setTimeout(r, 500))]);
});

function sender(timeoutMs?: number): ApnsSender {
  const made = apnsSender(KEY, { origins, realTime: () => realMs, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
  senders.push(made);
  return made;
}

const TOKEN = "a1".repeat(32);
const PAYLOAD = JSON.stringify({
  aps: { alert: { body: "Debby’s day is ready" }, sound: "default", "thread-id": "club_ny" },
  tadayo: { open: "day", club_id: "club_ny", occurrence_id: "occ_sat" },
});
const push = (more: Partial<ApnsPush> = {}): ApnsPush => ({
  token: TOKEN,
  environment: "production",
  payload: PAYLOAD,
  collapseId: "occ_sat",
  expiresAt: Date.parse("2026-11-08T06:00:00Z") / 1000,
  ...more,
});

/** The provider token's two halves, after its signature is checked with `publicKey`. */
function readToken(authorization: unknown, publicKey: KeyObject = pair.publicKey) {
  expect(typeof authorization).toBe("string");
  const match = /^bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(authorization));
  expect(match).not.toBeNull();
  const [, head, claims, signature] = match as unknown as [string, string, string, string];
  const signed = verify(
    "sha256",
    Buffer.from(`${head}.${claims}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url"),
  );
  expect(signed).toBe(true);
  return {
    head: JSON.parse(Buffer.from(head, "base64url").toString()) as unknown,
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()) as unknown,
    whole: String(authorization),
  };
}

describe("a push as Apple asks for it", () => {
  it("posts the payload to the device's path with Apple's headers and a signed provider token, and is sent on 200", async () => {
    expect(await sender().send(push())).toEqual({ kind: "sent" });
    const [request] = production.seen;
    expect(request?.body).toBe(PAYLOAD);
    const headers = request?.headers ?? {};
    expect(headers[":method"]).toBe("POST");
    expect(headers[":path"]).toBe(`/3/device/${TOKEN}`);
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-priority"]).toBe("10");
    expect(headers["apns-topic"]).toBe(APNS_TOPIC);
    expect(APNS_TOPIC).toBe("app.tadayo");
    expect(headers["apns-collapse-id"]).toBe("occ_sat");
    expect(headers["apns-expiration"]).toBe("1794117600");
    expect(headers["content-type"]).toBe("application/json");
    const token = readToken(headers.authorization);
    expect(token.head).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(token.claims).toEqual({ iss: "TEAM123456", iat: Math.floor(realMs / 1000) });
    expect(sandbox.seen).toEqual([]);
  });

  it("sends a sandbox registration to the sandbox host", async () => {
    expect(await sender().send(push({ environment: "sandbox" }))).toEqual({ kind: "sent" });
    expect(sandbox.seen).toHaveLength(1);
    expect(production.seen).toEqual([]);
  });

  it("keeps one connection for many pushes", async () => {
    const s = sender();
    await s.send(push());
    await s.send(push());
    expect(production.seen).toHaveLength(2);
    expect(production.seen[0]?.session).toBe(production.seen[1]?.session);
  });

  it("refuses, without a request, a token that isn't one and a payload past Apple's 4 KB", async () => {
    const s = sender();
    expect(await s.send(push({ token: "../../x" }))).toEqual({
      kind: "refused",
      status: null,
      reason: "token.malformed",
    });
    expect(await s.send(push({ token: TOKEN.toUpperCase() }))).toMatchObject({
      kind: "refused",
      reason: "token.malformed",
    });
    expect(await s.send(push({ payload: "x".repeat(PAYLOAD_LIMIT + 1) }))).toEqual({
      kind: "refused",
      status: null,
      reason: "payload.too_large",
    });
    expect(production.seen).toEqual([]);
  });
});

describe("the provider token (Apple: made again no more often than every 20 minutes, and before an hour)", () => {
  it("keeps one token for 50 minutes, then makes the next with the real time of its making", async () => {
    const s = sender();
    await s.send(push());
    realMs += (TOKEN_REFRESH_SECONDS - 1) * 1000;
    await s.send(push());
    realMs += 1000;
    await s.send(push());
    const tokens = production.seen.map((request) => readToken(request.headers.authorization));
    expect(tokens[1]?.whole).toBe(tokens[0]?.whole);
    expect(tokens[2]?.whole).not.toBe(tokens[1]?.whole);
    expect(tokens[2]?.claims).toEqual({ iss: "TEAM123456", iat: Math.floor(realMs / 1000) });
    expect(TOKEN_REFRESH_SECONDS).toBe(3000);
  });

  it("makes a new one at once after ExpiredProviderToken, and asks for the push again", async () => {
    const s = sender();
    production.answers = [{ status: 403, reason: "ExpiredProviderToken" }];
    expect(await s.send(push())).toEqual({
      kind: "retry",
      status: 403,
      reason: "ExpiredProviderToken",
      waitSeconds: 0,
    });
    realMs += 1000;
    await s.send(push());
    const [first, second] = production.seen.map((request) => readToken(request.headers.authorization));
    expect(second?.whole).not.toBe(first?.whole);
  });

  it("makes a new one when the real time goes back", async () => {
    const s = sender();
    await s.send(push());
    realMs -= 60_000;
    await s.send(push());
    const [first, second] = production.seen.map((request) => readToken(request.headers.authorization));
    expect(second?.whole).not.toBe(first?.whole);
  });

  it("signs exactly what it says, so a token for another key doesn't verify", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const token = providerToken(KEY, 1_794_000_000);
    const [head, claims, signature] = token.split(".") as [string, string, string];
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${claims}`),
        { key: other.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(false);
  });
});

describe("Apple's answers, sorted as its documentation says", () => {
  const cases: [Answer, unknown][] = [
    [
      { status: 410, reason: "Unregistered" },
      { kind: "dead", status: 410, reason: "Unregistered" },
    ],
    [
      { status: 410, reason: "ExpiredToken" },
      { kind: "dead", status: 410, reason: "ExpiredToken" },
    ],
    [
      { status: 400, reason: "BadDeviceToken" },
      { kind: "dead", status: 400, reason: "BadDeviceToken" },
    ],
    [
      { status: 400, reason: "DeviceTokenNotForTopic" },
      { kind: "dead", status: 400, reason: "DeviceTokenNotForTopic" },
    ],
    [
      { status: 400, reason: "BadTopic" },
      { kind: "refused", status: 400, reason: "BadTopic" },
    ],
    [
      { status: 403, reason: "InvalidProviderToken" },
      { kind: "refused", status: 403, reason: "InvalidProviderToken" },
    ],
    [
      { status: 403, reason: "BadEnvironmentKeyIdInToken" },
      { kind: "refused", status: 403, reason: "BadEnvironmentKeyIdInToken" },
    ],
    [
      { status: 403, reason: "Forbidden" },
      { kind: "refused", status: 403, reason: "Forbidden" },
    ],
    [
      { status: 413, reason: "PayloadTooLarge" },
      { kind: "refused", status: 413, reason: "PayloadTooLarge" },
    ],
    [
      { status: 429, reason: "TooManyRequests" },
      { kind: "retry", status: 429, reason: "TooManyRequests", waitSeconds: 0 },
    ],
    [
      { status: 500, reason: "InternalServerError" },
      { kind: "retry", status: 500, reason: "InternalServerError", waitSeconds: SERVER_ERROR_WAIT_SECONDS },
    ],
    [
      { status: 503, reason: "Shutdown" },
      { kind: "retry", status: 503, reason: "Shutdown", waitSeconds: SERVER_ERROR_WAIT_SECONDS },
    ],
    // A reason that isn't a word, or a body that isn't JSON, is recorded as unknown, never quoted.
    [
      { status: 400, reason: "Bad device token: abc" },
      { kind: "refused", status: 400, reason: "unknown" },
    ],
    [
      { status: 400, body: "<html>" },
      { kind: "refused", status: 400, reason: "unknown" },
    ],
  ];

  it("sorts each", async () => {
    const s = sender();
    for (const [answer, outcome] of cases) {
      production.answers = [answer];
      expect(await s.send(push()), JSON.stringify(answer)).toEqual(outcome);
    }
    expect(SERVER_ERROR_WAIT_SECONDS).toBe(900);
  });

  it("asks again after a dropped stream, and after no answer in its time", async () => {
    production.answers = ["drop"];
    expect(await sender().send(push())).toEqual({
      kind: "retry",
      status: null,
      reason: "network.stream",
      waitSeconds: 0,
    });
    production.answers = ["hang"];
    expect(await sender(200).send(push())).toEqual({
      kind: "retry",
      status: null,
      reason: "network.timeout",
      waitSeconds: 0,
    });
  });

  it("asks again when there is no server, and opens a new connection when one is back", async () => {
    const gone = new FakeApns();
    const origin = await gone.listen();
    await gone.close();
    const s = apnsSender(KEY, { origins: { production: origin, sandbox: origin }, realTime: () => realMs });
    senders.push(s);
    expect(await s.send(push())).toMatchObject({ kind: "retry", status: null });
    expect(await s.send(push())).toMatchObject({ kind: "retry", status: null });
  });

  it("opens a new connection after Apple's GOAWAY", async () => {
    const s = sender();
    await s.send(push());
    const first = production.seen[0]?.session as { goaway: (code?: number) => void };
    first.goaway(constants.NGHTTP2_NO_ERROR);
    await new Promise((r) => setTimeout(r, 50));
    expect(await s.send(push())).toEqual({ kind: "sent" });
    expect(production.seen[1]?.session).not.toBe(first);
  });
});

describe("the key, as the worker's start reads it", () => {
  const good = { APNS_KEY_ID: "KEY1234567", APPLE_TEAM_ID: "TEAM123456", APNS_KEY_P8: P8 };

  it("reads a PEM key, whether its line breaks are real or written as \\n", () => {
    expect(apnsKeyFrom(good).key.asymmetricKeyType).toBe("ec");
    expect(apnsKeyFrom({ ...good, APNS_KEY_P8: P8.replaceAll("\n", "\\n") }).keyId).toBe("KEY1234567");
  });

  it("refuses each setting missing or wrong, naming it and never its value", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" });
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    const cases: [Record<string, string | undefined>, string][] = [
      [{ ...good, APNS_KEY_ID: undefined }, "worker_apns_1"],
      [{ ...good, APNS_KEY_ID: "key1234567" }, "worker_apns_1"],
      [{ ...good, APPLE_TEAM_ID: "" }, "worker_apns_2"],
      [{ ...good, APNS_KEY_P8: undefined }, "worker_apns_3"],
      [{ ...good, APNS_KEY_P8: "-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----" }, "worker_apns_4"],
      [{ ...good, APNS_KEY_P8: rsa }, "worker_apns_5"],
      [{ ...good, APNS_KEY_P8: p384 }, "worker_apns_5"],
    ];
    for (const [env, code] of cases) {
      let caught: unknown;
      try {
        apnsKeyFrom(env);
      } catch (error) {
        caught = error;
      }
      expect((caught as { code?: unknown }).code, code).toBe(code);
      const message = (caught as Error).message;
      for (const value of Object.values(env))
        if (value !== undefined && value.length > 4) expect(message).not.toContain(value);
    }
  });
});
