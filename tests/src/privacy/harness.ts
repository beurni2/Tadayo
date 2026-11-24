/// <reference lib="esnext.temporal" />
// The privacy matrix's harness (TECH-DESIGN section 8): the neutral not-found every unauthorized
// cell must get, and the requests a cell makes, generated from the contract's operations: as the
// role, with each id from the cell's world, then with the client's clock and parameters moved past
// the reveal (T16, Q09), then with guessed and malformed ids and cursors (T14), and from callers
// without a session.

import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiError } from "@tadayo/contracts";
import { bind, freshId, type Targets } from "./bindings.ts";
import { isObject, type ContractOperation, type Parameter } from "./operations.ts";
import { transportProblem, type Answer } from "./scanner.ts";

/**
 * The neutral not-found (T14), the one answer for missing and for not the caller's: pinned here, not
 * taken from the app under test, so a route that answers everyone the same wrong thing fails.
 */
export const NEUTRAL: Answer = {
  status: 404,
  reason: "Not Found",
  // In the order the app sends them, which is compared too (NEUTRAL_ORDER).
  headers: {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": "20",
    // The one Connection an answer the app sends whole has (inject's, and Node's for a client that
    // keeps its connection); compared as it is, so a close for some ids and not others is seen.
    connection: "keep-alive",
  },
  body: '{"code":"NOT_FOUND"}',
};

/**
 * The gate's one 401 (T14, T27, T53): no session, whatever is wrong with the token or the account behind
 * it, in the neutral not-found's own form. Pinned here, not taken from the app under test, so a gate
 * that answers by its cause fails.
 */
export const UNAUTHENTICATED: Answer = pinned(401, "Unauthorized", '{"code":"UNAUTHENTICATED"}');

/** The gate's 403 for an account whose profile isn't finished, on a route that isn't `beforeProfile` (FQ13, FQ69). */
export const PROFILE_INCOMPLETE: Answer = pinned(403, "Forbidden", '{"code":"PROFILE_INCOMPLETE"}');

/**
 * An answer the app sends whole, as the neutral not-found is: the same headers, its own status, reason and
 * body. What a cell's row pins, byte for byte, where the answer carries nothing the cell's world changes.
 */
export function pinned(
  status: number,
  reason: string,
  body: string,
  connection: "keep-alive" | "close" = "keep-alive",
): Answer {
  return {
    status,
    reason,
    headers: { ...NEUTRAL.headers, "content-length": String(Buffer.byteLength(body)), connection },
    body,
  };
}

/** The neutral not-found's headers in the order they are sent, with Node's Date before Connection. */
const NEUTRAL_ORDER = ["cache-control", "content-type", "content-length", "date", "connection"];

/**
 * The headers of an answer to a request the app refused before it read the body (a body past the route's
 * limit; `pinned(..., "close")`): Fastify sets `Connection: close` itself, ahead of its own headers, so that
 * what the client goes on sending is never read, and Node's Date follows them.
 */
const UNREAD_ORDER = ["connection", "cache-control", "content-type", "content-length", "date"];

/**
 * Date, the one header whose value differs from answer to answer: compared as the answer's time when
 * it is that (the scanner's transportProblem, inside the answer's clock), else as it is. Every other
 * header is compared as sent.
 */
function compared(name: string, value: string, clock: Answer["clock"]): string {
  return name === "date" && transportProblem(name, value, clock) === undefined ? "(the answer's time)" : value;
}

/**
 * `answer` as one string, for comparing answers byte for byte: the status, the reason phrase, every
 * header in the order it came, and the body, with a Date that is the answer's time standing for its
 * value.
 */
export function said(answer: Answer): string {
  const headers = Object.entries(answer.headers).map(([name, value]) => [name, compared(name, value, answer.clock)]);
  return `${String(answer.status)} ${answer.reason} ${JSON.stringify(headers)} ${answer.body}`;
}

/** How `answer` differs from the answer `expected` pins; empty when it's the same, byte for byte. */
export function pinnedProblems(answer: Answer, expected: Answer): string[] {
  const problems: string[] = [];
  if (answer.status !== expected.status) problems.push(`status ${String(answer.status)}`);
  if (answer.reason !== expected.reason) problems.push(`reason ${JSON.stringify(answer.reason)}`);
  if (answer.body !== expected.body) problems.push(`body ${JSON.stringify(answer.body.slice(0, 200))}`);
  for (const [header, value] of Object.entries(expected.headers)) {
    if (answer.headers[header] !== value) problems.push(`${header}: ${String(answer.headers[header])}`);
  }
  for (const [header, value] of Object.entries(answer.headers)) {
    if (Object.hasOwn(expected.headers, header)) continue;
    if (header !== "date") problems.push(`an extra header, ${header}`);
    else {
      const problem = transportProblem(header, value, answer.clock);
      if (problem !== undefined) problems.push(`${header}: ${JSON.stringify(value.slice(0, 80))}, ${problem}`);
    }
  }
  const order = Object.keys(answer.headers);
  const sent = expected.headers.connection === "close" ? UNREAD_ORDER : NEUTRAL_ORDER;
  if (problems.length === 0 && order.join(", ") !== sent.join(", "))
    problems.push(`the headers in another order: ${order.join(", ")}`);
  return problems;
}

/** How `answer` differs from the neutral not-found; empty when it's the same, byte for byte. */
export function neutralProblems(answer: Answer): string[] {
  return pinnedProblems(answer, NEUTRAL);
}

/**
 * Whether `answer` is one a malformed id may get: the neutral not-found (which Fastify's router gives an
 * id it can't route, before any gate), the gate's own answer when the caller has `gate` to meet (a
 * route the caller may not reach never looks at its ids), or the contract's 400 for a request that
 * doesn't match `Id` (errors.ts), naming at most the parameter and never its value. A malformed id names
 * no object, so T14 isn't at stake; its answer is checked for what it echoes.
 */
export function malformedProblems(answer: Answer, parameter: string, value: string, gate?: Answer): string[] {
  if (neutralProblems(answer).length === 0) return [];
  if (gate !== undefined && pinnedProblems(answer, gate).length === 0) return [];
  if (answer.status !== 400)
    return [`status ${String(answer.status)}: neither the neutral not-found nor INVALID_REQUEST`];
  let body: unknown;
  try {
    body = JSON.parse(answer.body);
  } catch {
    return ["a 400 that isn't JSON"];
  }
  const parsed = ApiError.safeParse(body);
  const problems: string[] = [];
  if (!parsed.success || parsed.data.code !== "INVALID_REQUEST") problems.push("a 400 that isn't INVALID_REQUEST");
  if (isObject(body)) {
    const extra = Object.keys(body).filter((key) => key !== "code" && key !== "field");
    if (extra.length > 0) problems.push(`a 400 with ${extra.join(", ")}`);
    if (body.field !== undefined && body.field !== parameter) problems.push(`a 400 whose field isn't ${parameter}`);
  }
  const echoed =
    value.length >= 3 && [answer.body, ...Object.values(answer.headers)].some((text) => text.includes(value));
  if (echoed) problems.push("a 400 that echoes the value");
  return problems;
}

/**
 * How far Node's Date may lag the second an answer is asked in. Node caches the Date it writes and
 * clears it from a timer at the next second, which runs only when the event loop reaches its timers
 * phase; a chain of injects never does (light-my-request settles each through process.nextTick), so
 * answerOf lets the loop turn before each request, and Node's Date is then at most a second behind
 * (a second exactly in the session's matrix runs). Generous, since the order of answers holds the
 * Date tighter (lastDates).
 */
const DATE_LAG_MS = 5_000;

/**
 * The latest Date each app's answers have carried, in ms: Node's own never goes back, so no later
 * answer's may. One app's answers are one run of the matrix, or one test.
 */
const lastDates = new WeakMap<FastifyInstance, number>();

/**
 * The answer `app` gives `request`, in the scanner's shape, with its clock: the Dates it may carry,
 * from the later of an earlier answer's Date and the second it was asked in less DATE_LAG_MS, to the
 * moment it came. A route that writes some ids a Date of its own steps outside that clock when the
 * Date is behind an earlier answer's Date or more than DATE_LAG_MS behind the second it was asked
 * in, or ahead of the moment its own answer came; one inside those, in Node's place among the
 * headers, would pass. First it lets the event loop turn, so Node renews its cached Date
 * (DATE_LAG_MS).
 */
export async function answerOf(app: FastifyInstance, request: Request): Promise<Answer> {
  await new Promise((resolve) => setImmediate(resolve));
  const from = Date.now();
  const response = await app.inject({
    method: request.method as "GET",
    url: request.url,
    headers: request.headers,
    ...(request.payload === undefined ? {} : { payload: request.payload }),
  });
  const clock = {
    earliest: Math.max(lastDates.get(app) ?? 0, Math.floor(from / 1000) * 1000 - DATE_LAG_MS),
    latest: Date.now(),
  };
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  const date = headers.date;
  if (date !== undefined && transportProblem("date", date, clock) === undefined) lastDates.set(app, Date.parse(date));
  return { status: response.statusCode, reason: response.statusMessage, headers, body: response.body, clock };
}

/** A request, ready for `inject`. */
export interface Request {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** The body as sent: JSON, or any bytes a test wants refused. */
  payload?: string;
}

/** A request before it's written out: its operation and each parameter's value, as sent. */
export interface Spec {
  operation: ContractOperation;
  /** Written into the path as they are, so a test can send a raw escape. */
  path: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  /** The body, as the raw string sent; none for the requests `specsFor` makes. */
  body?: string;
}

function isId(parameter: Parameter): boolean {
  return parameter.schema.$ref === "#/components/schemas/Id";
}

/** Whether `operation` pages with an optional `cursor` (the contract's Cursor). */
export function pages(operation: ContractOperation): boolean {
  return operation.parameters.some(
    (parameter) =>
      parameter.in === "query" &&
      parameter.name === "cursor" &&
      parameter.schema.$ref === "#/components/schemas/Cursor",
  );
}

/** A cursor no server issued, in the contract's Cursor shape (T14: a forged cursor). */
export function freshCursor(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The requests a cell makes to `operation`, with `authorization` as the caller's header (the role's
 * signed token; a stand-in where no app checks it), naming the cell's world: one for each value
 * of a required enum query parameter, then each of those again with each optional Id query parameter
 * filled, so it is sent and guessed like the required ones. A required parameter it can't fill, or
 * an Id parameter with no binding, stops the harness. The other optional parameters are left out:
 * the cursor has its own step (guessStep), and the rest name nothing (`month`, `q`, `limit`).
 */
export function specsFor(operation: ContractOperation, targets: Targets, authorization: string): Spec[] {
  const path: Record<string, string> = {};
  const headers: Record<string, string> = { authorization };
  let queries: Record<string, string>[] = [{}];
  const optional: string[] = [];
  for (const parameter of operation.parameters) {
    if (parameter.in === "path") {
      if (!isId(parameter)) throw new Error(`${operation.id}: path parameter ${parameter.name} isn't an Id`);
      path[parameter.name] = bind(parameter.name, targets);
    } else if (!parameter.required) {
      if (parameter.in === "query" && isId(parameter)) optional.push(parameter.name);
    } else if (parameter.in === "header") {
      if (parameter.name !== "Idempotency-Key") throw new Error(`${operation.id}: can't fill header ${parameter.name}`);
      headers["idempotency-key"] = randomUUID();
    } else if (isId(parameter)) {
      const value = bind(parameter.name, targets);
      queries = queries.map((query) => ({ ...query, [parameter.name]: value }));
    } else if (parameter.values !== null) {
      const values = parameter.values;
      queries = queries.flatMap((query) => values.map((value) => ({ ...query, [parameter.name]: value })));
    } else {
      throw new Error(`${operation.id}: can't fill the required query parameter ${parameter.name}`);
    }
  }
  const filled = optional.flatMap((name) => {
    const value = bind(name, targets);
    return queries.map((query) => ({ ...query, [name]: value }));
  });
  return [...queries, ...filled].map((query) => ({ operation, path, query, headers }));
}

/** `spec` written out: the path's values as they are, the query encoded. */
export function render(spec: Spec): Request {
  let url = spec.operation.path;
  for (const [name, value] of Object.entries(spec.path)) url = url.replace(`{${name}}`, value);
  const query = new URLSearchParams(spec.query).toString();
  // Each idempotent request is its own action, so it never meets another's key (T19).
  const headers = { ...spec.headers };
  if (headers["idempotency-key"] !== undefined) headers["idempotency-key"] = randomUUID();
  return {
    method: spec.operation.method,
    url: query === "" ? url : `${url}?${query}`,
    headers,
    ...(spec.body === undefined ? {} : { payload: spec.body }),
  };
}

/**
 * `spec` with the client's clock and parameters moved past the reveal (T16, Q09): each query
 * parameter a client might hope the server reads, set over any already there, `viewer` naming the
 * author by the membership id every caption card gives out; then the two headers that carry a
 * device's time, and the two that ask a media route for a short answer before it has checked the
 * caller (a 304 for any version, a 206 for one byte).
 */
export function manipulations(spec: Spec, author: string, later: Temporal.Instant): Spec[] {
  const at = later.toString({ smallestUnit: "second" });
  const date = new Date(later.epochMilliseconds).toUTCString();
  const query: Record<string, string> = {
    now: at,
    at,
    as_of: at,
    server_now: at,
    reveal: "true",
    preview: "true",
    rendition: "full",
    include: "media",
    viewer: author,
  };
  return [
    ...Object.entries(query).map(([name, value]) => ({ ...spec, query: { ...spec.query, [name]: value } })),
    { ...spec, headers: { ...spec.headers, date } },
    { ...spec, headers: { ...spec.headers, "x-client-time": at } },
    { ...spec, headers: { ...spec.headers, "if-none-match": "*" } },
    { ...spec, headers: { ...spec.headers, range: "bytes=0-0" } },
  ];
}

/** The Id parameters `spec` names, path and query, in order. */
export function idParameters(spec: Spec): { name: string; in: "path" | "query" }[] {
  return [
    ...Object.keys(spec.path).map((name) => ({ name, in: "path" as const })),
    ...spec.operation.parameters
      .filter((parameter) => parameter.in === "query" && isId(parameter) && Object.hasOwn(spec.query, parameter.name))
      .map((parameter) => ({ name: parameter.name, in: "query" as const })),
  ];
}

/** `spec` with one Id parameter set to `value`, written as it is in a path, decoded in a query. */
export function withId(
  spec: Spec,
  parameter: { name: string; in: "path" | "query" },
  value: { raw: string; decoded: string },
): Spec {
  return parameter.in === "path"
    ? { ...spec, path: { ...spec.path, [parameter.name]: value.raw } }
    : { ...spec, query: { ...spec.query, [parameter.name]: value.decoded } };
}

/** `spec` with every Id parameter set by `value`. */
function withIds(spec: Spec, value: (parameter: { name: string; in: "path" | "query" }) => string): Spec {
  let changed = spec;
  for (const parameter of idParameters(spec)) {
    const id = value(parameter);
    changed = withId(changed, parameter, { raw: id, decoded: id });
  }
  return changed;
}

/**
 * Ids that can't be one (T14: a guessed id): too long for `Id` (65), past Fastify's parameter limit
 * (101) and far past it (4 KB), a NUL, a step up the path, a broken escape, a lone `%`, a cut-off
 * multi-byte escape, an empty segment, and a raw `/`, which leaves the operation's path for one the
 * contract doesn't have, so the app's not-found handler answers it. The same values, decoded, are
 * the malformed cursors: past Cursor's 512, or outside its alphabet (the first two are well formed
 * there, a cursor no server issued).
 */
export const MALFORMED: readonly { raw: string; decoded: string }[] = [
  { raw: "a".repeat(65), decoded: "a".repeat(65) },
  { raw: "a".repeat(101), decoded: "a".repeat(101) },
  { raw: "a".repeat(4096), decoded: "a".repeat(4096) },
  { raw: "%00", decoded: "\u0000" },
  { raw: "..%2F", decoded: "../" },
  { raw: "%zz", decoded: "%zz" },
  { raw: "%", decoded: "%" },
  { raw: "%E0%A4%A", decoded: "%E0%A4%A" },
  { raw: "", decoded: "" },
  { raw: "a/b", decoded: "a/b" },
];

/**
 * The one route the app has outside the contract: the browser's preflight before the signed-out invitation
 * page's request from tadayo.app (services/api/src/web-origin.ts). Pinned here by its method and path, not
 * taken from the app, so a second such route fails `routeProblems`' caller.
 */
export const PREFLIGHT_ROUTE = "OPTIONS /v1/invitations/web-preview";

/** The preflight's one answer, whoever asks and whatever they send, pinned byte for byte, headers in order. */
export const PREFLIGHT: Answer = {
  status: 204,
  reason: "No Content",
  headers: {
    "access-control-allow-origin": "https://tadayo.app",
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "cache-control": "private, no-store",
    connection: "keep-alive",
  },
  body: "",
};

/** How `answer` differs from the preflight's one answer: every header as pinned, in order, and Node's Date. */
export function preflightProblems(answer: Answer): string[] {
  const problems: string[] = [];
  if (answer.status !== PREFLIGHT.status) problems.push(`status ${String(answer.status)}`);
  if (answer.reason !== PREFLIGHT.reason) problems.push(`reason ${JSON.stringify(answer.reason)}`);
  if (answer.body !== "") problems.push(`body ${JSON.stringify(answer.body.slice(0, 200))}`);
  const { date, ...others } = answer.headers;
  if (date === undefined) problems.push("no Date");
  else {
    const problem = transportProblem("date", date, answer.clock);
    if (problem !== undefined) problems.push(`date: ${JSON.stringify(date.slice(0, 80))}, ${problem}`);
  }
  const want = Object.entries(PREFLIGHT.headers);
  const got = Object.entries(others);
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`the headers ${JSON.stringify(got)}`);
  return problems;
}

/**
 * How `fromPage`, `previewInvitationWeb`'s answer to a request from tadayo.app, differs from `plain`, the same
 * request's answer with no Origin: the allowance's two headers first, then the same answer, byte for byte
 * (services/api/src/web-origin.ts). Each answer's own Date is the transport's, judged where it is taken.
 */
export function allowanceProblems(plain: Answer, fromPage: Answer): string[] {
  const problems: string[] = [];
  if (fromPage.status !== plain.status) problems.push(`status ${String(fromPage.status)}, not ${String(plain.status)}`);
  if (fromPage.reason !== plain.reason) problems.push(`reason ${JSON.stringify(fromPage.reason)}`);
  if (fromPage.body !== plain.body) problems.push(`body ${JSON.stringify(fromPage.body.slice(0, 200))}`);
  const others = (answer: Answer) => Object.entries(answer.headers).filter(([name]) => name !== "date");
  const want = [["access-control-allow-origin", "https://tadayo.app"], ["vary", "Origin"], ...others(plain)];
  const got = others(fromPage);
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`the headers ${JSON.stringify(got)}`);
  return problems;
}

/** The app's routes as `METHOD /path`, against the contract's, each way. */
export function routeProblems(routes: readonly string[], operations: readonly ContractOperation[]): string[] {
  const contract = new Set(
    operations.map((operation) => `${operation.method} ${operation.path.replace(/\{([a-z_]+)\}/g, ":$1")}`),
  );
  const app = new Set(routes);
  return [
    ...[...app]
      .filter((route) => !contract.has(route))
      .map((route) => `the app has ${route}, which the contract doesn't`),
    ...[...contract].filter((route) => !app.has(route)).map((route) => `the app has no route for ${route}`),
  ];
}

/** What one step of the matrix found, and every answer it got, for the leak scanner. */
export interface Step {
  problems: string[];
  answers: { spec: Spec; answer: Answer }[];
}

/**
 * What a request must get: an answer pinned byte for byte (the neutral not-found, or one of the gate's),
 * or a judge of it that a route's row makes for the cell, naming each way the answer is wrong.
 */
export type Expected = Answer | ((answer: Answer) => string[]);

function problemsOf(answer: Answer, expected: Expected): string[] {
  return typeof expected === "function" ? expected(answer) : pinnedProblems(answer, expected);
}

/** A cell, as its row says: by default the skeleton's NONE, the neutral not-found for everyone (T14). */
export async function cellStep(app: FastifyInstance, spec: Spec, expected: Expected = NEUTRAL): Promise<Step> {
  const answer = await answerOf(app, render(spec));
  return {
    problems: problemsOf(answer, expected).map((problem) => `${spec.operation.id}: ${problem}`),
    answers: [{ spec, answer }],
  };
}

/** The cell's request with the client's clock and parameters past the reveal: each still what the cell gets (T16, Q09). */
export async function manipulationStep(
  app: FastifyInstance,
  spec: Spec,
  author: string,
  later: Temporal.Instant,
  expected: Expected = NEUTRAL,
): Promise<Step> {
  const step: Step = { problems: [], answers: [] };
  const own = new Set(Object.keys(spec.headers));
  for (const changed of manipulations(spec, author, later)) {
    const answer = await answerOf(app, render(changed));
    const what = JSON.stringify({
      query: changed.query,
      headers: Object.fromEntries(Object.entries(changed.headers).filter(([name]) => !own.has(name))),
    });
    for (const problem of problemsOf(answer, expected))
      step.problems.push(`${spec.operation.id}, manipulated ${what}: ${problem}`);
    step.answers.push({ spec: changed, answer });
  }
  return step;
}

/**
 * The cell's request with each Id parameter in turn guessed (T14): a fresh id and another club's
 * object, each neutral, or `gate`'s answer for a caller the gate stops before any route. Then each
 * malformed id, whose answer is one a malformed id may get (`gate` too), and the
 * same whether the other Id parameters name the cell's objects, nothing, or another club's, so a
 * route that looks a parent up before it checks the child tells no one which parents exist. Then,
 * where the operation pages, a cursor no server issued and each malformed one, each answered as a
 * malformed id may be, and the same whether the Id parameters name the cell's objects, nothing, or
 * another club's, so a cursor tells no one which parents exist either. Each malformed answer is
 * returned by its request, so the matrix can check it's the same in every cell, for every role.
 */
export async function guessStep(
  app: FastifyInstance,
  spec: Spec,
  elsewhere: Targets,
  gate?: Answer,
): Promise<Step & { malformed: Map<string, string> }> {
  const step = { problems: [] as string[], answers: [] as Step["answers"], malformed: new Map<string, string>() };
  const ids = idParameters(spec);
  for (const parameter of ids) {
    const guesses = [freshId(), bind(parameter.name, elsewhere)];
    for (const guess of guesses) {
      const guessed = withId(spec, parameter, { raw: guess, decoded: guess });
      const answer = await answerOf(app, render(guessed));
      for (const problem of pinnedProblems(answer, gate ?? NEUTRAL))
        step.problems.push(`${spec.operation.id}, ${parameter.name} guessed: ${problem}`);
      step.answers.push({ spec: guessed, answer });
    }
    const others = ids.filter((other) => other !== parameter);
    for (const value of MALFORMED) {
      const label = `${spec.operation.id}, ${parameter.name} ${JSON.stringify(value.raw.slice(0, 12))}`;
      const malformed = withId(spec, parameter, value);
      const answer = await answerOf(app, render(malformed));
      step.answers.push({ spec: malformed, answer });
      for (const problem of malformedProblems(answer, parameter.name, value.decoded, gate))
        step.problems.push(`${label}: ${problem}`);
      step.malformed.set(`${spec.operation.id} ${parameter.name} ${value.raw}`, said(answer));
      if (others.length === 0) continue;
      for (const [names, id] of [
        ["nothing", () => freshId()],
        ["another club's object", (other: { name: string }) => bind(other.name, elsewhere)],
      ] as const) {
        const beside = withId(
          withIds(spec, (other) => (other.name === parameter.name ? "" : id(other))),
          parameter,
          value,
        );
        const besideAnswer = await answerOf(app, render(beside));
        step.answers.push({ spec: beside, answer: besideAnswer });
        for (const problem of malformedProblems(besideAnswer, parameter.name, value.decoded, gate))
          step.problems.push(`${label}, beside ids that name ${names}: ${problem}`);
        if (said(besideAnswer) !== said(answer))
          step.problems.push(`${label}: another answer when the other ids name ${names} (T14)`);
      }
    }
  }
  if (pages(spec.operation)) {
    for (const value of [{ raw: "fresh", decoded: freshCursor() }, ...MALFORMED]) {
      const label = `${spec.operation.id}, cursor ${JSON.stringify(value.raw.slice(0, 12))}`;
      const paged = { ...spec, query: { ...spec.query, cursor: value.decoded } };
      const answer = await answerOf(app, render(paged));
      step.answers.push({ spec: paged, answer });
      for (const problem of malformedProblems(answer, "cursor", value.decoded, gate))
        step.problems.push(`${label}: ${problem}`);
      step.malformed.set(`${spec.operation.id} cursor ${value.raw}`, said(answer));
      if (ids.length === 0) continue;
      for (const [names, id] of [
        ["nothing", () => freshId()],
        ["another club's object", (other: { name: string }) => bind(other.name, elsewhere)],
      ] as const) {
        const beside = withIds(paged, (other) => id(other));
        const besideAnswer = await answerOf(app, render(beside));
        step.answers.push({ spec: beside, answer: besideAnswer });
        for (const problem of malformedProblems(besideAnswer, "cursor", value.decoded, gate))
          step.problems.push(`${label}, beside ids that name ${names}: ${problem}`);
        if (said(besideAnswer) !== said(answer))
          step.problems.push(`${label}: another answer when the ids name ${names} (T14)`);
      }
    }
  }
  return step;
}

/** How many answers guessStep gets for `spec`. */
export function guessCount(spec: Spec): number {
  const ids = idParameters(spec).length;
  const beside = ids > 1 ? 2 : 0;
  const cursors = pages(spec.operation) ? (1 + MALFORMED.length) * (ids > 0 ? 3 : 1) : 0;
  return ids * (2 + MALFORMED.length * (1 + beside)) + cursors;
}

/** A caller without a session, by the `Authorization` header they send (none when null). */
export interface Caller {
  name: string;
  authorization: string | null;
}

/**
 * Callers without a session that need no key or token of any project: none at all, a token that isn't
 * one, and another scheme. The matrix adds the callers real tokens make (tokens.ts: an expired token, a
 * token of another key, issuer or audience, the anon key's, an unsecured one, a shared secret's, a
 * deleted account's, T53).
 */
export const SIGNED_OUT: readonly Caller[] = [
  { name: "no session", authorization: null },
  { name: "a token that isn't one", authorization: "Bearer not-a-token" },
  { name: "another scheme", authorization: "Basic bWF0cml4Om1hdHJpeA==" },
];

/**
 * The cell's request from each caller without a session, with the cell's ids, then ids that name
 * nothing, then another club's, and, where the operation pages, each of those again with a cursor no
 * server issued: the same answer, byte for byte, whatever the ids and the cursor name, so a route
 * that looks an object up before it checks the session tells no one which objects exist (T14). Each
 * gets `expected`: the neutral not-found for a route the gate lets anyone reach (a `public` one, and
 * the skeleton's), the gate's one 401 for every other, or a row's judge (the health check's 204).
 */
export async function signedOutStep(
  app: FastifyInstance,
  spec: Spec,
  elsewhere: Targets,
  expected: Expected = NEUTRAL,
  callers: readonly Caller[] = SIGNED_OUT,
): Promise<Step> {
  const step: Step = { problems: [], answers: [] };
  const variants: [string, Spec][] = [["the cell's", spec]];
  if (idParameters(spec).length > 0) {
    variants.push(
      ["fresh", withIds(spec, () => freshId())],
      ["another club's", withIds(spec, (parameter) => bind(parameter.name, elsewhere))],
    );
  }
  if (pages(spec.operation)) {
    for (const [ids, variant] of [...variants])
      variants.push([
        `${ids}, with a forged cursor,`,
        { ...variant, query: { ...variant.query, cursor: freshCursor() } },
      ]);
  }
  for (const caller of callers) {
    let first: string | undefined;
    for (const [ids, variant] of variants) {
      const headers = Object.fromEntries(Object.entries(variant.headers).filter(([name]) => name !== "authorization"));
      if (caller.authorization !== null) headers.authorization = caller.authorization;
      const sent = { ...variant, headers };
      const answer = await answerOf(app, render(sent));
      step.answers.push({ spec: sent, answer });
      for (const problem of problemsOf(answer, expected))
        step.problems.push(`${spec.operation.id}, ${caller.name}, ${ids} ids: ${problem}`);
      const text = said(answer);
      if (first === undefined) first = text;
      else if (text !== first)
        step.problems.push(`${spec.operation.id}, ${caller.name}: another answer for ${ids} ids (T14)`);
    }
  }
  return step;
}

/** How many answers signedOutStep gets for `spec`. */
export function signedOutCount(spec: Spec, callers: readonly Caller[] = SIGNED_OUT): number {
  return callers.length * (idParameters(spec).length > 0 ? 3 : 1) * (pages(spec.operation) ? 2 : 1);
}
