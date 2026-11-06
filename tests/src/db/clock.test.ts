/// <reference lib="esnext.temporal" />
// The server's clock against Postgres, as `tadayo_app` (T1, T3, T53; ADR-013;
// packages/domain/src/time/clock.ts). The dev clock's table is made only inside transactions that
// roll back, as only `dev` has it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dayInstants, prepareClock } from "@tadayo/domain";
import { closedProblems } from "@tadayo/ops";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql, commandSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, commitDrop, newId, newWorld } from "./world.ts";

const DEV_CLOCK = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "tools", "ops", "sql", "dev_clock.sql"),
  "utf8",
);

const app = appSql();
afterAll(async () => {
  await app.end();
});

const micro = (instant: Temporal.Instant) => instant.epochNanoseconds / 1000n;
/** An instant as the tests' world takes one, a Date, to the millisecond, rounded down. */
const date = (instant: Temporal.Instant) => new Date(instant.epochMilliseconds);

/** Postgres's own clock_timestamp(), in epoch microseconds, read here as the tests' reference. */
async function postgresNow(tx: Tx): Promise<bigint> {
  const [row] = await tx<{ us: string }[]>`
    SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS us`;
  if (!row) throw new Error("no clock_timestamp()");
  return BigInt(row.us);
}

/** Samples `sample` between two readings of clock_timestamp(), and returns all three. */
async function bracketed(tx: Tx, sample: () => Promise<Temporal.Instant>) {
  const before = await postgresNow(tx);
  const at = micro(await sample());
  const after = await postgresNow(tx);
  return { before, at, after };
}

describe("the server's clock (ADR-013)", () => {
  it("reads the moment it's asked, clock_timestamp(), never the transaction's start", async () => {
    const clock = await prepareClock("prod", app);
    await rolledBack(app, async (tx) => {
      const [start] = await tx<{ us: string }[]>`
        SELECT (extract(epoch FROM pg_catalog.now()) * 1000000)::bigint::text AS us`;
      await tx`SELECT pg_catalog.pg_sleep(0.2)`;
      const sample = micro(await clock.sample(tx));
      expect(sample - BigInt(start?.us ?? "0")).toBeGreaterThanOrEqual(200_000n);
    });
  });

  it("reads the time after a lock wait: clock_timestamp() moves on while a transaction waits for a lock (T3)", async () => {
    const clock = await prepareClock("prod", app);
    const other = appSql();
    try {
      let holding: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        holding = resolve;
      });
      let queuing: (pid: number) => void = () => undefined;
      const waiter = new Promise<number>((resolve) => {
        queuing = resolve;
      });
      // One transaction holds a lock until the other is queued behind it, then samples and lets go...
      const holder = rolledBack(other, async (tx) => {
        await tx`SELECT pg_catalog.pg_advisory_xact_lock(5005)`;
        holding();
        const pid = await waiter;
        // pg_locks is read live, unlike pg_stat_activity, whose rows hold still in a transaction.
        for (let tries = 0; ; tries += 1) {
          const [row] = await tx<{ queued: boolean }[]>`
            SELECT EXISTS (SELECT FROM pg_catalog.pg_locks WHERE pid = ${pid} AND NOT granted) AS queued`;
          if (row?.queued) break;
          if (tries === 1000) throw new Error("the other transaction never queued for the lock");
          await tx`SELECT pg_catalog.pg_sleep(0.01)`;
        }
        return micro(await clock.sample(tx));
      });
      await held;
      // ...while this one, already started, queues for it and samples once it has it.
      const waited = await rolledBack(app, async (tx) => {
        const [me] = await tx<{ pid: number; us: string }[]>`
          SELECT pg_catalog.pg_backend_pid() AS pid,
                 (extract(epoch FROM pg_catalog.now()) * 1000000)::bigint::text AS us`;
        if (!me) throw new Error("no backend");
        queuing(me.pid);
        await tx`SELECT pg_catalog.pg_advisory_xact_lock(5005)`;
        return { started: BigInt(me.us), sample: micro(await clock.sample(tx)) };
      });
      const letGo = await holder;
      expect(waited.started).toBeLessThan(letGo);
      expect(waited.sample).toBeGreaterThan(letGo);
    } finally {
      await other.end();
    }
  });

  it("keeps Postgres's microseconds, and a command's connection stores and reads back each sample exactly (T3, T22)", async () => {
    const clock = await prepareClock("prod", app);
    const commands = commandSql();
    try {
      await rolledBack(commands, async (tx) => {
        const samples: Temporal.Instant[] = [];
        for (let i = 0; i < 5; i += 1) samples.push(await clock.sample(tx));
        // Finer than milliseconds: at least one of five readings has digits below the millisecond.
        expect(samples.some((sample) => micro(sample) % 1000n !== 0n)).toBe(true);
        for (const sample of samples) {
          const [row] = await tx<{ at: Temporal.Instant; us: string }[]>`
            SELECT ${sample}::timestamptz AS at,
                   (extract(epoch FROM ${sample}::timestamptz) * 1000000)::bigint::text AS us`;
          expect(row?.at.equals(sample)).toBe(true);
          expect(BigInt(row?.us ?? "0")).toBe(micro(sample));
        }
        // Only an instant from the time module: never a Date or a string (T1).
        const refused = /takes a Temporal\.Instant from the time module/;
        await expect(tx.savepoint((sp) => sp`SELECT ${new Date(0)}::timestamptz`)).rejects.toThrow(refused);
        await expect(tx.savepoint((sp) => sp`SELECT ${"1970-01-01T00:00:00Z"}::timestamptz`)).rejects.toThrow(refused);
      });
    } finally {
      await commands.end();
    }
  });

  it("needs INSTANT_TYPE: postgres.js's own timestamptz keeps milliseconds only, whatever it's given", async () => {
    const [row] = await app<{ us: string }[]>`
      SELECT (extract(epoch FROM ${"2026-11-13T06:59:59.999999Z"}::timestamptz) * 1000000)::bigint::text AS us`;
    expect(row?.us).toBe("1794553199999000");
  });
});

describe("the dev clock, only on dev (ADR-013)", () => {
  it("refuses to start prod on a database that has it", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      await expect(prepareClock("prod", tx)).rejects.toThrow(/prod refuses a dev clock/);
    });
  });

  it("refuses to start dev on a database that hasn't", async () => {
    await expect(prepareClock("dev", app)).rejects.toThrow(/app\.dev_clock/);
  });

  it("is made only as tadayo_app, which then owns it, with nothing PUBLIC can run (T53)", async () => {
    const admin = adminSql();
    try {
      await rolledBack(admin, async (tx) => {
        await expectRefused(tx, REFUSED.privilege, (sp) => sp.unsafe(DEV_CLOCK), /made as tadayo_app/);
      });
    } finally {
      await admin.end();
    }
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      const [row] = await tx<{ owner: string; runs: boolean }[]>`
        SELECT (SELECT tableowner FROM pg_catalog.pg_tables
                 WHERE schemaname = 'app' AND tablename = 'dev_clock') AS owner,
               pg_catalog.has_function_privilege('public', 'app.dev_clock_forward()', 'EXECUTE') AS runs`;
      expect(row).toEqual({ owner: "tadayo_app", runs: false });
    });
  });

  it("refuses to start dev when its role can't read the table, rather than at the first request", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      await tx`REVOKE SELECT ON app.dev_clock FROM tadayo_app`;
      await expect(tx.savepoint((sp) => prepareClock("dev", sp))).rejects.toThrow(/can't read app\.dev_clock/);
    });
  });

  it("adds its offset on dev, to the microsecond, and nothing with no row", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      const clock = await prepareClock("dev", tx);
      const plain = await bracketed(tx, () => clock.sample(tx));
      expect(plain.at).toBeGreaterThanOrEqual(plain.before);
      expect(plain.at).toBeLessThanOrEqual(plain.after);
      // Three days, four hours and 5.999999 seconds ahead: a part of a second big enough that
      // losing it would put the sample outside the readings around it.
      const offset = 3n * 86_400_000_000n + 4n * 3_600_000_000n + 5_999_999n;
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (${offset.toString()})`;
      const moved = await bracketed(tx, () => clock.sample(tx));
      expect(moved.at - offset).toBeGreaterThanOrEqual(moved.before);
      expect(moved.at - offset).toBeLessThanOrEqual(moved.after);
    });
  });

  it("never reaches prod's clock, even when the table is made after prod's clock started", async () => {
    const prod = await prepareClock("prod", app);
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (${86_400_000_000n.toString()})`;
      const sample = await bracketed(tx, () => prod.sample(tx));
      expect(sample.at).toBeGreaterThanOrEqual(sample.before);
      expect(sample.at).toBeLessThanOrEqual(sample.after);
    });
  });

  it("holds one offset at most, and keeps the schema closed (T53)", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      expect(await closedProblems(tx)).toEqual([]);
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (0)`;
      await expectRefused(tx, REFUSED.unique, (sp) => sp`INSERT INTO app.dev_clock (offset_microseconds) VALUES (1)`);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`INSERT INTO app.dev_clock (only_row, offset_microseconds) VALUES (false, 1)`,
      );
    });
  });

  it("only moves forward, so a day that has opened never takes a drop again (T3)", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      await expectRefused(tx, REFUSED.check, (sp) => sp`INSERT INTO app.dev_clock (offset_microseconds) VALUES (-1)`);
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (1000)`;
      await tx`UPDATE app.dev_clock SET offset_microseconds = 1001`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.dev_clock SET offset_microseconds = 1000`,
        /would move the clock back/,
      );
      await expectRefused(tx, REFUSED.integrity, (sp) => sp`DELETE FROM app.dev_clock`, /never moves back/);
      await expectRefused(tx, REFUSED.integrity, (sp) => sp`TRUNCATE app.dev_clock`, /never moves back/);
    });
  });

  it("refuses to sample outside READ COMMITTED, where dev would read the offset from before the locks, on prod too", async () => {
    for (const environment of ["dev", "prod"]) {
      for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
        await rolledBack(app, async (tx) => {
          await tx.unsafe(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
          if (environment === "dev") await tx.unsafe(DEV_CLOCK);
          const clock = await prepareClock(environment, tx);
          await expect(clock.sample(tx), `${environment} ${isolation}`).rejects.toThrow(/READ COMMITTED/);
        });
      }
    }
  });
});

describe("the cutoff is the time after the occurrence's lock (T3, ADR-013), the database's half", () => {
  // The commit command (B2, docs/MILESTONES.md) takes the day's lock, then samples the clock. Here
  // the dev clock stands 0.3 seconds before a day's 7 AM, the day's row is locked, and a wait
  // stands for the lock wait: the sample after it is past the reveal, and the database refuses a
  // drop committed then; the sample before it, the moment a clock read at the transaction's start
  // would give, would have been let in.
  it("refuses a drop whose commit waited past 07:00, which a sample from before the wait would have let in", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      const w = await newWorld(tx);
      // Ben's Friday, far enough ahead that the dev clock only has to move forward to reach it.
      const { revealAt, closeAt } = dayInstants(Temporal.PlainDate.from("2099-01-02"), "Europe/London");
      const day = newId("occ");
      await tx`
        INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                     collecting_from)
        VALUES (${day}, ${w.club}, ${w.ben.interval}, ${w.version}, '2099-01-02', ${date(revealAt)}, ${date(closeAt)},
                ${AT.generated})`;
      const offset = micro(revealAt) - (await postgresNow(tx)) - 300_000n;
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (${offset.toString()})`;
      const clock = await prepareClock("dev", tx);

      await tx`SELECT FROM app.occurrences WHERE id = ${day} FOR UPDATE`;
      const before = await clock.sample(tx);
      await tx`SELECT pg_catalog.pg_sleep(0.5)`;
      const after = await clock.sample(tx);
      expect(Temporal.Instant.compare(before, revealAt)).toBe(-1);
      expect(Temporal.Instant.compare(after, revealAt)).toBe(1);

      const atDay = { ...w, day };
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => commitDrop(sp, atDay, w.cleo, { media: "external_video", at: date(after) }),
        /before the reveal \(T3\)/,
      );
      await tx.savepoint((sp) => commitDrop(sp, atDay, w.cleo, { media: "external_video", at: date(before) }));
    });
  });
});
