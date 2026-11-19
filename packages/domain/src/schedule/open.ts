/// <reference lib="esnext.temporal" />
// Opening a club's first days (spec 04: "On activation, propose the appropriate calendar and let each
// member confirm their days"; spec 05's table; T1, T6; FQ48, FQ98). B1's activation calls it in the
// transaction that starts the club; until B1 only tests do (docs/plans/api-b2-schedule.md, section 0).
//
// Under the club's row lock, which every schedule command of the club takes first: the schedule's first
// version from the club's first local date (the date of the clock's sample, taken after the lock, in the
// club's zone), the proposal at version 1, a row for each active member, and their proposed days, each
// held by proposal until they choose (FQ48). Members are in the order they joined, two who joined at the
// same instant by their interval's id, byte by byte, the order `loadWeek` reads them in.
//
// It refuses by throwing an Error, never `Refused`: no caller of the API reaches it with a request, so a
// club it can't open is the calling command's bug.

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { daysPerMember, proposedWeek } from "./propose.ts";

type Bound<R> = (
  template: TemplateStringsArray,
  ...values: readonly (string | number | boolean | Temporal.Instant)[]
) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface OpenedFirstDays {
  readonly proposalId: string;
  readonly scheduleVersionId: string;
  /** The club's first local date. */
  readonly effectiveFrom: string;
}

/** Opens the first days of `clubId` in `tx`, a READ COMMITTED transaction. */
export async function openFirstDays(tx: QuerySql & ClockSql, clock: Clock, clubId: string): Promise<OpenedFirstDays> {
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new TypeError("schedule: the club is a club id");
  const [club] = await bound(tx)`SELECT timezone FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  if (club === undefined) throw new Error("schedule: no such club to open the first days of");
  const timezone = club["timezone"];
  if (typeof timezone !== "string") throw new Error("schedule: a club came back without its timezone");
  const [existing] = await bound(tx)`
    SELECT EXISTS (SELECT FROM app.schedule_versions WHERE club_id = ${clubId}) AS scheduled,
           EXISTS (SELECT FROM app.schedule_proposals WHERE club_id = ${clubId}) AS proposed`;
  if (existing?.["scheduled"] !== false || existing["proposed"] !== false) {
    throw new Error("schedule: the first days are opened once, for a club with no schedule yet");
  }
  const members = await bound(tx)`
    SELECT interval_id FROM app.memberships
     WHERE club_id = ${clubId} AND state = 'active' ORDER BY joined_at, interval_id COLLATE "C"`;
  // Throws for a roster outside two to six (A01).
  const week = proposedWeek(members.length);
  const perMember = daysPerMember(members.length);

  // The clock, after the lock (T1).
  const at = await clock.sample(tx);
  const effectiveFrom = at.toZonedDateTimeISO(clubTimeZone(timezone)).toPlainDate().toString();
  const scheduleVersionId = newId("sched");
  const proposalId = newId("spr");
  await bound(tx)`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${scheduleVersionId}, ${clubId}, ${effectiveFrom}::pg_catalog.date, ${at}::pg_catalog.timestamptz)`;
  await bound(tx)`
    INSERT INTO app.schedule_proposals
      (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
    VALUES (${proposalId}, ${clubId}, 'activation', ${effectiveFrom}::pg_catalog.date,
            ${perMember}::pg_catalog.int2, ${scheduleVersionId}, ${at}::pg_catalog.timestamptz)`;
  for (const [index, member] of members.entries()) {
    const interval = member["interval_id"];
    const days = week[index];
    if (typeof interval !== "string" || days === undefined) {
      throw new Error("schedule: a member came back without their interval or their proposed days");
    }
    await bound(tx)`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposalId}, ${clubId}, ${interval})`;
    for (const weekday of days) {
      await bound(tx)`
        INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
        VALUES (${proposalId}, ${interval}, ${weekday}::app.weekday, true, true)`;
    }
  }
  return { proposalId, scheduleVersionId, effectiveFrom };
}
