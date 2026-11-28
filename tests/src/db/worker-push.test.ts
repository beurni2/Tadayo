/// <reference lib="esnext.temporal" />
// The reveal push's plan and dispatch against Postgres as `tadayo_app` (services/worker/src/push.ts;
// packages/domain/src/push/reveal.ts; db/migrations/0021_push.sql; docs/plans/api-b2-spike-push.md, sections 2.1 to
// 2.3 and 2.6; spec 21; T1, T9, T36, T37, T52; FQ30): the plan at the reveal, once, for each reader's devices and
// nobody else, and without a device whose zone the server no longer resolves; quiet hours in each device's zone, at
// the plan and again at dispatch in the zone the registration holds then; until when Apple may deliver each push; the
// rechecks, and a registration gone between the decision and the send; the budget across days, in the zone of the
// member's latest device, with a push whose fate is unknown counted; each answer of Apple's (sent, a dead token, a
// retry, one past the close, a refusal); a send that never reported back, and its stale decision; a decision that
// keeps failing; the purge, with the push on or off; and, committed on two connections, a removal that waits for a
// send in flight.
//
// Each test but the last is one rolled-back transaction: the worker's transactions are savepoints in it (`inside`), as
// the prepare test's are, and every other day the database holds is set aside first (`aside`), so the pass plans and
// sends only the test's own. The sender is a fake that records each push and answers as told; apns.test.ts holds the
// real one against a fake APNs. Two dispatchers at once need two connections: their claims are `FOR UPDATE SKIP
// LOCKED`, as the outbox's, whose test holds that rule (worker-outbox.test.ts).

import { createHash, randomBytes } from "node:crypto";
import { registerDevice, removeDevice, STAR_BODY } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import {
  claimDelivery,
  decideDelivery,
  KEEP_AFTER_CLOSE_HOURS,
  pushLines,
  pushMinute,
  pushPass,
  REQUEST_TIMEOUT_MS,
  SEND_LEASE_SECONDS,
  sendDelivery,
  type ApnsOutcome,
  type ApnsPush,
  type ApnsSender,
  type DecidedPush,
  type WorkerSql,
} from "@tadayo/worker";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { forgetCommittedDays } from "./week-world.ts";
import { commitDrop, leave, newWorld, type World } from "./world.ts";

const db = worldSql(4);
let committed = false;
afterAll(async () => {
  await db.end();
  // The removal's race needs its day committed; its push rows go with it (0021's foreign keys cascade).
  if (committed) await forgetCommittedDays();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);

/** The evening before Ana's Saturday, when the devices register. */
const EVENING = at("2026-11-06T21:00:00.123456Z");
/** Ana's Saturday opens at 07:00 in London, 07:00Z in November, and closes at 01:00 there the next morning. */
const REVEAL = at("2026-11-07T07:00:00Z");
const CLOSE = at("2026-11-08T01:00:00Z");
const OPEN = REVEAL.add({ milliseconds: 500 });

const clock = fakeClock(EVENING);
beforeEach(() => {
  clock.set(EVENING);
});

/** The worker's connection as one rolled-back transaction: each of its transactions is a savepoint in `tx`. */
function inside(tx: WorldTx): WorkerSql {
  return { begin: (fn: (sp: WorldTx) => Promise<unknown>) => tx.savepoint(fn) } as unknown as WorkerSql;
}

/** Sets every other day aside in `tx`: planned already, and their deliveries ended, so a pass sees only `keep`. */
async function aside(tx: WorldTx, keep: readonly string[]): Promise<void> {
  await tx`
    INSERT INTO app.push_days (occurrence_id, planned_at)
    SELECT id, ${EVENING} FROM app.occurrences WHERE id <> ALL(${tx.array([...keep])})
    ON CONFLICT (occurrence_id) DO NOTHING`;
  await tx`
    UPDATE app.push_deliveries SET state = 'skipped', outcome = 'test.aside', finished_at = ${EVENING}, lease_until = NULL
     WHERE state IN ('pending', 'sending') AND occurrence_id <> ALL(${tx.array([...keep])})`;
}

/** A fake APNs sender: records each push, waits on `during` if set, then answers as `answer` says (sent by default). */
class FakeSender implements ApnsSender {
  readonly pushes: ApnsPush[] = [];
  answer: (push: ApnsPush) => ApnsOutcome = () => ({ kind: "sent" });
  during: (() => Promise<void>) | undefined;
  async send(push: ApnsPush): Promise<ApnsOutcome> {
    this.pushes.push(push);
    if (this.during !== undefined) await this.during();
    return this.answer(push);
  }
  close(): void {
    // Nothing to close.
  }
}

interface Device {
  readonly secret: string;
  readonly token: string;
  /** The sign-in's hash, as hex. */
  readonly signIn: string;
}

/** Registers a device of `who`'s in `zone` at the clock's time, as the app does at each launch. */
async function register(tx: WorldTx, who: { user: string }, zone: string, device?: Device): Promise<Device> {
  const secret = device?.secret ?? randomBytes(32).toString("base64url");
  const token = device?.token ?? randomBytes(32).toString("hex");
  await tx.savepoint((sp) =>
    registerDevice(sp, clock, {
      userId: who.user,
      apnsToken: token,
      apnsEnvironment: "production",
      timezone: zone,
      removalSecret: secret,
    }),
  );
  return { secret, token, signIn: createHash("sha256").update(secret).digest("hex") };
}

interface DeliveryRow {
  readonly id: string;
  readonly user_id: string;
  readonly sign_in: string | null;
  readonly state: string;
  readonly due_at: Temporal.Instant;
  readonly sent_at: Temporal.Instant | null;
  readonly outcome: string | null;
  readonly attempts: number;
  readonly lease_until: Temporal.Instant | null;
}

async function deliveries(tx: WorldTx, day: string): Promise<DeliveryRow[]> {
  return tx<DeliveryRow[]>`
    SELECT id, user_id, pg_catalog.encode(sign_in, 'hex') AS sign_in, state, due_at, sent_at, outcome, attempts,
           lease_until
      FROM app.push_deliveries WHERE occurrence_id = ${day} ORDER BY due_at, user_id, id`;
}

/** The delivery to `device`, by its sign-in. */
async function deliveryTo(tx: WorldTx, day: string, device: Device): Promise<DeliveryRow> {
  const row = (await deliveries(tx, day)).find((one) => one.sign_in === device.signIn);
  if (row === undefined) throw new Error("no delivery to that device");
  return row;
}

async function failureCount(tx: WorldTx, code: string): Promise<number> {
  const [row] = await tx<{ total: string }[]>`
    SELECT total::text FROM app.failure_counts WHERE source = 'worker' AND code = ${code}`;
  return row === undefined ? 0 : Number(row.total);
}

/** A pass at `instant`. */
async function passAt(tx: WorldTx, sender: ApnsSender, instant: Temporal.Instant) {
  clock.set(instant);
  return pushPass(inside(tx), clock, sender);
}

/** A world with a drop of Ben's, set apart from every other day. */
async function world(tx: WorldTx): Promise<World> {
  const w = await newWorld(plain(tx));
  await commitDrop(plain(tx), w, w.ben, { caption: "the caption nobody's push may hold" });
  return w;
}

const readyFor = (name: string) => `${name}’s day is ready`;

describe("the plan, at the reveal (the plan's section 2.1 and 2.2)", () => {
  it("plans each reader's devices once, each due at the reveal or the end of its quiet hours, and sends each then", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      // Ana's phone is in New York (02:00 there at the reveal), Ben's in London (07:00), Cleo's in Tokyo (16:00); Dan
      // has a phone and no club.
      const ana = await register(tx, w.ana, "America/New_York");
      const ben = await register(tx, w.ben, "Europe/London");
      const cleo = await register(tx, w.cleo, "Asia/Tokyo");
      await register(tx, w.dan, "Europe/London");
      await aside(tx, [w.day]);
      const sender = new FakeSender();

      // Before the reveal, nothing is planned.
      expect(await passAt(tx, sender, REVEAL.subtract({ microseconds: 1 }))).toMatchObject({ planned: 0, sent: 0 });
      expect(await deliveries(tx, w.day)).toEqual([]);

      // At the reveal: three deliveries, and Cleo's goes at once.
      expect(await passAt(tx, sender, OPEN)).toEqual({
        planned: 3,
        sent: 1,
        skipped: 0,
        later: 0,
        failed: 0,
        failures: [],
      });
      const planned = await deliveries(tx, w.day);
      expect(planned.map((row) => [row.user_id, row.sign_in, row.due_at.toString()])).toEqual([
        [w.cleo.user, cleo.signIn, REVEAL.toString()],
        [w.ben.user, ben.signIn, "2026-11-07T08:00:00Z"],
        [w.ana.user, ana.signIn, "2026-11-07T13:00:00Z"],
      ]);
      expect(sender.pushes).toHaveLength(1);
      const [first] = sender.pushes;
      // Apple may deliver it until 23:00 in Tokyo, 14:00Z, well before the day closes (T37).
      expect(first).toEqual({
        token: cleo.token,
        environment: "production",
        payload: first?.payload,
        collapseId: w.day,
        expiresAt: at("2026-11-07T14:00:00Z").epochMilliseconds / 1000,
      });
      expect(JSON.parse(first?.payload ?? "")).toEqual({
        aps: { alert: { body: readyFor("Ana") }, sound: "default", "thread-id": w.club },
        tadayo: { open: "day", club_id: w.club, occurrence_id: w.day },
      });

      // A second pass plans nothing more and sends nothing more.
      expect(await passAt(tx, sender, OPEN.add({ seconds: 30 }))).toMatchObject({ planned: 0, sent: 0 });
      expect(sender.pushes).toHaveLength(1);

      // 08:00 in London, then 08:00 in New York.
      await passAt(tx, sender, at("2026-11-07T08:00:00Z"));
      expect(sender.pushes.map((push) => push.token)).toEqual([cleo.token, ben.token]);
      await passAt(tx, sender, at("2026-11-07T12:59:59.999999Z"));
      expect(sender.pushes).toHaveLength(2);
      await passAt(tx, sender, at("2026-11-07T13:00:00Z"));
      expect(sender.pushes.map((push) => push.token)).toEqual([cleo.token, ben.token, ana.token]);
      expect((JSON.parse(sender.pushes[2]?.payload ?? "") as { aps: { alert: { body: string } } }).aps.alert.body).toBe(
        STAR_BODY,
      );
      // Ben's until 23:00 in London; Ana's until the close, which comes before 23:00 in New York.
      expect(sender.pushes.map((push) => push.expiresAt)).toEqual(
        ["2026-11-07T14:00:00Z", "2026-11-07T23:00:00Z", CLOSE.toString()].map(
          (text) => at(text).epochMilliseconds / 1000,
        ),
      );

      const sent = await deliveries(tx, w.day);
      expect(sent.map((row) => [row.state, row.sent_at?.toString(), row.attempts, row.lease_until])).toEqual([
        ["sent", OPEN.toString(), 1, null],
        ["sent", "2026-11-07T08:00:00Z", 1, null],
        ["sent", "2026-11-07T13:00:00Z", 1, null],
      ]);
      // No payload holds the caption, a drop, a URL or a token (T37, T52).
      for (const push of sender.pushes) {
        expect(push.payload).not.toMatch(/caption|drp_|https?:|upl_|src_/);
        expect(push.payload).not.toContain(push.token);
      }
    });
  });

  it("plans nobody who reads no drop, nobody with no device, and a day with no drop for nobody", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      // Cleo left the club before the reveal, so reads nothing of the day; Ben has no device.
      await leave(plain(tx), w.cleo, "Cleo", new Date("2026-11-06T22:00:00Z"));
      const ana = await register(tx, w.ana, "Asia/Tokyo");
      await register(tx, w.cleo, "Asia/Tokyo");
      const empty = await newWorld(plain(tx));
      await register(tx, empty.ana, "Asia/Tokyo");
      await register(tx, empty.ben, "Asia/Tokyo");
      await aside(tx, [w.day, empty.day]);
      const sender = new FakeSender();
      expect(await passAt(tx, sender, OPEN)).toMatchObject({ planned: 1, sent: 1 });
      expect((await deliveries(tx, w.day)).map((row) => row.sign_in)).toEqual([ana.signIn]);
      expect(await deliveries(tx, empty.day)).toEqual([]);
      // Both days are planned, so neither is planned again.
      const days = await tx`SELECT occurrence_id FROM app.push_days WHERE occurrence_id IN ${tx([w.day, empty.day])}`;
      expect(days).toHaveLength(2);
    });
  });

  it("plans a day first seen after it opened, and nothing once it has closed", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      const ana = await register(tx, w.ana, "Asia/Tokyo");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      expect(await passAt(tx, sender, CLOSE)).toMatchObject({ planned: 0, sent: 0 });
      expect(await passAt(tx, sender, CLOSE.subtract({ microseconds: 1 }))).toMatchObject({ planned: 1, sent: 1 });
      expect((await deliveryTo(tx, w.day, ana)).state).toBe("sent");
    });
  });

  it("leaves out a device whose zone the server no longer resolves, counts it, and plans the rest", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      const ana = await register(tx, w.ana, "Asia/Tokyo");
      const ben = await register(tx, w.ben, "Asia/Tokyo");
      // A zone 0017's pattern allows and no zone data holds: as if the server's zone data dropped Ben's.
      await tx`UPDATE app.device_registrations SET timezone = 'Mars/Olympus'
                WHERE sign_in = pg_catalog.decode(${ben.signIn}, 'hex')`;
      await aside(tx, [w.day]);
      const before = await failureCount(tx, "push.zone");
      const result = await passAt(tx, new FakeSender(), OPEN);
      expect(result).toMatchObject({
        planned: 1,
        sent: 1,
        failures: [`${w.day}: plan: 1 left out for a zone the server doesn't resolve`],
      });
      expect((await deliveries(tx, w.day)).map((row) => row.sign_in)).toEqual([ana.signIn]);
      expect(await failureCount(tx, "push.zone")).toBe(before + 1);
    });
  });
});

describe("the decision at dispatch (the plan's section 2.3)", () => {
  /** A world whose four phones are in New York, so all four deliveries are due at 13:00Z. */
  async function heldWorld(tx: WorldTx) {
    const w = await world(tx);
    const devices = {
      ana: await register(tx, w.ana, "America/New_York"),
      ben: await register(tx, w.ben, "America/New_York"),
      cleo: await register(tx, w.cleo, "America/New_York"),
    };
    await aside(tx, [w.day]);
    const sender = new FakeSender();
    await passAt(tx, sender, OPEN);
    expect(sender.pushes).toEqual([]);
    return { w, devices, sender };
  }
  const AT_NY_8 = at("2026-11-07T13:00:00Z");

  it("skips a deleting account, a device removed, and every reader once the drop is removed, each with its code", async () => {
    await rolledBack(db, async (tx) => {
      const { w, devices, sender } = await heldWorld(tx);
      // Cleo asks to delete their account; Ben's phone is removed (Ben's drop stays: only its author's deletion would
      // take it from the day, and every reader with it).
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${AT_NY_8.subtract({ hours: 1 })}
                WHERE id = ${w.cleo.user}`;
      clock.set(AT_NY_8.subtract({ minutes: 30 }));
      await tx.savepoint((sp) => removeDevice(sp, clock, devices.ben.secret));
      expect(await passAt(tx, sender, AT_NY_8)).toMatchObject({ sent: 1, skipped: 2 });
      expect(sender.pushes.map((push) => push.token)).toEqual([devices.ana.token]);
      const rows = await deliveries(tx, w.day);
      const of = (user: string) => rows.find((row) => row.user_id === user);
      expect(of(w.cleo.user)).toMatchObject({ state: "skipped", outcome: "account", sent_at: null });
      // The removal deleted the registration, and with it the delivery's sign-in (0021's foreign key).
      expect(of(w.ben.user)).toMatchObject({ state: "skipped", outcome: "unregistered", sign_in: null });
    });
    await rolledBack(db, async (tx) => {
      const { w, sender } = await heldWorld(tx);
      await tx`UPDATE app.drops SET state = 'removed', ended_at = ${AT_NY_8}, updated_at = ${AT_NY_8}
                WHERE occurrence_id = ${w.day}`;
      expect(await passAt(tx, sender, AT_NY_8.add({ seconds: 1 }))).toMatchObject({ sent: 0, skipped: 3 });
      expect((await deliveries(tx, w.day)).map((row) => row.outcome)).toEqual([
        "unreadable",
        "unreadable",
        "unreadable",
      ]);
      expect(sender.pushes).toEqual([]);
    });
  });

  it("sends nothing to a device whose registration went after the decision, and ends its delivery as unregistered", async () => {
    await rolledBack(db, async (tx) => {
      const { w, devices, sender } = await heldWorld(tx);
      clock.set(AT_NY_8);
      const claimed = await claimDelivery(inside(tx), clock);
      if (claimed === null) throw new Error("nothing claimed");
      const decided = await decideDelivery(inside(tx), clock, claimed);
      if (decided.kind !== "send") throw new Error("not decided to send");
      const row = (await deliveries(tx, w.day)).find((one) => one.id === claimed.id);
      const device = Object.values(devices).find((one) => one.signIn === row?.sign_in);
      if (device === undefined) throw new Error("no device");
      // The phone signs out between the decision and the send.
      await tx.savepoint((sp) => removeDevice(sp, clock, device.secret));
      expect(await sendDelivery(inside(tx), clock, sender, claimed.id, decided)).toEqual({
        answered: "skipped",
        reason: "unregistered",
      });
      expect(sender.pushes).toEqual([]);
      expect((await deliveries(tx, w.day)).find((one) => one.id === claimed.id)).toMatchObject({
        state: "skipped",
        outcome: "unregistered",
        sign_in: null,
        sent_at: null,
        lease_until: null,
      });
    });
  });

  it("sends to the token the registration holds when the push goes, not the one it held at the decision", async () => {
    await rolledBack(db, async (tx) => {
      const { w, devices, sender } = await heldWorld(tx);
      clock.set(AT_NY_8);
      const claimed = await claimDelivery(inside(tx), clock);
      if (claimed === null) throw new Error("nothing claimed");
      const decided = await decideDelivery(inside(tx), clock, claimed);
      if (decided.kind !== "send") throw new Error("not decided to send");
      const row = (await deliveries(tx, w.day)).find((one) => one.id === claimed.id);
      const device = Object.values(devices).find((one) => one.signIn === row?.sign_in);
      if (device === undefined) throw new Error("no device");
      // iOS gives the phone a new token between the decision and the send, and the app registers it.
      const renewed = randomBytes(32).toString("hex");
      await register(tx, { user: row?.user_id ?? "" }, "America/New_York", { ...device, token: renewed });
      sender.answer = () => ({ kind: "dead", status: 410, reason: "Unregistered" });
      expect(await sendDelivery(inside(tx), clock, sender, claimed.id, decided)).toEqual({
        answered: "dead",
        reason: "Unregistered",
      });
      expect(sender.pushes.map((push) => push.token)).toEqual([renewed]);
      // Apple called the token it was sent dead, so that token's registration goes, and no other.
      expect(
        await tx`SELECT 1 FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${device.signIn}, 'hex')`,
      ).toHaveLength(0);
    });
  });

  it("reports and counts a decision that keeps failing, leaves the rest to go, and ends it at the day's close", async () => {
    await rolledBack(db, async (tx) => {
      const { w, devices, sender } = await heldWorld(tx);
      // Cleo's zone stops resolving after the plan: each decision for Cleo's phone throws.
      await tx`UPDATE app.device_registrations SET timezone = 'Mars/Olympus'
                WHERE sign_in = pg_catalog.decode(${devices.cleo.signIn}, 'hex')`;
      const cleo = await deliveryTo(tx, w.day, devices.cleo);
      const before = await failureCount(tx, "push.failed");
      const result = await passAt(tx, sender, AT_NY_8);
      expect(result).toMatchObject({ sent: 2, failures: [`${cleo.id}: RangeError`] });
      expect(await failureCount(tx, "push.failed")).toBe(before + 1);
      // Left leased, so the next minute's pass doesn't take it again; a minute later it is tried again.
      expect(await passAt(tx, sender, AT_NY_8.add({ seconds: 59 }))).toMatchObject({ failures: [] });
      expect(await passAt(tx, sender, AT_NY_8.add({ seconds: 60 }))).toMatchObject({
        failures: [`${cleo.id}: RangeError`],
      });
      // Once the day has closed, it ends as closed before anything else is read.
      expect(await passAt(tx, sender, CLOSE)).toMatchObject({ skipped: 1, failures: [] });
      expect(await deliveryTo(tx, w.day, devices.cleo)).toMatchObject({ state: "skipped", outcome: "closed" });
      expect(sender.pushes.map((push) => push.token).sort()).toEqual([devices.ana.token, devices.ben.token].sort());
    });
  });

  it("holds a device in the quiet hours of the zone it holds now, not the zone it was planned in", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      const ben = await register(tx, w.ben, "Europe/London");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      await passAt(tx, sender, OPEN);
      expect((await deliveryTo(tx, w.day, ben)).due_at).toEqual(at("2026-11-07T08:00:00Z"));
      // Ben flies to New York and the app registers again there, the same sign-in with its new zone.
      clock.set(at("2026-11-07T07:30:00Z"));
      await register(tx, w.ben, "America/New_York", ben);
      expect(await passAt(tx, sender, at("2026-11-07T08:00:00Z"))).toMatchObject({ sent: 0, later: 1 });
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "pending", lease_until: null, sent_at: null });
      expect((await deliveryTo(tx, w.day, ben)).due_at).toEqual(at("2026-11-07T13:00:00Z"));
      await passAt(tx, sender, at("2026-11-07T13:00:00Z"));
      expect(sender.pushes.map((push) => push.token)).toEqual([ben.token]);
    });
  });

  it("keeps two a day per member across clubs, in the zone of the latest device, a day counted once over devices", async () => {
    for (const [spentBefore, expected] of [
      [1, ["sent", "sent"]],
      [2, ["skipped", "skipped"]],
    ] as const) {
      await rolledBack(db, async (tx) => {
        const w = await world(tx);
        // Ben's two phones in London; the later one names the budget's day: 7 November in London, 00:00Z to 24:00Z.
        const one = await register(tx, w.ben, "Europe/London");
        clock.set(EVENING.add({ minutes: 1 }));
        const two = await register(tx, w.ben, "Europe/London");
        // Days of other clubs already pushed to Ben today, and one yesterday, which doesn't count.
        const others: string[] = [];
        for (const sentAt of ["2026-11-07T06:00:00Z", "2026-11-07T06:30:00Z", "2026-11-06T23:59:59Z"]
          .slice(0, spentBefore)
          .concat(["2026-11-06T23:59:59Z"])) {
          const other = await newWorld(plain(tx));
          others.push(other.day);
          await tx`INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${other.day}, ${EVENING})`;
          await tx`
            INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, state, due_at, sent_at, finished_at,
                                             planned_at, attempts)
            VALUES (${`psh_${randomBytes(12).toString("base64url")}`}, ${other.day}, ${w.ben.user}, NULL, 'sent',
                    ${at(sentAt)}, ${at(sentAt)}, ${at(sentAt)}, ${EVENING}, 1)`;
        }
        await aside(tx, [w.day]);
        const sender = new FakeSender();
        await passAt(tx, sender, at("2026-11-07T08:00:00Z"));
        expect([(await deliveryTo(tx, w.day, one)).state, (await deliveryTo(tx, w.day, two)).state]).toEqual(expected);
        if (expected[0] === "skipped") {
          expect((await deliveryTo(tx, w.day, one)).outcome).toBe("budget");
        }
      });
    }
  });

  /** A delivery of another club's day to `who`, in `state`, decided at `sentAt` (null: never, or Apple took none). */
  async function otherDay(tx: WorldTx, who: string, state: string, sentAt: string | null): Promise<void> {
    const other = await newWorld(plain(tx));
    const at_ = sentAt === null ? null : at(sentAt);
    const finished = ["sent", "skipped", "failed"].includes(state) ? (at_ ?? EVENING) : null;
    await tx`INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${other.day}, ${EVENING})`;
    await tx`
      INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, state, due_at, sent_at, finished_at, outcome,
                                       lease_until, planned_at, attempts)
      VALUES (${`psh_${randomBytes(12).toString("base64url")}`}, ${other.day}, ${who}, NULL, ${state}, ${EVENING},
              ${at_}, ${finished}, ${state === "skipped" || state === "failed" ? "test.other" : null},
              ${state === "sending" ? at("2026-11-07T23:59:00Z") : null}, ${EVENING}, 1)`;
  }

  it("counts a push whose fate is unknown, whatever its delivery's state, and not one Apple took nothing of", async () => {
    for (const [states, expected] of [
      // A retry after no answer (pending, its time kept) and a send in flight count; a refusal (time cleared) doesn't.
      [["pending", "sending"], "skipped"],
      [["pending", "failed"], "sent"],
    ] as const) {
      await rolledBack(db, async (tx) => {
        const w = await world(tx);
        const ben = await register(tx, w.ben, "Europe/London");
        await otherDay(tx, w.ben.user, states[0], "2026-11-07T06:00:00Z");
        await otherDay(tx, w.ben.user, states[1], states[1] === "failed" ? null : "2026-11-07T06:30:00Z");
        await aside(tx, [w.day]);
        await passAt(tx, new FakeSender(), at("2026-11-07T08:00:00Z"));
        expect((await deliveryTo(tx, w.day, ben)).state, states.join()).toBe(expected);
      });
    }
  });

  it("names the budget's day in the zone of the latest device: two pushes yesterday in New York don't count today", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      // Ben's first phone is in London; the later one in New York names the day: 7 November there, 05:00Z to 05:00Z.
      const london = await register(tx, w.ben, "Europe/London");
      clock.set(EVENING.add({ minutes: 1 }));
      await register(tx, w.ben, "America/New_York");
      // 04:30Z and 04:45Z are 6 November in New York, though 7 November in London and in UTC.
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T04:30:00Z");
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T04:45:00Z");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      await passAt(tx, sender, at("2026-11-07T08:00:00Z"));
      expect(await deliveryTo(tx, w.day, london)).toMatchObject({ state: "sent" });
    });
  });

  it("lets a second phone have the day's push once the first had it, though other clubs spent the budget since", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      const london = await register(tx, w.ben, "Europe/London");
      clock.set(EVENING.add({ minutes: 1 }));
      const newYork = await register(tx, w.ben, "America/New_York");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      await passAt(tx, sender, at("2026-11-07T08:00:00Z"));
      expect((await deliveryTo(tx, w.day, london)).state).toBe("sent");
      // Each phone's push goes to that phone, though the other is Ben's latest registration.
      expect(sender.pushes.map((push) => push.token)).toEqual([london.token]);
      // Two other clubs' days reach Ben before the New York phone's quiet hours end.
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T09:00:00Z");
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T10:00:00Z");
      await passAt(tx, sender, at("2026-11-07T13:00:00Z"));
      expect(await deliveryTo(tx, w.day, newYork)).toMatchObject({ state: "sent" });
      expect(sender.pushes.map((push) => push.token)).toEqual([london.token, newYork.token]);
    });
  });

  it("counts the first phone's push only in its own budget day: a later day's third push is skipped", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      // Ben's Tokyo phone has the day at the reveal, 23:00 on 6 November in Los Angeles, where the later phone is.
      const tokyo = await register(tx, w.ben, "Asia/Tokyo");
      clock.set(EVENING.add({ minutes: 1 }));
      const angeles = await register(tx, w.ben, "America/Los_Angeles");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      await passAt(tx, sender, OPEN);
      expect((await deliveryTo(tx, w.day, tokyo)).state).toBe("sent");
      // Two other clubs' days reach Ben on 7 November in Los Angeles, before its phone's quiet hours end, 16:00Z.
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T15:00:00Z");
      await otherDay(tx, w.ben.user, "sent", "2026-11-07T15:30:00Z");
      await passAt(tx, sender, at("2026-11-07T16:00:00Z"));
      expect(await deliveryTo(tx, w.day, angeles)).toMatchObject({ state: "skipped", outcome: "budget" });
    });
  });
});

describe("Apple's answer (the plan's section 2.3, item 3)", () => {
  /** A world whose one phone, Ben's, is in Tokyo, so its delivery is due at the reveal. */
  async function tokyo(tx: WorldTx) {
    const w = await world(tx);
    const ben = await register(tx, w.ben, "Asia/Tokyo");
    await aside(tx, [w.day]);
    return { w, ben, sender: new FakeSender() };
  }

  it("ends a dead token's delivery as failed, deletes its registration, keeps its sign-in, and counts nothing", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "dead", status: 410, reason: "Unregistered" });
      const before = await failureCount(tx, "push.Unregistered");
      expect(await passAt(tx, sender, OPEN)).toMatchObject({ sent: 0, failed: 1, failures: [] });
      const [row] = await deliveries(tx, w.day);
      // Apple took nothing, so the push leaves the budget.
      expect(row).toMatchObject({
        state: "failed",
        outcome: "Unregistered",
        sign_in: null,
        lease_until: null,
        sent_at: null,
      });
      expect(await tx`SELECT 1 FROM app.device_registrations WHERE user_id = ${w.ben.user}`).toHaveLength(0);
      expect(
        await tx`SELECT 1 FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${ben.signIn}, 'hex')`,
      ).toHaveLength(0);
      expect(await failureCount(tx, "push.Unregistered")).toBe(before);
    });
  });

  it("deletes the registration of a token for the wrong environment or topic too, and counts that for the founder", async () => {
    await rolledBack(db, async (tx) => {
      const { w, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "dead", status: 400, reason: "BadDeviceToken" });
      const before = await failureCount(tx, "push.BadDeviceToken");
      expect(await passAt(tx, sender, OPEN)).toMatchObject({ failed: 1, failures: [] });
      expect(await tx`SELECT 1 FROM app.device_registrations WHERE user_id = ${w.ben.user}`).toHaveLength(0);
      expect(await failureCount(tx, "push.BadDeviceToken")).toBe(before + 1);
    });
  });

  it("deletes no registration that holds another token by the time the answer comes", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      // iOS gives the app a new token, which it registers for the same sign-in, before Apple answers for the old one.
      const renewed = randomBytes(32).toString("hex");
      sender.during = async () => {
        clock.set(OPEN.add({ seconds: 5 }));
        await register(tx, w.ben, "Asia/Tokyo", { ...ben, token: renewed });
      };
      sender.answer = () => ({ kind: "dead", status: 410, reason: "Unregistered" });
      expect(await passAt(tx, sender, OPEN)).toMatchObject({ failed: 1 });
      expect(await tx`SELECT apns_token FROM app.device_registrations WHERE user_id = ${w.ben.user}`).toEqual([
        { apns_token: renewed },
      ]);
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "failed", outcome: "Unregistered" });
    });
  });

  it("puts a retry back after the backoff, or Apple's wait after a 5xx, with its decision undone", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "retry", status: 429, reason: "TooManyRequests", waitSeconds: 0 });
      expect(await passAt(tx, sender, OPEN)).toMatchObject({ later: 1, sent: 0 });
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "pending", sent_at: null, attempts: 1 });
      expect((await deliveryTo(tx, w.day, ben)).due_at).toEqual(OPEN.add({ seconds: 30 }));
      sender.answer = () => ({ kind: "retry", status: 503, reason: "ServiceUnavailable", waitSeconds: 900 });
      await passAt(tx, sender, OPEN.add({ seconds: 30 }));
      expect((await deliveryTo(tx, w.day, ben)).due_at).toEqual(OPEN.add({ seconds: 930 }));
      sender.answer = () => ({ kind: "sent" });
      await passAt(tx, sender, OPEN.add({ seconds: 929 }));
      expect(sender.pushes).toHaveLength(2);
      await passAt(tx, sender, OPEN.add({ seconds: 930 }));
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sent", attempts: 3 });
      expect((await deliveryTo(tx, w.day, ben)).sent_at).toEqual(OPEN.add({ seconds: 930 }));
    });
  });

  it("keeps a push whose fate is unknown in the budget: its first decision's time stays through the retry", async () => {
    for (const reason of ["network.timeout", "network.stream", "sender.failed"]) {
      await rolledBack(db, async (tx) => {
        const { w, ben, sender } = await tokyo(tx);
        sender.answer = () => ({ kind: "retry", status: null, reason, waitSeconds: 0 });
        expect(await passAt(tx, sender, OPEN)).toMatchObject({ later: 1 });
        expect(await deliveryTo(tx, w.day, ben), reason).toMatchObject({ state: "pending", sent_at: OPEN });
        sender.answer = () => ({ kind: "sent" });
        await passAt(tx, sender, OPEN.add({ seconds: 30 }));
        expect(await deliveryTo(tx, w.day, ben), reason).toMatchObject({ state: "sent", sent_at: OPEN, attempts: 2 });
      });
    }
    // A request that never left (no connection) took nothing, like an answer from Apple.
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "retry", status: null, reason: "network.connection", waitSeconds: 0 });
      await passAt(tx, sender, OPEN);
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "pending", sent_at: null });
    });
  });

  it("ends a retry whose next try would come after the close as failed, closed, and counts it", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "retry", status: 503, reason: "ServiceUnavailable", waitSeconds: 900 });
      const before = await failureCount(tx, "push.closed");
      // The worker was away until 00:50 London: the plan comes then, and Ben's phone is at 09:50 in Tokyo.
      const late = CLOSE.subtract({ minutes: 10 });
      expect(await passAt(tx, sender, late)).toMatchObject({ planned: 1, failed: 1 });
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "failed", outcome: "closed", lease_until: null });
      expect(await failureCount(tx, "push.closed")).toBe(before + 1);
    });
  });

  it("ends any other answer as failed with Apple's reason, and counts it for the founder's alert (B7)", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      sender.answer = () => ({ kind: "refused", status: 403, reason: "InvalidProviderToken" });
      const before = await failureCount(tx, "push.InvalidProviderToken");
      const result = await passAt(tx, sender, OPEN);
      expect(result).toMatchObject({
        failed: 1,
        failures: [`${(await deliveryTo(tx, w.day, ben)).id}: InvalidProviderToken`],
      });
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({
        state: "failed",
        outcome: "InvalidProviderToken",
        sent_at: null,
      });
      expect(await failureCount(tx, "push.InvalidProviderToken")).toBe(before + 1);
      // The lines carry the delivery's opaque id and the code, never a token, a name or a body (T52).
      const lines = pushLines(result);
      expect(lines.err).toEqual([
        `worker: a reveal push failed: ${(await deliveryTo(tx, w.day, ben)).id}: InvalidProviderToken`,
      ]);
      for (const line of [...lines.out, ...lines.err]) {
        expect(line).not.toContain(ben.token);
        expect(line).not.toMatch(/Ana|Ben|ready/);
      }
    });
  });

  it("decides again a send that never reported back, keeping its first decision's time, and sends nothing for its stale decision", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben, sender } = await tokyo(tx);
      // The plan, with no dispatch: a pass told to stop after it planned.
      clock.set(OPEN);
      let planned = false;
      await pushPass(inside(tx), clock, sender, () => {
        const was = planned;
        planned = true;
        return was;
      });
      expect(await deliveries(tx, w.day)).toHaveLength(1);
      // A decision whose send never reports back (the worker stopped).
      const claimed = await claimDelivery(inside(tx), clock);
      if (claimed === null) throw new Error("nothing claimed");
      const decided = await decideDelivery(inside(tx), clock, claimed);
      if (decided.kind !== "send") throw new Error("not decided to send");
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sending", attempts: 1 });
      // Within its lease, nobody claims it.
      clock.set(OPEN.add({ seconds: SEND_LEASE_SECONDS - 1 }));
      expect(await claimDelivery(inside(tx), clock)).toBeNull();
      // Once it has passed, it is claimed and decided again.
      clock.set(OPEN.add({ seconds: SEND_LEASE_SECONDS }));
      const again = await claimDelivery(inside(tx), clock);
      if (again === null) throw new Error("not claimed again");
      const redecided = await decideDelivery(inside(tx), clock, again);
      if (redecided.kind !== "send") throw new Error("not decided to send again");
      expect(redecided.ownSentAt).toBe(false);
      // The first decision's send, late, while the second is decided: it is the first decision's, so it sends nothing.
      const before = sender.pushes.length;
      expect(await sendDelivery(inside(tx), clock, sender, claimed.id, decided)).toEqual({
        answered: "lost",
        reason: "",
      });
      expect(sender.pushes).toHaveLength(before);
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sending", attempts: 2 });
      // The second's send ends it; its first decision's time stays.
      expect(await sendDelivery(inside(tx), clock, sender, again.id, redecided)).toEqual({
        answered: "sent",
        reason: "",
      });
      expect(sender.pushes).toHaveLength(before + 1);
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sent", attempts: 2 });
      expect((await deliveryTo(tx, w.day, ben)).sent_at).toEqual(OPEN);
      // The first decision's send once more: that decision is over, so it sends and writes nothing.
      clock.set(OPEN.add({ seconds: SEND_LEASE_SECONDS + 1 }));
      sender.answer = () => ({ kind: "refused", status: 400, reason: "BadTopic" });
      expect(await sendDelivery(inside(tx), clock, sender, claimed.id, decided)).toEqual({
        answered: "lost",
        reason: "",
      });
      expect(sender.pushes).toHaveLength(before + 1);
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sent", outcome: null });
    });
  });

  it("claims past the deliveries its pass has visited, so one back early stops no other", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      await register(tx, w.ana, "Asia/Tokyo");
      await register(tx, w.ben, "Asia/Tokyo");
      await aside(tx, [w.day]);
      clock.set(OPEN);
      let planned = false;
      await pushPass(inside(tx), clock, new FakeSender(), () => {
        const was = planned;
        planned = true;
        return was;
      });
      const ids = (await deliveries(tx, w.day)).map((one) => one.id);
      expect(ids).toHaveLength(2);
      // The delivery the claim takes first, once claimed and free again (its lease gone, as when its decision threw
      // and the lease ran out), still comes first to a claim that hasn't visited it.
      const first = await claimDelivery(inside(tx), clock);
      await tx`UPDATE app.push_deliveries SET lease_until = NULL WHERE id = ${first?.id ?? ""}`;
      expect((await claimDelivery(inside(tx), clock))?.id).toBe(first?.id);
      await tx`UPDATE app.push_deliveries SET lease_until = NULL WHERE id = ${first?.id ?? ""}`;
      // A pass that visited it takes the other.
      expect((await claimDelivery(inside(tx), clock, [first?.id ?? ""]))?.id).toBe(ids.find((id) => id !== first?.id));
    });
  });

  it("holds the delivery's row across Apple for less than the role's idle limit and the send's lease", async () => {
    const [row] = await db<
      { idle: string }[]
    >`SELECT pg_catalog.current_setting('idle_in_transaction_session_timeout') AS idle`;
    expect(row?.idle).toBe("15s");
    expect(REQUEST_TIMEOUT_MS).toBeLessThan(15_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThan(SEND_LEASE_SECONDS * 1000);
  });
});

describe("the push's minute (main.ts)", () => {
  it("purges closed days' rows whatever TADAYO_PUSH says, and plans and sends only with a sender", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      const ben = await register(tx, w.ben, "Asia/Tokyo");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      clock.set(OPEN);
      // With no sender (TADAYO_PUSH none), nothing is planned.
      expect(await pushMinute(inside(tx), clock, undefined)).toEqual({ out: [], err: [] });
      expect(await tx`SELECT 1 FROM app.push_days WHERE occurrence_id = ${w.day}`).toHaveLength(0);
      expect(await pushMinute(inside(tx), clock, sender)).toEqual({
        out: ["worker: planned 1 reveal push", "worker: reveal pushes: 1 sent, 0 skipped, 0 failed"],
        err: [],
      });
      expect((await deliveryTo(tx, w.day, ben)).state).toBe("sent");
      // The push turned off: its rows still go 48 hours after the close.
      clock.set(CLOSE.add({ hours: KEEP_AFTER_CLOSE_HOURS }));
      expect(await pushMinute(inside(tx), clock, undefined)).toEqual({ out: [], err: [] });
      expect(await tx`SELECT 1 FROM app.push_days WHERE occurrence_id = ${w.day}`).toHaveLength(0);
    });
  });
});

describe("the purge (the plan's section 2.1)", () => {
  it("deletes a day's rows once it has been closed 48 hours, and not before", async () => {
    await rolledBack(db, async (tx) => {
      const w = await world(tx);
      await register(tx, w.ben, "Asia/Tokyo");
      await aside(tx, [w.day]);
      const sender = new FakeSender();
      await passAt(tx, sender, OPEN);
      const keptUntil = CLOSE.add({ hours: KEEP_AFTER_CLOSE_HOURS });
      clock.set(keptUntil.subtract({ microseconds: 1 }));
      await pushMinute(inside(tx), clock, sender);
      expect(await deliveries(tx, w.day)).toHaveLength(1);
      clock.set(keptUntil);
      await pushMinute(inside(tx), clock, sender);
      expect(await deliveries(tx, w.day)).toEqual([]);
      expect(await tx`SELECT 1 FROM app.push_days WHERE occurrence_id = ${w.day}`).toHaveLength(0);
    });
  });
});

describe("a send in flight, committed on two connections (the plan's section 2.3)", () => {
  it("holds the delivery's row across Apple, so a removal of its device waits until Apple's answer is written", async () => {
    // A committed world with Ben's phone, and a delivery already decided to send, as the decision leaves it.
    committed = true;
    const w = await db.begin((tx) => newWorld(plain(tx)));
    clock.set(EVENING);
    const ben = await db.begin(async (tx) => {
      const secret = randomBytes(32).toString("base64url");
      const token = randomBytes(32).toString("hex");
      await registerDevice(tx, clock, {
        userId: w.ben.user,
        apnsToken: token,
        apnsEnvironment: "production",
        timezone: "Asia/Tokyo",
        removalSecret: secret,
      });
      return { secret, token, signIn: createHash("sha256").update(secret).digest("hex") };
    });
    const id = `psh_${randomBytes(12).toString("base64url")}`;
    const leaseUntil = OPEN.add({ seconds: SEND_LEASE_SECONDS });
    await db.begin(async (tx) => {
      await tx`INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${w.day}, ${OPEN})`;
      await tx`
        INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, state, due_at, lease_until, sent_at,
                                         attempts, planned_at)
        VALUES (${id}, ${w.day}, ${w.ben.user}, pg_catalog.decode(${ben.signIn}, 'hex'), 'sending', ${REVEAL},
                ${leaseUntil}, ${OPEN}, 1, ${OPEN})`;
    });
    const decided: DecidedPush = {
      kind: "send",
      userId: w.ben.user,
      signIn: Buffer.from(ben.signIn, "hex"),
      payload: JSON.stringify({ aps: { alert: { body: readyFor("Ana") } } }),
      occurrenceId: w.day,
      closeAt: CLOSE,
      expiresAt: CLOSE,
      attempts: 1,
      leaseUntil,
      ownSentAt: true,
    };
    // Apple takes its time to answer, until the test lets it.
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let handed: () => void = () => undefined;
    const atApple = new Promise<void>((resolve) => {
      handed = resolve;
    });
    const sender = new FakeSender();
    sender.during = async () => {
      handed();
      await answered;
    };
    clock.set(OPEN.add({ seconds: 1 }));
    const sending = sendDelivery(db, clock, sender, id, decided);
    await atApple;
    // Ben signs the phone out while Apple holds the push: the removal deletes the registration, whose foreign key
    // must set the delivery's sign-in null, and waits for the send's row.
    const removing = db.begin((tx) => removeDevice(tx, clock, ben.secret));
    const finished = await Promise.race([
      removing.then(() => "finished"),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("waiting");
        }, 300);
      }),
    ]);
    expect(finished).toBe("waiting");
    answer();
    expect(await sending).toEqual({ answered: "sent", reason: "" });
    expect(await removing).toBe("removed");
    const [row] = await db<{ state: string; sign_in: string | null }[]>`
      SELECT state, pg_catalog.encode(sign_in, 'hex') AS sign_in FROM app.push_deliveries WHERE id = ${id}`;
    expect(row).toEqual({ state: "sent", sign_in: null });
    expect(sender.pushes).toHaveLength(1);
  });
});
