/// <reference lib="esnext.temporal" />
// The privacy matrix over the API's app (TECH-DESIGN section 8; T9, T10, T14, T16; Q05 to Q09),
// generated from the contract's operations: every route, as every role, in each of the drop's six
// states and a cancelled day, at each phase of the day by the server's clock. Each cell is checked
// against its row (rows.ts), and every answer it gets goes through the leak scanner (scanner.ts).
// Then each request again with the client's clock and parameters moved past the reveal (T16, Q09),
// and with each id and cursor guessed or malformed (T14); and each request from callers without a
// session, with the cell's ids, ids that name nothing and another club's.
//
// Each role's world is committed, with random ids, so the app's own connection reads it as a request
// would. Ana's Saturday holds Ben's photo, the drop the states act on, and Cleo's video link, so the
// day has two contributors, each caption the world's own. The scanner's facts come from the world's
// rows, never from the authorization module it tests.

import { randomBytes } from "node:crypto";
import { buildApp, connect, routesOf, type ApiSql } from "@tadayo/api";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { worldSql, type Tx, type WorldTx } from "../db/harness.ts";
import { AT, checkAsAtCommit, commitDrop, newWorld, type World } from "../db/world.ts";
import { PHASES, REVEAL, ROLES, STATES, type Phase } from "../matrix.ts";
import type { Targets } from "./bindings.ts";
import {
  cellStep,
  guessCount,
  guessStep,
  manipulations,
  manipulationStep,
  routeProblems,
  signedOutCount,
  signedOutStep,
  specsFor,
  type Step,
} from "./harness.ts";
import { contractOperations, readDocument } from "./operations.ts";
import { NONE, ROWS, rowProblems } from "./rows.ts";
import { scan, type Viewer, type WorldDrop, type WorldFacts } from "./scanner.ts";

const document = readDocument();
const operations = contractOperations(document);

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;

/** The time a manipulated request claims: a day after the collecting phase's instant. */
const CLAIMED = PHASES.collecting.add({ hours: 24 });

const db = worldSql();
let api: ApiSql;
let clock: FakeClock;
let app: FastifyInstance;
let elsewhere: Targets;

/**
 * Ben's photo "From Ben" and Cleo's video link "Cleo's pick" to Ana's Saturday, each caption ending
 * in a random word, so no other world has it; committed at 20:00 on Friday 6 November, each with its
 * audience of Ana, Ben and Cleo, sealed. Returns Ben's drop.
 */
async function twoContributors(tx: WorldTx, w: World): Promise<string> {
  const word = randomBytes(6).toString("hex");
  const drop = await commitDrop(plain(tx), w, w.ben, { caption: `From Ben ${word}`, at: AT.added });
  await commitDrop(plain(tx), w, w.cleo, { media: "external_video", caption: `Cleo's pick ${word}`, at: AT.added });
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
  api = connect(url);
  clock = fakeClock(REVEAL);
  app = buildApp({ sql: api, clock });
  await app.ready();
  elsewhere = await db.begin(async (tx) => {
    const w = await newWorld(plain(tx));
    const drop = await twoContributors(tx, w);
    return { club: w.club, drop, day: w.day, author: w.ben.interval, star: w.ana.interval };
  });
});

afterAll(async () => {
  await app.close();
  await api.end();
  await db.end();
});

/**
 * What the scanner knows of the clubs `clubs`, read from their rows, and of the viewer: their
 * intervals, and the text that is their own. A caller without a session is a viewer with neither.
 */
async function factsOf(clubs: string[], viewer: string | null): Promise<{ world: WorldFacts; viewer: Viewer }> {
  const drops = await db<
    { id: string; author: string; day: string; caption: string | null; audience: string[]; comments: string[] }[]
  >`
    SELECT d.id, d.author_interval_id AS author, d.occurrence_id AS day, d.caption,
           coalesce((SELECT array_agg(a.interval_id) FROM app.drop_audience a
                       JOIN app.memberships m ON m.interval_id = a.interval_id
                      WHERE a.drop_id = d.id AND m.state = 'active'), '{}') AS audience,
           coalesce((SELECT array_agg(c.body) FROM app.comments c
                      WHERE c.drop_id = d.id AND c.state = 'active'), '{}') AS comments
      FROM app.drops d
     WHERE d.club_id IN ${db(clubs)}`;
  const days = await db<{ id: string; club: string; reveal_at: Temporal.Instant }[]>`
    SELECT id, club_id AS club, reveal_at FROM app.occurrences WHERE club_id IN ${db(clubs)}`;
  const members = await db<{ interval_id: string; club: string; name: string | null }[]>`
    SELECT m.interval_id, m.club_id AS club, coalesce(m.ended_display_name, u.display_name) AS name
      FROM app.memberships m JOIN app.users u ON u.id = m.user_id
     WHERE m.club_id IN ${db(clubs)}`;
  const clubRows = await db<{ id: string; name: string; labels: string[] }[]>`
    SELECT c.id, c.name,
           coalesce((SELECT array_agg(r.label) FROM app.roster_revision_candidates r WHERE r.club_id = c.id), '{}') AS labels
      FROM app.clubs c WHERE c.id IN ${db(clubs)}`;
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
            caption: drop.caption,
            audience: new Set(drop.audience),
            comments: drop.comments,
          },
        ]),
      ),
      days: new Map(days.map((day) => [day.id, { club: day.club, revealAt: day.reveal_at }])),
      members: new Map(members.map((row) => [row.interval_id, { club: row.club, name: row.name }])),
      clubs: new Map(clubRows.map((row) => [row.id, { name: row.name, labels: new Set(row.labels) }])),
      canaries,
    },
    viewer: { intervals: new Set(intervals.map((row) => row.interval_id)), texts: new Set(own.map((row) => row.text)) },
  };
}

/** The answers each step got, through the leak scanner: each finding as a line, into `wrong`. */
function scanner(
  wrong: string[],
  where: string,
  facts: { world: WorldFacts; viewer: Viewer },
  now: Temporal.Instant,
  counted: { answers: number },
) {
  return (step: Step) => {
    for (const problem of step.problems) wrong.push(`${where}: ${problem}`);
    for (const { spec, answer } of step.answers) {
      counted.answers += 1;
      const context = {
        document,
        operation: spec.operation,
        skeleton: ROWS[spec.operation.id] === NONE,
        viewer: facts.viewer,
        world: facts.world,
        now,
      };
      for (const finding of scan(answer, context)) {
        wrong.push(`${where}, ${spec.operation.id}: ${finding.check} at ${finding.at}: ${finding.what}`);
      }
    }
  };
}

/** A malformed id's or cursor's answer, by its request, the first time any role got it (T14). */
const malformed = new Map<string, { answer: string; role: string }>();

describe("a route with no row fails, and no route is outside the contract (TECH-DESIGN section 8)", () => {
  it("gives every operation of the contract a row, the skeleton's, and the app a route for each and no other", () => {
    expect(rowProblems(operations, ROWS)).toEqual([]);
    expect(routeProblems(routesOf(app), operations)).toEqual([]);
    expect(routesOf(app)).toHaveLength(operations.length);
  });
});

describe("every cell of the privacy matrix: each role, each state of the drop, each phase of the day (T9, T14, T16; Q05 to Q09)", () => {
  for (const role of ROLES) {
    it(`answers the ${role.name} with the neutral not-found, and leaks nothing the scanner can find`, async () => {
      const wrong: string[] = [];
      const counted = { cells: 0, answers: 0, expectedCells: 0, expectedAnswers: 0 };
      const phases = (Object.keys(PHASES) as Phase[]).filter((phase) => !role.phases || role.phases.includes(phase));
      for (const state of STATES) {
        const cell = await db.begin(async (tx) => {
          const w = await newWorld(plain(tx));
          const drop = await twoContributors(tx, w);
          const viewer = await role.make(tx, w);
          await state.make(tx, w, drop);
          await checkAsAtCommit(plain(tx));
          const targets: Targets = { club: w.club, drop, day: w.day, author: w.ben.interval, star: w.ana.interval };
          return { w, targets, viewer };
        });
        const viewerClubs = await db<{ club_id: string }[]>`
          SELECT club_id FROM app.memberships WHERE user_id = ${cell.viewer}`;
        const clubs = [...new Set([cell.w.club, elsewhere.club, ...viewerClubs.map((row) => row.club_id)])];
        const facts = await factsOf(clubs, cell.viewer);
        const specs = operations.flatMap((operation) => specsFor(operation, cell.targets, cell.viewer));
        for (const phase of phases) {
          const now = PHASES[phase];
          clock.set(now);
          const record = scanner(wrong, `${state.name}, ${phase}`, facts, now, counted);
          for (const spec of specs) {
            counted.cells += 1;
            counted.expectedCells += 1;
            counted.expectedAnswers += 1 + guessCount(spec);
            record(await cellStep(app, spec));
            if (phase === "collecting") {
              counted.expectedAnswers += manipulations(spec, cell.w.ben.interval, CLAIMED).length;
              record(await manipulationStep(app, spec, cell.w.ben.interval, CLAIMED));
            }
            const guessed = await guessStep(app, spec, elsewhere);
            record(guessed);
            // A malformed id or cursor gets the same answer in every state and phase, for every role (T14).
            for (const [request, answer] of guessed.malformed) {
              const first = malformed.get(request);
              if (first === undefined) malformed.set(request, { answer, role: role.name });
              else if (first.answer !== answer)
                wrong.push(`${state.name}, ${phase}, ${request}: ${answer}, but the ${first.role} got ${first.answer}`);
            }
          }
        }
      }
      expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
      // Every cell ran and every answer was scanned: the operations with each value of a required
      // enum, in each state and phase the role has, with the manipulated and guessed requests.
      expect(counted.cells).toBe(counted.expectedCells);
      expect(counted.answers).toBe(counted.expectedAnswers);
      const specsPerWorld = operations.reduce(
        (sum, operation) => sum + specsFor(operation, elsewhere, "acct_x").length,
        0,
      );
      expect(counted.cells).toBe(STATES.length * phases.length * specsPerWorld);
      expect(malformed.size).toBeGreaterThan(0);
    });
  }
});

describe("callers without a session, in each state of the drop and phase of the day (T14)", () => {
  it("answers each the same whatever the ids name, the neutral not-found, and leaks nothing the scanner can find", async () => {
    const wrong: string[] = [];
    const counted = { answers: 0, expected: 0 };
    for (const state of STATES) {
      const cell = await db.begin(async (tx) => {
        const w = await newWorld(plain(tx));
        const drop = await twoContributors(tx, w);
        await state.make(tx, w, drop);
        await checkAsAtCommit(plain(tx));
        return { w, targets: { club: w.club, drop, day: w.day, author: w.ben.interval, star: w.ana.interval } };
      });
      const facts = await factsOf([cell.w.club, elsewhere.club], null);
      const specs = operations.flatMap((operation) => specsFor(operation, cell.targets, cell.w.ben.user));
      for (const phase of Object.keys(PHASES) as Phase[]) {
        const now = PHASES[phase];
        clock.set(now);
        const record = scanner(wrong, `${state.name}, ${phase}`, facts, now, counted);
        for (const spec of specs) {
          counted.expected += signedOutCount(spec);
          record(await signedOutStep(app, spec, elsewhere));
        }
      }
    }
    expect({ count: wrong.length, first: wrong.slice(0, 40) }).toEqual({ count: 0, first: [] });
    expect(counted.answers).toBe(counted.expected);
    expect(counted.answers).toBeGreaterThan(STATES.length * Object.keys(PHASES).length * operations.length * 3);
  });
});
