/// <reference lib="esnext.temporal" />
// The reveal push's rules (spec 21's two reveal rows; T1, T9, T36, T37, T42, T52; FQ30; book p37;
// docs/plans/api-b2-spike-push.md, section 2): who is told that a day is ready, when, in what words, and whether a
// delivery the worker planned still goes when it comes due. The worker (services/worker/src/push.ts) takes the locks,
// samples the clock after them and writes the rows; everything it decides is here.
//
// - Who: the day's readers, each active member of its club who can read at least one drop of the day's media at the
//   sample, by the read predicate (`readableDrops`, T9). Nobody with no readable drop is told the day is ready (T36).
//   The star reads their own day like anyone else.
// - When: the reveal, or, when it falls in the device's quiet hours (23:00 to 08:00 in the zone its registration
//   holds), the next 08:00 there (T37). The day opens in the app at 07:00 all the same.
// - Whether, at dispatch: the rechecks of the plan's section 2.3 in their order, then quiet hours in the zone the
//   registration holds now, then the budget: two ordinary pushes a day per member across clubs, the day counted in
//   the zone of the member's most recently registered device (FQ30's default). A day already counted, by this
//   delivery's own earlier decision or by a send to another of the member's devices, is the same push and counts once.
// - In what words: spec 21's, with the app's typographic apostrophe, the star's name as members see it (FQ75,
//   `starNameOf`), never a pronoun (T42); and a payload of names and timing alone: no caption, media, URL, provider id
//   or source (T37, T52), no badge (T33).
//
// It reads no clock: `now` is the worker's sample, taken after its locks (T1). Zones are resolved here, in the time
// module's way (`clubTimeZone`, `resolveCivilTime`), never in SQL (ADR-008).

import type { ServerNow } from "../time/clock.ts";
import { clubTimeZone, resolveCivilTime } from "../time/civil.ts";
import { placeable, starNameOf, type DayFacts } from "../authorization/days.ts";
import { checkNow, type AccountState } from "../authorization/read.ts";
import { checkViewer, readableDrops, type QuerySql } from "../authorization/read-sql.ts";
import { dayColumns, dayFactsOf } from "../authorization/add-target.ts";
import { Fault, InputFault } from "../fault.ts";

/** When a device's quiet hours start and end, in its own zone (T37; spec 21). */
export const QUIET_START = Temporal.PlainTime.from("23:00");
export const QUIET_END = Temporal.PlainTime.from("08:00");

/** Ordinary pushes a member may get in a day, across clubs (T37; spec 21). */
export const PUSH_BUDGET = 2;

/** The body the star gets (spec 21), with the app's apostrophe. */
export const STAR_BODY = "It’s your day. Your collection is ready";

/** What a delivery skipped at dispatch says, in the plan's order. */
export const SKIP_CODES = ["closed", "held", "account", "unreadable", "unregistered", "quiet", "budget"] as const;
export type SkipCode = (typeof SKIP_CODES)[number];

function insideQuiet(time: Temporal.PlainTime): boolean {
  return Temporal.PlainTime.compare(time, QUIET_END) < 0 || Temporal.PlainTime.compare(time, QUIET_START) >= 0;
}

/** The first instant at or after `at` outside quiet hours in `zone`: `at`, or 08:00 that morning or the next. */
function outsideQuiet(at: Temporal.Instant, zone: string): Temporal.Instant {
  const local = at.toZonedDateTimeISO(clubTimeZone(zone));
  const time = local.toPlainTime();
  if (!insideQuiet(time)) return at;
  const date =
    Temporal.PlainTime.compare(time, QUIET_START) >= 0 ? local.toPlainDate().add({ days: 1 }) : local.toPlainDate();
  return resolveCivilTime(date, QUIET_END, zone);
}

/** When a day's push to a device in `zone` is first due: its reveal, or the end of the device's quiet hours. */
export function plannedDueAt(revealAt: Temporal.Instant, zone: string): Temporal.Instant {
  return outsideQuiet(revealAt, zone);
}

/** The end of the quiet hours `now` is in, in `zone`, or null when it is in none. */
export function quietUntil(now: ServerNow, zone: string): Temporal.Instant | null {
  checkNow(now);
  const until = outsideQuiet(now, zone);
  return Temporal.Instant.compare(until, now) === 0 ? null : until;
}

/** A member's budget day: from the start of the local day `now` is in, to the start of the next (FQ30). */
export interface BudgetDay {
  readonly from: Temporal.Instant;
  readonly until: Temporal.Instant;
}

/** The local day of `zone` that `now` falls in, as two instants, its start's and the next day's start's. */
export function budgetDay(now: ServerNow, zone: string): BudgetDay {
  checkNow(now);
  const id = clubTimeZone(zone);
  const date = now.toZonedDateTimeISO(id).toPlainDate();
  return {
    from: date.toZonedDateTime(id).toInstant(),
    until: date.add({ days: 1 }).toZonedDateTime(id).toInstant(),
  };
}

/** Spec 21's words: the star's, or the others', with the star's name as members see it (T42: a name, no pronoun). */
export function revealBody(isStar: boolean, starName: string): string {
  if (typeof starName !== "string" || starName === "")
    throw new InputFault("reveal_push_1", "push: a ready message names the day's star");
  return isStar ? STAR_BODY : `${starName}’s day is ready`;
}

/**
 * The APNs payload of a day's ready message (the plan's section 2.4, agreed with the ios lane): the body, the default
 * sound and the club as the thread, and `tadayo`, the deep link to the club's day, which the app opens after
 * rechecking access (T38). Nothing else: no badge (T33), no caption, media, URL, provider id or source (T37, T52).
 */
export interface RevealPayload {
  readonly aps: {
    readonly alert: { readonly body: string };
    readonly sound: "default";
    readonly "thread-id": string;
  };
  readonly tadayo: { readonly open: "day"; readonly club_id: string; readonly occurrence_id: string };
}

export function revealPayload(body: string, clubId: string, occurrenceId: string): RevealPayload {
  for (const id of [clubId, occurrenceId]) {
    if (typeof id !== "string" || !ID.test(id)) throw new InputFault("reveal_push_2", "push: a payload names ids");
  }
  return {
    aps: { alert: { body }, sound: "default", "thread-id": clubId },
    tadayo: { open: "day", club_id: clubId, occurrence_id: occurrenceId },
  };
}

/** What the decision reads of one delivery at the sample. */
export interface RevealFacts {
  /** The day as the policy reads it. */
  readonly day: DayFacts;
  /** The recipient's account. */
  readonly account: AccountState;
  /** Whether the recipient holds the day's star interval. */
  readonly isStar: boolean;
  /** Whether the read predicate gives the recipient at least one drop of the day's media at the sample (T9). */
  readonly readsADrop: boolean;
  /** The zone the delivery's registration holds now, or null when the sign-in is no longer this account's. */
  readonly deviceZone: string | null;
  /** Whether this day's push already counts in the member's budget (above). */
  readonly counted: boolean;
  /** The other days counted in the member's budget day. */
  readonly spent: number;
}

/** What becomes of a delivery: sent with its body, held to an instant, or skipped with its code. */
export type RevealDecision =
  | { readonly kind: "send"; readonly body: string }
  | { readonly kind: "hold"; readonly until: Temporal.Instant }
  | { readonly kind: "skip"; readonly code: SkipCode };

const skip = (code: SkipCode): RevealDecision => ({ kind: "skip", code });

/** The plan's section 2.3 at `now`: the rechecks in order, then quiet hours, then the budget. */
export function decideReveal(facts: RevealFacts, now: ServerNow): RevealDecision {
  checkNow(now);
  const { day } = facts;
  if (Temporal.Instant.compare(now, day.closeAt) >= 0) return skip("closed");
  if (Temporal.Instant.compare(now, day.revealAt) < 0)
    throw new Fault("reveal_push_3", "push: a day is told of only once it has opened");
  const starName = starNameOf(day);
  if (!placeable(day) || starName === null) return skip("held");
  if (facts.account !== "active") return skip("account");
  if (!facts.readsADrop) return skip("unreadable");
  if (facts.deviceZone === null) return skip("unregistered");
  const until = quietUntil(now, facts.deviceZone);
  if (until !== null) return Temporal.Instant.compare(until, day.closeAt) < 0 ? { kind: "hold", until } : skip("quiet");
  if (!facts.counted && facts.spent >= PUSH_BUDGET) return skip("budget");
  return { kind: "send", body: revealBody(facts.isStar, starName) };
}

type Bound<R> = (
  template: TemplateStringsArray,
  ...values: readonly (string | null | boolean | Temporal.Instant | R)[]
) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const ACCOUNT: readonly AccountState[] = ["active", "deleting", "deleted"];

/** A registration's APNs environment, as 0017 keeps it. */
function isApnsEnvironment(value: unknown): value is "sandbox" | "production" {
  return value === "sandbox" || value === "production";
}

function shape(what: string): Fault {
  return new Fault("reveal_push_4", `push: ${what} came back in a shape the rule doesn't know`);
}

function checkDay(dayId: unknown): string {
  if (typeof dayId !== "string" || !ID.test(dayId)) throw new InputFault("reveal_push_5", "push: the day is an id");
  return dayId;
}

/**
 * The day's readers at `now`: each account with an active interval in the day's club that can read at least one drop
 * of the day's media by the read predicate (T9, T36), in the "C" order of their ids. The connection needs
 * INSTANT_TYPE.
 */
export async function dayReaders(sql: QuerySql, dayId: string, now: ServerNow): Promise<string[]> {
  checkNow(now);
  const id = checkDay(dayId);
  const members = await bound(sql)`
    SELECT DISTINCT m.user_id COLLATE "C" AS user_id
      FROM app.occurrences o JOIN app.memberships m ON m.club_id = o.club_id AND m.state = 'active'
     WHERE o.id = ${id}::pg_catalog.text
     ORDER BY 1`;
  const readers: string[] = [];
  for (const member of members) {
    const user = member["user_id"];
    if (typeof user !== "string") throw shape("a member");
    checkViewer(user);
    const [row] = await bound(sql)`
      SELECT EXISTS (SELECT FROM app.drops x
                      WHERE x.occurrence_id = ${id}::pg_catalog.text
                        AND x.id IN (${readableDrops(sql, user, now, "media")})) AS reads`;
    if (typeof row?.["reads"] !== "boolean") throw shape("a member's read");
    if (row["reads"]) readers.push(user);
  }
  return readers;
}

/** The delivery the decision reads facts for: its day, its recipient, its sign-in (null once gone), its own decision. */
export interface RevealTarget {
  readonly dayId: string;
  readonly userId: string;
  /** The sign-in's hash, or null once its registration is gone. */
  readonly signIn: Uint8Array | null;
  /** The delivery's own id, left out of the budget's count. */
  readonly deliveryId: string;
  /** Whether this delivery was decided before (a send that never reported back): already counted. */
  readonly decidedBefore: boolean;
}

/** The facts `decideReveal` reads, with the registration the push would go to, or null when the day is gone. */
export interface LoadedReveal {
  readonly facts: RevealFacts;
  /** The registration's token and environment, or null when the sign-in is no longer this account's. */
  readonly device: { readonly token: string; readonly environment: "sandbox" | "production" } | null;
}

/**
 * Reads what `decideReveal` needs about `target` at `now`, in two statements: the day, the account, the read, the
 * registration and the zone of the member's latest one; then the budget's count in that zone's day (`budgetDay`).
 * It takes no lock: the worker holds the recipient's account row and the delivery's row already. The connection
 * needs INSTANT_TYPE.
 */
export async function loadReveal(sql: QuerySql, target: RevealTarget, now: ServerNow): Promise<LoadedReveal | null> {
  checkNow(now);
  checkViewer(target.userId);
  const day = checkDay(target.dayId);
  const signIn = target.signIn === null ? null : Buffer.from(target.signIn).toString("hex");
  const [row] = await bound(sql)`
    SELECT ${dayColumns(sql)},
           (SELECT u.state FROM app.users u WHERE u.id = ${target.userId}::pg_catalog.text) AS account,
           s.user_id = ${target.userId}::pg_catalog.text AS is_star,
           EXISTS (SELECT FROM app.drops x
                    WHERE x.occurrence_id = o.id
                      AND x.id IN (${readableDrops(sql, target.userId, now, "media")})) AS reads,
           r.timezone AS device_zone, r.apns_token, r.apns_environment,
           (SELECT l.timezone FROM app.device_registrations l
             WHERE l.user_id = ${target.userId}::pg_catalog.text
             ORDER BY l.registered_at DESC, l.sign_in DESC LIMIT 1) AS budget_zone,
           EXISTS (SELECT FROM app.push_deliveries p
                    WHERE p.occurrence_id = o.id AND p.user_id = ${target.userId}::pg_catalog.text
                      AND p.id <> ${target.deliveryId}::pg_catalog.text AND p.state IN ('sending', 'sent')) AS sent_elsewhere
      FROM app.occurrences o
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
      LEFT JOIN app.device_registrations r
        ON r.sign_in = pg_catalog.decode(${signIn}::pg_catalog.text, 'hex')
       AND r.user_id = ${target.userId}::pg_catalog.text
     WHERE o.id = ${day}::pg_catalog.text`;
  if (row === undefined) return null;
  const account = row["account"];
  if (typeof account !== "string" || !(ACCOUNT as readonly string[]).includes(account)) throw shape("the account");
  for (const key of ["is_star", "reads", "sent_elsewhere"]) {
    if (typeof row[key] !== "boolean") throw shape(key);
  }
  const zone = row["device_zone"];
  const token = row["apns_token"];
  const environment = row["apns_environment"];
  const device =
    typeof zone === "string" && typeof token === "string" && isApnsEnvironment(environment)
      ? { token, environment }
      : null;
  if (device === null && (zone !== null || token !== null || environment !== null)) throw shape("the registration");
  const budgetZone = row["budget_zone"];
  if (budgetZone !== null && typeof budgetZone !== "string") throw shape("the budget's zone");
  let spent = 0;
  if (typeof budgetZone === "string") {
    const { from, until } = budgetDay(now, budgetZone);
    const [count] = await bound(sql)`
      SELECT pg_catalog.count(DISTINCT p.occurrence_id)::pg_catalog.int4 AS spent
        FROM app.push_deliveries p
       WHERE p.user_id = ${target.userId}::pg_catalog.text
         AND p.occurrence_id <> ${day}::pg_catalog.text
         AND p.state IN ('sending', 'sent')
         AND p.sent_at >= ${from}::pg_catalog.timestamptz AND p.sent_at < ${until}::pg_catalog.timestamptz`;
    const n = count?.["spent"];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw shape("the budget's count");
    spent = n;
  }
  return {
    facts: {
      day: dayFactsOf(row),
      account: account as AccountState,
      isStar: row["is_star"] as boolean,
      readsADrop: row["reads"] as boolean,
      deviceZone: device === null ? null : (zone as string),
      counted: target.decidedBefore || (row["sent_elsewhere"] as boolean),
      spent,
    },
    device,
  };
}
