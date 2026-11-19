/// <reference lib="esnext.temporal" />
// Clubs with a week, for the tests of the days a week makes and of the roster (make-days.test.ts,
// members.test.ts, days-without-workers.test.ts): made the way the product makes them, through
// `openFirstDays` and each member's own confirmation (packages/domain/src/schedule/), never by writing a
// week's rows here. The helpers that hold a club's row and count a clock's samples are the method of
// schedule-commands.test.ts's lock-order tests.

import { randomUUID } from "node:crypto";
import {
  chooseScheduleDays,
  confirmScheduleDays,
  openFirstDays,
  proposedWeek,
  type Json,
  type Weekday,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import type postgres from "postgres";
import { adminSql, type Tx, type WorldTx, type WorldTypes } from "./harness.ts";
import { AT, checkAsAtCommit, joinByRoster, newId, newUser } from "./world.ts";

const plain = (tx: WorldTx) => tx as unknown as Tx;

/** Sunday people's names, in the order they joined (the contract's fixtures). */
export const NAMES = ["Ben", "Maya", "Alex", "Sam", "Debby", "Nina"] as const;

export interface WeekClub {
  club: string;
  /** The members' accounts and intervals, in the order they joined. */
  users: string[];
  members: string[];
}

export interface ConfirmedWeek extends WeekClub {
  proposal: string;
  version: string;
  /** Each member's days, the members in the order they joined. */
  days: readonly (readonly Weekday[])[];
}

/** An activated club of `count`, each member joined a minute after the one before, with no schedule yet. */
export async function clubOf(tx: WorldTx, count: number, timezone = "America/New_York"): Promise<WeekClub> {
  const users: string[] = [];
  for (let index = 0; index < count; index += 1) users.push(await newUser(plain(tx), NAMES[index] ?? "Zed"));
  const [creator, ...others] = users;
  if (creator === undefined) throw new Error("clubOf: no creator");
  const club = newId("club");
  const first = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, 'Sunday people', ${timezone}, ${first}, ${AT.created})`;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${first}, ${club}, ${creator}, 'creator', ${AT.created})`;
  const members = [first];
  for (const [index, user] of others.entries()) {
    const [joined] = await joinByRoster(
      plain(tx),
      club,
      { user: creator, interval: first },
      [{ user, label: NAMES[index + 1] ?? "Zed" }],
      new Date(AT.joined.getTime() + index * 60_000),
    );
    if (joined === undefined) throw new Error("clubOf: nobody joined");
    members.push(joined);
  }
  await tx`UPDATE app.clubs SET activated_at = ${new Date(AT.joined.getTime() + 3_600_000)} WHERE id = ${club}`;
  return { club, users, members };
}

const render = (proposal: unknown): Json => JSON.parse(JSON.stringify(proposal)) as Json;

/** The proposal's version now: what a member who has just read it sends as `expected_version`. */
async function versionOf(tx: WorldTx, proposal: string): Promise<number> {
  const [row] = await tx<{ version: number }[]>`SELECT version FROM app.schedule_proposals WHERE id = ${proposal}`;
  if (row === undefined) throw new Error("versionOf: no such proposal");
  return row.version;
}

/** One request as the route runs it: its own unit of work, then the checks Postgres keeps for COMMIT. */
async function request(
  command: typeof confirmScheduleDays,
  tx: WorldTx,
  clock: FakeClock,
  w: ConfirmedWeek,
  who: number,
  weekdays: readonly Weekday[],
): Promise<void> {
  const userId = w.users[who];
  if (userId === undefined) throw new Error("request: no such member");
  const expectedVersion = await versionOf(tx, w.proposal);
  await tx.savepoint((sp) =>
    command(sp, clock, { userId, key: randomUUID(), proposalId: w.proposal, expectedVersion, weekdays }, render),
  );
  await checkAsAtCommit(plain(tx));
}

/** The member at `who` chooses `weekdays`, at `clock`'s time. */
export function chooseOwn(tx: WorldTx, clock: FakeClock, w: ConfirmedWeek, who: number, weekdays: readonly Weekday[]) {
  return request(chooseScheduleDays, tx, clock, w, who, weekdays);
}

/** The member at `who` confirms `weekdays`, by default the days the first days proposed for them, at `clock`'s time. */
export function confirmOwn(
  tx: WorldTx,
  clock: FakeClock,
  w: ConfirmedWeek,
  who: number,
  weekdays: readonly Weekday[] | undefined = w.days[who],
) {
  if (weekdays === undefined) throw new Error("confirmOwn: no such member");
  return request(confirmScheduleDays, tx, clock, w, who, weekdays);
}

/**
 * A club of `count` whose first days were opened at `opened` and confirmed at `confirmed` by the members
 * `who` names (everyone by default, which applies the first days), each taking the days proposed.
 */
export async function confirmedWeek(
  tx: WorldTx,
  count: number,
  at: { readonly opened: string; readonly confirmed: string },
  options: { readonly timezone?: string; readonly who?: readonly number[] } = {},
): Promise<ConfirmedWeek> {
  const made = await clubOf(tx, count, options.timezone);
  const opened = await openFirstDays(tx, fakeClock(at.opened), made.club);
  await checkAsAtCommit(plain(tx));
  const w = { ...made, proposal: opened.proposalId, version: opened.scheduleVersionId, days: proposedWeek(count) };
  const clock = fakeClock(at.confirmed);
  for (const who of options.who ?? made.members.map((_, index) => index)) await confirmOwn(tx, clock, w, who);
  return w;
}

type Db = postgres.Sql<WorldTypes>;

/** Holds `club`'s row in another transaction until `release` is called; resolves once it is held. */
export async function holding(db: Db, club: string): Promise<{ pid: number; release: () => Promise<void> }> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held: (pid: number) => void = () => undefined;
  const taken = new Promise<number>((resolve) => (held = resolve));
  const done = db.begin(async (tx) => {
    const [row] = await tx<{ pid: number }[]>`
      SELECT pg_catalog.pg_backend_pid() AS pid FROM app.clubs WHERE id = ${club} FOR UPDATE`;
    if (row === undefined) throw new Error("holding: no such club");
    held(row.pid);
    await released;
  });
  return {
    pid: await taken,
    release: async () => {
      release();
      await done;
    },
  };
}

/** Waits until some backend is waiting on a lock `pid` holds. */
export async function waitingOn(db: Db, pid: number): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    const [row] = await db<{ waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM pg_catalog.pg_stat_activity a WHERE ${pid}::int4 = ANY (pg_catalog.pg_blocking_pids(a.pid))
      ) AS waiting`;
    if (row?.waiting === true) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("waitingOn: nothing came to wait for the club's row");
}

/** A clock at `at` that counts its samples. */
export function counting(at: string): { clock: FakeClock; samples: () => number } {
  const base = fakeClock(at);
  let samples = 0;
  const clock: FakeClock = {
    ...base,
    async sample(sql) {
      samples += 1;
      return base.sample(sql);
    },
  };
  return { clock, samples: () => samples };
}

/**
 * Removes every committed day from the test database, as its superuser, with the table's own guards set
 * aside for the one statement (`occurrences_no_delete` refuses everyone else, the API's role included).
 *
 * A day can't be rolled back once two transactions have to meet over it, and the worker's process
 * commits what it makes, so the files that make days so call this when they end. The ops scripts' tests
 * need a database with no committed day ("no test here may leave one"), in whatever order the files run.
 * Nothing but a test's own day is ever committed here, so all of them go.
 */
export async function forgetCommittedDays(): Promise<void> {
  const admin = adminSql();
  try {
    await admin.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`DELETE FROM app.occurrences`;
    });
  } finally {
    await admin.end();
  }
}
