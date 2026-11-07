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
import type { Answer } from "./scanner.ts";

/**
 * The neutral not-found (T14), the one answer for missing and for not the caller's: pinned here, not
 * taken from the app under test, so a route that answers everyone the same wrong thing fails.
 */
export const NEUTRAL: Answer = {
  status: 404,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "content-length": "20",
  },
  body: '{"code":"NOT_FOUND"}',
};

/** Headers the transport sets, which differ from answer to answer and say nothing. */
const TRANSPORT = new Set(["date", "connection", "keep-alive"]);

/** `answer` as one string, its transport's headers left out, for comparing answers byte for byte. */
export function said(answer: Answer): string {
  const headers = Object.entries(answer.headers)
    .filter(([name]) => !TRANSPORT.has(name))
    .sort(([one], [other]) => (one < other ? -1 : 1));
  return `${String(answer.status)} ${JSON.stringify(headers)} ${answer.body}`;
}

/** How `answer` differs from the neutral not-found; empty when it's the same, byte for byte. */
export function neutralProblems(answer: Answer): string[] {
  const problems: string[] = [];
  if (answer.status !== NEUTRAL.status) problems.push(`status ${String(answer.status)}`);
  if (answer.body !== NEUTRAL.body) problems.push(`body ${JSON.stringify(answer.body.slice(0, 200))}`);
  for (const [header, value] of Object.entries(NEUTRAL.headers)) {
    if (answer.headers[header] !== value) problems.push(`${header}: ${String(answer.headers[header])}`);
  }
  for (const header of Object.keys(answer.headers)) {
    if (!Object.hasOwn(NEUTRAL.headers, header) && !TRANSPORT.has(header)) problems.push(`an extra header, ${header}`);
  }
  return problems;
}

/**
 * Whether `answer` is one a malformed id may get: the neutral not-found, or the contract's 400 for a
 * request that doesn't match `Id` (errors.ts), naming at most the parameter and never its value. A
 * malformed id names no object, so T14 isn't at stake; its answer is checked for what it echoes.
 */
export function malformedProblems(answer: Answer, parameter: string, value: string): string[] {
  if (neutralProblems(answer).length === 0) return [];
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

/** The answer `app` gives `request`, in the scanner's shape. */
export async function answerOf(app: FastifyInstance, request: Request): Promise<Answer> {
  const response = await app.inject({ method: request.method as "GET", url: request.url, headers: request.headers });
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return { status: response.statusCode, headers, body: response.body };
}

/** A request, ready for `inject`. */
export interface Request {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/** A request before it's written out: its operation and each parameter's value, as sent. */
export interface Spec {
  operation: ContractOperation;
  /** Written into the path as they are, so a test can send a raw escape. */
  path: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
}

/**
 * The role's credentials. In this slice a stand-in naming the account, which the skeleton ignores;
 * slice 8 replaces it with a Supabase access token signed for the account (T53), here and nowhere else.
 */
export function credentials(account: string): Record<string, string> {
  return { authorization: `Bearer matrix-${account}` };
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
 * The requests a cell makes to `operation`, as `account`, naming the cell's world: one for each value
 * of a required enum query parameter, then each of those again with each optional Id query parameter
 * filled, so it is sent and guessed like the required ones. A required parameter it can't fill, or
 * an Id parameter with no binding, stops the harness. The other optional parameters are left out:
 * the cursor has its own step (guessStep), and the rest name nothing (`month`, `q`, `limit`).
 */
export function specsFor(operation: ContractOperation, targets: Targets, account: string): Spec[] {
  const path: Record<string, string> = {};
  const headers: Record<string, string> = credentials(account);
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
  return { method: spec.operation.method, url: query === "" ? url : `${url}?${query}`, headers };
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

/** A cell, as its row NONE has it: the request answered with the neutral not-found (T14). */
export async function cellStep(app: FastifyInstance, spec: Spec): Promise<Step> {
  const answer = await answerOf(app, render(spec));
  return {
    problems: neutralProblems(answer).map((problem) => `${spec.operation.id}: ${problem}`),
    answers: [{ spec, answer }],
  };
}

/** The cell's request with the client's clock and parameters past the reveal: each still neutral (T16, Q09). */
export async function manipulationStep(
  app: FastifyInstance,
  spec: Spec,
  author: string,
  later: Temporal.Instant,
): Promise<Step> {
  const step: Step = { problems: [], answers: [] };
  const own = new Set(Object.keys(spec.headers));
  for (const changed of manipulations(spec, author, later)) {
    const answer = await answerOf(app, render(changed));
    const what = JSON.stringify({
      query: changed.query,
      headers: Object.fromEntries(Object.entries(changed.headers).filter(([name]) => !own.has(name))),
    });
    for (const problem of neutralProblems(answer))
      step.problems.push(`${spec.operation.id}, manipulated ${what}: ${problem}`);
    step.answers.push({ spec: changed, answer });
  }
  return step;
}

/**
 * The cell's request with each Id parameter in turn guessed (T14): a fresh id and another club's
 * object, each neutral. Then each malformed id, whose answer is one a malformed id may get, and the
 * same whether the other Id parameters name the cell's objects, nothing, or another club's, so a
 * route that looks a parent up before it checks the child tells no one which parents exist. Then,
 * where the operation pages, a cursor no server issued and each malformed one, each answered as a
 * malformed id may be. Each malformed answer is returned by its request, so the matrix can check
 * it's the same in every cell, for every role.
 */
export async function guessStep(
  app: FastifyInstance,
  spec: Spec,
  elsewhere: Targets,
): Promise<Step & { malformed: Map<string, string> }> {
  const step = { problems: [] as string[], answers: [] as Step["answers"], malformed: new Map<string, string>() };
  const ids = idParameters(spec);
  for (const parameter of ids) {
    const guesses = [freshId(), bind(parameter.name, elsewhere)];
    for (const guess of guesses) {
      const guessed = withId(spec, parameter, { raw: guess, decoded: guess });
      const answer = await answerOf(app, render(guessed));
      for (const problem of neutralProblems(answer))
        step.problems.push(`${spec.operation.id}, ${parameter.name} guessed: ${problem}`);
      step.answers.push({ spec: guessed, answer });
    }
    const others = ids.filter((other) => other !== parameter);
    for (const value of MALFORMED) {
      const label = `${spec.operation.id}, ${parameter.name} ${JSON.stringify(value.raw.slice(0, 12))}`;
      const malformed = withId(spec, parameter, value);
      const answer = await answerOf(app, render(malformed));
      step.answers.push({ spec: malformed, answer });
      for (const problem of malformedProblems(answer, parameter.name, value.decoded))
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
        for (const problem of malformedProblems(besideAnswer, parameter.name, value.decoded))
          step.problems.push(`${label}, beside ids that name ${names}: ${problem}`);
        if (said(besideAnswer) !== said(answer))
          step.problems.push(`${label}: another answer when the other ids name ${names} (T14)`);
      }
    }
  }
  if (pages(spec.operation)) {
    for (const value of [{ raw: "fresh", decoded: freshCursor() }, ...MALFORMED]) {
      const paged = { ...spec, query: { ...spec.query, cursor: value.decoded } };
      const answer = await answerOf(app, render(paged));
      step.answers.push({ spec: paged, answer });
      for (const problem of malformedProblems(answer, "cursor", value.decoded)) {
        step.problems.push(`${spec.operation.id}, cursor ${JSON.stringify(value.raw.slice(0, 12))}: ${problem}`);
      }
      step.malformed.set(`${spec.operation.id} cursor ${value.raw}`, said(answer));
    }
  }
  return step;
}

/** How many answers guessStep gets for `spec`. */
export function guessCount(spec: Spec): number {
  const ids = idParameters(spec).length;
  const beside = ids > 1 ? 2 : 0;
  return ids * (2 + MALFORMED.length * (1 + beside)) + (pages(spec.operation) ? 1 + MALFORMED.length : 0);
}

/**
 * Callers without a session, each in place of the role's credentials: none at all, a token that
 * isn't one, and another scheme. Slice 8 adds an expired token and a deleted account's, once real
 * tokens exist (T53).
 */
export const SIGNED_OUT: readonly { name: string; authorization: string | null }[] = [
  { name: "no session", authorization: null },
  { name: "a token that isn't one", authorization: "Bearer not-a-token" },
  { name: "another scheme", authorization: "Basic bWF0cml4Om1hdHJpeA==" },
];

/**
 * The cell's request from each caller without a session, with the cell's ids, then ids that name
 * nothing, then another club's: the same answer, byte for byte, whatever the ids name, so a route
 * that looks an object up before it checks the session tells no one which objects exist (T14). The
 * skeleton's row asks the neutral not-found of each.
 */
export async function signedOutStep(app: FastifyInstance, spec: Spec, elsewhere: Targets): Promise<Step> {
  const step: Step = { problems: [], answers: [] };
  const variants: [string, Spec][] = [["the cell's", spec]];
  if (idParameters(spec).length > 0) {
    variants.push(
      ["fresh", withIds(spec, () => freshId())],
      ["another club's", withIds(spec, (parameter) => bind(parameter.name, elsewhere))],
    );
  }
  for (const caller of SIGNED_OUT) {
    let first: string | undefined;
    for (const [ids, variant] of variants) {
      const headers = Object.fromEntries(Object.entries(variant.headers).filter(([name]) => name !== "authorization"));
      if (caller.authorization !== null) headers.authorization = caller.authorization;
      const sent = { ...variant, headers };
      const answer = await answerOf(app, render(sent));
      step.answers.push({ spec: sent, answer });
      for (const problem of neutralProblems(answer))
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
export function signedOutCount(spec: Spec): number {
  return SIGNED_OUT.length * (idParameters(spec).length > 0 ? 3 : 1);
}
