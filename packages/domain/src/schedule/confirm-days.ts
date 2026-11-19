/// <reference lib="esnext.temporal" />
// Confirming the caller's days in a club's first days (the contract's `confirmScheduleDays`; spec 05; T1,
// T6, T33, T49; FQ55, FQ57, FQ79, FQ99): the days the caller saw as theirs, named, so a confirmation never
// confirms days they didn't see. ./command.ts has the steps; this is its rule (./decide.ts
// `judgeConfirmation`) and its change.
//
// - NOT_ALLOWED unless the weekdays are exactly the days the caller holds, `days_per_member` of them, none
//   held by another member too (in a club of two or three, a member whose one day is contested confirms
//   neither, FQ99), and the caller hasn't confirmed before (FQ57).
// - The confirmation's instant is the clock's sample taken after the club's lock (T1). Each day joins the
//   schedule's version with its first date: the first such weekday whose 7 AM in the club's zone is at
//   least 24 elapsed hours after that instant (./first-date.ts, FQ79).
// - The proposal's `version` moves only when its `state` does (T33): when every member it includes who is
//   still active has then confirmed, the first days apply, on this last confirmation.
//
// A membership change's confirmation is of its whole week, which `api/b2-membership-change` builds. None
// exists before that, so this throws for one, which is a 500 and never an answer.

import type { QuerySql } from "../authorization/read-sql.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { scheduleCommand, type ScheduleCommandInput } from "./command.ts";
import { everyoneConfirmed, judgeConfirmation } from "./decide.ts";
import { firstDate } from "./first-date.ts";
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
    if (proposal.reason !== "activation" || proposal.scheduleVersionId === null) {
      throw new Error("schedule: a membership change is confirmed once api/b2-membership-change has built it");
    }
    const judged = judgeConfirmation(callerId, proposal.facts, input.weekdays);
    if (judged === "NOT_ALLOWED") throw new Refused("NOT_ALLOWED");
    await bound(tx)`
        UPDATE app.schedule_proposal_members SET confirmed_at = ${at}::pg_catalog.timestamptz
         WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId}`;
    for (const weekday of judged.days) {
      const opens = firstDate(weekday, at, week.club.timezone).toString();
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
    }
  });
}
