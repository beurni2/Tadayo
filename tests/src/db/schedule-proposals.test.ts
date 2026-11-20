// The proposals a club's members confirm (db/migrations/0012_schedule_proposals.sql; spec 05; T6, T33;
// FQ48, FQ55, FQ57, FQ79): one open proposal per club; a proposal's state only ends, its version only
// rises; a member holds at most `days_per_member` days, and two members may hold the same one, which is
// the contest; a day is confirmed once, by one member, only when nobody else holds it, and joins the first
// days' week only as that confirmation; a member who has confirmed, or who has left, changes nothing after;
// and the first days apply only once every member still in the club has confirmed. These are the last
// guards behind the schedule's commands.
//
// Since db/migrations/0013_first_days_revision.sql (FQ102), a proposal's week can be proposed again: its
// `week_revision` moves, the earlier week's rows stay as they were and nothing reads them. The describe
// "a proposal's week, proposed again" was written before that migration, where its tests fail for want of
// the column. Which of 0013's lines each one holds is shown by the PR's deliberate breakages.
//
// Since db/migrations/0015_new_member_day.sql, a membership change is a new member's pick (the founder's
// answers to FQ125 to FQ127; FQ129 to FQ131), whose guards replace 0014's: the describe "a new member's
// pick" was written before that migration, where its tests fail.

import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, checkOneAsAtCommit, joinByRoster, leave, newId, newUser } from "./world.ts";

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
      await expectRefused(
        tx,
        REFUSED.integrity,
        apply,
        /every member it includes who is still in the club has confirmed/,
      );
      await confirm(tx, w, member(w, 0), ["monday"]);
      await confirm(tx, w, member(w, 1), ["tuesday"]);
      await confirm(tx, w, member(w, 2), ["wednesday"]);
      // One member hasn't.
      await expectRefused(
        tx,
        REFUSED.integrity,
        apply,
        /every member it includes who is still in the club has confirmed/,
      );
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
        /every member it includes who is still in the club has confirmed/,
      );
    });
  });

  it("changes the days a member takes only with a new week, while nobody has confirmed (0013; FQ102)", async () => {
    await rolledBack(app, async (tx) => {
      const two = await firstDays(tx, 2);
      // The number alone: the members would hold days proposed for another size.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET days_per_member = 1 WHERE id = ${two.proposal}`,
        /only with a new week/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.schedule_proposals SET days_per_member = 1, version = version + 1 WHERE id = ${two.proposal}`,
        /only with a new week/,
      );
      // With the next week, whatever the members held in the week before: its rows are no longer read.
      await tx`
        UPDATE app.schedule_proposals
           SET days_per_member = 1, week_revision = week_revision + 1, version = version + 1
         WHERE id = ${two.proposal}`;
      await checkAsAtCommit(tx);
      // A member has confirmed one day: the number can't become two under them, new week or not.
      const w = await firstDays(tx, 4);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_proposals
             SET days_per_member = 2, week_revision = week_revision + 1, version = version + 1
           WHERE id = ${w.proposal}`,
        /nobody has confirmed/,
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

describe("a proposal's week, proposed again (0013; FQ102)", () => {
  const next = (tx: Tx, proposal: string) => tx`
    UPDATE app.schedule_proposals SET week_revision = week_revision + 1, version = version + 1 WHERE id = ${proposal}`;
  const holdIn = (tx: Tx, proposal: string, interval: string, weekday: string, week: number) => tx`
    INSERT INTO app.schedule_proposal_days (proposal_id, interval_id, weekday, suggested, held, week_revision)
    VALUES (${proposal}, ${interval}, ${weekday}, true, true, ${week})`;

  it("moves to its next week by one, with the next version, and never back", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      const [first] = await tx`SELECT week_revision FROM app.schedule_proposals WHERE id = ${w.proposal}`;
      expect(first).toEqual({ week_revision: 1 });
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET week_revision = 2 WHERE id = ${w.proposal}`,
        /with its next version/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET week_revision = 3, version = version + 1 WHERE id = ${w.proposal}`,
        /one week at a time/,
      );
      await next(tx, w.proposal);
      const [second] =
        await tx`SELECT week_revision, version, state FROM app.schedule_proposals WHERE id = ${w.proposal}`;
      expect(second).toEqual({ week_revision: 2, version: 2, state: "open" });
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET week_revision = 1, version = version + 1 WHERE id = ${w.proposal}`,
        /one week at a time/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET week_revision = 0, version = version + 1 WHERE id = ${w.proposal}`,
        /one week at a time/,
      );
    });
  });

  it("moves only while the proposal stays open and nobody it includes has confirmed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      // Not as it ends.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_proposals
             SET week_revision = 2, version = version + 1, state = 'superseded', closed_at = ${AT.added}
           WHERE id = ${w.proposal}`,
        /while it stays open/,
      );
      await confirm(tx, w, member(w, 0), ["monday"]);
      await checkAsAtCommit(tx);
      await expectRefused(tx, REFUSED.integrity, (sp) => next(sp, w.proposal), /nobody has confirmed/);
      // A member who confirmed and left: the day is in the week all the same.
      await leave(tx, { user: "", interval: member(w, 0) }, "Member 1", AT.added);
      await expectRefused(tx, REFUSED.integrity, (sp) => next(sp, w.proposal), /nobody has confirmed/);
    });
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 2);
      await tx`
        UPDATE app.schedule_proposals SET state = 'superseded', closed_at = ${AT.added}, version = version + 1
         WHERE id = ${w.proposal}`;
      await expectRefused(tx, REFUSED.integrity, (sp) => next(sp, w.proposal), /has ended/);
    });
  });

  it("writes, changes and deletes a member's days only in the current week", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      // A day chosen, not proposed, in the first week: a row a choice may delete.
      await release(tx, w.proposal, member(w, 3), "thursday");
      await hold(tx, w.proposal, member(w, 3), "saturday");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => holdIn(sp, w.proposal, member(w, 0), "friday", 2),
        /only in its proposal's current week/,
      );
      await next(tx, w.proposal);
      const before = await tx`
        SELECT interval_id, weekday, suggested, held, week_revision FROM app.schedule_proposal_days
         WHERE proposal_id = ${w.proposal} ORDER BY interval_id, weekday`;
      expect(before).toHaveLength(5);
      expect(before.every((row) => row["week_revision"] === 1)).toBe(true);
      // The earlier week's rows: nothing changes them.
      const stale = /only in its proposal's current week/;
      await expectRefused(tx, REFUSED.integrity, (sp) => hold(sp, w.proposal, member(w, 0), "friday"), stale);
      await expectRefused(tx, REFUSED.integrity, (sp) => holdIn(sp, w.proposal, member(w, 0), "friday", 3), stale);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_proposal_days SET held = false
           WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)} AND weekday = 'monday'`,
        stale,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          DELETE FROM app.schedule_proposal_days
           WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 3)} AND weekday = 'saturday'`,
        stale,
      );
      // And no row is moved into the current week.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_proposal_days SET week_revision = 2
           WHERE proposal_id = ${w.proposal} AND interval_id = ${member(w, 0)} AND weekday = 'monday'`,
        stale,
      );
      // The current week takes the same weekday for the same member again: the key has the week in it.
      await holdIn(tx, w.proposal, member(w, 0), "monday", 2);
      await holdIn(tx, w.proposal, member(w, 1), "monday", 2);
      await checkAsAtCommit(tx);
      const after = await tx`
        SELECT interval_id, weekday, suggested, held, week_revision FROM app.schedule_proposal_days
         WHERE proposal_id = ${w.proposal} AND week_revision = 1 ORDER BY interval_id, weekday`;
      expect(after).toEqual(before);
    });
  });

  it("counts a member's days in the current week alone", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await tx`
        UPDATE app.schedule_proposals
           SET days_per_member = 2, week_revision = week_revision + 1, version = version + 1
         WHERE id = ${w.proposal}`;
      // Member 1 held Monday in the first week; two more days in the second are two, not three.
      await holdIn(tx, w.proposal, member(w, 0), "monday", 2);
      await holdIn(tx, w.proposal, member(w, 0), "thursday", 2);
      await checkAsAtCommit(tx);
      await holdIn(tx, w.proposal, member(w, 0), "saturday", 2);
      await expectRefused(tx, REFUSED.integrity, (sp) => checkAsAtCommit(sp), /at most 2/);
    });
  });

  it("confirms the days a member holds in the current week, whoever held them in an earlier one", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await next(tx, w.proposal);
      // In the first week Member 2 held Tuesday. In the second, Member 1 holds it alone.
      await holdIn(tx, w.proposal, member(w, 0), "tuesday", 2);
      await holdIn(tx, w.proposal, member(w, 1), "monday", 2);
      await confirm(tx, w, member(w, 0), ["tuesday"]);
      await checkAsAtCommit(tx);
      // Monday, which Member 1 held in the first week, doesn't join the week as part of that confirmation:
      // the week's own guard reads the current week's rows too.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await sp`
            INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
            VALUES (${w.version}, ${w.club}, 'monday', ${member(w, 0)}, ${FIRST.monday}, ${AT.added})`;
          await checkAsAtCommit(sp);
        },
        /only as the confirmation of/,
      );
    });
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await next(tx, w.proposal);
      // Member 1 holds nothing in the second week: Monday, held in the first, isn't theirs to confirm.
      await confirm(tx, w, member(w, 0), ["monday"]);
      await expectRefused(tx, REFUSED.integrity, (sp) => checkAsAtCommit(sp), /holds 0 of the 1/);
    });
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await next(tx, w.proposal);
      // Both hold Monday in the second week: the contest is the current week's.
      await holdIn(tx, w.proposal, member(w, 0), "monday", 2);
      await holdIn(tx, w.proposal, member(w, 1), "monday", 2);
      await confirm(tx, w, member(w, 0), ["monday"]);
      await expectRefused(tx, REFUSED.integrity, (sp) => checkAsAtCommit(sp), /another member holds it too/);
    });
  });

  it("takes no day another member confirmed in a later week, as in the first", async () => {
    await rolledBack(app, async (tx) => {
      const w = await firstDays(tx, 4);
      await next(tx, w.proposal);
      // In the second week Member 1 holds Tuesday alone and confirms it. Member 2, who held Tuesday in the
      // first week, can't take it in the second, and nor can anyone else.
      await holdIn(tx, w.proposal, member(w, 0), "tuesday", 2);
      await holdIn(tx, w.proposal, member(w, 1), "monday", 2);
      await confirm(tx, w, member(w, 0), ["tuesday"]);
      await checkAsAtCommit(tx);
      const taken = /is taken/;
      await expectRefused(tx, REFUSED.integrity, (sp) => holdIn(sp, w.proposal, member(w, 1), "tuesday", 2), taken);
      await expectRefused(tx, REFUSED.integrity, (sp) => holdIn(sp, w.proposal, member(w, 2), "tuesday", 2), taken);
    });
  });
});

describe("a new member's pick (0015; spec 05; FQ48, FQ55, FQ57, FQ125 to FQ127, FQ129 to FQ131)", () => {
  /** A club of `count` whose first days applied: each member confirmed the days proposed for them. */
  async function applied(tx: Tx, count: 2 | 4 = 2): Promise<FirstDays> {
    const w = await firstDays(tx, count);
    for (const [index, interval] of w.members.entries()) {
      const days = (count === 2 ? [WEEK[index], WEEK[index + 3]] : [WEEK[index]]) as (keyof typeof FIRST)[];
      await confirm(tx, w, interval, days);
    }
    await tx`UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.added} WHERE id = ${w.proposal}`;
    await checkAsAtCommit(tx);
    return w;
  }

  /** The pick's own row, as the command writes it at AT.edited, with what `over` changes. */
  function proposePick(
    tx: Tx,
    club: string,
    over: Record<string, string | number | Date | null> = {},
  ): Promise<string> {
    const row = {
      id: newId("spr"),
      club_id: club,
      reason: "membership_change",
      // The club's local date at AT.edited.
      effective_from: "2026-11-06",
      days_per_member: 2,
      created_at: AT.edited,
      ...over,
    };
    return tx`INSERT INTO app.schedule_proposals ${tx(row)}`.then(() => row.id);
  }

  /** Members who joined the club after its first days, by an exact roster its first member approved. */
  async function joinLater(tx: Tx, w: FirstDays, names: string[]): Promise<string[]> {
    const newcomers: { user: string; label: string }[] = [];
    for (const name of names) newcomers.push({ user: await newUser(tx, name), label: name });
    return joinByRoster(tx, w.club, { user: "", interval: member(w, 0) }, newcomers, AT.added);
  }

  type Pick = FirstDays & { pick: string; sam: string };

  /** A club of two whose first days applied, a third who joined since, and the pick that includes them. */
  async function pick(tx: Tx): Promise<Pick> {
    const w = await applied(tx);
    const [sam] = await joinLater(tx, w, ["Sam"]);
    if (sam === undefined) throw new Error("pick: nobody joined");
    const id = await proposePick(tx, w.club);
    await tx`
      INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
      VALUES (${id}, ${w.club}, ${sam})`;
    // The free days: Wednesday and Saturday.
    for (const weekday of ["wednesday", "saturday"]) await hold(tx, id, sam, weekday, true);
    await checkAsAtCommit(tx);
    return { ...w, pick: id, sam };
  }

  /** A new week from `effectiveFrom`: every day of the latest whose member is still in the club, as it was. */
  async function nextWeek(tx: Tx, club: string, effectiveFrom: string): Promise<string> {
    const version = newId("sched");
    const [latest] = await tx<{ id: string }[]>`
      SELECT id FROM app.schedule_versions WHERE club_id = ${club} ORDER BY effective_from DESC LIMIT 1`;
    await tx`
      INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
      VALUES (${version}, ${club}, ${effectiveFrom}, ${AT.edited})`;
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      SELECT ${version}, a.club_id, a.weekday, a.star_interval_id, a.first_date, a.confirmed_at
        FROM app.schedule_assignments a
        JOIN app.memberships m ON m.interval_id = a.star_interval_id AND m.state = 'active'
       WHERE a.schedule_version_id = ${latest?.id ?? ""}`;
    return version;
  }

  /** Writes `interval`'s confirmed days into `version`, each first opening on its date, as confirm-days.ts does. */
  async function writeDays(
    tx: Tx,
    club: string,
    version: string,
    interval: string,
    firsts: Partial<Record<Weekday, string>>,
    at: Date = AT.edited,
  ): Promise<void> {
    for (const [weekday, firstDate] of Object.entries(firsts)) {
      await tx`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${version}, ${club}, ${weekday}, ${interval}, ${firstDate}, ${at})`;
    }
  }

  const confirmPick = (tx: Tx, id: string, interval: string, at: Date = AT.edited) => tx`
    UPDATE app.schedule_proposal_members SET confirmed_at = ${at}
     WHERE proposal_id = ${id} AND interval_id = ${interval}`;

  /** Sam's confirmation of Wednesday and Saturday, theirs from the next week (FQ130), as confirm-days.ts writes it. */
  async function samConfirms(tx: Tx, w: Pick): Promise<string> {
    const version = await nextWeek(tx, w.club, "2026-11-06");
    await writeDays(tx, w.club, version, w.sam, { wednesday: "2026-11-11", saturday: "2026-11-14" });
    await confirmPick(tx, w.pick, w.sam);
    return version;
  }

  it("is proposed open, at version 1, in its one week, with no week of its own, from the club's local date", async () => {
    await rolledBack(app, async (tx) => {
      const w = await applied(tx);
      const refused = (over: Record<string, string | number | Date | null>, message: RegExp) =>
        expectRefused(tx, REFUSED.integrity, (sp) => proposePick(sp, w.club, over), message);
      await refused({ version: 2 }, /open, at version 1, in its one week/);
      await refused({ state: "superseded", closed_at: AT.edited }, /open, at version 1, in its one week/);
      await refused({ state: "applied", closed_at: AT.edited }, /open, at version 1, in its one week/);
      await refused({ replaced_by: w.proposal }, /open, at version 1, in its one week/);
      await refused({ week_revision: 2 }, /open, at version 1, in its one week/);
      await refused({ schedule_version_id: w.version }, /no week of its own/);
      // The club's local date at AT.edited is Friday 6 November: not the day before or after, nor the Monday after.
      await refused({ effective_from: "2026-11-05" }, /local date it opened on/);
      await refused({ effective_from: "2026-11-07" }, /local date it opened on/);
      await refused({ effective_from: "2026-11-09" }, /local date it opened on/);
      // Its own time zone's date, not UTC's: 23:30 UTC on 30 June is 1 July in London.
      await refused(
        { created_at: new Date("2026-06-30T23:30:00Z"), effective_from: "2026-06-30" },
        /local date it opened on/,
      );
      await proposePick(tx, w.club);
      await checkAsAtCommit(tx);
      // And only one is open at a time.
      await expectRefused(tx, REFUSED.unique, (sp) => proposePick(sp, w.club));
    });
    await rolledBack(app, async (tx) => {
      const w = await applied(tx);
      await proposePick(tx, w.club, { created_at: new Date("2026-06-30T23:30:00Z"), effective_from: "2026-07-01" });
      await checkAsAtCommit(tx);
    });
  });

  it("is proposed only once the club's first days have applied", async () => {
    await rolledBack(app, async (tx) => {
      // The first days are open.
      const open = await firstDays(tx, 2);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => proposePick(sp, open.club),
        /only once the first days of .* have applied/,
      );
      // They ended with no successor, and nothing was ever applied.
      await tx`UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.added} WHERE id = ${open.proposal}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => proposePick(sp, open.club),
        /only once the first days of .* have applied/,
      );
    });
  });

  it("lets its members hold any free day, and never a day of the week in force whose member is still in the club (FQ125, FQ127)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const [ben, maya] = [member(w, 0), member(w, 1)];
      // Monday and Thursday are Ben's, Tuesday and Friday Maya's.
      for (const weekday of ["monday", "tuesday", "thursday", "friday"]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          async (sp) => {
            await release(sp, w.pick, w.sam, "saturday");
            await hold(sp, w.pick, w.sam, weekday);
          },
          new RegExp(`${weekday} is a day of the week in force`),
        );
      }
      // Sam sets Saturday aside, where it stays as proposed, never deleted, and takes it again.
      await release(tx, w.pick, w.sam, "saturday");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          DELETE FROM app.schedule_proposal_days
           WHERE proposal_id = ${w.pick} AND interval_id = ${w.sam} AND weekday = 'saturday'`,
        /set aside, never deleted/,
      );
      await tx`
        UPDATE app.schedule_proposal_days SET held = true
         WHERE proposal_id = ${w.pick} AND interval_id = ${w.sam} AND weekday = 'saturday'`;
      await checkAsAtCommit(tx);
      // Maya leaves: Tuesday and Friday are free from now on, and Sam may hold one.
      await leave(tx, { user: "", interval: maya }, "Maya", AT.edited);
      await release(tx, w.pick, w.sam, "saturday");
      await hold(tx, w.pick, w.sam, "friday");
      await checkAsAtCommit(tx);
      // Ben isn't in it: the pick is for the members with no day.
      await expectRefused(tx, REFUSED.foreignKey, (sp) => hold(sp, w.pick, ben, "saturday"));
    });
  });

  it("never has its week proposed again, or its days each changed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET week_revision = 2, version = version + 1 WHERE id = ${w.pick}`,
        /never proposed again: another pick replaces it/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET days_per_member = 1, version = version + 1 WHERE id = ${w.pick}`,
        /only with a new week/,
      );
    });
  });

  it("is confirmed with exactly the days held, written into the club's latest week at the confirmation's instant (FQ130)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const unwritten = /aren't the days written into the week for them/;
      // Nothing written.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirmPick(sp, w.pick, w.sam);
          await checkAsAtCommit(sp);
        },
        unwritten,
      );
      // Written into a new week, but at another instant than the confirmation's (which the week's own
      // guard refuses too, after this one).
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirmPick(sp, w.pick, w.sam);
          const version = await nextWeek(sp, w.club, "2026-11-06");
          await writeDays(sp, w.club, version, w.sam, { wednesday: "2026-11-11", saturday: "2026-11-14" }, AT.added);
          await checkAsAtCommit(sp);
        },
        unwritten,
      );
      // Written into a week that isn't the latest: a later one started meanwhile (which leaves Sam's days
      // out, so the week's own guard refuses it too: this guard is run alone).
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const version = await nextWeek(sp, w.club, "2026-11-06");
          await nextWeek(sp, w.club, "2026-11-07");
          await writeDays(sp, w.club, version, w.sam, { wednesday: "2026-11-11", saturday: "2026-11-14" });
          await confirmPick(sp, w.pick, w.sam);
          await checkOneAsAtCommit(sp, "schedule_confirmation_guard");
        },
        unwritten,
      );
      const version = await samConfirms(tx, w);
      await checkAsAtCommit(tx);
      const days = await tx`
        SELECT weekday, star_interval_id AS star FROM app.schedule_assignments
         WHERE schedule_version_id = ${version} ORDER BY EXTRACT(isodow FROM first_date)`;
      expect(days).toEqual([
        { weekday: "monday", star: member(w, 0) },
        { weekday: "tuesday", star: member(w, 1) },
        { weekday: "wednesday", star: w.sam },
        { weekday: "thursday", star: member(w, 0) },
        { weekday: "friday", star: member(w, 1) },
        { weekday: "saturday", star: w.sam },
      ]);
      // Once, for good (FQ57's own guard).
      await expectRefused(tx, REFUSED.integrity, (sp) => confirmPick(sp, w.pick, w.sam, AT.reveal));
    });
  });

  it("is refused while another member it includes holds the day too, or with fewer days than it gives each (FQ55, FQ99)", async () => {
    await rolledBack(app, async (tx) => {
      // Four members with a day each, and two who joined since, who both hold Friday.
      const w = await applied(tx, 4);
      const [sam, nina] = await joinLater(tx, w, ["Sam", "Nina"]);
      if (sam === undefined || nina === undefined) throw new Error("nobody joined");
      const id = await proposePick(tx, w.club, { days_per_member: 1 });
      for (const interval of [sam, nina]) {
        await tx`
          INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
          VALUES (${id}, ${w.club}, ${interval})`;
        await hold(tx, id, interval, "friday", true);
      }
      await checkAsAtCommit(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const version = await nextWeek(sp, w.club, "2026-11-06");
          await writeDays(sp, w.club, version, sam, { friday: "2026-11-13" });
          await confirmPick(sp, id, sam);
          await checkAsAtCommit(sp);
        },
        /another member holds it too/,
      );
      // Nina sets Friday aside, and holds none of the one day it gives each.
      await release(tx, id, nina, "friday");
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await confirmPick(sp, id, nina);
          await checkAsAtCommit(sp);
        },
        /holds 0 of the 1 days/,
      );
      const version = await nextWeek(tx, w.club, "2026-11-06");
      await writeDays(tx, w.club, version, sam, { friday: "2026-11-13" });
      await confirmPick(tx, id, sam);
      await checkAsAtCommit(tx);
      // A member who has left confirms nothing.
      await hold(tx, id, nina, "saturday");
      await leave(tx, { user: "", interval: nina }, "Nina", AT.edited);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => confirmPick(sp, id, nina),
        /no longer a member, and confirms nothing/,
      );
    });
  });

  it("lets a member confirm a day of one who confirmed it and left since: a member who left contests nothing (FQ127)", async () => {
    await rolledBack(app, async (tx) => {
      // Four members with a day each, and two who joined since: Sam confirms Friday and leaves.
      const w = await applied(tx, 4);
      const [sam, nina] = await joinLater(tx, w, ["Sam", "Nina"]);
      if (sam === undefined || nina === undefined) throw new Error("nobody joined");
      const id = await proposePick(tx, w.club, { days_per_member: 1 });
      for (const [interval, weekday] of [
        [sam, "friday"],
        [nina, "saturday"],
      ] as const) {
        await tx`
          INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
          VALUES (${id}, ${w.club}, ${interval})`;
        await hold(tx, id, interval, weekday, true);
      }
      const version = await nextWeek(tx, w.club, "2026-11-06");
      await writeDays(tx, w.club, version, sam, { friday: "2026-11-13" });
      await confirmPick(tx, id, sam);
      await checkAsAtCommit(tx);
      await leave(tx, { user: "", interval: sam }, "Sam", AT.edited);
      // Sam's Friday is free: Nina takes it in place of Saturday and confirms it, in a week without Sam's.
      await hold(tx, id, nina, "friday");
      await release(tx, id, nina, "saturday");
      const after = await nextWeek(tx, w.club, "2026-11-07");
      await writeDays(tx, w.club, after, nina, { friday: "2026-11-13" });
      await confirmPick(tx, id, nina);
      await checkAsAtCommit(tx);
    });
  });

  it("lists only members still in the club with no day in its latest week (FQ125, FQ127)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const add = (sp: Tx, interval: string) => sp`
        INSERT INTO app.schedule_proposal_members (proposal_id, club_id, interval_id)
        VALUES (${w.pick}, ${w.club}, ${interval})`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => add(sp, member(w, 0)),
        /has a day in the week, and nobody already in it is asked anything/,
      );
      const [nina, omar] = await joinLater(tx, w, ["Nina", "Omar"]);
      if (nina === undefined || omar === undefined) throw new Error("nobody joined");
      await leave(tx, { user: "", interval: omar }, "Omar", AT.edited);
      await expectRefused(tx, REFUSED.integrity, (sp) => add(sp, omar), /no longer a member, and picks nothing/);
      await add(tx, nina);
      await checkAsAtCommit(tx);
    });
  });

  it("keeps in a week after the first days every day of the week before whose member is still in the club (FQ125, FQ126, FQ131)", async () => {
    const leftOut = /leaves out .*, a day of the week before whose member is still in the club/;
    /** A new week from `effectiveFrom`: the days of the latest whose member is still in the club, as they were, but those `keep` refuses. */
    const copy = async (sp: Tx, club: string, effectiveFrom: string, keep: (weekday: string) => boolean) => {
      const version = newId("sched");
      const [latest] = await sp<{ id: string }[]>`
        SELECT id FROM app.schedule_versions WHERE club_id = ${club} ORDER BY effective_from DESC LIMIT 1`;
      await sp`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${version}, ${club}, ${effectiveFrom}, ${AT.edited})`;
      const days = await sp<{ weekday: string }[]>`
        SELECT a.weekday FROM app.schedule_assignments a
          JOIN app.memberships m ON m.interval_id = a.star_interval_id AND m.state = 'active'
         WHERE a.schedule_version_id = ${latest?.id ?? ""}`;
      const kept = days.map((day) => day.weekday).filter(keep);
      await sp`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        SELECT ${version}, a.club_id, a.weekday, a.star_interval_id, a.first_date, a.confirmed_at
          FROM app.schedule_assignments a
         WHERE a.schedule_version_id = ${latest?.id ?? ""} AND a.weekday = ANY (${kept}::text[])`;
      return version;
    };
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      // A week with no day at all, or without Ben's Thursday.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await copy(sp, w.club, "2026-11-06", () => false);
          await checkAsAtCommit(sp);
        },
        leftOut,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await copy(sp, w.club, "2026-11-06", (weekday) => weekday !== "thursday");
          await checkAsAtCommit(sp);
        },
        leftOut,
      );
      // Nina joins too: four members take one day each, but the two free days are enough for Sam and Nina, so
      // nothing is freed, and a week without Ben's Thursday is still refused (FQ131 frees only where too few are free).
      await joinLater(tx, w, ["Nina"]);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await copy(sp, w.club, "2026-11-06", (weekday) => weekday !== "thursday");
          await checkAsAtCommit(sp);
        },
        leftOut,
      );
      // Maya leaves: a week without Maya's days is kept.
      await leave(tx, { user: "", interval: member(w, 1) }, "Maya", AT.edited);
      await copy(tx, w.club, "2026-11-06", () => true);
      await checkAsAtCommit(tx);
    });
    await rolledBack(app, async (tx) => {
      // Three who hold all six days: each keeps only their first day once a fourth has joined, never before.
      const w = await pick(tx);
      await samConfirms(tx, w);
      await checkAsAtCommit(tx);
      const firsts = (weekday: string) => ["monday", "tuesday", "wednesday"].includes(weekday);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await copy(sp, w.club, "2026-11-07", firsts);
          await checkAsAtCommit(sp);
        },
        leftOut,
      );
      await joinLater(tx, w, ["Nina"]);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await copy(sp, w.club, "2026-11-07", (weekday) => ["tuesday", "wednesday"].includes(weekday));
          await checkAsAtCommit(sp);
        },
        leftOut,
      );
      await copy(tx, w.club, "2026-11-07", firsts);
      await checkAsAtCommit(tx);
    });
  });

  it("applies once every member it includes who is still in the club has confirmed, and never with nobody left", async () => {
    const everyone = /applies once every member it includes who is still in the club has confirmed/;
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const apply = (sp: Tx) => sp`
        UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.edited} WHERE id = ${w.pick}`;
      await expectRefused(tx, REFUSED.integrity, apply, everyone);
      await samConfirms(tx, w);
      await apply(tx);
      await checkAsAtCommit(tx);
    });
    await rolledBack(app, async (tx) => {
      // Sam left before confirming: nobody it includes is left to have confirmed.
      const w = await pick(tx);
      await leave(tx, { user: "", interval: w.sam }, "Sam", AT.edited);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.schedule_proposals SET state = 'applied', version = 2, closed_at = ${AT.edited} WHERE id = ${w.pick}`,
        everyone,
      );
      await tx`
        UPDATE app.schedule_proposals SET state = 'superseded', version = 2, closed_at = ${AT.edited} WHERE id = ${w.pick}`;
      await checkAsAtCommit(tx);
    });
  });

  it("ends superseded, with or without the pick that replaces it, and never changes after", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const successor = newId("spr");
      await tx`
        UPDATE app.schedule_proposals
           SET state = 'superseded', version = 2, closed_at = ${AT.edited}, replaced_by = ${successor}
         WHERE id = ${w.pick}`;
      // Its successor must exist at commit.
      await expectRefused(tx, REFUSED.foreignKey, (sp) => checkAsAtCommit(sp));
      await proposePick(tx, w.club, { id: successor, days_per_member: 1 });
      await checkAsAtCommit(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.schedule_proposals SET replaced_by = NULL WHERE id = ${w.pick}`,
        /has ended and never changes/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => hold(sp, w.pick, w.sam, "friday", true),
        /only while their proposal is open/,
      );
    });
  });

  it("holds in a week after the first days only what its members had in the week before, as it was, and confirmations (FQ126)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await pick(tx);
      const [ben, maya] = [member(w, 0), member(w, 1)];
      const week = async (sp: Tx, effectiveFrom: string): Promise<string> => {
        const version = newId("sched");
        await sp`
          INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
          VALUES (${version}, ${w.club}, ${effectiveFrom}, ${AT.edited})`;
        return version;
      };
      const put = (sp: Tx, version: string, weekday: string, star: string, firstDate: string, at: Date) => sp`
        INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${version}, ${w.club}, ${weekday}, ${star}, ${firstDate}, ${at})`;
      const moved =
        /neither a day its member, still in the club, had in the week before, as it was, nor their confirmation/;
      // Each week below also leaves out days of the week before, which schedule_version_keeps_members
      // refuses (its own test): this guard is run alone.
      const check = (sp: Tx) => checkOneAsAtCommit(sp, "schedule_assignment_follows_week");
      // Ben's Monday given to Maya, given another first date, moved to Wednesday, or given another confirmation.
      for (const [weekday, star, firstDate, at] of [
        ["monday", maya, FIRST.monday, AT.added],
        ["monday", ben, "2026-11-16", AT.added],
        ["wednesday", ben, FIRST.wednesday, AT.added],
        ["monday", ben, FIRST.monday, AT.edited],
      ] as const) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          async (sp) => {
            await put(sp, await week(sp, "2026-11-06"), weekday, star, firstDate, at);
            await check(sp);
          },
          moved,
        );
      }
      // Sam's Wednesday, without Sam's confirmation, or with a day Sam doesn't hold.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await put(sp, await week(sp, "2026-11-06"), "wednesday", w.sam, "2026-11-11", AT.edited);
          await check(sp);
        },
        moved,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const version = await week(sp, "2026-11-06");
          await put(sp, version, "wednesday", w.sam, "2026-11-11", AT.edited);
          await put(sp, version, "saturday", w.sam, "2026-11-14", AT.edited);
          await put(sp, version, "monday", w.sam, "2026-11-16", AT.edited);
          await confirmPick(sp, w.pick, w.sam);
          await check(sp);
        },
        moved,
      );
      // As it was, and Sam's own confirmation: kept.
      await samConfirms(tx, w);
      await checkAsAtCommit(tx);
      // And the week after holds Sam's days as they were too.
      await nextWeek(tx, w.club, "2026-11-07");
      await checkAsAtCommit(tx);
      // Sam's Saturday again in a later week, with Sam's confirmation's instant but not as it was: only the
      // week the confirmation wrote, at that instant, takes a day as a confirmation.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const later = newId("sched");
          await sp`
            INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
            VALUES (${later}, ${w.club}, '2026-11-08', ${AT.added})`;
          await put(sp, later, "saturday", w.sam, "2026-11-21", AT.edited);
          await check(sp);
        },
        moved,
      );
      // Maya leaves: Maya's days, even as they were, are copied into no later week, whose weekday is free.
      await leave(tx, { user: "", interval: maya }, "Maya", AT.edited);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const later = await week(sp, "2026-11-09");
          await sp`
            INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
            SELECT ${later}, a.club_id, a.weekday, a.star_interval_id, a.first_date, a.confirmed_at
              FROM app.schedule_assignments a JOIN app.schedule_versions v ON v.id = a.schedule_version_id
             WHERE v.club_id = ${w.club} AND v.effective_from = '2026-11-07' AND a.star_interval_id = ${maya}`;
          await check(sp);
        },
        moved,
      );
    });
  });
});
