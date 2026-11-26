/// <reference lib="esnext.temporal" />
// `tools/ops`' `spike-time`, database half, against Postgres as `tadayo_app` (docs/plans/
// api-b0-spike-time.md, sections 5 and 6): the club the live run writes on `dev` goes in whole through
// the schema's guards, its instants are stored to the microsecond, and what the run expects each
// answer to be is what the API's own day choice and serializer give on those rows. Everything is
// written inside transactions that roll back, so nothing here is left for another test; the run's
// steps around it are tools/ops/src/spike-time.test.ts, on fakes.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clubListBody } from "@tadayo/api";
import { contractInstant, dayInstants, listClubs, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import {
  canonical,
  connectionOptions,
  expectedClubList,
  moveClock,
  OpsError,
  writeClub,
  ZONE,
  type SpikeAccount,
} from "@tadayo/ops";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, rolledBack, worldSql, type Tx } from "./harness.ts";

const MAKE_SQL = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "tools", "ops", "sql", "dev_clock.sql"),
  "utf8",
);

const app = appSql();
const world = worldSql();
afterAll(async () => {
  await Promise.all([app.end(), world.end()]);
});

/** Monday 16 November 2026, 06:50:00.123456 in New York: the first day is that Monday. */
const SAMPLE = Temporal.Instant.from("2026-11-16T11:50:00.123456Z");
const RUN = "1a2b3c4d-0000-4000-8000-000000000000";

/** An account as the API makes and `PATCH /v1/me` finishes it: a subject, the name Ana, its age confirmed. */
async function apiAccount(tx: Tx, over: { name?: string | null; age?: boolean } = {}): Promise<SpikeAccount> {
  const id = `acct_${randomUUID().replaceAll("-", "")}`;
  const subject = randomUUID();
  const name = over.name === undefined ? "Ana" : over.name;
  const age = over.age ?? true;
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${id}, ${subject}::pg_catalog.uuid,
            ${age ? "2026-11-16T11:49:00Z" : null}::pg_catalog.text::pg_catalog.timestamptz, ${name},
            '2026-11-16T11:48:00Z'::pg_catalog.text::pg_catalog.timestamptz)`;
  return { id, subject };
}

const microseconds = (instant: Temporal.Instant) => (instant.epochNanoseconds / 1000n).toString();

describe("spike-time's club, written as tadayo_app", () => {
  it("uses a connection with the ops scripts' types, which are postgres.js's own: none of the time module's", () => {
    const options = connectionOptions(
      "postgresql://tadayo_app.abcdefghijklmnopqrst:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres" as Parameters<
        typeof connectionOptions
      >[0],
      (line) => line,
      () => undefined,
    );
    expect("types" in options).toBe(false);
  });

  it("goes in whole through the schema's guards, its deferred checks included, with its instants to the microsecond", async () => {
    await rolledBack(app, async (tx) => {
      const account = await apiAccount(tx);
      const club = await writeClub(tx, { run: RUN, account, clock: fakeClock(SAMPLE) });
      await tx`SET CONSTRAINTS ALL IMMEDIATE`;

      expect(club.name).toBe("S5 1a2b3c4d");
      expect(club.timezone).toBe(ZONE);
      expect(club.first.localDate.toString()).toBe("2026-11-16");
      expect(club.second.localDate.toString()).toBe("2026-11-17");
      const monday = dayInstants(Temporal.PlainDate.from("2026-11-16"), ZONE);
      expect(club.first.revealAt.equals(Temporal.Instant.from("2026-11-16T12:00:00Z"))).toBe(true);
      expect(club.first.closeAt.equals(Temporal.Instant.from("2026-11-17T06:00:00Z"))).toBe(true);
      expect(club.first.revealAt.equals(monday.revealAt)).toBe(true);

      const [row] = await tx<
        { name: string; zone: string; activated: string; members: string; roster: string; candidates: string }[]
      >`
        SELECT c.name, c.timezone AS zone,
               (extract(epoch FROM c.activated_at) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text AS activated,
               (SELECT pg_catalog.string_agg(u.display_name || ':' || m.origin || ':' || m.state, ',' ORDER BY m.origin)
                  FROM app.memberships m JOIN app.users u ON u.id = m.user_id WHERE m.club_id = c.id) AS members,
               (SELECT pg_catalog.string_agg(r.state || ':' || r.version::pg_catalog.text, ',')
                  FROM app.roster_revisions r WHERE r.club_id = c.id) AS roster,
               (SELECT pg_catalog.string_agg(cd.state || ':' ||
                         (extract(epoch FROM cd.ended_at) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text, ',')
                  FROM app.candidates cd WHERE cd.club_id = c.id) AS candidates
          FROM app.clubs c WHERE c.id = ${club.id}`;
      // Ben's candidate has joined, so Ben's club list holds the club and no invitation still open (listClubs
      // leaves out an invitation once its candidate has joined), as joinByRoster leaves a world.
      expect(row).toEqual({
        name: "S5 1a2b3c4d",
        zone: ZONE,
        activated: microseconds(SAMPLE),
        members: "Ana:creator:active,Ben:roster:active",
        roster: "applied:2",
        candidates: `joined:${microseconds(SAMPLE)}`,
      });
      const creator = await tx<{ user_id: string; interval_id: string }[]>`
        SELECT user_id, interval_id FROM app.memberships WHERE club_id = ${club.id} AND origin = 'creator'`;
      expect(creator).toEqual([{ user_id: account.id, interval_id: club.membershipId }]);

      // A pair's four days: Ana Monday and Wednesday, Ben Tuesday and Thursday, from the week's start.
      const week = await tx<{ weekday: string; star: string; first_date: string }[]>`
        SELECT a.weekday::pg_catalog.text AS weekday, u.display_name AS star, a.first_date::pg_catalog.text AS first_date
          FROM app.schedule_assignments a
          JOIN app.schedule_versions v ON v.id = a.schedule_version_id
          JOIN app.memberships m ON m.interval_id = a.star_interval_id
          JOIN app.users u ON u.id = m.user_id
         WHERE a.club_id = ${club.id} AND v.effective_from = '2026-11-16'
         ORDER BY a.first_date`;
      expect(week).toEqual([
        { weekday: "monday", star: "Ana", first_date: "2026-11-16" },
        { weekday: "tuesday", star: "Ben", first_date: "2026-11-17" },
        { weekday: "wednesday", star: "Ana", first_date: "2026-11-18" },
        { weekday: "thursday", star: "Ben", first_date: "2026-11-19" },
      ]);

      const days = await tx<{ id: string; star: string; date: string; reveal: string; close: string; from: string }[]>`
        SELECT o.id, o.star_interval_id AS star, o.local_date::pg_catalog.text AS date,
               (extract(epoch FROM o.reveal_at) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text AS reveal,
               (extract(epoch FROM o.close_at) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text AS close,
               (extract(epoch FROM o.collecting_from) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text AS "from"
          FROM app.occurrences o WHERE o.club_id = ${club.id} AND o.status = 'scheduled' ORDER BY o.local_date`;
      expect(days).toEqual(
        [club.first, club.second].map((day) => ({
          id: day.id,
          star: day.star.membershipId,
          date: day.localDate.toString(),
          reveal: microseconds(day.revealAt),
          close: microseconds(day.closeAt),
          from: microseconds(SAMPLE),
        })),
      );
      expect(club.second.star.displayName).toBe("Ben");
    });
  });

  it("refuses an account that isn't the run's own, finished as the API finishes it and active, and writes nothing", async () => {
    await rolledBack(app, async (tx) => {
      const unnamed = await apiAccount(tx, { name: null, age: false });
      const unconfirmed = await apiAccount(tx, { name: null, age: true });
      const other = await apiAccount(tx, { name: "Nina" });
      const ana = await apiAccount(tx);
      // Ana as the API finished it, then asked to delete: no longer an active account.
      const deleting = await apiAccount(tx);
      await tx`
        UPDATE app.users SET state = 'deleting',
               deletion_requested_at = '2026-11-16T11:49:30Z'::pg_catalog.text::pg_catalog.timestamptz
         WHERE id = ${deleting.id}`;
      for (const account of [unnamed, unconfirmed, other, { id: ana.id, subject: randomUUID() }, deleting]) {
        await expect(writeClub(tx, { run: RUN, account, clock: fakeClock(SAMPLE) })).rejects.toThrow(OpsError);
      }
      const [row] = await tx<{ n: string }[]>`
        SELECT pg_catalog.count(*)::pg_catalog.text AS n FROM app.clubs WHERE name = 'S5 1a2b3c4d'`;
      expect(row?.n).toBe("0");
    });
  });

  it("refuses a clock outside the run's start window, between 06:45 and 06:57 in New York on a weekday, and writes nothing", async () => {
    await rolledBack(app, async (tx) => {
      const ana = await apiAccount(tx);
      const rows = () => tx<{ users: string; clubs: string }[]>`
        SELECT (SELECT pg_catalog.count(*) FROM app.users)::pg_catalog.text AS users,
               (SELECT pg_catalog.count(*) FROM app.clubs)::pg_catalog.text AS clubs`;
      const [before] = await rows();
      for (const outside of ["2026-11-16T11:57:00.000001Z", "2026-11-16T11:44:59Z", "2026-11-21T11:50:00Z"]) {
        await expect(
          writeClub(tx, { run: RUN, account: ana, clock: fakeClock(Temporal.Instant.from(outside)) }),
        ).rejects.toThrow(OpsError);
      }
      const [after] = await rows();
      expect(after).toEqual(before);
    });
  });
});

describe("what spike-time expects, against the API's own day choice and serializer on its rows", () => {
  it("is the club list GET /v1/clubs gives Ana at every instant round both of the day's edges", async () => {
    await rolledBack(world, async (tx) => {
      const account = await apiAccount(tx);
      const club = await writeClub(tx, { run: RUN, account, clock: fakeClock(SAMPLE) });
      const instants: Temporal.Instant[] = [SAMPLE];
      for (const edge of [club.first.revealAt, club.first.closeAt, club.second.revealAt, club.second.closeAt]) {
        for (const offset of [-20_000_000, -1_000_001, -1_000_000, -1, 0, 1, 999_999, 1_000_000]) {
          instants.push(edge.add({ microseconds: offset }));
        }
      }
      const seen = new Set<string>();
      for (const instant of instants) {
        const now = instant as ServerNow;
        const body = clubListBody(now, await listClubs(tx, account.id, now));
        // The answer's server_now is the sample cut to the second, which is all the run is given.
        const expected = expectedClubList(club, Temporal.Instant.from(contractInstant(now)));
        expect(canonical(body), `at ${now.toString()}`).toBe(canonical(expected));
        const [summary] = (body as { clubs: Record<string, { id: string } | undefined>[] }).clubs;
        seen.add(`${summary?.["open_day"]?.id ?? "-"}/${summary?.["next_day"]?.id ?? "-"}`);
      }
      // Each of the run's states is among them: before, open with the next day, between, and after both.
      expect([...seen].sort()).toEqual(
        [
          `-/${club.first.id}`,
          `${club.first.id}/${club.second.id}`,
          `-/${club.second.id}`,
          `${club.second.id}/-`,
          "-/-",
        ].sort(),
      );
    });
  });
});

describe("spike-time's move of dev's clock", () => {
  it("moves it forward in a transaction of its own, says the offsets before and after, and won't move it back", async () => {
    await rolledBack(app, async (tx) => {
      const [any] = await tx<{ any: boolean }[]>`SELECT EXISTS (SELECT FROM app.occurrences) AS any`;
      expect(any?.any, "the test database holds a committed occurrence: no test here may leave one").toBe(false);
      await tx.unsafe(MAKE_SQL);
      // moveClock opens its own transaction; here it is a savepoint of this one, which rolls back.
      const db = { begin: (body: (sp: Tx) => Promise<unknown>) => tx.savepoint(body) } as unknown as postgres.Sql;
      const [now] = await tx<{ us: string }[]>`
        SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8::pg_catalog.text AS us`;
      const postgresNow = Temporal.Instant.fromEpochNanoseconds(BigInt(now?.us ?? "0") * 1000n);
      const first = await moveClock(db, postgresNow.add({ hours: 18 }));
      expect(first.before).toBe(0n);
      expect(first.after).toBeGreaterThan(17n * 3_600_000_000n);
      expect(first.after).toBeLessThanOrEqual(18n * 3_600_000_000n);
      const second = await moveClock(db, postgresNow.add({ hours: 19 }));
      expect(second.before).toBe(first.after);
      expect(second.after).toBeGreaterThan(first.after);
      await expect(moveClock(db, postgresNow.add({ hours: 1 }))).rejects.toThrow(/only moves forward/);
      const [row] = await tx<{ offset: string }[]>`
        SELECT offset_microseconds::pg_catalog.text AS "offset" FROM app.dev_clock`;
      expect(row?.offset).toBe(second.after.toString());
    });
  });
});
