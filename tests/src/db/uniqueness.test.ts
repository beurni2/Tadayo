// The keys that make a retry or a double tap harmless (B0 plan, slice 4): one receipt per caller,
// operation and key (T19); one highlight per contributor and day, and one per drop (T22); one
// favourite per member and drop (spec 18, 31); one reaction per member and drop (spec 16); and one
// day per club and date (T6).

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, commitDrop, newId, newWorld } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

const HASH = "a".repeat(64);

async function receipt(tx: Tx, user: string, operation: string, key: string): Promise<void> {
  await tx`
    INSERT INTO app.idempotency_receipts (actor_user_id, operation, idempotency_key, request_hash, created_at)
    VALUES (${user}, ${operation}, ${key}, ${HASH}, ${AT.added})
  `;
  await tx`
    UPDATE app.idempotency_receipts SET state = 'completed', response_status = 201, response_body = ${tx.json({ drop_id: "drp_1", version: 1 })}
     WHERE actor_user_id = ${user} AND operation = ${operation} AND idempotency_key = ${key}
  `;
}

describe("the uniqueness of receipts, highlights and favourites", () => {
  it("keeps one receipt per caller, operation and key (T19)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const key = randomUUID();
      await receipt(tx, w.ben.user, "createDrop", key);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => receipt(sp, w.ben.user, "createDrop", key),
        /idempotency_receipts_pkey/,
      );
      // The key is the caller's own: another account's same key is its own receipt.
      await receipt(tx, w.cleo.user, "createDrop", key);
    });
  });

  it("keeps one highlight per contributor and day (T22)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const first = await commitDrop(tx, w, w.ben);
      const second = await commitDrop(tx, w, w.ben);
      const point = (sp: Tx, drop: string) => sp`
        INSERT INTO app.highlights (occurrence_id, interval_id, drop_id, updated_at)
        VALUES (${w.day}, ${w.ben.interval}, ${drop}, ${AT.edited})
      `;
      await point(tx, first);
      await expectRefused(tx, REFUSED.unique, (sp) => point(sp, second), /highlights_pkey/);
      // A later change, as every change to a highlight is (T1, T3).
      await tx`
        UPDATE app.highlights SET drop_id = ${second}, version = 2, updated_at = ${new Date(AT.edited.getTime() + 60_000)}
         WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}
      `;
      const [row] = await tx<{ drop_id: string; version: number }[]>`
        SELECT drop_id, version FROM app.highlights WHERE occurrence_id = ${w.day} AND interval_id = ${w.ben.interval}
      `;
      expect(row).toEqual({ drop_id: second, version: 2 });
    });
  });

  it("keeps one favourite per member and drop (spec 18, 31)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const save = (sp: Tx) => sp`
        INSERT INTO app.favourites (interval_id, drop_id, created_at) VALUES (${w.cleo.interval}, ${drop}, ${AT.opened})
      `;
      await save(tx);
      await expectRefused(tx, REFUSED.unique, save, /favourites_pkey/);
    });
  });
});

describe("the other keys a double tap meets", () => {
  it("keeps one reaction per member and drop (spec 16)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const drop = await commitDrop(tx, w, w.ben);
      const react = (sp: Tx) => sp`
        INSERT INTO app.reactions (drop_id, interval_id, reaction, updated_at)
        VALUES (${drop}, ${w.cleo.interval}, 'heart', ${AT.opened})
      `;
      await react(tx);
      await expectRefused(tx, REFUSED.unique, react, /reactions_pkey/);
    });
  });

  it("keeps one day per club and date (T6)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.unique,
        (sp) => sp`
          INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
          VALUES (${newId("occ")}, ${w.club}, ${w.ana.interval}, ${w.version}, '2026-11-07', ${AT.reveal}, ${AT.close}, ${AT.generated})
        `,
        /occurrences_one_live_day/,
      );
    });
  });

  it("leaves a cancelled day's date to one other day, and keeps the cancelled one (FQ129)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await tx`UPDATE app.occurrences SET status = 'cancelled' WHERE id = ${w.day}`;
      const another = (sp: Tx) => sp`
        INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at, collecting_from)
        VALUES (${newId("occ")}, ${w.club}, ${w.ana.interval}, ${w.version}, '2026-11-07', ${AT.reveal}, ${AT.close}, ${AT.generated})
      `;
      await another(tx);
      await expectRefused(tx, REFUSED.unique, another, /occurrences_one_live_day/);
      const [kept] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM app.occurrences WHERE club_id = ${w.club} AND local_date = '2026-11-07'`;
      expect(kept?.n).toBe(2);
    });
  });

  it("keeps one live reservation per contributor and key (T19)", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await tx`
        INSERT INTO app.contribution_counters (occurrence_id, interval_id, club_id) VALUES (${w.day}, ${w.ben.interval}, ${w.club})
      `;
      const key = randomUUID();
      const reserve = (sp: Tx) => sp`
        INSERT INTO app.reservations (id, occurrence_id, interval_id, media_class, request_key, created_at, expires_at)
        VALUES (${newId("rsv")}, ${w.day}, ${w.ben.interval}, 'photo', ${key}, ${AT.added}, ${AT.reveal})
      `;
      await reserve(tx);
      await expectRefused(tx, REFUSED.unique, reserve, /reservations_interval_id_request_key_key/);
    });
  });
});
