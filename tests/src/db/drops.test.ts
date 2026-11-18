// The database's last guards on adding to a day. Each is a backstop behind the command that holds
// the locks and reads the clock (TECH-DESIGN section 5): the cutoff (T3), nothing moved (T4),
// each role's allowance (T17), reservations that end by the reveal (T18), no duplicate (T21), highlights as
// pointers (T22), a held drop never appearing late (T29), and uploads and links that keep nothing
// they shouldn't (T12, T40, T52).

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, newId, newWorld, type Member, type World } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

/** An instant `minutes` after `at`. */
function after(at: Date, minutes = 1): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

/** A live photo slot for `member` on the world's day. */
async function reserve(tx: Tx, w: World, member: Member): Promise<string> {
  await tx`
    INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id)
    VALUES (${w.day}, ${member.interval}, ${w.club}) ON CONFLICT DO NOTHING
  `;
  const id = newId("rsv");
  await tx`
    INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
    VALUES (${id}, ${w.day}, ${member.interval}, 'photo', ${randomUUID()}, ${AT.added}, ${AT.reveal})
  `;
  return id;
}

/** An upload of `owner`'s, for a slot, as a drop's replacement, or as an avatar, taken to `end`. */
async function upload(
  tx: Tx,
  owner: string,
  purpose: { reservation: string } | { replaces: string } | "avatar",
  end: "pending" | "ready" | "held" = "ready",
): Promise<string> {
  const id = newId("upl");
  const reservation = typeof purpose === "object" && "reservation" in purpose ? purpose.reservation : null;
  const replaces = typeof purpose === "object" && "replaces" in purpose ? purpose.replaces : null;
  const kind = reservation ? "drop_photo" : replaces ? "replacement" : "avatar";
  await tx`
    INSERT INTO app.uploads (id, owner_user_id, purpose, reservation_id, replaces_drop_id, content_type, byte_size, object_key,
                             created_at, expires_at)
    VALUES (${id}, ${owner}, ${kind}, ${reservation}, ${replaces}, 'image/jpeg', 1000, ${newId("uploads/raw")}, ${AT.added},
            ${AT.close})
  `;
  if (end !== "pending") {
    await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${id}`;
    await tx`
      UPDATE app.uploads SET state = ${end}, content_hash = ${randomBytes(32)}, content_version = ${newId("v")} WHERE id = ${id}
    `;
  }
  return id;
}

/** The drop row of a photo commit, alone: the guards it meets run before its foreign keys. */
function insertPhotoDrop(tx: Tx, w: World, author: Member, uploadId: string, state = "active", version = 1) {
  return tx`
    INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, upload_id, dedupe_key, state, version,
                           submitted_at, updated_at)
    VALUES (${newId("drp")}, ${w.day}, ${w.club}, ${author.interval}, 'photo', ${uploadId}, ${randomBytes(32)}, ${state},
            ${version}, ${AT.added}, ${AT.added})
  `;
}

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

  it("lets a replacement nobody committed go at any instant, and takes no new one from the reveal on (spec 09, T3)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const first = await upload(tx, w.ben.user, { replaces: drop }, "pending");
      await tx`UPDATE app.drops SET pending_upload_id = ${first}, updated_at = ${AT.edited} WHERE id = ${drop}`;
      // Letting it go changes nothing anyone sees, so it needs no instant of its own.
      await tx`UPDATE app.drops SET pending_upload_id = NULL WHERE id = ${drop}`;
      await tx`UPDATE app.drops SET pending_upload_id = ${first}, updated_at = ${after(AT.edited)} WHERE id = ${drop}`;
      // Still preparing at the reveal: the day opens on the current photo, and the replacement goes.
      await tx`UPDATE app.drops SET pending_upload_id = NULL, updated_at = ${AT.opened} WHERE id = ${drop}`;
      const second = await upload(tx, w.ben.user, { replaces: drop }, "pending");
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.drops SET pending_upload_id = ${second}, updated_at = ${after(AT.opened)} WHERE id = ${drop}`,
        /so the drop is frozen \(T3\)/,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET pending_upload_id = ${second} WHERE id = ${drop}`,
        /a change to a drop's content or state carries the instant it was made \(T1, T3\)/,
      );
    });
  });

  it("judges every change at its own instant, and an edit is a new version (T1, T3, T19)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben, { caption: "Picnic" });
      const instant = /a change to a drop's content or state carries the instant it was made \(T1, T3\)/;
      // An edit that kept the commit's instant would be judged at that instant, even after the reveal.
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET caption = 'Late', version = 2 WHERE id = ${drop}`,
        instant,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET state = 'held' WHERE id = ${drop}`,
        instant,
      );
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET caption = 'Picnic!', updated_at = ${AT.edited} WHERE id = ${drop}`,
        /an edit of a drop's caption or media moves its version by one \(T19\)/,
      );
      await tx`UPDATE app.drops SET caption = 'Picnic!', version = 2, updated_at = ${AT.edited} WHERE id = ${drop}`;
      const back = /a drop's version and time never go back \(T19\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => sp`UPDATE app.drops SET version = 1 WHERE id = ${drop}`, back);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET updated_at = ${AT.added} WHERE id = ${drop}`,
        back,
      );
    });
  });

  it("commits a drop only active and at version 1", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const slot = await reserve(tx, w, w.ben);
      const photo = await upload(tx, w.ben.user, { reservation: slot });
      const refused = /a drop is committed active, at version 1, before the reveal \(T3\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => insertPhotoDrop(sp, w, w.ben, photo, "held"), refused);
      await expectRefused(tx, REFUSED.integrity, (sp) => insertPhotoDrop(sp, w, w.ben, photo, "active", 2), refused);
      await insertPhotoDrop(tx, w, w.ben, photo);
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
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${after(AT.added)} WHERE id = ${drop}`;
      await tx`UPDATE app.drops SET state = 'active', updated_at = ${AT.edited} WHERE id = ${drop}`;
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${after(AT.edited)} WHERE id = ${drop}`;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.drops SET state = 'active', updated_at = ${AT.opened} WHERE id = ${drop}`,
        /a held drop never appears after the reveal \(T29\)/,
      );
    });
  });
});

describe("T17: allowances by role, as a last guard behind the counter's lock", () => {
  /** The counter of `member` on `day`: its limits and its committed counts. */
  async function counterOf(tx: Tx, day: string, member: Member) {
    const [row] = await tx<
      {
        total_limit: number;
        photo_limit: number;
        external_limit: number;
        committed_total: number;
        committed_external: number;
      }[]
    >`
      SELECT total_limit, photo_limit, external_limit, committed_total, committed_external FROM app.contribution_counters
       WHERE occurrence_id = ${day} AND interval_id = ${member.interval}
    `;
    return row;
  }

  /** Another day of the world's club, whose star is `star` (its weekday's, from its first date). */
  async function dayOf(tx: Tx, w: World, star: Member, date: string): Promise<string> {
    const id = newId("occ");
    const reveal = new Date(`${date}T07:00:00Z`);
    await tx`
      INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                   collecting_from)
      VALUES (${id}, ${w.club}, ${star.interval}, ${w.version}, ${date}, ${reveal}, ${new Date(reveal.getTime() + 18 * 3600e3)},
              ${AT.generated})
    `;
    return id;
  }

  const STAR = { total_limit: 6, photo_limit: 6, external_limit: 2 };
  const FRIEND = { total_limit: 3, photo_limit: 2, external_limit: 1 };

  it("writes each counter's limits from its holder's role in that day: the star's 6, 6 and 2, anyone else's 3, 2 and 1 (addendum 2)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (const member of [w.ana, w.ben, w.cleo]) await commitDrop(tx, w, member);
      expect(await counterOf(tx, w.day, w.ana)).toMatchObject(STAR);
      expect(await counterOf(tx, w.day, w.ben)).toMatchObject(FRIEND);
      expect(await counterOf(tx, w.day, w.cleo)).toMatchObject(FRIEND);
      // Ben's own Friday: Ben is its star, and Ana anyone else.
      const friday = await dayOf(tx, w, w.ben, "2026-11-13");
      await commitDrop(tx, { ...w, day: friday }, w.ben);
      await commitDrop(tx, { ...w, day: friday }, w.ana);
      expect(await counterOf(tx, friday, w.ben)).toMatchObject(STAR);
      expect(await counterOf(tx, friday, w.ana)).toMatchObject(FRIEND);
    });
  });

  it("refuses a counter that names its own limits, and any change to them (T17)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      // Each limit named alone, at the star's value, for Ben, a friend that day.
      for (const [limit, value] of [
        ["total_limit", 6],
        ["photo_limit", 6],
        ["external_limit", 2],
      ] as const) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`
            INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id, ${sp(limit)})
            VALUES (${w.day}, ${w.ben.interval}, ${w.club}, ${value})
          `,
          /the limits come from the day's star interval, never from the caller \(T17\)/,
        );
      }
      await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          UPDATE app.contribution_counters SET total_limit = 6, photo_limit = 6, external_limit = 2
           WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}
        `,
        /app\.contribution_counters\.total_limit can't change/,
      );
    });
  });

  it("refuses a friend's third photo, second link, or a photo slot beyond two photos (addendum 2)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.ben);
      await commitDrop(tx, w, w.ben, { media: "external_video" });
      expect(await counterOf(tx, w.day, w.ben)).toMatchObject({ ...FRIEND, committed_total: 3, committed_external: 1 });
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => commitDrop(sp, w, w.ben),
        /contribution_counters_photos_within_limit/,
      );
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => commitDrop(sp, w, w.ben, { media: "external_video" }),
        /contribution_counters_links_within_limit/,
      );
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.cleo);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          UPDATE app.contribution_counters SET reserved_total = reserved_total + 1
           WHERE occurrence_id = ${w.day} AND interval_id = ${w.cleo.interval}
        `,
        /contribution_counters_photos_within_limit/,
      );
      // A friend's reserved link counts toward the one link, as a reserved photo toward the two.
      const other = await newWorld(tx);
      await commitDrop(tx, other, other.ben, { media: "external_video" });
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          UPDATE app.contribution_counters SET reserved_total = reserved_total + 1, reserved_external = reserved_external + 1
           WHERE occurrence_id = ${other.day} AND interval_id = ${other.ben.interval}
        `,
        /contribution_counters_links_within_limit/,
      );
    });
  });

  it("refuses limits outside the two roles' sets with the trigger off, as the last guard behind it (T17, T58)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await tx.unsafe("ALTER TABLE app.contribution_counters DISABLE TRIGGER contribution_counters_limits");
      const counter = (sp: Tx, limits: readonly [number | null, number | null, number | null]) => sp`
        INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id, total_limit, photo_limit, external_limit)
        VALUES (${w.day}, ${w.ben.interval}, ${w.club}, ${limits[0]}, ${limits[1]}, ${limits[2]})
      `;
      // Each set one value off a role's own: a friend's with one of the star's, and the star's with one of a friend's.
      for (const limits of [
        [6, 2, 1],
        [3, 6, 1],
        [3, 2, 2],
        [3, 6, 2],
        [6, 2, 2],
        [6, 6, 1],
      ] as const) {
        await expectRefused(tx, REFUSED.check, (sp) => counter(sp, limits), /contribution_counters_limits_by_role/);
      }
      // A null limit would pass every CHECK; the columns refuse it.
      for (const limits of [
        [null, 2, 1],
        [3, null, 1],
        [3, 2, null],
      ] as const) {
        await expectRefused(tx, REFUSED.notNull, (sp) => counter(sp, limits));
      }
    });
  });

  it("refuses a seventh drop or a third link in the counter", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (let i = 0; i < 4; i += 1) await commitDrop(tx, w, w.ana);
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.ana, { media: "external_video" });
      expect(await counterOf(tx, w.day, w.ana)).toMatchObject({ ...STAR, committed_total: 6, committed_external: 2 });
      await expectRefused(tx, REFUSED.check, (sp) => commitDrop(sp, w, w.ana), /contribution_counters_check2/);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => sp`
          UPDATE app.contribution_counters SET committed_total = 5, committed_external = 2, reserved_total = 1,
                 reserved_external = 1
           WHERE occurrence_id = ${w.day} AND interval_id = ${w.ana.interval}
        `,
        /contribution_counters_check3/,
      );
      // Six photos are the star's too.
      const other = await newWorld(tx);
      for (let i = 0; i < 6; i += 1) await commitDrop(tx, other, other.ana);
      expect(await counterOf(tx, other.day, other.ana)).toMatchObject({ committed_total: 6, committed_external: 0 });
    });
  });

  it("keeps each member's counts on each day apart from every other's (ND04)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      // Ben's allowance on Ana's Saturday is used up; Cleo's there, and Ben's on other days, aren't.
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.ben);
      await commitDrop(tx, w, w.ben, { media: "external_video" });
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, w, w.cleo);
      await commitDrop(tx, w, w.cleo, { media: "external_video" });
      const thursday = { ...w, day: await dayOf(tx, w, w.cleo, "2026-11-12") };
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, thursday, w.ben);
      await commitDrop(tx, thursday, w.ben, { media: "external_video" });
      const friday = { ...w, day: await dayOf(tx, w, w.ben, "2026-11-13") };
      for (let i = 0; i < 4; i += 1) await commitDrop(tx, friday, w.ben);
      for (let i = 0; i < 2; i += 1) await commitDrop(tx, friday, w.ben, { media: "external_video" });
      expect(await counterOf(tx, w.day, w.ben)).toMatchObject({ ...FRIEND, committed_total: 3, committed_external: 1 });
      expect(await counterOf(tx, w.day, w.cleo)).toMatchObject({
        ...FRIEND,
        committed_total: 3,
        committed_external: 1,
      });
      expect(await counterOf(tx, thursday.day, w.ben)).toMatchObject({
        ...FRIEND,
        committed_total: 3,
        committed_external: 1,
      });
      expect(await counterOf(tx, friday.day, w.ben)).toMatchObject({
        ...STAR,
        committed_total: 6,
        committed_external: 2,
      });
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
      // Ana's, since a link a second time is the star's alone (addendum 2).
      const drop = await commitDrop(tx, w, w.ana, { media: "external_video" });
      const [row] = await tx<{ dedupe_key: Buffer }[]>`SELECT dedupe_key FROM app.drops WHERE id = ${drop}`;
      if (!row) throw new Error("no drop");
      const second = await commitDrop(tx, w, w.ana, { media: "external_video", unsealed: true });
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`UPDATE app.drops SET dedupe_key = ${row.dedupe_key}, updated_at = ${AT.edited} WHERE id = ${second}`,
        /drops_no_duplicate/,
      );
      const cleos = await commitDrop(tx, w, w.cleo, { media: "external_video", unsealed: true });
      await tx`UPDATE app.drops SET dedupe_key = ${row.dedupe_key}, updated_at = ${AT.edited} WHERE id = ${cleos}`;
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
      await setHighlight(tx, w, null, 3, after(AT.edited));
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => setHighlight(sp, w, null, 3, after(AT.edited, 2)),
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

  it("clears it from the reveal on only when its drop ends (T3, T22, T24)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      await setHighlight(tx, w, drop, 1, AT.added);
      const ends = /from the reveal on, a highlight is cleared only when its drop ends \(T3, T22\)/;
      await expectRefused(tx, REFUSED.integrity, (sp) => setHighlight(sp, w, null, 2, AT.opened), ends);
      // A hold keeps it (T29).
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${AT.opened} WHERE id = ${drop}`;
      await expectRefused(tx, REFUSED.integrity, (sp) => setHighlight(sp, w, null, 2, AT.opened), ends);
      // Cleo, in the photograph, removes it, and the highlight goes with it.
      await tx`
        INSERT INTO app.drop_removals (drop_id, reason, actor_interval_id, removed_at)
        VALUES (${drop}, 'pictured', ${w.cleo.interval}, ${after(AT.opened)})
      `;
      await tx`
        UPDATE app.drops SET state = 'removed', ended_at = ${after(AT.opened)}, updated_at = ${after(AT.opened)} WHERE id = ${drop}
      `;
      await setHighlight(tx, w, null, 2, after(AT.opened));
      await checkAsAtCommit(tx);
    });
  });

  it("judges every change at its own instant, later than the last (T1, T3)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const [first, second] = [await commitDrop(tx, w, w.ben), await commitDrop(tx, w, w.ben)];
      await setHighlight(tx, w, first, 1, AT.added);
      const later = /every change carries the instant it was made, later than the last \(T1, T3\)/;
      // After the reveal, a clear or a move that kept the old instant would be judged before it.
      for (const drop of [null, second]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`UPDATE app.highlights SET drop_id = ${drop}, version = 2 WHERE occurrence_id = ${w.day}`,
          later,
        );
      }
      await expectRefused(tx, REFUSED.integrity, (sp) => setHighlight(sp, w, second, 2, after(AT.added, -1)), later);
      await setHighlight(tx, w, second, 2, after(AT.added));
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
      await tx`UPDATE app.drops SET state = 'held', updated_at = ${after(AT.added)} WHERE id = ${held}`;
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

  it("commits only the author's own ready upload, made for that day's slot or that drop (T12)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const refused = /a drop's photo is its author's ready upload for this day or this drop \(T12\)/;
      const bens = await reserve(tx, w, w.ben);
      const cleosPhoto = await upload(tx, w.cleo.user, { reservation: await reserve(tx, w, w.cleo) });
      const avatar = await upload(tx, w.ben.user, "avatar");
      const held = await upload(tx, w.ben.user, { reservation: bens }, "held");
      for (const other of [cleosPhoto, avatar, held]) {
        await expectRefused(tx, REFUSED.integrity, (sp) => insertPhotoDrop(sp, w, w.ben, other), refused);
      }
      // A swap takes the author's ready replacement made for that drop, and nothing else.
      const drop = await commitDrop(tx, w, w.ben);
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.drops SET upload_id = ${cleosPhoto}, version = 2, updated_at = ${AT.edited} WHERE id = ${drop}`,
        refused,
      );
      const replacement = await upload(tx, w.ben.user, { replaces: drop });
      // Ben's own ready photo, but made to replace another drop, commits nothing new.
      await expectRefused(tx, REFUSED.integrity, (sp) => insertPhotoDrop(sp, w, w.ben, replacement), refused);
      await tx`
        UPDATE app.drops SET upload_id = ${replacement}, dedupe_key = ${randomBytes(32)}, version = 2, updated_at = ${AT.edited}
         WHERE id = ${drop}
      `;
    });
  });

  it("puts an upload only into its owner's own slot or drop (T12)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const refused = /an upload fills only its owner's own slot or drop \(T12\)/;
      const cleosSlot = await reserve(tx, w, w.cleo);
      await expectRefused(tx, REFUSED.integrity, (sp) => upload(sp, w.ben.user, { reservation: cleosSlot }), refused);
      const bensDrop = await commitDrop(tx, w, w.ben);
      await expectRefused(tx, REFUSED.integrity, (sp) => upload(sp, w.cleo.user, { replaces: bensDrop }), refused);
    });
  });

  it("commits only a link its author resolved (T40)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const source = newId("src");
      await tx`
        INSERT INTO app.sources (id, owner_user_id, provider, provider_post_id, canonical_url, created_at, expires_at)
        VALUES (${source}, ${w.cleo.user}, 'tiktok', '7000000000000000001', 'https://www.tiktok.com/@cleo/video/7000000000000000001',
                ${AT.added}, ${AT.close})
      `;
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`
          INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, source_id, dedupe_key, submitted_at,
                                 updated_at)
          VALUES (${newId("drp")}, ${w.day}, ${w.club}, ${w.ben.interval}, 'external_video', ${source}, ${randomBytes(32)},
                  ${AT.added}, ${AT.added})
        `,
        /a drop's link is one its author resolved \(T40\)/,
      );
    });
  });

  it("makes an avatar only of a ready upload made as one (T12, FQ74)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const refused = /an avatar is a ready upload made as one \(T12, FQ74\)/;
      const photo = await upload(tx, w.ben.user, { reservation: await reserve(tx, w, w.ben) });
      const pending = await upload(tx, w.ben.user, "avatar", "pending");
      for (const id of [photo, pending]) {
        await expectRefused(
          tx,
          REFUSED.integrity,
          (sp) => sp`UPDATE app.users SET avatar_upload_id = ${id} WHERE id = ${w.ben.user}`,
          refused,
        );
      }
      const avatar = await upload(tx, w.ben.user, "avatar");
      await tx`UPDATE app.users SET avatar_upload_id = ${avatar} WHERE id = ${w.ben.user}`;
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
