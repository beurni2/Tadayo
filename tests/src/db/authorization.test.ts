/// <reference lib="esnext.temporal" />
// The read predicate on real rows (T9; TECH-DESIGN section 5, one authorization module), through
// both of its paths: the TypeScript policy on the facts loaded for one drop (`mayReadDrop`), and
// the SQL that filters lists (`readableDrops`). Every role of TECH-DESIGN section 8's privacy
// matrix, each of its six drop states and a cancelled day, collecting, open and past by the time
// module's fake clock, and the three reads: both paths must give the expected answer, so the
// policy and the SQL can't drift apart. Then T23's denials after the drop was read and saved, a
// block made before a later shared interval, a held day (FQ63), an author who leaves (spec 22),
// and T14's missing ids.
//
// The rows are built as the commands will write them (world.ts), each role in its own world, so a
// role's rows never touch another's. The clock then visits each instant over the same rows: the
// predicate reads the rows as they are and the server's time, and nothing else. The roles, states
// and phases are the privacy matrix's (../matrix.ts), which its test over the API's routes shares.

import { mayReadDrop, READS, readableDrops, type ReadWhat, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
  AFTER,
  block,
  LATER,
  PHASES,
  removeByModeration,
  REVEAL,
  ROLES,
  STATE_AT,
  STATES,
  withdraw,
  type Phase,
} from "../matrix.ts";
import { appSql, commandSql, halfInstantSql, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import {
  AT,
  checkAsAtCommit,
  commitDrop,
  joinByRoster,
  leave,
  newId,
  newWorld,
  type Member,
  type World,
} from "./world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;

/** Runs `body` in a savepoint that is always rolled back, so each state starts from the role's rows. */
async function undone<T>(tx: WorldTx, body: (sp: WorldTx) => Promise<T>): Promise<T> {
  class Undo extends Error {}
  let result: { value: T } | undefined;
  try {
    await tx.savepoint(async (sp) => {
      result = { value: await body(sp) };
      throw new Undo();
    });
  } catch (error) {
    if (!(error instanceof Undo)) throw error;
  }
  if (!result) throw new Error("undone: the body didn't finish");
  return result.value;
}

/** Whether `viewer` may see `what` of `drop` at `now`, by each path. */
async function bothPaths(tx: WorldTx, viewer: string, drop: string, what: ReadWhat, now: ServerNow) {
  const policy = await mayReadDrop(tx, viewer, drop, what, now);
  const [row] = await tx<{ readable: boolean }[]>`
    SELECT EXISTS (SELECT FROM app.drops x WHERE x.id = ${drop} AND x.id IN (${readableDrops(tx, viewer, now, what)})) AS readable`;
  return { policy, sql: row?.readable };
}

/**
 * Ben's drop to Ana's Saturday, committed at 20:00 on Friday 6 November: its audience is Ana, Ben
 * and Cleo, sealed, and its commit's checks run then, as at its transaction's COMMIT (T8).
 */
async function bensDrop(tx: WorldTx, w: World): Promise<string> {
  const drop = await commitDrop(plain(tx), w, w.ben, { caption: "From Ben", at: AT.added });
  await checkAsAtCommit(plain(tx));
  return drop;
}

/** Ends `member`'s interval as leaving does (spec 22), at an instant to the microsecond. */
async function leaveAt(
  tx: WorldTx,
  member: Member,
  name: string,
  contributions: "keep" | "withdraw",
  at: Temporal.Instant,
) {
  await tx`
    UPDATE app.memberships SET state = 'left', left_at = ${at}, contributions = ${contributions}, ended_display_name = ${name}
     WHERE interval_id = ${member.interval}
  `;
}

describe("T9: every role of the privacy matrix, before, during and after the day, in each of the six states and a cancelled day", () => {
  for (const role of ROLES) {
    it(`answers the ${role.name} by both paths alike`, async () => {
      const wrong: string[] = [];
      let checked = 0;
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        const viewer = await role.make(tx, w);
        await checkAsAtCommit(plain(tx));
        const clock = fakeClock(REVEAL);
        for (const state of STATES) {
          await undone(tx, async (sp) => {
            await state.make(sp, w, drop);
            await checkAsAtCommit(plain(sp));
            for (const [phase, instant] of Object.entries(PHASES) as [Phase, Temporal.Instant][]) {
              if (role.phases && !role.phases.includes(phase)) continue;
              clock.set(instant);
              const now = await clock.sample(sp);
              for (const what of READS) {
                const expected = role.reads && !state.denies && (what === "caption" || phase !== "collecting");
                const got = await bothPaths(sp, viewer, drop, what, now);
                checked += 1;
                if (got.policy !== expected || got.sql !== expected) {
                  wrong.push(
                    `${state.name}, ${phase}, ${what}: expected ${String(expected)}, policy ${String(got.policy)}, SQL ${String(got.sql)}`,
                  );
                }
              }
            }
          });
        }
      });
      expect(wrong).toEqual([]);
      expect(checked).toBe(STATES.length * (role.phases ?? Object.keys(PHASES)).length * READS.length);
    });
  }
});

describe("T23: a denial beats every grant, once the drop has been read and saved", () => {
  const OPENED = Temporal.Instant.from(AT.opened.toISOString());
  const SAVED = new Date("2026-11-07T08:00:00Z");
  const DENIED = new Date("2026-11-07T08:30:00Z");
  /** Each denial, made at 08:30 on the open day, and whom it denies; the others still read the drop. */
  const denials: {
    name: string;
    denies: readonly ("ana" | "ben" | "cleo")[];
    make(tx: WorldTx, w: World, drop: string): Promise<unknown>;
  }[] = [
    {
      name: "a pictured member's removal (T25)",
      denies: ["ana", "ben", "cleo"],
      make: async (tx, w, drop) => {
        await tx`UPDATE app.drops SET state = 'removed', ended_at = ${DENIED}, updated_at = ${DENIED} WHERE id = ${drop}`;
        await tx`
          INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
          VALUES (${drop}, 'pictured', ${w.cleo.interval}, ${DENIED})
        `;
      },
    },
    {
      name: "a moderation removal (FQ27)",
      denies: ["ana", "ben", "cleo"],
      make: (tx, _w, drop) => removeByModeration(tx, drop, DENIED),
    },
    {
      name: "the author's withdrawal",
      denies: ["ana", "ben", "cleo"],
      make: (tx, w, drop) => withdraw(tx, w, drop, DENIED),
    },
    {
      name: "the author's account deletion, before its purge (T27, spec 23)",
      denies: ["ana", "ben", "cleo"],
      make: (tx, w) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${DENIED} WHERE id = ${w.ben.user}`,
    },
    {
      name: "the end of Cleo's membership",
      denies: ["cleo"],
      make: (tx, w) => leave(plain(tx), w.cleo, "Cleo", DENIED),
    },
    {
      name: "Cleo's block of the author",
      denies: ["cleo"],
      make: (tx, w) => block(tx, w.cleo, "Cleo", w.ben, "Ben", DENIED),
    },
    {
      // Ben leaves by the block and keeps the drop, so it stays for Ana (spec 22) and not for Cleo.
      name: "the author's block of Cleo, the drop kept (FQ88)",
      denies: ["ben", "cleo"],
      make: (tx, w) => block(tx, w.ben, "Ben", w.cleo, "Cleo", DENIED),
    },
    {
      name: "Cleo's account deletion (T27)",
      denies: ["cleo"],
      make: (tx, w) =>
        tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${DENIED} WHERE id = ${w.cleo.user}`,
    },
  ];
  for (const denial of denials) {
    it(`denies ${denial.denies.join(", ")} everything after ${denial.name}, and nobody else`, async () => {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        // A favourite is a pointer the predicate never reads (T32): it can't bring the drop back.
        await tx`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.cleo.interval}, ${drop}, ${SAVED})`;
        const now = await fakeClock(OPENED).sample(tx);
        const viewers = { ana: w.ana.user, ben: w.ben.user, cleo: w.cleo.user };
        for (const viewer of Object.values(viewers)) {
          for (const what of READS)
            expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: true, sql: true });
        }
        await denial.make(tx, w, drop);
        await checkAsAtCommit(plain(tx));
        for (const [name, viewer] of Object.entries(viewers) as ["ana" | "ben" | "cleo", string][]) {
          const reads = !denial.denies.includes(name);
          for (const what of READS) {
            expect(await bothPaths(tx, viewer, drop, what, now), `${name}, ${what}`).toEqual({
              policy: reads,
              sql: reads,
            });
          }
        }
      });
    });
  }
});

describe("T23 and FQ88: a block denies in every interval after it, whoever made it", () => {
  it("hides Ben's later drop from Cleo, who blocked Ben, and Cleo's from Ben, in a club they share again", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // Cleo blocks Ben and leaves, then rejoins (a roster nothing here refuses), and each adds a
      // drop after: both are in both audiences, active, and only the block stands between them.
      await block(tx, w.cleo, "Cleo", w.ben, "Ben", AFTER);
      const [cleoAgain] = await joinByRoster(plain(tx), w.club, w.ana, [{ user: w.cleo.user, label: "Cleo" }], LATER);
      if (!cleoAgain) throw new Error("Cleo didn't rejoin");
      const at = new Date("2026-11-06T20:40:00Z");
      const bens = await commitDrop(plain(tx), w, w.ben, { caption: "From Ben", at });
      const cleos = await commitDrop(
        plain(tx),
        w,
        { user: w.cleo.user, interval: cleoAgain },
        { caption: "From Cleo", at },
      );
      await checkAsAtCommit(plain(tx));
      const clock = fakeClock(REVEAL);
      for (const [phase, instant] of Object.entries(PHASES) as [Phase, Temporal.Instant][]) {
        clock.set(instant);
        const now = await clock.sample(tx);
        for (const what of READS) {
          const reads = what === "caption" || phase !== "collecting";
          expect(await bothPaths(tx, w.cleo.user, bens, what, now), `Cleo, Ben's, ${phase}, ${what}`).toEqual({
            policy: false,
            sql: false,
          });
          expect(await bothPaths(tx, w.ben.user, cleos, what, now), `Ben, Cleo's, ${phase}, ${what}`).toEqual({
            policy: false,
            sql: false,
          });
          for (const drop of [bens, cleos]) {
            expect(await bothPaths(tx, w.ana.user, drop, what, now), `Ana, ${phase}, ${what}`).toEqual({
              policy: reads,
              sql: reads,
            });
          }
        }
      }
    });
  });
});

describe("FQ63: a day whose star left before it opened is held and never opens", () => {
  it("serves nothing of it to anyone, the caption included, before or after reveal_at", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await bensDrop(tx, w);
      await leave(plain(tx), w.ana, "Ana", AFTER);
      const clock = fakeClock(REVEAL);
      for (const instant of Object.values(PHASES)) {
        clock.set(instant);
        const now = await clock.sample(tx);
        for (const viewer of [w.ben.user, w.cleo.user, w.ana.user]) {
          for (const what of READS)
            expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: false, sql: false });
        }
      }
    });
  });

  it("keeps a day that had opened when its star left, at reveal_at itself or later", async () => {
    for (const leftAt of [REVEAL, Temporal.Instant.from(AT.opened.toISOString())]) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        await leaveAt(tx, w.ana, "Ana", "keep", leftAt);
        const now = await fakeClock(PHASES.past).sample(tx);
        for (const viewer of [w.ben.user, w.cleo.user]) {
          for (const what of READS)
            expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: true, sql: true });
        }
        for (const what of READS)
          expect(await bothPaths(tx, w.ana.user, drop, what, now)).toEqual({ policy: false, sql: false });
      });
    }
  });

  it("holds a day whose star asked to delete their account before it opened, whenever the membership is ended", async () => {
    // A deletion revokes the memberships first (T27), so the request is the star's leaving, and the
    // answer never waits for the job that ends the interval (T1): not yet, before reveal_at, or after.
    const ended = [null, Temporal.Instant.from("2026-11-07T06:30:00Z"), Temporal.Instant.from("2026-11-07T08:00:00Z")];
    for (const leftAt of ended) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AFTER} WHERE id = ${w.ana.user}`;
        if (leftAt) {
          await tx`UPDATE app.memberships SET state = 'account_deleted', left_at = ${leftAt} WHERE interval_id = ${w.ana.interval}`;
        }
        await checkAsAtCommit(plain(tx));
        const clock = fakeClock(REVEAL);
        for (const [phase, instant] of Object.entries(PHASES)) {
          clock.set(instant);
          const now = await clock.sample(tx);
          for (const [name, viewer] of [
            ["Ben", w.ben.user],
            ["Cleo", w.cleo.user],
          ] as const) {
            for (const what of READS) {
              expect(
                await bothPaths(tx, viewer, drop, what, now),
                `ended ${String(leftAt)}, ${phase}, ${name}, ${what}`,
              ).toEqual({ policy: false, sql: false });
            }
          }
        }
      });
    }
  });

  it("keeps a day whose star asked to delete their account once it had opened", async () => {
    for (const requestedAt of [REVEAL, Temporal.Instant.from(AT.opened.toISOString())]) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${requestedAt} WHERE id = ${w.ana.user}`;
        const now = await fakeClock(PHASES.past).sample(tx);
        for (const viewer of [w.ben.user, w.cleo.user]) {
          for (const what of READS)
            expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: true, sql: true });
        }
        for (const what of READS)
          expect(await bothPaths(tx, w.ana.user, drop, what, now)).toEqual({ policy: false, sql: false });
      });
    }
  });

  it("holds a day whose star left a microsecond before reveal_at", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await bensDrop(tx, w);
      await leaveAt(tx, w.ana, "Ana", "keep", REVEAL.subtract({ microseconds: 1 }));
      const now = await fakeClock(PHASES.past).sample(tx);
      for (const what of READS)
        expect(await bothPaths(tx, w.cleo.user, drop, what, now)).toEqual({ policy: false, sql: false });
    });
  });
});

describe("spec 22 and D11: an author who leaves keeps the drop for the club, or takes it away", () => {
  it("lets the club read the drop of an author who left and kept it, before or after the reveal", async () => {
    for (const leftAt of [Temporal.Instant.from(AFTER.toISOString()), Temporal.Instant.from(AT.opened.toISOString())]) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        await leaveAt(tx, w.ben, "Ben", "keep", leftAt);
        const clock = fakeClock(REVEAL);
        for (const [phase, instant] of Object.entries(PHASES) as [Phase, Temporal.Instant][]) {
          if (Temporal.Instant.compare(instant, leftAt) < 0) continue;
          clock.set(instant);
          const now = await clock.sample(tx);
          for (const what of READS) {
            const reads = what === "caption" || phase !== "collecting";
            for (const viewer of [w.ana.user, w.cleo.user]) {
              expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: reads, sql: reads });
            }
            expect(await bothPaths(tx, w.ben.user, drop, what, now)).toEqual({ policy: false, sql: false });
          }
        }
      });
    }
  });

  it("serves nothing of a drop its author withdrew by leaving, or by blocking before the reveal", async () => {
    for (const reason of ["leave", "block"] as const) {
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await bensDrop(tx, w);
        if (reason === "block") await block(tx, w.ben, "Ben", w.cleo, "Cleo", AFTER);
        else await leave(plain(tx), w.ben, "Ben", AFTER);
        await tx`UPDATE app.drops SET state = 'withdrawn', ended_at = ${LATER}, updated_at = ${LATER} WHERE id = ${drop}`;
        await tx`
          INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
          VALUES (${drop}, ${reason}, ${w.ben.interval}, ${LATER})
        `;
        await checkAsAtCommit(plain(tx));
        const clock = fakeClock(REVEAL);
        for (const instant of Object.values(PHASES)) {
          clock.set(instant);
          const now = await clock.sample(tx);
          for (const viewer of [w.ana.user, w.cleo.user]) {
            for (const what of READS)
              expect(await bothPaths(tx, viewer, drop, what, now)).toEqual({ policy: false, sql: false });
          }
        }
      });
    }
  });
});

describe("T8: an audience that holds two of one viewer's intervals", () => {
  it("answers through the one still active, by both paths alike, and nothing once neither is", async () => {
    await rolledBack(db, async (tx) => {
      // The seal checks only that each interval was active when its row was written and that every
      // active member is in, so Cleo can leave and rejoin inside the commit's transaction, before
      // the seal, and both of her intervals are in the audience.
      const w = await newWorld(plain(tx));
      const drop = await commitDrop(plain(tx), w, w.ben, { caption: "From Ben", at: AT.added, unsealed: true });
      await tx`
        INSERT INTO app.drop_audience (drop_id, club_id, interval_id)
        SELECT ${drop}, club_id, interval_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'
      `;
      await leave(plain(tx), w.cleo, "Cleo", new Date("2026-11-06T20:05:00Z"));
      const [cleoAgain] = await joinByRoster(plain(tx), w.club, w.ana, [{ user: w.cleo.user, label: "Cleo" }], LATER);
      if (!cleoAgain) throw new Error("Cleo didn't rejoin");
      await tx`INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${cleoAgain})`;
      await tx`UPDATE app.drops SET audience_sealed_at = ${AT.added} WHERE id = ${drop}`;
      await checkAsAtCommit(plain(tx));
      const now = await fakeClock(PHASES.open).sample(tx);
      for (const what of READS)
        expect(await bothPaths(tx, w.cleo.user, drop, what, now)).toEqual({ policy: true, sql: true });
      await leave(plain(tx), { user: w.cleo.user, interval: cleoAgain }, "Cleo", STATE_AT);
      for (const what of READS)
        expect(await bothPaths(tx, w.cleo.user, drop, what, now)).toEqual({ policy: false, sql: false });
    });
  });
});

describe("T14: a missing drop and a drop the viewer may not read get the same answer", () => {
  it("answers no for a drop id nobody has or one that isn't an id at all, and for an account nobody has, without an error", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await bensDrop(tx, w);
      const now = await fakeClock(PHASES.past).sample(tx);
      for (const what of READS) {
        expect(await bothPaths(tx, w.cleo.user, newId("drp"), what, now)).toEqual({ policy: false, sql: false });
        expect(await bothPaths(tx, newId("acct"), drop, what, now)).toEqual({ policy: false, sql: false });
      }
      // A drop id comes from the request, so one that isn't an id finds nothing, Postgres seeing a
      // null in its place (a NUL would fail the query); a list takes no drop id.
      for (const notAnId of ["not an id", "../drp_x", "x".repeat(65), "", `${drop}\u0000`, "\u0000"]) {
        for (const what of READS) expect(await mayReadDrop(tx, w.cleo.user, notAnId, what, now)).toBe(false);
      }
    });
  });

  it("refuses a viewer that isn't an account id, whichever drop is asked about", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await bensDrop(tx, w);
      const now = await fakeClock(PHASES.past).sample(tx);
      for (const viewer of ["not an id", "x".repeat(65), `${w.cleo.user}\u0000`, ""]) {
        for (const asked of [drop, newId("drp")]) {
          await expect(mayReadDrop(tx, viewer, asked, "caption", now)).rejects.toThrow(TypeError);
        }
        expect(() => readableDrops(tx, viewer, now, "caption")).toThrow(TypeError);
      }
    });
  });
});

describe("the connection: the time module's INSTANT_TYPE, or a loud failure", () => {
  it("binds now and reads instants through INSTANT_TYPE on a command's connection", async () => {
    const commands = commandSql();
    try {
      await rolledBack(commands, async (tx) => {
        const now = await fakeClock(PHASES.open).sample(tx);
        const rows = await tx`SELECT id FROM app.drops WHERE id IN (${readableDrops(tx, newId("acct"), now, "media")})`;
        expect(rows).toHaveLength(0);
        expect(await mayReadDrop(tx, newId("acct"), newId("drp"), "media", now)).toBe(false);
      });
    } finally {
      await commands.end();
    }
  });

  it("refuses a connection without it, rather than compare by milliseconds or read a Date", async () => {
    const app = appSql();
    try {
      await rolledBack(app, async (tx) => {
        const w = await newWorld(tx);
        const drop = await commitDrop(tx, w, w.ben, { caption: "From Ben", at: AT.added });
        const now = await fakeClock(PHASES.open).sample(tx);
        // postgres.js's own timestamptz type can't send a Temporal.Instant, so binding `now` fails
        // with Temporal's TypeError before any query runs.
        await expect(
          tx.savepoint(
            (sp) => sp`SELECT id FROM app.drops WHERE id IN (${readableDrops(sp, w.cleo.user, now, "media")})`,
          ),
        ).rejects.toThrow(TypeError);
        // For a drop that exists, one that doesn't and an id that isn't one alike, so a
        // misconfigured connection fails on every call and a stranger can't tell drops apart.
        for (const asked of [drop, newId("drp"), "not an id", "\u0000"]) {
          await expect(tx.savepoint((sp) => mayReadDrop(sp, w.cleo.user, asked, "caption", now))).rejects.toThrow(
            TypeError,
          );
        }
      });
    } finally {
      await app.end();
    }
  });

  it("refuses a connection that sends instants whole but reads them back as Dates, for a drop that doesn't exist too", async () => {
    const half = halfInstantSql();
    try {
      await rolledBack(half, async (tx) => {
        const now = await fakeClock(PHASES.open).sample(tx);
        for (const asked of [newId("drp"), "not an id", "\u0000"]) {
          await expect(mayReadDrop(tx, newId("acct"), asked, "caption", now)).rejects.toThrow(/use INSTANT_TYPE/);
        }
      });
    } finally {
      await half.end();
    }
  });

  it("refuses a viewer that isn't an id, a time that isn't the server's to the microsecond, and a read it doesn't know", async () => {
    const sql = (() => []) as never;
    const now = PHASES.open as ServerNow;
    expect(() => readableDrops(sql, "", now, "media")).toThrow(TypeError);
    expect(() => readableDrops(sql, "acct_x", AT.opened as unknown as ServerNow, "media")).toThrow(TypeError);
    expect(() => readableDrops(sql, "acct_x", PHASES.open.add({ nanoseconds: 1 }) as ServerNow, "media")).toThrow(
      RangeError,
    );
    expect(() => readableDrops(sql, "acct_x", now, "comments" as ReadWhat)).toThrow(TypeError);
    await expect(mayReadDrop(sql, "", newId("drp"), "media", now)).rejects.toThrow(TypeError);
    await expect(mayReadDrop(sql, "acct_x", newId("drp"), "comments" as ReadWhat, now)).rejects.toThrow(TypeError);
  });
});
