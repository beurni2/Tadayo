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
  isPlainLoopback,
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

/**
 * Waits until `count` backends, one unless said, are waiting on a lock `pid` holds, or behind one that
 * is: a second waiter for a row queues behind the first, not behind the row's holder.
 */
export async function waitingOn(db: Db, pid: number, count = 1): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    const [row] = await db<{ waiting: boolean }[]>`
      WITH held AS (
        SELECT a.pid, pg_catalog.pg_blocking_pids(a.pid) AS behind
          FROM pg_catalog.pg_stat_activity a WHERE a.wait_event_type = 'Lock'
      )
      SELECT (SELECT pg_catalog.count(*) FROM held h
               WHERE ${pid}::int4 = ANY (h.behind)
                  OR EXISTS (SELECT FROM held g WHERE g.pid = ANY (h.behind) AND ${pid}::int4 = ANY (g.behind))
             ) >= ${count}::int4 AS waiting`;
    if (row?.waiting === true) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("waitingOn: nothing came to wait for the club's row");
}

/**
 * Fails unless a worker started by the real clock would find no upload to prepare: no pending `upload.prepare` event
 * names an upload that is `preparing` and live by the database's own clock, which such a worker reads. It would
 * fetch that upload's original from the test's stand-in Supabase project, which isn't there. Every upload the other
 * files leave behind was made by a fake clock in November 2026 and has lapsed; this says so before a worker starts.
 */
export async function nothingToPrepare(db: Db): Promise<void> {
  const [row] = await db<{ live: number }[]>`
    SELECT pg_catalog.count(*)::int4 AS live FROM app.outbox_events e
      JOIN app.uploads u ON u.id = e.payload ->> 'upload_id'
     WHERE e.topic = 'upload.prepare' AND e.state = 'pending' AND u.state = 'preparing'
       AND u.expires_at > pg_catalog.clock_timestamp()`;
  if (row?.live !== 0) {
    throw new Error("nothingToPrepare: another file left an upload a started worker would prepare, by the real clock");
  }
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
 * Removes every committed day from the test database, as its superuser, with the one trigger that
 * refuses it (`occurrences_no_delete`, which stops everyone, the API's role included) switched off for
 * the one transaction. Every other rule stays on, the foreign keys among them: a day anything names
 * (a drop, a memory) refuses to go, and the whole removal with it.
 *
 * It runs only against a database on this machine: the admin URL's host must be a plainly written
 * loopback one (the domain's `isPlainLoopback`, the check the connections use), so a test run pointed
 * at a real database by mistake deletes nothing there.
 *
 * A day can't be rolled back once two transactions have to meet over it, and the worker's process
 * commits what it makes, so the files that make days so call this when they end. The ops scripts' tests
 * need a database with no committed day ("no test here may leave one"), in whatever order the files run.
 * Nothing but a test's own day is ever committed here, so all of them go: the worker's process runs a
 * whole pass, which makes days for whatever committed club another file left, so one file's own clubs
 * would not be enough.
 */
export async function forgetCommittedDays(): Promise<void> {
  if (!isPlainLoopback(process.env.DATABASE_ADMIN_URL ?? "")) {
    throw new Error("forgetCommittedDays: DATABASE_ADMIN_URL isn't a database on this machine, so no day is removed");
  }
  const admin = adminSql();
  try {
    await admin.begin(async (tx) => {
      await tx`ALTER TABLE app.occurrences DISABLE TRIGGER occurrences_no_delete`;
      await tx`DELETE FROM app.occurrences`;
      await tx`ALTER TABLE app.occurrences ENABLE TRIGGER occurrences_no_delete`;
    });
  } finally {
    await admin.end();
  }
}
