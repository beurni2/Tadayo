/// <reference lib="esnext.temporal" />
// The privacy matrix's harness proves each check can fail (TECH-DESIGN section 8, T58): a route
// added without a row, a route outside the contract, and small test-only apps that each answer one
// contract operation wrongly in one way, run through the same steps the matrix runs. No database.

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { BINDINGS, freshId, type Targets } from "./bindings.ts";
import { cellStep, guessStep, manipulationStep, routeProblems, specsFor, type Spec } from "./harness.ts";
import { contractOperations, readDocument, type ContractOperation } from "./operations.ts";
import { NONE, ROWS, rowProblems } from "./rows.ts";

const operations = contractOperations(readDocument());
const byId = new Map(operations.map((operation) => [operation.id, operation]));

function operation(id: string): ContractOperation {
  const found = byId.get(id);
  if (!found) throw new Error(id);
  return found;
}

const here: Targets = { club: "clb_here", drop: "drp_here", day: "occ_here", author: "itv_here" };
const elsewhere: Targets = { club: "clb_there", drop: "drp_there", day: "occ_there", author: "itv_there" };
const LATER = Temporal.Instant.from("2026-11-08T07:00:00Z");

/** The neutral not-found, as the skeleton sends it. */
function neutral(reply: FastifyReply) {
  return reply
    .code(404)
    .header("cache-control", "private, no-store")
    .type("application/json; charset=utf-8")
    .send('{"code":"NOT_FOUND"}');
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
      "upload_id",
    ]);
  });
});

describe("each step of the matrix reports a planted wrong answer", () => {
  it("passes the skeleton's neutral answer in every step", async () => {
    const app = await plantedApp("getDrop", (_request, reply) => neutral(reply));
    expect((await cellStep(app, spec("getDrop"))).problems).toEqual([]);
    expect((await manipulationStep(app, spec("getDrop"), "acct_author", LATER)).problems).toEqual([]);
    expect((await guessStep(app, spec("getDrop"), elsewhere)).problems).toEqual([]);
    await app.close();
  });

  const wrong: [string, (reply: FastifyReply) => FastifyReply][] = [
    [
      "403 PROFILE_INCOMPLETE to everyone",
      (reply) => reply.code(403).header("cache-control", "private, no-store").send({ code: "PROFILE_INCOMPLETE" }),
    ],
    [
      "a not-found with a field",
      (reply) => reply.code(404).header("cache-control", "private, no-store").send({ code: "NOT_FOUND", field: "x" }),
    ],
    [
      "a schema-valid 200 to everyone",
      (reply) => reply.code(200).header("cache-control", "private, no-store").send({ code: "NOT_FOUND" }),
    ],
    ["the neutral not-found with an extra header", (reply) => neutral(reply.header("x-drop-state", "held"))],
    [
      "the neutral not-found without no-store",
      (reply) => reply.code(404).type("application/json; charset=utf-8").send('{"code":"NOT_FOUND"}'),
    ],
  ];
  for (const [name, answer] of wrong) {
    it(`reports a route that answers ${name}`, async () => {
      const app = await plantedApp("getDrop", (_request, reply) => answer(reply));
      expect((await cellStep(app, spec("getDrop"))).problems).not.toEqual([]);
      await app.close();
    });
  }

  const tells: [string, (request: FastifyRequest) => boolean][] = [
    ["`now` in the query", (request) => Object.hasOwn(request.query as object, "now")],
    ["`rendition=full` in the query", (request) => (request.query as Record<string, string>).rendition === "full"],
    ["a client time header", (request) => request.headers["x-client-time"] !== undefined],
    ["a Date header", (request) => request.headers.date !== undefined],
  ];
  for (const [name, tell] of tells) {
    it(`reports a route that answers differently for ${name} (T16, Q09)`, async () => {
      const app = await plantedApp("getDrop", (request, reply) =>
        tell(request) ? reply.code(200).header("cache-control", "private, no-store").send({}) : neutral(reply),
      );
      const step = await manipulationStep(app, spec("getDrop"), "acct_author", LATER);
      // One manipulated request, however many ways its answer differs.
      expect(new Set(step.problems.map((problem) => problem.slice(0, problem.indexOf(": "))))).toHaveLength(1);
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
    expect(step.problems).not.toEqual([]);
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
    for (const [name, answer] of [
      [
        "echoes the id",
        (reply: FastifyReply, id: string) =>
          reply.code(400).header("cache-control", "private, no-store").send({ code: "INVALID_REQUEST", field: id }),
      ],
      ["answers 500", (reply: FastifyReply) => reply.code(500).send()],
    ] as const) {
      const app = await plantedApp("getDrop", (request, reply) => {
        const id = (request.params as { drop_id: string }).drop_id;
        return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? neutral(reply) : answer(reply, id);
      });
      const step = await guessStep(app, spec("getDrop"), elsewhere);
      expect(step.problems.length, name).toBeGreaterThan(0);
      await app.close();
    }
  });

  it("returns each malformed id's answer, for the matrix to check it's the same in every cell", async () => {
    const app = await plantedApp("getDrop", (_request, reply) => neutral(reply));
    const step = await guessStep(app, spec("getDrop"), elsewhere);
    expect(step.malformed.size).toBe(10);
    expect(new Set(step.malformed.values())).toEqual(new Set(['404 {"code":"NOT_FOUND"}']));
    expect(freshId()).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    await app.close();
  });
});
