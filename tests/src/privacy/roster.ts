/// <reference lib="esnext.temporal" />
// The roster's rows of the privacy matrix (B1's second slice: `proposeRoster`, `getRosterRevision`,
// `createInvitation` and `revokeInvitation`; B1's third: `approveRoster` and `declineRoster`; the contract's `RosterRevision`, `InvitationLink` and
// `RevokedInvitation`; spec 04, 32; T7, T9, T14, T15, T19, T33, T55; handoff 1, handoff 4; FQ60, FQ71, FQ75,
// FQ77, FQ80, FQ119): what each role must get, judged from the world's rows apart from the statements the
// routes run.
//
// - Who reads a revision (FQ119's default): an account that is active, with an active interval in a club
//   that isn't suspended (schedule.ts's `viewerIn`), whose interval is one of the revision's own members.
//   Everyone else the gate lets through gets the neutral not-found, byte for byte: a member who joined
//   later, a former member, a candidate who accepted, a stranger.
// - What: the revision's id, version and state; the club with the viewer's own interval; its proposer; its
//   members who have a name, in the order they joined; its candidates by position, each with the label the
//   revision shows and the member who proposed that candidate; the viewer's own decision; and the revision
//   that superseded it. A candidate's `invitation` is there only for the member who proposed that
//   candidate, once a link exists: its latest link by id, state and expiry (handoff 1). Nothing else: a
//   field beyond these fails the row, so no answer carries a count, another member's decision or an
//   acceptance (T15, T33).
// - Who proposes: a member of the club, by the same rule. The version the request names is held to the
//   club's, then six people to the club's members and open candidates (A01, T6).
// - Who makes or revokes a link: the member who proposed its candidate, and nobody else, whatever the
//   link's state (T14): a link an account accepted with can't be revoked or replaced (handoff 4).
// - Who approves or declines: whoever reads the revision, by the same rule, and nobody else. A newer
//   revision is ROSTER_CHANGED with the newest one's id, another version VERSION_CONFLICT with the
//   revision's; then a member's own decision is taken once, on an open revision, and any other request is
//   answered with the revision as it stands (`decisionOutcome`).
//
// The leak scanner reads the same answers for ids, names and tokens the viewer may not see; it can't judge
// a state, a decision or whose link an answer shows, so these rows do.

import { createHash, randomUUID } from "node:crypto";
import type { WorldTx } from "../db/harness.ts";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import { isObject } from "./operations.ts";
import type { Answer } from "./scanner.ts";
import { canonical, viewerIn, type ScheduleSeen, type ScheduleWorld } from "./schedule.ts";

/** The operations whose rows this file judges. */
export const ROSTER_JUDGED: ReadonlySet<string> = new Set([
  "proposeRoster",
  "getRosterRevision",
  "createInvitation",
  "revokeInvitation",
  "approveRoster",
  "declineRoster",
]);

/** A club holds at most six people, its candidates still open counted (A01, T6). */
const SIX = 6;
/** A link lasts seven days from the second it was made in (FQ71). */
const LINK_DAYS = 7;

export interface RevisionRows {
  club: string;
  state: string;
  version: number;
  /** `proposal`, a member's, or `rename`, a name nobody has approved yet (FQ84). */
  origin: string;
  proposer: string;
  sealed: boolean;
  supersededBy: string | null;
  /** The intervals the revision lists. */
  members: string[];
  /** By position. */
  candidates: { id: string; label: string; proposer: string; acceptedWith: string | null }[];
  /** Each member's own decision, by interval. */
  decisions: Map<string, string>;
}

export interface LinkRows {
  id: string;
  candidate: string;
  club: string;
  /** The interval that proposed the link's candidate. */
  proposer: string;
  expiresAt: Temporal.Instant;
  revoked: boolean;
  replaced: boolean;
  bound: boolean;
  /** The account that accepted with it, or null. */
  boundTo: string | null;
  /** That account's profile name now, or null. */
  boundName: string | null;
  /** The SHA-256 of its token, in hex. */
  hash: string;
}

export interface CandidateRows {
  club: string;
  state: string;
  /** The interval that proposed the candidate. */
  proposer: string;
}

/** The roster's rows of some clubs, as the judges read them. */
export interface RosterWorld {
  revisions: Map<string, RevisionRows>;
  /** Every link, by id. */
  links: Map<string, LinkRows>;
  /** Every candidate, by id. */
  candidates: Map<string, CandidateRows>;
}

/** Reads the roster's rows of `clubs` on `db`, a connection of the test's own. */
export async function rosterWorldOf(db: WorldTx, clubs: readonly string[]): Promise<RosterWorld> {
  const revisionRows = await db<
    {
      id: string;
      club: string;
      state: string;
      version: number;
      origin: string;
      proposer: string;
      sealed: boolean;
      superseded_by: string | null;
    }[]
  >`
    SELECT id, club_id AS club, state, version, origin, proposed_by_interval_id AS proposer,
           roster_sealed_at IS NOT NULL AS sealed, superseded_by_id AS superseded_by
      FROM app.roster_revisions WHERE club_id IN ${db(clubs)}`;
  const memberRows = await db<{ revision: string; interval: string }[]>`
    SELECT revision_id AS revision, interval_id AS interval FROM app.roster_revision_members
     WHERE club_id IN ${db(clubs)}`;
  const candidateRows = await db<
    { revision: string; id: string; label: string; position: number; proposer: string; accepted_with: string | null }[]
  >`
    SELECT rc.revision_id AS revision, rc.candidate_id AS id, rc.label, rc.position,
           k.proposed_by_interval_id AS proposer, rc.accepted_invitation_id AS accepted_with
      FROM app.roster_revision_candidates rc JOIN app.candidates k ON k.id = rc.candidate_id
     WHERE rc.club_id IN ${db(clubs)} ORDER BY rc.position`;
  const decisionRows = await db<{ revision: string; interval: string; decision: string }[]>`
    SELECT a.revision_id AS revision, a.interval_id AS interval, a.decision
      FROM app.roster_approvals a JOIN app.roster_revisions r ON r.id = a.revision_id
     WHERE r.club_id IN ${db(clubs)}`;
  const linkRows = await db<
    {
      id: string;
      candidate: string;
      club: string;
      proposer: string;
      expires_at: Temporal.Instant;
      revoked: boolean;
      replaced: boolean;
      bound: boolean;
      bound_to: string | null;
      bound_name: string | null;
      hash: string;
    }[]
  >`
    SELECT i.id, i.candidate_id AS candidate, k.club_id AS club, k.proposed_by_interval_id AS proposer, i.expires_at,
           i.revoked_at IS NOT NULL AS revoked, i.replaced_by_id IS NOT NULL AS replaced,
           i.bound_user_id IS NOT NULL AS bound, i.bound_user_id AS bound_to,
           (SELECT u.display_name FROM app.users u WHERE u.id = i.bound_user_id) AS bound_name,
           pg_catalog.encode(i.token_sha256, 'hex') AS hash
      FROM app.invitations i JOIN app.candidates k ON k.id = i.candidate_id
     WHERE k.club_id IN ${db(clubs)}`;
  const openRows = await db<{ id: string; club: string; state: string; proposer: string }[]>`
    SELECT id, club_id AS club, state, proposed_by_interval_id AS proposer
      FROM app.candidates WHERE club_id IN ${db(clubs)}`;
  return {
    revisions: new Map(
      revisionRows.map((row) => [
        row.id,
        {
          club: row.club,
          state: row.state,
          version: row.version,
          origin: row.origin,
          proposer: row.proposer,
          sealed: row.sealed,
          supersededBy: row.superseded_by,
          members: memberRows.filter((member) => member.revision === row.id).map((member) => member.interval),
          candidates: candidateRows
            .filter((candidate) => candidate.revision === row.id)
            .map((candidate) => ({
              id: candidate.id,
              label: candidate.label,
              proposer: candidate.proposer,
              acceptedWith: candidate.accepted_with,
            })),
          decisions: new Map(
            decisionRows.filter((decision) => decision.revision === row.id).map((one) => [one.interval, one.decision]),
          ),
        },
      ]),
    ),
    links: new Map(
      linkRows.map((row) => [
        row.id,
        {
          id: row.id,
          candidate: row.candidate,
          club: row.club,
          proposer: row.proposer,
          expiresAt: row.expires_at,
          revoked: row.revoked,
          replaced: row.replaced,
          bound: row.bound,
          boundTo: row.bound_to,
          boundName: row.bound_name,
          hash: row.hash,
        },
      ]),
    ),
    candidates: new Map(openRows.map((row) => [row.id, { club: row.club, state: row.state, proposer: row.proposer }])),
  };
}

const second = (instant: Temporal.Instant) => instant.toString({ smallestUnit: "second", roundingMode: "floor" });
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The contract's Person for `interval`, or undefined when there is no name to show (FQ75). */
function personOf(world: ScheduleWorld, interval: string): Record<string, unknown> | undefined {
  const member = world.members.get(interval);
  if (member === undefined || member.name === null) return undefined;
  return {
    membership_id: interval,
    display_name: member.name,
    ...(member.avatar === null ? {} : { avatar_version: member.avatar }),
  };
}

/** Where a candidate's latest link stands at `now`, on a revision whose row of the candidate is `acceptedWith`. */
function linkState(link: LinkRows, acceptedWith: string | null, now: Temporal.Instant): string {
  if (acceptedWith === link.id) return "accepted";
  if (link.bound) return "used";
  if (link.revoked) return "revoked";
  return Temporal.Instant.compare(link.expiresAt, now) <= 0 ? "expired" : "live";
}

/** The contract's RosterRevision `id` for the account `account` at `now`, or undefined: the neutral not-found. */
export function revisionFor(
  world: ScheduleWorld,
  roster: RosterWorld,
  id: string,
  account: string | null,
  now: Temporal.Instant,
): Record<string, unknown> | undefined {
  const revision = roster.revisions.get(id);
  if (revision === undefined || !revision.sealed) return undefined;
  const viewer = viewerIn(world, revision.club, account);
  const club = world.clubs.get(revision.club);
  if (viewer === undefined || club === undefined || !revision.members.includes(viewer)) return undefined;
  const proposedBy = personOf(world, revision.proposer);
  if (proposedBy === undefined) return undefined;
  const members = revision.members
    .map((interval) => ({ interval, member: world.members.get(interval) }))
    .sort(
      (a, b) =>
        (a.member === undefined || b.member === undefined
          ? 0
          : Temporal.Instant.compare(a.member.joinedAt, b.member.joinedAt)) || byBytes(a.interval, b.interval),
    )
    .flatMap(({ interval }) => {
      const person = personOf(world, interval);
      return person === undefined ? [] : [person];
    });
  const candidates: Record<string, unknown>[] = [];
  for (const candidate of revision.candidates) {
    const proposer = personOf(world, candidate.proposer);
    if (proposer === undefined) return undefined;
    const latest =
      candidate.proposer === viewer
        ? [...roster.links.values()].find((link) => link.candidate === candidate.id && !link.replaced)
        : undefined;
    candidates.push({
      id: candidate.id,
      name: candidate.label,
      proposed_by: proposer,
      ...(latest === undefined
        ? {}
        : {
            invitation: {
              id: latest.id,
              state: linkState(latest, candidate.acceptedWith, now),
              expires_at: second(latest.expiresAt),
            },
          }),
    });
  }
  return {
    id,
    version: revision.version,
    club: { id: revision.club, name: club.name, timezone: club.timezone, my_membership_id: viewer },
    state: revision.state,
    proposed_by: proposedBy,
    members,
    candidates,
    my_decision: revision.decisions.get(viewer) ?? "pending",
    ...(revision.supersededBy === null ? {} : { superseded_by: revision.supersededBy }),
  };
}

function parsed(answer: Answer): unknown {
  try {
    return JSON.parse(answer.body);
  } catch {
    return undefined;
  }
}

/** An answer of `status` whose body is `want`, value for value; each field that differs is named. */
export function sameAnswer(
  what: string,
  status: 200 | 201,
  want: Record<string, unknown>,
): (answer: Answer) => string[] {
  return (answer) => {
    if (answer.status !== status) return [`status ${String(answer.status)}, not ${String(status)} with ${what}`];
    if (answer.headers["cache-control"] !== "private, no-store") return [`${what} without private, no-store`];
    const body = parsed(answer);
    if (!isObject(body)) return [`not ${what}`];
    if (canonical(body) === canonical(want)) return [];
    const keys = [...new Set([...Object.keys(body), ...Object.keys(want)])].sort();
    return keys
      .filter((key) => canonical(body[key]) !== canonical(want[key]))
      .map(
        (key) => `${what}'s ${key} is ${canonical(body[key]).slice(0, 400)}, not ${canonical(want[key]).slice(0, 400)}`,
      );
  };
}

/** What the roster's judges know of a cell: the schedule's rows, the roster's, the clubs' own, the viewer and the instant. */
export interface RosterSeen extends ScheduleSeen {
  roster: RosterWorld;
  rows: ClubRows;
}

/** getRosterRevision's answer for the revision `id`, asked for by `account` (the cell's viewer when absent). */
export function revisionExpected(seen: () => RosterSeen, id: string, account?: string): Expected {
  return (answer) => {
    const { schedule, roster, now, account: viewer } = seen();
    const want = revisionFor(schedule, roster, id, account ?? viewer, now);
    return want === undefined ? pinnedProblems(answer, NEUTRAL) : sameAnswer("the roster revision", 200, want)(answer);
  };
}

const invalid = (field?: string) =>
  pinned(
    400,
    "Bad Request",
    field === undefined ? '{"code":"INVALID_REQUEST"}' : `{"code":"INVALID_REQUEST","field":"${field}"}`,
  );
const CONFLICT = pinned(409, "Conflict", '{"code":"IDEMPOTENCY_CONFLICT"}');
const FULL = pinned(409, "Conflict", '{"code":"CLUB_FULL"}');
const NOT_ALLOWED = pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}');
const versionConflict = (current: number) =>
  pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":${String(current)}}`);

const rosterChanged = (current: string) =>
  pinned(409, "Conflict", `{"code":"ROSTER_CHANGED","current_id":"${current}"}`);

/** The newest revision of the chain that replaced `id`: the one nothing has superseded. */
export function newestOf(roster: RosterWorld, id: string): string {
  let current = id;
  for (let hops = 0; hops < roster.revisions.size; hops += 1) {
    const next = roster.revisions.get(current)?.supersededBy ?? null;
    if (next === null) break;
    current = next;
  }
  return current;
}

/**
 * What an approval or a decline of the revision `id` at `expected` must get from the rows before it: a
 * pinned refusal; "decides", when the caller's own decision is still to make on an open revision; or
 * "stands", a 200 that changes nothing (the revision has ended, or the caller has decided: the contract
 * gives these commands no refusal for it). Whoever can't read the revision gets the neutral not-found
 * before anything else (FQ119, T14).
 */
export function decisionOutcome(
  world: ScheduleWorld,
  roster: RosterWorld,
  id: string,
  account: string | null,
  now: Temporal.Instant,
  expected: number,
): Answer | "decides" | "stands" {
  const revision = roster.revisions.get(id);
  if (revision === undefined || revisionFor(world, roster, id, account, now) === undefined) return NEUTRAL;
  if (revision.state === "superseded") return rosterChanged(newestOf(roster, id));
  if (revision.version !== expected) return versionConflict(revision.version);
  const viewer = viewerIn(world, revision.club, account);
  return revision.state === "open" && viewer !== undefined && !revision.decisions.has(viewer) ? "decides" : "stands";
}

/** A generic approval's or decline's answer in a cell, at a version no revision is at: it never decides. */
export function genericDecisionExpected(seen: () => RosterSeen, id: string): Expected {
  return (answer) => {
    const { schedule, roster, now, account } = seen();
    const outcome = decisionOutcome(schedule, roster, id, account, now, NO_SUCH_VERSION);
    if (typeof outcome === "string") return ["the judge's own generic decision would be taken"];
    return pinnedProblems(answer, outcome);
  };
}

/** A version no club of the matrix reaches: what the generic request names, so it changes nothing. */
export const NO_SUCH_VERSION = 1_000_000;

/** The body the matrix's generic requests send `proposeRoster`: one person, at a version no club is at. */
export function genericProposal(label: string): { expected_roster_version: number; add: { label: string }[] } {
  return { expected_roster_version: NO_SUCH_VERSION, add: [{ label }] };
}

/** What a proposal of `count` people at `expected` must get from the rows: a pinned refusal, or "created". */
export function proposalOutcome(
  world: ScheduleWorld,
  rows: ClubRows,
  club: string,
  account: string | null,
  expected: number,
  count: number,
): Answer | "created" {
  const roster = rows.get(club);
  if (viewerIn(world, club, account) === undefined || roster === undefined) return NEUTRAL;
  if (roster.rosterVersion !== expected) return versionConflict(roster.rosterVersion);
  const members = [...world.members.values()].filter((member) => member.club === club && member.active).length;
  return members + roster.openCandidates + count > SIX ? FULL : "created";
}

/** A generic `proposeRoster`'s answer in a cell: never a new revision. */
export function genericProposalExpected(seen: () => RosterSeen, club: string): Expected {
  return (answer) => {
    const { schedule, rows, account } = seen();
    const outcome = proposalOutcome(schedule, rows, club, account, NO_SUCH_VERSION, 1);
    if (outcome === "created") return ["the judge's own generic request would change the world"];
    return pinnedProblems(answer, outcome);
  };
}

/** What a revoke of the link `id` must get from the rows before it: a pinned refusal, or "revoked". */
export function revokeOutcome(
  world: ScheduleWorld,
  roster: RosterWorld,
  id: string,
  account: string | null,
): Answer | "revoked" {
  const link = roster.links.get(id);
  if (link === undefined) return NEUTRAL;
  const viewer = viewerIn(world, link.club, account);
  if (viewer === undefined || viewer !== link.proposer) return NEUTRAL;
  return link.bound ? NOT_ALLOWED : "revoked";
}

/** The contract's RevokedInvitation for the link `id`. */
export const revokedBody = (id: string): Record<string, unknown> => ({ invitation_id: id, state: "revoked" });

/** revokeInvitation's answer for the link `id` in a cell, asked for by `account` (the cell's viewer when absent). */
export function revokeExpected(seen: () => RosterSeen, id: string, account?: string): Expected {
  return (answer) => {
    const { schedule, roster, account: viewer } = seen();
    const outcome = revokeOutcome(schedule, roster, id, account ?? viewer);
    return outcome === "revoked"
      ? sameAnswer("the revoked link", 200, revokedBody(id))(answer)
      : pinnedProblems(answer, outcome);
  };
}

/** What a link request for `candidate` in `club` must get from the rows before it: a pinned refusal, or "made". */
export function linkOutcome(
  world: ScheduleWorld,
  roster: RosterWorld,
  club: string,
  candidate: string,
  account: string | null,
): Answer | "made" {
  const viewer = viewerIn(world, club, account);
  if (viewer === undefined) return NEUTRAL;
  const open = [...roster.revisions.values()].find((revision) => revision.club === club && revision.state === "open");
  const listed = open?.candidates.find((one) => one.id === candidate);
  if (listed === undefined || listed.proposer !== viewer) return NEUTRAL;
  const latest = [...roster.links.values()].find((link) => link.candidate === candidate && !link.replaced);
  return latest?.bound === true ? NOT_ALLOWED : "made";
}

/** `body` without its `url`. */
function withoutUrl(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== "url"));
}

/**
 * What a first `createInvitation`'s answer must be, from the rows after it: 201 with the candidate's
 * latest link by id, seven days from the second of `now`, and a URL on tadayo.app whose fragment is a
 * token of 43 base64url characters that hashes to the row's hash. Returns the problems and the token.
 */
export function madeLink(
  answer: Answer,
  roster: RosterWorld,
  candidate: string,
  now: Temporal.Instant,
): { problems: string[]; token: string | undefined; id: string | undefined } {
  const latest = [...roster.links.values()].find((link) => link.candidate === candidate && !link.replaced);
  const body = parsed(answer);
  if (answer.status !== 201 || !isObject(body) || latest === undefined) {
    return { problems: [`status ${String(answer.status)}, not 201 with a link`], token: undefined, id: undefined };
  }
  const problems: string[] = [];
  if (answer.headers["cache-control"] !== "private, no-store") problems.push("a link without private, no-store");
  const expires = second(Temporal.Instant.from(second(now)).add({ hours: 24 * LINK_DAYS }));
  const url = typeof body.url === "string" ? body.url : "";
  const token = /^https:\/\/tadayo\.app\/i#([A-Za-z0-9_-]{43})$/.exec(url)?.[1];
  const rest = withoutUrl(body);
  const want = { invitation_id: latest.id, candidate_id: candidate, expires_at: expires };
  if (canonical(rest) !== canonical(want)) problems.push(`the link is ${canonical(rest)}, not ${canonical(want)}`);
  if (second(latest.expiresAt) !== expires) problems.push("the link's row expires at another instant than its answer");
  if (token === undefined) problems.push("the link's url isn't https://tadayo.app/i# and a token of 43 characters");
  else if (createHash("sha256").update(token).digest("hex") !== latest.hash)
    problems.push("the link's token doesn't hash to its row's hash");
  return { problems, token, id: latest.id };
}

/** A replayed `createInvitation`'s answer: the first one without its `url`, and nothing else (FQ77). */
export function replayedLink(first: Answer): Expected {
  return (answer) => {
    const before = parsed(first);
    const now = parsed(answer);
    if (answer.status !== 201 || !isObject(before) || !isObject(now)) return ["not the first link again"];
    const rest = withoutUrl(before);
    if ("url" in now) return ["a retry's answer carries a url (FQ77)"];
    return canonical(now) === canonical(rest) ? [] : [`a retry's answer is ${canonical(now)}, not ${canonical(rest)}`];
  };
}

/** One request sent to `proposeRoster` in a cell. */
export interface ProposeCase {
  name: string;
  /** The body as sent. */
  body: string;
  /** The `Idempotency-Key` sent; null sends none. */
  key: string | null;
  /**
   * A pinned refusal the contract makes before any rule; or "stale", "proposal", "replay" and "other",
   * which the rows judge: a version one past the club's, the proposal itself, the same request again
   * under its key, and another body under that key.
   */
  expected: Answer | "stale" | "proposal" | "replay" | "other";
}

/**
 * The requests a cell sends `proposeRoster`, in order: what the contract refuses, a proposal at a stale
 * version, then one person proposed at the club's version `version`, the same request again under its key
 * (the first answer, and no second revision: T19), and another body under that key.
 */
export function proposeCases(version: number, label: string): ProposeCase[] {
  const key = randomUUID();
  const fresh = () => randomUUID();
  const good = JSON.stringify({ expected_roster_version: version, add: [{ label }] });
  return [
    { name: "no Idempotency-Key", body: good, key: null, expected: invalid("Idempotency-Key") },
    {
      name: "a label the contract refuses",
      body: JSON.stringify({ expected_roster_version: version, add: [{ label: " padded " }] }),
      key: fresh(),
      expected: invalid("add"),
    },
    {
      name: "six people at once",
      body: JSON.stringify({
        expected_roster_version: version,
        add: Array.from({ length: 6 }, () => ({ label })),
      }),
      key: fresh(),
      expected: invalid("add"),
    },
    {
      name: "a field the contract doesn't have",
      body: JSON.stringify({ expected_roster_version: version, add: [{ label }], members: [] }),
      key: fresh(),
      expected: invalid(),
    },
    {
      name: "a version one past the club's",
      body: JSON.stringify({ expected_roster_version: version + 1, add: [{ label }] }),
      key: fresh(),
      expected: "stale",
    },
    { name: "one person proposed", body: good, key, expected: "proposal" },
    { name: "the same request again under its key", body: good, key, expected: "replay" },
    {
      name: "another body under that key",
      body: JSON.stringify({ expected_roster_version: version, add: [{ label }, { label }] }),
      key,
      expected: "other",
    },
  ];
}

export {
  CONFLICT as IDEMPOTENCY_CONFLICT,
  FULL as CLUB_FULL,
  invalid as invalidRequest,
  rosterChanged,
  versionConflict,
};
