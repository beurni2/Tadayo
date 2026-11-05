// T7 and T33: people join only by an exact roster revision that they accepted and every member of
// it approved; a revision's roster is sealed when it is made; its version moves with its state
// alone; a club holds at most six members (A01), one active interval per account (TECH-DESIGN
// section 6), and its creator's membership is the only one made without a roster.

import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, joinByRoster, newId, newUser, newWorld, type World } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

/** An open, sealed revision proposing Dan, which Dan has accepted and nobody has approved yet. */
async function openRevision(tx: Tx, w: World): Promise<{ revision: string; candidate: string; invitation: string }> {
  const revision = newId("rev");
  const candidate = newId("cand");
  const invitation = newId("inv");
  await tx`
    INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
    VALUES (${revision}, ${w.club}, 'proposal', ${w.ana.interval}, ${AT.added})
  `;
  for (const member of [w.ana, w.ben, w.cleo]) {
    await tx`
      INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
      VALUES (${revision}, ${w.club}, ${member.interval})
    `;
  }
  await tx`
    INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
    VALUES (${candidate}, ${w.club}, ${w.ana.interval}, ${AT.added})
  `;
  await tx`
    INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
    VALUES (${revision}, ${w.club}, ${candidate}, 'Dan', 1)
  `;
  await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${AT.added} WHERE id = ${revision}`;
  await tx`
    INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at, bound_user_id, bound_at)
    VALUES (${invitation}, ${candidate}, ${randomBytes(32)}, ${AT.added}, ${AT.close}, ${w.dan.user}, ${AT.added})
  `;
  await tx`
    UPDATE app.roster_revision_candidates SET accepted_at = ${AT.added}, accepted_invitation_id = ${invitation}
     WHERE revision_id = ${revision}
  `;
  return { revision, candidate, invitation };
}

async function approve(tx: Tx, revision: string, interval: string): Promise<void> {
  await tx`
    INSERT INTO app.roster_approvals (revision_id, interval_id, decision, decided_at)
    VALUES (${revision}, ${interval}, 'approved', ${AT.added})
  `;
}

describe("T7: an exact roster, sealed when it is made", () => {
  it("commits a revision with its roster sealed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await openRevision(tx, w);
      await checkAsAtCommit(tx);
    });
  });

  it("refuses a member or a candidate added to a sealed revision", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision } = await openRevision(tx, w);
      const sealed = /is sealed: its exact roster never changes \(T7\)/;
      const ghost = newId("cand");
      await tx`
        INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
        VALUES (${ghost}, ${w.club}, ${w.ben.interval}, ${AT.added})
      `;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
          VALUES (${revision}, ${w.club}, ${ghost}, 'Someone', 2)
        `,
        sealed,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.roster_revision_members WHERE revision_id = ${revision}`,
        /exact roster never changes/,
      );
    });
  });

  it("refuses a revision made without its seal, its proposer or a candidate", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const revision = newId("rev");
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await sp`
            INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
            VALUES (${revision}, ${w.club}, 'proposal', ${w.ana.interval}, ${AT.added})
          `;
          await checkAsAtCommit(sp);
        },
        /was made without being sealed \(T7\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await sp`
            INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at, roster_sealed_at)
            VALUES (${revision}, ${w.club}, 'proposal', ${w.ana.interval}, ${AT.added}, ${AT.added})
          `;
          await checkAsAtCommit(sp);
        },
        /doesn't hold its proposer \(T7\)/,
      );
    });
  });

  it("refuses an approval before the seal, a second decision, and a decision once it has ended", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision } = await openRevision(tx, w);
      await approve(tx, revision, w.ana.interval);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.roster_approvals SET decision = 'declined' WHERE revision_id = ${revision}`,
        /a decision is made once/,
      );
      await expectRefused(tx, REFUSED.unique, (sp) => approve(sp, revision, w.ana.interval));
      await tx`UPDATE app.roster_revisions SET state = 'did_not_go_ahead', version = 2, ended_at = ${AT.edited} WHERE id = ${revision}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => approve(sp, revision, w.ben.interval),
        /no longer open \(T7\)/,
      );
    });
  });

  it("lets only a member of the exact roster decide", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision } = await openRevision(tx, w);
      const other = await newWorld(tx);
      await expectRefused(tx, REFUSED.foreignKey, (sp) => approve(sp, revision, other.ben.interval));
    });
  });
});

describe("T7: joining only by the exact roster accepted and approved", () => {
  it("adds Dan once every member approved, Dan accepted with Dan's own link, and it was applied", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision, candidate } = await openRevision(tx, w);
      for (const member of [w.ana, w.ben, w.cleo]) await approve(tx, revision, member.interval);
      await tx`UPDATE app.roster_revisions SET state = 'applied', version = 2, ended_at = ${AT.edited} WHERE id = ${revision}`;
      await tx`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_via_revision_id, joined_via_candidate_id, joined_at)
        VALUES (${newId("mem")}, ${w.club}, ${w.dan.user}, 'roster', ${revision}, ${candidate}, ${AT.edited})
      `;
      await checkAsAtCommit(tx);
    });
  });

  it("refuses Dan while a member hasn't approved, before it is applied, or as someone else", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision, candidate } = await openRevision(tx, w);
      const join = (sp: Tx, user: string) => sp`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_via_revision_id, joined_via_candidate_id, joined_at)
        VALUES (${newId("mem")}, ${w.club}, ${user}, 'roster', ${revision}, ${candidate}, ${AT.edited})
      `;
      const refused = /joins only by an exact roster they accepted and every member approved \(T7\)/;
      const apply = (sp: Tx) =>
        sp`UPDATE app.roster_revisions SET state = 'applied', version = 2, ended_at = ${AT.edited} WHERE id = ${revision}`;
      await approve(tx, revision, w.ana.interval);
      await approve(tx, revision, w.ben.interval);
      // Applied while Cleo hasn't approved: nothing else here stops the revision being applied.
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await apply(sp);
          await join(sp, w.dan.user);
        },
        refused,
      );
      await approve(tx, revision, w.cleo.interval);
      // Approved by every member, but not applied yet.
      await expectRefused(tx, REFUSED.integrity, (sp) => join(sp, w.dan.user), refused);
      await apply(tx);
      const eve = await newUser(tx, "Eve");
      await expectRefused(tx, REFUSED.integrity, (sp) => join(sp, eve), refused);
      await join(tx, w.dan.user);
    });
  });

  it("makes the creator's membership with the club, and no other without a roster", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
          INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
          VALUES (${newId("mem")}, ${w.club}, ${w.dan.user}, 'creator', ${AT.added})
        `,
      );
    });
  });
});

describe("T33: a revision's version moves with its state, and only then", () => {
  it("refuses a version moved by an approval, or a state change that doesn't move it", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision } = await openRevision(tx, w);
      const moves = /version moves by one with its state, and only then \(T33\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.roster_revisions SET version = 2 WHERE id = ${revision}`,
        moves,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.roster_revisions SET state = 'applied', ended_at = ${AT.edited} WHERE id = ${revision}`,
        moves,
      );
      await approve(tx, revision, w.ana.interval);
      const [row] = await tx<{ version: number }[]>`SELECT version FROM app.roster_revisions WHERE id = ${revision}`;
      expect(row?.version).toBe(1);
    });
  });

  it("never changes an ended revision", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { revision } = await openRevision(tx, w);
      await tx`UPDATE app.roster_revisions SET state = 'did_not_go_ahead', version = 2, ended_at = ${AT.edited} WHERE id = ${revision}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.roster_revisions SET state = 'open', version = 3, ended_at = NULL WHERE id = ${revision}`,
        /an ended revision never changes/,
      );
    });
  });
});

describe("A01 and TECH-DESIGN section 6: the roster's limits", () => {
  it("holds at most six active members", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const three = [await newUser(tx, "Dee"), await newUser(tx, "Eve"), await newUser(tx, "Fay")];
      await joinByRoster(
        tx,
        w.club,
        w.ana,
        three.map((user, i) => ({ user, label: `Friend ${String(i + 1)}` })),
        AT.added,
      );
      const seventh = await newUser(tx, "Gus");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => joinByRoster(sp, w.club, w.ana, [{ user: seventh, label: "Gus" }], AT.edited),
        /at most six members \(A01\)/,
      );
    });
  });

  it("holds one active interval per account and club, and a rejoin is a new interval", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(tx, REFUSED.unique, (sp) =>
        joinByRoster(sp, w.club, w.ana, [{ user: w.ben.user, label: "Ben" }], AT.added),
      );
      await tx`
        UPDATE app.memberships SET state = 'left', left_at = ${AT.added}, contributions = 'keep', ended_display_name = 'Ben'
         WHERE interval_id = ${w.ben.interval}
      `;
      const [again] = await joinByRoster(tx, w.club, w.ana, [{ user: w.ben.user, label: "Ben" }], AT.edited);
      expect(again).not.toBe(w.ben.interval);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.memberships SET state = 'active', left_at = NULL WHERE interval_id = ${w.ben.interval}`,
        /an ended interval never changes; a rejoin is a new one \(T8\)/,
      );
    });
  });

  it("keeps an invitation's token only as a unique hash, with one latest link per candidate", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const { candidate } = await openRevision(tx, w);
      const [first] = await tx<{ token_sha256: Buffer }[]>`
        SELECT token_sha256 FROM app.invitations WHERE candidate_id = ${candidate}
      `;
      if (!first) throw new Error("no invitation");
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
          INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at)
          VALUES (${newId("inv")}, ${candidate}, ${randomBytes(32)}, ${AT.edited}, ${AT.close})
        `,
        /invitations_one_latest/,
      );
      const fresh = newId("cand");
      await tx`
        INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
        VALUES (${fresh}, ${w.club}, ${w.ben.interval}, ${AT.added})
      `;
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
          INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at)
          VALUES (${newId("inv")}, ${fresh}, ${first.token_sha256}, ${AT.edited}, ${AT.close})
        `,
        /invitations_token_sha256_key/,
      );
    });
  });
});
