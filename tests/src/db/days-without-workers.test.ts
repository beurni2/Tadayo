/// <reference lib="esnext.temporal" />
// Q18 with the workers stopped (spec 06, 34, 37; T1, T5): "Home is feed until 1 AM then next countdown even
// when opening or closing worker lags." A club's days are made once, as the worker makes them, and then no
// worker runs and no row changes: only the server's clock moves. At each edge of Debby's Friday the club
// list's `open_day` and `next_day` (Home's day choice, FQ103) and the roster's next dates
// (`listMembers`) name the right person and the right date, from the rows and the clock alone.
//
// What Home's own route adds (getHome's feed and countdown fields) is checked the same way when it is
// built; the day choice it will ask is the one read here.

import { listClubs, listMembers, makeDays } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type WorldTx } from "./harness.ts";
import { confirmedWeek, type ConfirmedWeek } from "./week-world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

const at = (text: string) => Temporal.Instant.from(text);
const TIMES = { opened: "2026-11-02T14:00:00Z", confirmed: "2026-11-04T14:00:00Z" };

/** What a member sees of the club at `now`: Home's two days and the roster's next dates. */
async function sight(tx: WorldTx, w: ConfirmedWeek, viewer: number, now: string) {
  const sample = await fakeClock(now).sample(tx);
  const user = w.users[viewer] ?? "";
  const club = (await listClubs(tx, user, sample)).clubs.find((row) => row.id === w.club);
  const roster = await listMembers(tx, user, w.club, sample);
  if (club === undefined || roster === null) throw new Error("the member didn't get the club");
  const day = (found: { star: { displayName: string }; localDate: string; phase: string } | null) =>
    found === null ? null : `${found.star.displayName} ${found.localDate} ${found.phase}`;
  return {
    open: day(club.openDay),
    next: day(club.nextDay),
    nextUp: roster.members.filter((member) => member.nextUp).map((member) => member.person.displayName),
    debbyNext: roster.members.find((member) => member.person.displayName === "Debby")?.nextDay?.localDate ?? null,
    ninaNext: roster.members.find((member) => member.person.displayName === "Nina")?.nextDay?.localDate ?? null,
  };
}

/** Every day's row, whole, as text: nothing may change it once it is made. */
async function rowsOf(tx: WorldTx, club: string): Promise<string> {
  const rows = await tx<{ row: string }[]>`
    SELECT o::text AS row FROM app.occurrences o WHERE o.club_id = ${club} ORDER BY o.local_date`;
  return rows.map((found) => found.row).join("\n");
}

describe("Q18: Home's days and the roster's dates with no worker running (T1, T5)", () => {
  it("moves from Debby's Friday to Nina's Saturday at 7 AM and 1 AM by the clock alone", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      // The worker's last pass: Wednesday, a minute after the last confirmation. Then it is stopped.
      await tx.savepoint((sp) => makeDays(sp, fakeClock("2026-11-04T14:01:00Z"), w.club));
      const made = await rowsOf(tx, w.club);

      // Friday 6 November in New York opens at 12:00Z and closes at 06:00Z on Saturday the 7th.
      const before = {
        open: null,
        next: "Debby 2026-11-06 collecting",
        nextUp: ["Debby"],
        debbyNext: "2026-11-06",
        ninaNext: "2026-11-07",
      };
      const during = {
        open: "Debby 2026-11-06 open",
        next: "Nina 2026-11-07 collecting",
        nextUp: ["Nina"],
        debbyNext: "2026-11-13",
        ninaNext: "2026-11-07",
      };
      const after = {
        open: null,
        next: "Nina 2026-11-07 collecting",
        nextUp: ["Nina"],
        debbyNext: "2026-11-13",
        ninaNext: "2026-11-07",
      };
      for (const viewer of [0, 4, 5]) {
        expect(await sight(tx, w, viewer, "2026-11-06T11:59:59.999999Z")).toEqual(before);
        expect(await sight(tx, w, viewer, "2026-11-06T12:00:00Z")).toEqual(during);
        // Saturday 00:30 in New York: still Debby's day (spec 06's acceptance).
        expect(await sight(tx, w, viewer, "2026-11-07T05:30:00Z")).toEqual(during);
        expect(await sight(tx, w, viewer, "2026-11-07T05:59:59.999999Z")).toEqual(during);
        expect(await sight(tx, w, viewer, "2026-11-07T06:00:00Z")).toEqual(after);
        // Saturday at 7 AM Nina's day opens, and Monday's is next: Sunday has none (T6).
        expect(await sight(tx, w, viewer, "2026-11-07T12:00:00Z")).toEqual({
          open: "Nina 2026-11-07 open",
          next: "Ben 2026-11-09 collecting",
          nextUp: ["Ben"],
          debbyNext: "2026-11-13",
          ninaNext: "2026-11-14",
        });
        // Sunday at noon: nothing is open, and Monday's is still next.
        expect(await sight(tx, w, viewer, "2026-11-08T17:00:00Z")).toMatchObject({
          open: null,
          next: "Ben 2026-11-09 collecting",
        });
      }
      // Nothing wrote a day meanwhile: the rows are as the last pass left them.
      expect(await rowsOf(tx, w.club)).toBe(made);
    });
  });

  it("goes on for as long as days were made, then shows no next date instead of inventing one (T49)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await tx.savepoint((sp) => makeDays(sp, fakeClock("2026-11-04T14:01:00Z"), w.club));
      // The last day made on Wednesday the 4th is Saturday 5 December, the end of the fourth week after
      // that one (FQ115).
      expect(await sight(tx, w, 0, "2026-12-04T17:00:00Z")).toMatchObject({
        open: "Debby 2026-12-04 open",
        next: "Nina 2026-12-05 collecting",
        nextUp: ["Nina"],
      });
      expect(await sight(tx, w, 0, "2026-12-05T12:00:00Z")).toEqual({
        open: "Nina 2026-12-05 open",
        next: null,
        nextUp: [],
        debbyNext: null,
        ninaNext: null,
      });
      expect(await sight(tx, w, 0, at("2026-12-06T06:00:00Z").toString())).toMatchObject({ open: null, next: null });
    });
  });
});
