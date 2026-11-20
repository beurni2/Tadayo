/// <reference lib="esnext.temporal" />
// A club's week as the database holds it, for one caller (spec 05; T9, T14, T55; FQ75): the club, the
// caller's own membership, every schedule version with its confirmed days, and one proposal with its
// members, what each holds in its current week (`week_revision`: a revision that proposes other days
// writes its week beside the earlier one, which nothing reads; db/migrations/0013_first_days_revision.sql)
// and who has confirmed. It is ONE statement, so one snapshot: a confirmation that
// commits while it runs is in the proposal and in the version, or in neither. The caller is checked in
// the same statement, through the authorization module (`activeMemberships`): anyone the rule gives
// nothing of the club gets no row, and the answer is null.
//
// A person is the contract's Person by FQ75's rule, as Home's days name a star (../authorization/days.ts):
// the account's name while the interval is active, the name it ended with once it has ended; the avatar's
// version only while both the interval and the account are active.
//
// Members are in the order they joined, two who joined at the same instant by their interval's id, byte by
// byte (`COLLATE "C"`), so the order is the same on every database whatever its locale.
//
// A membership change's facts are its members' rows and the club's latest week, whose days are each its
// member's while that member is still in the club (./view.ts `pickWeekFacts`; FQ125, FQ127): one statement
// reads both, so a new member's confirmation, which writes a new week, is in both or in neither.
//
// `answerOf` then makes the proposal one viewer sees: `viewFor`, or `pickViewFor` for a membership change,
// decides which slot carries whom (./view.ts, T55), and this only puts the person in the place of the id
// the view gave. It never adds a name.

import { activeMemberships } from "../authorization/member.ts";
import type { FragmentSql, QuerySql } from "../authorization/read-sql.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";
import { pickViewFor, pickWeekFacts, viewFor, type ProposalMember, type SlotState, type WeekFacts } from "./view.ts";

/** The contract's Person. */
export interface SchedulePerson {
  readonly membershipId: string;
  readonly displayName: string;
  /** The version of the person's avatar, or null when there is none to show. */
  readonly avatarVersion: string | null;
}

export interface LoadedAssignment {
  readonly weekday: Weekday;
  readonly firstDate: string;
  readonly starInterval: string;
  /** Whether the star's membership is still active. */
  readonly starActive: boolean;
  /** Null when the star has no name to show: an account deleted, whose interval kept none (FQ75). */
  readonly person: SchedulePerson | null;
}

export interface LoadedVersion {
  readonly id: string;
  /** The local date it is in force from. */
  readonly effectiveFrom: string;
  /** From Monday. */
  readonly assignments: readonly LoadedAssignment[];
}

export interface LoadedProposal {
  readonly id: string;
  readonly version: number;
  /** The proposed week its rows are read from and written to. */
  readonly weekRevision: number;
  readonly reason: "activation" | "membership_change";
  readonly state: "open" | "applied" | "superseded";
  readonly effectiveFrom: string;
  readonly scheduleVersionId: string | null;
  readonly replacedBy: string | null;
  readonly facts: WeekFacts;
  /**
   * Each member's person, by membership interval, and in a membership change each star's of the latest
   * week; a member with no name to show has no entry.
   */
  readonly people: ReadonlyMap<string, SchedulePerson>;
}

export interface LoadedWeek {
  readonly club: { readonly id: string; readonly name: string; readonly timezone: string };
  /** The caller's own membership interval in the club. */
  readonly membershipId: string;
  /** Every version of the club's schedule, the earliest first. */
  readonly versions: readonly LoadedVersion[];
  /** The proposal asked for, or null when the club has none such. */
  readonly proposal: LoadedProposal | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** A person as jsonb, by FQ75's rule; it names its statement's aliases: `s` the interval, `su` the account. */
export function person<F>(sql: FragmentSql<F>): F {
  return bound(sql)`
    pg_catalog.jsonb_build_object(
      'membership_id', s.interval_id,
      'name', CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END,
      'avatar_version',
      CASE WHEN s.state = 'active' AND su.state = 'active'
           THEN (SELECT up.content_version FROM app.uploads up
                  WHERE up.id = su.avatar_upload_id AND up.state = 'ready') END)`;
}

function shape(): Error {
  return new Error("schedule: the week came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value as unknown[];
}

function date(value: unknown): string {
  const read = text(value);
  if (!DATE.test(read)) throw shape();
  return read;
}

function weekday(value: unknown): Weekday {
  const found = WEEKDAYS.find((day) => day === value);
  if (found === undefined) throw shape();
  return found;
}

function fromMonday<T extends { readonly weekday: Weekday }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday));
}

export function personOf(value: unknown): { readonly id: string; readonly person: SchedulePerson | null } {
  const row = record(value);
  const id = text(row["membership_id"]);
  const name = optionalText(row["name"]);
  return {
    id,
    person:
      name === null
        ? null
        : { membershipId: id, displayName: name, avatarVersion: optionalText(row["avatar_version"]) },
  };
}

function versionOf(value: unknown): LoadedVersion {
  const row = record(value);
  return {
    id: text(row["id"]),
    effectiveFrom: date(row["effective_from"]),
    assignments: fromMonday(
      list(row["assignments"]).map((item): LoadedAssignment => {
        const assignment = record(item);
        const star = personOf(assignment["person"]);
        return {
          weekday: weekday(assignment["weekday"]),
          firstDate: date(assignment["first_date"]),
          starInterval: star.id,
          starActive: flag(assignment["star_active"]),
          person: star.person,
        };
      }),
    ),
  };
}

function proposalOf(value: unknown, versions: readonly LoadedVersion[]): LoadedProposal {
  const row = record(value);
  const reason = row["reason"];
  const state = row["state"];
  const version = row["version"];
  const perMember = row["days_per_member"];
  const weekRevision = row["week_revision"];
  if (reason !== "activation" && reason !== "membership_change") throw shape();
  if (state !== "open" && state !== "applied" && state !== "superseded") throw shape();
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw shape();
  if (perMember !== 1 && perMember !== 2) throw shape();
  if (typeof weekRevision !== "number" || !Number.isSafeInteger(weekRevision) || weekRevision < 1) throw shape();
  const people = new Map<string, SchedulePerson>();
  const members = list(row["members"]).map((item): ProposalMember => {
    const member = record(item);
    const who = personOf(member["person"]);
    if (who.person !== null) people.set(who.id, who.person);
    const days = list(member["days"]).map((day) => {
      const read = record(day);
      return { weekday: weekday(read["weekday"]), suggested: flag(read["suggested"]), held: flag(read["held"]) };
    });
    return {
      id: who.id,
      active: flag(member["active"]),
      confirmed: flag(member["confirmed"]),
      suggested: fromMonday(days.filter((day) => day.suggested)).map((day) => day.weekday),
      held: fromMonday(days.filter((day) => day.held)).map((day) => day.weekday),
    };
  });
  const scheduleVersionId = optionalText(row["schedule_version_id"]);
  let facts: WeekFacts;
  if (reason === "membership_change") {
    // The club's latest week, the last of `versions`: its days are taken, and a confirmed one's date is there.
    const latest = versions.at(-1)?.assignments ?? [];
    for (const assignment of latest) {
      if (assignment.starActive && assignment.person !== null) people.set(assignment.starInterval, assignment.person);
    }
    facts = pickWeekFacts(
      perMember,
      members,
      latest.map((assignment) => ({
        weekday: assignment.weekday,
        star: assignment.starInterval,
        starActive: assignment.starActive,
        firstDate: assignment.firstDate,
      })),
    );
  } else {
    // A confirmed day's first date is its assignment's, in the version the proposal's days join.
    const firstDates: Partial<Record<Weekday, string>> = {};
    for (const assignment of versions.find((each) => each.id === scheduleVersionId)?.assignments ?? []) {
      firstDates[assignment.weekday] = assignment.firstDate;
    }
    facts = { daysPerMember: perMember, members, firstDates };
  }
  return {
    id: text(row["id"]),
    version,
    weekRevision,
    reason,
    state,
    effectiveFrom: date(row["effective_from"]),
    scheduleVersionId,
    replacedBy: optionalText(row["replaced_by"]),
    facts,
    people,
  };
}

/**
 * The week of `clubId` for the account `userId`, with the club's open proposal (`which` is `open`) or the
 * one proposal `which.id` names, if it is the club's. Null when the authorization module gives `userId`
 * nothing of the club, or no club has that id (T14).
 */
export async function loadWeek(
  tx: QuerySql,
  userId: string,
  clubId: string,
  which: "open" | { readonly id: string },
): Promise<LoadedWeek | null> {
  if (typeof clubId !== "string" || !ID.test(clubId)) return null;
  if (which !== "open" && !ID.test(which.id)) return null;
  // postgres.js's tagged template is a fragment inside another query.
  const sql = tx;
  const chosen = which === "open" ? bound(sql)`p.state = 'open'` : bound(sql)`p.id = ${which.id}::pg_catalog.text`;
  const rows = await bound(sql)`
    SELECT c.id, c.name, c.timezone, am.interval_id AS membership_id,
           (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'id', v.id, 'effective_from', v.effective_from,
                     'assignments',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'weekday', a.weekday, 'first_date', a.first_date,
                               'star_active', s.state = 'active', 'person', ${person(sql)})),
                             '[]'::pg_catalog.jsonb)
                        FROM app.schedule_assignments a
                        JOIN app.memberships s ON s.interval_id = a.star_interval_id
                        JOIN app.users su ON su.id = s.user_id
                       WHERE a.schedule_version_id = v.id)) ORDER BY v.effective_from),
                   '[]'::pg_catalog.jsonb)
              FROM app.schedule_versions v WHERE v.club_id = c.id) AS versions,
           (SELECT pg_catalog.jsonb_build_object(
                     'id', p.id, 'version', p.version, 'reason', p.reason, 'state', p.state,
                     'effective_from', p.effective_from, 'days_per_member', p.days_per_member,
                     'week_revision', p.week_revision,
                     'schedule_version_id', p.schedule_version_id, 'replaced_by', p.replaced_by,
                     'members',
                     (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                               'person', ${person(sql)},
                               'active', s.state = 'active',
                               'confirmed', pm.confirmed_at IS NOT NULL,
                               'days',
                               (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                         'weekday', d.weekday, 'suggested', d.suggested, 'held', d.held)),
                                       '[]'::pg_catalog.jsonb)
                                  FROM app.schedule_proposal_days d
                                 WHERE d.proposal_id = pm.proposal_id AND d.interval_id = pm.interval_id
                                   AND d.week_revision = p.week_revision))
                               ORDER BY s.joined_at, s.interval_id COLLATE "C"),
                             '[]'::pg_catalog.jsonb)
                        FROM app.schedule_proposal_members pm
                        JOIN app.memberships s ON s.interval_id = pm.interval_id
                        JOIN app.users su ON su.id = s.user_id
                       WHERE pm.proposal_id = p.id))
              FROM app.schedule_proposals p WHERE p.club_id = c.id AND ${chosen}) AS proposal
      FROM app.clubs c
      JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id
     WHERE c.id = ${clubId}::pg_catalog.text`;
  const [row] = rows;
  if (row === undefined) return null;
  const versions = list(row["versions"]).map(versionOf);
  const membershipId = text(row["membership_id"]);
  return {
    club: { id: text(row["id"]), name: text(row["name"]), timezone: text(row["timezone"]) },
    membershipId,
    versions,
    proposal: row["proposal"] === null ? null : proposalOf(row["proposal"], versions),
  };
}

/** One weekday of a proposal as one viewer gets it: the contract's ScheduleSlot. */
export interface SlotAnswer {
  readonly weekday: Weekday;
  readonly state: SlotState;
  readonly owner?: SchedulePerson;
  readonly holders?: readonly SchedulePerson[];
  readonly heldBy?: SchedulePerson;
  readonly firstDate?: string;
  readonly suggested: boolean;
}

/** A proposal as one viewer gets it: the contract's ScheduleProposal. */
export interface ProposalAnswer {
  readonly id: string;
  readonly version: number;
  readonly reason: "activation" | "membership_change";
  readonly effectiveFrom: string;
  readonly daysPerMember: 1 | 2;
  readonly slots: readonly SlotAnswer[];
  readonly myDays: readonly Weekday[];
  readonly myState: "choosing" | "confirmed";
  readonly state: "open" | "applied" | "superseded";
}

/**
 * The proposal as the member `viewerId` sees it: the caller the week was loaded for. Throws for a viewer
 * the proposal doesn't include (./view.ts).
 */
export function answerOf(proposal: LoadedProposal, viewerId: string): ProposalAnswer {
  const view =
    proposal.reason === "activation" ? viewFor(viewerId, proposal.facts) : pickViewFor(viewerId, proposal.facts);
  // Someone who holds a day is an active member, and an active member has a name (spec 23).
  const named = (id: string): SchedulePerson => {
    const found = proposal.people.get(id);
    if (found === undefined) throw new Error("schedule: a member who holds a day has no name to show");
    return found;
  };
  return {
    id: proposal.id,
    version: proposal.version,
    reason: proposal.reason,
    effectiveFrom: proposal.effectiveFrom,
    daysPerMember: proposal.facts.daysPerMember,
    slots: view.slots.map((slot): SlotAnswer => {
      // A taken day whose owner has no name to show (an account deleted, FQ75) stays taken, nameless.
      const owner = slot.owner === undefined ? undefined : proposal.people.get(slot.owner);
      return {
        weekday: slot.weekday,
        state: slot.state,
        ...(owner === undefined ? {} : { owner }),
        ...(slot.holders === undefined ? {} : { holders: slot.holders.map(named) }),
        ...(slot.heldBy === undefined ? {} : { heldBy: named(slot.heldBy) }),
        ...(slot.firstDate === undefined ? {} : { firstDate: slot.firstDate }),
        suggested: slot.suggested,
      };
    }),
    myDays: view.myDays,
    myState: view.myState,
    state: proposal.state,
  };
}
