/// <reference lib="esnext.temporal" />
// What a change of a club's members does to its week once its first days have applied, written (spec 05;
// T1, T6, T33; FQ16, FQ56, FQ61, FQ100, FQ102, FQ125 to FQ127; docs/plans/api-b2-membership-change.md,
// section 3). Called in the caller's transaction, holding the club's row, with the caller's own sample of
// the clock taken after that lock (T1), after `settleFirstDays` (./settle.ts), by every command that
// starts or ends a membership of a club that has started (../clubs/apply-roster.ts, ../clubs/leave-club.ts),
// and by the confirmation that applies the first days (./confirm-days.ts).
//
// Under the club's row nothing of its schedule changes meanwhile (./command.ts). So the facts are read
// once, the rule says what follows (./change.ts `changeAfter`), and this writes it:
// - a change proposed: its row (`membership_change`, open at version 1, with its start and spec 05's days
//   each, and no week of its own: it gets one when it applies, which `api/b2-change-start` builds), a row
//   for each active member, and the days it proposes for them, each proposed and held;
// - an open change ended: superseded at its next `version`, with `replaced_by` when a new change takes its
//   place, whose id its own then answers MEMBERSHIP_CHANGED with. Its confirmations stay on its rows and
//   count for nothing: the new change is confirmed by everyone (FQ126).
// When the rule says nothing, nothing is written and no version moves (T33).
//
// The start (./change.ts `changeStart`) is read from the club's local date at `at` and the last day made
// for the club. A change that replaces an open one keeps its start while that is still ahead (FQ127).

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";
import { changeAfter, changeStart, type WeekChange, type WeekDay } from "./change.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function shape(): Error {
  return new Error("schedule: the club's week came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value as unknown[];
}

function weekday(value: unknown): Weekday {
  const found = WEEKDAYS.find((day) => day === value);
  if (found === undefined) throw shape();
  return found;
}

function date(value: unknown): Temporal.PlainDate {
  const read = text(value);
  if (!DATE.test(read)) throw shape();
  return Temporal.PlainDate.from(read);
}

/**
 * Settles the week of `clubId` after its members changed or its first days applied, at `at`, in `tx`, a
 * READ COMMITTED transaction that holds the club's row, and says what it did.
 */
export async function settleChange(tx: QuerySql, at: ServerNow, clubId: string): Promise<WeekChange["kind"]> {
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new TypeError("schedule: the club is a club id");
  const [row] = await bound(tx)`
    SELECT c.timezone,
           (SELECT coalesce(pg_catalog.jsonb_agg(m.interval_id ORDER BY m.joined_at, m.interval_id COLLATE "C"),
                            '[]'::pg_catalog.jsonb)
              FROM app.memberships m WHERE m.club_id = c.id AND m.state = 'active') AS active,
           EXISTS (SELECT FROM app.schedule_proposals p
                    WHERE p.club_id = c.id AND p.state = 'open' AND p.reason = 'activation') AS first_days_open,
           EXISTS (SELECT FROM app.schedule_proposals p
                    WHERE p.club_id = c.id AND p.state = 'applied') AS applied,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'weekday', a.weekday, 'star', a.star_interval_id)), '[]'::pg_catalog.jsonb)
              FROM app.schedule_assignments a
             WHERE a.schedule_version_id = (SELECT v.id FROM app.schedule_versions v
                                             WHERE v.club_id = c.id ORDER BY v.effective_from DESC LIMIT 1)) AS week,
           (SELECT pg_catalog.jsonb_build_object(
                     'id', p.id, 'effective_from', p.effective_from,
                     'members',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pm.interval_id), '[]'::pg_catalog.jsonb)
                        FROM app.schedule_proposal_members pm WHERE pm.proposal_id = p.id))
              FROM app.schedule_proposals p
             WHERE p.club_id = c.id AND p.state = 'open' AND p.reason = 'membership_change') AS open,
           (SELECT pg_catalog.max(o.local_date)::pg_catalog.text FROM app.occurrences o
             WHERE o.club_id = c.id) AS last_made
      FROM app.clubs c
     WHERE c.id = ${clubId}`;
  if (row === undefined) throw new Error("schedule: no such club to settle the week of");
  const found = row["open"] === null ? null : record(row["open"]);
  // A club whose first days never applied has no week to change: new first days are its next week (FQ102).
  const week = flag(row["applied"])
    ? list(row["week"]).map((item): WeekDay => {
        const day = record(item);
        return { weekday: weekday(day["weekday"]), star: text(day["star"]) };
      })
    : null;
  const change = changeAfter({
    active: list(row["active"]).map(text),
    firstDaysOpen: flag(row["first_days_open"]),
    week,
    open: found === null ? null : { members: list(found["members"]).map(text) },
  });
  if (change.kind === "nothing") return change.kind;
  if (change.kind === "drop" || change.replaces) {
    if (found === null) throw new Error("schedule: the rule ended a change that isn't open");
  }
  const openId = found === null ? null : text(found["id"]);
  if (change.kind === "drop") {
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
       WHERE id = ${openId ?? ""}`;
    return change.kind;
  }

  const today = at.toZonedDateTimeISO(clubTimeZone(text(row["timezone"]))).toPlainDate();
  const lastMade = row["last_made"] === null ? null : date(row["last_made"]);
  const start = changeStart(today, lastMade, found === null ? null : date(found["effective_from"])).toString();
  const proposalId = newId("spr");
  if (openId !== null) {
    // The open change first: a club has one open proposal. `replaced_by` is checked at commit.
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1,
             replaced_by = ${proposalId}
       WHERE id = ${openId}`;
  }
  await bound(tx)`
    INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, created_at)
    VALUES (${proposalId}, ${clubId}, 'membership_change', ${start}::pg_catalog.date,
            ${String(change.daysPerMember)}::pg_catalog.int2, ${at}::pg_catalog.timestamptz)`;
  for (const member of change.proposed) {
    await bound(tx)`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposalId}, ${clubId}, ${member.id})`;
    for (const day of member.days) {
      await bound(tx)`
        INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
        VALUES (${proposalId}, ${member.id}, ${day}::app.weekday, true, true)`;
    }
  }
  return change.kind;
}
