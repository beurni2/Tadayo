// Photo messages in a drop's conversation (spec 16; T9, T10, T12, T24, T25, T63 to T65; addendum 5
// and 6; FQ107, FQ108; ND08, ND09, ND11 to ND13): an upload made for one drop's conversation, after
// its reveal, by someone in its audience; a message with text, a photo or both, whose photo never
// changes and goes only with the whole message; and the one record of a message removed by someone
// other than its author.

import { randomBytes } from "node:crypto";
import { OPERATIONS, UploadPurpose } from "@tadayo/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import {
  AT,
  checkAsAtCommit,
  commitDrop,
  joinByRoster,
  leave,
  newId,
  newWorld,
  type Member,
  type UploadState,
} from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

/** An instant `minutes` after `at`. */
function after(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

/** A photo message's upload of `owner`'s for `drop`, made at `at` and left in `end` by preparation. */
async function photoFor(
  tx: Tx,
  owner: string,
  drop: string,
  options: { at?: Date; end?: UploadState; expires?: Date } = {},
): Promise<string> {
  const id = newId("upl");
  const at = options.at ?? AT.opened;
  await tx`
    INSERT INTO app.uploads (id, owner_user_id, purpose, conversation_drop_id, content_type, byte_size, object_key,
                             created_at, expires_at)
    VALUES (${id}, ${owner}, 'conversation_photo', ${drop}, 'image/jpeg', 1000, ${newId("uploads/raw")}, ${at},
            ${options.expires ?? after(at, 24 * 60)})
  `;
  const end = options.end ?? "ready";
  if (end !== "pending") await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${id}`;
  if (end === "ready") {
    await tx`
      UPDATE app.uploads SET state = 'ready', content_hash = ${randomBytes(32)}, content_version = ${newId("v")} WHERE id = ${id}
    `;
  }
  if (end === "held") await tx`UPDATE app.uploads SET state = 'held' WHERE id = ${id}`;
  if (end === "rejected")
    await tx`UPDATE app.uploads SET state = 'rejected', rejection = 'unreadable' WHERE id = ${id}`;
  return id;
}

/** A message of `author`'s on `drop`, committed at `at`, with text, a photo or both. */
function message(
  tx: Tx,
  drop: string,
  author: Member,
  body: string | null,
  photo: string | null,
  at: Date = AT.opened,
  id: string = newId("cmt"),
) {
  return tx`
    INSERT INTO app.comments (id, drop_id, author_interval_id, body, photo_upload_id, created_at, updated_at)
    VALUES (${id}, ${drop}, ${author.interval}, ${body}, ${photo}, ${at}, ${at})
  `;
}

/** A rendition of `upload` of `kind`. */
function rendition(tx: Tx, upload: string, kind: string) {
  return tx`
    INSERT INTO app.upload_renditions (upload_id, kind, object_key, width, height, byte_size, created_at)
    VALUES (${upload}, ${kind}, ${newId("uploads/r")}, 400, 300, 2000, ${AT.opened})
  `;
}

/** The drop's withdrawal by its author, with its one removal record (T23). */
async function withdraw(tx: Tx, drop: string, author: Member, at: Date = AT.opened) {
  await tx`
    INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
    VALUES (${drop}, 'withdraw', ${author.interval}, ${at})
  `;
  await tx`UPDATE app.drops SET state = 'withdrawn', ended_at = ${at}, updated_at = ${at} WHERE id = ${drop}`;
}

/** Ends a message as removed, empty, as every path does. */
function endRemoved(tx: Tx, comment: string, at: Date = AT.close) {
  return tx`
    UPDATE app.comments SET state = 'removed', body = NULL, photo_upload_id = NULL, ended_at = ${at}, updated_at = ${at}
     WHERE id = ${comment}
  `;
}

describe("T63 and T64: a photo message's upload, made for one revealed drop by its audience", () => {
  it("is made by the star, a friend or the drop's author, from its reveal on", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await photoFor(tx, w.ana.user, drop, { at: AT.reveal });
      await photoFor(tx, w.cleo.user, drop);
      await photoFor(tx, w.ben.user, drop, { at: AT.close });
    });
  });

  it("is refused before the reveal, outside the audience, to a former member or a rejoined account, and for a drop that isn't active (T9, ND12)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => photoFor(sp, w.cleo.user, drop, { at: AT.edited }),
        /day hasn't opened \(D07, T63\)/,
      );
      const outside = /answers drop .* only as a member of its audience \(T9, T63\)/;
      const other = await newWorld(tx);
      await expectRefused(tx, REFUSED.integrity, (sp) => photoFor(sp, other.cleo.user, drop), outside);
      await expectRefused(tx, REFUSED.integrity, (sp) => photoFor(sp, w.dan.user, drop), outside);
      await leave(tx, w.cleo, "Cleo", AT.opened);
      await expectRefused(tx, REFUSED.integrity, (sp) => photoFor(sp, w.cleo.user, drop, { at: AT.close }), outside);
      await joinByRoster(tx, w.club, w.ana, [{ user: w.cleo.user, label: "Cleo" }], AT.close);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => photoFor(sp, w.cleo.user, drop, { at: after(AT.close, 60) }),
        outside,
      );
      const held = await commitDrop(tx, w, w.ana);
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.edited} WHERE id = ${held}`;
      const inactive = /drop .* isn't active, so nothing is added to it \(T9, T24\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => photoFor(sp, w.ben.user, held), inactive);
      const withdrawn = await commitDrop(tx, w, w.ana);
      await withdraw(tx, withdrawn, w.ana);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => photoFor(sp, w.ben.user, withdrawn, { at: AT.close }),
        inactive,
      );
    });
  });

  it("never changes the drop it's for, and can't become a drop's photo, a replacement or an avatar", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [drop, another] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ana)];
      const photo = await photoFor(tx, w.cleo.user, drop);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.uploads SET conversation_drop_id = ${another} WHERE id = ${photo}`,
        /app\.uploads\.conversation_drop_id can't change/,
      );
      // Only this purpose names a drop, and it always does.
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          INSERT INTO app.uploads (id, owner_user_id, purpose, conversation_drop_id, content_type, byte_size, object_key,
                                   created_at, expires_at)
          VALUES (${newId("upl")}, ${w.cleo.user}, 'avatar', ${drop}, 'image/jpeg', 1000, ${newId("uploads/raw")}, ${AT.opened},
                  ${AT.close})
        `,
        /uploads_conversation_drop/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          INSERT INTO app.uploads (id, owner_user_id, purpose, content_type, byte_size, object_key, created_at, expires_at)
          VALUES (${newId("upl")}, ${w.cleo.user}, 'conversation_photo', 'image/jpeg', 1000, ${newId("uploads/raw")},
                  ${AT.opened}, ${AT.close})
        `,
        /uploads_conversation_drop/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.users SET avatar_upload_id = ${photo} WHERE id = ${w.cleo.user}`,
        /an avatar is a ready upload made as one/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, upload_id, dedupe_key, submitted_at,
                                 updated_at)
          VALUES (${newId("drp")}, ${w.day}, ${w.club}, ${w.cleo.interval}, 'photo', ${photo}, ${randomBytes(32)}, ${AT.added},
                  ${AT.added})
        `,
        /a drop's photo is its author's ready upload for this day or this drop/,
      );
      const cleos = await commitDrop(tx, w, w.cleo);
      const ownPhoto = await photoFor(tx, w.cleo.user, cleos);
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        // Before the reveal, when a replacement may still be made: only its foreign key refuses it.
        (sp) => sp`UPDATE app.drops SET pending_upload_id = ${ownPhoto}, updated_at = ${AT.edited} WHERE id = ${cleos}`,
      );
    });
  });

  it("has a thumbnail for the feed's reply preview, which a drop's photo never has (T10, T65)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const photo = await photoFor(tx, w.cleo.user, drop);
      for (const kind of ["thumbnail", "display", "full"]) await rendition(tx, photo, kind);
      const [row] = await tx<{ upload_id: string }[]>`SELECT upload_id FROM app.drops WHERE id = ${drop}`;
      if (!row) throw new Error("no drop");
      await rendition(tx, row.upload_id, "display");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => rendition(sp, row.upload_id, "thumbnail"),
        /only a photo message's upload has a thumbnail \(T10, T65\)/,
      );
    });
  });
});

describe("T63 to T65: a message holds text, a photo or both, and its photo goes only with it", () => {
  it("commits a photo alone, text alone, or both, from the reveal, in Memories too, moving no counter (ND09, ND11)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const counters = () => tx`
        SELECT interval_id, committed_total, committed_external, reserved_total, reserved_external
          FROM app.contribution_counters WHERE occurrence_id = ${w.day} ORDER BY interval_id
      `;
      const before = await counters();
      await message(tx, drop, w.cleo, null, await photoFor(tx, w.cleo.user, drop));
      await message(tx, drop, w.ana, "So good", null);
      await message(tx, drop, w.ben, "Here's another", await photoFor(tx, w.ben.user, drop));
      // After the day leaves Home at 1 AM, the conversation stays open in Memories (T64).
      const later = after(AT.close, 60 * 24 * 3);
      await message(tx, drop, w.ana, null, await photoFor(tx, w.ana.user, drop, { at: later }), later);
      expect(await counters()).toEqual(before);
    });
  });

  it("refuses a message with neither, one before the reveal, and one dated before it with a later updated_at (ND08)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => message(sp, drop, w.cleo, null, null),
        /comments_active_has_content/,
      );
      const photo = await photoFor(tx, w.cleo.user, drop);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => message(sp, drop, w.cleo, null, photo, AT.edited),
        /day hasn't opened \(D07\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, body, photo_upload_id, created_at, updated_at)
          VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, NULL, ${photo}, ${AT.edited}, ${AT.opened})
        `,
        /a message starts active, at version 1, with updated_at its created_at \(T63\)/,
      );
    });
  });

  it("starts every message active, at its first version", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const starts = /a message starts active, at version 1/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, body, version, created_at, updated_at)
          VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, 'Hi', 2, ${AT.opened}, ${AT.opened})
        `,
        starts,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.comments (id, drop_id, author_interval_id, state, created_at, updated_at, ended_at)
          VALUES (${newId("cmt")}, ${drop}, ${w.cleo.interval}, 'removed', ${AT.opened}, ${AT.opened}, ${AT.opened})
        `,
        starts,
      );
    });
  });

  it("takes only its author's own ready upload, not lapsed, made for its drop, and only once", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [drop, another] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ana)];
      const own = /a message's photo is its author's own ready upload, not lapsed \(T12, T63, T65\)/;
      const anas = await photoFor(tx, w.ana.user, drop);
      await expectRefused(tx, REFUSED.integrity, (sp) => message(sp, drop, w.cleo, null, anas), own);
      for (const end of ["pending", "preparing", "held", "rejected"] as const) {
        const unready = await photoFor(tx, w.cleo.user, drop, { end });
        await expectRefused(tx, REFUSED.integrity, (sp) => message(sp, drop, w.cleo, null, unready), own);
      }
      const lapsing = await photoFor(tx, w.cleo.user, drop, { expires: after(AT.opened, 1) });
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => message(sp, drop, w.cleo, null, lapsing, after(AT.opened, 60)),
        own,
      );
      const forAnother = await photoFor(tx, w.cleo.user, another);
      await expectRefused(tx, REFUSED.foreignKey, (sp) => message(sp, drop, w.cleo, null, forAnother));
      const cleosDrop = await commitDrop(tx, w, w.cleo);
      const [row] = await tx<{ upload_id: string }[]>`SELECT upload_id FROM app.drops WHERE id = ${cleosDrop}`;
      if (!row) throw new Error("no drop");
      await expectRefused(tx, REFUSED.foreignKey, (sp) => message(sp, drop, w.cleo, null, row.upload_id));
      const photo = await photoFor(tx, w.cleo.user, drop);
      await message(tx, drop, w.cleo, null, photo);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => message(sp, drop, w.cleo, "Again", photo, AT.close),
        /comments_one_message_per_photo/,
      );
    });
  });

  it("never adds, replaces or clears a standing message's photo, and lets emptied text keep it (FQ107)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [text, both] = [newId("cmt"), newId("cmt")];
      await message(tx, drop, w.cleo, "Hi", null, AT.opened, text);
      await message(tx, drop, w.cleo, "Look", await photoFor(tx, w.cleo.user, drop), AT.opened, both);
      const spare = await photoFor(tx, w.cleo.user, drop);
      const never = /a message's photo is never added or replaced \(T65, FQ107\)/;
      for (const comment of [text, both]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) =>
            sp`UPDATE app.comments SET photo_upload_id = ${spare}, version = 2, updated_at = ${AT.close} WHERE id = ${comment}`,
          never,
        );
      }
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.comments SET photo_upload_id = NULL, version = 2, updated_at = ${AT.close} WHERE id = ${both}`,
        /a photo goes only with its whole message \(T65, FQ107\)/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`UPDATE app.comments SET body = NULL, version = 2, updated_at = ${AT.close} WHERE id = ${text}`,
        /comments_active_has_content/,
      );
      await tx`UPDATE app.comments SET body = NULL, version = 2, updated_at = ${AT.close} WHERE id = ${both}`;
    });
  });

  it("keeps neither text nor photo once a message ends, and never deletes an upload a message holds (ND13)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [photoOnly, both] = [newId("cmt"), newId("cmt")];
      const photo = await photoFor(tx, w.cleo.user, drop);
      await message(tx, drop, w.cleo, null, photo, AT.opened, photoOnly);
      await message(tx, drop, w.ana, "Look", await photoFor(tx, w.ana.user, drop), AT.opened, both);
      for (const rendered of ["thumbnail", "display", "full"]) await rendition(tx, photo, rendered);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) =>
          sp`UPDATE app.comments SET state = 'deleted', ended_at = ${AT.close}, updated_at = ${AT.close} WHERE id = ${photoOnly}`,
        /comments_ended_empty/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          UPDATE app.comments SET state = 'removed', photo_upload_id = NULL, ended_at = ${AT.close}, updated_at = ${AT.close}
           WHERE id = ${both}
        `,
        /comments_ended_empty/,
      );
      await expectRefused(tx, REFUSED.foreignKey, (sp) => sp`DELETE FROM app.uploads WHERE id = ${photo}`);
      await tx`
        UPDATE app.comments SET state = 'deleted', body = NULL, photo_upload_id = NULL, ended_at = ${AT.close},
               updated_at = ${AT.close}
         WHERE id = ${photoOnly}
      `;
      await tx`DELETE FROM app.uploads WHERE id = ${photo}`;
      const [left] = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM app.upload_renditions WHERE upload_id = ${photo}`;
      expect(left?.n).toBe(0);
      await checkAsAtCommit(tx);
    });
  });
});

describe("T25 and FQ108: a message removed by someone other than its author is recorded once", () => {
  async function operatorRemoves(tx: Tx, comment: string): Promise<string> {
    const id = newId("act");
    await tx`
      INSERT INTO app.operator_actions (id, operator, script, script_version, action, target_kind, target_id, policy, acted_at)
      VALUES (${id}, 'founder', 'remove-comment', ${"0".repeat(40)}, 'remove_comment', 'comment', ${comment}, 'trial.safety',
              ${AT.close})
    `;
    return id;
  }

  function removal(
    tx: Tx,
    comment: string,
    drop: string,
    reason: string,
    actor: Member | null,
    action: string | null = null,
  ) {
    return tx`
      INSERT INTO app.comment_removals (comment_id, drop_id, reason, actor_interval_id, operator_action_id, removed_at)
      VALUES (${comment}, ${drop}, ${reason}, ${actor?.interval ?? null}, ${action}, ${AT.close})
    `;
  }

  it("records a pictured removal, an operator's, and its drop's end, each with its message removed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [pictured, moderated, withDrop] = [newId("cmt"), newId("cmt"), newId("cmt")];
      await message(tx, drop, w.cleo, "Us", await photoFor(tx, w.cleo.user, drop), AT.opened, pictured);
      await message(tx, drop, w.cleo, "Hi", null, AT.opened, moderated);
      await message(tx, drop, w.ana, "Lovely", null, AT.opened, withDrop);
      await removal(tx, pictured, drop, "pictured", w.ana);
      await endRemoved(tx, pictured);
      await removal(tx, moderated, drop, "moderation", null, await operatorRemoves(tx, moderated));
      await endRemoved(tx, moderated);
      await withdraw(tx, drop, w.ben, AT.close);
      await removal(tx, withDrop, drop, "drop_ended", null);
      await endRemoved(tx, withDrop);
      await checkAsAtCommit(tx);
    });
  });

  it("refuses a pictured removal by its author, of a message with no photo, or by a former member; an operator's without its action; and a drop's end while the drop stands", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [withPhoto, textOnly] = [newId("cmt"), newId("cmt")];
      await message(tx, drop, w.cleo, null, await photoFor(tx, w.cleo.user, drop), AT.opened, withPhoto);
      await message(tx, drop, w.cleo, "Hi", null, AT.opened, textOnly);
      const pictured = /a member in a message's photo, never its author, removes it as pictured \(T25, FQ108\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => removal(sp, withPhoto, drop, "pictured", w.cleo), pictured);
      await expectRefused(tx, REFUSED.integrity, (sp) => removal(sp, textOnly, drop, "pictured", w.ana), pictured);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => removal(sp, withPhoto, drop, "moderation", null, newId("act")),
        /a moderation removal cites the operator's removal of this message \(FQ27\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => removal(sp, textOnly, drop, "drop_ended", null),
        /only a withdrawn or removed drop takes its conversation with it \(T24\)/,
      );
      await leave(tx, w.ana, "Ana", AT.opened);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => removal(sp, withPhoto, drop, "pictured", w.ana),
        /is no longer a member, so removes nothing as pictured \(T9, T25\)/,
      );
    });
  });

  it("refuses a removal of a message that has ended, one as pictured from outside the drop's audience, an operator's action about another message, and an actor or action its reason doesn't take", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [ended, withPhoto, other] = [newId("cmt"), newId("cmt"), newId("cmt")];
      await message(tx, drop, w.cleo, "Hi", null, AT.opened, ended);
      await message(tx, drop, w.cleo, null, await photoFor(tx, w.cleo.user, drop), AT.opened, withPhoto);
      await message(tx, drop, w.ana, "Lovely", null, AT.opened, other);
      await tx`
        UPDATE app.comments SET state = 'deleted', body = NULL, ended_at = ${AT.close}, updated_at = ${AT.close}
         WHERE id = ${ended}
      `;
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => removal(sp, ended, drop, "moderation", null, await operatorRemoves(sp, ended)),
        /message .* has already ended/,
      );
      // Dan joins after the drop was committed, so isn't in its audience (T8), though a member now.
      const [dan] = await joinByRoster(tx, w.club, w.ana, [{ user: w.dan.user, label: "Dan" }], AT.close);
      if (!dan) throw new Error("no interval");
      await expectRefused(tx, REFUSED.foreignKey, (sp) =>
        removal(sp, withPhoto, drop, "pictured", { user: w.dan.user, interval: dan }),
      );
      const aboutOther = await operatorRemoves(tx, other);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => removal(sp, withPhoto, drop, "moderation", null, aboutOther),
        /a moderation removal cites the operator's removal of this message \(FQ27\)/,
      );
      // Each reason takes only its own: a pictured removal its member, an operator's its action.
      await expectRefused(
        tx,
        REFUSED.check,
        async (sp) => removal(sp, withPhoto, drop, "moderation", w.ana, await operatorRemoves(sp, withPhoto)),
        /comment_removals_pictured_actor/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        async (sp) => removal(sp, withPhoto, drop, "pictured", w.ana, await operatorRemoves(sp, withPhoto)),
        /comment_removals_moderation_action/,
      );
    });
  });

  it("refuses at commit a removed message without its record, and a record whose message isn't removed", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const [bare, deleted] = [newId("cmt"), newId("cmt")];
      await message(tx, drop, w.cleo, "Hi", null, AT.opened, bare);
      await message(tx, drop, w.cleo, null, await photoFor(tx, w.cleo.user, drop), AT.opened, deleted);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await endRemoved(sp, bare);
          await checkAsAtCommit(sp);
        },
        /message .* is removed and has no removal/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await removal(sp, deleted, drop, "pictured", w.ana);
          await sp`
            UPDATE app.comments SET state = 'deleted', body = NULL, photo_upload_id = NULL, ended_at = ${AT.close},
                   updated_at = ${AT.close}
             WHERE id = ${deleted}
          `;
          await checkAsAtCommit(sp);
        },
        /message .* is deleted and has a removal/,
      );
    });
  });

  it("writes a removal once, never changed or deleted", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const comment = newId("cmt");
      await message(tx, drop, w.cleo, null, await photoFor(tx, w.cleo.user, drop), AT.opened, comment);
      await removal(tx, comment, drop, "pictured", w.ana);
      await endRemoved(tx, comment);
      const once = /a removal is audited and written once \(T25\)/;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.comment_removals SET removed_at = ${AT.opened} WHERE comment_id = ${comment}`,
        once,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.comment_removals WHERE comment_id = ${comment}`,
        once,
      );
    });
  });
});

describe("the schema's lists and the latest photo message", () => {
  async function listed(table: string, constraint: string): Promise<string[]> {
    const [row] = await app<{ definition: string }[]>`
      SELECT pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint
       WHERE conrelid = ${`app.${table}`}::regclass AND conname = ${constraint}
    `;
    return [...(row?.definition ?? "").matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1] ?? "").sort();
  }

  it("lists exactly the contract's upload purposes and renditions", async () => {
    expect(await listed("uploads", "uploads_purpose_check")).toEqual([...UploadPurpose.options].sort());
    const renditions = new Set(
      OPERATIONS.flatMap((op) => (op.query?.shape["rendition"] as { options?: string[] } | undefined)?.options ?? []),
    );
    expect(renditions.size).toBe(3);
    expect(await listed("upload_renditions", "upload_renditions_kind_check")).toEqual([...renditions].sort());
  });

  it("indexes each drop's standing photo messages, latest first, for the reply preview (T65)", async () => {
    const [row] = await app<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'app' AND indexname = 'comments_latest_photo'
    `;
    expect(row?.indexdef).toBe(
      "CREATE INDEX comments_latest_photo ON app.comments USING btree (drop_id, created_at DESC, id DESC) " +
        "WHERE ((state = 'active'::text) AND (photo_upload_id IS NOT NULL))",
    );
  });
});
