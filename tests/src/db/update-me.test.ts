/// <reference lib="esnext.temporal" />
// `updateMe` against Postgres as `tadayo_app` (spec 23; T1, T14, T19, T27; FQ13, FQ69, FQ74; the contract's
// `updateMe`; packages/domain/src/identity/update-me.ts): the age confirmation, the name and the avatar in
// the order the profile is finished; the version, which moves once per change and never for a no-op; the
// receipt, which makes a retry the same request and a changed one a conflict; the row lock, which lets
// requests of one account race without a deadlock; and a deletion that begins meanwhile (T27).
//
// A refused request throws `Refused`, which the route's transaction rolls back, so a request in these
// tests is a savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.

import { randomUUID } from "node:crypto";
import { meBody } from "@tadayo/api";
import { Refused, updateMe, type ProfileEdit } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { invite } from "../matrix.ts";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, commitDrop, newAvatar, newId, newWorld, type UploadState } from "./world.ts";

// Twenty-four connections, so twenty requests of one account really are at the database together.
const db = worldSql(24);
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;

/** The clock these tests sample: a whole number of microseconds, the finest Postgres keeps. */
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const clock = fakeClock(AT_FIRST);

/** Inserts an account: finished by default (named, age confirmed at `AT.created`), version 0. */
async function account(tx: WorldTx, options: { name?: string | null; ageConfirmed?: boolean } = {}): Promise<string> {
  const id = newId("acct");
  const name = options.name === undefined ? "Ben" : options.name;
  const ageConfirmed = options.ageConfirmed ?? name !== null;
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${id}, ${randomUUID()}, ${ageConfirmed ? AT.created : null}, ${name}, ${AT.created})`;
  return id;
}

/** An avatar upload of `owner`'s that preparation has left in `state`; a ready one has its random version. */
const avatar = (tx: WorldTx, owner: string, state: UploadState) => newAvatar(plain(tx), owner, state);

/** One request as the route runs it: its own unit of work, which a refusal rolls back. */
const request = (tx: WorldTx, userId: string, edit: ProfileEdit, key: string = randomUUID()) =>
  tx.savepoint((sp) => updateMe(sp, clock, { userId, key, edit }, meBody));

/** What a refused request says, its code and its facts. Fails when the request wasn't refused. */
async function refusal(done: Promise<unknown>): Promise<{ code: string; facts: object }> {
  try {
    await done;
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
  throw new Error("the request wasn't refused");
}

interface UserRow {
  version: number;
  age_confirmed_at: Temporal.Instant | null;
  display_name: string | null;
  avatar_upload_id: string | null;
}
async function rowOf(tx: WorldTx, id: string): Promise<UserRow> {
  const [row] = await tx<UserRow[]>`
    SELECT version, age_confirmed_at, display_name, avatar_upload_id FROM app.users WHERE id = ${id}`;
  if (row === undefined) throw new Error("no such account");
  return row;
}

interface ReceiptRow {
  idempotency_key: string;
  state: string;
  response_status: number | null;
  response_body: unknown;
  created_at: Temporal.Instant;
}
const receiptsOf = (tx: WorldTx, id: string) =>
  tx<ReceiptRow[]>`
    SELECT idempotency_key, state, response_status, response_body, created_at
      FROM app.idempotency_receipts WHERE actor_user_id = ${id} AND operation = 'updateMe'`;

const FIRST = Temporal.Instant.from(AT_FIRST);

describe("confirming the age and naming the person (FQ13, FQ69)", () => {
  it("confirms the age first: the account has it from the server clock's sample, no name yet, its version one higher (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx, { name: null });
      expect(await request(tx, ben, { expected_version: 0, age_confirmed: true })).toEqual({
        id: ben,
        age_confirmed: true,
        version: 1,
      });
      const row = await rowOf(tx, ben);
      expect(row).toMatchObject({ version: 1, display_name: null, avatar_upload_id: null });
      expect(row.age_confirmed_at?.equals(FIRST)).toBe(true);
    });
  });

  // A name with a lone surrogate never reaches the command: the contract refuses it (`DisplayName`; the
  // route's test, services/api/src/identity/me.test.ts, and the privacy matrix's "a name that isn't well
  // formed"), so this file keeps the half only the database can show.
  it("keeps a name with a surrogate pair as it came: an emoji is well formed, and nothing changes it", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ana \u{1F600}" })).toMatchObject({
        display_name: "Ana \u{1F600}",
        version: 1,
      });
      expect((await rowOf(tx, ben)).display_name).toBe("Ana \u{1F600}");
    });
  });

  it("leaves the roster alone when someone who has accepted an open revision renames themselves: none is made and none changes (FQ66, FQ84 are B1's)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // Mo has accepted the club's open revision, as `invite` makes it.
      const mo = await invite(tx, w, AT.opened);
      const roster = async () => ({
        revisions: await tx`
          SELECT pg_catalog.to_jsonb(t) AS row FROM app.roster_revisions t WHERE t.club_id = ${w.club}
           ORDER BY pg_catalog.to_jsonb(t)::pg_catalog.text`,
        members: await tx`
          SELECT pg_catalog.to_jsonb(t) AS row FROM app.roster_revision_members t WHERE t.club_id = ${w.club}
           ORDER BY pg_catalog.to_jsonb(t)::pg_catalog.text`,
        candidates: await tx`
          SELECT pg_catalog.to_jsonb(t) AS row FROM app.roster_revision_candidates t WHERE t.club_id = ${w.club}
           ORDER BY pg_catalog.to_jsonb(t)::pg_catalog.text`,
        proposed: await tx`
          SELECT pg_catalog.to_jsonb(t) AS row FROM app.candidates t WHERE t.club_id = ${w.club}
           ORDER BY pg_catalog.to_jsonb(t)::pg_catalog.text`,
      });
      const before = await roster();
      expect(before.revisions.length).toBeGreaterThan(0);
      expect(before.candidates.length).toBeGreaterThan(0);
      expect(await request(tx, mo, { expected_version: 0, display_name: "Moira" })).toMatchObject({
        display_name: "Moira",
        version: 1,
      });
      // What a rename means for the revision Mo accepted is B1's to say; until then nothing in it moves.
      expect(await roster()).toEqual(before);
    });
  });

  it("takes the name with the age in one request, moving the version once, or in the request after it", async () => {
    await rolledBack(db, async (tx) => {
      const together = await account(tx, { name: null });
      expect(await request(tx, together, { expected_version: 0, age_confirmed: true, display_name: "Ben" })).toEqual({
        id: together,
        display_name: "Ben",
        age_confirmed: true,
        version: 1,
      });
      const apart = await account(tx, { name: null });
      expect(await request(tx, apart, { expected_version: 0, age_confirmed: true })).toMatchObject({ version: 1 });
      expect(await request(tx, apart, { expected_version: 1, display_name: "Ben" })).toEqual({
        id: apart,
        display_name: "Ben",
        age_confirmed: true,
        version: 2,
      });
    });
  });

  it("refuses a name or an avatar before the age is confirmed, naming the field, and the name first (the contract's order)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx, { name: null });
      const upload = await avatar(tx, ben, "ready");
      expect(await refusal(request(tx, ben, { expected_version: 0, display_name: "Ben" }))).toEqual({
        code: "INVALID_REQUEST",
        facts: { field: "display_name" },
      });
      expect(await refusal(request(tx, ben, { expected_version: 0, avatar_upload_id: upload.id }))).toEqual({
        code: "INVALID_REQUEST",
        facts: { field: "avatar_upload_id" },
      });
      expect(
        await refusal(request(tx, ben, { expected_version: 0, avatar_upload_id: upload.id, display_name: "Ben" })),
      ).toEqual({ code: "INVALID_REQUEST", facts: { field: "display_name" } });
      // Nothing was written by any of them, and `false` is no confirmation (the contract refuses it earlier).
      expect(await rowOf(tx, ben)).toMatchObject({ version: 0, age_confirmed_at: null, display_name: null });
      expect(await receiptsOf(tx, ben)).toEqual([]);
    });
  });

  it("takes the confirmation once: confirming again changes nothing, and a later change leaves the first instant standing (FQ13)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      expect(await request(tx, ben, { expected_version: 0, age_confirmed: true })).toMatchObject({
        age_confirmed: true,
        version: 0,
      });
      const row = await rowOf(tx, ben);
      expect(row.version).toBe(0);
      const first = Temporal.Instant.from("2026-11-01T10:00:00Z");
      expect(row.age_confirmed_at?.equals(first)).toBe(true);
      // The clock reads another instant now (AT_FIRST), and a name written at it doesn't move the confirmation.
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ben K" })).toMatchObject({ version: 1 });
      expect((await rowOf(tx, ben)).age_confirmed_at?.equals(first)).toBe(true);
    });
  });

  it("writes a name with a link-like shape in it, which the receipt's content check lets through under display_name", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ben see://me" })).toMatchObject({
        display_name: "Ben see://me",
      });
      const [receipt] = await receiptsOf(tx, ben);
      expect(receipt?.response_body).toMatchObject({ display_name: "Ben see://me" });
    });
  });
});

describe("the version", () => {
  it("moves by one for each change and not at all when nothing changes", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ben K" })).toMatchObject({ version: 1 });
      // The same name again, under another key: the account is as it was.
      expect(await request(tx, ben, { expected_version: 1, display_name: "Ben K" })).toMatchObject({
        display_name: "Ben K",
        version: 1,
      });
      expect(await request(tx, ben, { expected_version: 1, display_name: "Ben L" })).toMatchObject({ version: 2 });
      expect(await rowOf(tx, ben)).toMatchObject({ version: 2, display_name: "Ben L" });
      // A request that only holds the version changes nothing either.
      expect(await request(tx, ben, { expected_version: 2 })).toMatchObject({ version: 2 });
    });
  });

  it("is VERSION_CONFLICT with the current version when the caller read an older or a later one", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      await request(tx, ben, { expected_version: 0, display_name: "Ben K" });
      await request(tx, ben, { expected_version: 1, display_name: "Ben L" });
      for (const stale of [0, 1, 3, 40]) {
        expect(
          await refusal(request(tx, ben, { expected_version: stale, display_name: "Ben M" })),
          String(stale),
        ).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: 2 },
        });
      }
      expect(await rowOf(tx, ben)).toMatchObject({ version: 2, display_name: "Ben L" });
    });
  });

  it("is judged before the fields: a stale version with a bad avatar is the conflict, not the avatar's", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      await request(tx, ben, { expected_version: 0, display_name: "Ben K" });
      expect(await refusal(request(tx, ben, { expected_version: 0, avatar_upload_id: newId("upl") }))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 1 },
      });
    });
  });
});

describe("the idempotency key (T19)", () => {
  it("gives the same key and the same request the first answer again, writing nothing a second time", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const key = randomUUID();
      const first = await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key);
      const again = await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key);
      expect(again).toEqual(first);
      // The same bytes, not only the same fields: jsonb keeps a body's keys in its own order, and the
      // first answer is read back from the receipt too.
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(await rowOf(tx, ben)).toMatchObject({ version: 1, display_name: "Ben K" });
      const receipts = await receiptsOf(tx, ben);
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({ idempotency_key: key, state: "completed", response_status: 200 });
      expect(receipts[0]?.response_body).toEqual(first);
      // The receipt is dated by the server's clock (T1).
      expect(receipts[0]?.created_at.equals(FIRST)).toBe(true);
    });
  });

  it("gives the first answer even after the account has changed since, not the account as it is now", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const key = randomUUID();
      const first = await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key);
      await request(tx, ben, { expected_version: 1, display_name: "Ben L" });
      // The retry still holds version 0, which is stale now; it is a retry, not a new action.
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key)).toEqual(first);
      expect(await rowOf(tx, ben)).toMatchObject({ version: 2, display_name: "Ben L" });
    });
  });

  it("is IDEMPOTENCY_CONFLICT when the same key comes with another request, whatever the difference", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const key = randomUUID();
      await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key);
      for (const edit of [
        { expected_version: 0, display_name: "Cleo" },
        { expected_version: 1, display_name: "Ben K" },
        { expected_version: 0 },
        { expected_version: 0, display_name: "Ben K", age_confirmed: true },
      ] satisfies ProfileEdit[]) {
        expect(await refusal(request(tx, ben, edit, key)), JSON.stringify(edit)).toEqual({
          code: "IDEMPOTENCY_CONFLICT",
          facts: {},
        });
      }
      expect(await rowOf(tx, ben)).toMatchObject({ version: 1, display_name: "Ben K" });
    });
  });

  it("belongs to the account: another account's use of the same key is its own request", async () => {
    await rolledBack(db, async (tx) => {
      const [ben, cleo] = [await account(tx, { name: "Ben" }), await account(tx, { name: "Cleo" })];
      const key = randomUUID();
      const forBen = await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key);
      const forCleo = await request(tx, cleo, { expected_version: 0, display_name: "Cleo K" }, key);
      expect(forBen).toMatchObject({ id: ben, display_name: "Ben K" });
      expect(forCleo).toMatchObject({ id: cleo, display_name: "Cleo K" });
    });
  });

  it("replays each account's own answer under a key both used, and never the other's (the outside audit's B8)", async () => {
    await rolledBack(db, async (tx) => {
      const [ben, cleo] = [await account(tx, { name: "Ben" }), await account(tx, { name: "Cleo" })];
      const key = randomUUID();
      const bens = { expected_version: 0, display_name: "Ben K" } satisfies ProfileEdit;
      const cleos = { expected_version: 0, display_name: "Cleo K" } satisfies ProfileEdit;
      const forBen = await request(tx, ben, bens, key);
      const forCleo = await request(tx, cleo, cleos, key);
      // Each account's retry of its own request is its own first answer, whichever receipt the table
      // holds first: a lookup that forgot whose key it is would find the other account's for one of them.
      expect(await request(tx, ben, bens, key)).toEqual(forBen);
      expect(await request(tx, cleo, cleos, key)).toEqual(forCleo);
      // And the other's request under the key is another request of its own, never the other's answer.
      expect(await refusal(request(tx, ben, cleos, key))).toEqual({ code: "IDEMPOTENCY_CONFLICT", facts: {} });
      expect(await refusal(request(tx, cleo, bens, key))).toEqual({ code: "IDEMPOTENCY_CONFLICT", facts: {} });
      expect(await rowOf(tx, ben)).toMatchObject({ version: 1, display_name: "Ben K" });
      expect(await rowOf(tx, cleo)).toMatchObject({ version: 1, display_name: "Cleo K" });
    });
  });

  it("leaves no receipt behind when the request is refused, so the same key can be sent again", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const key = randomUUID();
      expect(await refusal(request(tx, ben, { expected_version: 5, display_name: "Ben K" }, key))).toMatchObject({
        code: "VERSION_CONFLICT",
      });
      expect(await receiptsOf(tx, ben)).toEqual([]);
      // The caller read the account again and retried under the key it still holds.
      expect(await request(tx, ben, { expected_version: 0, display_name: "Ben K" }, key)).toMatchObject({ version: 1 });
      expect(await receiptsOf(tx, ben)).toHaveLength(1);
    });
  });
});

describe("the avatar (FQ74)", () => {
  it("takes a ready avatar upload of its own: the avatar's version is the upload's random one", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const upload = await avatar(tx, ben, "ready");
      expect(await request(tx, ben, { expected_version: 0, avatar_upload_id: upload.id })).toEqual({
        id: ben,
        display_name: "Ben",
        avatar_version: upload.version,
        age_confirmed: true,
        version: 1,
      });
      expect((await rowOf(tx, ben)).avatar_upload_id).toBe(upload.id);
      // The same one again is no change; another replaces it and the old version goes.
      expect(await request(tx, ben, { expected_version: 1, avatar_upload_id: upload.id })).toMatchObject({
        version: 1,
      });
      const next = await avatar(tx, ben, "ready");
      expect(await request(tx, ben, { expected_version: 1, avatar_upload_id: next.id })).toMatchObject({
        avatar_version: next.version,
        version: 2,
      });
    });
  });

  it("answers NOT_FOUND alike for an upload that never existed, another account's, and one made for a drop (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const theirs = await avatar(tx, w.ben.user, "ready");
      const drop = await commitDrop(plain(tx), w, w.ana);
      const [photo] = await tx<{ upload_id: string }[]>`SELECT upload_id FROM app.drops WHERE id = ${drop}`;
      const answers = [];
      for (const id of [newId("upl"), theirs.id, photo?.upload_id ?? ""]) {
        answers.push(await refusal(request(tx, w.ana.user, { expected_version: 0, avatar_upload_id: id })));
      }
      // Nothing tells the three apart, and the account is as it was.
      expect(answers).toEqual([
        { code: "NOT_FOUND", facts: {} },
        { code: "NOT_FOUND", facts: {} },
        { code: "NOT_FOUND", facts: {} },
      ]);
      expect(await rowOf(tx, w.ana.user)).toMatchObject({ version: 0, avatar_upload_id: null });
    });
  });

  it("is MEDIA_NOT_READY for its own avatar upload until it is ready, and for one that never will be", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      for (const state of ["pending", "preparing", "held", "rejected"] as const) {
        const upload = await avatar(tx, ben, state);
        expect(await refusal(request(tx, ben, { expected_version: 0, avatar_upload_id: upload.id })), state).toEqual({
          code: "MEDIA_NOT_READY",
          facts: {},
        });
      }
      expect(await rowOf(tx, ben)).toMatchObject({ version: 0, avatar_upload_id: null });
    });
  });
});

describe("what the route hands the command", () => {
  it("refuses an id, a key or a version that the route never sends, before any statement runs", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const good = { userId: ben, key: randomUUID(), edit: { expected_version: 0 } as ProfileEdit };
      const run = (over: object) => updateMe(tx, clock, { ...good, ...over }, meBody);
      for (const userId of ["", "acct ben", "x".repeat(65), "acct'; --"]) {
        await expect(run({ userId }), userId).rejects.toThrow(TypeError);
      }
      for (const key of ["", "abc", `${randomUUID()}0`, randomUUID().replaceAll("-", "")]) {
        await expect(run({ key }), key).rejects.toThrow(TypeError);
      }
      for (const expected_version of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
        await expect(run({ edit: { expected_version } }), String(expected_version)).rejects.toThrow(TypeError);
      }
      await expect(run({ edit: { expected_version: 0, avatar_upload_id: "not an id!" } })).rejects.toThrow(TypeError);
      expect(await receiptsOf(tx, ben)).toEqual([]);
    });
  });
});

describe("requests at once, committed (T19, T27)", () => {
  /** An account that other connections can see: committed, and left in the database like the first sign-in test's. */
  const committed = () => db.begin((tx) => account(tx));
  const committedReceipts = (id: string) => receiptsOf(db as unknown as WorldTx, id);
  const committedRow = (id: string) => rowOf(db as unknown as WorldTx, id);
  const asRoute = (userId: string, edit: ProfileEdit, key: string = randomUUID()) =>
    db.begin((tx) => updateMe(tx, clock, { userId, key, edit }, meBody));

  /** What the settled requests were refused with: the reasons of the rejected ones. */
  const rejections = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.flatMap((one) => (one.status === "rejected" ? [one.reason as unknown] : []));

  it("lets two requests that read the same version race: one wins, the other is told the new version, and nothing waits for ever", async () => {
    const ben = await committed();
    const results = await Promise.allSettled([
      asRoute(ben, { expected_version: 0, display_name: "Ben A" }),
      asRoute(ben, { expected_version: 0, display_name: "Ben B" }),
    ]);
    const lost = rejections(results);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toBeInstanceOf(Refused);
    expect(lost[0]).toMatchObject({ code: "VERSION_CONFLICT", facts: { current_version: 1 } });
    const row = await committedRow(ben);
    expect(row.version).toBe(1);
    expect(["Ben A", "Ben B"]).toContain(row.display_name);
    // The loser left no receipt: its transaction was rolled back whole.
    expect(await committedReceipts(ben)).toHaveLength(1);
  });

  it("lets twenty requests of one account at once serialize on its row: one writes, nineteen are conflicts, none a deadlock", async () => {
    const ben = await committed();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        asRoute(ben, { expected_version: 0, display_name: `Ben ${String(index)}` }),
      ),
    );
    const lost = rejections(results);
    // Anything but a conflict, a deadlock (40P01) above all, would be a different error here.
    expect(lost.filter((reason) => reason instanceof Refused && reason.code === "VERSION_CONFLICT")).toHaveLength(19);
    expect(lost).toHaveLength(19);
    expect((await committedRow(ben)).version).toBe(1);
    expect(await committedReceipts(ben)).toHaveLength(1);
  });

  it("gives two sends of the same key at once the same answer, and writes once", async () => {
    const ben = await committed();
    const key = randomUUID();
    const edit = { expected_version: 0, display_name: "Ben K" } satisfies ProfileEdit;
    const [one, two] = await Promise.all([asRoute(ben, edit, key), asRoute(ben, edit, key)]);
    expect(two).toEqual(one);
    expect(one).toMatchObject({ id: ben, display_name: "Ben K", version: 1 });
    expect((await committedRow(ben)).version).toBe(1);
    expect(await committedReceipts(ben)).toHaveLength(1);
  });

  it("is refused once the account's deletion has begun, whether it began before the request or while it waited (T27)", async () => {
    const before = await committed();
    await db`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${before}`;
    expect(await refusal(asRoute(before, { expected_version: 0, display_name: "Ben K" }))).toEqual({
      code: "UNAUTHENTICATED",
      facts: {},
    });
    expect(await committedRow(before)).toMatchObject({ version: 0, display_name: "Ben" });
    expect(await committedReceipts(before)).toEqual([]);

    // The deletion holds the row; the edit passes the gate's read, reaches the row and waits on it.
    const during = await committed();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let begun: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const deleting = db.begin(async (tx) => {
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${during}`;
      begun();
      await held;
    });
    await started;
    const edit = asRoute(during, { expected_version: 0, display_name: "Ben K" });
    // Give the edit the time to reach the row's lock: it can't finish while the deletion holds it.
    const settled = await Promise.race([
      edit.then(
        () => "finished",
        () => "finished",
      ),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("waiting");
        }, 300);
      }),
    ]);
    expect(settled).toBe("waiting");
    finish();
    await deleting;
    expect(await refusal(edit)).toEqual({ code: "UNAUTHENTICATED", facts: {} });
    expect(await committedRow(during)).toMatchObject({ version: 0, display_name: "Ben" });
    expect(await committedReceipts(during)).toEqual([]);
  });
});
