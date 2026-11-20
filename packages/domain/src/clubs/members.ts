/// <reference lib="esnext.temporal" />
// The club's roster and each member's next date (the contract's `listMembers`, `Members` and `Member`;
// spec 09, 32; T1, T9, T14, T15, T33, T49, T55; FQ26, FQ75, FQ98, FQ114). One statement reads it, so it is
// one snapshot, at the caller's `now`, the clock's sample taken first.
//
// - Who gets it: a member of the club by the authorization module's rule (`activeMemberships`): an active
//   account with an active interval in a club that isn't suspended. Anyone else gets null, the neutral
//   not-found, the same for a guessed id (T14).
// - Who is in it: every active interval of the club, each as the contract's Person by FQ75's rule. A
//   member with no name to show is left out, never sent nameless, as a day's star is (../authorization/
//   days.ts). Every member gets the same list (T55): nothing in it comes from drops, so it says nothing
//   of who has added (T15, T33).
// - `nextDay`: the member's next day to open, placed by the authorization module's day rule and by nothing
//   here (T9; `nextDaysByStar`): scheduled, not held, the earliest reveal after `now`. None while they
//   have no day made, as before their first day is confirmed (T49).
// - `nextUp`: the star of the club's next day (`daysByClub`, what the club list gives as `next_day`), so
//   at most one member, and none when the club has no next day.
// - `position`: the roster's stable order (../schedule/order.ts; FQ98, FQ114), from 1.
//
// - `openRevision`: the club's open roster revision, as the caller reads it (./roster-revision.ts
//   `readableRevisions`, FQ119), or null when there is none or it isn't the caller's to read. It is in the
//   same statement, so the roster and the revision are one snapshot.
//
// `cover` (FQ41) is not here: no membership stores a colour yet (B4).

import { chosenDay, daysByClub, nextDaysByStar, type ChosenDay } from "../authorization/days.ts";
import { activeMemberships } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { rosterOrder } from "../schedule/order.ts";
import { WEEKDAYS, type Weekday } from "../schedule/propose.ts";
import { person, personOf, type SchedulePerson } from "../schedule/week.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";
import { readableRevisions, sightOf, type RevisionSight } from "./roster-revision.ts";

export interface MemberRow {
  readonly person: SchedulePerson;
  /** From 1, with no gap. */
  readonly position: number;
  readonly nextDay: ChosenDay | null;
  readonly nextUp: boolean;
}

export interface Roster {
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
    /** The caller's own membership interval in it. */
    readonly membershipId: string;
  };
  /** In roster order. */
  readonly members: readonly MemberRow[];
  /** The club's open roster revision as the caller reads it, or null. */
  readonly openRevision: RevisionSight | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function shape(): Error {
  return new Error("clubs: the roster came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value;
}

interface Version {
  readonly effectiveFrom: string;
  readonly days: readonly { readonly weekday: Weekday; readonly starInterval: string }[];
}

function versionOf(value: unknown): Version {
  const row = record(value);
  const effectiveFrom = text(row["effective_from"]);
  if (!DATE.test(effectiveFrom)) throw shape();
  return {
    effectiveFrom,
    days: list(row["days"]).map((entry) => {
      const day = record(entry);
      const weekday = WEEKDAYS.find((known) => known === day["weekday"]);
      if (weekday === undefined) throw shape();
      return { weekday, starInterval: text(day["star_interval_id"]) };
    }),
  };
}

/** The roster of `clubId` as the account `userId` gets it at `now`, or null (T14). */
export async function listMembers(
  tx: QuerySql,
  userId: string,
  clubId: string,
  now: ServerNow,
): Promise<Roster | null> {
  // An id that can't be one names no club, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) return null;
  const sql = tx;
  const rows = await bound(sql)`
    SELECT c.id, c.name, c.timezone, am.interval_id AS membership_id,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'person', ${person(sql)}, 'next_day', nd.next_day)
                     ORDER BY s.joined_at, s.interval_id COLLATE "C"), '[]'::pg_catalog.jsonb)
              FROM app.memberships s
              JOIN app.users su ON su.id = s.user_id
              LEFT JOIN (${nextDaysByStar(sql, userId, now)}) nd
                ON nd.club_id = s.club_id AND nd.star_interval_id = s.interval_id
             WHERE s.club_id = c.id AND s.state = 'active') AS members,
           h.next_day AS club_next,
           (SELECT pg_catalog.to_jsonb(v) FROM (${readableRevisions(sql, userId, now)}) v
             WHERE v.club_id = c.id AND v.state = 'open') AS open_revision,
           EXISTS (SELECT FROM app.schedule_proposals p
                    WHERE p.club_id = c.id AND p.reason = 'activation' AND p.state = 'open') AS first_days_open,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'effective_from', v.effective_from,
                     'days',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'weekday', a.weekday, 'star_interval_id', a.star_interval_id)),
                             '[]'::pg_catalog.jsonb)
                        FROM app.schedule_assignments a WHERE a.schedule_version_id = v.id))),
                   '[]'::pg_catalog.jsonb)
              FROM app.schedule_versions v WHERE v.club_id = c.id) AS versions
      FROM app.clubs c
      JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id
      LEFT JOIN (${daysByClub(sql, userId, now)}) h ON h.club_id = c.id
     WHERE c.id = ${clubId}::pg_catalog.text`;
  const [row] = rows;
  if (row === undefined) return null;
  const id = text(row["id"]);
  const timezone = text(row["timezone"]);
  const firstDaysOpen = row["first_days_open"];
  if (typeof firstDaysOpen !== "boolean") throw shape();

  // The members who have a name to show, in the order they joined, each with their own next day.
  const shown = list(row["members"]).flatMap((entry) => {
    const member = record(entry);
    const who = personOf(member["person"]);
    if (who.person === null) return [];
    const nextDay = chosenDay(member["next_day"], "collecting");
    // A member's next day is their own, in this club.
    if (nextDay !== null && (nextDay.clubId !== id || nextDay.star.membershipId !== who.id)) throw shape();
    return [{ id: who.id, person: who.person, nextDay }];
  });
  const clubNext = chosenDay(row["club_next"], "collecting");
  if (clubNext !== null && clubNext.clubId !== id) throw shape();

  // The week in force on the club's local date at `now`; ISO dates compare as text.
  const today = now.toZonedDateTimeISO(clubTimeZone(timezone)).toPlainDate().toString();
  const inForce = list(row["versions"])
    .map(versionOf)
    .filter((version) => version.effectiveFrom <= today)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    .at(-1);
  const order = rosterOrder({
    joined: shown.map((member) => member.id),
    firstDaysOpen,
    inForce: inForce === undefined ? null : inForce.days,
  });
  const byId = new Map(shown.map((member) => [member.id, member]));
  const open = row["open_revision"];
  const openRevision = open === null || open === undefined ? null : sightOf(record(open));
  return {
    club: { id, name: text(row["name"]), timezone, membershipId: text(row["membership_id"]) },
    members: order.map((memberId, index) => {
      const member = byId.get(memberId);
      if (member === undefined) throw shape();
      return {
        person: member.person,
        position: index + 1,
        nextDay: member.nextDay,
        nextUp: clubNext !== null && clubNext.star.membershipId === memberId,
      };
    }),
    openRevision,
  };
}
