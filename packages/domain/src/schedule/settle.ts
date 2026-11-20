/// <reference lib="esnext.temporal" />
// What a change of a club's members does to its first days, written (spec 04, 05; T1, T6, T33; FQ16,
// FQ55, FQ100, FQ102, FQ123; docs/plans/api-b2-first-days-roster.md, section 3). Every command that starts
// or ends a membership of a club that has started calls it after its own change, in its transaction,
// holding the club's row, with its own sample of the clock taken after that lock (T1):
// ../clubs/apply-roster.ts for the people who join, ../clubs/leave-club.ts for a leave. A club that starts
// opens its first days itself (./open.ts).
//
// Under the club's row nothing of its schedule changes meanwhile: every schedule command takes that row
// first (./command.ts). So the facts are read once, the rule says what follows (./roster-change.ts
// `firstDaysAfter`), and this writes it:
// - a revision: the new members' rows; for a week proposed again, the proposal's next `week_revision`
//   with its `days_per_member`, and every member's proposed days in it, each held; the next `version`;
// - the first days applied, as the last confirmation applies them (./confirm-days.ts);
// - the first days ended, superseded with no successor;
// - new first days (./open.ts).
// When the rule says nothing, nothing is written and no version moves (T33).

import type { QuerySql } from "../authorization/read-sql.ts";
import type { ClockSql, ServerNow } from "../time/clock.ts";
import { openFirstDays } from "./open.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";
import { firstDaysAfter, type FirstDaysChange, type FirstDaysMember } from "./roster-change.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function shape(): Error {
  return new Error("schedule: the club's first days came back in a shape the schema doesn't allow");
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

/**
 * Settles the first days of `clubId` after its members changed, at `at`, in `tx`, a READ COMMITTED
 * transaction that holds the club's row, and says what it did.
 */
export async function settleFirstDays(
  tx: QuerySql & ClockSql,
  at: ServerNow,
  clubId: string,
): Promise<FirstDaysChange["kind"]> {
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new TypeError("schedule: the club is a club id");
  const [row] = await bound(tx)`
    SELECT (SELECT coalesce(pg_catalog.jsonb_agg(m.interval_id ORDER BY m.joined_at, m.interval_id COLLATE "C"),
                            '[]'::pg_catalog.jsonb)
              FROM app.memberships m WHERE m.club_id = c.id AND m.state = 'active') AS active,
           (SELECT pg_catalog.jsonb_build_object(
                     'id', p.id, 'days_per_member', p.days_per_member, 'week_revision', p.week_revision,
                     'members',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'id', pm.interval_id,
                               'active', s.state = 'active',
                               'confirmed', pm.confirmed_at IS NOT NULL,
                               'held',
                               (SELECT coalesce(pg_catalog.jsonb_agg(d.weekday), '[]'::pg_catalog.jsonb)
                                  FROM app.schedule_proposal_days d
                                 WHERE d.proposal_id = pm.proposal_id AND d.interval_id = pm.interval_id
                                   AND d.week_revision = p.week_revision AND d.held))),
                             '[]'::pg_catalog.jsonb)
                        FROM app.schedule_proposal_members pm
                        JOIN app.memberships s ON s.interval_id = pm.interval_id
                       WHERE pm.proposal_id = p.id))
              FROM app.schedule_proposals p
             WHERE p.club_id = c.id AND p.state = 'open' AND p.reason = 'activation') AS open,
           EXISTS (SELECT FROM app.schedule_proposals p WHERE p.club_id = c.id AND p.state = 'open') AS any_open,
           EXISTS (SELECT FROM app.schedule_proposals p WHERE p.club_id = c.id)
             AND NOT EXISTS (SELECT FROM app.schedule_proposals p
                              WHERE p.club_id = c.id
                                AND (p.reason <> 'activation' OR p.state <> 'superseded'
                                     OR p.replaced_by IS NOT NULL)) AS ended
      FROM app.clubs c
     WHERE c.id = ${clubId}`;
  if (row === undefined) throw new Error("schedule: no such club to settle the first days of");
  const active = list(row["active"]).map(text);
  const found = row["open"] === null ? null : record(row["open"]);
  // An open membership change is `api/b2-membership-change`'s: nothing of the first days is open then.
  if (found === null && flag(row["any_open"])) return "nothing";
  const perMember = found?.["days_per_member"];
  if (found !== null && perMember !== 1 && perMember !== 2) throw shape();
  const members =
    found === null
      ? []
      : list(found["members"]).map((item): FirstDaysMember => {
          const member = record(item);
          return {
            id: text(member["id"]),
            active: flag(member["active"]),
            confirmed: flag(member["confirmed"]),
            held: list(member["held"]).map(weekday),
          };
        });
  const change = firstDaysAfter({
    active,
    open: found === null ? null : { daysPerMember: perMember === 1 ? 1 : 2, members },
    endedWithoutSuccessor: flag(row["ended"]),
  });
  if (change.kind === "nothing") return change.kind;
  if (change.kind === "open") {
    await openFirstDays(tx, { sample: () => Promise.resolve(at) }, clubId);
    return change.kind;
  }
  if (found === null) throw new Error("schedule: the rule changed first days that aren't open");
  const proposalId = text(found["id"]);

  if (change.kind === "apply") {
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'applied', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
       WHERE id = ${proposalId}`;
    return change.kind;
  }
  if (change.kind === "end") {
    await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'superseded', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
       WHERE id = ${proposalId}`;
    if (change.reopen) await openFirstDays(tx, { sample: () => Promise.resolve(at) }, clubId);
    return change.kind;
  }

  // A revision. The proposal's row first: a new week exists before any row is written into it.
  const before = found["week_revision"];
  if (typeof before !== "number" || !Number.isSafeInteger(before) || before < 1) throw shape();
  const week = String(change.newWeek ? before + 1 : before);
  await bound(tx)`
    UPDATE app.schedule_proposals
       SET version = version + 1, week_revision = ${week}::pg_catalog.int2,
           days_per_member = ${String(change.daysPerMember)}::pg_catalog.int2
     WHERE id = ${proposalId}`;
  for (const interval of change.added) {
    await bound(tx)`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposalId}, ${clubId}, ${interval})`;
  }
  for (const member of change.proposed) {
    for (const day of member.days) {
      await bound(tx)`
        INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held, week_revision)
        VALUES (${proposalId}, ${member.id}, ${day}::app.weekday, true, true, ${week}::pg_catalog.int2)`;
    }
  }
  return change.kind;
}
