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

import { randomBytes } from "node:crypto";
import { buildApp, connect, routesOf, sessions, type ApiSql } from "@tadayo/api";
import { TEST_EMAIL } from "@tadayo/api/testing";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { worldSql, type Tx, type WorldTx } from "../db/harness.ts";
import { AT, checkAsAtCommit, commitDrop, named, newAvatar, newWorld, type World } from "../db/world.ts";
import { PHASES, REVEAL, ROLES, STATES, type Phase } from "../matrix.ts";
import { PUBLIC, cellExpected, daysOf, gateOf, sessionOf, updateMeCases, type Own, type Session } from "./account.ts";
import { freshId, type Targets } from "./bindings.ts";
import {
  SIGNED_OUT,
  UNAUTHENTICATED,
  NEUTRAL,
  cellStep,
  guessCount,
  guessStep,
  manipulations,
  manipulationStep,
  pinnedProblems,
  answerOf,
  render,
  routeProblems,
  said,
  signedOutCount,
  signedOutStep,
  specsFor,
  type Spec,
  type Step,
} from "./harness.ts";
import { membersExpected, type MembersSeen } from "./members.ts";
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
  viewerIn,
  weekExpected,
  type ScheduleCommand,
  type ScheduleSeen,
} from "./schedule.ts";
import {
  scan,
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

/** A world's own suffix, so its names are no other world's. */
const suffix = () => ` ${randomBytes(6).toString("hex")}`;

/** Another club's objects, with an avatar of one of its people that is ready, and one of them's sign-in subject. */
type Elsewhere = Targets & { avatar: string; subject: string };

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
    const [subject] = await tx<{ auth_subject: string }[]>`SELECT auth_subject FROM app.users WHERE id = ${w.ben.user}`;
    if (subject === undefined) throw new Error("the other club's author has no sign-in subject");
    return {
      club: w.club,
      drop,
      day: w.day,
      author: w.ben.interval,
      star: w.ana.interval,
      proposal,
      avatar: avatar.id,
      subject: subject.auth_subject,
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
    { id: string; bound: string | null; club: string; joined: boolean; club_name: string; inviter: string | null }[]
  >`
    SELECT i.id, i.bound_user_id AS bound, c.club_id AS club, c.state = 'joined' AS joined, k.name AS club_name,
           CASE WHEN m.state = 'active' THEN u.display_name ELSE m.ended_display_name END AS inviter
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
      for (const finding of scan(answer, context)) {
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

describe("a route with no row fails, and no route is outside the contract (TECH-DESIGN section 8)", () => {
  it("gives every operation of the contract a row, and the app a route for each and no other", () => {
    expect(rowProblems(operations, ROWS)).toEqual([]);
    expect(routeProblems(routesOf(app), operations)).toEqual([]);
    expect(routesOf(app)).toHaveLength(operations.length);
  });
});

describe("every cell of the privacy matrix: each role, each state of the drop, each phase of the day (T9, T14, T16, T27; Q05 to Q09)", () => {
  for (const role of ROLES) {
    it(`answers the ${role.name} as its account and its row say, and leaks nothing the scanner can find`, async () => {
      const wrong: string[] = [];
      const counted = { cells: 0, answers: 0, expectedAnswers: 0, bodies: 0, expectedBodies: 0 };
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
        const clubs = [...new Set([cell.w.club, elsewhere.club, ...viewerClubs.map((row) => row.club_id)])];
        const load = () =>
          factsOf(clubs, cell.viewer, {
            accounts: [cell.w.dan.user],
            secrets: [authorization.slice("Bearer ".length)],
          });
        let facts = await load();
        // The schedule's rows of the cell's club and the other club, read again after each request that may change them.
        const loadSchedule = () => scheduleWorldOf(db as unknown as WorldTx, [cell.w.club, elsewhere.club]);
        let schedule = await loadSchedule();
        const startVersion = schedule.proposals.get(cell.targets.proposal)?.version ?? -1;
        // A schedule command's generic request carries a body the contract accepts and every rule refuses
        // (schedule.ts's genericBody), so the guessed and malformed ids beside it are judged past the body's check.
        const specs = operations
          .flatMap((operation) => specsFor(operation, cell.targets, authorization))
          .map((spec): Spec =>
            spec.operation.id === "chooseScheduleDays" || spec.operation.id === "confirmScheduleDays"
              ? {
                  ...spec,
                  headers: { ...spec.headers, "content-type": "application/json" },
                  body: JSON.stringify(genericBody(startVersion)),
                }
              : spec,
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
          });
          for (const spec of specs) {
            const gate = gateOf(session, spec.operation);
            const id = spec.operation.id;
            const expected =
              gate === undefined && id === "listMembers"
                ? membersExpected(membersSeen, cell.w.club)
                : gate !== undefined || !SCHEDULE_JUDGED.has(id)
                  ? cellExpected(session, spec.operation, seen)
                  : id === "getSchedule"
                    ? weekExpected(scheduleSeen, cell.w.club)
                    : commandExpected(scheduleSeen, id as ScheduleCommand, cell.targets.proposal, startVersion);
            counted.cells += 1;
            counted.expectedAnswers += 1 + guessCount(spec);
            record(await cellStep(app, spec, expected));
            if (phase === "collecting") {
              counted.expectedAnswers += manipulations(spec, cell.w.ben.interval, CLAIMED).length;
              record(await manipulationStep(app, spec, cell.w.ben.interval, CLAIMED, expected));
            }
            const guessed = await guessStep(app, spec, elsewhere, gate);
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
        }
      }
      console.log(`${role.name}: ${String(counted.cells)} cells run, ${String(counted.answers)} answers scanned`);
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
      expect(counted.bodies).toBeGreaterThanOrEqual(7 * phases.length * 8);
      expect(counted.answers).toBe(counted.expectedAnswers);
      expect(malformed.size).toBeGreaterThan(0);
    });
  }
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
          targets: { club: w.club, drop, day: w.day, author: w.ben.interval, star: w.ana.interval, proposal },
        };
      });
      const facts = await factsOf([cell.w.club, elsewhere.club], null, { accounts: [cell.w.dan.user], secrets });
      const specs = operations.flatMap((operation) => specsFor(operation, cell.targets, "Bearer unused"));
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
