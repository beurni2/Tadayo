/// <reference lib="esnext.temporal" />
// `registerDevice` and `removeDevice` against Postgres as `tadayo_app` (spec 21, 23; T1, T14, T27, T52; the
// contract's `registerDevice` and `removeDevice`; TECH-DESIGN section 6, device registration (a) to (e);
// packages/domain/src/identity/devices.ts; db/migrations/0017_devices.sql): a registration and its replacement,
// a token that moves from an earlier sign-in of the same account or another, the sign-ins that have ended and
// the late registrations they make change nothing, a secret of another account's, the purge of ended sign-ins
// after `ENDED_KEEP`, the account's state, the schema's own guards, and the commands at once, committed, with no
// deadlock and no registration left for an ended sign-in. Each race holds the lock its commands meet from a
// transaction of the test's own until Postgres shows every command waiting on it (`hold`, `untilWaiting`,
// `untilBlockedBy`), so it is proved to overlap. Two purges at once are the one exception: nothing a removal does
// between its purge and its ending can be held, so that test lays its rows out in the order that deadlocked, and
// the test before it proves, with the purge held, that an ending no longer waits on one.
//
// A refused command throws `Refused`, which the route's transaction rolls back, so a command in the first tests
// is a savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ENDED_KEEP,
  lockDevicesOf,
  PURGE_BATCH,
  Refused,
  registerDevice,
  removeDevice,
  type PlannedDevice,
  type RegisterDeviceInput,
} from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { expectRefused, REFUSED, rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, newId } from "./world.ts";

// Twenty-four connections, so twenty commands really are at the database together.
const db = worldSql(24);
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const AT_FIRST = "2026-11-24T03:30:00.123456Z";

/** A removal secret as the app makes one: 32 random bytes, base64url, 43 characters. */
const newSecret = () => randomBytes(32).toString("base64url");
/** An APNs token: 32 random bytes in hex, in uppercase as some devices print it. */
const newToken = () => randomBytes(32).toString("hex").toUpperCase();
const hashOf = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Inserts an account: finished by default (named, age confirmed). */
async function account(tx: WorldTx, options: { finished?: boolean } = {}): Promise<string> {
  const id = newId("acct");
  const finished = options.finished ?? true;
  await tx`
    INSERT INTO app.users (id, auth_subject, age_confirmed_at, display_name, created_at)
    VALUES (${id}, ${randomUUID()}, ${finished ? AT.created : null}, ${finished ? "Ben" : null}, ${AT.created})`;
  return id;
}

interface RegistrationRow {
  sign_in: string;
  user_id: string;
  apns_token: string;
  apns_environment: string;
  timezone: string;
  registered_at: Temporal.Instant;
}
async function registrations(sql: WorldTx, where: { user?: string; token?: string } = {}): Promise<RegistrationRow[]> {
  return sql<RegistrationRow[]>`
    SELECT pg_catalog.encode(sign_in, 'hex') AS sign_in, user_id, apns_token, apns_environment, timezone, registered_at
      FROM app.device_registrations
     WHERE (${where.user ?? null}::text IS NULL OR user_id = ${where.user ?? null})
       AND (${where.token?.toLowerCase() ?? null}::text IS NULL OR apns_token = ${where.token?.toLowerCase() ?? null})
     ORDER BY registered_at, sign_in`;
}
async function endedAt(sql: WorldTx, secret: string): Promise<Temporal.Instant | null> {
  const [row] = await sql<{ ended_at: Temporal.Instant }[]>`
    SELECT ended_at FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${hashOf(secret)}, 'hex')`;
  return row?.ended_at ?? null;
}

/** What a refused command says, its code and its facts. Fails when it wasn't refused. */
async function refusal(done: Promise<unknown>): Promise<{ code: string; facts: object }> {
  try {
    await done;
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
  throw new Error("the command wasn't refused");
}

const input = (userId: string, secret: string, token: string, over: Partial<RegisterDeviceInput> = {}) => ({
  userId,
  apnsToken: token,
  apnsEnvironment: "production" as const,
  timezone: "America/New_York",
  removalSecret: secret,
  ...over,
});

/** The lock of one token, and of one sign-in (devices.ts's names), from the token or the secret. */
const tokenLock = (token: string) => `tadayo.device.token:${token.toLowerCase()}`;
const signInLock = (secret: string) => `tadayo.device.sign-in:${hashOf(secret)}`;

/** Holds the advisory locks `names` in a transaction of the test's own until `release`. */
async function hold(names: readonly string[]): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const done = db.begin(async (tx) => {
    for (const name of names)
      await tx`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${name}, 0))`;
    ready();
    await released;
  });
  await Promise.race([held, done]);
  return {
    release: async () => {
      release();
      await done;
    },
  };
}

/** Waits until `count` transactions wait on the advisory locks `names` (pg_locks), or fails after ten seconds. */
async function untilWaiting(names: readonly string[], count: number): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    const [row] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_catalog.pg_locks l
       WHERE l.locktype = 'advisory' AND NOT l.granted AND l.objsubid = 1
         AND (l.classid::bigint, l.objid::bigint) IN (
               SELECT (k >> 32) & 4294967295, k & 4294967295
                 FROM (SELECT pg_catalog.hashtextextended(name, 0) AS k FROM unnest(${names as string[]}::text[]) AS name) AS keys)`;
    if ((row?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`fewer than ${String(count)} transactions waited on the locks`);
}

/** Waits until a transaction is blocked by the backend `pid` (`pg_blocking_pids`), or fails after ten seconds. */
async function untilBlockedBy(pid: number): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    const [row] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_catalog.pg_stat_activity
       WHERE ${pid}::int = ANY (pg_catalog.pg_blocking_pids(pid))`;
    if ((row?.n ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`no transaction waited on backend ${String(pid)}`);
}

/** Whether `done` is still running after 300 ms. */
async function stillWaiting(done: Promise<unknown>): Promise<boolean> {
  const state = await Promise.race([
    done.then(
      () => "finished",
      () => "finished",
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("waiting");
      }, 300);
    }),
  ]);
  return state === "waiting";
}

describe("a registration (TECH-DESIGN section 6)", () => {
  const clock = fakeClock(AT_FIRST);
  const register = (tx: WorldTx, one: RegisterDeviceInput) => tx.savepoint((sp) => registerDevice(sp, clock, one));

  it("keeps the secret's hash as the sign-in, the token in lowercase, the zone the server resolves and the server's time", async () => {
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(AT_FIRST));
      const ben = await account(tx);
      const secret = newSecret();
      const token = newToken();
      const answer = await register(tx, input(ben, secret, token, { timezone: "america/new_york" }));
      expect(answer).toEqual({
        apnsEnvironment: "production",
        timezone: "America/New_York",
        registeredAt: Temporal.Instant.from(AT_FIRST),
      });
      expect(await registrations(tx, { user: ben })).toEqual([
        {
          sign_in: hashOf(secret),
          user_id: ben,
          apns_token: token.toLowerCase(),
          apns_environment: "production",
          timezone: "America/New_York",
          registered_at: Temporal.Instant.from(AT_FIRST),
        },
      ]);
      // The secret itself can't be kept: the sign-in is 32 bytes (its hash, above) and the token hex alone, which
      // the schema's own checks hold (the guards' test).
    });
  });

  it("replaces its token, environment and zone with each new registration of the same sign-in, and its time", async () => {
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(AT_FIRST));
      const ben = await account(tx);
      const secret = newSecret();
      await register(tx, input(ben, secret, newToken()));
      clock.advance({ hours: 3 });
      const fresh = newToken();
      const answer = await register(
        tx,
        input(ben, secret, fresh, { apnsEnvironment: "sandbox", timezone: "Asia/Tokyo" }),
      );
      expect(answer).toEqual({
        apnsEnvironment: "sandbox",
        timezone: "Asia/Tokyo",
        registeredAt: Temporal.Instant.from(AT_FIRST).add({ hours: 3 }),
      });
      const rows = await registrations(tx, { user: ben });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sign_in: hashOf(secret),
        apns_token: fresh.toLowerCase(),
        timezone: "Asia/Tokyo",
      });
      // The same registration sent again is the same registration.
      await register(tx, input(ben, secret, fresh, { apnsEnvironment: "sandbox", timezone: "Asia/Tokyo" }));
      expect(await registrations(tx, { user: ben })).toHaveLength(1);
    });
  });

  it("keeps one registration per sign-in: an account signed in on two phones has two", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      await register(tx, input(ben, newSecret(), newToken()));
      await register(tx, input(ben, newSecret(), newToken()));
      expect(await registrations(tx, { user: ben })).toHaveLength(2);
    });
  });

  it("moves a token from an earlier sign-in of the same account, which then has ended: its late registration changes nothing ((a), (e))", async () => {
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(AT_FIRST));
      const ben = await account(tx);
      const [earlier, later, token] = [newSecret(), newSecret(), newToken()];
      await register(tx, input(ben, earlier, token));
      clock.advance({ minutes: 5 });
      await register(tx, input(ben, later, token));
      expect((await registrations(tx, { user: ben })).map((row) => row.sign_in)).toEqual([hashOf(later)]);
      expect(await endedAt(tx, earlier)).toEqual(Temporal.Instant.from(AT_FIRST).add({ minutes: 5 }));

      // The earlier sign-in's registration, delayed or sent again, with the same token or a new one.
      for (const late of [token, newToken()]) {
        expect(await refusal(register(tx, input(ben, earlier, late)))).toEqual({ code: "NOT_FOUND", facts: {} });
      }
      const rows = await registrations(tx, { user: ben });
      expect(rows.map((row) => [row.sign_in, row.apns_token])).toEqual([[hashOf(later), token.toLowerCase()]]);
    });
  });

  it("moves a token from another account's sign-in, whichever account held it ((a), the move)", async () => {
    await rolledBack(db, async (tx) => {
      const [ana, ben] = [await account(tx), await account(tx)];
      const [anas, bens, token] = [newSecret(), newSecret(), newToken()];
      await register(tx, input(ana, anas, token));
      await register(tx, input(ben, bens, token));
      expect(await registrations(tx, { token })).toMatchObject([{ user_id: ben, sign_in: hashOf(bens) }]);
      expect(await registrations(tx, { user: ana })).toEqual([]);
      expect(await endedAt(tx, anas)).not.toBeNull();
      expect(await refusal(register(tx, input(ana, anas, token)))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(await registrations(tx, { token })).toMatchObject([{ user_id: ben }]);
    });
  });

  it("answers a secret whose registration is another account's with the neutral not-found, and changes nothing ((a); T14)", async () => {
    await rolledBack(db, async (tx) => {
      const [ana, ben] = [await account(tx), await account(tx)];
      const [anas, anasToken] = [newSecret(), newToken()];
      await register(tx, input(ana, anas, anasToken));
      const before = await registrations(tx, { user: ana });
      // Ben has Ana's secret, with his own token and with hers.
      for (const token of [newToken(), anasToken]) {
        expect(await refusal(register(tx, input(ben, anas, token)))).toEqual({ code: "NOT_FOUND", facts: {} });
      }
      expect(await registrations(tx, { user: ana })).toEqual(before);
      expect(await registrations(tx, { user: ben })).toEqual([]);
      expect(await endedAt(tx, anas)).toBeNull();
    });
  });

  it("is refused once the account's deletion has begun, and before its profile is finished, changing nothing (T27, FQ69)", async () => {
    await rolledBack(db, async (tx) => {
      const deleting = await account(tx);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${deleting}`;
      expect(await refusal(register(tx, input(deleting, newSecret(), newToken())))).toEqual({
        code: "UNAUTHENTICATED",
        facts: {},
      });
      const unfinished = await account(tx, { finished: false });
      expect(await refusal(register(tx, input(unfinished, newSecret(), newToken())))).toEqual({
        code: "PROFILE_INCOMPLETE",
        facts: {},
      });
      const [left] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM app.device_registrations WHERE user_id IN (${deleting}, ${unfinished})`;
      expect(left?.n).toBe(0);
    });
  });

  it("refuses a zone of the contract's shape that the server can't resolve, by its name, before anything is locked", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      for (const timezone of ["Mars/Olympus_Mons", "BST", "Etc/GMT+99"]) {
        expect(await refusal(register(tx, input(ben, newSecret(), newToken(), { timezone }))), timezone).toEqual({
          code: "INVALID_REQUEST",
          facts: { field: "timezone" },
        });
      }
      expect(await registrations(tx, { user: ben })).toEqual([]);
    });
  });
});

describe("a removal (TECH-DESIGN section 6 (c), (d), (e))", () => {
  const clock = fakeClock(AT_FIRST);
  const register = (tx: WorldTx, one: RegisterDeviceInput) => tx.savepoint((sp) => registerDevice(sp, clock, one));
  const remove = (tx: WorldTx, secret: string) => tx.savepoint((sp) => removeDevice(sp, clock, secret));

  it("removes the sign-in's registration and ends it; the second removal finds nothing; a late registration changes nothing", async () => {
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(AT_FIRST));
      const ben = await account(tx);
      const [secret, token] = [newSecret(), newToken()];
      await register(tx, input(ben, secret, token));
      expect(await remove(tx, secret)).toBe("removed");
      expect(await registrations(tx, { user: ben })).toEqual([]);
      expect(await endedAt(tx, secret)).toEqual(Temporal.Instant.from(AT_FIRST));
      clock.advance({ minutes: 1 });
      expect(await remove(tx, secret)).toBe("none");
      // The first ending stands.
      expect(await endedAt(tx, secret)).toEqual(Temporal.Instant.from(AT_FIRST));
      expect(await refusal(register(tx, input(ben, secret, token)))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(await registrations(tx, { user: ben })).toEqual([]);
    });
  });

  it("ends a sign-in that has no registration yet, so its registration still on the way changes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const secret = newSecret();
      expect(await remove(tx, secret)).toBe("none");
      expect(await refusal(register(tx, input(ben, secret, newToken())))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(await registrations(tx, { user: ben })).toEqual([]);
    });
  });

  it("removes only the sign-in its secret names: the account's other sign-ins and anyone else's stay", async () => {
    await rolledBack(db, async (tx) => {
      const [ana, ben] = [await account(tx), await account(tx)];
      const [one, two, anas] = [newSecret(), newSecret(), newSecret()];
      await register(tx, input(ben, one, newToken()));
      await register(tx, input(ben, two, newToken()));
      await register(tx, input(ana, anas, newToken()));
      expect(await remove(tx, one)).toBe("removed");
      expect((await registrations(tx, { user: ben })).map((row) => row.sign_in)).toEqual([hashOf(two)]);
      expect(await registrations(tx, { user: ana })).toHaveLength(1);
    });
  });

  it("finds nothing for a sign-in whose token moved to a later one, and refuses nothing of that later sign-in ((e))", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const [earlier, later, token] = [newSecret(), newSecret(), newToken()];
      await register(tx, input(ben, earlier, token));
      await register(tx, input(ben, later, token));
      expect(await remove(tx, earlier)).toBe("none");
      expect(await registrations(tx, { token })).toMatchObject([{ sign_in: hashOf(later) }]);
      // The later sign-in registers again, with the same token or a new one, as it would.
      await register(tx, input(ben, later, token));
      await register(tx, input(ben, later, newToken()));
      expect((await registrations(tx, { user: ben })).map((row) => row.sign_in)).toEqual([hashOf(later)]);
    });
  });

  it("lets a later sign-in on the same phone register the token an ended sign-in held ((e))", async () => {
    await rolledBack(db, async (tx) => {
      const [ben, cleo] = [await account(tx), await account(tx)];
      const [bens, cleos, token] = [newSecret(), newSecret(), newToken()];
      await register(tx, input(ben, bens, token));
      expect(await remove(tx, bens)).toBe("removed");
      await register(tx, input(cleo, cleos, token));
      expect(await registrations(tx, { token })).toMatchObject([{ user_id: cleo, sign_in: hashOf(cleos) }]);
    });
  });

  it("keeps a later sign-in's token when an earlier sign-in's first registration lands after its removal ended: the app's order ((e))", async () => {
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(AT_FIRST));
      const [ana, ben] = [await account(tx), await account(tx)];
      const [anas, bens, token] = [newSecret(), newSecret(), newToken()];
      // Ana's first registration is on its way when Ana logs out. The app sends Ben's registration only once
      // Ana's removal has ended (docs/plans/api-b2-spike-push.md, section 0): it found nothing, and ended Ana's.
      expect(await remove(tx, anas)).toBe("none");
      clock.advance({ minutes: 1 });
      await register(tx, input(ben, bens, token));
      clock.advance({ minutes: 1 });
      // Ana's registration lands now, with Ben's token: it changes nothing, and refuses nothing of Ben's.
      expect(await refusal(register(tx, input(ana, anas, token)))).toEqual({ code: "NOT_FOUND", facts: {} });
      expect(await registrations(tx, { token })).toMatchObject([
        { user_id: ben, sign_in: hashOf(bens), registered_at: Temporal.Instant.from(AT_FIRST).add({ minutes: 1 }) },
      ]);
      expect(await endedAt(tx, bens)).toBeNull();
      expect(await registrations(tx, { user: ana })).toEqual([]);
      await register(tx, input(ben, bens, token));
      expect(await registrations(tx, { token })).toMatchObject([{ user_id: ben, sign_in: hashOf(bens) }]);
    });
  });
});

describe("the ended sign-ins kept for `ENDED_KEEP` (8 days), then deleted", () => {
  // Years before anything the other tests commit, so the oldest rows a purge finds are this test's own.
  const LONG_AGO = "2001-03-05T06:07:08.123456Z";
  const clock = fakeClock(LONG_AGO);

  it("keeps eight days of them, nothing personal, and the next command deletes those past it", async () => {
    expect(ENDED_KEEP.total({ unit: "hours" })).toBe(8 * 24);
    await rolledBack(db, async (tx) => {
      clock.set(Temporal.Instant.from(LONG_AGO));
      const ben = await account(tx);
      const [old, recent] = [newSecret(), newSecret()];
      await tx.savepoint((sp) => removeDevice(sp, clock, old));
      clock.advance({ microseconds: 1 });
      await tx.savepoint((sp) => removeDevice(sp, clock, recent));
      // The columns hold a hash and a time, nothing more ((b)).
      const columns = await tx<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'app' AND table_name = 'device_sign_ins_ended' ORDER BY ordinal_position`;
      expect(columns.map((row) => row.column_name)).toEqual(["sign_in", "ended_at"]);

      // Exactly eight days after the first: neither has passed it yet.
      clock.set(Temporal.Instant.from(LONG_AGO).add(ENDED_KEEP));
      await tx.savepoint((sp) => registerDevice(sp, clock, input(ben, newSecret(), newToken())));
      expect(await endedAt(tx, old)).not.toBeNull();
      // A microsecond more: the first is past it, the second not.
      clock.advance({ microseconds: 1 });
      await tx.savepoint((sp) => removeDevice(sp, clock, newSecret()));
      expect(await endedAt(tx, old)).toBeNull();
      expect(await endedAt(tx, recent)).not.toBeNull();
      // A registration deletes them as a removal does: a microsecond past the second's eight days.
      clock.advance({ microseconds: 1 });
      await tx.savepoint((sp) => registerDevice(sp, clock, input(ben, newSecret(), newToken())));
      expect(await endedAt(tx, recent)).toBeNull();
      // A registration of the deleted one can't be on its way any more: no token of that sign-in lives that long.
    });
  });

  it("deletes at most `PURGE_BATCH` in one command, the oldest first", async () => {
    await rolledBack(db, async (tx) => {
      const hashes = Array.from({ length: PURGE_BATCH + 5 }, () => randomBytes(32).toString("hex"));
      for (const [index, hash] of hashes.entries()) {
        await tx`
          INSERT INTO app.device_sign_ins_ended (sign_in, ended_at)
          VALUES (pg_catalog.decode(${hash}, 'hex'), ${Temporal.Instant.from("2000-01-01T00:00:00Z").add({ seconds: index })})`;
      }
      clock.set(Temporal.Instant.from("2000-06-01T00:00:00Z"));
      await tx.savepoint((sp) => removeDevice(sp, clock, newSecret()));
      const left = await tx<{ sign_in: string }[]>`
        SELECT pg_catalog.encode(sign_in, 'hex') AS sign_in FROM app.device_sign_ins_ended
         WHERE pg_catalog.encode(sign_in, 'hex') = ANY(${hashes}::text[])`;
      expect(left.map((row) => row.sign_in).sort()).toEqual(hashes.slice(PURGE_BATCH).sort());
    });
  });
});

describe("the schema's own guards (0017), behind the commands", () => {
  it("refuses a registration for an ended sign-in, for an account that isn't active or finished, a token not in lowercase hex, and a token another sign-in holds", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await account(tx);
      const insert = (sp: Tx, user: string, signIn: string, token = randomBytes(32).toString("hex")) =>
        sp`INSERT INTO app.device_registrations (sign_in, user_id, apns_token, apns_environment, timezone, registered_at)
           VALUES (pg_catalog.decode(${signIn}, 'hex'), ${user}, ${token}, 'production', 'Europe/London', ${AT.added})`;
      const ended = randomBytes(32).toString("hex");
      await tx`INSERT INTO app.device_sign_ins_ended (sign_in, ended_at) VALUES (pg_catalog.decode(${ended}, 'hex'), ${AT.added})`;
      await expectRefused(plain(tx), REFUSED.integrity, (sp) => insert(sp, ben, ended), /a sign-in that has ended/);

      const deleting = await account(tx);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${deleting}`;
      const unfinished = await account(tx, { finished: false });
      for (const user of [deleting, unfinished]) {
        await expectRefused(
          plain(tx),
          REFUSED.integrity,
          (sp) => insert(sp, user, randomBytes(32).toString("hex")),
          /active account with a finished profile/,
        );
      }
      for (const token of ["A".repeat(64), "f".repeat(15), "g".repeat(64)]) {
        await expectRefused(plain(tx), REFUSED.check, (sp) => insert(sp, ben, randomBytes(32).toString("hex"), token));
      }
      await expectRefused(plain(tx), REFUSED.check, (sp) => insert(sp, ben, randomBytes(31).toString("hex")));

      // A registration's sign-in and account never change; moving to an ended sign-in is refused too.
      const own = randomBytes(32).toString("hex");
      const ownToken = randomBytes(32).toString("hex");
      await insert(plain(tx), ben, own, ownToken);
      // A token belongs to one sign-in at a time ((a)): another sign-in, of any account, can't hold it too.
      await expectRefused(plain(tx), REFUSED.unique, (sp) =>
        insert(sp, ben, randomBytes(32).toString("hex"), ownToken),
      );
      const other = await account(tx);
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.device_registrations SET user_id = ${other} WHERE sign_in = pg_catalog.decode(${own}, 'hex')`,
      );
      await expectRefused(
        plain(tx),
        REFUSED.integrity,
        (sp) =>
          sp`UPDATE app.device_registrations SET sign_in = pg_catalog.decode(${ended}, 'hex') WHERE sign_in = pg_catalog.decode(${own}, 'hex')`,
      );
    });
  });

  it("refuses at the commit a sign-in ended while its registration stays, and an account deleted with one (T27)", async () => {
    const ben = await db.begin((tx) => account(tx));
    const signIn = randomBytes(32).toString("hex");
    await db`INSERT INTO app.device_registrations (sign_in, user_id, apns_token, apns_environment, timezone, registered_at)
             VALUES (pg_catalog.decode(${signIn}, 'hex'), ${ben}, ${randomBytes(32).toString("hex")}, 'production',
                     'Europe/London', ${AT.added})`;
    await expect(
      db.begin(
        (tx) =>
          tx`INSERT INTO app.device_sign_ins_ended (sign_in, ended_at) VALUES (pg_catalog.decode(${signIn}, 'hex'), ${AT.added})`,
      ),
    ).rejects.toMatchObject({
      code: REFUSED.integrity,
      message: expect.stringMatching(/ends only once its registration is gone/) as unknown,
    });
    await expect(
      db.begin(
        (
          tx,
        ) => tx`UPDATE app.users SET state = 'deleted', deletion_requested_at = ${AT.edited}, deleted_at = ${AT.edited},
                          auth_subject = NULL, age_confirmed_at = NULL, display_name = NULL WHERE id = ${ben}`,
      ),
    ).rejects.toMatchObject({
      code: REFUSED.integrity,
      message: expect.stringMatching(/deleted with a device registration/) as unknown,
    });
    expect(await registrations(db as unknown as WorldTx, { user: ben })).toHaveLength(1);
    // The account deletion's order, which B8's job follows (0017's header): the account's row first, as it begins
    // (deleting), then its registrations, then the shell.
    await db.begin(async (tx) => {
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${ben}`;
      await tx`DELETE FROM app.device_registrations WHERE user_id = ${ben}`;
      await tx`UPDATE app.users SET state = 'deleted', deleted_at = ${AT.edited}, auth_subject = NULL,
                      age_confirmed_at = NULL, display_name = NULL WHERE id = ${ben}`;
    });
  });

  it("lets no registration and ending of one sign-in, written at once without the commands' lock, both stand: the guards take it", async () => {
    const ben = await db.begin((tx) => account(tx));
    /** A transaction that writes, then stays open until `commit`, whose promise is its commit's outcome. */
    const open = (write: (tx: WorldTx) => Promise<unknown>) => {
      let go: () => void = () => undefined;
      const allowed = new Promise<void>((resolve) => {
        go = resolve;
      });
      let wrote: () => void = () => undefined;
      const written = new Promise<void>((resolve) => {
        wrote = resolve;
      });
      const committed = db.begin(async (tx) => {
        await write(tx);
        wrote();
        await allowed;
      });
      return {
        written: Promise.race([written, committed.then(() => undefined)]),
        commit: () => {
          go();
          return committed;
        },
      };
    };
    for (const first of ["ending", "registration"] as const) {
      const signIn = randomBytes(32).toString("hex");
      const ending = () =>
        open(
          (tx) =>
            tx`INSERT INTO app.device_sign_ins_ended (sign_in, ended_at) VALUES (pg_catalog.decode(${signIn}, 'hex'), ${AT.added})`,
        );
      const registering = () =>
        open(
          (tx) =>
            tx`INSERT INTO app.device_registrations (sign_in, user_id, apns_token, apns_environment, timezone, registered_at)
               VALUES (pg_catalog.decode(${signIn}, 'hex'), ${ben}, ${randomBytes(32).toString("hex")}, 'production',
                       'Europe/London', ${AT.added})`,
        );
      // Neither sees the other's row before it commits; the ending's check, at its commit, waits on the lock the
      // registration's guard took, and then sees the registration.
      const one = first === "ending" ? ending() : registering();
      await one.written;
      const two = first === "ending" ? registering() : ending();
      await two.written;
      const [end, register] = first === "ending" ? [one, two] : [two, one];
      const ended = end.commit();
      await untilWaiting([`tadayo.device.sign-in:${signIn}`], 1);
      await register.commit();
      await expect(ended, first).rejects.toMatchObject({
        code: REFUSED.integrity,
        message: expect.stringMatching(/ends only once its registration is gone/) as unknown,
      });
      const [row] = await db<{ registered: number; ended: number }[]>`
        SELECT (SELECT count(*)::int FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${signIn}, 'hex')) AS registered,
               (SELECT count(*)::int FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${signIn}, 'hex')) AS ended`;
      expect(row, first).toEqual({ registered: 1, ended: 0 });
    }
  });
});

describe("commands at once, committed: no deadlock, and no registration for an ended sign-in", () => {
  const clock = fakeClock(AT_FIRST);
  const committed = () => db.begin((tx) => account(tx));
  const asRoute = (one: RegisterDeviceInput) => db.begin((tx) => registerDevice(tx, clock, one));
  const removing = (secret: string) => db.begin((tx) => removeDevice(tx, clock, secret));
  const settled = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.map((one) =>
      one.status === "fulfilled" ? "ok" : one.reason instanceof Refused ? one.reason.code : String(one.reason),
    );
  /** Every registration whose sign-in has ended: none, ever. */
  const orphans = async () => {
    const [row] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.device_registrations r
        JOIN app.device_sign_ins_ended e ON e.sign_in = r.sign_in`;
    return row?.n ?? -1;
  };

  it("lets twenty sign-ins register one token at once: one holds it, the rest ended or refused, none a deadlock", async () => {
    const token = newToken();
    const people = await Promise.all(Array.from({ length: 20 }, () => committed()));
    const secrets = people.map(() => newSecret());
    // All twenty wait on the token's lock together before any goes on.
    const blocker = await hold([tokenLock(token)]);
    const running = Promise.allSettled(people.map((user, index) => asRoute(input(user, secrets[index] ?? "", token))));
    await untilWaiting([tokenLock(token)], 20);
    await blocker.release();
    const results = await running;
    // Each ran in some order: a registration that ran after the token moved past it is fine; nothing else is.
    expect(settled(results).every((outcome) => outcome === "ok")).toBe(true);
    const holders = await registrations(db as unknown as WorldTx, { token });
    expect(holders).toHaveLength(1);
    const ended = await Promise.all(secrets.map((secret) => endedAt(db as unknown as WorldTx, secret)));
    expect(ended.filter((at) => at !== null)).toHaveLength(19);
    expect(await orphans()).toBe(0);
  });

  it("lets two sign-ins each take the other's token at once without a deadlock", async () => {
    for (let round = 0; round < 10; round += 1) {
      const [ana, ben] = await Promise.all([committed(), committed()]);
      const [anas, bens, t1, t2] = [newSecret(), newSecret(), newToken(), newToken()];
      await asRoute(input(ana, anas, t1));
      await asRoute(input(ben, bens, t2));
      // Each has its token's lock and waits on the sign-ins' locks, which the test holds: taken in one order, the
      // two queue on the same lock; in each command's own order, each would take one and wait on the other's.
      const blocker = await hold([signInLock(anas), signInLock(bens)]);
      const running = Promise.allSettled([asRoute(input(ana, anas, t2)), asRoute(input(ben, bens, t1))]);
      await untilWaiting([signInLock(anas), signInLock(bens)], 2);
      await blocker.release();
      const outcomes = settled(await running);
      // The first to run moves the other's token and ends the other's sign-in, which is then refused.
      expect(outcomes.sort()).toEqual(["NOT_FOUND", "ok"]);
      expect(await orphans()).toBe(0);
    }
  });

  it("lets a registration and a removal of one sign-in race: either order leaves no registration of it", async () => {
    // Both wait on the sign-in's lock, which the test holds; the one that queued first goes first. Each order runs.
    for (const first of ["registration", "removal", "registration", "removal"] as const) {
      const ben = await committed();
      const [secret, token] = [newSecret(), newToken()];
      const blocker = await hold([signInLock(secret)]);
      const start = (which: "registration" | "removal") =>
        which === "registration" ? asRoute(input(ben, secret, token)) : removing(secret);
      const one = start(first);
      await untilWaiting([signInLock(secret)], 1);
      const two = start(first === "registration" ? "removal" : "registration");
      await untilWaiting([signInLock(secret)], 2);
      await blocker.release();
      const [registered, removed] = await Promise.allSettled(first === "registration" ? [one, two] : [two, one]);
      if (first === "registration") {
        expect(registered.status).toBe("fulfilled");
        expect(removed).toEqual({ status: "fulfilled", value: "removed" });
      } else {
        expect(settled([registered])).toEqual(["NOT_FOUND"]);
        expect(removed).toEqual({ status: "fulfilled", value: "none" });
      }
      expect(await registrations(db as unknown as WorldTx, { user: ben })).toEqual([]);
      expect(await endedAt(db as unknown as WorldTx, secret)).not.toBeNull();
      expect(await orphans()).toBe(0);
    }
  });

  it("lets the reveal push's plan hold its readers' sign-ins in 0017's order, so a move of their token waits on the sign-in's lock", async () => {
    const [ana, ben] = await Promise.all([committed(), committed()]);
    const [anas, bens, t1, t2] = [newSecret(), newSecret(), newToken(), newToken()];
    await asRoute(input(ana, anas, t1));
    await asRoute(input(ben, bens, t2));
    // The plan holds what it locked until the test lets it go.
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let locked: (devices: PlannedDevice[]) => void = () => undefined;
    const read = new Promise<PlannedDevice[]>((resolve) => {
      locked = resolve;
    });
    const planning = db.begin(async (tx) => {
      locked(await lockDevicesOf(tx, [ben, ana]));
      await held;
    });
    const devices = await read;
    expect(devices.map((one) => [one.userId, Buffer.from(one.signIn).toString("hex"), one.timezone])).toEqual(
      [
        [ana, hashOf(anas), "America/New_York"],
        [ben, hashOf(bens), "America/New_York"],
      ].sort((a, b) => ((a[1] ?? "") < (b[1] ?? "") ? -1 : 1)),
    );
    // Ben's sign-in takes Ana's token: it waits on the sign-ins' locks the plan holds, before any row.
    const moving = asRoute(input(ben, bens, t1));
    await untilWaiting([signInLock(anas), signInLock(bens)], 1);
    finish();
    await planning;
    await moving;
    expect(await registrations(db as unknown as WorldTx, { user: ana })).toEqual([]);
    expect(await orphans()).toBe(0);
  });

  it("lets the reveal push's plan leave out a registration deleted while it waited for its sign-in", async () => {
    const ben = await committed();
    const [secret, token] = [newSecret(), newToken()];
    await asRoute(input(ben, secret, token));
    // A removal of Ben's phone holds its sign-in's lock and has deleted the row, uncommitted.
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let begun: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const removing = db.begin(async (tx) => {
      await removeDevice(tx, clock, secret);
      begun();
      await held;
    });
    await started;
    const planning = db.begin((tx) => lockDevicesOf(tx, [ben]));
    await untilWaiting([signInLock(secret)], 1);
    finish();
    await removing;
    expect(await planning).toEqual([]);
  });

  it("lets twenty registrations of one sign-in with different tokens at once leave one registration, with one of them", async () => {
    const ben = await committed();
    const secret = newSecret();
    const tokens = Array.from({ length: 20 }, () => newToken());
    const blocker = await hold([signInLock(secret)]);
    const running = Promise.allSettled(tokens.map((token) => asRoute(input(ben, secret, token))));
    await untilWaiting([signInLock(secret)], 20);
    await blocker.release();
    const results = await running;
    expect(settled(results).every((outcome) => outcome === "ok")).toBe(true);
    const rows = await registrations(db as unknown as WorldTx, { user: ben });
    expect(rows).toHaveLength(1);
    expect(tokens.map((token) => token.toLowerCase())).toContain(rows[0]?.apns_token);
  });

  it("is refused once the account's deletion has begun while it waited, and leaves nothing (T27)", async () => {
    const ben = await committed();
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let begun: (pid: number) => void = () => undefined;
    const started = new Promise<number>((resolve) => {
      begun = resolve;
    });
    const deleting = db.begin(async (tx) => {
      const [me] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT.edited} WHERE id = ${ben}`;
      begun(me?.pid ?? -1);
      await held;
    });
    const deleter = await started;
    const waiting = asRoute(input(ben, newSecret(), newToken()));
    // The registration reaches the account's row, which the deletion holds, and waits on it.
    await untilBlockedBy(deleter);
    finish();
    await deleting;
    expect(await refusal(waiting)).toEqual({ code: "UNAUTHENTICATED", facts: {} });
    expect(await registrations(db as unknown as WorldTx, { user: ben })).toEqual([]);
  });

  it("ends a sign-in whose old row another command's purge is deleting, without waiting for that purge", async () => {
    const secret = newSecret();
    await db`INSERT INTO app.device_sign_ins_ended (sign_in, ended_at)
             VALUES (pg_catalog.decode(${hashOf(secret)}, 'hex'), ${Temporal.Instant.from("2026-01-01T00:00:00Z")})`;
    // Another command's purge has deleted the row, past the keep, and hasn't committed.
    let finish: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let begun: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const purging = db.begin(async (tx) => {
      await tx`DELETE FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${hashOf(secret)}, 'hex')`;
      begun();
      await held;
    });
    await started;
    // The app sends the removal again: it ends at once, with the neutral answer, the purge still open.
    const removal = removing(secret);
    expect(await stillWaiting(removal)).toBe(false);
    expect(await removal).toBe("none");
    finish();
    await purging;
    // The row went with the purge: no token of a sign-in ended that long ago lives to register it.
    expect(await endedAt(db as unknown as WorldTx, secret)).toBeNull();
  });

  it("lets two removals of long-ended sign-ins purge at once, each past more than `PURGE_BATCH` rows, with no deadlock", async () => {
    for (let round = 0; round < 5; round += 1) {
      const [first, second] = [newSecret(), newSecret()];
      // Each round's rows older than the last's, so each purge meets this round's own first. The removal sent first
      // usually purges first: it takes the first hundred rows, with the second sign-in's, and the other removal the
      // next hundred, with the first's. That is the order in which two endings that waited on a purge deadlocked.
      const hashes = Array.from({ length: 2 * PURGE_BATCH + 50 }, () => randomBytes(32).toString("hex"));
      hashes[50] = hashOf(second);
      hashes[PURGE_BATCH + 50] = hashOf(first);
      const base = Temporal.Instant.from("2026-06-01T00:00:00Z").subtract({ hours: 24 * round });
      const times = hashes.map((_, index) => base.add({ seconds: index }).toString());
      await db`INSERT INTO app.device_sign_ins_ended (sign_in, ended_at)
               SELECT pg_catalog.decode(h, 'hex'), t::timestamptz FROM unnest(${hashes}::text[], ${times}::text[]) AS u(h, t)`;
      const results = await Promise.allSettled([removing(first), removing(second)]);
      expect(results.map((one) => (one.status === "fulfilled" ? one.value : String(one.reason)))).toEqual([
        "none",
        "none",
      ]);
    }
    expect(await orphans()).toBe(0);
  });
});
