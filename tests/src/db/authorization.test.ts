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
// predicate reads the rows as they are and the server's time, and nothing else.

import { randomBytes } from "node:crypto";
import { mayReadDrop, READS, readableDrops, type ReadWhat, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, commandSql, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import {
  AT,
  checkAsAtCommit,
  commitDrop,
  joinByRoster,
  leave,
  newId,
  newUser,
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

const REVEAL = Temporal.Instant.from(AT.reveal.toISOString());
const CLOSE = Temporal.Instant.from(AT.close.toISOString());
/** The privacy matrix's phases, at their edges: collecting ends a microsecond before reveal_at. */
const PHASES = {
  collecting: REVEAL.subtract({ microseconds: 1 }),
  open: REVEAL,
  past: CLOSE,
  "past, a year on": CLOSE.add({ hours: 24 * 365 }),
} as const;
type Phase = keyof typeof PHASES;

const AFTER = new Date("2026-11-06T20:10:00Z");
const LATER = new Date("2026-11-06T20:20:00Z");
const STATE_AT = new Date("2026-11-06T20:30:00Z");

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

/** Removes the drop by moderation, citing the operator's audited action (FQ27). */
async function removeByModeration(tx: WorldTx, drop: string, at: Date) {
  const action = newId("act");
  await tx`
    INSERT INTO app.operator_actions (id, operator, script, script_version, action, target_kind, target_id, policy, acted_at)
    VALUES (${action}, 'founder', 'remove-drop', ${"0".repeat(40)}, 'remove_drop', 'drop', ${drop}, 'trial.safety', ${at})
  `;
  await tx`UPDATE app.drops SET state = 'removed', ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, operator_action_id, removed_at)
    VALUES (${drop}, 'moderation', ${action}, ${at})
  `;
}

/** The author withdraws the drop (spec 22). */
async function withdraw(tx: WorldTx, w: World, drop: string, at: Date) {
  await tx`UPDATE app.drops SET state = 'withdrawn', ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
    VALUES (${drop}, 'withdraw', ${w.ben.interval}, ${at})
  `;
}

/** `blocker` blocks `blocked` and leaves the club by it, keeping their drops (spec 22, D11). */
async function block(
  tx: WorldTx,
  blocker: Member,
  blockerName: string,
  blocked: Member,
  blockedName: string,
  at: Date,
) {
  await tx`
    INSERT INTO app.blocks (id, blocker_user_id, blocked_user_id, blocked_interval_id, blocked_name, created_at)
    VALUES (${newId("blk")}, ${blocker.user}, ${blocked.user}, ${blocked.interval}, ${blockedName}, ${at})
  `;
  await tx`
    UPDATE app.memberships SET state = 'left_by_block', left_at = ${at}, contributions = 'keep',
                               ended_display_name = ${blockerName}
     WHERE interval_id = ${blocker.interval}
  `;
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

/**
 * Mo is invited to the club and has accepted with Mo's own link, but the members haven't approved
 * the roster, so it isn't applied and Mo isn't a member (T7). An invitation nobody has accepted ties
 * no account to the club at all, so this is the nearest an invited person comes.
 */
async function invite(tx: WorldTx, w: World, at: Date): Promise<string> {
  const mo = await newUser(plain(tx), "Mo");
  const [revision, candidate, invitation] = [newId("rev"), newId("cand"), newId("inv")];
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revision}, ${w.club}, 'proposal', ${w.ana.interval}, ${at})
  `;
  for (const member of [w.ana, w.ben, w.cleo]) {
    await tx`
      INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
      VALUES (${revision}, ${w.club}, ${member.interval})
    `;
  }
  await tx`
    INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
    VALUES (${candidate}, ${w.club}, ${w.ana.interval}, ${at})
  `;
  await tx`
    INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
    VALUES (${revision}, ${w.club}, ${candidate}, 'Mo', 1)
  `;
  await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${at} WHERE id = ${revision}`;
  await tx`
    INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
    VALUES (${invitation}, ${candidate}, ${randomBytes(32)}, ${at}, ${new Date(at.getTime() + 7 * 864e5)}, ${mo}, ${at})
  `;
  await tx`
    UPDATE app.roster_revision_candidates SET accepted_at = ${at}, accepted_invitation_id = ${invitation}
     WHERE revision_id = ${revision} AND candidate_id = ${candidate}
  `;
  return mo;
}

interface Role {
  name: string;
  /** Whether the role reads Ben's active drop: the caption while collecting, everything from the reveal. */
  reads: boolean;
  /** Makes the role's rows after Ben's drop is committed, and returns the viewer's account. */
  make(tx: WorldTx, w: World): Promise<string>;
  /** The phases whose server time can follow the role's rows; every phase when absent. */
  phases?: readonly Phase[];
}

const ROLES: Role[] = [
  { name: "author", reads: true, make: (_tx, w) => Promise.resolve(w.ben.user) },
  { name: "star", reads: true, make: (_tx, w) => Promise.resolve(w.ana.user) },
  { name: "member in the audience", reads: true, make: (_tx, w) => Promise.resolve(w.cleo.user) },
  {
    name: "member who joined after the commit (T8)",
    reads: false,
    make: async (tx, w) => {
      const eve = await newUser(plain(tx), "Eve");
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: eve, label: "Eve" }], AFTER);
      return eve;
    },
  },
  {
    name: "rejoined member, a new interval (T8)",
    reads: false,
    make: async (tx, w) => {
      await leave(plain(tx), w.cleo, "Cleo", AFTER);
      await joinByRoster(plain(tx), w.club, w.ana, [{ user: w.cleo.user, label: "Cleo" }], LATER);
      return w.cleo.user;
    },
  },
  {
    name: "former member",
    reads: false,
    make: async (tx, w) => {
      await leave(plain(tx), w.cleo, "Cleo", AFTER);
      return w.cleo.user;
    },
  },
  { name: "invited, not yet a member (T7)", reads: false, make: (tx, w) => invite(tx, w, AFTER) },
  {
    name: "stranger from another club",
    reads: false,
    make: async (tx) => (await newWorld(plain(tx))).cleo.user,
  },
  {
    name: "blocked: Cleo blocked the author, leaving by the block",
    reads: false,
    make: async (tx, w) => {
      await block(tx, w.cleo, "Cleo", w.ben, "Ben", AFTER);
      return w.cleo.user;
    },
  },
  {
    // A block withdraws the blocker's drops still to be revealed (D11; the contract's
    // BlockRequest), so Ben blocks Cleo as the day opens and keeps the drop, and only the phases
    // from then on are asked. Ben's block before the reveal is the T23 test below.
    name: "blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)",
    reads: false,
    make: async (tx, w) => {
      await block(tx, w.ben, "Ben", w.cleo, "Cleo", AT.reveal);
      return w.cleo.user;
    },
    phases: ["open", "past", "past, a year on"],
  },
  {
    name: "deletion pending, the membership not yet ended (T27)",
    reads: false,
    make: async (tx, w) => {
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AFTER} WHERE id = ${w.cleo.user}`;
      return w.cleo.user;
    },
  },
];

/**
 * TECH-DESIGN section 8's six states of the drop, each made in a way the schema accepts, and a
 * cancelled day, which no trial command makes yet but the schema allows and T9 denies.
 */
const STATES: { name: string; denies: boolean; make(tx: WorldTx, w: World, drop: string): Promise<unknown> }[] = [
  { name: "active", denies: false, make: () => Promise.resolve() },
  { name: "withdrawn", denies: true, make: (tx, w, drop) => withdraw(tx, w, drop, STATE_AT) },
  { name: "removed by moderation", denies: true, make: (tx, _w, drop) => removeByModeration(tx, drop, STATE_AT) },
  {
    name: "held (T29)",
    denies: true,
    make: (tx, _w, drop) => tx`UPDATE app.drops SET state = 'held', updated_at = ${STATE_AT} WHERE id = ${drop}`,
  },
  {
    name: "its day suspended",
    denies: true,
    make: (tx, w) => tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${w.day}`,
  },
  {
    name: "its club suspended",
    denies: true,
    make: (tx, w) => tx`UPDATE app.clubs SET suspended_at = ${STATE_AT} WHERE id = ${w.club}`,
  },
  {
    name: "its day cancelled",
    denies: true,
    make: (tx, w) => tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${w.day}`,
  },
];

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

describe("T14: a missing drop and a drop the viewer may not read get the same answer", () => {
  it("answers no for an id nobody has, one that isn't an id at all, or a viewer who isn't anyone, without an error", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const drop = await bensDrop(tx, w);
      const now = await fakeClock(PHASES.past).sample(tx);
      for (const missing of [newId("drp"), "not an id", "../drp_x", "x".repeat(65), ""]) {
        for (const what of READS)
          expect(await bothPaths(tx, w.cleo.user, missing, what, now)).toEqual({ policy: false, sql: false });
      }
      for (const stranger of [newId("acct"), "not an id", "x".repeat(65)]) {
        for (const what of READS)
          expect(await bothPaths(tx, stranger, drop, what, now)).toEqual({ policy: false, sql: false });
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
        await expect(
          tx.savepoint(
            (sp) => sp`SELECT id FROM app.drops WHERE id IN (${readableDrops(sp, w.cleo.user, now, "media")})`,
          ),
        ).rejects.toThrow();
        await expect(tx.savepoint((sp) => mayReadDrop(sp, w.cleo.user, drop, "caption", now))).rejects.toThrow(
          /use INSTANT_TYPE/,
        );
      });
    } finally {
      await app.end();
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
