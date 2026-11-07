/// <reference lib="esnext.temporal" />
// The privacy matrix over the API's app (TECH-DESIGN section 8; T9, T10, T14, T16; Q05 to Q09),
// generated from the contract's operations: every route, as every role, in each of the drop's six
// states and a cancelled day, at each phase of the day by the server's clock. Each cell is checked
// against its row (rows.ts), and every answer it gets goes through the leak scanner (scanner.ts).
// Then each request again with the client's clock and parameters moved past the reveal (T16, Q09),
// and with each id guessed or malformed (T14).
//
// Each role's world is committed, with random ids, so the app's own connection reads it as a request
// would. Ana's Saturday holds Ben's photo, the drop the states act on, and Cleo's video link, so the
// day has two contributors. The scanner's facts come from the world's rows, never from the
// authorization module it tests.

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
  guessStep,
  idParameters,
  MALFORMED,
  manipulations,
  manipulationStep,
  routeProblems,
  specsFor,
  type Step,
} from "./harness.ts";
import { contractOperations, readDocument } from "./operations.ts";
import { NONE, ROWS, rowProblems } from "./rows.ts";
import { scan, type WorldDrop, type WorldFacts } from "./scanner.ts";

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
 * Ben's photo "From Ben" and Cleo's video link to Ana's Saturday, committed at 20:00 on Friday 6
 * November, each with its audience of Ana, Ben and Cleo, sealed. Returns Ben's drop.
 */
async function twoContributors(tx: WorldTx, w: World): Promise<string> {
  const drop = await commitDrop(plain(tx), w, w.ben, { caption: "From Ben", at: AT.added });
  await commitDrop(plain(tx), w, w.cleo, { media: "external_video", caption: "Cleo's pick", at: AT.added });
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
    return { club: w.club, drop, day: w.day, author: w.ben.interval };
  });
});

afterAll(async () => {
  await app.close();
  await api.end();
  await db.end();
});

/** What the scanner knows of the clubs `clubs`, and the viewer's intervals, read from their rows. */
async function factsOf(clubs: string[], viewer: string): Promise<{ world: WorldFacts; viewer: Set<string> }> {
  const drops = await db<{ id: string; author: string; day: string; caption: string | null; audience: string[] }[]>`
    SELECT d.id, d.author_interval_id AS author, d.occurrence_id AS day, d.caption,
           coalesce(array_agg(a.interval_id) FILTER (WHERE m.state = 'active'), '{}') AS audience
      FROM app.drops d
      LEFT JOIN app.drop_audience a ON a.drop_id = d.id
      LEFT JOIN app.memberships m ON m.interval_id = a.interval_id
     WHERE d.club_id IN ${db(clubs)}
     GROUP BY d.id`;
  const days = await db<{ id: string; reveal_at: Temporal.Instant }[]>`
    SELECT id, reveal_at FROM app.occurrences WHERE club_id IN ${db(clubs)}`;
  const names = await db<{ interval_id: string; name: string | null }[]>`
    SELECT m.interval_id, coalesce(m.ended_display_name, u.display_name) AS name
      FROM app.memberships m JOIN app.users u ON u.id = m.user_id
     WHERE m.club_id IN ${db(clubs)}`;
  const texts = await db<{ text: string }[]>`
    SELECT v.caption AS text FROM app.drop_caption_versions v JOIN app.drops d ON d.id = v.drop_id
     WHERE d.club_id IN ${db(clubs)} AND v.caption IS NOT NULL
    UNION SELECT name FROM app.clubs WHERE id IN ${db(clubs)}
    UNION SELECT label FROM app.roster_revision_candidates WHERE club_id IN ${db(clubs)}
    UNION SELECT u.display_name FROM app.users u JOIN app.memberships m ON m.user_id = u.id
     WHERE m.club_id IN ${db(clubs)} AND u.display_name IS NOT NULL
    UNION SELECT ended_display_name FROM app.memberships WHERE club_id IN ${db(clubs)} AND ended_display_name IS NOT NULL
    UNION SELECT b.blocked_name FROM app.blocks b JOIN app.memberships m ON m.interval_id = b.blocked_interval_id
     WHERE m.club_id IN ${db(clubs)}`;
  const people = db`SELECT user_id FROM app.memberships WHERE club_id IN ${db(clubs)}`;
  const canaries = await db<{ value: string }[]>`
    SELECT canonical_url AS value FROM app.sources WHERE owner_user_id IN (${people})
    UNION SELECT provider_post_id FROM app.sources WHERE owner_user_id IN (${people})
    UNION SELECT object_key FROM app.uploads WHERE owner_user_id IN (${people})
    UNION SELECT content_version FROM app.uploads WHERE owner_user_id IN (${people}) AND content_version IS NOT NULL
    UNION SELECT r.object_key FROM app.upload_renditions r JOIN app.uploads u ON u.id = r.upload_id
     WHERE u.owner_user_id IN (${people})`;
  const intervals = await db<
    { interval_id: string }[]
  >`SELECT interval_id FROM app.memberships WHERE user_id = ${viewer}`;
  return {
    world: {
      drops: new Map(
        drops.map((drop): [string, WorldDrop] => [
          drop.id,
          { author: drop.author, day: drop.day, caption: drop.caption, audience: new Set(drop.audience) },
        ]),
      ),
      days: new Map(days.map((day) => [day.id, day.reveal_at])),
      names: new Map(names.flatMap((row) => (row.name === null ? [] : [[row.interval_id, row.name] as const]))),
      texts: new Set(texts.map((row) => row.text)),
      canaries: new Set(canaries.map((row) => row.value)),
    },
    viewer: new Set(intervals.map((row) => row.interval_id)),
  };
}

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
      const malformed = new Map<string, string>();
      const counted = { cells: 0, answers: 0, expectedCells: 0, expectedAnswers: 0 };
      const phases = (Object.keys(PHASES) as Phase[]).filter((phase) => !role.phases || role.phases.includes(phase));
      for (const state of STATES) {
        const cell = await db.begin(async (tx) => {
          const w = await newWorld(plain(tx));
          const drop = await twoContributors(tx, w);
          const viewer = await role.make(tx, w);
          await state.make(tx, w, drop);
          await checkAsAtCommit(plain(tx));
          const targets: Targets = { club: w.club, drop, day: w.day, author: w.ben.interval };
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
          const record = (step: Step) => {
            for (const problem of step.problems) wrong.push(`${state.name}, ${phase}: ${problem}`);
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
                wrong.push(
                  `${state.name}, ${phase}, ${spec.operation.id}: ${finding.check} at ${finding.at}: ${finding.what}`,
                );
              }
            }
          };
          for (const spec of specs) {
            counted.cells += 1;
            counted.expectedCells += 1;
            counted.expectedAnswers += 1 + idParameters(spec).length * (2 + MALFORMED.length);
            record(await cellStep(app, spec));
            if (phase === "collecting") {
              counted.expectedAnswers += manipulations(spec, cell.w.ben.user, CLAIMED).length;
              record(await manipulationStep(app, spec, cell.w.ben.user, CLAIMED));
            }
            const guessed = await guessStep(app, spec, elsewhere);
            record(guessed);
            // A malformed id gets the same answer for the role in every state and phase (T14).
            for (const [request, answer] of guessed.malformed) {
              const first = malformed.get(request);
              if (first === undefined) malformed.set(request, answer);
              else if (first !== answer)
                wrong.push(`${state.name}, ${phase}, ${request}: ${answer}, but elsewhere ${first}`);
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
