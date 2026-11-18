// What happens around a drop after it is added: removals and their single audited reason (T23
// to T25), reactions, comments and favourites only from the reveal and only from its audience
// (D07, T8, spec 16, 18), reports and cases (spec 22), the operator's append-only audit trail
// (FQ27), the deletion record (T28), and an outbox that carries no content (T52, T54).

import { randomUUID } from "node:crypto";
import { afterAll, describe, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, leave, newId, newUser, newWorld, type Member } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

async function remove(
  tx: Tx,
  drop: string,
  reason: string,
  actor: Member | null,
  state: "withdrawn" | "removed",
  at: Date = AT.opened,
) {
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
    VALUES (${drop}, ${reason}, ${actor?.interval ?? null}, ${at})
  `;
  await tx`UPDATE app.drops SET state = ${state}, ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
}

describe("T23 to T25: a removal is one audited record, and the drop's state agrees with it", () => {
  it("withdraws by the author, and removes as pictured by a member in the revealed photo", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [mine, pictured] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ben)];
      await remove(tx, mine, "withdraw", w.ben, "withdrawn", AT.edited);
      await remove(tx, pictured, "pictured", w.cleo, "removed");
      await checkAsAtCommit(tx);
    });
  });

  it("refuses a drop withdrawn without a removal, or in a state its reason doesn't give", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await sp`UPDATE app.drops SET state = 'withdrawn', ended_at = ${AT.edited}, updated_at = ${AT.edited} WHERE id = ${drop}`;
          await checkAsAtCommit(sp);
        },
        /is withdrawn with removal reason none/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await remove(sp, drop, "pictured", w.cleo, "withdrawn");
          await checkAsAtCommit(sp);
        },
        /is withdrawn with removal reason pictured/,
      );
    });
  });

  it("refuses a pictured removal by the author, before the reveal, or of a link", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [photo, link] = [
        await commitDrop(tx, w, w.ben),
        await commitDrop(tx, w, w.ben, { media: "external_video" }),
      ];
      const refused = /a member in a revealed photo, never its author, removes it as pictured \(T25\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => remove(sp, photo, "pictured", w.ben, "removed"), refused);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => remove(sp, photo, "pictured", w.cleo, "removed", AT.edited),
        refused,
      );
      await expectRefused(tx, REFUSED.integrity, (sp) => remove(sp, link, "pictured", w.cleo, "removed"), refused);
    });
  });

  it("refuses a pictured removal by someone who has left (T9)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const photo = await commitDrop(tx, w, w.ben);
      await leave(tx, w.cleo, "Cleo", AT.opened);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => remove(sp, photo, "pictured", w.cleo, "removed", AT.close),
        /is no longer a member, so removes nothing as pictured \(T9, T25\)/,
      );
    });
  });

  it("lets only the author withdraw, and never changes a removal", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => remove(sp, drop, "withdraw", w.cleo, "withdrawn"),
        /only its author withdraws a drop/,
      );
      await remove(tx, drop, "withdraw", w.ben, "withdrawn");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drop_removals SET reason = 'pictured' WHERE drop_id = ${drop}`,
        /a removal is audited and written once \(T25\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.drop_removals WHERE drop_id = ${drop}`,
        /a removal is audited and written once \(T25\)/,
      );
    });
  });

  it("lets a withdrawn drop lose its content and nothing else", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { caption: "Picnic" });
      await remove(tx, drop, "withdraw", w.ben, "withdrawn", AT.edited);
      await tx`UPDATE app.drops SET caption = NULL, upload_id = NULL, dedupe_key = NULL WHERE id = ${drop}`;
      const only = /a withdrawn drop only loses its content \(T24\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET caption = 'Back' WHERE id = ${drop}`,
        only,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET state = 'active', ended_at = NULL WHERE id = ${drop}`,
        only,
      );
    });
  });
});

describe("D07, T8 and spec 16: reactions, comments and favourites, from the reveal, by the audience", () => {
  it("reacts, comments and saves once the day has opened", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await tx`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${drop}, ${w.cleo.interval}, 'heart', ${AT.opened})`;
      await tx`
        INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
        VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, 'So good', ${AT.opened}, ${AT.opened})
      `;
      await tx`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.ana.interval}, ${drop}, ${AT.opened})`;
    });
  });

  it("refuses each before the reveal", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const early = /day hasn't opened \(D07\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${drop}, ${w.cleo.interval}, 'heart', ${AT.edited})`,
        early,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
          VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, 'Early', ${AT.edited}, ${AT.edited})
        `,
        early,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.ana.interval}, ${drop}, ${AT.edited})`,
        early,
      );
    });
  });

  it("refuses a reaction to one's own drop, and anyone outside the audience", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${drop}, ${w.ben.interval}, 'heart', ${AT.opened})`,
        /nobody reacts to their own drop/,
      );
      const other = await newWorld(tx);
      for (const statement of [
        (sp: Tx) =>
          sp`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${drop}, ${other.cleo.interval}, 'heart', ${AT.opened})`,
        (sp: Tx) =>
          sp`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${other.cleo.interval}, ${drop}, ${AT.opened})`,
        (sp: Tx) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
          VALUES (${newId("cmt")}, ${drop}, ${other.cleo.interval}, 'Hi', ${AT.opened}, ${AT.opened})
        `,
      ]) {
        await expectRefused(tx, REFUSED.foreignKey, statement);
      }
    });
  });

  it("adds nothing to a drop that isn't active, or from someone who has left, who can still take their own away (T9, T24)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      // Within a friend's two photos and one link (addendum 2): Ben's link, Ben's two photos, and
      // Cleo's photo, which Ana, not its author, then reacts to.
      const [withdrawn, removed, held, live] = [
        await commitDrop(tx, w, w.ben, { media: "external_video" }),
        await commitDrop(tx, w, w.ben),
        await commitDrop(tx, w, w.cleo),
        await commitDrop(tx, w, w.ben),
      ];
      await remove(tx, withdrawn, "withdraw", w.ben, "withdrawn", AT.edited);
      await remove(tx, removed, "pictured", w.cleo, "removed");
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.edited} WHERE id = ${held}`;
      const inactive = /isn't active, so nothing is added to it \(T9, T24\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.ana.interval}, ${withdrawn}, ${AT.opened})`,
        inactive,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
          VALUES (${newId("cmt")}, ${removed}, ${w.ana.interval}, 'Hi', ${AT.opened}, ${AT.opened})
        `,
        inactive,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${held}, ${w.ana.interval}, 'heart', ${AT.opened})`,
        inactive,
      );
      // Cleo reacts and comments, then leaves.
      const comment = newId("cmt");
      await tx`INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at) VALUES (${live}, ${w.cleo.interval}, 'heart', ${AT.opened})`;
      await tx`
        INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
        VALUES (${comment}, ${live}, ${w.cleo.interval}, 'So good', ${AT.opened}, ${AT.opened})
      `;
      await leave(tx, w.cleo, "Cleo", AT.opened);
      const gone = /is no longer a member, so adds nothing \(T9\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.cleo.interval}, ${live}, ${AT.close})`,
        gone,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.comments SET body = 'Edited', version = 2, updated_at = ${AT.close} WHERE id = ${comment}`,
        gone,
      );
      await tx`UPDATE app.reactions SET reaction = NULL, updated_at = ${AT.close} WHERE drop_id = ${live} AND interval_id = ${w.cleo.interval}`;
      await tx`UPDATE app.comments SET state = 'deleted', body = NULL, ended_at = ${AT.close}, updated_at = ${AT.close} WHERE id = ${comment}`;
    });
  });

  it("lets a deleted comment only lose its text", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const comment = newId("cmt");
      await tx`
        INSERT INTO app.comments (id, drop_id, author_interval_id, body, created_at, updated_at)
        VALUES (${comment}, ${drop}, ${w.cleo.interval}, 'So good', ${AT.opened}, ${AT.opened})
      `;
      await tx`UPDATE app.comments SET state = 'deleted', body = NULL, ended_at = ${AT.close} WHERE id = ${comment}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.comments SET state = 'active', body = 'Back', ended_at = NULL WHERE id = ${comment}`,
        /comment only loses its text/,
      );
    });
  });
});

describe("spec 22 and FQ27: reports, cases and the operator's audit trail", () => {
  it("refuses a report on one's own drop, and keeps one open case per target", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { caption: "Picnic" });
      const kase = newId("case");
      const open = (sp: Tx, id: string) => sp`
        INSERT INTO app.moderation_cases (id, drop_id, opened_at) VALUES (${id}, ${drop}, ${AT.edited})
      `;
      await open(tx, kase);
      await expectRefused(tx, REFUSED.unique, (sp) => open(sp, newId("case")), /moderation_cases_one_open/);
      const report = (sp: Tx, reporter: Member) => sp`
        INSERT INTO app.reports (id, case_id, drop_id, reporter_interval_id, created_at)
        VALUES (${newId("rpt")}, ${kase}, ${drop}, ${reporter.interval}, ${AT.edited})
      `;
      await report(tx, w.cleo);
      await expectRefused(tx, REFUSED.integrity, (sp) => report(sp, w.ben), /nobody reports their own drop or comment/);
    });
  });

  it("keeps the operator's actions append-only, with a label and never an address", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const action = (sp: Tx, operator: string) => sp`
        INSERT INTO app.operator_actions (id, operator, script, script_version, action, target_kind, target_id, policy, acted_at)
        VALUES (${newId("act")}, ${operator}, 'hold-drop', ${"0".repeat(40)}, 'suspend_occurrence', 'occurrence', ${w.day},
                'trial.safety', ${AT.edited})
      `;
      await action(tx, "founder");
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => action(sp, "someone@example.invalid"),
        /operator_actions_operator_check/,
      );
      for (const statement of [
        (sp: Tx) => sp`UPDATE app.operator_actions SET policy = 'other' WHERE target_id = ${w.day}`,
        (sp: Tx) => sp`DELETE FROM app.operator_actions WHERE target_id = ${w.day}`,
        (sp: Tx) => sp`TRUNCATE app.operator_actions CASCADE`,
      ]) {
        await expectRefused(tx, REFUSED.integrity, statement, /the audit trail is append-only/);
      }
    });
  });
});

describe("FQ27: a moderation removal cites the operator's removal of that drop", () => {
  it("refuses an action about anything else, and takes the one about that drop", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [drop, other] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ben)];
      const act = async (action: string, kind: string, target: string) => {
        const id = newId("act");
        await tx`
          INSERT INTO app.operator_actions (id, operator, script, script_version, action, target_kind, target_id, policy, acted_at)
          VALUES (${id}, 'founder', 'remove-drop', ${"0".repeat(40)}, ${action}, ${kind}, ${target}, 'trial.safety', ${AT.opened})
        `;
        return id;
      };
      const moderate = (sp: Tx, action: string) => sp`
        INSERT INTO app.drop_removals (drop_id, reason, operator_action_id, removed_at)
        VALUES (${drop}, 'moderation', ${action}, ${AT.opened})
      `;
      const cites = /a moderation removal cites the operator's removal of this drop \(FQ27\)/;
      for (const action of [
        await act("suspend_occurrence", "occurrence", w.day),
        await act("hold_drop", "drop", drop),
        await act("remove_drop", "drop", other),
      ]) {
        await expectRefused(tx, REFUSED.integrity, (sp) => moderate(sp, action), cites);
      }
      await moderate(tx, await act("remove_drop", "drop", drop));
    });
  });
});

describe("T27 and FQ13: an account's deletion goes one way", () => {
  it("never brings a deleted account back, changes its sign-in identity, or takes back the age confirmation", async () => {
    await rolledBack(app, async (tx) => {
      const user = await newUser(tx, "Eve");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.users SET auth_subject = ${randomUUID()} WHERE id = ${user}`,
        /an account's sign-in identity can't change/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.users SET age_confirmed_at = NULL, display_name = NULL WHERE id = ${user}`,
        /the age confirmation can't be taken back \(FQ13\)/,
      );
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${user}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.users SET state = 'active', deletion_requested_at = NULL WHERE id = ${user}`,
        /an account goes from deleting back to active \(T27\)/,
      );
      await tx`
        UPDATE app.users SET state = 'deleted', deleted_at = ${AT.opened}, auth_subject = NULL, age_confirmed_at = NULL,
                             display_name = NULL
         WHERE id = ${user}
      `;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.users SET state = 'deleting' WHERE id = ${user}`,
        /an account goes from deleted back to deleting \(T27\)/,
      );
    });
  });
});

describe("T28: the deletion record", () => {
  it("records a deletion once, sets only its mirror time once, and is never deleted", async () => {
    await rolledBack(app, async (tx) => {
      const tombstone = newId("tomb");
      const record = (sp: Tx, id: string) => sp`
        INSERT INTO app.deletion_tombstones (id, object_kind, object_id, reason, deleted_at)
        VALUES (${id}, 'drop', 'drp_gone', 'withdraw', ${AT.edited})
      `;
      await record(tx, tombstone);
      await expectRefused(tx, REFUSED.unique, (sp) => record(sp, newId("tomb")), /object_kind_object_id/);
      await tx`UPDATE app.deletion_tombstones SET mirrored_at = ${AT.opened} WHERE id = ${tombstone}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.deletion_tombstones SET mirrored_at = ${AT.close} WHERE id = ${tombstone}`,
        /mirrored_at is set once/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.deletion_tombstones WHERE id = ${tombstone}`,
        /a deletion is recorded for good/,
      );
    });
  });
});

describe("T52 and T54: the outbox carries ids, never content, and a retry happens once", () => {
  it("refuses a payload with a caption or a link, an error that isn't a code, and a second event per key", async () => {
    await rolledBack(app, async (tx) => {
      const event = (sp: Tx, key: string, payload: Record<string, unknown>, error: string | null = null) => sp`
        INSERT INTO app.outbox_events (id, topic, dedupe_key, payload, available_at, created_at, last_error)
        VALUES (${newId("evt")}, 'occurrence.opening', ${key}, ${sp.json(payload as never)}, ${AT.reveal}, ${AT.generated}, ${error})
      `;
      const key = `occurrence.opening:${randomUUID()}`;
      await event(tx, key, { occurrence_id: "occ_1" });
      await expectRefused(tx, REFUSED.unique, (sp) => event(sp, key, { occurrence_id: "occ_1" }), /dedupe_key/);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => event(sp, `drop.committed:${randomUUID()}`, { drop: { id: "drp_1", caption: "Picnic" } }),
        /outbox_events_payload_check/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) =>
          event(sp, `upload.prepare:${randomUUID()}`, { upload_id: "upl_1" }, "failed reading 'Picnic at the lake'"),
        /outbox_events_last_error_check/,
      );
    });
  });
});
