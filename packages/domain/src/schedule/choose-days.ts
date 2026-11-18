/// <reference lib="esnext.temporal" />
// Choosing the caller's days in a club's first days (the contract's `chooseScheduleDays`; spec 05; T6,
// T33; FQ46, FQ48, FQ55, FQ57): the weekdays the caller holds from now on, in place of what they held,
// none to `days_per_member`. ./command.ts has the steps; this is its rule (./decide.ts `judgeChoice`) and
// its change.
//
// - A membership change has no choosing: NOT_ALLOWED.
// - After the caller confirmed, for more days than `days_per_member`, or for a day another member has
//   confirmed: NOT_ALLOWED.
// - Otherwise the caller's rows become the choice: a proposed day they set aside stays as proposed and not
//   held (only they see it so, FQ48), a day that wasn't proposed for them is a row while they hold it. A
//   day another member holds too is then contested, and nobody is moved (FQ55).
// - Only what changes is written, and the proposal's `version` never moves (T33): a choice of the days the
//   caller already holds writes nothing and still answers.

import type { QuerySql } from "../authorization/read-sql.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { scheduleCommand, type ScheduleCommandInput } from "./command.ts";
import { judgeChoice } from "./decide.ts";
import { WEEKDAYS } from "./propose.ts";
import type { ProposalAnswer } from "./week.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | boolean)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** Chooses the caller's days in `tx`, a READ COMMITTED transaction. Throws `Refused`. */
export function chooseScheduleDays(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: ScheduleCommandInput,
  render: (proposal: ProposalAnswer) => Json,
): Promise<Json> {
  return scheduleCommand(tx, clock, "chooseScheduleDays", input, render, async ({ proposal, callerId }) => {
    if (proposal.reason !== "activation") throw new Refused("NOT_ALLOWED");
    const judged = judgeChoice(callerId, proposal.facts, input.weekdays);
    if (judged === "NOT_ALLOWED") throw new Refused("NOT_ALLOWED");
    const caller = proposal.facts.members.find((member) => member.id === callerId);
    if (caller === undefined) throw new Error("schedule: the caller left the proposal under its club's lock");
    for (const weekday of WEEKDAYS) {
      const holds = caller.held.includes(weekday);
      const wanted = judged.held.includes(weekday);
      if (holds === wanted) continue;
      if (caller.suggested.includes(weekday)) {
        await bound(tx)`
          UPDATE app.schedule_proposal_days SET held = ${wanted}::pg_catalog.bool
           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId} AND weekday = ${weekday}::app.weekday`;
      } else if (wanted) {
        await bound(tx)`
          INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
          VALUES (${proposal.id}, ${callerId}, ${weekday}::app.weekday, false, true)`;
      } else {
        await bound(tx)`
          DELETE FROM app.schedule_proposal_days
           WHERE proposal_id = ${proposal.id} AND interval_id = ${callerId} AND weekday = ${weekday}::app.weekday`;
      }
    }
  });
}
