/// <reference lib="esnext.temporal" />
// The reveal push's plan and dispatch against Postgres as `tadayo_app` (services/worker/src/push.ts;
// packages/domain/src/push/reveal.ts; db/migrations/0021_push.sql; docs/plans/api-b2-spike-push.md, sections 2.1 to
// 2.3 and 2.6; spec 21; T1, T9, T36, T37, T52; FQ30): the plan at the reveal, once, for each reader's devices and
// nobody else; quiet hours in each device's zone, at the plan and again at dispatch in the zone the registration holds
// then; the rechecks; the budget across days; each answer of Apple's (sent, a dead token, a retry, one past the close,
// a refusal); a send that never reported back; a stale answer; and the purge.
//
// Each test is one rolled-back transaction: the worker's transactions are savepoints in it (`inside`), as the prepare
// test's are, and every other day the database holds is set aside first (`aside`), so the pass plans and sends only
// the test's own. The sender is a fake that records each push and answers as told; apns.test.ts holds the real one
// against a fake APNs. Two dispatchers at once need two connections, which a rolled-back test hasn't: their claims are
// `FOR UPDATE SKIP LOCKED`, as the outbox's, whose test holds that rule (worker-outbox.test.ts).

import { createHash, randomBytes } from "node:crypto";
import { registerDevice, removeDevice, STAR_BODY } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import {
  answerDelivery,
  claimDelivery,
  decideDelivery,
  KEEP_AFTER_CLOSE_HOURS,
  pushLines,
  pushPass,
  SEND_LEASE_SECONDS,
  type ApnsOutcome,
  type ApnsPush,
  type ApnsSender,
  type WorkerSql,
} from "@tadayo/worker";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { commitDrop, leave, newWorld, type World } from "./world.ts";

const db = worldSql(4);
afterAll(async () => {
  await db.end();
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

/** A fake APNs sender: records each push, answers as `answer` says (sent by default). */
class FakeSender implements ApnsSender {
  readonly pushes: ApnsPush[] = [];
  answer: (push: ApnsPush) => ApnsOutcome = () => ({ kind: "sent" });
  send(push: ApnsPush): Promise<ApnsOutcome> {
    this.pushes.push(push);
    return Promise.resolve(this.answer(push));
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
      expect(first).toEqual({
        token: cleo.token,
        environment: "production",
        payload: first?.payload,
        collapseId: w.day,
        expiresAt: CLOSE.epochMilliseconds / 1000,
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
      expect(row).toMatchObject({ state: "failed", outcome: "Unregistered", sign_in: null, lease_until: null });
      expect(await tx`SELECT 1 FROM app.device_registrations WHERE user_id = ${w.ben.user}`).toHaveLength(0);
      expect(
        await tx`SELECT 1 FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${ben.signIn}, 'hex')`,
      ).toHaveLength(0);
      expect(await failureCount(tx, "push.Unregistered")).toBe(before);
    });
  });

  it("deletes no registration that holds another token by the time the answer comes", async () => {
    await rolledBack(db, async (tx) => {
      const { w, ben } = await tokyo(tx);
      // The plan alone: a pass told to stop once it has planned.
      clock.set(OPEN);
      let planned = false;
      await pushPass(inside(tx), clock, new FakeSender(), () => {
        const was = planned;
        planned = true;
        return was;
      });
      const claimed = await claimDelivery(inside(tx), clock);
      if (claimed === null) throw new Error("nothing claimed");
      const decided = await decideDelivery(inside(tx), clock, claimed);
      if (decided.kind !== "send") throw new Error("not decided to send");
      // iOS gives the app a new token, which it registers for the same sign-in, before Apple answers for the old one.
      const renewed = randomBytes(32).toString("hex");
      clock.set(OPEN.add({ seconds: 5 }));
      await register(tx, w.ben, "Asia/Tokyo", { ...ben, token: renewed });
      const answer = await answerDelivery(inside(tx), clock, claimed.id, decided, {
        kind: "dead",
        status: 410,
        reason: "Unregistered",
      });
      expect(answer.answered).toBe("dead");
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
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "failed", outcome: "InvalidProviderToken" });
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

  it("decides again a send that never reported back, keeping its first decision's time, and ignores its stale answers", async () => {
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
      // The first send's answer, late, while the second is out: it was the first decision's, so it writes nothing.
      const early = await answerDelivery(inside(tx), clock, claimed.id, decided, { kind: "sent" });
      expect(early.answered).toBe("lost");
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sending", attempts: 2 });
      // The second's answer ends it; its first decision's time stays.
      const answered = await answerDelivery(inside(tx), clock, again.id, redecided, { kind: "sent" });
      expect(answered.answered).toBe("sent");
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sent", attempts: 2 });
      expect((await deliveryTo(tx, w.day, ben)).sent_at).toEqual(OPEN);
      // The first send's answer, late: it was that decision's, which is over, so it writes nothing.
      clock.set(OPEN.add({ seconds: SEND_LEASE_SECONDS + 1 }));
      const stale = await answerDelivery(inside(tx), clock, claimed.id, decided, {
        kind: "refused",
        status: 400,
        reason: "BadTopic",
      });
      expect(stale.answered).toBe("lost");
      expect(await deliveryTo(tx, w.day, ben)).toMatchObject({ state: "sent", outcome: null });
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
      await passAt(tx, sender, keptUntil.subtract({ microseconds: 1 }));
      expect(await deliveries(tx, w.day)).toHaveLength(1);
      await passAt(tx, sender, keptUntil);
      expect(await deliveries(tx, w.day)).toEqual([]);
      expect(await tx`SELECT 1 FROM app.push_days WHERE occurrence_id = ${w.day}`).toHaveLength(0);
    });
  });
});
