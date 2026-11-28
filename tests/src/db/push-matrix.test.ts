/// <reference lib="esnext.temporal" />
// The reveal push across the privacy matrix (docs/plans/api-b2-spike-push.md, section 2.6; spec 21; T9, T36, T37, T52;
// TECH-DESIGN section 8): every role of the matrix, in each of its states of Ben's drop and at each phase of the day,
// with a phone of the viewer's registered, through the worker's whole pass (services/worker/src/push.ts). The viewer is
// told only when the role reads the drop, the state denies nothing, and the day is open; and every push that goes holds
// the day's words, its club and its id, and nothing of the drop: no caption, no media, no URL, no provider id, no
// source, no drop or upload id (T37, T52). Each state and phase runs twice: once through the plan, and once with the
// day planned already for every phone, the viewer's among them, as a plan made before the role or the state came would
// leave it, so the dispatch's own recheck is held to the same answer.
//
// The roles, states and phases are the privacy matrix's (../matrix.ts), which the read predicate's own test on rows
// (authorization.test.ts) and the matrix over the API's routes share, so the three can't drift apart. Each role is one
// rolled-back world; each state and phase is a savepoint undone after it, with every other day set aside, as in
// worker-push.test.ts. Ana, Ben and Cleo each have a phone from the start, registered by a row written as `registerDevice`
// writes it, so a role that changes one of them keeps that phone; any other viewer registers one once made, unless the
// schema refuses it, as it does an unfinished profile's (FQ69), whose viewer is then told nothing, with no phone to tell.

import { randomBytes } from "node:crypto";
import { STAR_BODY } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { pushPass, type ApnsOutcome, type ApnsPush, type ApnsSender, type WorkerSql } from "@tadayo/worker";
import { afterAll, describe, expect, it } from "vitest";
import { PHASES, REVEAL, CLOSE, ROLES, STATES, type Phase } from "../matrix.ts";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { AT, checkAsAtCommit, commitDrop, newWorld, type World } from "./world.ts";

const db = worldSql(4);
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
/** A caption no push may carry, in any part. */
const CAPTION = `caption-${randomBytes(6).toString("hex")}`;

async function undone(tx: WorldTx, body: (sp: WorldTx) => Promise<void>): Promise<void> {
  class Undo extends Error {}
  try {
    await tx.savepoint(async (sp) => {
      await body(sp);
      throw new Undo();
    });
  } catch (error) {
    if (!(error instanceof Undo)) throw error;
  }
}

function inside(tx: WorldTx): WorkerSql {
  return { begin: (fn: (sp: WorldTx) => Promise<unknown>) => tx.savepoint(fn) } as unknown as WorkerSql;
}

class FakeSender implements ApnsSender {
  readonly pushes: ApnsPush[] = [];
  send(push: ApnsPush): Promise<ApnsOutcome> {
    this.pushes.push(push);
    return Promise.resolve({ kind: "sent" });
  }
  close(): void {
    // Nothing to close.
  }
}

/** What a push may hold beyond its words: the club's and the day's ids, the deep link's names, APNs' own keys. */
function payloadProblems(push: ApnsPush, w: World, drop: string, tokens: readonly string[]): string[] {
  const problems: string[] = [];
  const payload: unknown = JSON.parse(push.payload);
  const body = (payload as { aps?: { alert?: { body?: unknown } } }).aps?.alert?.body;
  const words = [STAR_BODY, "Ana’s day is ready"];
  if (typeof body !== "string" || !words.includes(body)) problems.push(`its body is ${JSON.stringify(body)}`);
  const expected = {
    aps: { alert: { body }, sound: "default", "thread-id": w.club },
    tadayo: { open: "day", club_id: w.club, occurrence_id: w.day },
  };
  if (JSON.stringify(payload) !== JSON.stringify(expected)) problems.push(`it holds ${push.payload}`);
  for (const needle of [CAPTION, drop, ...tokens, "http", "upl_", "src_", "uploads/", "tiktok"]) {
    if (push.payload.includes(needle)) problems.push(`it holds ${needle}`);
  }
  if (push.collapseId !== w.day) problems.push(`its collapse id is ${push.collapseId}`);
  if (push.expiresAt !== EXPIRES.epochMilliseconds / 1000) problems.push(`it expires at ${String(push.expiresAt)}`);
  return problems;
}

/** Until when Apple may deliver a push sent at the reveal to a phone in Tokyo: 23:00 there, or the close if earlier. */
const TOKYO_NIGHT = REVEAL.toZonedDateTimeISO("Asia/Tokyo")
  .with({ hour: 23, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
  .toInstant();
const EXPIRES = Temporal.Instant.compare(TOKYO_NIGHT, CLOSE) < 0 ? TOKYO_NIGHT : CLOSE;

describe("the reveal push: every role of the privacy matrix, in each state, before, during and after the day", () => {
  for (const role of ROLES) {
    it(`tells the ${role.name} only when the role reads the drop and the day is open, and nothing of the drop`, async () => {
      const wrong: string[] = [];
      let checked = 0;
      await rolledBack(db, async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await commitDrop(plain(tx), w, w.ben, { caption: CAPTION, at: AT.added });
        await checkAsAtCommit(plain(tx));
        // Each phone is in Tokyo: 16:00 at the reveal and 10:00 at the close, so no quiet hours hold it.
        const phones = new Map<string, string>();
        const signIns = new Map<string, Buffer>();
        const phone = async (sql: WorldTx, user: string) => {
          const token = randomBytes(32).toString("hex");
          const signIn = randomBytes(32);
          await sql`
            INSERT INTO app.device_registrations (sign_in, user_id, apns_token, apns_environment, timezone, registered_at)
            VALUES (${signIn}, ${user}, ${token}, 'production', 'Asia/Tokyo', ${AT.added})`;
          phones.set(user, token);
          signIns.set(user, signIn);
        };
        for (const member of [w.ana, w.ben, w.cleo]) await phone(tx, member.user);
        const viewer = await role.make(tx, w);
        await checkAsAtCommit(plain(tx));
        if (!phones.has(viewer)) {
          try {
            await tx.savepoint((sp) => phone(sp, viewer));
          } catch (error) {
            // Only an account that may not register is left with no phone.
            expect(String(error)).toMatch(/a device is registered only for an active account with a finished profile/);
            expect(role.session).toBe("unfinished");
          }
        }
        const token = phones.get(viewer);
        const clock = fakeClock(REVEAL);
        for (const state of STATES) {
          for (const [phase, instant] of Object.entries(PHASES) as [Phase, Temporal.Instant][]) {
            if (role.phases && !role.phases.includes(phase)) continue;
            for (const way of ["planned by the pass", "planned for every phone before"] as const) {
              await undone(tx, async (sp) => {
                await state.make(sp, w, drop);
                await sp`
                  INSERT INTO app.push_days (occurrence_id, planned_at)
                  SELECT id, ${REVEAL} FROM app.occurrences WHERE id <> ${w.day}
                  ON CONFLICT (occurrence_id) DO NOTHING`;
                await sp`
                  UPDATE app.push_deliveries SET state = 'skipped', outcome = 'test.aside', finished_at = ${REVEAL},
                         lease_until = NULL
                   WHERE state IN ('pending', 'sending') AND occurrence_id <> ${w.day}`;
                if (way === "planned for every phone before") {
                  // As a plan made while every phone's holder read the drop leaves the day: a delivery to each phone,
                  // due at the reveal, so only the dispatch's recheck stands between it and the phone.
                  await sp`INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${w.day}, ${REVEAL})`;
                  for (const [user, signIn] of signIns) {
                    await sp`
                      INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, due_at, planned_at)
                      VALUES (${`psh_${randomBytes(12).toString("base64url")}`}, ${w.day}, ${user}, ${signIn},
                              ${REVEAL}, ${REVEAL})`;
                  }
                }
                const sender = new FakeSender();
                clock.set(instant);
                await pushPass(inside(sp), clock, sender);
                const expected = role.reads && !state.denies && phase === "open" ? 1 : 0;
                const mine = sender.pushes.filter((push) => push.token === token);
                checked += 1;
                if (mine.length !== expected) {
                  wrong.push(
                    `${state.name}, ${phase}, ${way}: expected ${String(expected)} push to the viewer, got ${String(mine.length)}`,
                  );
                }
                // Nobody else is told on a day that isn't open, or of a drop the state takes from everyone.
                if ((phase !== "open" || state.denies) && sender.pushes.length > 0) {
                  wrong.push(`${state.name}, ${phase}, ${way}: ${String(sender.pushes.length)} pushes went`);
                }
                for (const push of sender.pushes) {
                  for (const problem of payloadProblems(push, w, drop, [...phones.values()])) {
                    wrong.push(`${state.name}, ${phase}, ${way}: ${problem}`);
                  }
                }
              });
            }
          }
        }
      });
      expect(wrong).toEqual([]);
      expect(checked).toBe(2 * STATES.length * (role.phases ?? Object.keys(PHASES)).length);
    });
  }
});
