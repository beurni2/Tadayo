// T19: one commit per idempotency key. The receipt's primary key is the last guard: a second
// request under the same caller, operation and key finds the first's receipt, and replays it
// only when it is the same request, path and query included, so a key reused on another drop or
// with another reason is IDEMPOTENCY_CONFLICT (review finding p2 of PR #14). A receipt commits
// only with its response, never changes once complete, and holds no text, link or token
// (TECH-DESIGN section 6).

import { randomUUID } from "node:crypto";
import { OPERATIONS } from "@tadayo/contracts";
import { type IdempotentRequest, replayOutcome, requestHash } from "@tadayo/domain";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, expectRefused, REFUSED, rolledBack, type Tx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, newWorld } from "./world.ts";

const app = appSql();
afterAll(async () => {
  await app.end();
});

type Outcome = { replay: unknown } | "IDEMPOTENCY_CONFLICT" | "first";

/**
 * What the command's first step does (TECH-DESIGN section 5): reserve the receipt, or find the
 * one already there and replay it or refuse.
 */
async function begin(tx: Tx, user: string, key: string, request: IdempotentRequest): Promise<Outcome> {
  const reserved = await tx`
    INSERT INTO app.idempotency_receipts (actor_user_id, operation, idempotency_key, request_hash, created_at)
    VALUES (${user}, ${request.operation}, ${key}, ${requestHash(request)}, ${AT.added})
    ON CONFLICT DO NOTHING
    RETURNING 1
  `;
  if (reserved.length === 1) return "first";
  const [stored] = await tx<{ request_hash: string; response_body: unknown }[]>`
    SELECT request_hash, response_body FROM app.idempotency_receipts
     WHERE actor_user_id = ${user} AND operation = ${request.operation} AND idempotency_key = ${key}
  `;
  if (!stored) throw new Error("no receipt");
  return replayOutcome(stored.request_hash, request) === "replay"
    ? { replay: stored.response_body }
    : "IDEMPOTENCY_CONFLICT";
}

async function complete(tx: Tx, user: string, key: string, operation: string, body: Record<string, unknown>) {
  await tx`
    UPDATE app.idempotency_receipts SET state = 'completed', response_status = 200, response_body = ${tx.json(body as never)}
     WHERE actor_user_id = ${user} AND operation = ${operation} AND idempotency_key = ${key}
  `;
}

const remove = (drop: string, reason: string): IdempotentRequest => ({
  operation: "removeDrop",
  path: { drop_id: drop },
  query: { reason },
  body: null,
});

describe("T19: the same key is the same request, or IDEMPOTENCY_CONFLICT", () => {
  it("replays the same removal, and refuses the key on another drop or with another reason", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const first = await commitDrop(tx, w, w.ben);
      const second = await commitDrop(tx, w, w.ben);
      const key = randomUUID();
      expect(await begin(tx, w.ben.user, key, remove(first, "withdraw"))).toBe("first");
      const response = { drop_id: first, state: "withdrawn" };
      await complete(tx, w.ben.user, key, "removeDrop", response);
      await checkAsAtCommit(tx);

      expect(await begin(tx, w.ben.user, key, remove(first, "withdraw"))).toEqual({ replay: response });
      expect(await begin(tx, w.ben.user, key, remove(second, "withdraw"))).toBe("IDEMPOTENCY_CONFLICT");
      expect(await begin(tx, w.ben.user, key, remove(first, "pictured"))).toBe("IDEMPOTENCY_CONFLICT");
      const [count] = await tx<{ n: number }[]>`
        SELECT count(*)::integer AS n FROM app.idempotency_receipts WHERE actor_user_id = ${w.ben.user}
      `;
      expect(count?.n).toBe(1);
    });
  });

  it("refuses a receipt left pending at the commit", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.integrity,
        async (sp) => {
          await begin(sp, w.ben.user, randomUUID(), remove("drp_x", "withdraw"));
          await checkAsAtCommit(sp);
        },
        /commits only with its response \(T19\)/,
      );
    });
  });

  it("never changes a completed receipt, nor the hash of a pending one", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      const key = randomUUID();
      await begin(tx, w.ben.user, key, remove("drp_x", "withdraw"));
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.idempotency_receipts SET request_hash = ${"b".repeat(64)} WHERE idempotency_key = ${key}`,
        /request_hash can't change/,
      );
      await complete(tx, w.ben.user, key, "removeDrop", { drop_id: "drp_x", state: "withdrawn" });
      await expectRefused(
        tx,
        REFUSED.integrity,
        (sp) => sp`UPDATE app.idempotency_receipts SET response_status = 201 WHERE idempotency_key = ${key}`,
        /a completed receipt never changes \(T19\)/,
      );
    });
  });

  it("stores no caption, comment, note, link or token in a response", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      for (const body of [
        { drop_id: "drp_x", caption: "Happy birthday" },
        { comment_id: "cmt_x", text: "So good" },
        { upload: { id: "upl_x", signed_upload: { method: "PUT" } } },
        { items: [{ link: { url: "https://example.invalid/a" } }] },
        { source: { original_url: "https://www.tiktok.com/@a/video/1" } },
        { token: "secret" },
      ]) {
        const key = randomUUID();
        await begin(tx, w.ben.user, key, remove("drp_x", "withdraw"));
        await expectRefused(
          tx,
          REFUSED.check,
          (sp) => complete(sp, w.ben.user, key, "removeDrop", body),
          /idempotency_receipts_response_body_check/,
        );
      }
    });
  });

  it("refuses an operation the contract doesn't make idempotent", async () => {
    await rolledBack(app, async (tx) => {
      const w = await newWorld(tx);
      await expectRefused(
        tx,
        REFUSED.check,
        (sp) => begin(sp, w.ben.user, randomUUID(), { operation: "getHome", path: {}, query: {}, body: null }),
        /idempotency_receipts_operation_check/,
      );
    });
  });

  it("lists exactly the contract's idempotent operations", async () => {
    const [row] = await app<{ definition: string }[]>`
      SELECT pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint
       WHERE conrelid = 'app.idempotency_receipts'::regclass AND conname = 'idempotency_receipts_operation_check'
    `;
    const listed = [...(row?.definition ?? "").matchAll(/'([A-Za-z]+)'::text/g)].map((match) => match[1]).sort();
    const idempotent = OPERATIONS.filter((op) => op.idempotent)
      .map((op) => op.id)
      .sort();
    expect(idempotent).toHaveLength(23);
    expect(listed).toEqual(idempotent);
  });
});
