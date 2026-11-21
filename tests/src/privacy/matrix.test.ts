/// <reference lib="esnext.temporal" />
// The privacy matrix over the API's app (TECH-DESIGN section 8; T9, T10, T14, T16, T27, T53, T55; Q05 to Q09),
// generated from the contract's operations: every route, as every role, in each of the drop's six states and a
// cancelled day, at each phase of the day by the server's clock. Each cell is checked against its row (rows.ts,
// account.ts), and every answer it gets goes through the leak scanner (scanner.ts). Then each request again
// with the client's clock and parameters moved past the reveal (T16, Q09), and with each id and cursor guessed
// or malformed (T14); and each request from callers without a session, with the cell's ids, ids that name
// nothing and another club's.
//
// The app is the real one: every request carries a token signed as Supabase signs it, checked by the real
// verifier against the project's key set and mapped by the real gate to the role's account (tokens.ts), so
// what an account's state makes of a request is the gate's, not a stand-in's (spec 23; T27, T53). The roles
// are 12: the 11 of a club's world, and an account that has signed in and finished nothing (FQ13, FQ69).
//
// Each role's world is committed, with random ids, so the app's own connection reads it as a request
// would, and every name in it ends in the world's own random suffix: its people's, its club's, its
// roster's labels and its captions, so no other world has them. Ana's Saturday holds Ben's photo, the
// drop the states act on, and Cleo's video link, so the day has two contributors. The scanner's facts
// come from the world's rows, never from the authorization module it tests. Nothing the sign-in token
// carries may reach an answer: the person's address, the sign-in subject of each account, and the token
// itself are values the world keeps back.
//
// Each role's test prints the cells it ran and the answers it scanned, and asserts both: the cells
// against the contract's 72 requests a world, the answers against what each step says it sends.

import { randomBytes, randomUUID } from "node:crypto";
import { buildApp, connect, routesOf, sessions, type ApiSql } from "@tadayo/api";
import { TEST_EMAIL } from "@tadayo/api/testing";
import { makeDays } from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmOwnDays, foundedBy, joinAs } from "../db/club-world.ts";
import { worldSql, type Tx, type WorldTx } from "../db/harness.ts";
import { AT, checkAsAtCommit, commitDrop, named, newAvatar, newUser, newWorld, type World } from "../db/world.ts";
import { PHASES, REVEAL, ROLES, STATES, type Phase } from "../matrix.ts";
import {
  CREATE_CLUB_NO_BODY,
  clubExpected,
  clubFor,
  clubRowsOf,
  createClubCases,
  createdClubId,
  newClubProblems,
  sameDetail,
  type ClubSeen,
} from "./club.ts";
import {
  PUBLIC,
  cellExpected,
  clubsJudge,
  daysOf,
  gateOf,
  sessionOf,
  updateMeCases,
  type Own,
  type Session,
} from "./account.ts";
import { freshId, type Targets } from "./bindings.ts";
import {
  SIGNED_OUT,
  UNAUTHENTICATED,
  NEUTRAL,
  PREFLIGHT_ROUTE,
  cellStep,
  guessCount,
  guessStep,
  manipulations,
  manipulationStep,
  pinnedProblems,
  preflightProblems,
  answerOf,
  render,
  routeProblems,
  said,
  signedOutCount,
  signedOutStep,
  specsFor,
  type Expected,
  type Spec,
  type Step,
} from "./harness.ts";
import { INVITATION_JUDGED, acceptOutcome, freshToken, previewExpected, webPreviewExpected } from "./invitation.ts";
import {
  firstDaysJoinProblems,
  firstDaysProblems,
  LEAVE_NO_BODY,
  leaveOutcome,
  leaveProblems,
  leftExpected,
  type Choice,
  type MembershipRow,
} from "./leave.ts";
import { membersExpected, type MembersSeen } from "./members.ts";
import {
  IDEMPOTENCY_CONFLICT,
  NO_SUCH_VERSION,
  decisionOutcome,
  genericDecisionExpected,
  genericProposal,
  genericProposalExpected,
  linkOutcome,
  madeLink,
  proposalOutcome,
  proposeCases,
  replayedLink,
  revisionExpected,
  revisionFor,
  revokeExpected,
  rosterWorldOf,
  sameAnswer,
  type RosterSeen,
} from "./roster.ts";
import { contractOperations, readDocument } from "./operations.ts";
import { NONE, ROWS, rowProblems } from "./rows.ts";
import {
  SCHEDULE_JUDGED,
  addFirstDays,
  changeProblems,
  commandExpected,
  genericBody,
  outcomeOf,
  proposalFor,
  sameBody,
  scheduleCases,
  scheduleWorldOf,
  canonical,
  viewerIn,
  weekChangeProblems,
  weekExpected,
  type ScheduleCommand,
  type ScheduleSeen,
} from "./schedule.ts";
import {
  scan,
  type Answer,
  type MediaClass,
  type Viewer,
  type WorldAccount,
  type WorldDay,
  type WorldDrop,
  type WorldFacts,
  type WorldInvitation,
  type WorldReservation,
} from "./scanner.ts";
import { bearer, signing, tokenCallers, type Signing } from "./tokens.ts";

const document = readDocument();
const operations = contractOperations(document);

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;

/** The time a manipulated request claims: a day after the collecting phase's instant. */
const CLAIMED = PHASES.collecting.add({ hours: 24 });

/** The requests each world gets from the contract's operations (specsFor), pinned. */
const REQUESTS_PER_WORLD = 72;
/** What the roster's table did for each role (the role's test fills it; the last test reads it). */
const ROSTER_TABLES = new Map<
  string,
  { memberPhases: number; revisions: number; links: number; otherAnswers: number; invitations: number }
>();
/** The states each role's viewer left the cell's club in (the role's test fills it; a later test reads it). */
const LEAVES = new Map<string, number>();
/** By role: the leaves after which the leaver lost a revision that listed them, read until then. */
const REVISIONS_LOST = new Map<string, number>();
/**
 * The answers the invitation's table gives someone other than the cell's viewer, for each revision: the
 * signed-out page twice, the link's holder ten times, another member three times.
 */
const INVITATION_OTHER_ANSWERS = 15;

/** A world's own suffix, so its names are no other world's. */
const suffix = () => ` ${randomBytes(6).toString("hex")}`;

/**
 * Another club's objects, with an avatar of one of its people that is ready, and that person's sign-in
 * subject, account and profile name: the person who holds the links the invitation's table makes.
 */
type Elsewhere = Targets & { avatar: string; subject: string; account: string; name: string };

/** The token a request presented in its body, when it did (the scanner's `presented`). */
function presentedBy(spec: Spec): string | undefined {
  if (spec.body === undefined) return undefined;
  try {
    const body: unknown = JSON.parse(spec.body);
    const token = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["token"] : undefined;
    return typeof token === "string" ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The body each generic request of the roster's and the invitation's commands carries, past the body's
 * check and changing nothing: a version no revision is at, and a token nobody made.
 */
function genericBodyFor(spec: Spec, revision: string, token: string): Spec {
  const id = spec.operation.id;
  const body =
    id === "approveRoster" || id === "declineRoster"
      ? { expected_version: NO_SUCH_VERSION }
      : id === "acceptInvitation"
        ? { token, revision_id: revision, expected_version: NO_SUCH_VERSION }
        : id === "previewInvitation" || id === "previewInvitationWeb"
          ? { token }
          : undefined;
  return body === undefined
    ? spec
    : { ...spec, headers: { ...spec.headers, "content-type": "application/json" }, body: JSON.stringify(body) };
}

const db = worldSql();
let api: ApiSql;
let clock: FakeClock;
let app: FastifyInstance;
let keys: Signing;
let elsewhere: Elsewhere;

/**
 * Ben's photo "From Ben" and Cleo's video link "Cleo's pick" to Ana's Saturday, each caption ending
 * in the world's suffix, so no other world has it; committed at 20:00 on Friday 6 November, each with
 * its audience of Ana, Ben and Cleo, sealed. Returns Ben's drop.
 */
async function twoContributors(tx: WorldTx, w: World): Promise<string> {
  const drop = await commitDrop(plain(tx), w, w.ben, { caption: named(w, "From Ben"), at: AT.added });
  await commitDrop(plain(tx), w, w.cleo, { media: "external_video", caption: named(w, "Cleo's pick"), at: AT.added });
  await checkAsAtCommit(plain(tx));
  const [row] = await tx<{ authors: number }[]>`
    SELECT count(DISTINCT author_interval_id)::int AS authors FROM app.drops WHERE occurrence_id = ${w.day} AND state = 'active'`;
  if (row?.authors !== 2)
    throw new Error(`the matrix's day holds drops from ${String(row?.authors)} contributors, not two`);
  return drop;
}

/**
 * The world's own roster revision and one of its links: the applied revision that brought Ben and Cleo in,
 * which lists Ana alone, and the link Ben accepted it with (world.ts's `joinByRoster`).
 */
async function rosterTargets(tx: WorldTx, w: World): Promise<{ revision: string; invitation: string }> {
  const [row] = await tx<{ revision: string; invitation: string | null }[]>`
    SELECT m.joined_via_revision_id AS revision, rc.accepted_invitation_id AS invitation
      FROM app.memberships m
      JOIN app.roster_revision_candidates rc
        ON rc.revision_id = m.joined_via_revision_id AND rc.candidate_id = m.joined_via_candidate_id
     WHERE m.interval_id = ${w.ben.interval}`;
  if (row === undefined || row.invitation === null) throw new Error("the world's author joined by no roster");
  return { revision: row.revision, invitation: row.invitation };
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("set DATABASE_URL, as the ci step privacy does (tools/ci/ci_steps.py)");
  keys = await signing();
  api = connect(url);
  clock = fakeClock(REVEAL);
  app = buildApp({
    sql: api,
    clock,
    authenticate: sessions({ verifier: keys.verifier, sql: api, clock }),
    log: { level: "silent" },
  });
  await app.ready();
  elsewhere = await db.begin(async (tx) => {
    const w = await newWorld(plain(tx), suffix());
    const drop = await twoContributors(tx, w);
    const proposal = await addFirstDays(tx, w);
    const avatar = await newAvatar(plain(tx), w.ben.user, "ready");
    const [subject] = await tx<{ auth_subject: string | null; display_name: string | null }[]>`
      SELECT auth_subject, display_name FROM app.users WHERE id = ${w.ben.user}`;
    if (subject === undefined || subject.auth_subject === null || subject.display_name === null)
      throw new Error("the other club's author has no sign-in subject or no name");
    return {
      club: w.club,
      drop,
      day: w.day,
      author: w.ben.interval,
      star: w.ana.interval,
      proposal,
      ...(await rosterTargets(tx, w)),
      avatar: avatar.id,
      subject: subject.auth_subject,
      account: w.ben.user,
      name: subject.display_name,
    };
  });
});

afterAll(async () => {
  await app.close();
  await api.end();
  await db.end();
});

interface Facts {
  world: WorldFacts;
  viewer: Viewer;
}

/**
 * What the scanner knows of the clubs `clubs`, read from their rows, and of the viewer: their account, their
 * intervals, and the text that is their own. A caller without a session is a viewer with none. `accounts` are
 * the accounts of the world that belong to no club; `secrets` are the tokens in use: the world keeps them back
 * with the sign-in subject of each account and the address every token carries.
 */
async function factsOf(
  clubs: string[],
  viewer: string | null,
  options: { accounts?: string[]; secrets?: string[] } = {},
): Promise<Facts> {
  const drops = await db<
    {
      id: string;
      author: string;
      day: string;
      media: MediaClass;
      state: WorldDrop["state"];
      ended_at: Temporal.Instant | null;
      caption: string | null;
      audience: string[];
      comments: string[];
    }[]
  >`
    SELECT d.id, d.author_interval_id AS author, d.occurrence_id AS day, d.media_class AS media, d.state, d.ended_at,
           d.caption,
           coalesce((SELECT array_agg(a.interval_id) FROM app.drop_audience a
                       JOIN app.memberships m ON m.interval_id = a.interval_id
                      WHERE a.drop_id = d.id AND m.state = 'active'), '{}') AS audience,
           coalesce((SELECT array_agg(c.body) FROM app.comments c
                      WHERE c.drop_id = d.id AND c.state = 'active'), '{}') AS comments
      FROM app.drops d
     WHERE d.club_id IN ${db(clubs)}`;
  const days = await db<
    {
      id: string;
      club: string;
      star: string;
      local_date: string;
      reveal_at: Temporal.Instant;
      close_at: Temporal.Instant;
      collecting_from: Temporal.Instant;
      status: WorldDay["status"];
    }[]
  >`
    SELECT id, club_id AS club, star_interval_id AS star, local_date::text AS local_date, reveal_at, close_at,
           collecting_from, status
      FROM app.occurrences WHERE club_id IN ${db(clubs)}`;
  const members = await db<
    {
      interval_id: string;
      club: string;
      account: string;
      name: string | null;
      joined_at: Temporal.Instant;
      left_at: Temporal.Instant | null;
    }[]
  >`
    SELECT m.interval_id, m.club_id AS club, m.user_id AS account,
           CASE WHEN m.state = 'active' THEN u.display_name ELSE m.ended_display_name END AS name,
           m.joined_at, m.left_at
      FROM app.memberships m JOIN app.users u ON u.id = m.user_id
     WHERE m.club_id IN ${db(clubs)}`;
  const reservations = await db<
    {
      id: string;
      interval: string;
      day: string;
      media: MediaClass;
      state: WorldReservation["state"];
      expires_at: Temporal.Instant;
    }[]
  >`
    SELECT r.id, r.interval_id AS interval, r.occurrence_id AS day, r.media_class AS media, r.state, r.expires_at
      FROM app.reservations r JOIN app.occurrences o ON o.id = r.occurrence_id
     WHERE o.club_id IN ${db(clubs)}`;
  const clubRows = await db<{ id: string; name: string; suspended_at: Temporal.Instant | null }[]>`
    SELECT id, name, suspended_at FROM app.clubs WHERE id IN ${db(clubs)}`;
  // Each roster label, with when the first revision holding it was made (FQ75).
  const labelRows = await db<{ club: string; label: string; since: Temporal.Instant }[]>`
    SELECT c.club_id AS club, c.label, min(v.created_at) AS since
      FROM app.roster_revision_candidates c JOIN app.roster_revisions v ON v.id = c.revision_id
     WHERE c.club_id IN ${db(clubs)}
     GROUP BY c.club_id, c.label`;
  // The accounts: the people of these clubs, those that accepted an invitation to one of them, the
  // viewer's, and the world's that belong to no club. An avatar's version is the content version of the
  // upload the account holds, and the sign-in subject is kept back, never shown.
  const asked = [viewer ?? "", ...(options.accounts ?? [])];
  const accountRows = await db<
    {
      id: string;
      state: WorldAccount["state"];
      deletion_requested_at: Temporal.Instant | null;
      name: string | null;
      avatar: string | null;
      age_confirmed: boolean;
      version: number;
      subject: string | null;
    }[]
  >`
    SELECT u.id, u.state, u.deletion_requested_at, u.display_name AS name, a.content_version AS avatar,
           u.age_confirmed_at IS NOT NULL AS age_confirmed, u.version, u.auth_subject AS subject
      FROM app.users u LEFT JOIN app.uploads a ON a.id = u.avatar_upload_id
     WHERE u.id IN (SELECT user_id FROM app.memberships WHERE club_id IN ${db(clubs)})
        OR u.id IN (SELECT i.bound_user_id FROM app.invitations i JOIN app.candidates c ON c.id = i.candidate_id
                     WHERE c.club_id IN ${db(clubs)})
        OR u.id IN ${db(asked)}`;
  // An invitation, its candidate's club and state, the club's name and the inviter's name as members see it.
  const invitationRows = await db<
    {
      id: string;
      bound: string | null;
      club: string;
      joined: boolean;
      club_name: string;
      inviter: string | null;
      candidate: string;
      proposed_by: string;
      token_sha256: string;
      dead: boolean;
      expires_at: Temporal.Instant;
      roster: string[] | null;
    }[]
  >`
    SELECT i.id, i.bound_user_id AS bound, c.club_id AS club, c.state = 'joined' AS joined, k.name AS club_name,
           c.id AS candidate, c.proposed_by_interval_id AS proposed_by, pg_catalog.encode(i.token_sha256, 'hex') AS token_sha256,
           CASE WHEN m.state = 'active' THEN u.display_name ELSE m.ended_display_name END AS inviter,
           i.revoked_at IS NOT NULL OR i.replaced_by_id IS NOT NULL AS dead, i.expires_at,
           -- What the club's open revision shows the candidate, while still open on it: its members' names
           -- and its candidates' labels.
           (SELECT array(SELECT su.display_name FROM app.roster_revision_members rm
                           JOIN app.memberships s ON s.interval_id = rm.interval_id
                           JOIN app.users su ON su.id = s.user_id
                          WHERE rm.revision_id = r.id AND s.state = 'active' AND su.display_name IS NOT NULL)
                   || array(SELECT x.label FROM app.roster_revision_candidates x WHERE x.revision_id = r.id)
              FROM app.roster_revisions r
              JOIN app.roster_revision_candidates rc ON rc.revision_id = r.id AND rc.candidate_id = c.id
             WHERE r.club_id = c.club_id AND r.state = 'open' AND r.roster_sealed_at IS NOT NULL
               AND c.state = 'open') AS roster
      FROM app.invitations i
      JOIN app.candidates c ON c.id = i.candidate_id
      JOIN app.clubs k ON k.id = c.club_id
      JOIN app.memberships m ON m.interval_id = c.proposed_by_interval_id
      JOIN app.users u ON u.id = m.user_id
     WHERE c.club_id IN ${db(clubs)}`;
  // A photo's content version and a video's link and post id are their drop's; storage keys, and the
  // versions and links no drop holds (a replacement still being checked, an upload or a source left
  // unused), are no drop's. Avatars' versions are left out: a person's avatar version is shown before
  // the reveal (FQ74, ADR-031).
  const people = db`SELECT user_id FROM app.memberships WHERE club_id IN ${db(clubs)}`;
  const kept = await db<{ value: string; drop: string | null }[]>`
    SELECT u.content_version AS value, d.id AS drop FROM app.uploads u LEFT JOIN app.drops d ON d.upload_id = u.id
     WHERE u.owner_user_id IN (${people}) AND u.purpose <> 'avatar' AND u.content_version IS NOT NULL
    UNION SELECT s.canonical_url, d.id FROM app.sources s LEFT JOIN app.drops d ON d.source_id = s.id
     WHERE s.owner_user_id IN (${people})
    UNION SELECT s.provider_post_id, d.id FROM app.sources s LEFT JOIN app.drops d ON d.source_id = s.id
     WHERE s.owner_user_id IN (${people})
    UNION SELECT object_key, NULL FROM app.uploads WHERE owner_user_id IN (${people})
    UNION SELECT r.object_key, NULL FROM app.upload_renditions r JOIN app.uploads u ON u.id = r.upload_id
     WHERE u.owner_user_id IN (${people})`;
  const canaries = new Map<string, string[]>();
  for (const { value, drop } of kept) {
    const holders = canaries.get(value) ?? [];
    if (drop !== null) holders.push(drop);
    canaries.set(value, holders);
  }
  // What a sign-in token carries is no one's to be shown, whatever the answer: the address, each
  // account's subject, and the token itself.
  for (const secret of [TEST_EMAIL, ...(options.secrets ?? []), ...accountRows.flatMap((row) => row.subject ?? [])])
    canaries.set(secret, []);
  const intervals = await db<{ interval_id: string }[]>`
    SELECT interval_id FROM app.memberships WHERE user_id = ${viewer ?? ""}`;
  const own = await db<{ text: string }[]>`
    SELECT display_name AS text FROM app.users WHERE id = ${viewer ?? ""} AND display_name IS NOT NULL
    UNION SELECT blocked_name FROM app.blocks WHERE blocker_user_id = ${viewer ?? ""}`;
  return {
    world: {
      drops: new Map(
        drops.map((drop): [string, WorldDrop] => [
          drop.id,
          {
            author: drop.author,
            day: drop.day,
            media: drop.media,
            state: drop.state,
            endedAt: drop.ended_at,
            caption: drop.caption,
            audience: new Set(drop.audience),
            comments: drop.comments,
          },
        ]),
      ),
      days: new Map(
        days.map((day) => [
          day.id,
          {
            club: day.club,
            star: day.star,
            localDate: day.local_date,
            revealAt: day.reveal_at,
            closeAt: day.close_at,
            collectingFrom: day.collecting_from,
            status: day.status,
          },
        ]),
      ),
      members: new Map(
        members.map((row) => [
          row.interval_id,
          { club: row.club, account: row.account, name: row.name, joinedAt: row.joined_at, leftAt: row.left_at },
        ]),
      ),
      clubs: new Map(
        clubRows.map((row) => [
          row.id,
          {
            name: row.name,
            suspendedAt: row.suspended_at,
            labels: new Map(
              labelRows.filter((label) => label.club === row.id).map((label) => [label.label, label.since]),
            ),
          },
        ]),
      ),
      reservations: new Map(
        reservations.map((row): [string, WorldReservation] => [
          row.id,
          { interval: row.interval, day: row.day, media: row.media, state: row.state, expiresAt: row.expires_at },
        ]),
      ),
      canaries,
      accounts: new Map(
        accountRows.map((row): [string, WorldAccount] => [
          row.id,
          {
            state: row.state,
            deletionRequestedAt: row.deletion_requested_at,
            name: row.name,
            avatar: row.avatar,
            ageConfirmed: row.age_confirmed,
            version: row.version,
          },
        ]),
      ),
      invitations: new Map(
        invitationRows.map((row): [string, WorldInvitation] => [
          row.id,
          {
            boundTo: row.bound,
            club: row.club,
            joined: row.joined,
            clubName: row.club_name,
            inviterName: row.inviter,
            candidate: row.candidate,
            proposedBy: row.proposed_by,
            tokenSha256: row.token_sha256,
            dead: row.dead,
            expiresAt: row.expires_at,
            roster: row.roster,
          },
        ]),
      ),
    },
    viewer: {
      account: viewer,
      intervals: new Set(intervals.map((row) => row.interval_id)),
      texts: new Set(own.map((row) => row.text)),
    },
  };
}

/** The answers each step got, through the leak scanner: each finding as a line, into `wrong`. */
function scanner(
  wrong: string[],
  where: string,
  facts: () => Facts,
  now: Temporal.Instant,
  counted: { answers: number },
) {
  return (step: Step) => {
    for (const problem of step.problems) wrong.push(`${where}: ${problem}`);
    const known = facts();
    for (const { spec, answer } of step.answers) {
      counted.answers += 1;
      const context = {
        document,
        operation: spec.operation,
        skeleton: ROWS[spec.operation.id] === NONE,
        viewer: known.viewer,
        world: known.world,
        now,
      };
      const presented = presentedBy(spec);
      const asked = presented === undefined ? context : { ...context, presented };
      for (const finding of scan(answer, asked)) {
        wrong.push(`${where}, ${spec.operation.id}: ${finding.check} at ${finding.at}: ${finding.what}`);
      }
    }
  };
}

/**
 * A malformed id's or cursor's answer, by its request and the gate's answer to the caller, the first time any
 * role got it (T14): a route the gate stops answers the gate's, so only callers it treats alike are compared.
 */
const malformed = new Map<string, { answer: string; role: string }>();

/** What `weekChangeProblems` needs of the date when a membership started or ended in `club` at `instant`. */
async function changeDatesAt(
  sql: WorldTx | typeof db,
  club: string,
  instant: Temporal.Instant,
): Promise<{ today: string }> {
  const [row] = await sql<{ zone: string }[]>`SELECT timezone AS zone FROM app.clubs WHERE id = ${club}`;
  if (row === undefined) throw new Error("the matrix asked the date of a club that doesn't exist");
  return { today: instant.toZonedDateTimeISO(row.zone).toPlainDate().toString() };
}

describe("a route with no row fails, and no route is outside the contract but the preflight (TECH-DESIGN section 8)", () => {
  it("gives every operation of the contract a row, and the app a route for each, the preflight, and no other", () => {
    expect(rowProblems(operations, ROWS)).toEqual([]);
    // The browser's preflight before tadayo.app's request is the one route that is no operation; every cell
    // sends it as its role, below.
    expect(routesOf(app)).toContain(PREFLIGHT_ROUTE);
    expect(
      routeProblems(
        routesOf(app).filter((route) => route !== PREFLIGHT_ROUTE),
        operations,
      ),
    ).toEqual([]);
    expect(routesOf(app)).toHaveLength(operations.length + 1);
  });
});

describe("every cell of the privacy matrix: each role, each state of the drop, each phase of the day (T9, T14, T16, T27; Q05 to Q09)", () => {
  for (const role of ROLES) {
    it(`answers the ${role.name} as its account and its row say, and leaks nothing the scanner can find`, async () => {
      const wrong: string[] = [];
      const counted = { cells: 0, answers: 0, expectedAnswers: 0, bodies: 0, expectedBodies: 0 };
      // What the roster's table did for this role: the proposals it sent, the phases its viewer was a member
      // the club answers and the states that had one, the proposals the judge said must make a revision,
      // the revisions and links made, and the answers given to another member. A table that was skipped
      // whole would balance every other count, so these are asserted below.
      const roster = {
        proposals: 0,
        memberPhases: 0,
        due: 0,
        revisions: 0,
        links: 0,
        otherAnswers: 0,
        invitations: 0,
      };
      const memberStates = new Set<string>();
      // What the leave's step did for this role: the states it asked in, and those the judge said it left in.
      const left = { asked: 0, left: 0, revisions: 0 };
      const phases = (Object.keys(PHASES) as Phase[]).filter((phase) => !role.phases || role.phases.includes(phase));
      const expectedSession: Session = role.session ?? "active";
      for (const state of STATES) {
        const cell = await db.begin(async (tx) => {
          const w = await newWorld(plain(tx), suffix());
          const drop = await twoContributors(tx, w);
          // The club's first days, before the role changes the club, as a leave or a join would meet them.
          const proposal = await addFirstDays(tx, w);
          const viewer = await role.make(tx, w);
          await state.make(tx, w, drop);
          // The viewer's own avatars, one not ready and one ready, and the drop's photo, which is no avatar.
          const pending = await newAvatar(plain(tx), viewer, "pending");
          const ready = await newAvatar(plain(tx), viewer, "ready");
          const [photo] = await tx<{ upload_id: string }[]>`SELECT upload_id FROM app.drops WHERE id = ${drop}`;
          await checkAsAtCommit(plain(tx));
          const targets: Targets = {
            club: w.club,
            drop,
            day: w.day,
            author: w.ben.interval,
            star: w.ana.interval,
            proposal,
            ...(await rosterTargets(tx, w)),
          };
          return { w, targets, viewer, pending: pending.id, ready, photo: photo?.upload_id ?? "" };
        });
        const [account] = await db<
          { state: string; age_confirmed: boolean; name: string | null; subject: string | null; version: number }[]
        >`
          SELECT state, age_confirmed_at IS NOT NULL AS age_confirmed, display_name AS name, auth_subject AS subject, version
            FROM app.users WHERE id = ${cell.viewer}`;
        if (account === undefined || account.subject === null)
          throw new Error("the role's account has no sign-in subject");
        // What the gate makes of the account is read from its row, and is the role's own (matrix.ts).
        const session = sessionOf({ state: account.state, ageConfirmed: account.age_confirmed, name: account.name });
        if (session !== expectedSession)
          wrong.push(`${state.name}: the account is ${session}, but the role says ${expectedSession}`);
        const authorization = bearer(await keys.signer.token(account.subject));
        const viewerClubs = await db<{ club_id: string }[]>`
          SELECT club_id FROM app.memberships WHERE user_id = ${cell.viewer}`;
        // The clubs the facts are read from: the viewer's own `createClub` adds each club it makes.
        const clubs = [...new Set([cell.w.club, elsewhere.club, ...viewerClubs.map((row) => row.club_id)])];
        const made: string[] = [];
        let tablesThrough = 0;
        // The clubs the viewer had made before this cell's tables: the world's own, for its creator.
        const [before] = await db<{ n: number }[]>`
          SELECT count(*)::int AS n FROM app.memberships WHERE user_id = ${cell.viewer} AND origin = 'creator'`;
        const createdBefore = before?.n ?? 0;
        // Someone of another club, signed in, who asks for each club the viewer makes.
        const outsider = bearer(await keys.signer.token(elsewhere.subject));
        // The tokens the world keeps back: the viewer's own, and each link's token once its one answer is read.
        const secrets = [authorization.slice("Bearer ".length)];
        const load = () => factsOf(clubs, cell.viewer, { accounts: [cell.w.dan.user], secrets: [...secrets] });
        // Another member of the cell's club with a session, who asks for what the viewer makes; none in a
        // world that has no such member.
        const [another] = await db<{ account: string; subject: string }[]>`
          SELECT u.id AS account, u.auth_subject AS subject
            FROM app.memberships m JOIN app.users u ON u.id = m.user_id
           WHERE m.club_id = ${cell.w.club} AND m.state = 'active' AND u.state = 'active'
             AND u.id <> ${cell.viewer} AND u.auth_subject IS NOT NULL
           ORDER BY m.joined_at, m.interval_id LIMIT 1`;
        const other =
          another === undefined
            ? undefined
            : { account: another.account, authorization: bearer(await keys.signer.token(another.subject)) };
        if (other !== undefined) secrets.push(other.authorization.slice("Bearer ".length));
        let facts = await load();
        // The schedule's rows of the cell's club and the other club, read again after each request that may change them.
        const loadSchedule = () => scheduleWorldOf(db as unknown as WorldTx, [cell.w.club, elsewhere.club, ...made]);
        let schedule = await loadSchedule();
        // The clubs' own rows (club.ts), read again with the schedule's.
        const loadClubRows = () => clubRowsOf(db as unknown as WorldTx, [cell.w.club, elsewhere.club, ...made]);
        let clubRows = await loadClubRows();
        // The roster's rows (roster.ts), read again after each request that may change them.
        const loadRoster = () => rosterWorldOf(db as unknown as WorldTx, [cell.w.club, elsewhere.club, ...made]);
        let rosterWorld = await loadRoster();
        const startVersion = schedule.proposals.get(cell.targets.proposal)?.version ?? -1;
        // A schedule command's generic request carries a body the contract accepts and every rule refuses
        // (schedule.ts's genericBody), so the guessed and malformed ids beside it are judged past the body's check.
        const genericToken = freshToken();
        const specs = operations
          .flatMap((operation) => specsFor(operation, cell.targets, authorization))
          .map((spec): Spec =>
            spec.operation.id === "chooseScheduleDays" || spec.operation.id === "confirmScheduleDays"
              ? {
                  ...spec,
                  headers: { ...spec.headers, "content-type": "application/json" },
                  body: JSON.stringify(genericBody(startVersion)),
                }
              : spec.operation.id === "proposeRoster"
                ? {
                    // One person at a version no club is at: past the body's check, and never a new revision.
                    ...spec,
                    headers: { ...spec.headers, "content-type": "application/json" },
                    body: JSON.stringify(genericProposal(named(cell.w, "Nobody"))),
                  }
                : spec.operation.id === "createInvitation"
                  ? {
                      // A candidate nobody has: past the body's check, and never a link.
                      ...spec,
                      headers: { ...spec.headers, "content-type": "application/json" },
                      body: JSON.stringify({ candidate_id: freshId() }),
                    }
                  : genericBodyFor(spec, cell.targets.revision, genericToken),
          );
        for (const [index, phase] of phases.entries()) {
          const now = PHASES[phase];
          clock.set(now);
          const seen = () => ({ world: facts.world, viewer: facts.viewer, now });
          const record = scanner(wrong, `${state.name}, ${phase}`, () => facts, now, counted);
          const scheduleSeen = (): ScheduleSeen => ({ schedule, account: cell.viewer, now });
          // The roster's days come from the world's rows as the club list's do (account.ts's daysOf).
          const membersSeen = (): MembersSeen => ({
            ...scheduleSeen(),
            nextOf: (star) => daysOf(facts.world, cell.w.club, now, star).next,
            openRevision: (club) => {
              const open = clubRows.get(club)?.openRevision ?? null;
              return open === null ? undefined : revisionFor(schedule, rosterWorld, open, cell.viewer, now);
            },
          });
          const clubSeen = (): ClubSeen => ({
            ...scheduleSeen(),
            rows: clubRows,
            daysOf: (club) => daysOf(facts.world, club, now),
          });
          const rosterSeen = (): RosterSeen => ({ ...scheduleSeen(), roster: rosterWorld, rows: clubRows });
          // The browser's preflight before the signed-out page's request, as the role, signed out, and as the
          // page's browser sends it (T59): one answer for everyone, which reads nothing
          // (services/api/src/web-origin.ts).
          for (const headers of [
            { authorization },
            {} as Record<string, string>,
            {
              authorization,
              origin: "https://tadayo.app",
              "access-control-request-method": "POST",
              "access-control-request-headers": "content-type",
            },
          ]) {
            const answer = await answerOf(app, { method: "OPTIONS", url: "/v1/invitations/web-preview", headers });
            for (const problem of preflightProblems(answer))
              wrong.push(
                `${state.name}, ${phase}: the preflight with ${JSON.stringify(Object.keys(headers))}: ${problem}`,
              );
          }
          for (const spec of specs) {
            const gate = gateOf(session, spec.operation);
            const id = spec.operation.id;
            const expected =
              gate === undefined && id === "getRosterRevision"
                ? revisionExpected(rosterSeen, cell.targets.revision)
                : gate === undefined && id === "revokeInvitation"
                  ? revokeExpected(rosterSeen, cell.targets.invitation)
                  : gate === undefined && id === "proposeRoster"
                    ? genericProposalExpected(rosterSeen, cell.w.club)
                    : gate === undefined && id === "createInvitation"
                      ? NEUTRAL
                      : gate === undefined && (id === "approveRoster" || id === "declineRoster")
                        ? genericDecisionExpected(rosterSeen, cell.targets.revision)
                        : gate === undefined && INVITATION_JUDGED.has(id)
                          ? NEUTRAL
                          : gate === undefined && id === "listMembers"
                            ? membersExpected(membersSeen, cell.w.club)
                            : gate === undefined && id === "getClub"
                              ? clubExpected(clubSeen, cell.w.club)
                              : gate === undefined && id === "createClub"
                                ? CREATE_CLUB_NO_BODY
                                : gate === undefined && id === "leaveClub"
                                  ? LEAVE_NO_BODY
                                  : gate !== undefined || !SCHEDULE_JUDGED.has(id)
                                    ? cellExpected(session, spec.operation, seen)
                                    : id === "getSchedule"
                                      ? weekExpected(scheduleSeen, cell.w.club)
                                      : commandExpected(
                                          scheduleSeen,
                                          id as ScheduleCommand,
                                          cell.targets.proposal,
                                          startVersion,
                                        );
            counted.cells += 1;
            counted.expectedAnswers += 1 + guessCount(spec);
            record(await cellStep(app, spec, expected));
            if (phase === "collecting") {
              counted.expectedAnswers += manipulations(spec, cell.w.ben.interval, CLAIMED).length;
              record(await manipulationStep(app, spec, cell.w.ben.interval, CLAIMED, expected));
            }
            // A leave has no body that changes nothing, so the cell's own club is asked with none (the
            // contract refuses it, above) and the guessed and malformed clubs with a choice, past the body's check.
            const guessing: Spec =
              id === "leaveClub"
                ? {
                    ...spec,
                    headers: { ...spec.headers, "content-type": "application/json" },
                    body: JSON.stringify({ contributions: "keep" }),
                  }
                : spec;
            const guessed = await guessStep(app, guessing, elsewhere, gate);
            record(guessed);
            // A malformed id or cursor gets the same answer in every state and phase, for every role the gate treats alike (T14).
            for (const [request, answer] of guessed.malformed) {
              const key = `${gate === undefined ? "through the gate" : String(gate.status)}: ${request}`;
              const first = malformed.get(key);
              if (first === undefined) malformed.set(key, { answer, role: role.name });
              else if (first.answer !== answer)
                wrong.push(`${state.name}, ${phase}, ${request}: ${answer}, but the ${first.role} got ${first.answer}`);
            }
          }
          // updateMe's table of bodies: refusals first, then the changes, after which the world is read again.
          const update = specs.find((spec) => spec.operation.id === "updateMe");
          if (update === undefined) throw new Error("the contract has no updateMe");
          const own: Own = {
            pending: cell.pending,
            ready: cell.ready,
            foreign: elsewhere.avatar,
            photo: cell.photo,
            guessed: freshId(),
            name: `${named(cell.w, "Renamed")} ${String(index)}`,
          };
          const sameBytes = new Map<string, string>();
          for (const one of updateMeCases(session, own, index === phases.length - 1)) {
            const [row] = await db<{ version: number }[]>`SELECT version FROM app.users WHERE id = ${cell.viewer}`;
            const { body, expected } = one.request(row?.version ?? -1);
            const sent: Spec = { ...update, headers: { ...update.headers, "content-type": "application/json" }, body };
            counted.expectedBodies += 1;
            counted.expectedAnswers += 1;
            const step = await cellStep(app, sent, expected);
            counted.bodies += 1;
            const first = step.answers[0];
            if (one.group !== undefined && first !== undefined) {
              const before = sameBytes.get(one.group);
              if (before === undefined) sameBytes.set(one.group, said(first.answer));
              else if (before !== said(first.answer))
                wrong.push(`${state.name}, ${phase}, updateMe, ${one.name}: another answer than its group's (T14)`);
            }
            if (one.mutates) facts = await load();
            record({ ...step, problems: step.problems.map((problem) => `${problem} (${one.name})`) });
          }
          // The schedule commands' table of bodies (schedule.ts): what the contract refuses, each refusal in
          // its order, requests that change nothing and, in the last phase, the viewer's own choice and
          // confirmation. Each answer is judged from the rows before the request and the rows after it.
          // The gate is read from the account's row again: the viewer's own updates above may have finished
          // their profile.
          const [profile] = await db<{ state: string; age_confirmed: boolean; name: string | null }[]>`
            SELECT state, age_confirmed_at IS NOT NULL AS age_confirmed, display_name AS name
              FROM app.users WHERE id = ${cell.viewer}`;
          if (profile === undefined) throw new Error("the role's account is gone");
          const sessionNow = sessionOf({
            state: profile.state,
            ageConfirmed: profile.age_confirmed,
            name: profile.name,
          });
          // createClub's table of bodies (club.ts): what the contract refuses, then one club made, its retry
          // and another body under its key. The club it makes joins the clubs the facts are read from, and its
          // creator then reads it with getClub.
          const create = specs.find((spec) => spec.operation.id === "createClub");
          const read = specs.find((spec) => spec.operation.id === "getClub");
          if (create === undefined || read === undefined) throw new Error("the contract has no createClub or getClub");
          const clubName = `${named(cell.w, "Made")} ${String(index)}`;
          let createdSaid: string | undefined;
          for (const one of createClubCases(clubName)) {
            const request = render({
              ...create,
              headers: { ...create.headers, "content-type": "application/json" },
              body: one.body,
            });
            if (one.key === null) delete request.headers["idempotency-key"];
            else request.headers["idempotency-key"] = one.key;
            counted.expectedBodies += 1;
            counted.expectedAnswers += 1;
            const answer = await answerOf(app, request);
            counted.bodies += 1;
            const problems: string[] = [];
            const gate = gateOf(sessionNow, create.operation);
            let club: string | undefined;
            if (gate !== undefined) problems.push(...pinnedProblems(answer, gate));
            else if (one.expected === "created") {
              club = createdClubId(answer);
              if (club === undefined) problems.push(`status ${String(answer.status)}, not 201 with a new club`);
              else {
                clubs.push(club);
                made.push(club);
                facts = await load();
                schedule = await loadSchedule();
                clubRows = await loadClubRows();
                const want = clubFor(schedule, clubRows, club, cell.viewer, now, clubSeen().daysOf);
                if (want === undefined) problems.push("the creator can't read the club just made");
                else problems.push(...sameDetail(201, want)(answer), ...newClubProblems(answer, clubName));
                createdSaid = said(answer);
              }
            } else if (one.expected === "replay") {
              // A retry under its key is the first answer, byte for byte at the same server time (T19), and
              // makes no second club: the viewer's clubs are judged again below and in the next phase.
              if (createdSaid === undefined || createdSaid !== said(answer))
                problems.push("a retry under its key got another answer than the first (T19)");
            } else problems.push(...pinnedProblems(answer, one.expected));
            record({
              problems: problems.map((problem) => `createClub: ${problem} (${one.name})`),
              answers: [{ spec: { ...create, body: one.body }, answer }],
            });
            if (club !== undefined) {
              // The new club, read by its creator, and the creator's clubs, which now hold it once.
              counted.expectedAnswers += 2;
              record(await cellStep(app, { ...read, path: { club_id: club } }, clubExpected(clubSeen, club)));
              const list = specs.find((spec) => spec.operation.id === "listClubs");
              if (list === undefined) throw new Error("the contract has no listClubs");
              record(await cellStep(app, list, cellExpected(sessionNow, list.operation, seen)));
              // Someone of another club asks for the new club: a proposed club of one is nobody else's (T14).
              const asked = render({ ...read, path: { club_id: club } });
              asked.headers["authorization"] = outsider;
              counted.expectedBodies += 1;
              counted.expectedAnswers += 1;
              const theirs = await answerOf(app, asked);
              counted.bodies += 1;
              record({
                problems: pinnedProblems(theirs, NEUTRAL).map(
                  (problem) => `getClub: ${problem} (the new club, asked for by someone of another club)`,
                ),
                answers: [{ spec: { ...read, path: { club_id: club } }, answer: theirs }],
              });
            }
          }
          // One club for each table the gate let through, counted from the rows: the retry and the refused
          // bodies made none.
          if (gateOf(sessionNow, create.operation) === undefined) tablesThrough += 1;
          const [creations] = await db<{ n: number }[]>`
            SELECT count(*)::int AS n FROM app.memberships WHERE user_id = ${cell.viewer} AND origin = 'creator'`;
          const clubsMade = (creations?.n ?? 0) - createdBefore;
          if (made.length !== tablesThrough || clubsMade !== tablesThrough)
            wrong.push(
              `${state.name}, ${phase}: ${String(clubsMade)} clubs in the rows and ${String(made.length)} answered 201, by ${String(tablesThrough)} tables`,
            );
          // The roster's table (roster.ts): what the contract refuses of a proposal, a stale version, one person
          // proposed, its retry and another body under its key, each judged from the rows before the request;
          // then, for the revision a proposal made, who reads it, who makes its candidate's link and who
          // revokes it. Each request is one answer, counted and scanned.
          const byId = (id: string): Spec => {
            const found = specs.find((spec) => spec.operation.id === id);
            if (found === undefined) throw new Error(`the contract has no ${id}`);
            return found;
          };
          // `as` is the caller's own Authorization; null sends none, as a signed-out page does.
          const sendAs = async (spec: Spec, as?: string | null, key?: string | null): Promise<Answer> => {
            const request = render(spec);
            if (as === null) delete request.headers["authorization"];
            else if (as !== undefined) request.headers["authorization"] = as;
            if (key === null) delete request.headers["idempotency-key"];
            else if (key !== undefined) request.headers["idempotency-key"] = key;
            counted.expectedBodies += 1;
            counted.expectedAnswers += 1;
            const answer = await answerOf(app, request);
            counted.bodies += 1;
            return answer;
          };
          // `as` is the account an answer was given to when it isn't the cell's viewer, null for a caller
          // with no session: the answer is scanned with that caller's own facts, read from the world as it is now.
          const judged = async (
            spec: Spec,
            answer: Answer,
            expected: Expected | string[],
            note: string,
            as?: string | null,
          ) => {
            const problems = Array.isArray(expected)
              ? expected
              : typeof expected === "function"
                ? expected(answer)
                : pinnedProblems(answer, expected);
            const step = {
              problems: problems.map((problem) => `${spec.operation.id}: ${problem} (${note})`),
              answers: [{ spec, answer }],
            };
            if (as === undefined) record(step);
            else {
              roster.otherAnswers += 1;
              const theirs = await factsOf(clubs, as, { accounts: [cell.w.dan.user], secrets: [...secrets] });
              scanner(wrong, `${state.name}, ${phase}`, () => theirs, now, counted)(step);
            }
          };
          const json = (spec: Spec, body: unknown): Spec => ({
            ...spec,
            headers: { ...spec.headers, "content-type": "application/json" },
            body: typeof body === "string" ? body : JSON.stringify(body),
          });
          const propose = byId("proposeRoster");
          const rosterGate = gateOf(sessionNow, propose.operation);
          const rosterVersion = clubRows.get(cell.w.club)?.rosterVersion ?? -1;
          if (rosterGate === undefined && viewerIn(schedule, cell.w.club, cell.viewer) !== undefined) {
            roster.memberPhases += 1;
            memberStates.add(state.name);
          }
          const label = `${named(cell.w, "Proposed")} ${String(index)}`;
          let proposalSaid: string | undefined;
          let revision: string | undefined;
          for (const one of proposeCases(rosterVersion, label)) {
            const sent = json(propose, one.body);
            const outcome = (version: number, people: number) =>
              proposalOutcome(schedule, clubRows, cell.w.club, cell.viewer, version, people);
            const before = one.expected === "proposal" ? outcome(rosterVersion, 1) : undefined;
            if (rosterGate === undefined && before === "created") roster.due += 1;
            roster.proposals += 1;
            const answer = await sendAs(sent, undefined, one.key);
            const problems: string[] = [];
            if (rosterGate !== undefined) problems.push(...pinnedProblems(answer, rosterGate));
            else if (typeof one.expected !== "string") problems.push(...pinnedProblems(answer, one.expected));
            else if (one.expected === "stale") {
              const stale = outcome(rosterVersion + 1, 1);
              if (stale === "created") problems.push("the judge's own stale version is the club's");
              else problems.push(...pinnedProblems(answer, stale));
            } else if (one.expected === "proposal") {
              if (before === undefined) throw new Error("the proposal's outcome wasn't judged before it was sent");
              if (before !== "created") problems.push(...pinnedProblems(answer, before));
              else {
                // The proposal changed the world: the facts and the rows are read again before it is judged.
                facts = await load();
                clubRows = await loadClubRows();
                rosterWorld = await loadRoster();
                const made = clubRows.get(cell.w.club)?.openRevision ?? "";
                const want = revisionFor(schedule, rosterWorld, made, cell.viewer, now);
                const rows = rosterWorld.revisions.get(made);
                if (want === undefined || rows === undefined)
                  problems.push("the proposer can't read the revision just made");
                else {
                  problems.push(...sameAnswer("the new revision", 201, want)(answer));
                  // What a new proposal must say whatever the rows say.
                  const newest = rows.candidates.at(-1);
                  if (rows.state !== "open" || rows.version !== 1)
                    problems.push("a new revision isn't open at version 1");
                  if (newest?.label !== label)
                    problems.push("a new revision's last candidate isn't the person proposed");
                  if (want["my_decision"] !== "approved")
                    problems.push("proposing isn't the proposer's approval (FQ60)");
                  if (rows.decisions.size !== 1)
                    problems.push("a new revision holds another decision than its proposer's");
                  if (clubRows.get(cell.w.club)?.rosterVersion !== rosterVersion + 1)
                    problems.push("a proposal didn't move the club's roster version by one");
                  const open = [...rosterWorld.revisions.values()].filter(
                    (one) => one.club === cell.w.club && one.state === "open",
                  );
                  if (open.length !== 1) problems.push(`${String(open.length)} open revisions after a proposal`);
                  revision = made;
                }
              }
              proposalSaid = said(answer);
            } else if (one.expected === "replay") {
              // A retry under its key is the first answer, byte for byte (T19), and makes no second revision.
              if (proposalSaid === undefined || proposalSaid !== said(answer))
                problems.push("a retry under its key got another answer than the first (T19)");
              const after = await loadRoster();
              if (after.revisions.size !== rosterWorld.revisions.size) problems.push("a retry made a revision");
            } else if (revision !== undefined) problems.push(...pinnedProblems(answer, IDEMPOTENCY_CONFLICT));
            else {
              const two = outcome(rosterVersion, 2);
              if (two === "created") problems.push("the judge's own second body would change the world");
              else problems.push(...pinnedProblems(answer, two));
            }
            await judged(sent, answer, problems, one.name);
          }
          if (revision !== undefined) {
            roster.revisions += 1;
            const made = revision;
            const candidate = rosterWorld.revisions.get(made)?.candidates.at(-1)?.id ?? "";
            const read: Spec = { ...byId("getRosterRevision"), path: { revision_id: made } };
            const link = json(
              { ...byId("createInvitation"), path: { club_id: cell.w.club } },
              { candidate_id: candidate },
            );
            // Who reads the revision: its proposer, another member it lists, and nobody of another club.
            const readByAll = async (note: string) => {
              await judged(read, await sendAs(read), revisionExpected(rosterSeen, made), `${note}, by its proposer`);
              await judged(read, await sendAs(read, outsider), NEUTRAL, `${note}, by someone of another club`);
              if (other !== undefined) {
                await judged(
                  read,
                  await sendAs(read, other.authorization),
                  revisionExpected(rosterSeen, made, other.account),
                  `${note}, by another member`,
                  other.account,
                );
              }
            };
            await readByAll("the new revision");
            // Who makes the candidate's link: nobody but the member who proposed the candidate (T14).
            await judged(link, await sendAs(link, outsider), NEUTRAL, "a link asked for by someone of another club");
            if (other !== undefined) {
              const theirs = linkOutcome(schedule, rosterWorld, cell.w.club, candidate, other.account);
              await judged(
                link,
                await sendAs(link, other.authorization),
                theirs === "made" ? ["the judge lets another member make the link"] : theirs,
                "a link asked for by another member",
                other.account,
              );
            }
            const key = randomUUID();
            const mine = linkOutcome(schedule, rosterWorld, cell.w.club, candidate, cell.viewer);
            const first = await sendAs(link, undefined, key);
            rosterWorld = await loadRoster();
            const linked = madeLink(first, rosterWorld, candidate, now);
            // The one answer that carries the token is scanned against the world that holds the link, before
            // the world keeps the token back; every later answer is scanned after.
            facts = await load();
            await judged(
              link,
              first,
              mine === "made" ? linked.problems : ["the judge refuses its proposer the link"],
              "a link",
            );
            if (linked.token !== undefined) {
              secrets.push(linked.token);
              roster.links += 1;
            }
            facts = await load();
            await judged(
              link,
              await sendAs(link, undefined, key),
              replayedLink(first),
              "the same link request again under its key",
            );
            const links = rosterWorld.links.size;
            if ((await loadRoster()).links.size !== links) wrong.push(`${state.name}, ${phase}: a retry made a link`);
            await readByAll("the revision with its candidate's link");
            // Who revokes it: the same member, each time; and the revision then says so to that member alone.
            const invitation = linked.id ?? freshId();
            const revoke: Spec = { ...byId("revokeInvitation"), path: { invitation_id: invitation } };
            await judged(revoke, await sendAs(revoke, outsider), NEUTRAL, "a revoke by someone of another club");
            if (other !== undefined) {
              await judged(
                revoke,
                await sendAs(revoke, other.authorization),
                revokeExpected(rosterSeen, invitation, other.account),
                "a revoke by another member",
                other.account,
              );
            }
            const revokedOnce = await sendAs(revoke);
            await judged(revoke, revokedOnce, revokeExpected(rosterSeen, invitation), "a revoke");
            rosterWorld = await loadRoster();
            if (rosterWorld.links.get(invitation)?.revoked !== true)
              wrong.push(`${state.name}, ${phase}: a revoke left the link's row as it was`);
            const revokedTwice = await sendAs(revoke);
            await judged(revoke, revokedTwice, revokeExpected(rosterSeen, invitation), "the same revoke again");
            if (said(revokedOnce) !== said(revokedTwice))
              wrong.push(`${state.name}, ${phase}: a repeated revoke got another answer`);
            await readByAll("the revision with its candidate's link revoked");
            // The club, which now names its open revision and has moved its roster version.
            const club = byId("getClub");
            counted.expectedAnswers += 1;
            record(await cellStep(app, club, clubExpected(clubSeen, cell.w.club)));

            // The invitation's table (invitation.ts): a new link for the candidate, held by someone of another
            // club, who previews it, accepts under another name (a new revision, FQ66), accepts that one and
            // waits; the members read, approve and decline; and the holder is told it didn't go ahead. Each
            // answer is judged from the rows before its request, and each step the table means to take is
            // held to the outcome it names, so a judge that agreed with a refusal would fail here. Another
            // member declines at the end, so no roster is applied in a cell: the club's members stay who
            // the cell's other rows expect (the roster applied is on Postgres, tests/src/db/accept-roster.test.ts,
            // and through the app in this file's last test).
            const reload = async () => {
              facts = await load();
              clubRows = await loadClubRows();
              rosterWorld = await loadRoster();
            };
            const where = `${state.name}, ${phase}, the invitation's table`;
            const meant = (step: string, got: unknown, want: unknown) => {
              if (got !== want) wrong.push(`${where}: ${step} was judged ${String(got)}, not ${String(want)}`);
            };
            const stateOf = (answer: Answer): unknown => {
              try {
                return (JSON.parse(answer.body) as Record<string, unknown>)["state"];
              } catch {
                return undefined;
              }
            };
            const relinked = await sendAs(link, undefined, randomUUID());
            rosterWorld = await loadRoster();
            const second = madeLink(relinked, rosterWorld, candidate, now);
            facts = await load();
            await judged(link, relinked, second.problems, "a new link after the revoke");
            const token = second.token;
            const linkId = second.id;
            if (token === undefined || linkId === undefined || other === undefined) {
              wrong.push(`${where}: no second link, or no other member, to run it with`);
            } else {
              secrets.push(token);
              roster.invitations += 1;
              facts = await load();
              const linkSeen = () => ({ schedule, roster: rosterWorld, now });
              const web = json(byId("previewInvitationWeb"), { token });
              const preview = json(byId("previewInvitation"), { token });
              const holder = elsewhere.account;
              const previewAs = async (who: "viewer" | "holder" | "other", want: string, note: string) => {
                const as = who === "viewer" ? undefined : who === "holder" ? outsider : other.authorization;
                const account = who === "viewer" ? cell.viewer : who === "holder" ? holder : other.account;
                const answer = await sendAs(preview, as);
                meant(note, stateOf(answer), want);
                await judged(
                  preview,
                  answer,
                  previewExpected(linkSeen, token, account),
                  note,
                  who === "viewer" ? undefined : account,
                );
              };
              const acceptAs = async (
                who: "viewer" | "holder",
                rev: string,
                version: number,
                want: string,
                note: string,
                key: string = randomUUID(),
              ): Promise<{ sent: Spec; answer: Answer }> => {
                const account = who === "holder" ? holder : cell.viewer;
                const name = who === "holder" ? elsewhere.name : (profile.name ?? "");
                const sent = json(byId("acceptInvitation"), { token, revision_id: rev, expected_version: version });
                const outcome = acceptOutcome(schedule, rosterWorld, token, account, name, rev, version, now);
                const answer = await sendAs(sent, who === "holder" ? outsider : undefined, key);
                let expected: Expected | string[];
                if (typeof outcome !== "string") {
                  expected = outcome;
                  meant(note, (JSON.parse(outcome.body) as { code: string }).code, want);
                } else {
                  meant(note, outcome, want);
                  await reload();
                  expected =
                    outcome === "changed" || outcome === "waiting"
                      ? sameAnswer("the acceptance", 200, { invitation_id: linkId, state: outcome })(answer)
                      : ["the judge says this acceptance joins, and the table applies no roster"];
                }
                await judged(sent, answer, expected, note, who === "holder" ? holder : undefined);
                return { sent, answer };
              };
              // A retry under its key is the first answer, byte for byte, whatever the rows say now (T19).
              const retried = async (first: { sent: Spec; answer: Answer }, key: string, note: string, as?: string) => {
                const answer = await sendAs(first.sent, as === undefined ? undefined : as, key);
                await judged(
                  first.sent,
                  answer,
                  said(answer) === said(first.answer)
                    ? []
                    : ["a retry under its key got another answer than the first (T19)"],
                  note,
                  as === outsider ? holder : as === undefined ? undefined : other.account,
                );
              };
              const decideAs = async (
                command: "approveRoster" | "declineRoster",
                who: "viewer" | "other",
                rev: string,
                version: number,
                want: string,
                note: string,
                key: string = randomUUID(),
              ): Promise<{ sent: Spec; answer: Answer }> => {
                const account = who === "viewer" ? cell.viewer : other.account;
                const sent = json({ ...byId(command), path: { revision_id: rev } }, { expected_version: version });
                const outcome = decisionOutcome(schedule, rosterWorld, rev, account, now, version);
                const before = rosterWorld.revisions.get(rev);
                const versionBefore = clubRows.get(cell.w.club)?.rosterVersion ?? -1;
                const answer = await sendAs(sent, who === "viewer" ? undefined : other.authorization, key);
                let expected: Expected | string[];
                if (typeof outcome !== "string") {
                  expected = outcome;
                  meant(note, (JSON.parse(outcome.body) as { code: string }).code, want);
                } else {
                  meant(note, outcome, want);
                  await reload();
                  const read = revisionFor(schedule, rosterWorld, rev, account, now);
                  const after = rosterWorld.revisions.get(rev);
                  const interval = viewerIn(schedule, cell.w.club, account) ?? "";
                  const problems =
                    read === undefined
                      ? ["whoever decided can't read the revision"]
                      : sameAnswer("the revision after the decision", 200, read)(answer);
                  const moved = (clubRows.get(cell.w.club)?.rosterVersion ?? -1) - versionBefore;
                  if (before === undefined || after === undefined) problems.push("the revision's rows are gone");
                  else if (outcome === "stands") {
                    if (after.state !== before.state || after.version !== before.version || moved !== 0)
                      problems.push("a decision that changes nothing changed the revision or the club");
                    if (after.decisions.size !== before.decisions.size)
                      problems.push("a decision that changes nothing wrote a decision");
                  } else if (command === "approveRoster") {
                    if (after.decisions.get(interval) !== "approved") problems.push("an approval wrote no approval");
                    if (after.decisions.size !== before.decisions.size + 1)
                      problems.push("an approval wrote another decision than its member's");
                    if (after.state !== "open" || after.version !== before.version || moved !== 0)
                      problems.push("an approval others still owe ended the revision or moved a version");
                  } else {
                    if (after.decisions.get(interval) !== "declined") problems.push("a decline wrote no decision");
                    if (after.state !== "did_not_go_ahead" || after.version !== before.version + 1)
                      problems.push("a decline didn't end the revision at its next version");
                    if (moved !== 1) problems.push("a decline didn't move the club's roster version by one");
                    if (after.candidates.some((one) => rosterWorld.candidates.get(one.id)?.state !== "ended"))
                      problems.push("a decline left one of the revision's candidates open");
                    if ((clubRows.get(cell.w.club)?.openRevision ?? null) !== null)
                      problems.push("a decline left the club an open revision");
                  }
                  expected = problems;
                }
                await judged(sent, answer, expected, note, who === "viewer" ? undefined : account);
                return { sent, answer };
              };
              const readAs = async (who: "viewer" | "other", rev: string, note: string) => {
                const spec: Spec = { ...byId("getRosterRevision"), path: { revision_id: rev } };
                const account = who === "viewer" ? cell.viewer : other.account;
                await judged(
                  spec,
                  await sendAs(spec, who === "viewer" ? undefined : other.authorization),
                  revisionExpected(rosterSeen, rev, account),
                  note,
                  who === "viewer" ? undefined : account,
                );
              };
              const versionOf = (rev: string) => rosterWorld.revisions.get(rev)?.version ?? -1;

              // The link, live: the signed-out page reads the inviter's name; its holder the exact roster; a
              // member of the club is told they are one, and can't accept with it.
              const live = await sendAs(web, null);
              if (live.status !== 200) wrong.push(`${where}: a live link's page got ${String(live.status)}`);
              await judged(web, live, webPreviewExpected(linkSeen, token), "a live link, signed out", null);
              await previewAs("holder", "open", "a live link previewed by its holder");
              await previewAs("viewer", "joined", "a live link previewed by its proposer");
              await previewAs("other", "joined", "a live link previewed by another member");
              await acceptAs("viewer", made, versionOf(made), "NOT_FOUND", "a member accepting with a link");
              await acceptAs("holder", made, versionOf(made) + 1, "VERSION_CONFLICT", "accepting at a stale version");

              // Accepted under another name: a new revision under the holder's own name, which nobody has
              // approved or accepted (FQ66, FQ84); the retry is the first answer (T19).
              const acceptKey = randomUUID();
              const renamed = await acceptAs("holder", made, versionOf(made), "changed", "accepting", acceptKey);
              const next = clubRows.get(cell.w.club)?.openRevision ?? "";
              const nextRows = rosterWorld.revisions.get(next);
              if (rosterWorld.revisions.get(made)?.supersededBy !== next || next === made)
                wrong.push(`${where}: the revision accepted under another name isn't superseded by the open one`);
              if (nextRows?.candidates.find((one) => one.id === candidate)?.label !== elsewhere.name)
                wrong.push(`${where}: the new revision doesn't show the holder under their own name (FQ66)`);
              if (nextRows?.decisions.size !== 0 || nextRows.candidates.some((one) => one.acceptedWith !== null))
                wrong.push(`${where}: the new revision carries an approval or an acceptance (FQ84)`);
              if (rosterWorld.links.get(linkId)?.boundTo !== holder)
                wrong.push(`${where}: accepting didn't bind the link to its holder`);
              const rowsBefore = rosterWorld.revisions.size;
              await retried(renamed, acceptKey, "the same acceptance again under its key", outsider);
              if ((await loadRoster()).revisions.size !== rowsBefore) wrong.push(`${where}: a retry made a revision`);
              await previewAs("holder", "changed", "the changed roster previewed by its holder");
              // The members: the old revision names the new one, and takes no decision; the new one is read
              // by those it lists.
              await readAs("viewer", made, "the superseded revision, by its proposer");
              await decideAs(
                "approveRoster",
                "viewer",
                made,
                versionOf(made),
                "ROSTER_CHANGED",
                "approving a superseded revision",
              );
              await readAs("other", next, "the revision under the holder's name, by another member");

              // The holder accepts the roster under their own name, and waits: nothing says who has approved.
              await acceptAs("holder", next, versionOf(next), "waiting", "accepting the changed roster");
              if (
                rosterWorld.revisions.get(next)?.candidates.find((one) => one.id === candidate)?.acceptedWith !== linkId
              )
                wrong.push(`${where}: accepting left the candidate's row on the revision as it was`);
              await previewAs("holder", "waiting", "the accepted roster previewed by its holder");
              const used = await sendAs(web, null);
              await judged(web, used, NEUTRAL, "a used link, signed out", null);
              // The club's roster carries the open revision, as its member reads it.
              const members = byId("listMembers");
              counted.expectedAnswers += 1;
              record(await cellStep(app, members, membersExpected(membersSeen, cell.w.club)));
              if (membersSeen().openRevision(cell.w.club) === undefined)
                wrong.push(`${where}: the judge gives the proposer no open revision in the club's roster`);

              // The proposer approves, once: the retry is the first answer, and a second approval changes nothing.
              const approveKey = randomUUID();
              const approved = await decideAs(
                "approveRoster",
                "viewer",
                next,
                versionOf(next),
                "decides",
                "approving",
                approveKey,
              );
              await retried(approved, approveKey, "the same approval again under its key");
              await decideAs("approveRoster", "viewer", next, versionOf(next), "stands", "approving twice");
              // Another member declines: the revision ends for everyone, and nothing says who declined (T33).
              await decideAs("declineRoster", "other", next, versionOf(next), "decides", "declining");
              await previewAs("holder", "did_not_go_ahead", "the declined roster previewed by its holder");
              await acceptAs(
                "holder",
                next,
                versionOf(next) - 1,
                "VERSION_CONFLICT",
                "accepting a declined roster as it was",
              );
              await acceptAs("holder", next, versionOf(next), "NOT_FOUND", "accepting a declined roster");
              await decideAs("declineRoster", "viewer", next, versionOf(next), "stands", "declining a declined roster");
              await readAs("viewer", next, "the declined revision, by its proposer");
              counted.expectedAnswers += 2;
              record(await cellStep(app, club, clubExpected(clubSeen, cell.w.club)));
              record(await cellStep(app, members, membersExpected(membersSeen, cell.w.club)));
            }
          }
          const last = index === phases.length - 1;
          const scheduleGroups = new Map<string, string>();
          let previous: { key: string; said: string } | undefined;
          for (const one of scheduleCases(cell.targets.proposal, cell.viewer, last)) {
            const command = specs.find((spec) => spec.operation.id === one.command);
            if (command === undefined) throw new Error(`the contract has no ${one.command}`);
            const proposalId =
              one.proposal === "cell"
                ? cell.targets.proposal
                : one.proposal === "elsewhere"
                  ? elsewhere.proposal
                  : freshId();
            const before = schedule;
            const version = before.proposals.get(cell.targets.proposal)?.version ?? -1;
            const made = one.body(before, version);
            const sent: Spec = {
              ...command,
              path: { proposal_id: proposalId },
              body: typeof made === "string" ? made : JSON.stringify(made),
            };
            const request = render(sent);
            if (one.noKey === true) delete request.headers["idempotency-key"];
            if (one.again === true && previous !== undefined) request.headers["idempotency-key"] = previous.key;
            counted.expectedBodies += 1;
            counted.expectedAnswers += 1;
            const answer = await answerOf(app, request);
            counted.bodies += 1;
            schedule = await loadSchedule();
            const problems: string[] = [];
            const gate = gateOf(sessionNow, command.operation);
            if (gate !== undefined) problems.push(...pinnedProblems(answer, gate));
            else if (one.refused !== undefined) problems.push(...pinnedProblems(answer, one.refused));
            else if (typeof made === "string") throw new Error(`${one.name}: a raw body needs its refusal`);
            else {
              const outcome = outcomeOf(before, one.command, proposalId, cell.viewer, made);
              if (outcome !== "ok") problems.push(...pinnedProblems(answer, outcome));
              else {
                const viewer = viewerIn(schedule, cell.w.club, cell.viewer);
                if (viewer === undefined) problems.push("the viewer lost the club by their own request");
                else {
                  problems.push(
                    ...sameBody(
                      "the proposal as the viewer now sees it",
                      proposalFor(schedule, proposalId, viewer),
                    )(answer),
                    ...changeProblems(before, schedule, one.command, proposalId, cell.viewer, made.weekdays),
                  );
                }
              }
              // A caller the proposal doesn't include gets the same bytes whatever they asked of it (T14). The
              // pinned neutral answer has already held each of them to one answer, so this can only fail if
              // that pin is ever loosened: it is kept as the group's own statement, not as the proof.
              if (one.group !== undefined && outcome !== "ok" && pinnedProblems(answer, NEUTRAL).length === 0) {
                const first = scheduleGroups.get(one.group);
                if (first === undefined) scheduleGroups.set(one.group, said(answer));
                else if (first !== said(answer)) problems.push("another answer than its group's (T14)");
              }
            }
            // A retry under its key is the first answer, byte for byte (T19).
            if (one.again === true && previous !== undefined && previous.said !== said(answer))
              problems.push("a retry under its key got another answer than the first (T19)");
            previous = { key: request.headers["idempotency-key"] ?? "", said: said(answer) };
            record({
              problems: problems.map((problem) => `${one.command}: ${problem} (${one.name})`),
              answers: [{ spec: sent, answer }],
            });
          }
          // The roster again, after whatever the viewer changed: a confirmation may have dated nobody's day
          // (no day is made here), but the last one applies the first days and moves the rows to the week's order.
          const rosterSpec = specs.find((spec) => spec.operation.id === "listMembers");
          if (rosterSpec === undefined) throw new Error("the contract has no listMembers");
          counted.expectedAnswers += 1;
          record(
            await cellStep(
              app,
              rosterSpec,
              gateOf(sessionNow, rosterSpec.operation) ?? membersExpected(membersSeen, cell.w.club),
            ),
          );
          // And the week again, after whatever the viewer changed.
          const week = specs.find((spec) => spec.operation.id === "getSchedule");
          if (week === undefined) throw new Error("the contract has no getSchedule");
          counted.expectedAnswers += 1;
          record(
            await cellStep(app, week, gateOf(sessionNow, week.operation) ?? weekExpected(scheduleSeen, cell.w.club)),
          );
          // The leave (leave.ts), last of all in the cell's last phase, since it ends what every other row
          // reads: the viewer leaves the cell's club with a choice, judged from the rows before and after; the
          // retry is the first answer; a new key, and each read of the club, then find nothing (T14).
          if (last) {
            const leave = specs.find((spec) => spec.operation.id === "leaveClub");
            if (leave === undefined) throw new Error("the contract has no leaveClub");
            const choice: Choice = STATES.indexOf(state) % 2 === 0 ? "keep" : "withdraw";
            const sent: Spec = {
              ...leave,
              headers: { ...leave.headers, "content-type": "application/json" },
              body: JSON.stringify({ contributions: choice }),
            };
            const ask = async (key: string): Promise<Answer> => {
              const request = render(sent);
              request.headers["idempotency-key"] = key;
              counted.expectedBodies += 1;
              counted.expectedAnswers += 1;
              const answer = await answerOf(app, request);
              counted.bodies += 1;
              return answer;
            };
            const tell = (answer: Answer, problems: string[], note: string) => {
              record({
                problems: problems.map((problem) => `leaveClub: ${problem} (${note})`),
                answers: [{ spec: sent, answer }],
              });
            };
            const leaveGate = gateOf(sessionNow, leave.operation);
            const outcome = leaveGate ?? leaveOutcome(schedule, cell.w.club, cell.viewer);
            const before = { schedule, roster: rosterWorld, clubs: clubRows };
            // Whether the viewer reads the cell's revision now: its judge refuses the neutral not-found.
            const revisionNow = revisionExpected(rosterSeen, cell.targets.revision);
            const readRevision =
              (typeof revisionNow === "function" ? revisionNow(NEUTRAL) : pinnedProblems(NEUTRAL, revisionNow)).filter(
                (problem) => !problem.startsWith("the headers in another order"),
              ).length > 0;
            const key = randomUUID();
            const first = await ask(key);
            left.asked += 1;
            facts = await load();
            schedule = await loadSchedule();
            clubRows = await loadClubRows();
            rosterWorld = await loadRoster();
            const after = { schedule, roster: rosterWorld, clubs: clubRows };
            if (typeof outcome !== "string") {
              tell(first, pinnedProblems(first, outcome), "a leave by someone the club answers nothing");
              if (canonical(after.clubs.get(cell.w.club)) !== canonical(before.clubs.get(cell.w.club)))
                wrong.push(`${state.name}, ${phase}: a refused leave changed the club's rows`);
              if (canonical([...after.schedule.members]) !== canonical([...before.schedule.members]))
                wrong.push(`${state.name}, ${phase}: a refused leave changed a membership`);
            } else {
              left.left += 1;
              if (readRevision) left.revisions += 1;
              const [row] = await db<
                { state: string; left_at: Temporal.Instant | null; contributions: string | null; name: string | null }[]
              >`
                SELECT state, left_at, contributions, ended_display_name AS name
                  FROM app.memberships WHERE interval_id = ${outcome}`;
              const membership: MembershipRow | undefined =
                row === undefined
                  ? undefined
                  : { state: row.state, leftAt: row.left_at, contributions: row.contributions, endedName: row.name };
              tell(
                first,
                [
                  ...leftExpected(cell.w.club, now, choice)(first),
                  ...leaveProblems(before, after, cell.w.club, outcome, membership, now, choice),
                  ...firstDaysProblems(before.schedule, after.schedule, cell.w.club, outcome),
                  ...weekChangeProblems(
                    before.schedule,
                    after.schedule,
                    cell.w.club,
                    await changeDatesAt(db, cell.w.club, now),
                  ),
                ],
                "the viewer's own leave",
              );
              const again = await ask(key);
              tell(
                again,
                said(again) === said(first) ? [] : ["a retry under its key got another answer than the first (T19)"],
                "the same leave again under its key",
              );
            }
            // Whoever asked, the club now answers them as the rows say: nothing, to someone who left.
            const afresh = await ask(randomUUID());
            tell(
              afresh,
              pinnedProblems(afresh, leaveGate ?? (typeof outcome === "string" ? NEUTRAL : outcome)),
              "a leave under a new key afterwards",
            );
            for (const [id, expected] of [
              ["getClub", () => clubExpected(clubSeen, cell.w.club)],
              ["listMembers", () => membersExpected(membersSeen, cell.w.club)],
              ["getSchedule", () => weekExpected(scheduleSeen, cell.w.club)],
              ["getRosterRevision", () => revisionExpected(rosterSeen, cell.targets.revision)],
            ] as const) {
              const spec = specs.find((one) => one.operation.id === id);
              if (spec === undefined) throw new Error(`the contract has no ${id}`);
              counted.expectedAnswers += 1;
              const want = gateOf(sessionNow, spec.operation) ?? expected();
              // The judge must take the neutral not-found itself, which no 200 it could ask for would.
              // (The constant has no Date header, so its headers' order is the one thing set aside.)
              const neutral = (typeof want === "function" ? want(NEUTRAL) : pinnedProblems(NEUTRAL, want)).filter(
                (problem) => !problem.startsWith("the headers in another order"),
              );
              if (typeof outcome === "string" && neutral.length > 0)
                wrong.push(
                  `${state.name}, ${phase}: the judge of ${id} still gives the club to someone who left: ${neutral.join("; ")}`,
                );
              record(await cellStep(app, spec, want));
            }
          }
        }
      }
      console.log(`${role.name}: ${String(counted.cells)} cells run, ${String(counted.answers)} answers scanned`);
      console.log(`${role.name}, the roster's table: ${JSON.stringify(roster)}`);
      expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
      // Every cell ran: the contract's 72 requests a world (each operation with each value of a
      // required enum, and again with its optional ids), in each of the 7 states and each phase the
      // role has. And every answer was scanned, with the manipulated and guessed requests and the bodies.
      const specsPerWorld = operations.reduce(
        (sum, operation) => sum + specsFor(operation, elsewhere, "Bearer x").length,
        0,
      );
      expect(specsPerWorld).toBe(REQUESTS_PER_WORLD);
      expect(counted.cells).toBe(7 * phases.length * REQUESTS_PER_WORLD);
      expect(counted.bodies).toBe(counted.expectedBodies);
      // In every phase of every state: createClub's eight bodies and the roster's eight proposals.
      expect(counted.bodies).toBeGreaterThanOrEqual(7 * phases.length * 16);
      // The roster's table ran, for every role: its eight proposals in every phase of every state. Every
      // proposal the judge said must make a revision made one. A viewer who is a member the club answers in
      // some phase of a state proposes in the first such phase at least (a later phase may find the club
      // full of the candidates carried; a suspended club answers nobody, so it is no such state). Every
      // revision got its link, and each was read, linked and revoked by another member too (three reads,
      // one link, one revoke: five answers a revision).
      ROSTER_TABLES.set(role.name, roster);
      // The leave ran once in every state, and the roles it left for are named in the test below.
      expect(left.asked).toBe(STATES.length);
      LEAVES.set(role.name, left.left);
      REVISIONS_LOST.set(role.name, left.revisions);
      console.log(`${role.name}, the leave: ${JSON.stringify(left)}`);
      expect(roster.proposals).toBe(STATES.length * phases.length * proposeCases(0, "x").length);
      expect(roster.revisions).toBe(roster.due);
      expect(roster.memberPhases > 0).toBe(memberStates.size > 0);
      expect(roster.revisions).toBeGreaterThanOrEqual(memberStates.size);
      if (roster.memberPhases === 0) expect(roster.revisions).toBe(0);
      expect(roster.links).toBe(roster.revisions);
      expect(roster.invitations).toBe(roster.revisions);
      expect(roster.otherAnswers).toBe(roster.revisions * (5 + INVITATION_OTHER_ANSWERS));
      expect(counted.answers).toBe(counted.expectedAnswers);
      expect(malformed.size).toBeGreaterThan(0);
    });
  }
});

describe("the roster's table ran (tests/src/privacy/roster.ts)", () => {
  it("made revisions and links for the six roles who are members the club answers, and for no other role", () => {
    // Counted here apart from the judges: a table skipped whole would balance every other count. This reads
    // what the role tests above left, so it holds only when the whole file runs, in its order: under `-t`
    // for one role, or after a role's test failed before it stored its table, it fails too.
    expect(ROSTER_TABLES.size).toBe(ROLES.length);
    const made = [...ROSTER_TABLES].filter(([, table]) => table.revisions > 0).map(([name]) => name);
    expect(made).toEqual([
      "author",
      "star",
      "member in the audience",
      "member who joined after the commit (T8)",
      "rejoined member, a new interval (T8)",
      "blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)",
    ]);
  });
});

describe("the leave ran (tests/src/privacy/leave.ts)", () => {
  it("left the club for the roles who are members the club answers in the last phase, and for no other role", () => {
    // As the roster's table above: it reads what the role tests left, so it holds only when the whole file runs.
    expect(LEAVES.size).toBe(ROLES.length);
    expect([...LEAVES].filter(([, states]) => states > 0)).toEqual([
      ["author", 6],
      ["star", 6],
      ["member in the audience", 6],
      ["member who joined after the commit (T8)", 6],
      ["rejoined member, a new interval (T8)", 6],
      ["blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)", 6],
    ]);
    // The world's revision lists the star alone: the star read it until the leave, and nothing after.
    expect([...REVISIONS_LOST].filter(([, states]) => states > 0)).toEqual([["star", 6]]);
  });
});

describe("a roster applied through the app (spec 04; T7, T8, T33; FQ65)", () => {
  // The second time the club's first days are open with nobody confirmed, so the join revises them, and so
  // does a leave after it (FQ55, FQ102): the one place the routes and the scanner meet a revision's rows.
  it.each([
    { firstDays: false, title: "" },
    { firstDays: true, title: ", and revises the open first days for the join and for a leave after it" },
  ])(
    "joins the person who accepted once the last member approves, and answers each caller as the rows say$title",
    async ({ firstDays }) => {
      const wrong: string[] = [];
      const counted = { answers: 0 };
      const w = await db.begin(async (tx) => {
        const made = await newWorld(plain(tx), suffix());
        await twoContributors(tx, made);
        if (firstDays) await addFirstDays(tx, made, false);
        await checkAsAtCommit(plain(tx));
        return made;
      });
      const now = PHASES.collecting;
      clock.set(now);
      const sessionsOf = await db<{ account: string; subject: string; name: string | null; interval: string | null }[]>`
      SELECT u.id AS account, u.auth_subject AS subject, u.display_name AS name,
             (SELECT m.interval_id FROM app.memberships m
               WHERE m.user_id = u.id AND m.club_id = ${w.club} AND m.state = 'active') AS interval
        FROM app.users u
       WHERE u.id = ${w.dan.user}
          OR u.id IN (SELECT user_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active')`;
      const callers = new Map<string, { authorization: string; name: string; interval: string | null }>();
      const secrets: string[] = [];
      for (const row of sessionsOf) {
        const authorization = bearer(await keys.signer.token(row.subject));
        secrets.push(authorization.slice("Bearer ".length));
        callers.set(row.account, { authorization, name: row.name ?? "", interval: row.interval });
      }
      const joiner = w.dan.user;
      const proposer = w.ana.user;
      const others = [...callers].filter(([account, one]) => one.interval !== null && account !== proposer);
      expect(callers.get(joiner)?.interval).toBeNull();
      expect(callers.get(joiner)?.name).not.toBe("");
      expect(others.length).toBeGreaterThanOrEqual(2);
      const clubs = [w.club, elsewhere.club];
      const world = db as unknown as WorldTx;
      let schedule = await scheduleWorldOf(world, clubs);
      let rosterWorld = await rosterWorldOf(world, clubs);
      let clubRows = await clubRowsOf(world, clubs);
      const reload = async () => {
        schedule = await scheduleWorldOf(world, clubs);
        rosterWorld = await rosterWorldOf(world, clubs);
        clubRows = await clubRowsOf(world, clubs);
      };
      const spec = (id: string, path: Record<string, string>, body?: unknown): Spec => {
        const operation = operations.find((one) => one.id === id);
        if (operation === undefined) throw new Error(`the contract has no ${id}`);
        return {
          operation,
          path,
          query: {},
          headers: {
            "idempotency-key": randomUUID(),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        };
      };
      // Each answer, sent as `account` (null: signed out), judged, and scanned with that caller's own facts
      // read from the world after it.
      const ask = async (
        account: string | null,
        sent: Spec,
        expected: (answer: Answer) => Expected | string[],
        note: string,
        key?: string,
      ): Promise<Answer> => {
        const request = render(sent);
        const caller = account === null ? undefined : callers.get(account);
        if (caller !== undefined) request.headers["authorization"] = caller.authorization;
        if (key !== undefined) request.headers["idempotency-key"] = key;
        const answer = await answerOf(app, request);
        await reload();
        const want = expected(answer);
        const problems = Array.isArray(want)
          ? want
          : typeof want === "function"
            ? want(answer)
            : pinnedProblems(answer, want);
        const facts = await factsOf(clubs, account, { secrets: [...secrets] });
        scanner(
          wrong,
          note,
          () => facts,
          now,
          counted,
        )({
          problems: problems.map((problem) => `${sent.operation.id}: ${problem}`),
          answers: [{ spec: sent, answer }],
        });
        return answer;
      };
      const seen = () => ({ schedule, roster: rosterWorld, now });
      const rosterSeen = (account: string) => (): RosterSeen => ({
        schedule,
        account,
        now,
        roster: rosterWorld,
        rows: clubRows,
      });

      // Ana proposes the joiner under the joiner's own profile name, and makes the link.
      const label = callers.get(joiner)?.name ?? "";
      const version = clubRows.get(w.club)?.rosterVersion ?? -1;
      await ask(
        proposer,
        spec("proposeRoster", { club_id: w.club }, { expected_roster_version: version, add: [{ label }] }),
        (answer) => (answer.status === 201 ? [] : [`status ${String(answer.status)}, not 201`]),
        "the proposal",
      );
      const revision = clubRows.get(w.club)?.openRevision ?? "";
      const candidate = rosterWorld.revisions.get(revision)?.candidates.at(-1)?.id ?? "";
      const linked = await ask(
        proposer,
        spec("createInvitation", { club_id: w.club }, { candidate_id: candidate }),
        (answer) => madeLink(answer, rosterWorld, candidate, now).problems,
        "the link",
      );
      const token = madeLink(linked, rosterWorld, candidate, now).token ?? "";
      expect(token).not.toBe("");
      secrets.push(token);
      const preview = () => spec("previewInvitation", {}, { token });
      const accept = (at: number) =>
        spec("acceptInvitation", {}, { token, revision_id: revision, expected_version: at });
      const stateOf = (answer: Answer) => (JSON.parse(answer.body) as Record<string, unknown>)["state"];

      // The joiner previews the exact roster and accepts it: waiting, while the members haven't all approved.
      const opened = await ask(joiner, preview(), () => previewExpected(seen, token, joiner), "the joiner's preview");
      expect(stateOf(opened)).toBe("open");
      const acceptKey = randomUUID();
      const before = acceptOutcome(schedule, rosterWorld, token, joiner, label, revision, 1, now);
      expect(before).toBe("waiting");
      const waited = await ask(
        joiner,
        accept(1),
        () =>
          sameAnswer("the acceptance", 200, {
            invitation_id:
              linked.body === "" ? "" : (JSON.parse(linked.body) as { invitation_id: string }).invitation_id,
            state: "waiting",
          }),
        "the joiner's acceptance",
        acceptKey,
      );
      expect(
        stateOf(await ask(joiner, preview(), () => previewExpected(seen, token, joiner), "the joiner waits")),
      ).toBe("waiting");

      // Each other member approves: the revision stays open until the last, whose approval applies it.
      const unjoined = schedule;
      for (const [index, [account]] of others.entries()) {
        const last = index === others.length - 1;
        expect(decisionOutcome(schedule, rosterWorld, revision, account, now, 1)).toBe("decides");
        const answer = await ask(
          account,
          spec("approveRoster", { revision_id: revision }, { expected_version: 1 }),
          () => {
            const want = revisionFor(schedule, rosterWorld, revision, account, now);
            return want === undefined
              ? ["the member can't read the revision they approved"]
              : sameAnswer("the revision", 200, want);
          },
          `approval ${String(index + 1)}`,
        );
        expect(stateOf(answer)).toBe(last ? "applied" : "open");
      }

      // Applied: the joiner is a member, with a new interval that joined by this revision (T8); the club's
      // roster version moved once; the revision is at its next version; nothing is left open.
      const [joined] = await db<{ interval: string; via: string | null; origin: string }[]>`
      SELECT interval_id AS interval, joined_via_revision_id AS via, origin FROM app.memberships
       WHERE club_id = ${w.club} AND user_id = ${joiner} AND state = 'active'`;
      expect(joined).toMatchObject({ via: revision, origin: "roster" });
      // The club's first days after the join, row by row: revised to include the new member when nobody had
      // confirmed, and no proposal made or changed when none were open.
      wrong.push(
        ...firstDaysJoinProblems(unjoined, schedule, w.club, [joined?.interval ?? ""]).map(
          (problem) => `the join: ${problem}`,
        ),
        ...weekChangeProblems(unjoined, schedule, w.club, await changeDatesAt(db, w.club, now)).map(
          (problem) => `the join: ${problem}`,
        ),
      );
      expect(rosterWorld.revisions.get(revision)).toMatchObject({ state: "applied", version: 2 });
      expect(clubRows.get(w.club)).toMatchObject({ rosterVersion: version + 2, openRevision: null });
      expect(rosterWorld.candidates.get(candidate)?.state).toBe("joined");

      // The joiner now: the link says joined, with the club; the retry is still the first answer (T19); the
      // revision named as it ended says joined; the club's roster lists them; the signed-out page says nothing.
      const club = {
        id: w.club,
        name: schedule.clubs.get(w.club)?.name,
        timezone: schedule.clubs.get(w.club)?.timezone,
      };
      expect(
        stateOf(await ask(joiner, preview(), () => previewExpected(seen, token, joiner), "the joiner, joined")),
      ).toBe("joined");
      const retry = await ask(
        joiner,
        accept(1),
        (answer) => (said(answer) === said(waited) ? [] : ["a retry got another answer (T19)"]),
        "the acceptance again",
        acceptKey,
      );
      expect(stateOf(retry)).toBe("waiting");
      expect(acceptOutcome(schedule, rosterWorld, token, joiner, label, revision, 2, now)).toBe("joined again");
      await ask(
        joiner,
        accept(2),
        () =>
          sameAnswer("the acceptance", 200, {
            invitation_id: (JSON.parse(waited.body) as { invitation_id: string }).invitation_id,
            state: "joined",
            club: { ...club, my_membership_id: joined?.interval },
          }),
        "accepting the applied roster again",
      );
      const facts = await factsOf(clubs, joiner, { secrets: [...secrets] });
      await ask(
        joiner,
        spec("listMembers", { club_id: w.club }),
        () =>
          membersExpected(
            () => ({
              schedule,
              account: joiner,
              now,
              nextOf: (star) => daysOf(facts.world, w.club, now, star).next,
              openRevision: () => undefined,
            }),
            w.club,
          ),
        "the club's roster, by its new member",
      );
      // FQ119: the applied revision lists the members who approved it, not the person it brought in.
      await ask(
        joiner,
        spec("getRosterRevision", { revision_id: revision }),
        () => NEUTRAL,
        "the revision, by its new member",
      );
      await ask(
        proposer,
        spec("getRosterRevision", { revision_id: revision }),
        () => revisionExpected(rosterSeen(proposer), revision, proposer),
        "the applied revision, by its proposer",
      );
      await ask(null, spec("previewInvitationWeb", {}, { token }), () => NEUTRAL, "the used link, signed out");
      await ask(proposer, preview(), () => previewExpected(seen, token, proposer), "the used link, by its proposer");

      if (firstDays) {
        // The revised week, as the new member and as a member who was there read it: each from the rows.
        const weekOf = (account: string) => () => weekExpected(() => ({ schedule, account, now }), w.club);
        const mine = (answer: Answer) =>
          (JSON.parse(answer.body) as { proposal?: { version?: unknown; my_days?: unknown } }).proposal;
        const revised = await ask(joiner, spec("getSchedule", { club_id: w.club }), weekOf(joiner), "the week, joined");
        expect(mine(revised)).toMatchObject({ version: 2 });
        expect((mine(revised)?.my_days as unknown[]).length).toBe(1);
        await ask(proposer, spec("getSchedule", { club_id: w.club }), weekOf(proposer), "the week, by its proposer");
        // A member who was there leaves: a revision again, without them, judged row by row; the club then
        // answers the leaver nothing, and those who stay their week with nobody who left in it.
        const [leaver, gone] = others[0] ?? ["", { interval: null }];
        const stayed = schedule;
        await ask(
          leaver,
          spec("leaveClub", { club_id: w.club }, { contributions: "keep" }),
          () => leftExpected(w.club, now, "keep"),
          "a member's leave",
        );
        wrong.push(
          ...firstDaysProblems(stayed, schedule, w.club, gone.interval ?? "").map((problem) => `the leave: ${problem}`),
          ...weekChangeProblems(stayed, schedule, w.club, await changeDatesAt(db, w.club, now)).map(
            (problem) => `the leave: ${problem}`,
          ),
        );
        await ask(leaver, spec("getSchedule", { club_id: w.club }), () => NEUTRAL, "the week, by the member who left");
        const again = await ask(joiner, spec("getSchedule", { club_id: w.club }), weekOf(joiner), "the week, after it");
        expect(mine(again)).toMatchObject({ version: 3 });
        expect((mine(again)?.my_days as unknown[]).length).toBe(2);
        // The world's week in force keeps the leaver's day, named (FQ102); the first days name them nowhere.
        expect(JSON.stringify(mine(again))).not.toContain(gone.interval ?? "none");
        await ask(
          proposer,
          spec("getSchedule", { club_id: w.club }),
          weekOf(proposer),
          "the proposer's week, after it",
        );
      }

      expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
      expect(counted.answers).toBe(13 + others.length + (firstDays ? 6 : 0));
    },
  );
});

describe("a new member's pick through the app (spec 05; T9, T14, T19, T33; FQ125 to FQ127, FQ129 to FQ131)", () => {
  // The one place the routes and the scanner meet a pick. The club is made by the commands themselves
  // (../db/club-world.ts): Ben and Maya confirmed their first days, the days were made, and Alex joined, so a
  // pick is open for Alex alone. Each answer is judged from the rows (schedule.ts) and scanned with its
  // caller's own facts, at three instants: before any day has opened; during Maya's open Friday, when Sam
  // joins (four take one day each, and the two free days are enough for Alex and Sam, so nobody's day is
  // freed and the pick is replaced) and Maya leaves (replacing it again), and the two new members confirm,
  // which leaves all six days held; and when Omar joins as a fourth, which frees the others' second days from
  // next week, their days then cancelled, and Thursday 19 November, a freed day's date, in the morning. What
  // each join and leave did to the week and the pick is judged row by row, and the freed days' statuses and
  // the club's next day by their literal dates. Then a member's account is being deleted, and the club is
  // suspended.
  it("answers each caller the pick as the rows say, asks nobody already in the week, and replaces it as the club's size changes", async () => {
    const wrong: string[] = [];
    const counted = { answers: 0 };
    const world = db as unknown as WorldTx;
    // Wednesday 11 November 2026, midnight in New York, the club's zone.
    const start = Temporal.Instant.from("2026-11-11T05:00:00Z");
    const tag = suffix();
    const [ben, maya, alex, sam, omar] = [`Ben${tag}`, `Maya${tag}`, `Alex${tag}`, `Sam${tag}`, `Omar${tag}`];
    const built = await db.begin(async (tx) => {
      clock.set(start);
      const c = await foundedBy(tx, clock, ben);
      clock.set(start.add({ minutes: 1 }));
      await joinAs(tx, clock, c, maya, ben);
      await confirmOwnDays(tx, clock, c, ben);
      await confirmOwnDays(tx, clock, c, maya);
      clock.set(start.add({ hours: 1 }));
      await tx.savepoint((sp) => makeDays(sp, clock, c.club));
      await checkAsAtCommit(plain(tx));
      const before = await scheduleWorldOf(tx, [c.club]);
      const joinedAt = start.add({ hours: 1, minutes: 1 });
      clock.set(joinedAt);
      await joinAs(tx, clock, c, alex, ben);
      await checkAsAtCommit(plain(tx));
      const after = await scheduleWorldOf(tx, [c.club]);
      // The join: a pick for Alex, judged from the rows before and after it.
      wrong.push(
        ...weekChangeProblems(before, after, c.club, await changeDatesAt(tx, c.club, joinedAt)).map(
          (problem) => `Alex's join: ${problem}`,
        ),
      );
      const stranger = await newUser(plain(tx), `Nina${tag}`);
      return { c, stranger };
    });
    const { c, stranger } = built;
    const club = c.club;
    // Two hours in, before any day of the club has opened; later, the Friday of that week, during a day.
    let now = start.add({ hours: 2 });
    clock.set(now);
    const today = async () => (await changeDatesAt(db, club, now)).today;
    const account = (name: string) => c.user[name] ?? "";
    // Sam and Omar join later: accounts made now, so the callers can be signed in from the start.
    const samsAccount = await newUser(plain(world), sam);
    const omarsAccount = await newUser(plain(world), omar);
    const accounts = [
      account(ben),
      account(maya),
      account(alex),
      samsAccount,
      omarsAccount,
      stranger,
      elsewhere.account,
    ];
    const subjects = await db<{ account: string; subject: string }[]>`
      SELECT id AS account, auth_subject AS subject FROM app.users WHERE id IN ${db(accounts)}`;
    const callers = new Map<string, string>();
    const secrets: string[] = [];
    for (const row of subjects) {
      const authorization = bearer(await keys.signer.token(row.subject));
      secrets.push(authorization.slice("Bearer ".length));
      callers.set(row.account, authorization);
    }
    expect(callers.size).toBe(7);
    const clubs = [club, elsewhere.club];
    let schedule = await scheduleWorldOf(world, clubs);
    const spec = (id: string, path: Record<string, string>, body?: unknown): Spec => {
      const operation = operations.find((one) => one.id === id);
      if (operation === undefined) throw new Error(`the contract has no ${id}`);
      return {
        operation,
        path,
        query: {},
        headers: {
          "idempotency-key": randomUUID(),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      };
    };
    // Each answer, sent as `as` (null: signed out), judged from the rows after it, and scanned with that
    // caller's own facts.
    const ask = async (
      as: string | null,
      sent: Spec,
      expected: (answer: Answer, facts: Facts) => Expected | string[],
      note: string,
      key?: string,
    ): Promise<Answer> => {
      const request = render(sent);
      const authorization = as === null ? undefined : callers.get(as);
      if (authorization !== undefined) request.headers["authorization"] = authorization;
      if (key !== undefined) request.headers["idempotency-key"] = key;
      const answer = await answerOf(app, request);
      schedule = await scheduleWorldOf(world, clubs);
      const facts = await factsOf(clubs, as, {
        accounts: [stranger, samsAccount, omarsAccount],
        secrets: [...secrets],
      });
      const want = expected(answer, facts);
      const problems = Array.isArray(want)
        ? want
        : typeof want === "function"
          ? want(answer)
          : pinnedProblems(answer, want);
      scanner(
        wrong,
        note,
        () => facts,
        now,
        counted,
      )({
        problems: problems.map((problem) => `${sent.operation.id}: ${problem}`),
        answers: [{ spec: sent, answer }],
      });
      return answer;
    };
    const openPick = () => [...schedule.proposals].find(([, each]) => each.club === club && each.state === "open");
    const first = openPick()?.[0] ?? "";
    expect(schedule.proposals.get(first)).toMatchObject({ reason: "membership_change", version: 1 });
    // getSchedule and listClubs, as the rows and the club's days say.
    const week = (as: string | null, note: string) =>
      ask(
        as,
        spec("getSchedule", { club_id: club }),
        () => weekExpected(() => ({ schedule, account: as, now }), club),
        note,
      );
    const clubsOf = (as: string, note: string) =>
      ask(
        as,
        spec("listClubs", {}),
        (_answer, facts) => clubsJudge(() => ({ world: facts.world, viewer: facts.viewer, now })),
        note,
      );
    const proposalIn = (answer: Answer) =>
      (JSON.parse(answer.body) as { proposal?: Record<string, unknown> }).proposal ?? null;
    // A command, judged by `outcomeOf` on the rows before it; an accepted one by the rows after it too.
    const command = async (
      as: string | null,
      id: ScheduleCommand,
      proposal: string,
      body: {
        expected_version: number;
        weekdays: readonly ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday")[];
      },
      note: string,
      key?: string,
    ): Promise<Answer> => {
      const before = schedule;
      const outcome = as === null ? UNAUTHENTICATED : outcomeOf(before, id, proposal, as, body);
      const date = await today();
      return ask(
        as,
        spec(id, { proposal_id: proposal }, body),
        (answer) => {
          if (outcome !== "ok") return outcome;
          const viewer = viewerIn(schedule, club, as) ?? "";
          return [
            ...sameBody("the proposal", proposalFor(schedule, proposal, viewer))(answer),
            ...changeProblems(before, schedule, id, proposal, as, body.weekdays, date, now),
          ];
        },
        note,
        key,
      );
    };
    const status = async (answer: Promise<Answer>) => (await answer).status;

    // Reading it: the members already in the week see none, the new member sees it, and nobody else anything.
    const bens = await week(account(ben), "the week, by a member already in it");
    expect(proposalIn(bens)).toBeNull();
    const mayas = await week(account(maya), "the week, by another member already in it");
    expect(proposalIn(mayas)).toBeNull();
    const alexes = await week(account(alex), "the week, by the new member");
    expect(proposalIn(alexes)).toMatchObject({ id: first, my_days: ["wednesday", "saturday"], my_state: "choosing" });
    for (const [who, note] of [
      [stranger, "a stranger"],
      [elsewhere.account, "a member of another club"],
    ] as const) {
      expect((await week(who, `the week, by ${note}`)).status).toBe(404);
      const days = { expected_version: 1, weekdays: ["wednesday", "saturday"] } as const;
      expect(await status(command(who, "confirmScheduleDays", first, days, `a confirmation by ${note}`))).toBe(404);
    }
    await ask(null, spec("getSchedule", { club_id: club }), () => UNAUTHENTICATED, "the week, signed out");
    await command(null, "confirmScheduleDays", first, { expected_version: 1, weekdays: ["monday"] }, "signed out");
    // The members already in the week aren't in it (FQ126): the neutral answer, as to a stranger (T14).
    const bensDays = { expected_version: 1, weekdays: ["monday", "thursday"] } as const;
    expect(await status(command(account(ben), "confirmScheduleDays", first, bensDays, "Ben's confirmation"))).toBe(404);
    expect(
      await status(
        command(account(maya), "chooseScheduleDays", first, { ...bensDays, weekdays: ["tuesday"] }, "Maya's choice"),
      ),
    ).toBe(404);

    // Refused in the contract's order, for the new member.
    const alexsDays = { expected_version: 1, weekdays: ["wednesday", "saturday"] } as const;
    expect(
      await status(
        command(account(alex), "confirmScheduleDays", first, { ...alexsDays, expected_version: 2 }, "a version"),
      ),
    ).toBe(409);
    expect(
      await status(command(account(alex), "confirmScheduleDays", first, bensDays, "a confirmation of Ben's days")),
    ).toBe(403);
    expect(
      await status(
        command(
          account(alex),
          "chooseScheduleDays",
          first,
          { ...alexsDays, weekdays: ["tuesday"] },
          "a choice of Maya's day",
        ),
      ),
    ).toBe(403);
    expect(
      await status(
        command(
          account(alex),
          "confirmScheduleDays",
          first,
          { ...alexsDays, weekdays: ["wednesday"] },
          "one day of two",
        ),
      ),
    ).toBe(403);
    // Alex chooses Saturday alone, then both again: nothing moves for anyone else (T33).
    const key = randomUUID();
    const chosen = await command(
      account(alex),
      "chooseScheduleDays",
      first,
      { ...alexsDays, weekdays: ["saturday"] },
      "a choice",
      key,
    );
    expect(JSON.parse(chosen.body)).toMatchObject({ version: 1, my_days: ["saturday"] });
    await ask(
      account(alex),
      spec("chooseScheduleDays", { proposal_id: first }, { ...alexsDays, weekdays: ["saturday"] }),
      (answer) => (said(answer) === said(chosen) ? [] : ["a retry got another answer (T19)"]),
      "the choice again, under its key",
      key,
    );
    expect(await status(command(account(alex), "chooseScheduleDays", first, alexsDays, "the days again"))).toBe(200);
    expect(said(await week(account(ben), "the week, after the new member chose"))).toBe(said(bens));
    expect(said(await week(account(maya), "the week, after the new member chose, again"))).toBe(said(mayas));

    // Friday 13 November, noon in New York: Maya's Friday is open. Sam joins: four members take one day each,
    // and Wednesday and Saturday, the two days nobody has, are enough for Alex and Sam, so Ben and Maya keep
    // both their days (FQ125, FQ131), no week is written, and the pick is replaced for one day each.
    now = Temporal.Instant.from("2026-11-13T17:00:00Z");
    clock.set(now);
    const unjoined = schedule;
    await db.begin(async (tx) => {
      await joinAs(tx, clock, c, sam, ben, samsAccount);
      await checkAsAtCommit(plain(tx));
    });
    schedule = await scheduleWorldOf(world, clubs);
    wrong.push(
      ...weekChangeProblems(unjoined, schedule, club, await changeDatesAt(db, club, now)).map(
        (problem) => `Sam's join: ${problem}`,
      ),
    );
    const second = openPick()?.[0] ?? "";
    expect(second).not.toBe(first);
    expect(schedule.proposals.get(first)).toMatchObject({ state: "superseded", replacedBy: second });
    expect(schedule.proposals.get(second)).toMatchObject({ daysPerMember: 1, version: 1 });
    await clubsOf(account(ben), "the clubs, by a member already in the week, during the open day");
    await week(account(ben), "the week, after the fourth member joined");
    expect(proposalIn(await week(account(sam), "the week, by the fourth member"))).toMatchObject({
      id: second,
      my_days: ["saturday"],
    });
    const replaced = await command(account(alex), "confirmScheduleDays", first, alexsDays, "the replaced pick");
    expect(JSON.parse(replaced.body)).toEqual({ code: "MEMBERSHIP_CHANGED", current_id: second });
    // Sam, whom the first pick never included, and Ben, whom neither does, get the neutral answer (T14).
    expect(await status(command(samsAccount, "confirmScheduleDays", first, alexsDays, "Sam, on the first pick"))).toBe(
      404,
    );
    expect(
      await status(
        command(
          account(ben),
          "confirmScheduleDays",
          second,
          { ...bensDays, weekdays: ["monday"] },
          "Ben, on the second",
        ),
      ),
    ).toBe(404);

    // Maya leaves during the open day: three members take two days each again. Nobody's days come back; Alex
    // and Sam pick two each in a third pick, each holding first the day they held in the second: Alex's
    // Wednesday and Sam's Saturday (FQ125, FQ126; FQ131's reading of a replaced pick).
    const stayed = schedule;
    await ask(
      account(maya),
      spec("leaveClub", { club_id: club }, { contributions: "keep" }),
      () => leftExpected(club, now, "keep"),
      "a member's leave",
    );
    wrong.push(
      ...weekChangeProblems(stayed, schedule, club, await changeDatesAt(db, club, now)).map(
        (problem) => `Maya's leave: ${problem}`,
      ),
      ...firstDaysProblems(stayed, schedule, club, c.member[maya] ?? "").map((problem) => `Maya's leave: ${problem}`),
    );
    const third = openPick()?.[0] ?? "";
    expect(third).not.toBe(second);
    expect(schedule.proposals.get(second)).toMatchObject({ state: "superseded", replacedBy: third });
    expect((await week(account(maya), "the week, by the member who left")).status).toBe(404);
    for (const id of [first, second]) {
      const named = await command(account(alex), "confirmScheduleDays", id, alexsDays, "an earlier pick");
      expect(JSON.parse(named.body)).toEqual({ code: "MEMBERSHIP_CHANGED", current_id: third });
    }
    const alexNow = proposalIn(await week(account(alex), "the week, after the leave"));
    expect(alexNow).toMatchObject({ id: third, version: 1, my_days: ["tuesday", "wednesday"] });
    expect(proposalIn(await week(samsAccount, "the week, by the fourth member, after the leave"))).toMatchObject({
      id: third,
      my_days: ["friday", "saturday"],
    });
    // Nothing of the third pick names Maya.
    expect(JSON.stringify(alexNow)).not.toContain(c.member[maya] ?? "none");

    // Alex and Sam confirm: each a new week, Alex's days from Tuesday 17 and Wednesday 18 November; Sam's
    // confirmation applies the pick.
    const alexsNew = { expected_version: 1, weekdays: ["tuesday", "wednesday"] } as const;
    const alexConfirmed = await command(
      account(alex),
      "confirmScheduleDays",
      third,
      alexsNew,
      "the new member's confirmation",
    );
    expect(JSON.parse(alexConfirmed.body)).toMatchObject({ state: "open", version: 1, my_state: "confirmed" });
    const samsNew = { expected_version: 1, weekdays: ["friday", "saturday"] } as const;
    const samConfirmed = await command(samsAccount, "confirmScheduleDays", third, samsNew, "the last confirmation");
    expect(JSON.parse(samConfirmed.body)).toMatchObject({ state: "applied", version: 2, my_state: "confirmed" });
    await week(account(ben), "the week, once the pick applied");
    await clubsOf(account(alex), "the clubs, by a new member");

    // Ben, Alex and Sam hold all six days. Omar joins: no day is free for a fourth, so each keeps their first
    // day from Monday (Ben's Monday, Alex's Tuesday, Sam's Friday), and the others leave the week from next
    // week, their days then cancelled (the founder's answer on three to four members, FQ131). Ben's Thursdays
    // were made at the start, four weeks ahead. Omar joins a minute after the others' confirmations, so after
    // Sam by the clock, not by their ids: the fourth to join is the fourth in spec 05's table, whose day is
    // Thursday, one of the three freed.
    now = now.add({ minutes: 1 });
    clock.set(now);
    const beforeOmar = schedule;
    await db.begin(async (tx) => {
      await joinAs(tx, clock, c, omar, ben, omarsAccount);
      await checkAsAtCommit(plain(tx));
    });
    schedule = await scheduleWorldOf(world, clubs);
    wrong.push(
      ...weekChangeProblems(beforeOmar, schedule, club, await changeDatesAt(db, club, now)).map(
        (problem) => `Omar's join: ${problem}`,
      ),
    );
    const bensThursdays = await db<{ local_date: string; status: string }[]>`
      SELECT local_date::text AS local_date, status FROM app.occurrences
       WHERE club_id = ${club} AND star_interval_id = ${c.member[ben] ?? ""} AND EXTRACT(isodow FROM local_date) = 4
       ORDER BY local_date`;
    expect(bensThursdays).toEqual([
      { local_date: "2026-11-12", status: "scheduled" },
      { local_date: "2026-11-19", status: "cancelled" },
      { local_date: "2026-11-26", status: "cancelled" },
      { local_date: "2026-12-03", status: "cancelled" },
      { local_date: "2026-12-10", status: "cancelled" },
    ]);
    const fourth = openPick()?.[0] ?? "";
    expect(schedule.proposals.get(fourth)).toMatchObject({ daysPerMember: 1, version: 1 });
    expect(proposalIn(await week(omarsAccount, "the week, by a fourth member with no day free"))).toMatchObject({
      id: fourth,
      my_days: ["thursday"],
    });
    await week(account(ben), "the week, by a member whose second day was freed");
    // Thursday 19 November, 6 AM in New York: Ben's Thursday was freed, so the club's next day is Ben's
    // Monday 23 November, never the 19th (T9).
    now = Temporal.Instant.from("2026-11-19T11:00:00Z");
    clock.set(now);
    const onTheFreedDate = await clubsOf(account(ben), "the clubs, on a freed day's date");
    const listed = (JSON.parse(onTheFreedDate.body) as { clubs: { id: string; next_day?: { local_date: string } }[] })
      .clubs;
    expect(listed.find((each) => each.id === club)?.next_day?.local_date).toBe("2026-11-23");

    // A member whose account is being deleted: the gate's 401 before anything of the club (T27).
    await db`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${now}
              WHERE id = ${account(alex)}`;
    // Judged as the gate's answer (./account.ts `gateOf`), which comes before the rows of any club.
    expect(
      (
        await ask(
          account(alex),
          spec("getSchedule", { club_id: club }),
          () => UNAUTHENTICATED,
          "the week, by a member whose account is being deleted",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await ask(
          account(alex),
          spec("confirmScheduleDays", { proposal_id: third }, alexsNew),
          () => UNAUTHENTICATED,
          "a confirmation by a member whose account is being deleted",
        )
      ).status,
    ).toBe(401);
    await week(account(ben), "the week, beside an account being deleted");
    // The club suspended: nothing for its own members either.
    await db`UPDATE app.clubs SET suspended_at = ${now} WHERE id = ${club}`;
    expect((await week(account(ben), "the week, in a suspended club")).status).toBe(404);
    expect(
      await status(command(samsAccount, "confirmScheduleDays", third, samsNew, "a confirmation in a suspended club")),
    ).toBe(404);

    expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
    expect(counted.answers).toBe(44);
  });
});

describe("callers without a session, in each state of the drop and phase of the day (T14, T27, T53)", () => {
  it("answers each the same whatever the ids name, the gate's one 401 or the neutral not-found for a public route, and leaks nothing the scanner can find", async () => {
    const wrong: string[] = [];
    const counted = { answers: 0, expected: 0 };
    // Each way a token fails to be a session, signed by real keys and naming an account that exists, beside
    // the callers that need none (harness.ts): none of them may get what that account would.
    const callers = [...SIGNED_OUT, ...(await tokenCallers(keys, elsewhere.subject))];
    expect(callers.length).toBeGreaterThanOrEqual(19);
    const secrets = callers.flatMap((caller) =>
      caller.authorization === null ? [] : [caller.authorization.slice("Bearer ".length)],
    );
    for (const state of STATES) {
      const cell = await db.begin(async (tx) => {
        const w = await newWorld(plain(tx), suffix());
        const drop = await twoContributors(tx, w);
        const proposal = await addFirstDays(tx, w);
        await state.make(tx, w, drop);
        await checkAsAtCommit(plain(tx));
        return {
          w,
          targets: {
            club: w.club,
            drop,
            day: w.day,
            author: w.ben.interval,
            star: w.ana.interval,
            proposal,
            ...(await rosterTargets(tx, w)),
          },
        };
      });
      const facts = await factsOf([cell.w.club, elsewhere.club], null, { accounts: [cell.w.dan.user], secrets });
      // The signed-out page's route reads a body: a token nobody made, so it names nothing (T14).
      const noToken = freshToken();
      const specs = operations
        .flatMap((operation) => specsFor(operation, cell.targets, "Bearer unused"))
        .map((spec) => genericBodyFor(spec, cell.targets.revision, noToken));
      for (const phase of Object.keys(PHASES) as Phase[]) {
        const now = PHASES[phase];
        clock.set(now);
        const record = scanner(wrong, `${state.name}, ${phase}`, () => facts, now, counted);
        for (const spec of specs) {
          const expected = PUBLIC.has(spec.operation.id) ? NEUTRAL : UNAUTHENTICATED;
          counted.expected += signedOutCount(spec, callers);
          record(await signedOutStep(app, spec, elsewhere, expected, callers));
        }
        // An update is refused at the gate before its body is read: a valid body, a broken one and none.
        const update = specs.find((spec) => spec.operation.id === "updateMe");
        if (update === undefined) throw new Error("the contract has no updateMe");
        const step: Step = { problems: [], answers: [] };
        for (const caller of callers) {
          for (const payload of ['{"expected_version":0,"display_name":"Ana"}', "{bad", ""]) {
            const headers = Object.fromEntries(
              Object.entries(update.headers).filter(([name]) => name !== "authorization"),
            );
            if (caller.authorization !== null) headers["authorization"] = caller.authorization;
            const sent: Spec = {
              ...update,
              headers: { ...headers, "content-type": "application/json" },
              body: payload,
            };
            const answer = await answerOf(app, render(sent));
            step.answers.push({ spec: sent, answer });
            for (const problem of pinnedProblems(answer, UNAUTHENTICATED))
              step.problems.push(`updateMe, ${caller.name}, a body of ${String(payload.length)} bytes: ${problem}`);
          }
        }
        counted.expected += step.answers.length;
        record(step);
      }
    }
    console.log(`callers without a session: ${String(counted.answers)} answers scanned`);
    expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
    expect(counted.answers).toBe(counted.expected);
    expect(counted.answers).toBeGreaterThan(STATES.length * Object.keys(PHASES).length * operations.length * 3);
  });
});
