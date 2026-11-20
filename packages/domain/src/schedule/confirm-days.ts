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
// A membership change's confirmation is of its whole week (FQ56): NOT_ALLOWED unless the weekdays are the
// days it proposes for the caller, who hasn't confirmed it before. It writes the caller's `confirmed_at`,
// the clock's sample taken after the club's lock (T1), and nothing else: `state` and `version` stay, so the
// answer to every member is the same whoever has confirmed (FQ81, T33). It applies at its start, which
// `api/b2-change-start` builds.

import type { QuerySql } from "../authorization/read-sql.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { scheduleCommand, type ScheduleCommandInput } from "./command.ts";
import { everyoneConfirmed, judgeChangeConfirmation, judgeConfirmation } from "./decide.ts";
import { firstDate } from "./first-date.ts";
import { settleChange } from "./settle-change.ts";
import type { ProposalAnswer } from "./week.ts";

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
    if (proposal.reason === "membership_change") {
      if (judgeChangeConfirmation(callerId, proposal.facts, input.weekdays) !== null) throw new Refused("NOT_ALLOWED");
      await bound(tx)`
          UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz
           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;
      return;
    }
    if (proposal.scheduleVersionId === null) throw new Error("schedule: the first days have no week of their own");
    const judged = judgeConfirmation(callerId, proposal.facts, input.weekdays);
    if (judged === "NOT_ALLOWED") throw new Refused("NOT_ALLOWED");
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
    // The last confirmation applies the first days: the facts as they now stand, the caller confirmed.
    const now = {
      ...proposal.facts,
      members: proposal.facts.members.map((member) =>
        member.id === callerId ? { ...member, confirmed: true } : member,
      ),
    };
    if (everyoneConfirmed(now)) {
      await bound(tx)`
          UPDATE app.schedule_proposals
             SET state = 'applied', closed_at = ${at}::pg_catalog.timestamptz, version = version + 1
           WHERE id = ${proposal.id}`;
      await settleChange(tx, at, week.club.id);
    }
  });
}
