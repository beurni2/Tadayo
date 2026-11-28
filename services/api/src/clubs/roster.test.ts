/// <reference lib="esnext.temporal" />
// The roster routes as the contract has them (the contract's `proposeRoster`, `getRosterRevision`,
// `createInvitation`, `revokeInvitation` and `removeCandidate`; T7, T14, T19, T33, T52, T55), with no database: the
// serializers' field lists, held against every example the contract gives, read from the contract and not
// copied by hand; everything refused before a command runs; and what each route answers. The commands,
// their receipts and the read are on Postgres (tests/src/db/propose-roster.test.ts, invitation.test.ts and
// remove-candidate.test.ts), and every role's answers are the privacy matrix's (tests/src/privacy/roster.ts).

import { InvitationLink, RemovedCandidate, RevokedInvitation, RosterRevision } from "@tadayo/contracts";
// The examples aren't among the contract package's exports, and that package changes only in its own PR
// (docs/TECH-DESIGN.md section 3), so this test reads the file where it is.
import { successExamples } from "../../../../packages/contracts/src/fixtures/examples.ts";
import { Refused, type Account, type Clock, type MadeInvitation } from "@tadayo/domain";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, bodyLimitOf, buildApp, type Deps } from "../app.ts";
import type { ApiSql } from "../connection.ts";
import { revisionSight } from "./revision-example.ts";
import { invitationLinkBody, invitationUrl, rosterRevisionBody } from "./roster.ts";
import { noStorage } from "../testing.ts";

type Body = Record<string, unknown>;

describe("the roster revision's serializer against the contract's examples (T55)", () => {
  const examples = [
    ...Object.entries(successExamples("proposeRoster") ?? {}),
    ...Object.entries(successExamples("getRosterRevision") ?? {}),
  ];

  it("has the contract's scenes to hold: a proposal, and a revision as a member and as its proposer reads it in each of a link's states", () => {
    expect(examples.map(([name]) => name)).toEqual([
      "leila",
      "approve",
      "link_revoked",
      "link_expired",
      "accepted",
      "another_name",
      "another_name_proposer",
      "superseded",
    ]);
  });

  it.each(examples)("makes %s field for field", (_name, example) => {
    const value = example.value as Body;
    const made = rosterRevisionBody(revisionSight(value));
    expect(made).toEqual(value);
    expect(RosterRevision.strict().safeParse(made).success).toBe(true);
  });

  it("sends a link's expiry in whole seconds, rounded down, and no link, no avatar and no successor where there is none", () => {
    const ben = { membershipId: "mem_ben", displayName: "Ben", avatarVersion: null };
    const made = rosterRevisionBody({
      id: "rev_1",
      version: 1,
      club: { id: "club_1", name: "Kitchen table", timezone: "America/New_York", membershipId: "mem_ben" },
      state: "open",
      proposedBy: ben,
      members: [ben],
      candidates: [
        {
          id: "cand_1",
          name: "Leila",
          proposedBy: ben,
          invitation: { id: "inv_1", state: "live", expiresAt: Temporal.Instant.from("2026-11-13T14:41:00.999999Z") },
        },
        { id: "cand_2", name: "Sam", proposedBy: ben, invitation: null },
      ],
      myDecision: "approved",
      supersededBy: null,
    });
    expect(made).toEqual({
      id: "rev_1",
      version: 1,
      club: { id: "club_1", name: "Kitchen table", timezone: "America/New_York", my_membership_id: "mem_ben" },
      state: "open",
      proposed_by: { membership_id: "mem_ben", display_name: "Ben" },
      members: [{ membership_id: "mem_ben", display_name: "Ben" }],
      candidates: [
        {
          id: "cand_1",
          name: "Leila",
          proposed_by: { membership_id: "mem_ben", display_name: "Ben" },
          invitation: { id: "inv_1", state: "live", expires_at: "2026-11-13T14:41:00Z" },
        },
        { id: "cand_2", name: "Sam", proposed_by: { membership_id: "mem_ben", display_name: "Ben" } },
      ],
      my_decision: "approved",
    });
  });
});

describe("the link's serializer against the contract's examples (T55, FQ77)", () => {
  const examples = successExamples("createInvitation") ?? {};
  const link = examples["link"]?.value as Body;
  const replayed = examples["replayed"]?.value as Body;

  it("stores the answer without the link, which is the contract's replay, and adds the link to the first answer alone", () => {
    const stored = invitationLinkBody({
      invitationId: link["invitation_id"] as string,
      candidateId: link["candidate_id"] as string,
      expiresAt: Temporal.Instant.from(link["expires_at"] as string).add({ milliseconds: 999 }),
    });
    expect(stored).toEqual(replayed);
    expect(Object.keys(stored).sort()).toEqual(["candidate_id", "expires_at", "invitation_id"]);
    const token = (link["url"] as string).split("#")[1] ?? "";
    expect({ ...stored, url: invitationUrl(token) }).toEqual(link);
    expect(InvitationLink.strict().safeParse({ ...stored, url: invitationUrl(token) }).success).toBe(true);
    expect(InvitationLink.strict().safeParse(stored).success).toBe(true);
  });

  it("puts the token in the fragment, which reaches no server (T7, T52)", () => {
    const url = new URL(invitationUrl("q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM"));
    expect([url.origin, url.pathname, url.search, url.hash]).toEqual([
      "https://tadayo.app",
      "/i",
      "",
      "#q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM",
    ]);
  });
});

const account: Account = {
  id: "acct_ben",
  state: "active",
  displayName: "Ben",
  ageConfirmed: true,
  version: 3,
  avatarVersion: null,
};
const KEY = "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11";
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);
const open: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app for Ben whose transactions are `begin`: what the routes do with the database, with no database. */
async function appFor(begin: (...args: unknown[]) => Promise<unknown>, lines?: string[]) {
  const sql = { end: () => Promise.resolve(), begin } as unknown as ApiSql;
  const deps: Deps = {
    sql,
    clock: {} as Clock,
    authenticate: () => Promise.resolve(account),
    storage: noStorage,
    log:
      lines === undefined
        ? { level: "silent" }
        : { level: "trace", stream: { write: (line) => void lines.push(line) } },
  };
  const app = buildApp(deps);
  await app.ready();
  open.push(app);
  return async (request: InjectOptions) => {
    const response = await app.inject(request);
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !TRANSPORT.has(name)));
    return { status: response.statusCode, body: response.body, headers };
  };
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
const ROSTER = "/v1/clubs/club_1/roster";
const LINKS = "/v1/clubs/club_1/invitations";
const PROPOSAL = '{"expected_roster_version":0,"add":[{"label":"Leila"}]}';
const LINK = '{"candidate_id":"cand_1"}';
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

describe("what proposeRoster and createInvitation refuse before any transaction", () => {
  it("names the Idempotency-Key when it is missing or isn't a UUID, whatever else is wrong", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    for (const url of [ROSTER, LINKS]) {
      for (const key of [null, "", "abc", `${KEY}0`, `${KEY}, ${KEY}`]) {
        const got = await answer(post(url, '{"add":7}', key));
        expect(got, `${url} ${String(key)}`).toMatchObject(invalid("Idempotency-Key"));
        expect(got.headers["cache-control"]).toBe("private, no-store");
      }
    }
    expect(db.begun()).toBe(0);
  });

  it("names a proposal's first bad field in the contract's order, never a value, and reads no database for it", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const add = [{ label: "Leila" }];
    const cases: [unknown, string | undefined][] = [
      [{}, "expected_roster_version"],
      [{ add }, "expected_roster_version"],
      [{ expected_roster_version: -1, add }, "expected_roster_version"],
      [{ expected_roster_version: 1.5, add }, "expected_roster_version"],
      [{ expected_roster_version: "0", add }, "expected_roster_version"],
      [{ expected_roster_version: 0 }, "add"],
      [{ expected_roster_version: 0, add: [] }, "add"],
      [{ expected_roster_version: 0, add: Array.from({ length: 6 }, () => ({ label: "Leila" })) }, "add"],
      [{ expected_roster_version: 0, add: [{ label: "" }] }, "add"],
      [{ expected_roster_version: 0, add: [{ label: " Leila" }] }, "add"],
      [{ expected_roster_version: 0, add: [{ label: "a".repeat(41) }] }, "add"],
      [{ expected_roster_version: 0, add: [{ label: "Lei\nla" }] }, "add"],
      [{ expected_roster_version: 0, add: [{ label: "A\ud800B" }] }, "add"],
      [{ expected_roster_version: 0, add: [{ label: "Leila", email: "leila@example.com" }] }, "add"],
      [{ expected_roster_version: 0, add: [{}] }, "add"],
      [{ expected_roster_version: 0, add: ["Leila"] }, "add"],
      // The contract's order, not the body's.
      [{ add: [], expected_roster_version: -1 }, "expected_roster_version"],
      // An unknown key is no field of the contract's: refused, and never named or echoed.
      [{ expected_roster_version: 0, add, members: ["Maya"] }, undefined],
      [[], undefined],
      [null, undefined],
      ["text", undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(ROSTER, JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      expect(got.body).not.toMatch(/Leila|Maya|example|text/);
    }
    expect(db.begun()).toBe(0);
  });

  it("names a link request's bad candidate, never its value, and reads no database for it", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const cases: [unknown, string | undefined][] = [
      [{}, "candidate_id"],
      [{ candidate_id: "" }, "candidate_id"],
      [{ candidate_id: "cand 1" }, "candidate_id"],
      [{ candidate_id: "c".repeat(65) }, "candidate_id"],
      [{ candidate_id: 7 }, "candidate_id"],
      [{ candidate_id: "cand_1", label: "Leila" }, undefined],
      [[], undefined],
      [null, undefined],
    ];
    for (const [payload, field] of cases) {
      const got = await answer(post(LINKS, JSON.stringify(payload)));
      expect(got, JSON.stringify(payload)).toMatchObject(invalid(field));
      // The field's name is the contract's; no value sent is in the answer.
      expect(got.body).not.toMatch(/cand_1|cand 1|ccc|Leila/);
    }
    expect(db.begun()).toBe(0);
  });

  it("refuses a body past each route's limit unread, and takes the largest body the contract allows", async () => {
    const db = none();
    const answer = await appFor(db.begin);
    const escape = (text: string): string =>
      `"${Array.from({ length: text.length }, (_, index) => `\\u${text.charCodeAt(index).toString(16).padStart(4, "0")}`).join("")}"`;
    // A label of forty clusters of sixteen code points, each outside the Basic Multilingual Plane.
    const label = `\u{1F3F4}${"\u{E0067}".repeat(15)}`.repeat(40);
    const largestProposal = `{${escape("expected_roster_version")}:2147483647,${escape("add")}:[${Array.from(
      { length: 5 },
      () => `{${escape("label")}:${escape(label)}}`,
    ).join(",")}]}`;
    const largestLink = `{${escape("candidate_id")}:${escape("c".repeat(64))}}`;
    let reached = 0;
    for (const [url, operation, limit, good, largest] of [
      [ROSTER, "proposeRoster", 80 * 1024, PROPOSAL, largestProposal],
      [LINKS, "createInvitation", 1024, LINK, largestLink],
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

describe("what the roster routes answer", () => {
  const revision = successExamples("proposeRoster")?.["leila"]?.value as Body;
  const stored = { invitation_id: "inv_1", candidate_id: "cand_1", expires_at: "2026-11-13T14:41:00Z" };
  const TOKEN = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM";
  const headers = { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" };

  it("answers a proposal with 201 and the revision as the command gave it", async () => {
    const answer = await appFor(() => Promise.resolve(revision));
    const got = await answer(post(ROSTER, PROPOSAL));
    expect(got.status).toBe(201);
    expect(JSON.parse(got.body)).toEqual(revision);
    expect(got.headers).toMatchObject(headers);
  });

  it("answers a first link with 201 and its URL, a replay without one, and logs the token in neither (T52, FQ77)", async () => {
    const lines: string[] = [];
    const first: MadeInvitation = { answer: stored, token: TOKEN };
    const made = await (await appFor(() => Promise.resolve(first), lines))(post(LINKS, LINK));
    expect(made.status).toBe(201);
    expect(JSON.parse(made.body)).toEqual({ ...stored, url: `https://tadayo.app/i#${TOKEN}` });
    expect(InvitationLink.strict().safeParse(JSON.parse(made.body)).success).toBe(true);
    expect(made.headers).toMatchObject(headers);

    const replay: MadeInvitation = { answer: stored, token: null };
    const again = await (await appFor(() => Promise.resolve(replay), lines))(post(LINKS, LINK));
    expect(again.status).toBe(201);
    expect(JSON.parse(again.body)).toEqual(stored);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toContain(TOKEN);
  });

  it("answers a revoke with 200 and the link's id, with no key and no body", async () => {
    const answer = await appFor(() => Promise.resolve({ invitationId: "inv_1" }));
    const got = await answer({ method: "DELETE", url: "/v1/invitations/inv_1" });
    expect(got.status).toBe(200);
    expect(JSON.parse(got.body)).toEqual({ invitation_id: "inv_1", state: "revoked" });
    expect(RevokedInvitation.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    expect(got.headers).toMatchObject(headers);
  });

  it("answers a removal with 200 and the candidate's id, with no key and no body (FQ148)", async () => {
    const answer = await appFor(() => Promise.resolve({ candidateId: "cand_1" }));
    const got = await answer({ method: "DELETE", url: "/v1/candidates/cand_1" });
    expect(got.status).toBe(200);
    expect(JSON.parse(got.body)).toEqual({ candidate_id: "cand_1", state: "removed" });
    expect(RemovedCandidate.strict().safeParse(JSON.parse(got.body)).success).toBe(true);
    expect(got.headers).toMatchObject(headers);
  });

  it("answers the neutral not-found when the read finds no revision, and never a 200 with an empty body (T14)", async () => {
    const answer = await appFor(() => Promise.resolve(null));
    const got = await answer({ method: "GET", url: "/v1/rosters/rev_1" });
    expect(got).toMatchObject({ status: 404, body: '{"code":"NOT_FOUND"}' });
    expect(got.headers["cache-control"]).toBe("private, no-store");
  });

  it("answers each refusal as the contract's error, with nothing of the request in it", async () => {
    const requests: [string, InjectOptions, readonly (readonly [string, number, string])[]][] = [
      [
        "proposeRoster",
        post(ROSTER, PROPOSAL),
        [
          ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
          ["CLUB_FULL", 409, '{"code":"CLUB_FULL"}'],
          ["IDEMPOTENCY_CONFLICT", 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
        ],
      ],
      [
        "createInvitation",
        post(LINKS, LINK),
        [
          ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
          ["NOT_ALLOWED", 403, '{"code":"NOT_ALLOWED"}'],
          ["IDEMPOTENCY_CONFLICT", 409, '{"code":"IDEMPOTENCY_CONFLICT"}'],
        ],
      ],
      [
        "revokeInvitation",
        { method: "DELETE", url: "/v1/invitations/inv_1" },
        [
          ["NOT_FOUND", 404, '{"code":"NOT_FOUND"}'],
          ["NOT_ALLOWED", 403, '{"code":"NOT_ALLOWED"}'],
        ],
      ],
      [
        "removeCandidate",
        { method: "DELETE", url: "/v1/candidates/cand_1" },
        [["NOT_FOUND", 404, '{"code":"NOT_FOUND"}']],
      ],
    ];
    for (const [operation, request, refusals] of requests) {
      for (const [code, status, body] of refusals) {
        const answer = await appFor(() => Promise.reject(new Refused(code)));
        expect(await answer(request), `${operation} ${code}`).toMatchObject({ status, body });
      }
    }
    const answer = await appFor(() => Promise.reject(new Refused("VERSION_CONFLICT", { current_version: 4 })));
    expect(await answer(post(ROSTER, PROPOSAL))).toMatchObject({
      status: 409,
      body: '{"code":"VERSION_CONFLICT","current_version":4}',
    });
  });

  it("answers a database that failed with nothing", async () => {
    const answer = await appFor(() => Promise.reject(new Error("no database")));
    for (const request of [
      post(ROSTER, PROPOSAL),
      post(LINKS, LINK),
      { method: "DELETE", url: "/v1/invitations/inv_1" } as const,
      { method: "DELETE", url: "/v1/candidates/cand_1" } as const,
      { method: "GET", url: "/v1/rosters/rev_1" } as const,
    ]) {
      expect(await answer(request)).toMatchObject({ status: 500, body: "" });
    }
  });
});
