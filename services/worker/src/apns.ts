// The APNs sender (docs/plans/api-b2-spike-push.md, section 2.5; spec 21; T37, T52; TECH-DESIGN section 1, "Push":
// APNs directly, token-based, so no third-party push SDK sees names or events). HTTP/2 to Apple with Node's own
// `http2`, one connection per host kept open while pushes go, as Apple asks, and a provider token signed with the
// founder's `.p8` key through `node:crypto`: no dependency.
//
// - The connection checks Apple's certificate whatever NODE_TLS_REJECT_UNAUTHORIZED says (`rejectUnauthorized`), so
//   no setting can hand a token and the provider token to another host. One idle for SESSION_IDLE_MS is closed, so a
//   burst of pushes hours after the last never starts on a connection gone dark; one that gave no answer in time is
//   ended at once, for the same reason.
//
// - The host is the registration's environment's: `api.push.apple.com` for `production`, which every TestFlight
//   build registers, or `api.sandbox.push.apple.com`. The tests give the origins of a fake APNs of their own.
// - The provider token is an ES256 JWT: `kid` the key's id, `iss` the team's, `iat` its making. It is made again every
//   50 minutes, inside Apple's window of 20 to 60, at once after Apple answers `ExpiredProviderToken`, and when the
//   real time goes back more than STEP_BACK_SECONDS (a smaller step would only spend one of Apple's refreshes, which it
//   refuses more often than every 20 minutes). Its `iat` is real time, never the server's clock: dev's clock leads real
//   time, and Apple refuses a token from the future or older than an hour (packages/domain/src/time/one-clock.test.ts
//   keeps the line, with its reason).
// - What Apple answers is sorted as its documentation says ("Handling notification responses from APNs", read
//   2026-11-28): 200 is sent; a token Apple says is dead (`410`, or `400` `BadDeviceToken` or
//   `DeviceTokenNotForTopic`) is `dead`, never retried; a `429`, a `5xx`, a `400` `IdleTimeout`, a lost stream, a lost
//   connection or no whole answer within REQUEST_TIMEOUT_MS of the request, however it trickles, is `retry`; anything
//   else is `refused`, never retried. `retry` after a `5xx` says to wait 15 minutes at least, as Apple asks. A `200` is
//   `sent` as soon as its status comes; of any other answer at most ANSWER_LIMIT characters are kept, the stream is
//   then cancelled, and the status still decides as above (a long `410` is still a dead token), Apple's reason being
//   `unknown` when what was kept isn't whole.
// - A `retry` whose request never left (no connection was ever made) says `network.connection`; one that may have
//   reached Apple says `network.stream` or `network.timeout` (the worker counts that push in the budget, push.ts).
// - A push can be called off with an AbortSignal (`send`'s second argument): the worker's, when the database
//   connection of the transaction that holds the push's delivery is lost (push.ts). A request still waiting for its
//   connection is then never written, and says `network.connection`; one already written is cancelled, and says
//   `network.stream`, since Apple may have it.
//
// Nothing here logs. An outcome holds a status and a code, Apple's reason or one of the sender's own, never a token, a
// payload or a message (T52). The key is read once, at the worker's start (`apnsKeyFrom`), and an error about it
// never quotes it.

import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { connect, constants, sensitiveHeaders, type ClientHttp2Session, type ClientHttp2Stream } from "node:http2";
import { Fault } from "@tadayo/domain/fault";

/** Apple's two hosts, by a registration's environment. */
export const APNS_ORIGINS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;
export type ApnsEnvironment = keyof typeof APNS_ORIGINS;

/** The app's bundle id, which is its push topic (docs/LIMITATIONS.md: app.tadayo). */
export const APNS_TOPIC = "app.tadayo";
/** How old a provider token gets before the next is made, in seconds: inside Apple's 20 to 60 minutes. */
export const TOKEN_REFRESH_SECONDS = 50 * 60;
/** How long a request waits for Apple's whole answer, in milliseconds, from the request. The worker holds the
 * delivery's row across it (push.ts), so it stays under the database role's 15 seconds idle in a transaction (0018)
 * and, with a second to spare, under the API's 5-second wait for a lock (services/api/src/connection.ts
 * TRANSACTION_LIMITS), so a removal of the device that waits for the send isn't answered 503 (PR #159's second
 * review, R2-3). */
export const REQUEST_TIMEOUT_MS = 4_000;
/** How long a connection with no traffic stays open, in milliseconds. */
export const SESSION_IDLE_MS = 10 * 60_000;
/** How far the real time may go back, in seconds, before the provider token is made again. */
export const STEP_BACK_SECONDS = 5 * 60;
/** The most of an answer's body that is kept, in characters (it is read as UTF-8): Apple's is a short JSON object. */
export const ANSWER_LIMIT = 4096;
/** The largest payload Apple takes, in bytes. */
export const PAYLOAD_LIMIT = 4096;
/** The least wait before a `5xx` is tried again, in seconds (Apple: "After 15 minutes"). */
export const SERVER_ERROR_WAIT_SECONDS = 15 * 60;

/** The answers that say a token is dead, whatever else: `410`, or these with a `400`. */
const DEAD_400 = new Set(["BadDeviceToken", "DeviceTokenNotForTopic"]);
/** The `400` that says the connection sat idle too long: the push itself is fine. */
const IDLE_400 = "IdleTimeout";
/** Apple's reasons are words; anything else is recorded as `unknown`. */
const REASON = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
/** A token as 0017 keeps it. */
const TOKEN = /^[0-9a-f]{16,512}$/;
/** Apple's key and team ids: ten capital letters and digits. */
const KEY_ID = /^[A-Z0-9]{10}$/;

/** The real time, in milliseconds: only for a provider token's `iat`, which Apple checks against its own clock. */
const REAL_TIME = (): number => Date.now();

/** The founder's key, as the worker's start reads it. */
export interface ApnsKey {
  readonly keyId: string;
  readonly teamId: string;
  readonly key: KeyObject;
}

/**
 * The key from `APNS_KEY_ID`, `APPLE_TEAM_ID` and `APNS_KEY_P8` (Fly's secrets on `tadayo-api-dev`), or a fault that
 * names what is wrong and never a value.
 */
export function apnsKeyFrom(env: Readonly<Record<string, string | undefined>>): ApnsKey {
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APPLE_TEAM_ID;
  const p8 = env.APNS_KEY_P8;
  if (keyId === undefined || !KEY_ID.test(keyId))
    throw new Fault("worker_apns_1", "worker: APNS_KEY_ID isn't set as Apple gives it, ten letters and digits");
  if (teamId === undefined || !KEY_ID.test(teamId))
    throw new Fault("worker_apns_2", "worker: APPLE_TEAM_ID isn't set as Apple gives it, ten letters and digits");
  if (p8 === undefined || p8 === "") throw new Fault("worker_apns_3", "worker: APNS_KEY_P8 isn't set");
  let key: KeyObject;
  try {
    // A secret set from the file keeps its line breaks; one pasted on a line of its own may have `\n` for them.
    key = createPrivateKey({ key: p8.includes("\\n") ? p8.replaceAll("\\n", "\n") : p8, format: "pem" });
  } catch {
    throw new Fault("worker_apns_4", "worker: APNS_KEY_P8 isn't a private key in PEM");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1")
    throw new Fault("worker_apns_5", "worker: APNS_KEY_P8 isn't an ES256 key, a P-256 curve's, as Apple's are");
  return { keyId, teamId, key };
}

/** One push: where it goes, what it says, and how APNs keeps it. */
export interface ApnsPush {
  readonly token: string;
  readonly environment: ApnsEnvironment;
  /** The payload, as JSON. */
  readonly payload: string;
  /** One notification per day on a device: the day's id. */
  readonly collapseId: string;
  /** When APNs stops trying, in seconds since the epoch: the day's close or the device's next 23:00, whichever comes
   * first (the domain's `decideReveal`). */
  readonly expiresAt: number;
}

/** What became of a push. `status` is Apple's, or null when Apple gave none. */
export type ApnsOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "dead"; readonly status: number; readonly reason: string }
  | { readonly kind: "retry"; readonly status: number | null; readonly reason: string; readonly waitSeconds: number }
  | { readonly kind: "refused"; readonly status: number | null; readonly reason: string };

export interface ApnsSender {
  /** Sends `push`, unless `signal` calls it off first (above). Resolves every failure; never throws. */
  send(push: ApnsPush, signal?: AbortSignal): Promise<ApnsOutcome>;
  /** Closes the connections, letting the process end. */
  close(): void;
}

export interface ApnsOptions {
  /** The two hosts' origins: Apple's unless a test gives a fake's. */
  readonly origins?: Readonly<Record<ApnsEnvironment, string>>;
  /** The real time in milliseconds, for a token's `iat`: a test's own. */
  readonly realTime?: () => number;
  readonly timeoutMs?: number;
  readonly idleMs?: number;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** The provider token for `key` made at `seconds` (the plan's section 2.5). */
export function providerToken(key: ApnsKey, seconds: number): string {
  const head = `${base64url(JSON.stringify({ alg: "ES256", kid: key.keyId }))}.${base64url(
    JSON.stringify({ iss: key.teamId, iat: seconds }),
  )}`;
  return `${head}.${base64url(sign("sha256", Buffer.from(head), { key: key.key, dsaEncoding: "ieee-p1363" }))}`;
}

/** Apple's reason from an answer's body, or `unknown`. */
function reasonOf(body: string): string {
  try {
    const reason = (JSON.parse(body) as { reason?: unknown } | null)?.reason;
    return typeof reason === "string" && REASON.test(reason) ? reason : "unknown";
  } catch {
    return "unknown";
  }
}

/** Sorts Apple's answer (above). `refresh` is called when the provider token must be made again. */
function outcomeOf(status: number, reason: string, refresh: () => void): ApnsOutcome {
  if (status === 200) return { kind: "sent" };
  if (status === 410 || (status === 400 && DEAD_400.has(reason))) return { kind: "dead", status, reason };
  if (status === 403 && reason === "ExpiredProviderToken") {
    refresh();
    return { kind: "retry", status, reason, waitSeconds: 0 };
  }
  if (status === 429 || (status === 400 && reason === IDLE_400))
    return { kind: "retry", status, reason, waitSeconds: 0 };
  if (status >= 500 && status <= 599) return { kind: "retry", status, reason, waitSeconds: SERVER_ERROR_WAIT_SECONDS };
  return { kind: "refused", status, reason };
}

/** An open connection, and whether it ever connected: a push on one that never did never left. */
interface Open {
  readonly session: ClientHttp2Session;
  connected: boolean;
}

/** A sender that sends with `key` (above). */
export function apnsSender(key: ApnsKey, options: ApnsOptions = {}): ApnsSender {
  const origins = options.origins ?? APNS_ORIGINS;
  const realTime = options.realTime ?? REAL_TIME;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const idleMs = options.idleMs ?? SESSION_IDLE_MS;
  const sessions = new Map<ApnsEnvironment, Open>();
  let token: { value: string; madeAt: number } | null = null;

  const currentToken = (): string => {
    const seconds = Math.floor(realTime() / 1000);
    if (
      token === null ||
      seconds - token.madeAt >= TOKEN_REFRESH_SECONDS ||
      seconds < token.madeAt - STEP_BACK_SECONDS
    ) {
      token = { value: providerToken(key, seconds), madeAt: seconds };
    }
    return token.value;
  };
  const refresh = () => {
    token = null;
  };

  const forget = (environment: ApnsEnvironment, open: Open) => {
    if (sessions.get(environment) === open) sessions.delete(environment);
  };
  const sessionFor = (environment: ApnsEnvironment): Open => {
    const known = sessions.get(environment);
    if (known !== undefined && !known.session.closed && !known.session.destroyed) return known;
    // Apple's certificate is checked whatever the environment says (above).
    const session = connect(origins[environment], { rejectUnauthorized: true });
    const open: Open = { session, connected: false };
    session.once("connect", () => {
      open.connected = true;
    });
    // A connection's failure reaches its streams, which report it; the session's own event must not end the process.
    session.on("error", () => undefined);
    // Apple's GOAWAY, or the connection ending: the next push opens a new one.
    session.on("goaway", () => {
      forget(environment, open);
    });
    session.on("close", () => {
      forget(environment, open);
    });
    session.setTimeout(idleMs, () => {
      forget(environment, open);
      session.close();
    });
    sessions.set(environment, open);
    return open;
  };

  return {
    send(push: ApnsPush, signal?: AbortSignal): Promise<ApnsOutcome> {
      if (!TOKEN.test(push.token)) return Promise.resolve({ kind: "refused", status: null, reason: "token.malformed" });
      if (signal?.aborted === true)
        return Promise.resolve({ kind: "retry", status: null, reason: "network.connection", waitSeconds: 0 });
      if (Buffer.byteLength(push.payload) > PAYLOAD_LIMIT)
        return Promise.resolve({ kind: "refused", status: null, reason: "payload.too_large" });
      return new Promise<ApnsOutcome>((resolve) => {
        let settled = false;
        // The request's deadline, set once the request is made; a request that never left has none to clear.
        const deadline: { timer?: NodeJS.Timeout } = {};
        const settle = (outcome: ApnsOutcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline.timer);
          resolve(outcome);
        };
        const lost = (reason: string): ApnsOutcome => ({ kind: "retry", status: null, reason, waitSeconds: 0 });
        let open: Open;
        let request: ClientHttp2Stream;
        try {
          open = sessionFor(push.environment);
          request = open.session.request(
            {
              ":method": "POST",
              ":path": `/3/device/${push.token}`,
              authorization: `bearer ${currentToken()}`,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "apns-topic": APNS_TOPIC,
              "apns-collapse-id": push.collapseId,
              "apns-expiration": String(push.expiresAt),
              "content-type": "application/json",
              // Apple asks that the path and the token stay out of HPACK's table.
              [sensitiveHeaders]: [":path", "authorization"],
            },
            // Called off, the stream is destroyed: never written if it still waits for the connection (above).
            { signal },
          );
        } catch {
          settle(lost("network.connection"));
          return;
        }
        let status: number | null = null;
        let body = "";
        // Apple's answer as it stands: its status and what of its body came, or a lost stream when no status came.
        const answer = () => {
          if (status === null || !Number.isInteger(status))
            settle(lost(open.connected ? "network.stream" : "network.connection"));
          else settle(outcomeOf(status, reasonOf(body), refresh));
        };
        // One deadline from the request, which no trickle of bytes moves. The connection is ended with it: one that
        // gave no answer in time may have gone dark, and the next push opens another.
        deadline.timer = setTimeout(() => {
          settle(lost(open.connected ? "network.timeout" : "network.connection"));
          request.close(constants.NGHTTP2_CANCEL);
          forget(push.environment, open);
          open.session.destroy();
        }, timeoutMs);
        request.setEncoding("utf8");
        request.on("response", (headers) => {
          const value = headers[":status"];
          status = typeof value === "number" ? value : Number(value);
          if (status === 200) settle({ kind: "sent" });
        });
        request.on("data", (chunk: string) => {
          body += chunk.slice(0, ANSWER_LIMIT - body.length);
          if (body.length >= ANSWER_LIMIT) {
            answer();
            request.close(constants.NGHTTP2_CANCEL);
          }
        });
        request.on("end", answer);
        request.on("error", answer);
        request.on("close", answer);
        request.end(push.payload);
      });
    },
    close() {
      for (const open of sessions.values()) open.session.close();
      sessions.clear();
    },
  };
}
