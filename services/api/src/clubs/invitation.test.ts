/// <reference lib="esnext.temporal" />
// The invitation's three routes and the roster's two decisions as the contract has them (the contract's
// `previewInvitationWeb`, `previewInvitation`, `acceptInvitation`, `approveRoster` and `declineRoster`; T7,
// T14, T19, T33, T52, T55), with no database: the serializers' field lists, held against every example the
// contract gives, read from the contract and not copied by hand; everything refused before a command
// runs; what each route answers; and that a token is in no log line. The commands, their receipts and the
// reads are on Postgres (tests/src/db/accept-roster.test.ts), and every role's answers are the privacy
// matrix's (tests/src/privacy/invitation.ts).

import { InvitationAcceptance, InvitationPreview, RosterRevision, WebInvitationPreview } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import { Refused, type Acceptance, type Account, type Clock, type InvitationSight } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { invitationAcceptanceBody, invitationPreviewBody } from "./invitation.ts";
import { noStorage } from "../testing.ts";

type Body = Record<string, unknown>;

const clubOf = (club: Body) => ({
  id: club["id"] as string,
  name: club["name"] as string,
  timezone: club["timezone"] as string,
  membershipId: club["my_membership_id"] as string,
});

/** A contract example's InvitationPreview as the domain's read would hold it: the serializer's input. */
function sight(value: Body): InvitationSight {
  const state = value["state"] as InvitationSight["state"];
  if (state === "expired" || state === "full" || state === "did_not_go_ahead") {
    return { state, inviterName: value["inviter_name"] as string };
  }
  if (state === "joined") return { state, club: clubOf(value["club"] as Body) };
  const shown = {
    invitationId: value["invitation_id"] as string,
    inviterName: value["inviter_name"] as string,
    clubName: value["club_name"] as string,
    revisionId: value["revision_id"] as string,
    revisionVersion: value["revision_version"] as number,
    roster: (value["roster"] as { name: string; kind: "member" | "candidate"; is_you: boolean }[]).map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      isYou: entry.is_you,
    })),
  };
  if (state === "waiting") return { state, ...shown };
  // A sub-second expiry, to see it rounded down.
  return {
    state,
    ...shown,
    expiresAt: Temporal.Instant.from(value["expires_at"] as string).add({ milliseconds: 999 }),
  };
}

describe("the preview's serializer against the contract's examples (T55)", () => {
  const examples = Object.entries(successExamples("previewInvitation") ?? {});

  it("has the contract's scenes to hold: every state an invitation can be in", () => {
    expect(examples.map(([name]) => name)).toEqual([
      "open",
      "changed",
      "another_name",
      "waiting",
      "expired",
      "full",
      "did_not_go_ahead",
      "joined",
    ]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = invitationPreviewBody(sight(value));
    expect(made).toEqual(value);
    expect(InvitationPreview.safeParse(made).success).toBe(true);
  });

  it("sends names and nothing else of anyone: no id of a person, no photo, no decision", () => {
    const made = invitationPreviewBody(sight(examples[0]?.[1].value as Body));
    expect(Object.keys(made).sort()).toEqual([
      "club_name",
      "expires_at",
      "invitation_id",
      "inviter_name",
      "revision_id",
      "revision_version",
      "roster",
      "state",
    ]);
    for (const entry of made["roster"] as Body[]) expect(Object.keys(entry).sort()).toEqual(["is_you", "kind", "name"]);
    // Waiting has no expiry: the link is used.
    const waiting = invitationPreviewBody(sight(successExamples("previewInvitation")?.["waiting"]?.value as Body));
    expect(Object.keys(waiting)).not.toContain("expires_at");
  });
});

describe("the acceptance's serializer against the contract's examples (T55)", () => {
  const examples = Object.entries(successExamples("acceptInvitation") ?? {});

  it("has the contract's scenes to hold", () => {
    expect(examples.map(([name]) => name)).toEqual(["waiting", "joined", "another_name"]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const acceptance: Acceptance = {
      invitationId: value["invitation_id"] as string,
      state: value["state"] as Acceptance["state"],
      club: value["club"] === undefined ? null : clubOf(value["club"] as Body),
    };
    const made = invitationAcceptanceBody(acceptance);
    expect(made).toEqual(value);
    expect(InvitationAcceptance.strict().safeParse(made).success).toBe(true);
  });
});

const account: Account = {
  id: "acct_leila",
  state: "active",
  displayName: "Leila",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";
const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app whose transactions are `begin`: what the routes do with the database, with no database. */
async function appFor(
  begin: (...args: unknown[]) => Promise<unknown>,
  options: { lines?: string[]; signedIn?: boolean } = {},
) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  let asked = 0;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => {
      asked += 1;
      return Promise.resolve(options.signedIn === false ? null : account);
    },
    storage: noStorage,
    log:
      options.lines === undefined
        ? { level: "silent" }
        : { level: "trace", stream: { write: (line) => void options.lines?.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  const answer = async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
  return Object.assign(answer, { asked: () => asked });
}

const invalid = (field?: string) => ({
  status: 400,
  body: field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
});
const post = (url: string, payload: string, key: string | null = KEY): InjectOptions => ({
  method: "POST",
  url,
  headers: { "content-type": "application/json", ...(key === null ? {} : { "idempotency-key": key }) },
  payload,
});
const WEB = "/v1/invitations/web-preview";
const PREVIEW = "/v1/invitations/preview";
const ACCEPT = "/v1/invitations/accept";
const APPROVE = "/v1/rosters/rev_1/approvals";
const DECLINE = "/v1/rosters/rev_1/declines";
const HELD = `{"token":"${TOKEN}"}`;
const ACCEPTING = `{"token":"${TOKEN}","revision_id":"rev_1","expected_version":1}`;
const DECIDING = '{"expected_version":1}';
const none = () => {
  let begun = 0;
  return {
    begin: () => {
      begun += 1;
      return Promise.reject(new Error("no database"));
    },
    begun: () => begun,
  };
};
const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };

describe("what the five routes refuse before any transaction", () => {
  it("names the Idempotency-Key of an acceptance or a decision when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const url of [ACCEPT, APPROVE, DECLINE]) {
      for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
        const got = await answer(post(url, '{"token":7}', key));
        expect(got, `${url} ${String(key)}`).toMatchObject(invalid("Idempotency-Key"));
        expect(got.headers["cache-control"]).toBe("private, no-store");
      }
    }
    expect(db.begun()).toBe(0);
  });

  it("names a bad token, never its value, on the page's route, the app's and on accepting, and reads no database for it", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const tokens: unknown[] = [
      undefined,
      "",
      "A".repeat(42),
      "A".repeat(129),
      `${"A".repeat(42)}=`,
      `${"A".repeat(42)}+`,
      `${"A".repeat(40)} AA`,
      7,
      null,
      [TOKEN],
    ];
    for (const url of [WEB, PREVIEW, ACCEPT]) {
      for (const token of tokens) {
        const payload = { ...(token === undefined ? {} : { token }), revision_id: "rev_1", expected_version: 1 };
        const sent = url === ACCEPT ? payload : token === undefined ? {} : { token };
        const got = await answer(post(url, JSON.stringify(sent)));
        expect(got, `${url} ${JSON.stringify(token)}`).toMatchObject(invalid("token"));
        expect(got.body).not.toMatch(/AAA/);
      }
      // An unknown key is no field of the contract's: refused, and never named or echoed.
      for (const payload of [{ token: TOKEN, email: "leila@example.com" }, [], null, "text"]) {
        const got = await answer(post(url, JSON.stringify(payload)));
        if (url === ACCEPT && !Array.isArray(payload) && payload !== null && typeof payload === "object") {
          expect(got).toMatchObject(invalid("revision_id"));
        } else {
          expect(got, `${url} ${JSON.stringify(payload)}`).toMatchObject(invalid());
        }
        expect(got.body).not.toMatch(/example|text|q7Vb/);
      }
    }
    expect(db.begun()).toBe(0);
  });

  it("names an acceptance's and a decision's first bad field in the contract's order", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const accepting: [unknown, string | undefined][] = [
      [{ token: TOKEN }, "revision_id"],
      [{ token: TOKEN, revision_id: "rev 1", expected_version: 1 }, "revision_id"],
      [{ token: TOKEN, revision_id: "r".repeat(65), expected_version: 1 }, "revision_id"],
      [{ token: TOKEN, revision_id: "rev_1" }, "expected_version"],
      [{ token: TOKEN, revision_id: "rev_1", expected_version: -1 }, "expected_version"],
      [{ token: TOKEN, revision_id: "rev_1", expected_version: 1.5 }, "expected_version"],
      [{ token: TOKEN, revision_id: "rev_1", expected_version: "1" }, "expected_version"],
      // The contract's order, not the body's.
      [{ expected_version: -1, revision_id: "", token: "" }, "token"],
      [{ token: TOKEN, revision_id: "rev_1", expected_version: 1, name: "Leila" }, undefined],
    ];
    for (const [payload, field] of accepting) {
      const got = await answer(post(ACCEPT, JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/q7Vb|rev_1|rev 1|rrr|Leila/);
    }
    const deciding: [unknown, string | undefined][] = [
      [{}, "expected_version"],
      [{ expected_version: -1 }, "expected_version"],
      [{ expected_version: 1.5 }, "expected_version"],
      [{ expected_version: "1" }, "expected_version"],
      [{ expected_version: 1, decision: "approved" }, undefined],
      [[], undefined],
      [null, undefined],
    ];
    for (const url of [APPROVE, DECLINE]) {
      for (const [payload, field] of deciding) {
        expect(await answer(post(url, JSON.stringify(payload))), `${url} ${JSON.stringify(payload)}`).toMatchObject(
          invalid(field),
        );
      }
    }
    expect(db.begun()).toBe(0);
  });

  it("refuses a body past each route's limit unread, and takes the largest body the contract allows", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const escape = (text: string): string =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    const longest = "A".repeat(128);
    const largestHeld = `{${escape("token")}:${escape(longest)}}`;
    const largestAccepting = `{${escape("token")}:${escape(longest)},${escape("revision_id")}:${escape("r".repeat(64))},${escape("expected_version")}:2147483647}`;
    const largestDeciding = `{${escape("expected_version")}:2147483647}`;
    let reached = 0;
    for (const [url, operation, limit, good, largest] of [
      [WEB, "previewInvitationWeb", 2 * 1024, HELD, largestHeld],
      [PREVIEW, "previewInvitation", 2 * 1024, HELD, largestHeld],
      [ACCEPT, "acceptInvitation", 3 * 1024, ACCEPTING, largestAccepting],
      [APPROVE, "approveRoster", 1024, DECIDING, largestDeciding],
      [DECLINE, "declineRoster", 1024, DECIDING, largestDeciding],
    ] as const) {
      expect(bodyLimitOf(operation)).toBe(limit);
      expect(limit).toBeLessThan(BODY_LIMIT);
      const sized = (bytes: number) => `${good.slice(0, -1)}${" ".repeat(bytes - good.length)}}`;
      expect(Buffer.byteLength(sized(limit))).toBe(limit);
      expect(await answer(post(url, sized(limit)))).toMatchObject({ status: 500, body: "" });
      reached += 1;
      expect(db.begun()).toBe(reached);
      for (const bytes of [limit + 1, BODY_LIMIT + 1]) {
        expect(await answer(post(url, sized(bytes))), `${operation} ${String(bytes)}`).toMatchObject(invalid());
      }
      expect(db.begun()).toBe(reached);
      expect(Buffer.byteLength(largest)).toBeLessThan(limit / 2);
      expect(await answer(post(url, largest)), operation).toMatchObject({ status: 500, body: "" });
      reached += 1;
      expect(db.begun()).toBe(reached);
    }
  });
});

describe("what the five routes answer", () => {
  it("answers the signed-out page with the inviter's name and nothing else, with no session asked for (T7)", async () => {
    const answer = await appFor(() => Promise.resolve({ inviterName: "Ben" }), { signedIn: false });
    const got = await answer(post(WEB, HELD, null));
    expect(got.status).toBe(200);
    expect(got.body).toBe('{"inviter_name":"Ben"}');
    expect(WebInvitationPreview.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    expect(got.headers).toMatchObject(headers);
    expect(answer.asked()).toBe(0);
    // The app's preview and accepting need a session.
    expect((await answer(post(PREVIEW, HELD))).status).toBe(401);
    expect((await answer(post(ACCEPT, ACCEPTING))).status).toBe(401);
    expect((await answer(post(APPROVE, DECIDING))).status).toBe(401);
  });

  it("answers the neutral not-found when a token names nothing, on the page and in the app (T14, FQ59)", async () => {
    const answer = await appFor(() => Promise.resolve(null));
    for (const url of [WEB, PREVIEW]) {
      const got = await answer(post(url, HELD));
      expect(got).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}' });
      expect(got.headers["cache-control"]).toBe("private, no-store");
    }
  });

  it("answers a preview with 200 and the state as the read gave it", async () => {
    const value = successExamples("previewInvitation")?.["open"]?.value as Body;
    const answer = await appFor(() => Promise.resolve(sight(value)));
    const got = await answer(post(PREVIEW, HELD));
    expect(got.status).toBe(200);
    expect(JSON.parse(got.body)).toEqual(value);
    expect(got.headers).toMatchObject(headers);
  });

  it("answers an acceptance and a decision with 200 and what the command gave", async () => {
    const accepted = successExamples("acceptInvitation")?.["joined"]?.value as Body;
    const got = await (await appFor(() => Promise.resolve(accepted)))(post(ACCEPT, ACCEPTING));
    expect(got.status).toBe(200);
    expect(JSON.parse(got.body)).toEqual(accepted);
    expect(got.headers).toMatchObject(headers);
    for (const [url, operation, scene] of [
      [APPROVE, "approveRoster", "approved"],
      [DECLINE, "declineRoster", "declined"],
    ] as const) {
      const revision = successExamples(operation)?.[scene]?.value as Body;
      expect(RosterRevision.strict().safeParse(revision).success).toBe(true);
      const decided = await (await appFor(() => Promise.resolve(revision)))(post(url, DECIDING));
      expect(decided.status).toBe(200);
      expect(JSON.parse(decided.body)).toEqual(revision);
    }
  });

  it("answers each refusal as the contract's error, with nothing of the request in it", async () => {
    const requests: [string, InjectOptions, readonly (readonly [string, number, string])[]][] = [
      [
        "acceptInvitation",
        post(ACCEPT, ACCEPTING),
        [
          ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
          ["INVITATION_EXPIRED", 410, '{"code":"INVITATION_EXPIRED"}'],
          ["CLUB_FULL", 409, '{"code":"CLUB_FULL"}'],
          ["IDEMPOTENCY_CONFLICT", 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
          ["UNAUTHENTICATED", 401, '{"code":"UNAUTHENTICATED"}'],
        ],
      ],
      [
        "approveRoster",
        post(APPROVE, DECIDING),
        [
          ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
          ["CLUB_FULL", 409, '{"code":"CLUB_FULL"}'],
          ["IDEMPOTENCY_CONFLICT", 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
        ],
      ],
      ["declineRoster", post(DECLINE, DECIDING), [["NOT_FOUND", 404, '{"code":"NOT_FOUND"}']]],
    ];
    for (const [operation, request, refusals] of requests) {
      for (const [code, status, body] of refusals) {
        const answer = await appFor(() => Promise.reject(new Refused(code)));
        expect(await answer(request), `${operation} ${code}`).toMatchObject({ status, body });
      }
      const stale = await appFor(() => Promise.reject(new Refused("VERSION_CONFLICT", { current_version: 2 })));
      expect(await stale(request)).toMatchObject({
        status: 409,
        body: '{"code":"VERSION_CONFLICT","current_version":2}',
      });
      const changed = await appFor(() => Promise.reject(new Refused("ROSTER_CHANGED", { current_id: "rev_2" })));
      expect(await changed(request)).toMatchObject({
        status: 409,
        body: '{"code":"ROSTER_CHANGED","current_id":"rev_2"}',
      });
    }
  });

  it("logs the token in no line, whatever the route answers (T52)", async () => {
    const lines: string[] = [];
    for (const begin of [
      () => Promise.resolve(null),
      () => Promise.reject(new Refused("NOT_FOUND")),
      () => Promise.reject(new Error(`no database for ${TOKEN}`)),
    ]) {
      const answer = await appFor(begin, { lines });
      await answer(post(WEB, HELD));
      await answer(post(PREVIEW, HELD));
      await answer(post(ACCEPT, ACCEPTING));
      await answer(post(ACCEPT, `{"token":"${TOKEN}"}`));
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toContain(TOKEN);
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    for (const request of [
      post(WEB, HELD),
      post(PREVIEW, HELD),
      post(ACCEPT, ACCEPTING),
      post(APPROVE, DECIDING),
      post(DECLINE, DECIDING),
    ]) {
      expect(await answer(request)).toMatchObject({ status: 500, body: "" });
    }
  });
});
