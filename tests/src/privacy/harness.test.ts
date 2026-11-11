/// <reference lib="esnext.temporal" />
// The privacy matrix's harness proves each check can fail (TECH-DESIGN section 8, T58): a route
// added without a row, a route outside the contract, and small test-only apps that each answer one
// contract operation wrongly in one way, run through the same steps the matrix runs. No database.

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { BINDINGS, freshId, type Targets } from "./bindings.ts";
import {
  answerOf,
  cellStep,
  guessCount,
  guessStep,
  manipulationStep,
  manipulations,
  NEUTRAL,
  render,
  routeProblems,
  said,
  signedOutCount,
  signedOutStep,
  specsFor,
  type Spec,
} from "./harness.ts";
import { contractOperations, readDocument, type ContractOperation } from "./operations.ts";
import { NONE, ROWS, rowProblems } from "./rows.ts";
import { transportProblem } from "./scanner.ts";

const operations = contractOperations(readDocument());
const byId = new Map(operations.map((operation) => [operation.id, operation]));

function operation(id: string): ContractOperation {
  const found = byId.get(id);
  if (!found) throw new Error(id);
  return found;
}

const here: Targets = {
  club: "clb_here",
  drop: "drp_here",
  day: "occ_here",
  author: "itv_here",
  star: "itv_star_here",
};
const elsewhere: Targets = {
  club: "clb_there",
  drop: "drp_there",
  day: "occ_there",
  author: "itv_there",
  star: "itv_star_there",
};
const LATER = Temporal.Instant.from("2026-11-08T07:00:00Z");

/** The neutral not-found, as the skeleton sends it. */
function neutral(reply: FastifyReply) {
  return reply
    .code(404)
    .header("cache-control", "private, no-store")
    .type("application/json; charset=utf-8")
    .send('{"code":"NOT_FOUND"}');
}

/** Today's Date as Node writes it, under the next weekday's name, which Date.parse alone ignores. */
function otherWeekday(): string {
  const now = new Date();
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(now.getUTCDay() + 1) % 7] ?? ""}${now.toUTCString().slice(3)}`;
}

/**
 * An app with one contract operation's route, answering through `handler`, and the skeleton's
 * neutral answer where Fastify's router answers itself, unless `router` is false.
 */
async function plantedApp(
  id: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => FastifyReply,
  router = true,
  notFound = true,
) {
  const app = Fastify({
    exposeHeadRoutes: false,
    ...(router
      ? {
          frameworkErrors: (_error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
            void neutral(reply);
          },
        }
      : {}),
  });
  const found = operation(id);
  app.route({ method: found.method, url: found.path.replace(/\{([a-z_]+)\}/g, ":$1"), handler });
  if (notFound) app.setNotFoundHandler((_request, reply) => neutral(reply));
  await app.ready();
  return app;
}

function spec(id: string): Spec {
  const [first] = specsFor(operation(id), here, "acct_viewer");
  if (!first) throw new Error(id);
  return first;
}

describe("a route with no row fails (TECH-DESIGN section 8)", () => {
  it("gives every operation of the contract its row, and every row an operation, each the skeleton's", () => {
    expect(operations).toHaveLength(66);
    expect(rowProblems(operations, ROWS)).toEqual([]);
  });

  it("reports a route added to the contract without a row", () => {
    const added = [...operations, { ...operation("getDrop"), id: "getDropTwice" }];
    expect(rowProblems(added, ROWS)).toEqual(["getDropTwice has no row in the privacy matrix"]);
  });

  it("reports a row whose operation is gone, and a row that isn't NONE", () => {
    expect(rowProblems(operations, { ...ROWS, getDropTwice: NONE })).toEqual([
      "getDropTwice has a row but no operation in the contract",
    ]);
    expect(rowProblems(operations, { ...ROWS, getDrop: { grants: "everyone" } })).toEqual([
      "getDrop's row isn't NONE: the slice that builds a route defines its row and its checks",
    ]);
  });
});

describe("no route outside the contract", () => {
  const contract = operations.map((found) => `${found.method} ${found.path.replace(/\{([a-z_]+)\}/g, ":$1")}`);

  it("reports a route the app adds and a route it lacks", () => {
    expect(routeProblems(contract, operations)).toEqual([]);
    expect(routeProblems([...contract, "GET /v1/debug"], operations)).toEqual([
      "the app has GET /v1/debug, which the contract doesn't",
    ]);
    expect(routeProblems(contract.slice(1), operations)).toEqual([`the app has no route for ${contract[0] ?? ""}`]);
  });
});

describe("the requests a cell makes, from the contract's parameters", () => {
  it("names the cell's world by each Id parameter's name, in the path and the query alike", () => {
    expect(spec("getDrop").path).toEqual({ drop_id: "drp_here" });
    expect(spec("getMemberAvatar").path).toEqual({ club_id: "clb_here", membership_id: "itv_here" });
    expect(spec("listMemories").query).toEqual({ club_id: "clb_here" });
  });

  it("sends each optional Id parameter too, filled from the world, in a request of its own", () => {
    expect(specsFor(operation("listMemories"), here, "acct_viewer").map((made) => made.query)).toEqual([
      { club_id: "clb_here" },
      { club_id: "clb_here", star: "itv_star_here" },
    ]);
    const optional = operations.flatMap((found) =>
      found.parameters
        .filter((parameter) => !parameter.required && parameter.schema.$ref === "#/components/schemas/Id")
        .map((parameter) => `${found.id} ${parameter.name}`),
    );
    expect(optional).toEqual(["listMemories star"]);
  });

  it("makes one request for each value of a required enum, and gives each idempotent one a key", () => {
    expect(specsFor(operation("getDropMedia"), here, "acct_viewer").map((made) => made.query)).toEqual([
      { rendition: "display" },
      { rendition: "full" },
    ]);
    expect(specsFor(operation("removeDrop"), here, "acct_viewer").map((made) => made.query)).toEqual([
      { reason: "withdraw" },
      { reason: "pictured" },
    ]);
    expect(spec("createDrop").headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(spec("getDrop").headers["idempotency-key"]).toBeUndefined();
  });

  it("stops on a parameter it has no binding for", () => {
    const planted = {
      ...operation("getDrop"),
      path: "/v1/weeks/{week_id}",
      parameters: [{ ...operation("getDrop").parameters[0], name: "week_id" }],
    } as ContractOperation;
    expect(() => specsFor(planted, here, "acct_viewer")).toThrow(/no binding for the parameter week_id/);
    expect(Object.keys(BINDINGS).sort()).toEqual([
      "club_id",
      "comment_id",
      "drop_id",
      "invitation_id",
      "membership_id",
      "occurrence_id",
      "proposal_id",
      "reservation_id",
      "revision_id",
      "star",
      "upload_id",
    ]);
  });
});

describe("each step of the matrix reports a planted wrong answer", () => {
  it("passes the skeleton's neutral answer in every step, and gets the answers each step counts", async () => {
    for (const [id, guesses, signedOutAnswers] of [
      ["getDrop", 12, 9],
      ["getMemberAvatar", 64, 9],
      ["listComments", 45, 18],
    ] as const) {
      const app = await plantedApp(id, (_request, reply) => neutral(reply));
      expect((await cellStep(app, spec(id))).problems, id).toEqual([]);
      const manipulated = await manipulationStep(app, spec(id), "itv_author", LATER);
      expect(manipulated.problems, id).toEqual([]);
      expect(manipulated.answers, id).toHaveLength(manipulations(spec(id), "itv_author", LATER).length);
      const guessed = await guessStep(app, spec(id), elsewhere);
      expect(guessed.problems, id).toEqual([]);
      expect(guessed.answers, id).toHaveLength(guesses);
      expect(guessCount(spec(id)), id).toBe(guesses);
      const signedOut = await signedOutStep(app, spec(id), elsewhere);
      expect(signedOut.problems, id).toEqual([]);
      expect(signedOut.answers, id).toHaveLength(signedOutAnswers);
      expect(signedOutCount(spec(id)), id).toBe(signedOutAnswers);
      await app.close();
    }
    expect(manipulations(spec("getDrop"), "itv_author", LATER)).toHaveLength(13);
  });

  // Each wrong answer with the problem cellStep must name for it, so a problem found for another
  // reason (a header set ahead of the others, out of the neutral order, say) doesn't stand in for it.
  const wrong: [string, (reply: FastifyReply) => FastifyReply, string][] = [
    [
      "403 PROFILE_INCOMPLETE to everyone",
      (reply) => reply.code(403).header("cache-control", "private, no-store").send({ code: "PROFILE_INCOMPLETE" }),
      "getDrop: status 403",
    ],
    [
      "a not-found with a field",
      (reply) => reply.code(404).header("cache-control", "private, no-store").send({ code: "NOT_FOUND", field: "x" }),
      'getDrop: body "{\\"code\\":\\"NOT_FOUND\\",\\"field\\":\\"x\\"}"',
    ],
    [
      "a schema-valid 200 to everyone",
      (reply) => reply.code(200).header("cache-control", "private, no-store").send({ code: "NOT_FOUND" }),
      "getDrop: status 200",
    ],
    [
      "the neutral not-found with an extra header",
      (reply) => neutral(reply.header("x-drop-state", "held")),
      "getDrop: an extra header, x-drop-state",
    ],
    [
      "the neutral not-found with a transport header out of its form",
      (reply) => neutral(reply.header("keep-alive", "drop=held")),
      "getDrop: an extra header, keep-alive",
    ],
    [
      "the neutral not-found with a Date that isn't one",
      (reply) => neutral(reply.header("date", "held")),
      'getDrop: date: "held", a transport header whose value isn\'t its form',
    ],
    [
      "the neutral not-found with a Date in its form that isn't the answer's time",
      (reply) => neutral(reply.header("date", new Date(Date.now() - 86_400_000).toUTCString())),
      "a Date that isn't the time of the answer: Node writes the clock's own",
    ],
    [
      // The app's first answer, so only the lag Node's cached Date may have bounds it.
      "the neutral not-found with a Date ten seconds behind the moment it was asked",
      (reply) => neutral(reply.header("date", new Date(Date.now() - 10_000).toUTCString())),
      "a Date that isn't the time of the answer: Node writes the clock's own",
    ],
    [
      "the neutral not-found with a Date three seconds ahead of the moment it came",
      (reply) => neutral(reply.header("date", new Date(Date.now() + 3_000).toUTCString())),
      "a Date that isn't the time of the answer: Node writes the clock's own",
    ],
    [
      "the neutral not-found with a Date on another weekday",
      (reply) => neutral(reply.header("date", otherWeekday())),
      "a Date that isn't a real instant written as Node writes it",
    ],
    [
      "the neutral not-found with a Date holding an instant on day 36",
      (reply) => neutral(reply.header("date", "Fri, 36 Nov 2026 20:00:00 GMT")),
      'getDrop: date: "Fri, 36 Nov 2026 20:00:00 GMT", a Date that isn\'t a real instant written as Node writes it',
    ],
    [
      "the neutral not-found with Connection: close",
      (reply) => neutral(reply.header("connection", "close")),
      "getDrop: connection: close",
    ],
    [
      "the neutral not-found with its headers in another order",
      (reply) =>
        reply
          .code(404)
          .type("application/json; charset=utf-8")
          .header("cache-control", "private, no-store")
          .send('{"code":"NOT_FOUND"}'),
      "getDrop: the headers in another order: content-type, cache-control, content-length, date, connection",
    ],
    [
      "the neutral not-found with a Keep-Alive",
      (reply) => neutral(reply.header("keep-alive", "timeout=72")),
      "getDrop: an extra header, keep-alive",
    ],
    [
      "the neutral not-found with another reason phrase",
      (reply) => {
        reply.raw.statusMessage = "Held";
        return neutral(reply);
      },
      'getDrop: reason "Held"',
    ],
    [
      "the neutral not-found without no-store",
      (reply) => reply.code(404).type("application/json; charset=utf-8").send('{"code":"NOT_FOUND"}'),
      "getDrop: cache-control: undefined",
    ],
  ];
  for (const [name, answer, problem] of wrong) {
    it(`reports a route that answers ${name}`, async () => {
      const app = await plantedApp("getDrop", (_request, reply) => answer(reply));
      expect((await cellStep(app, spec("getDrop"))).problems).toContainEqual(expect.stringContaining(problem));
      await app.close();
    });
  }

  const tells: [string, (request: FastifyRequest) => boolean][] = [
    ["`now` in the query", (request) => Object.hasOwn(request.query as object, "now")],
    ["`rendition=full` in the query", (request) => (request.query as Record<string, string>).rendition === "full"],
    ["a client time header", (request) => request.headers["x-client-time"] !== undefined],
    ["a Date header", (request) => request.headers.date !== undefined],
    ["If-None-Match", (request) => request.headers["if-none-match"] !== undefined],
    ["Range", (request) => request.headers.range !== undefined],
    [
      "the author's membership id as the viewer",
      (request) => (request.query as Record<string, string>).viewer === "itv_author",
    ],
  ];
  for (const [name, tell] of tells) {
    it(`reports a route that answers differently for ${name} (T16, Q09)`, async () => {
      const app = await plantedApp("getDrop", (request, reply) =>
        tell(request) ? reply.code(200).header("cache-control", "private, no-store").send({}) : neutral(reply),
      );
      const step = await manipulationStep(app, spec("getDrop"), "itv_author", LATER);
      // One manipulated request, however many ways its answer differs, and its status among them.
      expect(new Set(step.problems.map((problem) => problem.slice(0, problem.indexOf(": "))))).toHaveLength(1);
      expect(step.problems).toContainEqual(expect.stringMatching(/^getDrop, manipulated .*: status 200$/));
      await app.close();
    });
  }

  it("reports a route that answers another club's id differently (T14)", async () => {
    const app = await plantedApp("getDrop", (request, reply) =>
      (request.params as { drop_id: string }).drop_id === elsewhere.drop
        ? reply.code(403).header("cache-control", "private, no-store").send({ code: "NOT_ALLOWED" })
        : neutral(reply),
    );
    const step = await guessStep(app, spec("getDrop"), elsewhere);
    expect(step.problems).toContainEqual(expect.stringMatching(/^getDrop, drop_id guessed: status 403$/));
    expect(step.problems.filter((problem) => !problem.includes("drop_id guessed"))).toEqual([]);
    await app.close();
  });

  it("reports a router that answers a long id or a broken escape in its own words, echoing the path", async () => {
    const app = await plantedApp("getDrop", (_request, reply) => neutral(reply), false);
    const step = await guessStep(app, spec("getDrop"), elsewhere);
    expect(
      step.problems.filter((problem) => problem.includes("echoes the value") || problem.includes("414")),
    ).not.toEqual([]);
    await app.close();
  });

  it("reports an app left with Fastify's own not-found answer, which a raw slash in an id reaches", async () => {
    const app = await plantedApp("getDrop", (_request, reply) => neutral(reply), true, false);
    const step = await guessStep(app, spec("getDrop"), elsewhere);
    expect(step.problems).toEqual([
      'getDrop, drop_id "a/b": status 404: neither the neutral not-found nor INVALID_REQUEST',
    ]);
    await app.close();
  });

  it("reports a malformed id answered with anything but the neutral not-found or a plain 400", async () => {
    for (const [name, answer, problem] of [
      [
        "echoes the id",
        (reply: FastifyReply, id: string) =>
          reply.code(400).header("cache-control", "private, no-store").send({ code: "INVALID_REQUEST", field: id }),
        "a 400 that echoes the value",
      ],
      ["answers 500", (reply: FastifyReply) => reply.code(500).send(), "status 500"],
    ] as const) {
      const app = await plantedApp("getDrop", (request, reply) => {
        const id = (request.params as { drop_id: string }).drop_id;
        return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? neutral(reply) : answer(reply, id);
      });
      const step = await guessStep(app, spec("getDrop"), elsewhere);
      expect(step.problems, name).toContainEqual(expect.stringContaining(problem));
      await app.close();
    }
  });

  it("returns each malformed id's and cursor's answer, for the matrix to check it's the same in every cell", async () => {
    const app = await plantedApp("listComments", (_request, reply) => neutral(reply));
    const step = await guessStep(app, spec("listComments"), elsewhere);
    expect(step.malformed.size).toBe(21);
    expect(new Set([...step.malformed.values()].map((text) => text.slice(0, 3) + text.slice(-20)))).toEqual(
      new Set(['404{"code":"NOT_FOUND"}']),
    );
    expect(freshId()).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    await app.close();
  });

  it("reports a route that looks the parent up before it checks a malformed child: an existence oracle (T14)", async () => {
    const real = new Set([here.club, elsewhere.club]);
    const app = await plantedApp("getMemberAvatar", (request, reply) => {
      const { club_id: club, membership_id: member } = request.params as { club_id: string; membership_id: string };
      if (!real.has(club)) return neutral(reply);
      return /^[A-Za-z0-9_-]{1,64}$/.test(member)
        ? neutral(reply)
        : reply
            .code(400)
            .header("cache-control", "private, no-store")
            .send({ code: "INVALID_REQUEST", field: "membership_id" });
    });
    const step = await guessStep(app, spec("getMemberAvatar"), elsewhere);
    expect(step.problems.filter((problem) => problem.includes("when the other ids name nothing"))).not.toEqual([]);
    await app.close();
  });

  it("reports a route that answers a cursor or an optional id differently (T14)", async () => {
    const app = await plantedApp("listMemories", (request, reply) => {
      const query = request.query as Record<string, string>;
      return query.cursor !== undefined || query.star === elsewhere.star
        ? reply.code(403).header("cache-control", "private, no-store").send({ code: "NOT_ALLOWED" })
        : neutral(reply);
    });
    const [plain, withStar] = specsFor(operation("listMemories"), here, "acct_viewer");
    if (!plain || !withStar) throw new Error("listMemories");
    const cursor = (await guessStep(app, plain, elsewhere)).problems;
    expect(cursor).toContainEqual(
      expect.stringMatching(
        /^listMemories, cursor "fresh": status 403: neither the neutral not-found nor INVALID_REQUEST$/,
      ),
    );
    expect(cursor.filter((problem) => !problem.startsWith("listMemories, cursor "))).toEqual([]);
    const star = (await guessStep(app, withStar, elsewhere)).problems;
    expect(star).toContainEqual(expect.stringMatching(/^listMemories, star guessed: status 403$/));
    await app.close();
  });

  it("reports a route that answers a cursor differently when the parent exists: an existence oracle (T14)", async () => {
    const real = new Set([here.drop, elsewhere.drop]);
    const app = await plantedApp("listComments", (request, reply) => {
      const { drop_id: drop } = request.params as { drop_id: string };
      return (request.query as Record<string, string>).cursor !== undefined && real.has(drop)
        ? reply
            .code(400)
            .header("cache-control", "private, no-store")
            .send({ code: "INVALID_REQUEST", field: "cursor" })
        : neutral(reply);
    });
    const step = await guessStep(app, spec("listComments"), elsewhere);
    // A plain 400 is an answer a cursor may get, so only the comparison with ids that name nothing
    // finds it, for the forged cursor and every malformed one.
    expect(
      step.problems.filter((problem) => problem.includes("another answer when the ids name nothing")),
    ).toHaveLength(11);
    expect(step.problems.filter((problem) => !problem.includes("another answer when the ids name"))).toEqual([]);
    await app.close();
  });

  it("reports a route that tells a signed-out caller which drops exist (T14)", async () => {
    const app = await plantedApp("getDrop", (request, reply) =>
      request.headers.authorization === undefined && (request.params as { drop_id: string }).drop_id === here.drop
        ? reply.code(401).header("cache-control", "private, no-store").send({ code: "UNAUTHENTICATED" })
        : neutral(reply),
    );
    const step = await signedOutStep(app, spec("getDrop"), elsewhere);
    // Its 401 isn't the skeleton's row, and it differs from the answer to ids that name nothing,
    // which a later row's single answer for signed-out callers is held to as well.
    expect(step.problems).toContain("getDrop, no session: another answer for fresh ids (T14)");
    expect(step.problems.filter((problem) => !problem.includes("no session"))).toEqual([]);
    await app.close();
  });

  it("reports a route that tells which drops exist through the transport's headers alone (T14)", async () => {
    // The neutral status and body for every id, but a closed connection and the drop's commit time
    // for the one that exists.
    const app = await plantedApp("getDrop", (request, reply) =>
      (request.params as { drop_id: string }).drop_id === here.drop
        ? neutral(reply.header("connection", "close").header("date", "Fri, 06 Nov 2026 20:00:00 GMT"))
        : neutral(reply),
    );
    expect((await cellStep(app, spec("getDrop"))).problems).toEqual([
      "getDrop: connection: close",
      "getDrop: date: \"Fri, 06 Nov 2026 20:00:00 GMT\", a Date that isn't the time of the answer: Node writes the clock's own",
    ]);
    const step = await signedOutStep(app, spec("getDrop"), elsewhere);
    expect(step.problems).toContain("getDrop, no session: another answer for fresh ids (T14)");
    await app.close();
  });

  it("lets the event loop turn before each request, so Node renews its Date: a second of answers carries more than one", async () => {
    // A chain of injects never reaches the timers phase on its own, where Node clears its cached Date,
    // so without the turn every answer of a stretch with no I/O would carry the first one's Date.
    const app = await plantedApp("getDrop", (_request, reply) => neutral(reply));
    const request = render(spec("getDrop"));
    const dates = new Set<string>();
    const start = Date.now();
    while (Date.now() - start < 1_200) {
      const answer = await answerOf(app, request);
      dates.add(answer.headers.date ?? "");
      expect(transportProblem("date", answer.headers.date ?? "", answer.clock)).toBeUndefined();
    }
    expect(dates.size).toBeGreaterThan(1);
    await app.close();
  });

  it("tells apart two answers whose headers come in another order, as a client can", () => {
    const reordered = { ...NEUTRAL, headers: Object.fromEntries(Object.entries(NEUTRAL.headers).reverse()) };
    expect(said(reordered)).not.toBe(said(NEUTRAL));
    expect(said({ ...NEUTRAL, headers: { ...NEUTRAL.headers } })).toBe(said(NEUTRAL));
  });

  it("reports a route that tells which drops exist by a Date of its own: a few seconds behind Node's, or another weekday's name (T14)", async () => {
    for (const date of [() => new Date(Date.now() - 3_000).toUTCString(), otherWeekday]) {
      const app = await plantedApp("getDrop", (request, reply) =>
        (request.params as { drop_id: string }).drop_id === here.drop
          ? neutral(reply.header("date", date()))
          : neutral(reply),
      );
      // Node's Date never goes back, so once an answer for another id has come, a Date behind it isn't
      // its answer's time: from the second signed-out caller on, the cell's ids come after the last
      // caller's fresh ones, and the cell's own request after them all.
      const step = await signedOutStep(app, spec("getDrop"), elsewhere);
      expect(step.problems.some((problem) => problem.endsWith("another answer for fresh ids (T14)"))).toBe(true);
      const cell = await cellStep(app, spec("getDrop"));
      expect(cell.problems.some((problem) => problem.startsWith("getDrop: date: "))).toBe(true);
      await app.close();
    }
  });

  it("reports a route that answers a signed-out caller differently when the request carries a cursor (T14)", async () => {
    const app = await plantedApp("listComments", (request, reply) =>
      request.headers.authorization === undefined && (request.query as Record<string, string>).cursor !== undefined
        ? reply.code(401).header("cache-control", "private, no-store").send({ code: "UNAUTHENTICATED" })
        : neutral(reply),
    );
    const step = await signedOutStep(app, spec("listComments"), elsewhere);
    expect(step.problems).toContain(
      "listComments, no session: another answer for the cell's, with a forged cursor, ids (T14)",
    );
    expect(step.problems.filter((problem) => !problem.includes("no session"))).toEqual([]);
    await app.close();
  });
});
