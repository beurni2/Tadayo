// The database's last guards on adding to a day. Each is a backstop behind the command that holds
// the locks and reads the clock (TECH-DESIGN section 5): the cutoff (T3), nothing moved (T4),
// six and two (T17), reservations that end by the reveal (T18), no duplicate (T21), highlights as
// pointers (T22), a held drop never appearing late (T29), and uploads and links that keep nothing
// they shouldn't (T12, T40, T52).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, newId, newWorld, type World } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

function setHighlight(tx: Tx, w: World, drop: string | null, version: number, at: Date) {
  return tx`
    INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, version, updated_at)
    VALUES (${w.day}, ${w.ben.interval}, ${drop}, ${version}, ${at})
    ON CONFLICT (occurrence_id, interval_id) DO UPDATE SET drop_id = EXCLUDED.drop_id, version = EXCLUDED.version,
                                                          updated_at = EXCLUDED.updated_at
  `;
}

describe("T3: the reveal is the cutoff", () => {
  it("refuses a commit at the reveal", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => commitDrop(sp, w, w.ben, { media: "external_video", at: AT.reveal }),
        /before the reveal \(T3\)/,
      );
    });
  });

  it("lets a caption change before the reveal, and freezes it from the reveal on", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { caption: "Picnic" });
      await tx`UPDATE app.drops SET caption = 'Picnic!', version = 2, updated_at = ${AT.edited} WHERE id = ${drop}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.drops SET caption = 'Too late', version = 3, updated_at = ${AT.reveal} WHERE id = ${drop}`,
        /so the drop is frozen \(T3\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET dedupe_key = ${randomBytes(32)}, updated_at = ${AT.opened} WHERE id = ${drop}`,
        /so the drop is frozen \(T3\)/,
      );
    });
  });

  it("refuses a reservation made at the reveal or lasting past it (T18)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await tx`
        INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id) VALUES (${w.day}, ${w.ben.interval}, ${w.club})
      `;
      const reserve = (sp: Tx, created: Date, expires: Date) => sp`
        INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
        VALUES (${newId("rsv")}, ${w.day}, ${w.ben.interval}, 'photo', ${randomUUID()}, ${created}, ${expires})
      `;
      const refused = /before the reveal, and never past it \(T3, T18\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => reserve(sp, AT.added, AT.opened), refused);
      await expectRefused(tx, REFUSED.integrity, (sp) => reserve(sp, AT.reveal, AT.opened), refused);
      await reserve(tx, AT.added, AT.reveal);
    });
  });
});

describe("T4: the server never moves a drop", () => {
  it("never changes a drop's day, author or kind, and never deletes it", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      for (const [column, statement] of [
        ["occurrence_id", (sp: Tx) => sp`UPDATE app.drops SET occurrence_id = ${newId("occ")} WHERE id = ${drop}`],
        [
          "author_interval_id",
          (sp: Tx) => sp`UPDATE app.drops SET author_interval_id = ${w.cleo.interval} WHERE id = ${drop}`,
        ],
        ["media_class", (sp: Tx) => sp`UPDATE app.drops SET media_class = 'external_video' WHERE id = ${drop}`],
      ] as const) {
        await expectRefused(tx, REFUSED.integrity, statement, new RegExp(`app\\.drops\\.${column} can't change`));
      }
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.drops WHERE id = ${drop}`,
        /withdrawn or removed, never deleted/,
      );
    });
  });
});

describe("T29: a drop on hold at the reveal never appears afterwards", () => {
  it("releases a hold before the reveal, and refuses it from the reveal on", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.added} WHERE id = ${drop}`;
      await tx`UPDATE app.drops SET state = 'active', updated_at = ${AT.edited} WHERE id = ${drop}`;
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.edited} WHERE id = ${drop}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET state = 'active', updated_at = ${AT.opened} WHERE id = ${drop}`,
        /a held drop never appears after the reveal \(T29\)/,
      );
    });
  });
});

describe("T17: six and two, as a last guard behind the counter's lock", () => {
  it("refuses a seventh drop or a third link in the counter", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (let i = 0; i < 4; i += 1) await commitDrop(tx, w, w.ben);
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.ben, { media: "external_video" });
      const [counter] = await tx<{ committed_total: number; committed_external: number }[]>`
        SELECT committed_total, committed_external FROM app.contribution_counters
         WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}
      `;
      expect(counter).toEqual({ committed_total: 6, committed_external: 2 });
      await expectRefused(tx, REFUSED.check, (sp) => commitDrop(sp, w, w.ben), /contribution_counters_check2/);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          UPDATE app.contribution_counters SET committed_total = 5, committed_external = 2, reserved_total = 1,
                 reserved_external = 1
           WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}
        `,
        /contribution_counters_check3/,
      );
    });
  });

  it("ties a counter to one club's day and member", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const other = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        (sp) => sp`
          INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id)
          VALUES (${w.day}, ${other.ben.interval}, ${w.club})
        `,
      );
    });
  });
});

describe("T18: a reservation ends once", () => {
  it("never changes a used reservation", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.reservations SET state = 'live', ended_at = NULL, drop_id = NULL WHERE drop_id = ${drop}`,
        /a consumed reservation never changes \(T18\)/,
      );
    });
  });
});

describe("T21: the same photo or link once per author and day", () => {
  it("refuses a second live drop with the same scoped hash, and allows another author's", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { media: "external_video" });
      const [row] = await tx<{ dedupe_key: Buffer }[]>`SELECT dedupe_key FROM app.drops WHERE id = ${drop}`;
      if (!row) throw new Error("no drop");
      const second = await commitDrop(tx, w, w.ben, { media: "external_video", unsealed: true });
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`UPDATE app.drops SET dedupe_key = ${row.dedupe_key} WHERE id = ${second}`,
        /drops_no_duplicate/,
      );
      const cleos = await commitDrop(tx, w, w.cleo, { media: "external_video", unsealed: true });
      await tx`UPDATE app.drops SET dedupe_key = ${row.dedupe_key} WHERE id = ${cleos}`;
    });
  });
});

describe("T22: a highlight points to the contributor's own active drop, before the reveal", () => {
  it("sets, moves and clears it, moving its version by one each time", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [first, second] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ben)];
      await setHighlight(tx, w, first, 1, AT.added);
      await setHighlight(tx, w, second, 2, AT.edited);
      await setHighlight(tx, w, null, 3, AT.opened);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => setHighlight(sp, w, null, 3, AT.opened),
        /every change moves the version by one \(T22\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`DELETE FROM app.highlights WHERE occurrence_id = ${w.day}`,
        /cleared, never deleted/,
      );
    });
  });

  it("refuses another member's drop, a held drop, and any pointer from the reveal on", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const held = await commitDrop(tx, w, w.ben);
      const cleos = await commitDrop(tx, w, w.cleo);
      await expectRefused(
        tx,
        REFUSED.foreignKey,
        (sp) => setHighlight(sp, w, cleos, 1, AT.added),
        /highlights_drop_id/,
      );
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.added} WHERE id = ${held}`;
      const refused = /points to an active drop, before the reveal \(T3, T22\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => setHighlight(sp, w, held, 1, AT.added), refused);
      const active = await commitDrop(tx, w, w.ben);
      await expectRefused(tx, REFUSED.integrity, (sp) => setHighlight(sp, w, active, 1, AT.reveal), refused);
    });
  });

  it("refuses a withdrawal that leaves the highlight on the drop", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await setHighlight(tx, w, drop, 1, AT.added);
      await checkAsAtCommit(tx);
      const withdraw = async (sp: Tx) => {
        await sp`
          INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
          VALUES (${drop}, 'withdraw', ${w.ben.interval}, ${AT.edited})
        `;
        await sp`UPDATE app.drops SET state = 'withdrawn', ended_at = ${AT.edited}, updated_at = ${AT.edited} WHERE id = ${drop}`;
      };
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await withdraw(sp);
          await checkAsAtCommit(sp);
        },
        /ended with a highlight still on it \(T22\)/,
      );
      await withdraw(tx);
      await setHighlight(tx, w, null, 2, AT.edited);
      await checkAsAtCommit(tx);
    });
  });
});

describe("T12 and T40: uploads and links keep nothing they shouldn't", () => {
  it("starts an upload pending and never takes it back", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const insert = (sp: Tx, state: string) => sp`
        INSERT INTO app.uploads (id, owner_user_id, purpose, content_type, byte_size, object_key, created_at, expires_at, state,
                                 content_hash, content_version)
        VALUES (${newId("upl")}, ${w.ben.user}, 'avatar', 'image/png', 10, ${newId("uploads/raw")}, ${AT.added}, ${AT.close},
                ${state}, ${randomBytes(32)}, ${newId("v")})
      `;
      await expectRefused(tx, REFUSED.integrity, (sp) => insert(sp, "ready"), /an upload starts pending \(spec 33\)/);
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.uploads SET state = 'pending' FROM app.drops WHERE drops.id = ${drop} AND uploads.id = drops.upload_id`,
        /an upload goes from ready to pending/,
      );
    });
  });

  it("refuses a link with a query string or fragment, or a provider id that isn't one", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const insert = (sp: Tx, provider: string, post: string, url: string) => sp`
        INSERT INTO app.sources (id, owner_user_id, provider, provider_post_id, canonical_url, created_at, expires_at)
        VALUES (${newId("src")}, ${w.ben.user}, ${provider}, ${post}, ${url}, ${AT.added}, ${AT.close})
      `;
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => insert(sp, "tiktok", "123", "https://www.tiktok.com/@a/video/123?_t=tracking"),
        /sources_canonical_url_check/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => insert(sp, "instagram", "Cx1", "https://www.instagram.com/reel/Cx1/#share"),
        /sources_canonical_url_check/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => insert(sp, "tiktok", "abc", "https://www.tiktok.com/@a/video/abc"),
        /sources_check/,
      );
    });
  });
});
