/// <reference lib="esnext.temporal" />
// The caller's clubs and the invitations they have accepted, against Postgres as `tadayo_app` (spec 04,
// 05; T7, T14, T33; FQ16, FQ75; packages/domain/src/clubs/club-list.ts). A club is listed for an active
// interval of the caller's and nothing else of it comes out but its two days, Home's day choice at the
// caller's `now` (tests/src/db/home-days.test.ts tests that choice itself); an invitation is listed for
// the link the caller is bound to, while its candidate hasn't joined, with the club's name and the
// proposer's.

import { randomBytes, randomUUID } from "node:crypto";
import { listClubs, type QuerySql, type ServerNow } from "@tadayo/domain";
import { afterAll, describe, expect, it } from "vitest";
import { CLOSE, invite, PHASES, REVEAL } from "../matrix.ts";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, leave, named, newId, newUser, newWorld, type World } from "./world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const OPENED = AT.opened;
/** The server's time, as only a clock makes it; here the tests stand in for one: Ana's Saturday collecting. */
const NOW = PHASES.collecting as ServerNow;

/** A club of one, its creator, made at `at`: proposed until a roster starts it. Returns the club and the creator's interval. */
async function makeClub(
  tx: WorldTx,
  creator: string,
  name: string,
  at: Date,
): Promise<{ club: string; interval: string }> {
  const [club, interval] = [newId("club"), newId("mem")];
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, ${name}, 'America/New_York', ${interval}, ${at})`;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${interval}, ${club}, ${creator}, 'creator', ${at})`;
  return { club, interval };
}

/** Mo's one invitation, as `invite` made it. */
async function invitationOf(tx: WorldTx, user: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`SELECT id FROM app.invitations WHERE bound_user_id = ${user}`;
  if (!row) throw new Error("no invitation");
  return row.id;
}

/** The club's open revision and its candidate, as `invite` made them. */
async function openRevision(tx: WorldTx, w: World) {
  const [row] = await tx<{ revision: string; candidate: string; label: string }[]>`
    SELECT r.id AS revision, rc.candidate_id AS candidate, rc.label
      FROM app.roster_revisions r JOIN app.roster_revision_candidates rc ON rc.revision_id = r.id
     WHERE r.club_id = ${w.club} AND r.state = 'open'`;
  if (!row) throw new Error("no open revision");
  return row;
}

/** Supersedes the open revision with a new one that lists the same people and candidate, not yet accepted by anyone. */
async function changeTheRoster(tx: WorldTx, w: World): Promise<void> {
  const old = await openRevision(tx, w);
  const next = newId("rev");
  await tx`
    UPDATE app.roster_revisions SET state = 'superseded', version = version + 1, ended_at = ${OPENED}, superseded_by_id = ${next}
     WHERE id = ${old.revision}`;
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${next}, ${w.club}, 'proposal', ${w.ana.interval}, ${OPENED})`;
  for (const member of [w.ana, w.ben, w.cleo]) {
    await tx`INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id) VALUES (${next}, ${w.club}, ${member.interval})`;
  }
  await tx`
    INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
    VALUES (${next}, ${w.club}, ${old.candidate}, ${old.label}, 1)`;
  await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${OPENED} WHERE id = ${next}`;
}

describe("the caller's clubs and invitations (spec 04, 05)", () => {
  it("lists nothing for an account with no club and no invitation: two empty lists (G06-no-club)", async () => {
    await rolledBack(db, async (tx) => {
      const nobody = await newUser(plain(tx), "New");
      expect(await listClubs(tx, nobody, NOW)).toEqual({ clubs: [], invitations: [] });
      const w = await newWorld(plain(tx));
      expect(await listClubs(tx, w.dan.user, NOW)).toEqual({ clubs: [], invitations: [] });
      // An account that doesn't exist is the same as one with nothing.
      expect(await listClubs(tx, newId("acct"), NOW)).toEqual({ clubs: [], invitations: [] });
    });
  });

  it("lists a member's club with their own membership, the active members and the state, and nobody else's (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx), "-a");
      const other = await newWorld(plain(tx), "-b");
      // Ana's Saturday, the club's one day, as each member sees it: next while it collects, open from its reveal.
      const saturday = {
        id: w.day,
        clubId: w.club,
        star: { membershipId: w.ana.interval, displayName: named(w, "Ana"), avatarVersion: null },
        localDate: "2026-11-07",
        revealAt: REVEAL,
        closeAt: CLOSE,
      };
      for (const member of [w.ana, w.ben, w.cleo]) {
        expect(await listClubs(tx, member.user, NOW)).toEqual({
          clubs: [
            {
              id: w.club,
              name: named(w, "Saturday people"),
              timezone: "Europe/London",
              membershipId: member.interval,
              state: "active",
              memberCount: 3,
              openDay: null,
              nextDay: { ...saturday, phase: "collecting" },
            },
          ],
          invitations: [],
        });
        const open = (await listClubs(tx, member.user, PHASES.open as ServerNow)).clubs[0];
        expect([open?.openDay, open?.nextDay]).toEqual([{ ...saturday, phase: "open" }, null]);
      }
      // Another club's member sees only their own.
      expect((await listClubs(tx, other.ana.user, NOW)).clubs.map((club) => club.id)).toEqual([other.club]);
    });
  });

  it("lists only a club with an active interval of the caller's: one they left is never listed, and the members' count drops", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.ben, named(w, "Ben"), OPENED);
      expect((await listClubs(tx, w.ben.user, NOW)).clubs).toEqual([]);
      expect((await listClubs(tx, w.ana.user, NOW)).clubs.map((club) => club.memberCount)).toEqual([2]);
      // An interval ended by a block or an account deletion is not listed either.
      await tx`UPDATE app.memberships SET state = 'account_deleted', left_at = ${OPENED} WHERE interval_id = ${w.cleo.interval}`;
      expect((await listClubs(tx, w.cleo.user, NOW)).clubs).toEqual([]);
      expect((await listClubs(tx, w.ana.user, NOW)).clubs.map((club) => club.memberCount)).toEqual([1]);
    });
  });

  it("says each state the contract has: proposed, active, paused, suspended (FQ16, spec 22)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const stateOf = async (user: string) => (await listClubs(tx, user, NOW)).clubs.map((club) => club.state);
      expect(await stateOf(w.ana.user)).toEqual(["active"]);
      // A club of one that nobody has joined yet is proposed.
      const dan = await makeClub(tx, w.dan.user, "Tuesday people", AT.created);
      expect(await stateOf(w.dan.user)).toEqual(["proposed"]);
      expect((await listClubs(tx, w.dan.user, NOW)).clubs[0]?.memberCount).toBe(1);
      // A started club with one member left is paused.
      await leave(plain(tx), w.ben, named(w, "Ben"), OPENED);
      await leave(plain(tx), w.cleo, named(w, "Cleo"), OPENED);
      expect(await stateOf(w.ana.user)).toEqual(["paused"]);
      // Suspended beats the rest, started or not.
      await tx`UPDATE app.clubs SET suspended_at = ${OPENED} WHERE id IN (${w.club}, ${dan.club})`;
      expect(await stateOf(w.ana.user)).toEqual(["suspended"]);
      expect(await stateOf(w.dan.user)).toEqual(["suspended"]);
    });
  });

  it("lists the oldest membership first, and at most the contract's fifty", async () => {
    await rolledBack(db, async (tx) => {
      const person = await newUser(plain(tx), "Pat");
      for (let index = 0; index < 51; index += 1) {
        // Made out of order (7 and 51 share no factor, so each second from 0 to 50 comes up once), so
        // the order listed is the memberships', not the insertion's.
        const second = (index * 7) % 51;
        await makeClub(
          tx,
          person,
          `Club ${String(second).padStart(2, "0")}`,
          new Date(AT.created.getTime() + second * 1000),
        );
      }
      const listed = (await listClubs(tx, person, NOW)).clubs.map((club) => club.name);
      expect(listed).toHaveLength(50);
      expect(listed).toEqual(Array.from({ length: 50 }, (_, index) => `Club ${String(index).padStart(2, "0")}`));
    });
  });

  it("lists the newest invitation first, and at most the contract's fifty", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await newUser(plain(tx), named(w, "Mo"));
      // Fifty-two invitations bound to one account, made out of order (11 and 52 share no factor, so each
      // second from 0 to 51 comes up once), so the order listed is the invitations', not the insertion's.
      const bySecond = new Map<number, string>();
      for (let index = 0; index < 52; index += 1) {
        const second = (index * 11) % 52;
        const at = new Date(AT.created.getTime() + second * 1000);
        const [candidate, invitation] = [newId("cand"), newId("inv")];
        await tx`
          INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
          VALUES (${candidate}, ${w.club}, ${w.ana.interval}, ${at})`;
        await tx`
          INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
          VALUES (${invitation}, ${candidate}, ${randomBytes(32)}, ${at}, ${new Date(at.getTime() + 7 * 864e5)}, ${mo}, ${at})`;
        bySecond.set(second, invitation);
      }
      const listed = (await listClubs(tx, mo, NOW)).invitations.map((one) => one.id);
      // The fifty newest of the fifty-two, the newest first: seconds 51 down to 2.
      expect(listed).toHaveLength(50);
      expect(listed).toEqual(Array.from({ length: 50 }, (_, index) => bySecond.get(51 - index)));
    });
  });

  it("lists an invitation the caller accepted, with the club's name, the proposer's and where it stands (T7)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await invite(tx, w, OPENED);
      const id = await invitationOf(tx, mo);
      expect(await listClubs(tx, mo, NOW)).toEqual({
        clubs: [],
        invitations: [{ id, clubName: named(w, "Saturday people"), inviterName: named(w, "Ana"), state: "waiting" }],
      });
      // Nobody else sees it: not the club's members, not an account with nothing (T14).
      for (const viewer of [w.ana.user, w.ben.user, w.cleo.user, w.dan.user]) {
        expect((await listClubs(tx, viewer, NOW)).invitations).toEqual([]);
      }
      // The invitation names the club and the proposer and nothing more: no roster, no approval, no count (T33).
      const listing = await listClubs(tx, mo, NOW);
      expect(Object.keys(listing.invitations[0] ?? {}).sort()).toEqual(["clubName", "id", "inviterName", "state"]);
    });
  });

  it("says the roster changed once the open revision is not the one they accepted, and that it didn't go ahead once the proposal ended", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await invite(tx, w, OPENED);
      const stateOf = async () => (await listClubs(tx, mo, NOW)).invitations.map((one) => one.state);
      expect(await stateOf()).toEqual(["waiting"]);
      await changeTheRoster(tx, w);
      expect(await stateOf()).toEqual(["roster_changed"]);
      const { candidate } = await openRevision(tx, w);
      await tx`UPDATE app.candidates SET state = 'ended', ended_at = ${OPENED} WHERE id = ${candidate}`;
      expect(await stateOf()).toEqual(["did_not_go_ahead"]);
    });
  });

  it("stops listing an invitation once its candidate has joined: it is a club then, not an invitation", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // Ben and Cleo each joined with their own bound link.
      for (const member of [w.ben, w.cleo]) {
        const [link] = await tx<{ id: string }[]>`SELECT id FROM app.invitations WHERE bound_user_id = ${member.user}`;
        expect(link).toBeDefined();
        expect((await listClubs(tx, member.user, NOW)).invitations).toEqual([]);
        expect((await listClubs(tx, member.user, NOW)).clubs).toHaveLength(1);
      }
    });
  });

  it("names the inviter by FQ75's rule: the live name while their interval is active, the name it ended with after, none for a deleted account", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const mo = await invite(tx, w, OPENED);
      const inviter = async () => (await listClubs(tx, mo, NOW)).invitations.map((one) => one.inviterName);
      expect(await inviter()).toEqual([named(w, "Ana")]);
      // While active, a new name shows at once.
      await tx`UPDATE app.users SET display_name = ${named(w, "Anna")} WHERE id = ${w.ana.user}`;
      expect(await inviter()).toEqual([named(w, "Anna")]);
      // After the interval ends it shows the name it ended with, whatever the account is called now.
      await leave(plain(tx), w.ana, named(w, "Anna"), OPENED);
      await tx`UPDATE app.users SET display_name = ${named(w, "Annabel")} WHERE id = ${w.ana.user}`;
      expect(await inviter()).toEqual([named(w, "Anna")]);
      // A deleted account leaves no name to show, so the invitation has none to list.
      const gone = await newWorld(plain(tx), "-gone");
      const stranger = await invite(tx, gone, OPENED);
      expect((await listClubs(tx, stranger, NOW)).invitations).toHaveLength(1);
      await tx`UPDATE app.memberships SET state = 'account_deleted', left_at = ${OPENED} WHERE interval_id = ${gone.ana.interval}`;
      expect((await listClubs(tx, stranger, NOW)).invitations).toEqual([]);
    });
  });

  it("reads both lists and the clubs' days in one statement, so they are one snapshot", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // Counts the statements sent: postgres.js sends a statement when it is awaited (its `then` is
      // called, once or more), and a fragment built with the same tagged template, such as the day
      // choice's, never is. So it counts the queries awaited, which is what reaches Postgres; a count of
      // calls would count the fragments too. `QuerySql` returns a `PromiseLike`, so awaiting is the only way
      // `listClubs` can send a statement.
      const sent = new Set<unknown>();
      let made = 0;
      const counting: QuerySql = (template, ...values) => {
        const query = (tx as unknown as QuerySql)(template, ...values);
        made += 1;
        const then = query.then.bind(query);
        Object.defineProperty(query, "then", {
          value: (...args: Parameters<typeof then>) => {
            sent.add(query);
            return then(...args);
          },
        });
        return query;
      };
      const listing = await listClubs(counting, w.ana.user, NOW);
      expect(sent.size).toBe(1);
      // The fragments were made with it too, and weren't sent.
      expect(made).toBeGreaterThan(1);
      expect(listing.clubs.map((club) => club.nextDay?.id)).toEqual([w.day]);
    });
  });

  it("refuses an account id that isn't one before it reaches Postgres", async () => {
    await rolledBack(db, async (tx) => {
      for (const bad of ["", "x'; DROP TABLE app.users; --", "a".repeat(65), randomUUID() + " "]) {
        await expect(listClubs(tx, bad, NOW), JSON.stringify(bad)).rejects.toThrow(TypeError);
      }
      await expect(listClubs(tx, 7 as unknown as string, NOW)).rejects.toThrow(TypeError);
    });
  });
});
