/// <reference lib="esnext.temporal" />
// What a change of a club's members does to its week once its first days have applied, written (spec 05;
// T1, T6, T9, T33; FQ16, FQ100, FQ102, FQ125 to FQ127, FQ129 to FQ131; docs/plans/api-b2-new-member-day.md,
// section 2). Called in the caller's transaction, holding the club's row, with the caller's own sample of
// the clock taken after that lock (T1), after `settleFirstDays` (./settle.ts), by every command that
// starts or ends a membership of a club that has started (../clubs/apply-roster.ts, ../clubs/leave-club.ts),
// and by the confirmation that applies the first days (./confirm-days.ts). B6's account deletion ends a
// membership too, and must call this as a leave does.
//
// Under the club's row nothing of its schedule changes meanwhile (./command.ts). So the facts are read
// once, the rule says what follows (./change.ts `pickAfter`), and this writes it:
// - days freed (where the free days can't give each member with no day spec 05's number, as when a fourth
//   member joins three who hold all six, or the first days apply with a late joiner; the founder's answer
//   on three to four members): a
//   new week from the club's local date at `at` (or the day after the latest week's start, if that is
//   today or later: ./change.ts `nextWeekStart`) holding each active member's days but those, as they were,
//   with their own first dates; and the freed days' days announced from the next week on cancelled, which
//   only denies them (T9), so what was added for them stays hidden with its authors. Their days this week
//   stay as announced.
// - a pick opened (`membership_change`, open at version 1, its `effective_from` the club's local date at
//   `at`, spec 05's days each, no week of its own), with a row for each member it includes and the days
//   each holds at first, proposed and held; in place of an open one (superseded at its next `version`,
//   `replaced_by` the new one, whose id the earlier one then answers MEMBERSHIP_CHANGED with) when the
//   club's size changed the days each, each member it carries over holding first what they held in it;
// - members added to the open pick, with the days each holds at first; nothing else of it moves (T33);
// - the open pick applied, or ended with no successor, at its next `version`.
// When the rule says nothing, nothing is written and no version moves (T33).

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";
import { nextMonday, nextWeekStart, pickAfter, type PickChange, type PickMember, type WeekDay } from "./change.ts";
import type { ProposedDays } from "./roster-change.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";
import { Fault, InputFault } from "../fault.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function shape(): Error {
  return new Fault("settle_change_1", "schedule: the club's week came back in a shape the schema doesn't allow");
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

/** One day of the club's latest week as it is copied into the next: its own first date and confirmation. */
interface LatestAssignment extends WeekDay {
  readonly firstDate: string;
  readonly confirmedAt: Temporal.Instant;
}

/** Writes the members' rows and the days each holds at first in the pick `proposalId`. */
async function writeHolds(
  tx: QuerySql,
  proposalId: string,
  clubId: string,
  members: readonly ProposedDays[],
): Promise<void> {
  for (const member of members) {
    await bound(tx)`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposalId}, ${clubId}, ${member.id})`;
    for (const day of member.days) {
      await bound(tx)`
        INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
        VALUES (${proposalId}, ${member.id}, ${day}::app.weekday, true, true)`;
    }
  }
}

/**
 * Settles the week of `clubId` after its members changed or its first days applied, at `at`, in `tx`, a
 * READ COMMITTED transaction that holds the club's row, and says what it did.
 */
export async function settleChange(tx: QuerySql, at: ServerNow, clubId: string): Promise<PickChange> {
  if (typeof clubId !== "string" || !ID.test(clubId))
    throw new InputFault("settle_change_2", "schedule: the club is a club id");
  const [row] = await bound(tx)`
    SELECT c.timezone,
           (SELECT coalesce(pg_catalog.jsonb_agg(m.interval_id ORDER BY m.joined_at, m.interval_id COLLATE "C"),
                            '[]'::pg_catalog.jsonb)
              FROM app.memberships m WHERE m.club_id = c.id AND m.state = 'active') AS active,
           EXISTS (SELECT FROM app.schedule_proposals p
                    WHERE p.club_id = c.id AND p.state = 'open' AND p.reason = 'activation') AS first_days_open,
           EXISTS (SELECT FROM app.schedule_proposals p
                    WHERE p.club_id = c.id AND p.reason = 'activation' AND p.state = 'applied') AS applied,
           (SELECT pg_catalog.jsonb_build_object(
                     'effective_from', v.effective_from,
                     'days',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'weekday', a.weekday, 'star', a.star_interval_id, 'first_date', a.first_date,
                               'confirmed_at', a.confirmed_at)), '[]'::pg_catalog.jsonb)
                        FROM app.schedule_assignments a WHERE a.schedule_version_id = v.id))
              FROM app.schedule_versions v
             WHERE v.club_id = c.id ORDER BY v.effective_from DESC LIMIT 1) AS latest,
           (SELECT pg_catalog.jsonb_build_object(
                     'id', p.id, 'days_per_member', p.days_per_member,
                     'members',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'id', pm.interval_id, 'confirmed', pm.confirmed_at IS NOT NULL,
                               'held',
                               (SELECT coalesce(pg_catalog.jsonb_agg(d.weekday), '[]'::pg_catalog.jsonb)
                                  FROM app.schedule_proposal_days d
                                 WHERE d.proposal_id = pm.proposal_id AND d.interval_id = pm.interval_id
                                   AND d.week_revision = p.week_revision AND d.held))), '[]'::pg_catalog.jsonb)
                        FROM app.schedule_proposal_members pm WHERE pm.proposal_id = p.id))
              FROM app.schedule_proposals p
             WHERE p.club_id = c.id AND p.state = 'open' AND p.reason = 'membership_change') AS open
      FROM app.clubs c
     WHERE c.id = ${clubId}`;
  if (row === undefined) throw new Fault("settle_change_3", "schedule: no such club to settle the week of");
  const found = row["open"] === null ? null : record(row["open"]);
  const latest = row["latest"] === null ? null : record(row["latest"]);
  const days =
    latest === null
      ? []
      : list(latest["days"]).map((item): LatestAssignment => {
          const day = record(item);
          return {
            weekday: weekday(day["weekday"]),
            star: text(day["star"]),
            firstDate: date(day["first_date"]).toString(),
            confirmedAt: Temporal.Instant.from(text(day["confirmed_at"])),
          };
        });
  const perMember = found?.["days_per_member"];
  if (found !== null && perMember !== 1 && perMember !== 2) throw shape();
  const active = list(row["active"]).map(text);
  const change = pickAfter({
    active,
    firstDaysOpen: flag(row["first_days_open"]),
    // A club whose first days never applied has no week to change: new first days are its next week (FQ102).
    week: flag(row["applied"]) && latest !== null ? days : null,
    open:
      found === null || (perMember !== 1 && perMember !== 2)
        ? null
        : {
            daysPerMember: perMember,
            members: list(found["members"]).map((item): PickMember => {
              const member = record(item);
              return {
                id: text(member["id"]),
                confirmed: flag(member["confirmed"]),
                held: list(member["held"]).map(weekday),
              };
            }),
          },
  });
  const today = at.toZonedDateTimeISO(clubTimeZone(text(row["timezone"]))).toPlainDate();

  if (change.freed.length > 0) {
    if (latest === null)
      throw new Fault("settle_change_4", "schedule: the rule freed days of a week the club doesn't have");
    const start = nextWeekStart(today, date(latest["effective_from"])).toString();
    const versionId = newId("sched");
    await bound(tx)`
      INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
      VALUES (${versionId}, ${clubId}, ${start}::pg_catalog.date, ${at}::pg_catalog.timestamptz)`;
    const freed = (day: WeekDay) => change.freed.some((each) => each.weekday === day.weekday && each.star === day.star);
    for (const day of days) {
      if (!active.includes(day.star) || freed(day)) continue;
      await bound(tx)`
        INSERT INTO app.schedule_assignments
          (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${versionId}, ${clubId}, ${day.weekday}::app.weekday, ${day.star}, ${day.firstDate}::pg_catalog.date,
                ${day.confirmedAt}::pg_catalog.timestamptz)`;
    }
    // From the next week on: the freed days' announced days open for nobody (T9), and are kept.
    const from = nextMonday(today).toString();
    for (const day of change.freed) {
      await bound(tx)`
        UPDATE app.occurrences SET status = 'cancelled'
         WHERE club_id = ${clubId} AND star_interval_id = ${day.star} AND status <> 'cancelled'
           AND local_date >= ${from}::pg_catalog.date
           AND EXTRACT(isodow FROM local_date) = ${String(WEEKDAYS.indexOf(day.weekday) + 1)}::pg_catalog.int4`;
    }
  }

  const proposal = change.proposal;
  const openId = found === null ? null : text(found["id"]);
  if (proposal.kind === "nothing") return change;
  if (proposal.kind === "drop" || proposal.kind === "apply") {
    if (openId === null) throw new Fault("settle_change_5", "schedule: the rule ended a pick that isn't open");
    const ended = proposal.kind === "drop" ? "superseded" : "applied";
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = ${ended}, closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
       WHERE id = ${openId}`;
    return change;
  }
  if (proposal.kind === "add") {
    if (openId === null)
      throw new Fault("settle_change_6", "schedule: the rule added members to a pick that isn't open");
    await writeHolds(tx, openId, clubId, proposal.members);
    return change;
  }
  const proposalId = newId("spr");
  if (proposal.replaces) {
    if (openId === null) throw new Fault("settle_change_7", "schedule: the rule replaced a pick that isn't open");
    // The open pick first: a club has one open proposal. `replaced_by` is checked at commit.
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1,
             replaced_by = ${proposalId}
       WHERE id = ${openId}`;
  }
  await bound(tx)`
    INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, created_at)
    VALUES (${proposalId}, ${clubId}, 'membership_change', ${today.toString()}::pg_catalog.date,
            ${String(proposal.daysPerMember)}::pg_catalog.int2, ${at}::pg_catalog.timestamptz)`;
  await writeHolds(tx, proposalId, clubId, proposal.proposed);
  return change;
}
