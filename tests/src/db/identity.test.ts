/// <reference lib="esnext.temporal" />
// The account behind a sign-in, against Postgres as `tadayo_app` (spec 23; T1, T27, T53; FQ13, FQ69,
// FQ74; packages/domain/src/identity/account.ts). Supabase Auth owns sign-in, so the API's only record
// of a person is the `app.users` row their token's subject maps to: made on the first request, found
// by one query on every later one, and ended by a deletion at once. These tests run the two functions
// the sign-in gate calls, `findAccount` and `createAccount`, on the real schema.

import { randomBytes, randomUUID } from "node:crypto";
import { createAccount, findAccount } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, rolledBack, worldSql, type WorldTx } from "./harness.ts";
import { AT, newId } from "./world.ts";

// Twenty connections, so twenty first requests really are at the database together.
const db = worldSql(20);
const app = appSql();
afterAll(async () => {
  await Promise.all([db.end(), app.end()]);
});

/** The clock these tests sample: a whole number of microseconds, the finest Postgres keeps. */
const AT_FIRST = "2026-11-11T05:00:00.123456Z";

/** Inserts an account with a profile, in `state`, and returns it with the subject its token carries. */
async function account(
  tx: WorldTx,
  options: { state?: "active" | "deleting"; name?: string | null; ageConfirmed?: boolean } = {},
): Promise<{ id: string; subject: string }> {
  const id = newId("acct");
  const subject = randomUUID();
  const name = options.name === undefined ? "Ben" : options.name;
  const ageConfirmed = options.ageConfirmed ?? name !== null;
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${id}, ${subject}, ${ageConfirmed ? AT.created : null}, ${name}, ${AT.created})`;
  if (options.state === "deleting") {
    await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${id}`;
  }
  return { id, subject };
}

/** A ready avatar upload of `owner`'s, set as their avatar; returns its random content version. */
async function avatar(tx: WorldTx, owner: string): Promise<string> {
  const upload = newId("upl");
  const version = newId("v");
  await tx`
    INSERT INTO app.uploads (id, owner_user_id, purpose, content_type, byte_size, object_key, created_at, expires_at)
    VALUES (${upload}, ${owner}, 'avatar', 'image/jpeg', 1000, ${newId("uploads/raw")}, ${AT.created}, ${AT.close})`;
  await tx`UPDATE app.uploads SET state = 'preparing' WHERE id = ${upload}`;
  await tx`
    UPDATE app.uploads SET state = 'ready', content_hash = ${randomBytes(32)}, content_version = ${version}
     WHERE id = ${upload}`;
  await tx`UPDATE app.users SET avatar_upload_id = ${upload} WHERE id = ${owner}`;
  return version;
}

const rowsOf = async (tx: WorldTx, subject: string) =>
  tx<{ id: string }[]>`SELECT id FROM app.users WHERE auth_subject = ${subject}`;

describe("the account behind a sign-in (spec 23)", () => {
  it("finds nobody for a subject that has never signed in", async () => {
    await rolledBack(db, async (tx) => {
      expect(await findAccount(tx, randomUUID())).toBeNull();
    });
  });

  it("finds an account by its subject: its state, name, age confirmation and version, in one query (FQ13, FQ69)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      expect(await findAccount(tx, ben.subject)).toEqual({
        id: ben.id,
        state: "active",
        displayName: "Ben",
        ageConfirmed: true,
        version: 0,
        avatarVersion: null,
      });
      // An account whose profile isn't finished has no name and has not confirmed its age.
      const unfinished = await account(tx, { name: null });
      expect(await findAccount(tx, unfinished.subject)).toEqual({
        id: unfinished.id,
        state: "active",
        displayName: null,
        ageConfirmed: false,
        version: 0,
        avatarVersion: null,
      });
    });
  });

  it("gives an avatar's version: the random one the account's own avatar upload holds, and none to an account without one (FQ74)", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const version = await avatar(tx, ben.id);
      expect((await findAccount(tx, ben.subject))?.avatarVersion).toBe(version);
      // That the upload is ready is the schema's, not this query's, which also asks: `users_avatar_guard`
      // takes no other, and ready is final (tests/src/db/drops.test.ts holds both locks). So no account
      // here can be made to point at an upload that isn't ready, and the query's own check is a second
      // lock no test can reach.
      // Another account's avatar is not this one's.
      const cleo = await account(tx, { name: "Cleo" });
      expect((await findAccount(tx, cleo.subject))?.avatarVersion).toBeNull();
    });
  });

  it("finds an account that is being deleted, with its state, so the gate can end its session at once (T27)", async () => {
    await rolledBack(db, async (tx) => {
      const gone = await account(tx, { state: "deleting" });
      expect((await findAccount(tx, gone.subject))?.state).toBe("deleting");
      // The first-sign-in path finds it too: it makes no second account for the subject.
      const clock = fakeClock(AT_FIRST);
      expect((await createAccount(tx, clock, gone.subject))?.id).toBe(gone.id);
      expect(await rowsOf(tx, gone.subject)).toHaveLength(1);
    });
  });

  it("finds no account for a subject once the account is a deleted shell, which keeps no subject (T27)", async () => {
    await rolledBack(db, async (tx) => {
      const gone = await account(tx);
      await tx`
        UPDATE app.users
           SET state = 'deleted', deletion_requested_at = ${AT.edited}, deleted_at = ${AT.edited}, auth_subject = NULL,
               age_confirmed_at = NULL, display_name = NULL
         WHERE id = ${gone.id}`;
      expect(await findAccount(tx, gone.subject)).toBeNull();
    });
  });

  it("refuses a subject that isn't a lowercase UUID before it reaches Postgres", async () => {
    await rolledBack(db, async (tx) => {
      const clock = fakeClock(AT_FIRST);
      const upper = randomUUID().toUpperCase();
      for (const bad of ["", "ben", "x'; DROP TABLE app.users; --", upper, `${randomUUID()} `, `${randomUUID()}0`]) {
        await expect(findAccount(tx, bad), JSON.stringify(bad)).rejects.toThrow(TypeError);
        await expect(createAccount(tx, clock, bad), JSON.stringify(bad)).rejects.toThrow(TypeError);
      }
      // Not even a string.
      await expect(findAccount(tx, 7 as unknown as string)).rejects.toThrow(TypeError);
      await expect(findAccount(tx, null as unknown as string)).rejects.toThrow(TypeError);
    });
  });

  describe("the first sign-in", () => {
    it("makes the account: active, no name, no age confirmation, version 0, made at the server clock's sample (T1)", async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(AT_FIRST);
        const subject = randomUUID();
        const made = await createAccount(tx, clock, subject);
        expect(made).toMatchObject({
          state: "active",
          displayName: null,
          ageConfirmed: false,
          version: 0,
          avatarVersion: null,
        });
        expect(made?.id).toMatch(/^acct_[A-Za-z0-9_-]{22}$/);
        expect(await findAccount(tx, subject)).toEqual(made);
        const [row] = await tx<{ created_at: Temporal.Instant; email_free: boolean }[]>`
          SELECT created_at, (to_jsonb(u) - 'id' - 'auth_subject' - 'state' - 'age_confirmed_at' - 'display_name'
                              - 'avatar_upload_id' - 'version' - 'created_at' - 'deletion_requested_at' - 'deleted_at')
                   = '{}'::jsonb AS email_free
            FROM app.users u WHERE u.id = ${made?.id ?? ""}`;
        // The sample's own microseconds, never the device's time or the transaction's start.
        expect(row?.created_at.equals(Temporal.Instant.from(AT_FIRST))).toBe(true);
        // The row holds nothing else: no email, no phone, nothing of the token (spec 23).
        expect(row?.email_free).toBe(true);
      });
    });

    it("finds the same account when the first sign-in is retried (spec 23)", async () => {
      await rolledBack(db, async (tx) => {
        const clock = fakeClock(AT_FIRST);
        const subject = randomUUID();
        const first = await createAccount(tx, clock, subject);
        clock.advance({ seconds: 30 });
        const again = await createAccount(tx, clock, subject);
        expect(again).toEqual(first);
        expect(await rowsOf(tx, subject)).toHaveLength(1);
        const [row] = await tx<{ created_at: Temporal.Instant }[]>`
          SELECT created_at FROM app.users WHERE auth_subject = ${subject}`;
        // The first sample stands; the retry's later one wrote nothing.
        expect(row?.created_at.equals(Temporal.Instant.from(AT_FIRST))).toBe(true);
      });
    });

    it("makes one account when twenty first requests arrive at once", async () => {
      const subject = randomUUID();
      const clock = fakeClock(AT_FIRST);
      const made = await Promise.all(
        Array.from({ length: 20 }, () => db.begin((tx) => createAccount(tx, clock, subject))),
      );
      const ids = new Set(made.map((one) => one?.id));
      expect(ids.size).toBe(1);
      expect(made.every((one) => one !== null && one.state === "active")).toBe(true);
      expect(await rowsOf(db as unknown as WorldTx, subject)).toHaveLength(1);
    });

    it("reads the account another request committed when it waited on that request's insert", async () => {
      const subject = randomUUID();
      const clock = fakeClock(AT_FIRST);
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
      // One request inserts the account and keeps its transaction open...
      const first = db.begin(async (tx) => {
        const made = await createAccount(tx, clock, subject);
        holding();
        await release;
        return made;
      });
      await held;
      // ...while this one, started after it, goes for the same subject, and queues behind the insert.
      const second = db.begin(async (tx) => {
        const [me] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
        if (!me) throw new Error("no backend");
        queuing(me.pid);
        return createAccount(tx, clock, subject);
      });
      const pid = await waiter;
      // pg_locks is read live, on a connection of its own, unlike pg_stat_activity inside a transaction.
      for (let tries = 0; ; tries += 1) {
        const [row] = await app<{ queued: boolean }[]>`
          SELECT EXISTS (SELECT FROM pg_catalog.pg_locks WHERE pid = ${pid} AND NOT granted) AS queued`;
        if (row?.queued) break;
        if (tries === 1000) throw new Error("the second request never queued behind the first's insert");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      letGo();
      const [one, two] = await Promise.all([first, second]);
      expect(one).not.toBeNull();
      expect(two).toEqual(one);
      expect(await rowsOf(db as unknown as WorldTx, subject)).toHaveLength(1);
    });

    it("samples the clock under READ COMMITTED only, as every command does, and makes nothing otherwise (T1)", async () => {
      const subject = randomUUID();
      const clock = fakeClock(AT_FIRST);
      await expect(
        db.begin("isolation level repeatable read", (tx) => createAccount(tx, clock, subject)),
      ).rejects.toThrow(/READ COMMITTED/);
      expect(await rowsOf(db as unknown as WorldTx, subject)).toHaveLength(0);
    });
  });
});
