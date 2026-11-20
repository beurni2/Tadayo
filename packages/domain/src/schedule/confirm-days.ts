/// <reference lib="esnext.temporal" />
// Confirming the caller's days in a club's first days or its membership change (the contract's
// `confirmScheduleDays`; spec 05; T1, T6, T33, T49; FQ55 to FQ57, FQ79, FQ81, FQ99). In the first days: the
// days the caller saw as theirs, named, so a confirmation never confirms days they didn't see. ./command.ts
// has the steps; this is its rule (./decide.ts `judgeConfirmation`) and its change.
//
// - NOT_ALLOWED unless the weekdays are exactly the days the caller holds, `days_per_member` of them, none
//   held by another member too (in a club of two or three, a member whose one day is contested confirms
//   neither, FQ99), and the caller hasn't confirmed before (FQ57).
// - The confirmation's instant is the clock's sample taken after the club's lock (T1). Each day joins the
//   schedule's version with its first date: the first such weekday whose 7 AM in the club's zone is at
//   least 24 elapsed hours after that instant (./first-date.ts, FQ79), and no earlier than the start of the
//   week it joins, which is later than the confirmation only for a club that started again after a member
//   who left had confirmed a day (./open.ts, FQ124).
// - The proposal's `version` moves only when its `state` does (T33): when every member it includes who is
//   still active has then confirmed, the first days apply, on this last confirmation.
//
// - The first days' last confirmation may leave a week that isn't the club's members' (a late joiner with
//   no day, FQ100; a day confirmed by a member who has left, FQ102): the membership change for it is
//   proposed in the same transaction (./settle-change.ts).
//
// A new member's confirmation in a membership change takes the same rule on the pick's facts, where every
// day of the week in force is its member's (./view.ts `pickWeekFacts`; FQ125, FQ127). Its days go ahead at
// once, in a new week (FQ130; docs/plans/api-b2-new-member-day.md, section 2):
// - the week starts on the club's local date at the confirmation, or the day after the latest week's start
//   when that is today or later (./change.ts `nextWeekStart`), and holds every day of the latest week whose
//   member is still in the club, as it was, with its own first date, and the caller's days;
// - each of the caller's days first opens on its weekday in the week after the confirmation, at least 24
//   hours on, after the last day of that weekday announced for a member still in the club, and on or after
//   the week's start (./change.ts `newMemberFirstDate`);
// - a day of a member who has left, on that weekday from that first date on, is cancelled: it opens for
//   nobody (T9), and what was added for it stays hidden with its authors (FQ63, FQ129).
// The pick applies, with its next `version`, when every member it includes who is still a member has
// confirmed; until then neither `state` nor `version` moves (T33).

import type { QuerySql } from "../authorization/read-sql.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { newMemberFirstDate, nextWeekStart } from "./change.ts";
import { scheduleCommand, type ScheduleCommandInput } from "./command.ts";
import { everyoneConfirmed, judgeConfirmation } from "./decide.ts";
import { firstDate } from "./first-date.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";
import { settleChange } from "./settle-change.ts";
import type { LoadedProposal, LoadedWeek, ProposalAnswer } from "./week.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** Confirms the caller's days in `tx`, a READ COMMITTED transaction. Throws `Refused`. */
export function confirmScheduleDays(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: ScheduleCommandInput,
  render: (proposal: ProposalAnswer) => Json,
): Promise<Json> {
  return scheduleCommand(tx, clock, "confirmScheduleDays", input, render, async ({ at, week, proposal, callerId }) => {
    const judged = judgeConfirmation(callerId, proposal.facts, input.weekdays);
    if (judged === "NOT_ALLOWED") throw new Refused("NOT_ALLOWED");
    if (proposal.reason === "membership_change") {
      await confirmNewMemberDays(tx, at, week, proposal, callerId, judged.days);
      return;
    }
    if (proposal.scheduleVersionId === null) throw new Error("schedule: the first days have no week of their own");
    const joins = week.versions.find((version) => version.id === proposal.scheduleVersionId);
    if (joins === undefined) throw new Error("schedule: the first days' own week isn't among the club's");
    const start = Temporal.PlainDate.from(joins.effectiveFrom);
    await bound(tx)`
        UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz
         WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;
    for (const weekday of judged.days) {
      const opens = firstDate(weekday, at, week.club.timezone, start).toString();
      await bound(tx)`
          INSERT INTO app.schedule_assignments
            (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
          VALUES (${proposal.scheduleVersionId}, ${week.club.id}, ${weekday}::app.weekday, ${callerId},
                  ${opens}::pg_catalog.date, ${at}::pg_catalog.timestamptz)`;
    }
    if (await applyIfEveryoneConfirmed(tx, at, proposal, callerId)) await settleChange(tx, at, week.club.id);
  });
}

/** Applies the proposal when the caller's confirmation was the last one it waited for, and says so. */
async function applyIfEveryoneConfirmed(
  tx: QuerySql,
  at: ServerNow,
  proposal: LoadedProposal,
  callerId: string,
): Promise<boolean> {
  // The facts as they now stand, the caller confirmed.
  const now = {
    ...proposal.facts,
    members: proposal.facts.members.map((member) => (member.id === callerId ? { ...member, confirmed: true } : member)),
  };
  if (!everyoneConfirmed(now)) return false;
  await bound(tx)`
      UPDATE app.schedule_proposals
         SET state = 'applied', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
       WHERE id = ${proposal.id}`;
  return true;
}

/** A new member's confirmed `days` in the pick `proposal`: the new week, the dates, the cancelled days. */
async function confirmNewMemberDays(
  tx: QuerySql,
  at: ServerNow,
  week: LoadedWeek,
  proposal: LoadedProposal,
  callerId: string,
  days: readonly Weekday[],
): Promise<void> {
  const clubId = week.club.id;
  const zone = week.club.timezone;
  const latest = week.versions.at(-1);
  if (latest === undefined) throw new Error("schedule: a membership change in a club with no week");
  const today = at.toZonedDateTimeISO(clubTimeZone(zone)).toPlainDate();
  const start = nextWeekStart(today, Temporal.PlainDate.from(latest.effectiveFrom));
  await bound(tx)`
      UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz
       WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;
  const versionId = newId("sched");
  await bound(tx)`
      INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
      VALUES (${versionId}, ${clubId}, ${start.toString()}::pg_catalog.date, ${at}::pg_catalog.timestamptz)`;
  // Every day of the latest week whose member is still in the club, as it was.
  await bound(tx)`
      INSERT INTO app.schedule_assignments
        (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      SELECT ${versionId}, a.club_id, a.weekday, a.star_interval_id, a.first_date, a.confirmed_at
        FROM app.schedule_assignments a
        JOIN app.memberships s ON s.interval_id = a.star_interval_id
       WHERE a.schedule_version_id = ${latest.id} AND s.state = 'active'`;
  for (const weekday of days) {
    const isoDay = String(WEEKDAYS.indexOf(weekday) + 1);
    // The last day of this weekday announced for a member still in the club (a day a fourth member freed).
    const [last] = await bound(tx)`
        SELECT pg_catalog.max(o.local_date)::pg_catalog.text AS local_date
          FROM app.occurrences o
          JOIN app.memberships s ON s.interval_id = o.star_interval_id
         WHERE o.club_id = ${clubId} AND o.status <> 'cancelled' AND s.state = 'active'
           AND EXTRACT(isodow FROM o.local_date) = ${isoDay}::pg_catalog.int4`;
    const lastAnnounced = last?.["local_date"];
    const opens = newMemberFirstDate(
      weekday,
      at,
      zone,
      start,
      typeof lastAnnounced === "string" ? Temporal.PlainDate.from(lastAnnounced) : null,
    ).toString();
    await bound(tx)`
        INSERT INTO app.schedule_assignments
          (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${versionId}, ${clubId}, ${weekday}::app.weekday, ${callerId}, ${opens}::pg_catalog.date,
                ${at}::pg_catalog.timestamptz)`;
    // A day of a member who has left, on this weekday from the new member's first date on (FQ129).
    await bound(tx)`
        UPDATE app.occurrences o SET status = 'cancelled'
         WHERE o.club_id = ${clubId} AND o.status <> 'cancelled' AND o.local_date >= ${opens}::pg_catalog.date
           AND EXTRACT(isodow FROM o.local_date) = ${isoDay}::pg_catalog.int4
           AND NOT EXISTS (SELECT FROM app.memberships s
                            WHERE s.interval_id = o.star_interval_id AND s.state = 'active')`;
  }
  await applyIfEveryoneConfirmed(tx, at, proposal, callerId);
}
