/// <reference lib="esnext.temporal" />
// The club's rows of the privacy matrix (B1's first slice: `getClub` and `createClub`, the contract's
// `ClubDetail`; spec 03, 04, 32; T1, T9, T14, T19, T33, T55; FQ16, FQ80): what each role must get, judged
// from the world's rows apart from the statements the routes run.
//
// - Who reads a club: an account that is active, with an active interval in a club that isn't suspended
//   (schedule.ts's `viewerIn`, the rule getSchedule and listMembers are judged by). Everyone else the gate
//   lets through gets the neutral not-found, byte for byte.
// - What: the server's instant in whole seconds; the club with the viewer's own interval, its state
//   (proposed until it has started, paused under two active members, else active: FQ16), its active
//   members counted and its two days (account.ts's `daysOf`, passed in); the roster's version; whether
//   another person can be proposed (the active members and the candidates still open are under six); and
//   the open roster revision's id when there is one. Nothing else: a field beyond these fails the row.
// - Who makes a club: any account the gate lets through. The answer is 201 with the new club as its
//   creator reads it, and the table below sends the bodies the contract refuses first.
//
// The leak scanner reads the same answers for ids and names the viewer may not see; it can't judge a
// state, a count or a version, so these rows do.

import { randomUUID } from "node:crypto";
import type { WorldTx } from "../db/harness.ts";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import type { Answer } from "./scanner.ts";
import { canonical, viewerIn, type ScheduleSeen, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const CLUB_JUDGED: ReadonlySet<string> = new Set(["getClub", "createClub"]);

/** A club holds at most six people, its candidates still open counted (A01, T6). */
const SIX = 6;

/** A club's own rows that the schedule's world doesn't read. */
export interface ClubRosterRows {
  activated: boolean;
  rosterVersion: number;
  /** The candidates of the club whose state is `open`. */
  openCandidates: number;
  /** The open roster revision's id, or null. */
  openRevision: string | null;
}

export type ClubRows = Map<string, ClubRosterRows>;

/** Reads those rows of `clubs` on `db`, a connection of the test's own. */
export async function clubRowsOf(db: WorldTx, clubs: readonly string[]): Promise<ClubRows> {
  const rows = await db<
    { id: string; activated: boolean; roster_version: number; open_candidates: number; open_revision: string | null }[]
  >`
    SELECT c.id, c.activated_at IS NOT NULL AS activated, c.roster_version,
           (SELECT count(*)::int FROM app.candidates k WHERE k.club_id = c.id AND k.state = 'open') AS open_candidates,
           (SELECT r.id FROM app.roster_revisions r WHERE r.club_id = c.id AND r.state = 'open') AS open_revision
      FROM app.clubs c WHERE c.id IN ${db(clubs)}`;
  return new Map(
    rows.map((row) => [
      row.id,
      {
        activated: row.activated,
        rosterVersion: row.roster_version,
        openCandidates: row.open_candidates,
        openRevision: row.open_revision,
      },
    ]),
  );
}

/** A club's two days, each the contract's Occurrence or undefined (account.ts's `daysOf`). */
export type DaysOf = (club: string) => { open?: unknown; next?: unknown };

const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });

/** The contract's ClubDetail of `club` for the account `account` at `now`, or undefined: the neutral not-found. */
export function clubFor(
  world: ScheduleWorld,
  rows: ClubRows,
  club: string,
  account: string | null,
  now: Temporal.Instant,
  daysOf: DaysOf,
): Record<string, unknown> | undefined {
  const viewer = viewerIn(world, club, account);
  const row = world.clubs.get(club);
  const roster = rows.get(club);
  if (viewer === undefined || row === undefined || roster === undefined) return undefined;
  const members = [...world.members.values()].filter((member) => member.club === club && member.active).length;
  const days = daysOf(club);
  return {
    server_now: second(now),
    club: {
      id: club,
      name: row.name,
      timezone: row.timezone,
      my_membership_id: viewer,
      state: !roster.activated ? "proposed" : members < 2 ? "paused" : "active",
      member_count: members,
      ...(days.open === undefined ? {} : { open_day: days.open }),
      ...(days.next === undefined ? {} : { next_day: days.next }),
    },
    roster_version: roster.rosterVersion,
    can_propose: members + roster.openCandidates < SIX,
    ...(roster.openRevision === null ? {} : { open_revision_id: roster.openRevision }),
  };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body);
  } catch {
    return undefined;
  }
}

/** An answer of `status` whose body is `want`, value for value; each field that differs is named. */
export function sameDetail(status: 200 | 201, want: Record<string, unknown>): (answer: Answer) => string[] {
  return (answer) => {
    if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with the club`];
    if (answer.headers["cache-control"] !== "private, no-store") return ["the club without private, no-store"];
    const body = parsed(answer);
    if (!isObject(body)) return ["not the club's ClubDetail"];
    if (canonical(body) === canonical(want)) return [];
    const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
    return keys
      .filter((key) => canonical(body[key]) !== canonical(want[key]))
      .map(
        (key) =>
          `the club's ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`,
      );
  };
}

/** What the club's judge knows of a cell: the schedule's rows, the club's own, the viewer, the instant and the days. */
export interface ClubSeen extends ScheduleSeen {
  rows: ClubRows;
  daysOf: DaysOf;
}

/** getClub's answer for `club` in a cell. */
export function clubExpected(seen: () => ClubSeen, club: string): Expected {
  return (answer) => {
    const { schedule, rows, account, now, daysOf } = seen();
    const want = clubFor(schedule, rows, club, account, now, daysOf);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameDetail(200, want)(answer);
  };
}

/** The id of the club a 201 names, or undefined. */
export function createdClubId(answer: Answer): string | undefined {
  if (answer.status !== 201) return undefined;
  const body = parsed(answer);
  return isObject(body) && isObject(body.club) && typeof body.club.id === "string" ? body.club.id : undefined;
}

const invalid = (field?: string) =>
  pinned(
    400,
    "Bad Request",
    field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
  );

/** createClub's ordinary request (specsFor: a key and no body): the contract refuses it. */
export const CREATE_CLUB_NO_BODY: Answer = invalid();

/** The 400 of a body refused before it was read: no field, and the connection closed (account.ts's `unread`). */
const unread = () => pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}', "close");

const CONFLICT = pinned(409, "Conflict", '{"code":"IDEMPOTENCY_CONFLICT"}');

/** One request sent to `createClub` in a cell. */
export interface CreateClubCase {
  name: string;
  /** The body as sent. */
  body: string;
  /** The `Idempotency-Key` sent; null sends none. */
  key: string | null;
  /** The pinned refusal, or "created": 201 with the new club, or "replay": the bytes of the case before. */
  expected: Answer | "created" | "replay";
}

/**
 * The requests a cell sends `createClub`, in order: what the contract refuses, then one club made, the same
 * request again under its key (the first answer, and no second club: T19), and another body under that key.
 * `clubName` is a name for the new club; the zone is sent in lower case, which the server stores in its own
 * spelling (T2).
 */
export function createClubCases(clubName: string): CreateClubCase[] {
  const key = randomUUID();
  const good = JSON.stringify({ name: clubName, timezone: "america/new_york" });
  const fresh = () => randomUUID();
  return [
    { name: "no Idempotency-Key", body: good, key: null, expected: invalid("Idempotency-Key") },
    { name: "a key that isn't a UUID", body: good, key: "not-a-uuid", expected: invalid("Idempotency-Key") },
    {
      name: "a name the contract refuses",
      body: JSON.stringify({ name: " padded ", timezone: "America/New_York" }),
      key: fresh(),
      expected: invalid("name"),
    },
    {
      name: "a zone nobody keeps",
      body: JSON.stringify({ name: clubName, timezone: "Mars/Olympus_Mons" }),
      key: fresh(),
      expected: invalid("timezone"),
    },
    {
      name: "an offset where a zone goes",
      body: JSON.stringify({ name: clubName, timezone: "+05:00" }),
      key: fresh(),
      expected: invalid("timezone"),
    },
    { name: "no zone", body: JSON.stringify({ name: clubName }), key: fresh(), expected: invalid("timezone") },
    {
      name: "a field the contract doesn't have",
      body: JSON.stringify({ name: clubName, timezone: "America/New_York", cover: "c" }),
      key: fresh(),
      expected: invalid(),
    },
    // This file's own copy of the app's 128 KiB for a route with no limit of its own (app.ts's BODY_LIMIT), so
    // that raising it fails here. The body is refused before it is read: no field, the connection closed.
    {
      name: "a body past the limit",
      body: JSON.stringify({ name: "a".repeat(128 * 1024), timezone: "America/New_York" }),
      key: fresh(),
      expected: unread(),
    },
    { name: "a club", body: good, key, expected: "created" },
    { name: "the same request again under its key", body: good, key, expected: "replay" },
    {
      name: "another body under that key",
      body: JSON.stringify({ name: `${clubName} two`, timezone: "America/New_York" }),
      key,
      expected: CONFLICT,
    },
  ];
}

/**
 * What a new club's answer must say whatever the rows say: the name as sent, the zone in the server's
 * spelling, one member, not started, version 0, room to propose, and no open revision (G01-create).
 */
export function newClubProblems(answer: Answer, clubName: string): string[] {
  const body = parsed(answer);
  const club = isObject(body) && isObject(body.club) ? body.club : undefined;
  if (!isObject(body) || club === undefined) return ["not a new club's ClubDetail"];
  const wanted: [string, unknown, unknown][] = [
    ["name", club.name, clubName],
    ["timezone", club.timezone, "America/New_York"],
    ["state", club.state, "proposed"],
    ["member_count", club.member_count, 1],
    ["roster_version", body.roster_version, 0],
    ["can_propose", body.can_propose, true],
    ["open_revision_id", body.open_revision_id, undefined],
    ["open_day", club.open_day, undefined],
    ["next_day", club.next_day, undefined],
  ];
  return wanted
    .filter(([, got, want]) => got !== want)
    .map(([field, got, want]) => `a new club's ${field} is ${canonical(got)}, not ${canonical(want)}`);
}
