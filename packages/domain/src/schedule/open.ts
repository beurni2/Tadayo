/// <reference lib="esnext.temporal" />
// Opening a club's first days (spec 04: "On activation, propose the appropriate calendar and let each
// member confirm their days"; spec 05's table; T1, T6; FQ48, FQ61, FQ98, FQ102, FQ123, FQ124). The command
// that starts a club calls it in its transaction (../clubs/apply-roster.ts), and so does the rule for a
// change of members when a club starts again (./settle.ts).
//
// Under the club's row lock, which every schedule command of the club takes first: the week the confirmed
// days will join, the proposal at version 1, a row for each active member, and their proposed days, each
// held by proposal until they choose (FQ48). Members are in the order they joined, two who joined at the
// same instant by their interval's id, byte by byte, the order `loadWeek` reads them in.
//
// The first time, the week is the schedule's first version, from the club's first local date (the date of
// the clock's sample, taken after the lock, in the club's zone).
//
// Again, for a club whose every first days ended with no successor (FQ102: "the join that restarts the
// club opens new first days"; FQ123): the club's latest week is used again when no day was confirmed in
// it. When one was, by a member who has left since, that day's dates are made weeks ahead and stay as
// they are (FQ63), and the new week starts only after every day already made (FQ61, kept here since
// migration 0015): it starts on the latest of the club's local date, the day
// after the last day made, and the day after the earlier week's start (FQ124). A day confirmed in it
// first opens no earlier (./confirm-days.ts).
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
  /** The start of the week the confirmed days join: the first time, the club's first local date. */
  readonly effectiveFrom: string;
}

interface LatestWeek {
  readonly id: string;
  readonly effectiveFrom: string;
  /** A day was confirmed in it. */
  readonly confirmed: boolean;
  /** The last local date of a day made for the club, or null. */
  readonly lastMade: string | null;
}

/** The club's latest schedule version, under the club's row. */
async function latestWeek(tx: QuerySql, clubId: string): Promise<LatestWeek> {
  const [row] = await bound(tx)`
    SELECT v.id, v.effective_from::pg_catalog.text AS effective_from,
           EXISTS (SELECT FROM app.schedule_assignments a WHERE a.schedule_version_id = v.id) AS confirmed,
           (SELECT pg_catalog.max(o.local_date)::pg_catalog.text FROM app.occurrences o
             WHERE o.club_id = v.club_id) AS last_made
      FROM app.schedule_versions v
     WHERE v.club_id = ${clubId}
     ORDER BY v.effective_from DESC
     LIMIT 1`;
  const id = row?.["id"];
  const effectiveFrom = row?.["effective_from"];
  const confirmed = row?.["confirmed"];
  const lastMade = row?.["last_made"] ?? null;
  if (
    typeof id !== "string" ||
    typeof effectiveFrom !== "string" ||
    typeof confirmed !== "boolean" ||
    (lastMade !== null && typeof lastMade !== "string")
  ) {
    throw new Error("schedule: the club's latest week came back in a shape the schema doesn't allow");
  }
  return { id, effectiveFrom, confirmed, lastMade };
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
           EXISTS (SELECT FROM app.schedule_proposals WHERE club_id = ${clubId}) AS proposed,
           EXISTS (SELECT FROM app.schedule_proposals
                    WHERE club_id = ${clubId}
                      AND (reason <> 'activation' OR state <> 'superseded' OR replaced_by IS NOT NULL)) AS standing`;
  const first = existing?.["scheduled"] === false && existing["proposed"] === false;
  // Again only when every proposal the club has had is first days that ended with no successor.
  const again = existing?.["scheduled"] === true && existing["proposed"] === true && existing["standing"] === false;
  if (!first && !again) {
    throw new Error(
      "schedule: the first days are opened once, for a club with no schedule yet, or again once all before them ended",
    );
  }
  const members = await bound(tx)`
    SELECT interval_id FROM app.memberships
     WHERE club_id = ${clubId} AND state = 'active' ORDER BY joined_at, interval_id COLLATE "C"`;
  // Throws for a roster outside two to six (A01).
  const week = proposedWeek(members.length);
  const perMember = daysPerMember(members.length);

  // The clock, after the lock (T1).
  const at = await clock.sample(tx);
  const today = at.toZonedDateTimeISO(clubTimeZone(timezone)).toPlainDate();
  const latest = first ? null : await latestWeek(tx, clubId);
  let effectiveFrom: string;
  let scheduleVersionId: string;
  if (latest !== null && !latest.confirmed) {
    // No day was confirmed in the club's latest week: the new first days use it.
    ({ id: scheduleVersionId, effectiveFrom } = latest);
  } else {
    let start = today;
    if (latest !== null) {
      // After every day already made, and after the earlier week's own start.
      for (const taken of [latest.effectiveFrom, latest.lastMade]) {
        if (taken === null) continue;
        const next = Temporal.PlainDate.from(taken).add({ days: 1 });
        if (Temporal.PlainDate.compare(next, start) > 0) start = next;
      }
    }
    effectiveFrom = start.toString();
    scheduleVersionId = newId("sched");
    await bound(tx)`
      INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
      VALUES (${scheduleVersionId}, ${clubId}, ${effectiveFrom}::pg_catalog.date, ${at}::pg_catalog.timestamptz)`;
  }
  const proposalId = newId("spr");
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
