/// <reference lib="esnext.temporal" />
// Making a club's days (spec 05: "Generate upcoming occurrences several weeks ahead"; spec 06, 34; T1, T2,
// T6; FQ16, FQ61, FQ63, FQ79, FQ115, FQ129). The worker's first job runs it for every club
// (services/worker/src/generation.ts); the rule is ./generate.ts, and the database judges every row again
// (db/migrations/0005_schedules_and_days.sql, occurrences_insert_guard).
//
// In one READ COMMITTED transaction the caller opens, for one club:
// 1. The club's row, `FOR UPDATE`: the lock every schedule command takes first and a new version needs
//    (schedule_versions_insert_guard), so no version starts, and no day is confirmed, between this read
//    and its inserts (FQ61).
// 2. The clock, sampled after the lock (T1; T3's order): a run that waited for the lock dates its days
//    from the time it got it.
// 3. The club's facts, in one statement: its zone, whether it has started or is suspended, its active
//    members, every version with its days and whether each star is still a member, the dates from
//    the club's today on that already have a day not cancelled, and those whose day was cancelled, with
//    whose day it was (FQ129).
// 4. One row for each day the rule owes, `collecting_from` the sample (spec 06: collecting begins when
//    generated), `ON CONFLICT (club_id, local_date) WHERE status <> 'cancelled' DO NOTHING` (the one live
//    day a date has, db/migrations/0015_new_member_day.sql): a retry, or a second worker, makes nothing
//    twice (spec 34).
//
// It writes nothing else: no event and no push. It reads nothing of anyone's drops, and returns only how
// many days it made.

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { daysToMake, type GenerationFacts, type WeekVersion } from "./generate.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function shape(): Error {
  return new Error("schedule: a club's week came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw shape();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value;
}

function date(value: unknown): string {
  const day = text(value);
  if (!DATE.test(day)) throw shape();
  return day;
}

function weekday(value: unknown): Weekday {
  const day = WEEKDAYS.find((known) => known === value);
  if (day === undefined) throw shape();
  return day;
}

function versionOf(value: unknown): WeekVersion {
  const row = record(value);
  return {
    id: text(row["id"]),
    effectiveFrom: date(row["effective_from"]),
    assignments: list(row["assignments"]).map((entry) => {
      const day = record(entry);
      return {
        weekday: weekday(day["weekday"]),
        starInterval: text(day["star_interval_id"]),
        firstDate: date(day["first_date"]),
        starActive: flag(day["star_active"]),
      };
    }),
  };
}

/**
 * Makes the days the club `clubId` is owed, in `tx`, and returns how many it made: 0 when it is owed
 * none, and when no club has that id.
 */
export async function makeDays(tx: QuerySql & ClockSql, clock: Clock, clubId: string): Promise<number> {
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new TypeError("schedule: the club is a club id");

  // 1. The club's row.
  const [club] = await bound(tx)`SELECT timezone FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  if (club === undefined) return 0;
  const zone = clubTimeZone(text(club["timezone"]));

  // 2. The clock, after the lock.
  const now = await clock.sample(tx);
  const today = now.toZonedDateTimeISO(zone).toPlainDate().toString();

  // 3. The facts.
  const [row] = await bound(tx)`
    SELECT c.activated_at IS NOT NULL AS activated, c.suspended_at IS NOT NULL AS suspended,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.memberships m
             WHERE m.club_id = c.id AND m.state = 'active') AS active_members,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'id', v.id, 'effective_from', v.effective_from,
                     'assignments',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'weekday', a.weekday, 'star_interval_id', a.star_interval_id,
                               'first_date', a.first_date, 'star_active', s.state = 'active')),
                             '[]'::pg_catalog.jsonb)
                        FROM app.schedule_assignments a
                        JOIN app.memberships s ON s.interval_id = a.star_interval_id
                       WHERE a.schedule_version_id = v.id))),
                   '[]'::pg_catalog.jsonb)
              FROM app.schedule_versions v WHERE v.club_id = c.id) AS versions,
           (SELECT coalesce(pg_catalog.jsonb_agg(o.local_date), '[]'::pg_catalog.jsonb)
              FROM app.occurrences o
             WHERE o.club_id = c.id AND o.local_date >= ${today}::pg_catalog.date
               AND o.status <> 'cancelled') AS made,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'local_date', o.local_date, 'star_interval_id', o.star_interval_id)), '[]'::pg_catalog.jsonb)
              FROM app.occurrences o
             WHERE o.club_id = c.id AND o.local_date >= ${today}::pg_catalog.date
               AND o.status = 'cancelled') AS cancelled
      FROM app.clubs c WHERE c.id = ${clubId}`;
  if (row === undefined) throw shape();
  const members = row["active_members"];
  if (typeof members !== "number" || !Number.isInteger(members) || members < 0) throw shape();
  const cancelled = new Map<string, string[]>();
  for (const entry of list(row["cancelled"])) {
    const day = record(entry);
    const localDate = date(day["local_date"]);
    cancelled.set(localDate, [...(cancelled.get(localDate) ?? []), text(day["star_interval_id"])]);
  }
  const facts: GenerationFacts = {
    zone,
    activated: flag(row["activated"]),
    suspended: flag(row["suspended"]),
    activeMembers: members,
    versions: list(row["versions"]).map(versionOf),
    made: new Set(list(row["made"]).map(date)),
    cancelled,
  };

  // 4. The days.
  let made = 0;
  for (const day of daysToMake(facts, now)) {
    const inserted = await bound(tx)`
      INSERT INTO app.occurrences
        (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
      VALUES (${newId("occ")}, ${clubId}, ${day.starInterval}, ${day.versionId}, ${day.localDate}::pg_catalog.date,
              ${day.revealAt}::pg_catalog.timestamptz, ${day.closeAt}::pg_catalog.timestamptz,
              ${now}::pg_catalog.timestamptz)
      ON CONFLICT (club_id, local_date) WHERE status <> 'cancelled' DO NOTHING
      RETURNING id`;
    made += inserted.length;
  }
  return made;
}

/** The ids of the clubs that have a week, in id order: the worker's work list. */
export async function clubsWithAWeek(sql: QuerySql): Promise<string[]> {
  const rows = await bound(sql)`
    SELECT c.id FROM app.clubs c
     WHERE EXISTS (SELECT FROM app.schedule_versions v WHERE v.club_id = c.id)
     ORDER BY c.id COLLATE "C"`;
  return rows.map((row) => text(row["id"]));
}
