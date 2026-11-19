// The proposals a club's members confirm (db/migrations/0012_schedule_proposals.sql; spec 05; T6, T33;
// FQ48, FQ55, FQ57, FQ79): one open proposal per club; a proposal's state only ends, its version only
// rises; a member holds at most `days_per_member` days, and two members may hold the same one, which is
// the contest; a day is confirmed once, by one member, only when nobody else holds it, and joins the first
// days' week only as that confirmation; a member who has confirmed, or who has left, changes nothing after;
// and the first days apply only once every member still in the club has confirmed. These are the last
// guards behind the schedule's commands.

import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, joinByRoster, leave, newId, newUser } from "./world.ts";

const app = appSql();
// A pool of its own for watching locks while two transactions hold `app`'s two connections.
const watcher = appSql();
afterAll(async () => {
  await app.end();
  await watcher.end();
});

const WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Weekday = (typeof WEEK)[number];
const FIRST = {
  monday: "2026-11-09",
  tuesday: "2026-11-10",
  wednesday: "2026-11-11",
  thursday: "2026-11-12",
  friday: "2026-11-13",
};

interface FirstDays {
  club: string;
  /** The members' intervals, in the order they joined. */
  members: string[];
  version: string;
  proposal: string;
}

/** A club of `count` in its first days: each member holds the days spec 05 proposes, nobody has confirmed. */
async function firstDays(tx: Tx, count: 2 | 3 | 4 | 6): Promise<FirstDays> {
  const users: string[] = [];
  for (let index = 0; index < count; index += 1) users.push(await newUser(tx, `Member ${String(index + 1)}`));
  const [creator, ...others] = users;
  if (creator === undefined) throw new Error("firstDays: no creator");
  const club = newId("club");
  const first = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, 'First days', 'Europe/London', ${first}, ${AT.created})
  `;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${first}, ${club}, ${creator}, 'creator', ${AT.created})
  `;
  const joined = await joinByRoster(
    tx,
    club,
    { user: creator, interval: first },
    others.map((user, index) => ({ user, label: `Member ${String(index + 2)}` })),
    AT.joined,
  );
  await tx`UPDATE app.clubs SET activated_at = ${AT.joined} WHERE id = ${club}`;
  const members = [first, ...joined];
  const version = newId("sched");
  const proposal = newId("spr");
  const perMember = count <= 3 ? 2 : 1;
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${club}, '2026-11-01', ${AT.joined})
  `;
  await tx`
    INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
    VALUES (${proposal}, ${club}, 'activation', '2026-11-01', ${perMember}, ${version}, ${AT.joined})
  `;
  for (const [index, interval] of members.entries()) {
    await tx`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${proposal}, ${club}, ${interval})
    `;
    for (let nth = 0; nth < perMember; nth += 1) {
      await hold(tx, proposal, interval, WEEK[index + nth * 3] as Weekday, true);
    }
  }
  await checkAsAtCommit(tx);
  return { club, members, version, proposal };
}

function hold(tx: Tx, proposal: string, interval: string, weekday: string, suggested = false) {
  return tx`
    INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
    VALUES (${proposal}, ${interval}, ${weekday}, ${suggested}, true)
  `;
}

/** Sets a held day aside: a proposed one stays as proposed, any other row goes. */
async function release(tx: Tx, proposal: string, interval: string, weekday: string): Promise<void> {
  await tx`
    UPDATE app.schedule_proposal_days SET held = false
     WHERE proposal_id = ${proposal} AND interval_id = ${interval} AND weekday = ${weekday} AND suggested
  `;
  await tx`
    DELETE FROM app.schedule_proposal_days
     WHERE proposal_id = ${proposal} AND interval_id = ${interval} AND weekday = ${weekday} AND NOT suggested
  `;
}

/** Confirms `interval`'s days as the command does: the member's row, then one assignment per day. */
async function confirm(tx: Tx, w: FirstDays, interval: string, days: readonly (keyof typeof FIRST)[]): Promise<void> {
  await tx`
    UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.added}
     WHERE proposal_id = ${w.proposal} AND interval_id = ${interval}
  `;
  for (const weekday of days) {
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      VALUES (${w.version}, ${w.club}, ${weekday}, ${interval}, ${FIRST[weekday]}, ${AT.added})
    `;
  }
}

const member = (w: FirstDays, index: number): string => {
  const interval = w.members[index];
  if (interval === undefined) throw new Error(`no member ${String(index)}`);
  return interval;
};

describe("a proposal (spec 05; T33)", () => {
  it("opens for a club in its first days, with each member's proposed days held", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const rows = await tx`
        SELECT weekday, suggested, held FROM app.schedule_proposal_days WHERE proposal_id = ${w.proposal} ORDER BY weekday
      `;
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row["suggested"] === true && row["held"] === true)).toBe(true);
      const [proposal] =
        await tx`SELECT state, version, closed_at FROM app.schedule_proposals WHERE id = ${w.proposal}`;
      expect(proposal).toEqual({ state: "open", version: 1, closed_at: null });
    });
  });

  it("is the club's only open one", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
          INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
          VALUES (${newId("spr")}, ${w.club}, 'activation', '2026-11-01', 1, ${w.version}, ${AT.added})
        `,
      );
    });
  });

  it("names the week its confirmed days join when it is the first days'", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, created_at)
          VALUES (${newId("spr")}, ${w.club}, 'activation', '2026-11-01', 1, ${AT.added})
        `,
      );
    });
  });

  it("takes one or two days per member, and a week of its own club", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const other = await firstDays(tx, 4);
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
          VALUES (${newId("spr")}, ${w.club}, 'activation', '2026-11-01', 3, ${w.version}, ${AT.added})
        `,
      );
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        (sp) => sp`
          INSERT INTO app.schedule_proposals (id, club_id, reason, effective_from, days_per_member, schedule_version_id, created_at)
          VALUES (${newId("spr")}, ${w.club}, 'activation', '2026-11-01', 1, ${other.version}, ${AT.added})
        `,
      );
    });
  });

  it("ends once, with its closing time and the next version, and never changes after (T33)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      // (Ended here by being superseded: applying has a rule of its own, in the next test.)
      // A state can't move without its version, nor its version fall, nor end without a time.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposals SET state = 'superseded', closed_at = ${AT.added} WHERE id = ${w.proposal}`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposals SET state = 'superseded', version = 3, closed_at = ${AT.added} WHERE id = ${w.proposal}`,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
        UPDATE app.schedule_proposals SET state = 'superseded', version = 2 WHERE id = ${w.proposal}`,
      );
      await tx`UPDATE app.schedule_proposals SET version = 2 WHERE id = ${w.proposal}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposals SET version = 1 WHERE id = ${w.proposal}`,
      );
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 3, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      for (const change of [
        "state = 'open', closed_at = NULL",
        "state = 'applied'",
        "version = 4",
        "days_per_member = 2",
      ]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`
          UPDATE app.schedule_proposals SET ${sp.unsafe(change)} WHERE id = ${w.proposal}`,
        );
      }
    });
  });

  it("applies the first days only once every member still in the club has confirmed, and at least one has (FQ102)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const apply = (sp: Tx) => sp`
        UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      // Nobody has confirmed.
      await expectRefused(tx, REFUSED.integrity, apply, /every member still in the club has confirmed/);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await confirm(tx, w, member(w, 1), ["tuesday"]);
      await confirm(tx, w, member(w, 2), ["wednesday"]);
      // One member hasn't.
      await expectRefused(tx, REFUSED.integrity, apply, /every member still in the club has confirmed/);
      // That member leaves: everyone still in the club has confirmed.
      await leave(tx, { user: "", interval: member(w, 3) }, "Member 4", AT.added);
      await apply(tx);
      await checkAsAtCommit(tx);
    });
    await rolledBack(app, async (tx) => {
      // Everyone has left: nobody is there to have confirmed.
      const w = await firstDays(tx, 2);
      await confirm(tx, w, member(w, 0), ["monday", "thursday"]);
      for (const index of [0, 1]) await leave(tx, { user: "", interval: member(w, index) }, "Gone", AT.added);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`,
        /every member still in the club has confirmed/,
      );
    });
  });

  it("changes the days a member takes only while nobody has confirmed and nobody holds more", async () => {
    await rolledBack(app, async (tx) => {
      const two = await firstDays(tx, 2);
      // Each member of a pair holds two days: one a member is fewer than they hold.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET days_per_member = 1 WHERE id = ${two.proposal}`,
        /nobody has confirmed or holds more/,
      );
      const w = await firstDays(tx, 4);
      await tx`UPDATE app.schedule_proposals SET days_per_member = 2 WHERE id = ${w.proposal}`;
      await tx`UPDATE app.schedule_proposals SET days_per_member = 1 WHERE id = ${w.proposal}`;
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      // A member who left holds nothing, whatever their rows say: only the other's two days count.
      const pair = await firstDays(tx, 2);
      await leave(tx, { user: "", interval: member(pair, 1) }, "Member 2", AT.added);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET days_per_member = 1 WHERE id = ${pair.proposal}`,
        /nobody has confirmed or holds more/,
      );
      await release(tx, pair.proposal, member(pair, 0), "thursday");
      await tx`UPDATE app.schedule_proposals SET days_per_member = 1 WHERE id = ${pair.proposal}`;
      await checkAsAtCommit(tx);
      // A member has confirmed one day: the number can't become two under them.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET days_per_member = 2 WHERE id = ${w.proposal}`,
        /nobody has confirmed or holds more/,
      );
    });
  });

  it("keeps its club, reason, start, week and making time, and is never deleted", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      for (const change of [
        "reason = 'membership_change'",
        "effective_from = '2026-11-02'",
        "schedule_version_id = NULL",
        "created_at = created_at + interval '1 second'",
      ]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`
          UPDATE app.schedule_proposals SET ${sp.unsafe(change)} WHERE id = ${w.proposal}`,
        );
      }
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.schedule_proposals WHERE id = ${w.proposal}`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        DELETE FROM app.schedule_proposal_members WHERE proposal_id = ${w.proposal}`,
      );
      for (const table of ["schedule_proposals", "schedule_proposal_members", "schedule_proposal_days"]) {
        await expectRefused(tx, REFUSED.integrity, (sp) => sp`TRUNCATE app.${sp.unsafe(table)} CASCADE`);
      }
    });
  });

  it("names its successor only when it was replaced", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
        UPDATE app.schedule_proposals SET replaced_by = ${w.proposal} WHERE id = ${w.proposal}`,
      );
      // Applied, with every member confirmed, it still names no successor.
      await expectRefused(tx, REFUSED.check, async (sp) => {
        for (const [index, weekday] of (["monday", "tuesday", "wednesday", "thursday"] as const).entries()) {
          await confirm(sp, w, member(w, index), [weekday]);
        }
        await sp`
        UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.added}, replaced_by = ${w.proposal}
         WHERE id = ${w.proposal}`;
      });
      // Another proposal's id, on one that is still open: refused at once, before the deferred key is looked at.
      const other = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
        UPDATE app.schedule_proposals SET replaced_by = ${other.proposal} WHERE id = ${w.proposal}`,
      );
    });
  });
});

describe("a proposal's members", () => {
  it("are members of its club, each once", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const other = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        (sp) => sp`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
        VALUES (${w.proposal}, ${w.club}, ${member(other, 0)})`,
      );
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
        VALUES (${w.proposal}, ${w.club}, ${member(w, 0)})`,
      );
    });
  });

  it("start unconfirmed, confirm once, and never take it back (FQ57)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const user = await newUser(tx, "Late");
      const [late] = await joinByRoster(
        tx,
        w.club,
        { user: "", interval: member(w, 0) },
        [{ user, label: "Late" }],
        AT.added,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id, confirmed_at)
        VALUES (${w.proposal}, ${w.club}, ${late ?? ""}, ${AT.added})`,
      );
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposal_members SET confirmed_at = NULL WHERE interval_id = ${member(w, 0)}`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.edited} WHERE interval_id = ${member(w, 0)}`,
      );
    });
  });

  it("join and confirm only while the proposal is open", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const user = await newUser(tx, "Late");
      const [late] = await joinByRoster(
        tx,
        w.club,
        { user: "", interval: member(w, 0) },
        [{ user, label: "Late" }],
        AT.added,
      );
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
        VALUES (${w.proposal}, ${w.club}, ${late ?? ""})`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.added} WHERE interval_id = ${member(w, 0)}`,
      );
    });
  });
});

describe("a member who has left (FQ102)", () => {
  it("confirms nothing, and changes no hold", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await leave(tx, { user: "", interval: member(w, 0) }, "Member 1", AT.added);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => confirm(sp, w, member(w, 0), ["monday"]),
        /no longer a member, and confirms nothing/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => release(sp, w.proposal, member(w, 0), "monday"),
        /no longer a member, and holds nothing/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => hold(sp, w.proposal, member(w, 0), "friday"),
        /no longer a member, and holds nothing/,
      );
    });
  });
});

describe("the days members hold (T6; FQ48, FQ55)", () => {
  it("are never Sunday, and each row is proposed, held or both", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await expectRefused(tx, REFUSED.check, (sp) => hold(sp, w.proposal, member(w, 0), "sunday"));
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
        INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held)
        VALUES (${w.proposal}, ${member(w, 0)}, 'saturday', false, false)`,
      );
      // A day that wasn't proposed for its member and is set aside leaves no row behind.
      await expectRefused(tx, REFUSED.check, async (sp) => {
        await hold(sp, w.proposal, member(w, 0), "saturday");
        await sp`
          UPDATE app.schedule_proposal_days SET held = false
           WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)} AND weekday = 'saturday'`;
      });
    });
  });

  it("may be the same day for two or more members: a contest is kept, never settled (FQ55)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      // Members 1 and 3 choose member 2's Tuesday instead of their own days.
      for (const index of [0, 2]) {
        await release(tx, w.proposal, member(w, index), WEEK[index] as Weekday);
        await hold(tx, w.proposal, member(w, index), "tuesday");
      }
      await checkAsAtCommit(tx);
      const [count] = await tx`
        SELECT count(*)::int AS holders FROM app.schedule_proposal_days
         WHERE proposal_id = ${w.proposal} AND weekday = 'tuesday' AND held`;
      expect(count).toEqual({ holders: 3 });
      // The proposed days they set aside stay as proposed, held by nobody.
      const [aside] = await tx`
        SELECT suggested, held FROM app.schedule_proposal_days
         WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)} AND weekday = 'monday'`;
      expect(aside).toEqual({ suggested: true, held: false });
    });
  });

  it("are at most days_per_member for each member, counted at commit", async () => {
    await rolledBack(app, async (tx) => {
      const one = await firstDays(tx, 4);
      await hold(tx, one.proposal, member(one, 0), "saturday");
      await expectRefused(tx, REFUSED.integrity, (sp) => checkAsAtCommit(sp), /at most 1/);
    });
    await rolledBack(app, async (tx) => {
      const two = await firstDays(tx, 2);
      // Swapping a day is a hold and a release, in either order, within one transaction.
      await hold(tx, two.proposal, member(two, 0), "saturday");
      await release(tx, two.proposal, member(two, 0), "monday");
      await checkAsAtCommit(tx);
      await hold(tx, two.proposal, member(two, 0), "wednesday");
      await expectRefused(tx, REFUSED.integrity, (sp) => checkAsAtCommit(sp), /at most 2/);
    });
  });

  it("keep what was proposed: a proposed day is set aside, never deleted or made unproposed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        DELETE FROM app.schedule_proposal_days WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)}`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposal_days SET suggested = false
         WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)}`,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
        UPDATE app.schedule_proposal_days SET weekday = 'saturday'
         WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)}`,
      );
    });
  });

  it("belong to a member of the proposal", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const other = await firstDays(tx, 4);
      await expectRefused(tx, REFUSED.foreignKey, (sp) => hold(sp, w.proposal, member(other, 0), "saturday"));
    });
  });

  it("never take a day another member has confirmed (FQ48: only a confirmed day is taken)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      await release(tx, w.proposal, member(w, 1), "tuesday");
      await expectRefused(tx, REFUSED.integrity, (sp) => hold(sp, w.proposal, member(w, 1), "monday"), /confirmed/);
    });
  });

  it("don't change once their member has confirmed (FQ57), or once the proposal has ended", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      await expectRefused(tx, REFUSED.integrity, (sp) => release(sp, w.proposal, member(w, 0), "monday"), /confirmed/);
      await expectRefused(tx, REFUSED.integrity, (sp) => hold(sp, w.proposal, member(w, 0), "saturday"), /confirmed/);
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      await expectRefused(tx, REFUSED.integrity, (sp) => release(sp, w.proposal, member(w, 1), "tuesday"), /open/);
      await expectRefused(tx, REFUSED.integrity, (sp) => hold(sp, w.proposal, member(w, 1), "saturday"), /open/);
    });
  });
});

describe("a confirmation (T6; book p11; FQ55, FQ99)", () => {
  it("stands when the member holds days_per_member days alone, each written into the week", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      const pair = await firstDays(tx, 2);
      await confirm(tx, pair, member(pair, 0), ["monday", "thursday"]);
      await checkAsAtCommit(tx);
    });
  });

  it("is refused while another member holds the day too, by choice or by proposal alone (FQ55)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      // Member 1 chooses member 2's Tuesday: neither can confirm it.
      await release(tx, w.proposal, member(w, 0), "monday");
      await hold(tx, w.proposal, member(w, 0), "tuesday");
      await checkAsAtCommit(tx);
      for (const index of [0, 1]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          async (sp) => {
            await confirm(sp, w, member(w, index), ["tuesday"]);
            await checkAsAtCommit(sp);
          },
          /holds it too/,
        );
      }
    });
  });

  it("is refused for one day of two: both are confirmed at once (FQ99)", async () => {
    await rolledBack(app, async (tx) => {
      const pair = await firstDays(tx, 2);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirm(sp, pair, member(pair, 0), ["monday"]);
          await checkAsAtCommit(sp);
        },
        /2 days/,
      );
      // And with only one day held.
      await release(tx, pair.proposal, member(pair, 0), "thursday");
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirm(sp, pair, member(pair, 0), ["monday"]);
          await checkAsAtCommit(sp);
        },
        /2 days/,
      );
    });
  });

  it("is refused without its days in the week, or with another day there than the member holds", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirm(sp, w, member(w, 0), []);
          await checkAsAtCommit(sp);
        },
        /week/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirm(sp, w, member(w, 0), ["wednesday"]);
          await checkAsAtCommit(sp);
        },
        /week/,
      );
    });
  });

  it("isn't blocked by a member who has left: they hold nothing (FQ102)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await release(tx, w.proposal, member(w, 0), "monday");
      await hold(tx, w.proposal, member(w, 0), "tuesday");
      await leave(tx, { user: "", interval: member(w, 1) }, "Member 2", AT.added);
      await confirm(tx, w, member(w, 0), ["tuesday"]);
      await checkAsAtCommit(tx);
    });
  });

  it("is the only way a day joins the first days' week: no row for an unconfirmed member, for a day its star doesn't hold, or after the confirmation", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const write = (sp: Tx, weekday: keyof typeof FIRST, interval: string, at: Date) => sp`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${w.version}, ${w.club}, ${weekday}, ${interval}, ${FIRST[weekday]}, ${at})`;
      const refusedAtCommit = (weekday: keyof typeof FIRST, interval: string, at: Date) =>
        expectRefused(
          tx,
          REFUSED.integrity,
          async (sp) => {
            await write(sp, weekday, interval, at);
            await checkAsAtCommit(sp);
          },
          /only as the confirmation of/,
        );
      // Monday is contested and nobody has confirmed.
      await hold(tx, w.proposal, member(w, 1), "monday");
      await release(tx, w.proposal, member(w, 1), "tuesday");
      await refusedAtCommit("monday", member(w, 0), AT.added);
      // Thursday, for a member who holds only Wednesday.
      await refusedAtCommit("thursday", member(w, 2), AT.added);
      // Wednesday's member confirms it; then a second day for them, a second later, or at the same instant.
      await confirm(tx, w, member(w, 2), ["wednesday"]);
      await checkAsAtCommit(tx);
      await refusedAtCommit("tuesday", member(w, 2), new Date(AT.added.getTime() + 1000));
      await refusedAtCommit("tuesday", member(w, 2), AT.added);
      // Thursday's member set it aside for Friday and confirms Friday: Thursday, still marked as proposed
      // for them and no longer held, doesn't join the week with it.
      await release(tx, w.proposal, member(w, 3), "thursday");
      await hold(tx, w.proposal, member(w, 3), "friday");
      await confirm(tx, w, member(w, 3), ["friday"]);
      await checkAsAtCommit(tx);
      await refusedAtCommit("thursday", member(w, 3), AT.added);
      // The confirmed day's own row, at another instant than the confirmation's, in a fresh week. The
      // member's side refuses this one first (`schedule_confirmation_guard`: the days written with the
      // confirmation's instant aren't the days held), and the week's key leaves no second row for the
      // day, so the two guards can't be told apart here: it is kept as the scenario the review named.
      const other = await firstDays(tx, 4);
      await expectRefused(tx, REFUSED.integrity, async (sp) => {
        await sp`
            UPDATE app.schedule_proposal_members SET confirmed_at = ${AT.added}
             WHERE proposal_id = ${other.proposal} AND interval_id = ${member(other, 0)}`;
        await sp`
            INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
            VALUES (${other.version}, ${other.club}, 'monday', ${member(other, 0)}, '2026-11-09', ${new Date(AT.added.getTime() + 1000)})`;
        await checkAsAtCommit(sp);
      });
    });
  });

  it("leaves a week no first days made to its own rules", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const version = newId("sched");
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
      await tx`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${version}, ${w.club}, '2026-11-08', ${AT.added})`;
      await tx`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${version}, ${w.club}, 'monday', ${member(w, 0)}, '2026-11-09', ${AT.added})`;
      await checkAsAtCommit(tx);
    });
  });

  it("is of one member per day: the week's own key refuses a second", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${w.version}, ${w.club}, 'monday', ${member(w, 1)}, '2026-11-09', ${AT.added})`,
      );
    });
  });
});

describe("a hold and a confirmation of the same day, at once (T6; FQ48, FQ55)", () => {
  /**
   * Runs `first` in a transaction that stays open until `second`, in another, has queued behind one of
   * its locks; then `first` commits and `second` goes on. Returns how each ended.
   */
  async function oneBehindTheOther(
    first: (tx: Tx) => Promise<void>,
    second: (tx: Tx) => Promise<void>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    let holding: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      holding = resolve;
    });
    let queuing: (pid: number) => void = () => undefined;
    const waiter = new Promise<number>((resolve) => {
      queuing = resolve;
    });
    let letGo: () => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const one = app.begin(async (tx) => {
      await first(tx);
      holding();
      await release;
    });
    await held;
    const two = app.begin(async (tx) => {
      const [me] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
      if (!me) throw new Error("no backend");
      queuing(me.pid);
      await second(tx);
    });
    const pid = await waiter;
    // pg_locks is read live, on a connection of its own.
    for (let tries = 0; ; tries += 1) {
      const [row] = await watcher<{ queued: boolean }[]>`
        SELECT EXISTS (SELECT FROM pg_catalog.pg_locks WHERE pid = ${pid} AND NOT granted) AS queued`;
      if (row?.queued) break;
      if (tries === 1000) {
        letGo();
        await Promise.allSettled([one, two]);
        throw new Error("the second transaction never queued behind the first");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    letGo();
    return Promise.allSettled([one, two]);
  }

  const takeMonday = async (tx: Tx, w: FirstDays): Promise<void> => {
    await release(tx, w.proposal, member(w, 1), "tuesday");
    await hold(tx, w.proposal, member(w, 1), "monday");
  };

  it("refuses the hold that waited for the confirmation: the day is taken", async () => {
    const w = await app.begin((tx) => firstDays(tx, 4));
    const [confirmed, taken] = await oneBehindTheOther(
      (tx) => confirm(tx, w, member(w, 0), ["monday"]),
      (tx) => takeMonday(tx, w),
    );
    expect(confirmed?.status).toBe("fulfilled");
    expect(taken).toMatchObject({ status: "rejected", reason: { code: REFUSED.integrity } });
    expect(String((taken as PromiseRejectedResult).reason)).toMatch(/monday is confirmed/);
    const holders = await app<{ interval_id: string }[]>`
      SELECT interval_id FROM app.schedule_proposal_days WHERE proposal_id = ${w.proposal} AND weekday = 'monday' AND held`;
    expect(holders.map((row) => row.interval_id)).toEqual([member(w, 0)]);
  });

  it("puts two changes of one member's holds in one order, so the count at commit sees both (spec 05)", async () => {
    const w = await app.begin(async (tx) => {
      const made = await firstDays(tx, 4);
      await release(tx, made.proposal, member(made, 0), "monday");
      return made;
    });
    // Member 1 holds nothing now. Two transactions each take one day for them: one a member, so one stands.
    const [one, two] = await oneBehindTheOther(
      (tx) => hold(tx, w.proposal, member(w, 0), "friday").then(() => undefined),
      (tx) => hold(tx, w.proposal, member(w, 0), "saturday").then(() => undefined),
    );
    expect(one?.status).toBe("fulfilled");
    expect(two).toMatchObject({ status: "rejected", reason: { code: REFUSED.integrity } });
    expect(String((two as PromiseRejectedResult).reason)).toMatch(/holds at most 1 days/);
    const held = await app<{ weekday: string }[]>`
      SELECT weekday::text AS weekday FROM app.schedule_proposal_days
       WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)} AND held`;
    expect(held.map((row) => row.weekday)).toEqual(["friday"]);
  });

  it("refuses the confirmation that waited for the hold: another member holds the day too", async () => {
    const w = await app.begin((tx) => firstDays(tx, 4));
    const [taken, confirmed] = await oneBehindTheOther(
      (tx) => takeMonday(tx, w),
      (tx) => confirm(tx, w, member(w, 0), ["monday"]),
    );
    expect(taken?.status).toBe("fulfilled");
    expect(confirmed).toMatchObject({ status: "rejected", reason: { code: REFUSED.integrity } });
    expect(String((confirmed as PromiseRejectedResult).reason)).toMatch(/holds it too/);
    const written = await app`SELECT weekday FROM app.schedule_assignments WHERE schedule_version_id = ${w.version}`;
    expect(written).toHaveLength(0);
    const [row] = await app`
      SELECT confirmed_at FROM app.schedule_proposal_members WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)}`;
    expect(row).toEqual({ confirmed_at: null });
  });
});
