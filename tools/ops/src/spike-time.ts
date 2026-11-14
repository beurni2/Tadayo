/// <reference lib="esnext.temporal" />
// `spike-time`: spike S5's live half (docs/plans/api-b0-spike-time.md, section 6; docs/plans/B0.md,
// section 4; T1, T5; spec 06, 08; Q18). On `dev`, with the worker Machine stopped, it shows that what
// Home's day choice answers switches at 07:00 and at 01:00 exactly, by the server's clock alone: a
// club of two synthetic members, its first day the next weekday's 7 AM in New York by `dev`'s clock
// (a few minutes ahead when the run starts at about 6:50 there: docs/plans/api-b0-spike-time.md, section
// 8), the dev clock
// moved to 20 seconds before that day's reveal and then to 20 seconds before its close, and
// `GET /v1/clubs` read as a member four times a second around each instant. Every answer must be the
// club's days as T5 has them at the answer's own `server_now`.
//
// It runs on the API's Machine (run.ts, as `supabase-probe` does), where the service key is, and acts
// on `tadayo-dev` alone: the runner gives it dev's reference, and the Supabase URL and the database
// must be that project's (run.ts). What it makes:
//   - a Supabase user, `spike-<run>@probe.invalid`, which nothing can deliver to, signed in with a code
//     from the admin API, so no email is sent; the API makes its account, named Ana, the product's way;
//   - Ben, an account with a random subject nobody can sign in as, and the club `S5 <run's first 8>`
//     in America/New_York, written as `tadayo_app` in one transaction through the rows the API's
//     commands will write (`writeClub`, which tests/src/db/ops-spike-time.test.ts runs on Postgres);
//   - up to two moves of the dev clock, forward only (dev-clock.ts): the close's only after a reveal
//     window that had answers. They never come back.
// At the end it deletes the Supabase user; when it can't, or when the call that makes the user had no
// clear answer and may have made one, a failed check names the address to delete it by. The club, its
// two accounts and its days stay, since the schema deletes none of them, and they're synthetic
// (ADR-021); Ana's account keeps a subject whose user is gone, so nobody can sign in as it. Nothing
// reads or touches any other account.
//
// Its time is limited, since the runner may give up on the Machine's command 300 seconds after it
// starts (on-machine.ts, `COMMAND_SECONDS`): no new work starts after the budget, the clean-up stops
// at the deadline, a minute before that, and each call has its own limit. A database call still under
// way at the run's limit is left to end on its own (`untilAborted`): the run goes on to its clean-up,
// and says the club or the move may still commit. Every limit is an `AbortSignal`'s, which reads no
// clock: every instant it writes or compares comes from the server's clock, through `Clock.sample` in
// the database or `server_now` in the API's answers (T1).
//
// What it prints carries no token, code or key, and no address but the run's own synthetic one when
// its user may be left: Auth's replies by their status and code (supabase.ts' `describe`), the API's
// by their status, their `server_now`, whether their Cache-Control is missing or not the contract's
// (never its value), where an answer differs from T5's (the keys' path only), and which of the run's
// own two days it showed, named from what the run wrote, never from the answer (`shown`). What it can't see is whether the worker Machine is stopped, which only `flyctl` sees: the
// run's order does that (`worker-scale --to stopped` first).

import { randomBytes, randomUUID } from "node:crypto";
import { contractInstant, dayInstants, newId, type Clock } from "@tadayo/domain";
import type postgres from "postgres";
import { devClock } from "./dev-clock.ts";
import { DEV_HOST } from "./environment.ts";
import { OpsError } from "./ops-error.ts";
import { describe, projectUrl, send, type Caller, type Reply, type Send } from "./supabase.ts";
import type { Check } from "./supabase-probe.ts";

/** The run's limits, in milliseconds; a test gives shorter ones. */
export interface SpikeLimits {
  /** After this, from the start of the Machine's half, no new work starts; the clean-up goes on. */
  readonly budgetMs: number;
  /** The clean-up stops too: a minute before the runner may give up (on-machine.ts, `COMMAND_SECONDS`). */
  readonly deadlineMs: number;
  /** The longest each instant is watched. */
  readonly windowMs: number;
  /** The longest one call to the API waits. */
  readonly callMs: number;
}

/** Sign-in, the club, two moves and two windows of at most a minute each fit the budget. */
export const SPIKE_LIMITS: SpikeLimits = { budgetMs: 180_000, deadlineMs: 240_000, windowMs: 60_000, callMs: 15_000 };

/** The club's zone: an ordinary week, whose 07:00 and 01:00 are whole seconds. */
export const ZONE = "America/New_York";
/** How long before each instant the dev clock is put, in seconds. */
export const LEAD_SECONDS = 20;
/** The time between two reads of the club list, in milliseconds: four a second. */
export const POLL_MS = 250;
/** How many answers at or after an instant end its window. */
export const ANSWERS_AFTER = 5;
/** The first day's 07:00 is at least this many minutes ahead of the clock when the club is written. */
export const AHEAD_MINUTES = 3;

/** The dev API, as a phone reaches it. */
export const API = `https://${DEV_HOST}`;

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** One of the run's two days, as the club list's `Occurrence` should give it. */
export interface SpikeDay {
  readonly id: string;
  readonly star: { readonly membershipId: string; readonly displayName: string };
  readonly localDate: Temporal.PlainDate;
  readonly revealAt: Temporal.Instant;
  readonly closeAt: Temporal.Instant;
}

/** The run's club, as `writeClub` wrote it. */
export interface SpikeClub {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  /** The reader's (Ana's) interval. */
  readonly membershipId: string;
  /** Ana's day, the first, and Ben's, the next date. */
  readonly first: SpikeDay;
  readonly second: SpikeDay;
}

/** The account the API made for the run's user: its id, and the Supabase user it's the account of. */
export interface SpikeAccount {
  readonly id: string;
  readonly subject: string;
}

/**
 * The first day's date: the earliest Monday to Friday in New York whose 07:00 is at least
 * `AHEAD_MINUTES` after `now`, so the next date, Ben's, is Tuesday to Saturday, never Sunday.
 */
export function firstDate(now: Temporal.Instant): Temporal.PlainDate {
  const earliest = now.add({ minutes: AHEAD_MINUTES });
  let date = now.toZonedDateTimeISO(ZONE).toPlainDate();
  for (let day = 0; day < 8; day += 1) {
    if (date.dayOfWeek <= 5 && Temporal.Instant.compare(dayInstants(date, ZONE).revealAt, earliest) >= 0) return date;
    date = date.add({ days: 1 });
  }
  throw new OpsError("spike-time: no weekday in the next week opens after the clock, which can't be");
}

/** The first date on or after `from` that falls on the weekday `WEEKDAYS[index]`. */
function firstOn(from: Temporal.PlainDate, index: number): Temporal.PlainDate {
  let date = from;
  while (date.dayOfWeek - 1 !== index) date = date.add({ days: 1 });
  return date;
}

function wholeSeconds(instant: Temporal.Instant): boolean {
  return instant.epochNanoseconds % 1_000_000_000n === 0n;
}

export interface ClubInput {
  /** The run's id, whose first eight characters name the club. */
  readonly run: string;
  readonly account: SpikeAccount;
  /** The server's clock: `prepareClock("dev", tx)` on the Machine, a fake one in a test. */
  readonly clock: Clock;
}

/**
 * The limits each of the run's transactions sets before anything else, so that no statement in it
 * waits on the server without end. run.ts sets them again before it checks dev's clock in the club's
 * transaction, and `writeClub` and `moveClock` set them themselves.
 */
export async function limitTransaction(tx: postgres.TransactionSql): Promise<void> {
  await tx`SET LOCAL statement_timeout = '20s'`;
  await tx`SET LOCAL lock_timeout = '10s'`;
}

/**
 * Writes the run's club in `tx`, the caller's transaction, as `tadayo_app`: Ben; the club, Ana its
 * creator; Ben joining by an exact roster that Ana approves (T7), as tests/src/db/world.ts'
 * `joinByRoster` does; its activation; a week from the first date with a pair's four days (spec 05,
 * T6); and the two days the run watches, with their instants from the time module (ADR-008) and
 * collecting from the clock's sample. Every instant is bound as text and cast in SQL, since
 * postgres.js would cut one bound as a timestamp to milliseconds. Throws, writing nothing that
 * commits, if the account isn't the run's own, finished as the API finishes it.
 */
export async function writeClub(tx: postgres.TransactionSql, input: ClubInput): Promise<SpikeClub> {
  await limitTransaction(tx);
  const { run, account } = input;
  const [own] = await tx<{ own: boolean }[]>`
    SELECT EXISTS (SELECT FROM app.users
                    WHERE id = ${account.id} AND auth_subject = ${account.subject}::pg_catalog.uuid
                      AND state = 'active' AND display_name = 'Ana' AND age_confirmed_at IS NOT NULL) AS own`;
  if (own?.own !== true) {
    throw new OpsError(
      "spike-time: the account isn't the run's own, named Ana with its age confirmed, so nothing is written",
    );
  }
  const now = await input.clock.sample(tx);
  const at = now.toString();
  const date = firstDate(now);
  const next = date.add({ days: 1 });
  const firstDay = dayInstants(date, ZONE);
  const nextDay = dayInstants(next, ZONE);
  for (const instant of [firstDay.revealAt, firstDay.closeAt, nextDay.revealAt, nextDay.closeAt]) {
    if (!wholeSeconds(instant)) throw new OpsError(`spike-time: ${instant.toString()} isn't a whole second`);
  }

  const ben = newId("acct");
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${ben}, ${randomUUID()}::pg_catalog.uuid, ${at}::pg_catalog.text::pg_catalog.timestamptz, 'Ben',
            ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  const club = newId("club");
  const name = `S5 ${run.slice(0, 8)}`;
  const ana = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, ${name}, ${ZONE}, ${ana}, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${ana}, ${club}, ${account.id}, 'creator', ${at}::pg_catalog.text::pg_catalog.timestamptz)`;

  // Ben joins by one exact roster: Ana proposes it, Ben accepts it with Ben's own link, Ana approves it
  // (implicitly, as its proposer), and it's applied (T7).
  const revision = newId("rev");
  const candidate = newId("cand");
  const invitation = newId("inv");
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revision}, ${club}, 'proposal', ${ana}, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id) VALUES (${revision}, ${club}, ${ana})`;
  await tx`
    INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
    VALUES (${candidate}, ${club}, ${ana}, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
    VALUES (${revision}, ${club}, ${candidate}, 'Ben', 1)`;
  await tx`
    UPDATE app.roster_revisions SET roster_sealed_at = ${at}::pg_catalog.text::pg_catalog.timestamptz
     WHERE id = ${revision}`;
  await tx`
    INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
    VALUES (${invitation}, ${candidate}, ${randomBytes(32)}, ${at}::pg_catalog.text::pg_catalog.timestamptz,
            ${now.add({ hours: 168 }).toString()}::pg_catalog.text::pg_catalog.timestamptz, ${ben},
            ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    UPDATE app.roster_revision_candidates
       SET accepted_at = ${at}::pg_catalog.text::pg_catalog.timestamptz, accepted_invitation_id = ${invitation}
     WHERE revision_id = ${revision} AND candidate_id = ${candidate}`;
  await tx`
    INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
    VALUES (${revision}, ${ana}, 'approved', true, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    UPDATE app.roster_revisions
       SET state = 'applied', version = 2, ended_at = ${at}::pg_catalog.text::pg_catalog.timestamptz
     WHERE id = ${revision}`;
  const benInterval = newId("mem");
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_via_revision_id, joined_via_candidate_id, joined_at)
    VALUES (${benInterval}, ${club}, ${ben}, 'roster', ${revision}, ${candidate}, ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  await tx`
    UPDATE app.candidates SET state = 'joined', ended_at = ${at}::pg_catalog.text::pg_catalog.timestamptz
     WHERE id = ${candidate}`;
  await tx`UPDATE app.clubs SET activated_at = ${at}::pg_catalog.text::pg_catalog.timestamptz WHERE id = ${club}`;

  // A pair's four days (spec 05, T6): Ana the first date's weekday and two on, Ben the next date's
  // and two on, counted round Monday to Saturday, so never Sunday; each from its first date on or
  // after the week's start.
  const version = newId("sched");
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${club}, ${date.toString()}::pg_catalog.text::pg_catalog.date,
            ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  const day = date.dayOfWeek - 1;
  for (const [offset, interval] of [
    [0, ana],
    [1, benInterval],
    [2, ana],
    [3, benInterval],
  ] as const) {
    const index = (day + offset) % WEEKDAYS.length;
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      VALUES (${version}, ${club}, ${WEEKDAYS[index] ?? ""}, ${interval},
              ${firstOn(date, index).toString()}::pg_catalog.text::pg_catalog.date,
              ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
  }

  const days: SpikeDay[] = [];
  for (const [local, instants, interval, displayName] of [
    [date, firstDay, ana, "Ana"],
    [next, nextDay, benInterval, "Ben"],
  ] as const) {
    const id = newId("occ");
    await tx`
      INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
      VALUES (${id}, ${club}, ${interval}, ${version}, ${local.toString()}::pg_catalog.text::pg_catalog.date,
              ${instants.revealAt.toString()}::pg_catalog.text::pg_catalog.timestamptz,
              ${instants.closeAt.toString()}::pg_catalog.text::pg_catalog.timestamptz,
              ${at}::pg_catalog.text::pg_catalog.timestamptz)`;
    days.push({
      id,
      star: { membershipId: interval, displayName },
      localDate: local,
      revealAt: instants.revealAt,
      closeAt: instants.closeAt,
    });
  }
  const [first, second] = days;
  if (first === undefined || second === undefined) throw new OpsError("spike-time: the club's days weren't written");
  return { id: club, name, timezone: ZONE, membershipId: ana, first, second };
}

/** Moves the dev clock forward to `to` in its own transaction (dev-clock.ts), and says the offsets. */
export async function moveClock(db: postgres.Sql, to: Temporal.Instant): Promise<{ before: bigint; after: bigint }> {
  const report = await db.begin(async (tx) => {
    await limitTransaction(tx);
    return devClock(tx, { to });
  });
  return { before: report.offsetBeforeMicroseconds, after: report.offsetMicroseconds };
}

// ---- What the API should answer.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function occurrence(club: SpikeClub, day: SpikeDay, phase: "open" | "collecting"): Json {
  return {
    id: day.id,
    club_id: club.id,
    star: { membership_id: day.star.membershipId, display_name: day.star.displayName },
    local_date: day.localDate.toString(),
    reveal_at: contractInstant(day.revealAt),
    close_at: contractInstant(day.closeAt),
    phase,
  };
}

/**
 * The whole `ClubList` the reader should be given at `serverNow`, T5's rule on the run's two days:
 * a day is open while `reveal_at <= server_now < close_at`, and the next day is the earliest whose
 * `reveal_at` is after `server_now`. Both instants are whole seconds, so `server_now`, the server's
 * sample cut to the second, is on the same side of each as the sample was.
 */
export function expectedClubList(club: SpikeClub, serverNow: Temporal.Instant): Json {
  const days = [club.first, club.second];
  const open = days.find(
    (day) =>
      Temporal.Instant.compare(day.revealAt, serverNow) <= 0 && Temporal.Instant.compare(serverNow, day.closeAt) < 0,
  );
  const next = days
    .filter((day) => Temporal.Instant.compare(day.revealAt, serverNow) > 0)
    .sort((a, b) => Temporal.Instant.compare(a.revealAt, b.revealAt))[0];
  return {
    server_now: contractInstant(serverNow),
    clubs: [
      {
        id: club.id,
        name: club.name,
        timezone: club.timezone,
        my_membership_id: club.membershipId,
        state: "active",
        member_count: 2,
        ...(open === undefined ? {} : { open_day: occurrence(club, open, "open") }),
        ...(next === undefined ? {} : { next_day: occurrence(club, next, "collecting") }),
      },
    ],
    invitations: [],
  };
}

/** `value` as JSON with every object's keys in order, so two equal values give one text. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** What an API answer was, as the run reads it. */
export interface Answer {
  readonly status: number;
  readonly cacheControl: string | null;
  readonly json: unknown;
}

const SECOND = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Which of the run's own days a club list shows, in words: "open Ana's 2026-11-16 (open), next Ben's
 * 2026-11-17 (collecting)". Each day is found by its id among the two the run wrote, and named and
 * dated from what the run wrote, never from the answer, so a wrong answer can't put another club's
 * name or date in the run's report; its phase is said only when it is one of the contract's two.
 */
function shown(json: unknown, club: SpikeClub): string {
  const clubs = isRecord(json) ? json["clubs"] : undefined;
  const summary: unknown = Array.isArray(clubs) && clubs.length === 1 ? clubs[0] : undefined;
  if (!isRecord(summary)) return "no one club";
  if (summary["id"] !== club.id) return "not the run's club";
  const day = (key: string) => {
    const value = summary[key];
    if (value === undefined) return "none";
    if (!isRecord(value)) return "not a day";
    const own = [club.first, club.second].find((one) => one.id === value["id"]);
    if (own === undefined) return "a day not the run's";
    const phase = value["phase"] === "open" || value["phase"] === "collecting" ? value["phase"] : "another phase";
    return `${own.star.displayName}'s ${own.localDate.toString()} (${phase})`;
  };
  return `open ${day("open_day")}, next ${day("next_day")}`;
}

/** `text` as an instant, when it is one in whole seconds, as the contract writes them. */
function instantIn(text: unknown): Temporal.Instant | undefined {
  if (typeof text !== "string" || !SECOND.test(text)) return undefined;
  try {
    return Temporal.Instant.from(text);
  } catch {
    return undefined;
  }
}

/** An answer's `server_now`, and why the answer is wrong, if it is. */
export function judge(answer: Answer, club: SpikeClub): { serverNow?: Temporal.Instant; problem?: string } {
  if (answer.status !== 200) return { problem: `answered HTTP ${String(answer.status)}` };
  const record =
    typeof answer.json === "object" && answer.json !== null ? (answer.json as Record<string, unknown>) : {};
  const serverNow = instantIn(record["server_now"]);
  if (serverNow === undefined) return { problem: "answered with no server_now in whole seconds" };
  // Placed by its server_now from here, so a window ends even when every answer is wrong. The header's
  // own value is never printed: only that it is missing or isn't the contract's.
  if (answer.cacheControl !== "private, no-store") {
    const header = answer.cacheControl === null ? "no Cache-Control" : "a Cache-Control other than private, no-store";
    return { serverNow, problem: `answered with ${header}` };
  }
  const expected = expectedClubList(club, serverNow);
  if (canonical(answer.json) !== canonical(expected)) {
    const where = differences(answer.json, expected).slice(0, 5).join(", ");
    return {
      serverNow,
      problem: `at server_now ${contractInstant(serverNow)} it showed ${shown(answer.json, club)}, where T5 has ${shown(expected, club)}; it differs at ${where}`,
    };
  }
  return { serverNow };
}

/** Where `actual` differs from `expected`, by the keys' path only, never a value: "clubs[0].open_day.phase". */
function differences(actual: unknown, expected: unknown, path = ""): string[] {
  if (canonical(actual) === canonical(expected)) return [];
  if (isRecord(actual) && isRecord(expected)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    return keys.flatMap((key) => {
      const name = key.replace(/[^A-Za-z0-9_]/g, "?").slice(0, 40);
      return differences(actual[key], expected[key], path === "" ? name : `${path}.${name}`);
    });
  }
  if (Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length) {
    return actual.flatMap((item, index) => differences(item, expected[index], `${path}[${String(index)}]`));
  }
  return [path === "" ? "the whole answer" : path];
}

// ---- The run.

/** The database's two parts of the run, which a test gives fakes for (the real ones are above). */
export interface SpikeDatabase {
  readonly writeClub: (account: SpikeAccount) => Promise<SpikeClub>;
  readonly moveClock: (to: Temporal.Instant) => Promise<{ before: bigint; after: bigint }>;
}

export interface SpikeInput {
  readonly fetch: typeof fetch;
  /** The project's URL (`SUPABASE_URL`). */
  readonly url: string;
  readonly publishableKey: string;
  readonly serviceKey: string;
  readonly database: SpikeDatabase;
  /** The run's id, which names everything it makes. */
  readonly run: string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly say: (line: string) => void;
  /** Started by the Machine's half before it opens the database: `SPIKE_LIMITS.budgetMs`. */
  readonly budget: AbortSignal;
  /** Likewise: `SPIKE_LIMITS.deadlineMs`. */
  readonly deadline: AbortSignal;
  /** The window and call limits; `SPIKE_LIMITS`' unless a test gives shorter ones. */
  readonly limits?: Pick<SpikeLimits, "windowMs" | "callMs">;
  /** The API's root; `API` unless a test gives another. */
  readonly api?: string;
}

const NO_ANSWER = "no answer";
const OUT_OF_TIME = "the run's time ran out";
const UNDER_WAY = "the run's time ran out while it was under way, so it may still commit";

/**
 * `work`'s outcome, unless `within` ends first: then, a turn later, a refusal that says the call was
 * still under way, so that a database call that never settles can't hold the run, or its clean-up,
 * past their limits. A call that has settled by that turn is taken as it settled.
 */
function untilAborted<T>(work: Promise<T>, within: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const stop = () => {
      setImmediate(() => {
        if (settled) return;
        settled = true;
        reject(new OpsError(UNDER_WAY));
      });
    };
    if (within.aborted) stop();
    else within.addEventListener("abort", stop, { once: true });
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        within.removeEventListener("abort", stop);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        within.removeEventListener("abort", stop);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const seconds = (microseconds: bigint) => `${(microseconds / 1_000_000n).toString()} s`;

/** The text of a JSON object's string at `key`. */
function text(json: unknown, key: string): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Runs the spike and returns its checks; a run passes only if every one did. */
export async function spikeTime(input: SpikeInput): Promise<Check[]> {
  const base = projectUrl(input.url);
  const apiBase = input.api ?? API;
  const limits = input.limits ?? SPIKE_LIMITS;
  const service: Caller = { kind: "service", key: input.serviceKey };
  const anon: Caller = { kind: "anon", key: input.publishableKey };
  const email = `spike-${input.run}@probe.invalid`;
  const checks: Check[] = [];
  let user: string | undefined;
  /**
   * True when the call that makes the user had no clear answer (none, a server error, or a 200 with
   * no id), so the user may have been made with no id the run knows; a refusal (4xx) made nothing.
   */
  let mayBeMade: boolean | undefined;
  /** True once the clean-up has begun: only the deadline ends it. */
  let cleaning = false;
  const working = AbortSignal.any([input.budget, input.deadline]);
  const limit = () => (cleaning ? input.deadline : working);
  const silence = () => (limit().aborted ? OUT_OF_TIME : NO_ANSWER);

  function record(name: string, problem: string | undefined): boolean {
    checks.push(problem === undefined ? { name, ok: true } : { name, ok: false, note: problem });
    return problem === undefined;
  }

  async function auth(path: string, options: Send): Promise<Reply | undefined> {
    const within = limit();
    if (within.aborted) return undefined;
    try {
      return await send(input.fetch, base, path, { ...options, within });
    } catch (error) {
      if (error instanceof OpsError) return undefined;
      throw error;
    }
  }

  async function api(token: string, method: "GET" | "PATCH", path: string, init: RequestInit = {}) {
    const within = limit();
    if (within.aborted) return undefined;
    try {
      const response = await input.fetch(`${apiBase}${path}`, {
        ...init,
        method,
        headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` },
        signal: AbortSignal.any([AbortSignal.timeout(limits.callMs), within]),
      });
      // The signal still runs while the body comes.
      const body = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        json = undefined;
      }
      return { status: response.status, cacheControl: response.headers.get("cache-control"), json } satisfies Answer;
    } catch {
      return undefined;
    }
  }

  /** The user's token, signed in with the admin API's code, so no email is sent. */
  async function signIn(): Promise<string | undefined> {
    const made = await auth("/auth/v1/admin/users", {
      method: "POST",
      caller: service,
      json: { email, email_confirm: true },
    });
    const id = made?.status === 200 ? text(made.json, "id") : undefined;
    if (id !== undefined) user = id;
    else mayBeMade = made === undefined || made.status === 200 || made.status >= 500;
    const makeProblem = made === undefined ? silence() : id === undefined ? `answered ${describe(made)}` : undefined;
    if (!record("sign-in: the service key makes the run's user", makeProblem) || id === undefined) return undefined;
    const link = await auth("/auth/v1/admin/generate_link", {
      method: "POST",
      caller: service,
      json: { type: "magiclink", email },
    });
    const hashed = link?.status === 200 ? text(link.json, "hashed_token") : undefined;
    let problem =
      link === undefined ? silence() : hashed === undefined ? `no sign-in code: ${describe(link)}` : undefined;
    let token: string | undefined;
    if (problem === undefined && hashed !== undefined) {
      const verified = await auth("/auth/v1/verify", {
        method: "POST",
        caller: anon,
        json: { type: "magiclink", token_hash: hashed },
      });
      token = verified?.status === 200 ? text(verified.json, "access_token") : undefined;
      if (verified === undefined) problem = silence();
      else if (token === undefined) problem = `the code wasn't taken: ${describe(verified)}`;
    }
    return record("sign-in: the user signs in without an email", problem) ? token : undefined;
  }

  /** The account, made by `GET /v1/me` and finished by `PATCH /v1/me` as the app finishes it. */
  async function profile(token: string, subject: string): Promise<SpikeAccount | undefined> {
    const me = await api(token, "GET", "/v1/me");
    const id = me?.status === 200 ? text(me.json, "id") : undefined;
    const version =
      me?.status === 200 && typeof me.json === "object" && me.json !== null
        ? (me.json as Record<string, unknown>)["version"]
        : undefined;
    const made =
      me === undefined
        ? silence()
        : id === undefined || typeof version !== "number"
          ? `answered HTTP ${String(me.status)}`
          : undefined;
    if (!record("api: GET /v1/me makes the run's account", made) || id === undefined) return undefined;
    const patched = await api(token, "PATCH", "/v1/me", {
      headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify({ expected_version: version, display_name: "Ana", age_confirmed: true }),
    });
    const finished =
      patched === undefined
        ? silence()
        : patched.status !== 200 ||
            text(patched.json, "id") !== id ||
            text(patched.json, "display_name") !== "Ana" ||
            (patched.json as Record<string, unknown>)["age_confirmed"] !== true
          ? `answered HTTP ${String(patched.status)}`
          : undefined;
    return record("api: PATCH /v1/me names it Ana and confirms its age", finished) ? { id, subject } : undefined;
  }

  async function writeClub(account: SpikeAccount): Promise<SpikeClub | undefined> {
    const within = limit();
    if (within.aborted) {
      record("database: the club is written", OUT_OF_TIME);
      return undefined;
    }
    try {
      const club = await untilAborted(input.database.writeClub(account), within);
      record("database: the club is written", undefined);
      return club;
    } catch (error) {
      record("database: the club is written", error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  async function move(edge: string, to: Temporal.Instant): Promise<boolean> {
    const name = `${edge}: dev's clock moves to ${to.toString()}`;
    const within = limit();
    if (within.aborted) return record(name, OUT_OF_TIME);
    try {
      const { before, after } = await untilAborted(input.database.moveClock(to), within);
      input.say(
        `spike-time: ${edge}: dev's clock moved to ${to.toString()}, ${seconds(before)} ahead before, ${seconds(after)} after`,
      );
      return record(name, undefined);
    } catch (error) {
      return record(name, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Reads the club list around `at` until `ANSWERS_AFTER` answers are at or after it, and judges each.
   * Returns how many answers carried a `server_now`, so the run can tell a window that saw nothing.
   */
  async function watch(token: string, club: SpikeClub, edge: string, at: Temporal.Instant): Promise<number> {
    const window = AbortSignal.timeout(limits.windowMs);
    let before = 0;
    let after = 0;
    let wrong = 0;
    let firstProblem: string | undefined;
    let lastBefore: { serverNow: Temporal.Instant; json: unknown } | undefined;
    let firstAfter: { serverNow: Temporal.Instant; json: unknown } | undefined;
    while (after < ANSWERS_AFTER && !window.aborted && !limit().aborted) {
      const answer = await api(token, "GET", "/v1/clubs");
      if (answer === undefined) {
        wrong += 1;
        firstProblem ??= `a read had ${silence()}`;
      } else {
        const verdict = judge(answer, club);
        if (verdict.problem !== undefined) {
          wrong += 1;
          firstProblem ??= verdict.problem;
        }
        if (verdict.serverNow !== undefined) {
          if (Temporal.Instant.compare(verdict.serverNow, at) < 0) {
            before += 1;
            lastBefore = { serverNow: verdict.serverNow, json: answer.json };
          } else {
            after += 1;
            firstAfter ??= { serverNow: verdict.serverNow, json: answer.json };
          }
        }
      }
      if (after < ANSWERS_AFTER) await input.sleep(POLL_MS);
    }
    const lines = [`${String(before)} answers before it and ${String(after)} at or after it`];
    if (lastBefore !== undefined) {
      lines.push(`the last before at ${contractInstant(lastBefore.serverNow)}: ${shown(lastBefore.json, club)}`);
    }
    if (firstAfter !== undefined) {
      const late = firstAfter.serverNow.since(at).total({ unit: "seconds" });
      lines.push(
        `the first after at ${contractInstant(firstAfter.serverNow)}, ${String(late)} s after it: ${shown(firstAfter.json, club)}`,
      );
    }
    input.say(`spike-time: ${edge} at ${at.toString()}: ${lines.join("; ")}`);
    record(
      `${edge}: every answer is the club's days as T5 has them at its server_now`,
      wrong === 0 ? undefined : `${String(wrong)} wrong; the first: ${firstProblem ?? ""}`,
    );
    record(
      `${edge}: answers came from both sides of ${at.toString()}`,
      before > 0 && after >= ANSWERS_AFTER
        ? undefined
        : `${String(before)} before and ${String(after)} after${window.aborted ? ", when its minute ran out" : limit().aborted ? `, when ${OUT_OF_TIME}` : ""}`,
    );
    return before + after;
  }

  try {
    const token = await signIn();
    const account = token === undefined || user === undefined ? undefined : await profile(token, user);
    const club = account === undefined ? undefined : await writeClub(account);
    if (token !== undefined && club !== undefined) {
      input.say(
        `spike-time: club ${club.name} in ${club.timezone}: Ana's day ${club.first.localDate.toString()} opens ` +
          `${club.first.revealAt.toString()} and closes ${club.first.closeAt.toString()}; Ben's day ` +
          `${club.second.localDate.toString()} opens ${club.second.revealAt.toString()}`,
      );
      // Both instants are watched whatever the reveal's window found, so a failed run still shows
      // both, except when the reveal's window had no answer at all: then the close's couldn't either,
      // and dev's clock isn't moved the further 18 hours or so for nothing (it never comes back).
      for (const [edge, at] of [
        ["reveal", club.first.revealAt],
        ["close", club.first.closeAt],
      ] as const) {
        if (!(await move(edge, at.subtract({ seconds: LEAD_SECONDS })))) break;
        if ((await watch(token, club, edge, at)) === 0 && edge === "reveal") {
          record(
            "close: dev's clock moves again only after a reveal's window that had answers",
            "the reveal's window had no answer with a server_now, so the close isn't watched",
          );
          break;
        }
      }
    }
  } finally {
    cleaning = true;
    if (user !== undefined) {
      const reply = await auth(`/auth/v1/admin/users/${encodeURIComponent(user)}`, {
        method: "DELETE",
        caller: service,
      });
      const gone = reply !== undefined && (reply.status === 200 || reply.status === 204 || reply.logical === 404);
      record(
        "cleanup: delete the run's user",
        gone ? undefined : `${reply === undefined ? silence() : `answered ${describe(reply)}`}; ${email} is left`,
      );
    } else if (mayBeMade === true) {
      record(
        "cleanup: the run's user may be left",
        `the call that makes it had no clear answer, so ${email} may have been made: delete it by that address`,
      );
    }
  }
  return checks;
}
