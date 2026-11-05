// The right person and the right date (CLAUDE.md, what matters most, 2): a day is made only for
// the star whose weekday it is in the week in force on its date (T6, FQ61), never on a Sunday,
// never for someone who has left (FQ63), and once announced it never moves (T4, T6). Its status
// can only deny it (T9).

import { afterAll, describe, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, leave, newId, newWorld, type World } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

function day(tx: Tx, w: World, star: string, date: string, version = w.version) {
  const reveal = new Date(`${date}T07:00:00Z`);
  const close = new Date(reveal.getTime() + 18 * 3600e3);
  return tx`
    INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
    VALUES (${newId("occ")}, ${w.club}, ${star}, ${version}, ${date}, ${reveal}, ${close}, ${AT.generated})
  `;
}

/** A second week from Monday 9 November, in which Ana keeps Saturday from the 14th. */
async function secondWeek(tx: Tx, w: World, firstDate = "2026-11-14"): Promise<string> {
  const version = newId("sched");
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${w.club}, '2026-11-09', ${AT.added})
  `;
  await tx`
    INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
    VALUES (${version}, ${w.club}, 'saturday', ${w.ana.interval}, ${firstDate}, ${AT.added})
  `;
  return version;
}

describe("T6 and FQ61: a day for the right star, from the week in force", () => {
  it("makes Ana's next Saturday from the week in force on it", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const version = await secondWeek(tx, w);
      await day(tx, w, w.ana.interval, "2026-11-14", version);
    });
  });

  it("refuses a day for a star whose weekday it isn't", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => day(sp, w, w.ben.interval, "2026-11-14"),
        /isn't .*'s day in its schedule \(T6\)/,
      );
    });
  });

  it("refuses a day before the weekday's first date", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const version = await secondWeek(tx, w, "2026-11-21");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => day(sp, w, w.ana.interval, "2026-11-14", version),
        /'s day in its schedule \(T6\)/,
      );
    });
  });

  it("refuses a day from a week that isn't in force on its date", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await secondWeek(tx, w);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => day(sp, w, w.ana.interval, "2026-11-14"),
        /isn't in force on 2026-11-14 \(FQ61\)/,
      );
    });
  });

  it("refuses a new week that would move a day already announced", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
          VALUES (${newId("sched")}, ${w.club}, '2026-11-07', ${AT.added})
        `,
        /would move a day already announced \(FQ61\)/,
      );
    });
  });

  it("refuses a Sunday, and an assignment whose first date isn't its weekday", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(tx, REFUSED.check, (sp) => day(sp, w, w.ana.interval, "2026-11-08"), /local_date_check/);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
          VALUES (${w.version}, ${w.club}, 'monday', ${w.ben.interval}, '2026-11-10', ${AT.added})
        `,
        /schedule_assignments_check/,
      );
    });
  });

  it("refuses a day for a star who has left (FQ63)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const version = await secondWeek(tx, w);
      await leave(tx, w.ana, "Ana", AT.added);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => day(sp, w, w.ana.interval, "2026-11-14", version),
        /no longer a member, so no day is made for them \(FQ63\)/,
      );
    });
  });

  it("refuses instants out of order", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const version = await secondWeek(tx, w);
      const insert = (sp: Tx, close: Date, collecting: Date) => sp`
        INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
        VALUES (${newId("occ")}, ${w.club}, ${w.ana.interval}, ${version}, '2026-11-14',
                '2026-11-14T07:00:00Z', ${close}, ${collecting})
      `;
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => insert(sp, new Date("2026-11-14T07:00:00Z"), AT.generated),
        /"occurrences_check"/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => insert(sp, new Date("2026-11-15T01:00:00Z"), new Date("2026-11-14T07:00:00Z")),
        /"occurrences_check1"/,
      );
    });
  });
});

describe("T4 and T6: an announced day never moves", () => {
  it("never changes a day's date, star, week or instants, and never deletes it", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (const [column, statement] of [
        ["reveal_at", (sp: Tx) => sp`UPDATE app.occurrences SET reveal_at = ${AT.opened} WHERE id = ${w.day}`],
        [
          "close_at",
          (sp: Tx) =>
            sp`UPDATE app.occurrences SET close_at = ${new Date(AT.close.getTime() + 3600e3)} WHERE id = ${w.day}`,
        ],
        ["local_date", (sp: Tx) => sp`UPDATE app.occurrences SET local_date = '2026-11-14' WHERE id = ${w.day}`],
        [
          "star_interval_id",
          (sp: Tx) => sp`UPDATE app.occurrences SET star_interval_id = ${w.ben.interval} WHERE id = ${w.day}`,
        ],
        [
          "schedule_version_id",
          (sp: Tx) => sp`UPDATE app.occurrences SET schedule_version_id = ${newId("sched")} WHERE id = ${w.day}`,
        ],
        [
          "collecting_from",
          (sp: Tx) => sp`UPDATE app.occurrences SET collecting_from = ${AT.created} WHERE id = ${w.day}`,
        ],
      ] as const) {
        await expectRefused(tx, REFUSED.integrity, statement, new RegExp(`app\\.occurrences\\.${column} can't change`));
      }
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.occurrences WHERE id = ${w.day}`,
        /a day is never deleted/,
      );
    });
  });

  it("never changes an announced week or a confirmed weekday", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_versions SET effective_from = '2026-11-03' WHERE id = ${w.version}`,
        /an announced week never changes/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_assignments SET star_interval_id = ${w.ben.interval}
           WHERE schedule_version_id = ${w.version} AND weekday = 'saturday'
        `,
        /a confirmed day never changes/,
      );
    });
  });
});

describe("T9: a day's status only denies it", () => {
  it("suspends and cancels a day, and never brings a cancelled one back", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${w.day}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.occurrences SET status = 'scheduled' WHERE id = ${w.day}`,
        /a day goes from suspended to scheduled/,
      );
      await tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${w.day}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.occurrences SET status = 'scheduled' WHERE id = ${w.day}`,
        /a day goes from cancelled to scheduled/,
      );
    });
  });

  it("stores no phase: collecting, open and past aren't statuses (T1, T5)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const version = await secondWeek(tx, w);
      for (const phase of ["collecting", "open", "past", "held"]) {
        await expectRefused(
          tx,
          REFUSED.check,
          (sp) => sp`
            INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                         collecting_from, status)
            VALUES (${newId("occ")}, ${w.club}, ${w.ana.interval}, ${version}, '2026-11-14', '2026-11-14T07:00:00Z',
                    '2026-11-15T01:00:00Z', ${AT.added}, ${phase})
          `,
          /occurrences_status_check/,
        );
      }
    });
  });
});
