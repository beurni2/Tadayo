/// <reference lib="esnext.temporal" />
// The devices' rows of the privacy matrix (spike S4's server part: `registerDevice` and `removeDevice`, the
// contract's DeviceRegistration; spec 21, 23; T1, T14, T27, T52, T55; TECH-DESIGN section 6, device registration
// (a) to (e); docs/plans/api-b2-spike-push.md, section 1): what each role must get, and what each request must
// change, judged from the world's rows and the time alone, apart from the statements the routes run.
//
// - registerDevice, past the gate (the gate's 401 and 403 are account.ts's): the neutral NOT_FOUND, changing
//   nothing, for a secret whose sign-in has ended (removed, or its token moved to a later sign-in) and for a
//   secret whose registration is another account's. Otherwise 200 with the registration as stored: the
//   environment, the zone the server resolves, and the instant in whole seconds, never the token or the secret
//   (T55). It leaves one registration of that sign-in, the viewer's, with the token in lowercase and the instant;
//   a token another sign-in held moves, and that sign-in has no registration and has ended at the instant; no
//   other row changes (`registeredProblems`).
// - removeDevice, public, to every caller: 204, with nothing in it, when the sign-in had a registration, and the
//   neutral NOT_FOUND when it had none; either way the sign-in has no registration and has ended (at the instant,
//   unless it had already), and no other row changes (`removedProblems`).
//
// A sign-in is the SHA-256 of its secret, which this file works out itself. The leak scanner reads the same
// answers; it can't judge a row, so this file does.

import { createHash } from "node:crypto";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import { sameAnswer } from "./roster.ts";
import { transportProblem, type Answer } from "./scanner.ts";
import type { WorldTx } from "../db/harness.ts";

/** The operations whose rows this file judges. */
export const DEVICE_JUDGED: ReadonlySet<string> = new Set(["registerDevice", "removeDevice"]);

/** registerDevice's ordinary request (specsFor: no body): the contract refuses it. */
export const DEVICE_NO_BODY: Answer = pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}');

/** The sign-in a removal secret names: its SHA-256, in hex. */
export function signInOf(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** One registration, as the test reads it with its own statement. */
export interface DeviceRow {
  user: string;
  token: string;
  environment: string;
  timezone: string;
  registeredAt: string;
}

/** The registrations and ended sign-ins a table can touch, by sign-in. */
export interface DeviceRows {
  registrations: ReadonlyMap<string, DeviceRow>;
  /** Each ended sign-in and when it ended. */
  ended: ReadonlyMap<string, string>;
}

/**
 * The rows of `signIns`, of `tokens` and of `users`' accounts: everything a request of the table can change, and
 * the rows beside it that it must not.
 */
export async function deviceRowsOf(
  sql: WorldTx,
  signIns: readonly string[],
  tokens: readonly string[],
  users: readonly string[],
): Promise<DeviceRows> {
  const registered = await sql<
    { sign_in: string; user_id: string; apns_token: string; apns_environment: string; timezone: string; at: string }[]
  >`
    SELECT pg_catalog.encode(sign_in, 'hex') AS sign_in, user_id, apns_token, apns_environment, timezone,
           pg_catalog.to_char(registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
      FROM app.device_registrations
     WHERE pg_catalog.encode(sign_in, 'hex') = ANY(${signIns as string[]}::text[])
        OR apns_token = ANY(${tokens.map((token) => token.toLowerCase())}::text[])
        OR user_id = ANY(${users as string[]}::text[])`;
  const ended = await sql<{ sign_in: string; at: string }[]>`
    SELECT pg_catalog.encode(sign_in, 'hex') AS sign_in,
           pg_catalog.to_char(ended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
      FROM app.device_sign_ins_ended WHERE pg_catalog.encode(sign_in, 'hex') = ANY(${signIns as string[]}::text[])`;
  return {
    registrations: new Map(
      registered.map((row) => [
        row.sign_in,
        {
          user: row.user_id,
          token: row.apns_token,
          environment: row.apns_environment,
          timezone: row.timezone,
          registeredAt: row.at,
        },
      ]),
    ),
    ended: new Map(ended.map((row) => [row.sign_in, row.at])),
  };
}

/** A registration the table sends, and the zone's one spelling the server keeps. */
export interface DeviceRequest {
  secret: string;
  token: string;
  environment: "sandbox" | "production";
  timezone: string;
  canonical: string;
}

export type RegisterOutcome =
  { kind: "registered"; signIn: string; moved: string | null; request: DeviceRequest } | { kind: "refused" };

/** What the world's rows give `viewer` registering `request`. */
export function registerOutcome(rows: DeviceRows, viewer: string, request: DeviceRequest): RegisterOutcome {
  const signIn = signInOf(request.secret);
  if (rows.ended.has(signIn)) return { kind: "refused" };
  const own = rows.registrations.get(signIn);
  if (own !== undefined && own.user !== viewer) return { kind: "refused" };
  const token = request.token.toLowerCase();
  const holder = [...rows.registrations].find(([, row]) => row.token === token)?.[0] ?? null;
  return { kind: "registered", signIn, moved: holder !== null && holder !== signIn ? holder : null, request };
}

const seconds = (now: Temporal.Instant) => now.toString({ smallestUnit: "second", roundingMode: "floor" });
const micros = (now: Temporal.Instant) => now.toString({ smallestUnit: "microsecond", roundingMode: "floor" });

/** registerDevice's answer: the registration as stored, or the neutral not-found. */
export function registerExpected(outcome: RegisterOutcome, now: Temporal.Instant): Expected {
  if (outcome.kind === "refused") return NEUTRAL;
  return sameAnswer("the registration", 200, {
    apns_environment: outcome.request.environment,
    timezone: outcome.request.canonical,
    registered_at: seconds(now),
  });
}

/** Every row of `before` but `except`, held to `after`: none of them may change. */
function othersProblems(before: DeviceRows, after: DeviceRows, except: ReadonlySet<string>, what: string): string[] {
  const problems: string[] = [];
  for (const [signIn, row] of before.registrations) {
    if (except.has(signIn)) continue;
    if (JSON.stringify(after.registrations.get(signIn)) !== JSON.stringify(row))
      problems.push(`${what} changed another sign-in's registration`);
  }
  for (const signIn of after.registrations.keys()) {
    if (!except.has(signIn) && !before.registrations.has(signIn))
      problems.push(`${what} made a registration of another sign-in`);
  }
  for (const [signIn, at] of before.ended) {
    if (!except.has(signIn) && after.ended.get(signIn) !== at) problems.push(`${what} changed another ended sign-in`);
  }
  for (const signIn of after.ended.keys()) {
    if (!except.has(signIn) && !before.ended.has(signIn)) problems.push(`${what} ended another sign-in`);
  }
  return problems;
}

/** What a registration must have changed, from the rows before it and after it. */
export function registeredProblems(
  before: DeviceRows,
  after: DeviceRows,
  viewer: string,
  outcome: RegisterOutcome,
  now: Temporal.Instant,
): string[] {
  if (outcome.kind === "refused") return othersProblems(before, after, new Set(), "a refused registration");
  const { signIn, moved, request } = outcome;
  const problems: string[] = [];
  const want: DeviceRow = {
    user: viewer,
    token: request.token.toLowerCase(),
    environment: request.environment,
    timezone: request.canonical,
    registeredAt: micros(now),
  };
  const got = after.registrations.get(signIn);
  if (JSON.stringify(got) !== JSON.stringify(want))
    problems.push(
      `the registration is ${got === undefined ? "missing" : JSON.stringify(got).slice(0, 300)}, not as sent at the instant`,
    );
  if (after.ended.has(signIn)) problems.push("the registered sign-in has ended");
  if (moved !== null) {
    if (after.registrations.has(moved)) problems.push("the token's earlier sign-in kept its registration ((a))");
    const ended = before.ended.get(moved) ?? micros(now);
    if (after.ended.get(moved) !== ended) problems.push("the token's earlier sign-in didn't end at the instant ((e))");
  }
  return [
    ...problems,
    ...othersProblems(before, after, new Set([signIn, ...(moved === null ? [] : [moved])]), "a registration"),
  ];
}

export type RemoveOutcome = "removed" | "none";

/** What the world's rows give a removal with `secret`, whoever sends it. */
export function removeOutcome(rows: DeviceRows, secret: string): RemoveOutcome {
  return rows.registrations.has(signInOf(secret)) ? "removed" : "none";
}

/**
 * The 204 the app sends: no body, nothing for a cache, no type or length, and Node's Date and Connection, in that
 * order, the Date the answer's own time.
 */
export function noContentProblems(answer: Answer): string[] {
  const problems: string[] = [];
  if (answer.status !== 204) problems.push(`status ${String(answer.status)}, not 204`);
  if (answer.reason !== "No Content") problems.push(`reason ${JSON.stringify(answer.reason)}`);
  if (answer.body !== "") problems.push(`a body: ${JSON.stringify(answer.body.slice(0, 200))}`);
  const names = Object.keys(answer.headers);
  if (names.join(", ") !== "cache-control, date, connection") problems.push(`the headers ${names.join(", ")}`);
  if (answer.headers["cache-control"] !== "private, no-store")
    problems.push(`cache-control: ${String(answer.headers["cache-control"])}`);
  if (answer.headers["connection"] !== "keep-alive")
    problems.push(`connection: ${String(answer.headers["connection"])}`);
  const date = answer.headers["date"];
  const late = date === undefined ? undefined : transportProblem("date", date, answer.clock);
  if (late !== undefined) problems.push(`date: ${late}`);
  return problems;
}

/** removeDevice's answer: 204 when it removed a registration, else the neutral not-found. */
export function removeExpected(outcome: RemoveOutcome): Expected {
  return outcome === "removed" ? noContentProblems : NEUTRAL;
}

/** What a removal must have changed, from the rows before it and after it. */
export function removedProblems(
  before: DeviceRows,
  after: DeviceRows,
  secret: string,
  now: Temporal.Instant,
): string[] {
  const signIn = signInOf(secret);
  const problems: string[] = [];
  if (after.registrations.has(signIn)) problems.push("the removed sign-in kept its registration");
  const ended = before.ended.get(signIn) ?? micros(now);
  if (after.ended.get(signIn) !== ended) problems.push("the removed sign-in didn't end at the instant, or ended again");
  return [...problems, ...othersProblems(before, after, new Set([signIn]), "a removal")];
}
