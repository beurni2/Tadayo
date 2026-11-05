// T8: a drop's audience is the set of active membership intervals in its club at the commit,
// the author's and the star's among them, written once and sealed. Nobody joins it afterwards,
// not even a member who joined the club before the reveal, and no row of it ever changes. All
// of this runs as `tadayo_app`, the API's own role, which owns the tables.

import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, joinByRoster, leave, newWorld, writeAudience } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

const SEALED = /sealed .*nobody joins it afterwards \(T8\)/;

describe("T8: the audience is sealed at the commit", () => {
  it("commits a drop whose audience is every active member, sealed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { caption: "Your birthday picnic" });
      await checkAsAtCommit(tx);
      // Sorted here, not by the server, whose collation (C locally, en_US in ci) orders random ids differently.
      const rows = await tx<{ interval_id: string }[]>`
        SELECT interval_id FROM app.drop_audience WHERE drop_id = ${drop}
      `;
      expect(rows.map((row) => row.interval_id).sort()).toEqual(
        [w.ana.interval, w.ben.interval, w.cleo.interval].sort(),
      );
    });
  });

  it("refuses a late audience row once the drop is sealed, for a member who joined after the commit", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [dan] = await joinByRoster(tx, w.club, w.ana, [{ user: w.dan.user, label: "Dan" }], AT.edited);
      if (!dan) throw new Error("Dan didn't join");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${dan})`,
        SEALED,
      );
    });
  });

  it("refuses a late audience row even in the transaction that sealed it", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { unsealed: true });
      await tx`UPDATE app.drops SET audience_sealed_at = ${AT.added} WHERE id = ${drop}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${w.ana.interval})`,
        SEALED,
      );
    });
  });

  it("never changes, deletes or truncates an audience row", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const never = /an audience is written once and never changes \(T8\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.drop_audience SET interval_id = ${w.ana.interval} WHERE drop_id = ${drop} AND interval_id = ${w.cleo.interval}`,
        never,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.drop_audience WHERE drop_id = ${drop} AND interval_id = ${w.cleo.interval}`,
        never,
      );
      // Its own trigger, which fires first: the cascade's other tables have theirs.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`TRUNCATE app.drop_audience CASCADE`,
        /^app\.drop_audience: truncate refused/,
      );
    });
  });

  it("never unseals a drop", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET audience_sealed_at = NULL WHERE id = ${drop}`,
        /audience_sealed_at is set once/,
      );
    });
  });

  it("refuses a member whose interval has ended", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await leave(tx, w.cleo, "Cleo", AT.added);
      const drop = await commitDrop(tx, w, w.ben, { unsealed: true });
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${w.cleo.interval})`,
        /isn't an active member/,
      );
    });
  });

  it("refuses another club's member", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const other = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { unsealed: true });
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        (sp) =>
          sp`INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${other.ben.interval})`,
      );
    });
  });
});

describe("T8: a commit that leaves the audience incomplete or unsealed doesn't commit", () => {
  it("refuses a drop committed without its seal", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const drop = await commitDrop(sp, w, w.ben, { unsealed: true });
          await sp`
            INSERT INTO app.drop_audience (drop_id, club_id, interval_id)
            SELECT ${drop}, club_id, interval_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'
          `;
          await checkAsAtCommit(sp);
        },
        /committed without sealing its audience \(T8\)/,
      );
    });
  });

  it("refuses an audience that leaves out an active member", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const drop = await commitDrop(sp, w, w.ben, { unsealed: true });
          for (const member of [w.ana, w.ben]) {
            await sp`
              INSERT INTO app.drop_audience (drop_id, club_id, interval_id) VALUES (${drop}, ${w.club}, ${member.interval})
            `;
          }
          await sp`UPDATE app.drops SET audience_sealed_at = ${AT.added} WHERE id = ${drop}`;
          await checkAsAtCommit(sp);
        },
        /leaves out an active member \(T8\)/,
      );
    });
  });

  it("refuses a drop for a star who is no longer a member", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await leave(tx, w.ana, "Ana", AT.added);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          const drop = await commitDrop(sp, w, w.ben, { unsealed: true });
          await writeAudience(sp, w, drop);
          await checkAsAtCommit(sp);
        },
        /must hold its author and its star \(T8\)/,
      );
    });
  });
});
