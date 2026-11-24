/// <reference lib="esnext.temporal" />
// The devices' judges, judged (./device.ts): each branch of what a cell must get from registerDevice and
// removeDevice, and of what each must change, is shown to refuse an answer or a set of rows that breaks it, on rows
// written out here by hand, with no database.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEVICE_JUDGED,
  DEVICE_NO_BODY,
  noContentProblems,
  registeredProblems,
  registerExpected,
  registerOutcome,
  removedProblems,
  removeExpected,
  removeOutcome,
  signInOf,
  type DeviceRequest,
  type DeviceRow,
  type DeviceRows,
} from "./device.ts";
import { NEUTRAL, pinned } from "./harness.ts";
import type { Answer } from "./scanner.ts";

/** Tuesday 24 November 2026, with a fraction the contract rounds down and the database keeps to the microsecond. */
const NOW = Temporal.Instant.from("2026-11-24T03:30:00.123456Z");
const NOW_US = "2026-11-24T03:30:00.123456Z";
const EARLIER = "2026-11-20T10:00:00.000000Z";
const [ANA, BEN] = ["acct_ana", "acct_ben"];
const [FIRST, SECOND, ANAS] = ["f".repeat(43), "s".repeat(43), "a".repeat(43)];
const TOKEN = "AB".repeat(32);

const row = (user: string, token: string, more: Partial<DeviceRow> = {}): DeviceRow => ({
  user,
  token: token.toLowerCase(),
  environment: "production",
  timezone: "Europe/London",
  registeredAt: EARLIER,
  ...more,
});
const rows = (registrations: [string, DeviceRow][] = [], ended: [string, string][] = []): DeviceRows => ({
  registrations: new Map(registrations),
  ended: new Map(ended),
});
const ask = (secret: string, token = TOKEN, more: Partial<DeviceRequest> = {}): DeviceRequest => ({
  secret,
  token,
  environment: "production",
  timezone: "europe/london",
  canonical: "Europe/London",
  ...more,
});
/** An answer the app sends whole, as a 200 with `body` and no-store. */
const ok = (body: unknown): Answer => pinned(200, "OK", JSON.stringify(body));
const judge = (expected: ReturnType<typeof registerExpected>, answer: Answer) =>
  typeof expected === "function" ? expected(answer) : answer.body === expected.body ? [] : ["not the pinned answer"];

/** Node's 204: Cache-Control, Date and Connection, the Date the answer's own time. */
function noContent(more: Partial<Answer> = {}): Answer {
  const at = Date.now();
  return {
    status: 204,
    reason: "No Content",
    headers: { "cache-control": "private, no-store", date: new Date(at).toUTCString(), connection: "keep-alive" },
    body: "",
    clock: { earliest: Math.floor(at / 1000) * 1000 - 1000, latest: at + 1000 },
    ...more,
  };
}

describe("the rows the devices' judges hold", () => {
  it("judges the two routes, and works out a sign-in as the server does: the secret's SHA-256 in hex", () => {
    expect([...DEVICE_JUDGED].sort()).toEqual(["registerDevice", "removeDevice"]);
    expect(signInOf(FIRST)).toBe(createHash("sha256").update(FIRST, "ascii").digest("hex"));
    expect(DEVICE_NO_BODY).toEqual(pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}'));
  });
});

describe("registerDevice's outcome and answer", () => {
  it("registers a new sign-in, and a sign-in of the viewer's own again", () => {
    expect(registerOutcome(rows(), BEN, ask(FIRST))).toMatchObject({ kind: "registered", moved: null });
    const own = rows([[signInOf(FIRST), row(BEN, "cd".repeat(32))]]);
    expect(registerOutcome(own, BEN, ask(FIRST))).toMatchObject({ kind: "registered", moved: null });
  });

  it("moves a token another sign-in holds, whatever its case and whoever's it is", () => {
    for (const holder of [ANA, BEN]) {
      const held = rows([[signInOf(SECOND), row(holder, TOKEN)]]);
      expect(registerOutcome(held, BEN, ask(FIRST, TOKEN.toLowerCase())), holder).toMatchObject({
        kind: "registered",
        moved: signInOf(SECOND),
      });
    }
  });

  it("refuses an ended sign-in and a secret whose registration is another account's", () => {
    expect(registerOutcome(rows([], [[signInOf(FIRST), EARLIER]]), BEN, ask(FIRST))).toEqual({ kind: "refused" });
    expect(registerOutcome(rows([[signInOf(ANAS), row(ANA, "cd".repeat(32))]]), BEN, ask(ANAS))).toEqual({
      kind: "refused",
    });
  });

  it("wants the registration as stored, in whole seconds, and refuses another field, a value or a status", () => {
    const outcome = registerOutcome(rows(), BEN, ask(FIRST));
    const expected = registerExpected(outcome, NOW);
    const want = { apns_environment: "production", timezone: "Europe/London", registered_at: "2026-11-24T03:30:00Z" };
    expect(judge(expected, ok(want))).toEqual([]);
    expect(judge(expected, ok({ ...want, timezone: "europe/london" }))).not.toEqual([]);
    expect(judge(expected, ok({ ...want, registered_at: "2026-11-24T03:30:00.123Z" }))).not.toEqual([]);
    expect(judge(expected, ok({ ...want, apns_token: TOKEN.toLowerCase() }))).not.toEqual([]);
    expect(judge(expected, pinned(201, "Created", JSON.stringify(want)))).not.toEqual([]);
    expect(registerExpected({ kind: "refused" }, NOW)).toBe(NEUTRAL);
  });
});

describe("what a registration must change", () => {
  const signIn = signInOf(FIRST);
  const want = row(BEN, TOKEN, { registeredAt: NOW_US });

  it("passes the registration as sent at the instant, and nothing else changed", () => {
    const before = rows([[signInOf(ANAS), row(ANA, "cd".repeat(32))]]);
    const after = rows([...before.registrations, [signIn, want]]);
    expect(registeredProblems(before, after, BEN, registerOutcome(before, BEN, ask(FIRST)), NOW)).toEqual([]);
  });

  it("refuses a registration missing, of another account, with the token as sent or another zone or time", () => {
    const outcome = registerOutcome(rows(), BEN, ask(FIRST));
    for (const got of [
      undefined,
      { ...want, user: ANA },
      { ...want, token: TOKEN },
      { ...want, timezone: "europe/london" },
      { ...want, environment: "sandbox" },
      { ...want, registeredAt: EARLIER },
    ]) {
      const after = rows(got === undefined ? [] : [[signIn, got]]);
      expect(registeredProblems(rows(), after, BEN, outcome, NOW), JSON.stringify(got)).not.toEqual([]);
    }
  });

  it("refuses a move that left the earlier sign-in its registration, or didn't end it at the instant", () => {
    const before = rows([[signInOf(SECOND), row(ANA, TOKEN)]]);
    const outcome = registerOutcome(before, BEN, ask(FIRST));
    const moved: [string, string] = [signInOf(SECOND), NOW_US];
    expect(registeredProblems(before, rows([[signIn, want]], [moved]), BEN, outcome, NOW)).toEqual([]);
    expect(
      registeredProblems(
        before,
        rows(
          [
            [signIn, want],
            [signInOf(SECOND), row(ANA, TOKEN)],
          ],
          [moved],
        ),
        BEN,
        outcome,
        NOW,
      ),
    ).not.toEqual([]);
    expect(registeredProblems(before, rows([[signIn, want]]), BEN, outcome, NOW)).not.toEqual([]);
    expect(
      registeredProblems(before, rows([[signIn, want]], [[signInOf(SECOND), EARLIER]]), BEN, outcome, NOW),
    ).not.toEqual([]);
  });

  it("refuses a registration that changed, made or ended another sign-in, or ended its own", () => {
    const other: [string, DeviceRow] = [signInOf(ANAS), row(ANA, "cd".repeat(32))];
    const before = rows([other]);
    const outcome = registerOutcome(before, BEN, ask(FIRST));
    for (const after of [
      rows([[signIn, want]]),
      rows([
        [signIn, want],
        [signInOf(ANAS), { ...other[1], timezone: "Asia/Tokyo" }],
      ]),
      rows([[signIn, want], other, [signInOf(SECOND), row(BEN, "ef".repeat(32))]]),
      rows([[signIn, want], other], [[signInOf(ANAS), NOW_US]]),
      rows([[signIn, want], other], [[signIn, NOW_US]]),
    ]) {
      expect(registeredProblems(before, after, BEN, outcome, NOW)).not.toEqual([]);
    }
  });

  it("refuses a refused registration that changed anything at all", () => {
    const before = rows([[signInOf(ANAS), row(ANA, TOKEN)]], [[signIn, EARLIER]]);
    expect(registeredProblems(before, before, BEN, { kind: "refused" }, NOW)).toEqual([]);
    for (const after of [
      rows(
        [
          [signInOf(ANAS), row(ANA, TOKEN)],
          [signIn, want],
        ],
        [[signIn, EARLIER]],
      ),
      rows([], [[signIn, EARLIER]]),
      rows([[signInOf(ANAS), row(ANA, TOKEN)]], [[signIn, NOW_US]]),
      rows([[signInOf(ANAS), row(ANA, TOKEN)]]),
    ]) {
      expect(registeredProblems(before, after, BEN, { kind: "refused" }, NOW)).not.toEqual([]);
    }
  });
});

describe("removeDevice's outcome, answer and change", () => {
  const signIn = signInOf(SECOND);

  it("removes a sign-in that has a registration, and finds nothing for one that has none or has ended", () => {
    expect(removeOutcome(rows([[signIn, row(BEN, TOKEN)]]), SECOND)).toBe("removed");
    expect(removeOutcome(rows(), SECOND)).toBe("none");
    expect(removeOutcome(rows([], [[signIn, EARLIER]]), SECOND)).toBe("none");
    expect(removeExpected("none")).toBe(NEUTRAL);
  });

  it("wants Node's 204 with nothing in it, and refuses a body, a type, another status or a stale Date", () => {
    const expected = removeExpected("removed");
    if (typeof expected !== "function") throw new Error("a removal's 204 is judged");
    expect(expected(noContent())).toEqual([]);
    expect(noContentProblems(noContent())).toEqual([]);
    expect(expected(noContent({ status: 200, reason: "OK" }))).not.toEqual([]);
    expect(expected(noContent({ body: "{}" }))).not.toEqual([]);
    expect(expected(NEUTRAL)).not.toEqual([]);
    const typed = noContent();
    expect(
      expected({ ...typed, headers: { ...typed.headers, "content-type": "application/json; charset=utf-8" } }),
    ).not.toEqual([]);
    expect(expected({ ...typed, headers: { ...typed.headers, "cache-control": "no-cache" } })).not.toEqual([]);
    expect(expected({ ...typed, headers: { ...typed.headers, date: "Thu, 01 Jan 2004 00:00:00 GMT" } })).not.toEqual(
      [],
    );
  });

  it("passes a removal that deleted the registration and ended the sign-in at the instant, or kept its first end", () => {
    const before = rows([[signIn, row(BEN, TOKEN)]]);
    expect(removedProblems(before, rows([], [[signIn, NOW_US]]), SECOND, NOW)).toEqual([]);
    const ended = rows([], [[signIn, EARLIER]]);
    expect(removedProblems(ended, ended, SECOND, NOW)).toEqual([]);
  });

  it("refuses a removal that kept the registration, didn't end the sign-in, ended it again, or touched another", () => {
    const other: [string, DeviceRow] = [signInOf(FIRST), row(BEN, "cd".repeat(32))];
    const before = rows([[signIn, row(BEN, TOKEN)], other]);
    for (const after of [
      rows([[signIn, row(BEN, TOKEN)], other], [[signIn, NOW_US]]),
      rows([other]),
      rows([other], [[signIn, EARLIER]]),
      rows([], [[signIn, NOW_US]]),
      rows(
        [other],
        [
          [signIn, NOW_US],
          [signInOf(FIRST), NOW_US],
        ],
      ),
    ]) {
      expect(removedProblems(before, after, SECOND, NOW)).not.toEqual([]);
    }
    const ended = rows([], [[signIn, EARLIER]]);
    expect(removedProblems(ended, rows([], [[signIn, NOW_US]]), SECOND, NOW)).not.toEqual([]);
  });
});
