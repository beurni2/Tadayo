// `spike-links` against a made-up `flyctl` (test/fake-fly.ts) and a made-up `dev` API
// (docs/plans/api-b0-spike-links.md, sections 2 and 3; T52): the page's two requests and its preflight
// again with the token in its URL, then `dev`'s log buffer read until the requests' own lines are in it,
// and every line of flyctl's output searched for the token, whole or in part, and for its hash. The run
// has to pass clean logs, fail any that hold the token or that never show its requests' own lines, fail
// an API that answers otherwise than `dev` does, and never say the token.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FAKE_FLY_TOKEN, fakeSpawn, lineOf, type Reply, type Route } from "../test/fake-fly.ts";
import { flyOf } from "./fly.ts";
import { OpsError } from "./ops-error.ts";
import { runScript, SCRIPTS, type OpsContext } from "./run.ts";
import { POLL_MS, POLLS, READ_MS, spikeLinks } from "./spike-links.ts";

const LOGS = "flyctl logs -a tadayo-api-dev --no-tail --json";
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };
const PREVIEW = "https://api-dev.tadayo.app/v1/invitations/web-preview";
const PAGE = "https://tadayo.app";

/** One entry as `flyctl logs --json` prints it (flyctl 0.5.8's `logs.LogEntry`, indented by `render.JSON`). */
function entry(message: string, second: number, provider = "app") {
  return {
    level: "info",
    instance: "4d89e3a1b2c3d4",
    message,
    region: "iad",
    timestamp: `2026-11-21T17:00:${String(second).padStart(2, "0")}.000Z`,
    meta: {
      Instance: "",
      Region: "",
      Event: { Provider: provider },
      HTTP: { Request: { ID: "", Method: "", Version: "" }, Response: { status_code: 0 } },
      Error: { Code: 0, Message: "" },
      URL: { Full: "" },
    },
  };
}

type Entry = ReturnType<typeof entry>;

const printed = (entries: readonly Entry[], stderr = ""): Reply => ({
  stdout: entries.map((one) => `${JSON.stringify(one, null, 4)}\n`).join(""),
  stderr,
});

/** The API's one line for a request (services/api/src/logging.ts, `logEachRequest`). */
const requestLine = (id: string, fields: Record<string, unknown>) =>
  JSON.stringify({ level: 30, time: 1_795_280_000_000, reqId: id, ...fields, msg: "request" });

const PREFLIGHT_LINE = (second: number) =>
  entry(requestLine(`p${String(second)}`, { preflight: "previewInvitationWeb", status: 204, ms: 0 }), second);
const POST_LINE = (second: number) =>
  entry(requestLine(`q${String(second)}`, { op: "previewInvitationWeb", status: 404, ms: 3 }), second);
/** A 404 of no operation: any request to a path the API doesn't have, a scanner's among them. */
const STRAY_404 = (second: number) => entry(requestLine(`g${String(second)}`, { status: 404, ms: 0 }), second);

/** What the buffer held before the run: a start, a health check, a Fly line. */
const BEFORE = [
  entry(JSON.stringify({ level: 30, time: 1_795_279_000_000, msg: "listening" }), 1),
  entry(requestLine("h1", { op: "health", status: 200, ms: 1 }), 2),
  entry("Machine started in 1.2s", 3, "runner"),
];
const RUN_LINES = [PREFLIGHT_LINE(20), POST_LINE(21), PREFLIGHT_LINE(22)];

interface Sent {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
  readonly redirect: RequestInit["redirect"];
  readonly signal: boolean;
}

type Answer = () => Response;

const urlOf = (input: string | URL | Request) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const DEFAULT_ANSWERS: Record<string, Answer> = {
  OPTIONS: () =>
    new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": PAGE,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        "cache-control": "private, no-store",
      },
    }),
  POST: () =>
    new Response(JSON.stringify({ code: "NOT_FOUND", message: "Not found." }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": PAGE,
        vary: "Origin",
      },
    }),
};

/**
 * A made-up `dev` API: it records each request, keeps the token the POST carries, and answers as `dev` does,
 * or as `answers` says: by method, and "OPTIONS?" for the preflight with a query.
 */
function fakeApi(answers: Partial<Record<string, Answer>> = {}) {
  const sent: Sent[] = [];
  let token = "";
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : undefined;
    sent.push({
      url: urlOf(input),
      method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body,
      redirect: init?.redirect,
      signal: init?.signal instanceof AbortSignal,
    });
    if (method === "POST" && body !== undefined) token = (JSON.parse(body) as { token: string }).token;
    const answer = answers[`${method}${urlOf(input).includes("?") ? "?" : ""}`] ?? DEFAULT_ANSWERS[method];
    return answer === undefined ? Promise.reject(new Error(`no answer for ${method}`)) : Promise.resolve(answer());
  }) as typeof fetch;
  return { fetcher, sent, token: () => token };
}

type Api = ReturnType<typeof fakeApi>;

/** The buffer's reads: the first before the requests, then `later(n, api)` for the n-th read after them. */
const buffer = (api: Api, later: (n: number, api: Api) => Reply, first: Reply = printed(BEFORE)): Route => [
  LOGS,
  (_call, earlier) => (earlier === 0 ? first : later(earlier, api)),
];

/** The run's lines arrive in the second read after the requests. */
const cleanFrom =
  (from = 2) =>
  (n: number): Reply =>
    printed(n >= from ? [...BEFORE, ...RUN_LINES] : BEFORE);

async function run(api: Api, routes: (api: Api) => readonly Route[]) {
  const { spawn, calls } = fakeSpawn(routes(api));
  const said: string[] = [];
  const slept: number[] = [];
  const outcome = await spikeLinks({
    fly: flyOf(spawn, ENV),
    fetch: api.fetcher,
    say: (line) => said.push(line),
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  const message = outcome instanceof Error ? outcome.message : "";
  return { calls: calls.map(lineOf), raw: calls, said, slept, outcome, message };
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The token's forms the run must never say, nor find in the logs. */
const forms = (token: string) => [token, token.slice(0, 16), token.slice(-16), sha256(token)];

function expectNoToken(api: Api, said: readonly string[], message: string) {
  const token = api.token();
  for (const form of token === "" ? [] : forms(token)) {
    for (const line of said) expect(line).not.toContain(form);
    expect(message).not.toContain(form);
  }
}

describe("spikeLinks on clean logs", () => {
  it("sends the page's two requests and its preflight with the token in its URL, reads the buffer until their lines come, and passes", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [buffer(fake, cleanFrom(2))]);
    expect(result.outcome).toBeUndefined();
    const token = api.token();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(api.sent).toEqual([
      {
        url: PREVIEW,
        method: "OPTIONS",
        headers: {
          origin: PAGE,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
        body: undefined,
        redirect: "manual",
        signal: true,
      },
      {
        url: PREVIEW,
        method: "POST",
        headers: { origin: PAGE, "content-type": "application/json" },
        body: JSON.stringify({ token }),
        redirect: "manual",
        signal: true,
      },
      {
        url: `${PREVIEW}?token=${token}`,
        method: "OPTIONS",
        headers: {
          origin: PAGE,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
        body: undefined,
        redirect: "manual",
        signal: true,
      },
    ]);
    // The buffer before, two reads until the lines came, and one read more.
    expect(result.calls).toEqual([LOGS, LOGS, LOGS, LOGS]);
    expect(result.slept).toEqual([POLL_MS, POLL_MS, POLL_MS]);
    for (const call of result.raw) {
      expect(call.options.env).toEqual(ENV);
      expect(call.options.timeoutMs).toBe(READ_MS);
    }
    expect(result.said).toEqual([
      "spike-links: a made-up token of 43 characters, sent to https://api-dev.tadayo.app and never printed",
      "spike-links: the log buffer before the requests: 3 entries",
      "spike-links: the preflight: 204, allowed for https://tadayo.app, its POST and its content-type",
      "spike-links: the page's POST: 404 NOT_FOUND, allowed for https://tadayo.app, with Vary: Origin",
      "spike-links: the preflight with the token in its URL: 204, allowed for https://tadayo.app, its POST and its content-type",
      "spike-links: the requests' three lines came in read 2 of 12",
      "spike-links: one read more, 5 seconds later: 6 entries",
      "spike-links: lines holding the token, each counted once: 0, its first 16 characters: 0, its last 16: 0, its SHA-256: 0, in 3 reads of 6 entries",
      "spike-links: every check passed",
    ]);
  });

  it("makes a new token on each run", async () => {
    const first = fakeApi();
    const second = fakeApi();
    await run(first, (fake) => [buffer(fake, cleanFrom(1))]);
    await run(second, (fake) => [buffer(fake, cleanFrom(1))]);
    expect(first.token()).not.toEqual("");
    expect(first.token()).not.toEqual(second.token());
  });

  it("reads an empty buffer before the requests as no entries", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [buffer(fake, () => printed(RUN_LINES), { stdout: "" })]);
    expect(result.outcome).toBeUndefined();
    expect(result.said[1]).toBe("spike-links: the log buffer before the requests: 0 entries");
  });

  it("says one entry as one entry", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [buffer(fake, () => printed(RUN_LINES), printed([BEFORE[0] as Entry]))]);
    expect(result.outcome).toBeUndefined();
    expect(result.said[1]).toBe("spike-links: the log buffer before the requests: 1 entry");
    expect(result.said[5]).toBe("spike-links: the requests' three lines came in read 1 of 12");
  });

  it("finds its lines in a message that has text before the JSON, as Fly may add", async () => {
    const api = fakeApi();
    const prefixed = RUN_LINES.map((one) => ({ ...one, message: `stdout: ${one.message}` }));
    const result = await run(api, (fake) => [buffer(fake, () => printed([...BEFORE, ...prefixed]))]);
    expect(result.outcome).toBeUndefined();
  });

  it("takes the three lines from different reads", async () => {
    const api = fakeApi();
    const reads: Record<number, Entry[]> = { 1: [PREFLIGHT_LINE(20)], 2: [POST_LINE(21)], 3: [PREFLIGHT_LINE(22)] };
    const result = await run(api, (fake) => [buffer(fake, (n) => printed([...BEFORE, ...(reads[n] ?? [])]))]);
    expect(result.outcome).toBeUndefined();
    expect(result.said[5]).toBe("spike-links: the requests' three lines came in read 3 of 12");
  });

  it("ends inside 15 minutes at the longest, so the ops job's 20 leave its setup room", () => {
    // The first read, 12 reads until the lines and one more, each at its limit; 13 waits; 3 requests at theirs.
    expect((POLLS + 2) * READ_MS + (POLLS + 1) * POLL_MS + 3 * 15_000).toBeLessThan(15 * 60_000);
  });
});

describe("spikeLinks on logs that hold the token", () => {
  const plants: readonly [string, (token: string) => string, readonly number[]][] = [
    ["the whole token", (token) => token, [1, 1, 1, 0]],
    ["its first 16 characters", (token) => `${token.slice(0, 16)}…`, [0, 1, 0, 0]],
    ["its last 16 characters", (token) => `…${token.slice(-16)}`, [0, 0, 1, 0]],
    ["its SHA-256", (token) => sha256(token), [0, 0, 0, 1]],
  ];

  for (const [what, plant, counts] of plants) {
    for (const stream of ["stdout", "stderr"] as const) {
      it(`fails on ${what} in flyctl's ${stream}, and says how many lines, never the token`, async () => {
        const api = fakeApi();
        const later = (n: number, fake: Api): Reply => {
          // Planted in the read where the run's lines come, and in no other.
          if (n !== 2) return cleanFrom(2)(n);
          const planted = plant(fake.token());
          return stream === "stdout"
            ? printed([...BEFORE, ...RUN_LINES, entry(`{"level":30,"msg":"x","seen":"${planted}"}`, 30)])
            : printed([...BEFORE, ...RUN_LINES], `warning: ${planted}\n`);
        };
        const result = await run(api, (fake) => [buffer(fake, later)]);
        expect(result.outcome).toBeInstanceOf(OpsError);
        const [whole = 0, first = 0, last = 0, hash = 0] = counts;
        expect(result.message).toBe(
          `spike-links: flyctl's output holds the token: lines holding the token, each counted once: ${String(whole)}, its first 16 characters: ${String(first)}, its last 16: ${String(last)}, its SHA-256: ${String(hash)}, in 3 reads`,
        );
        expect(result.said).not.toContain("spike-links: every check passed");
        expectNoToken(api, result.said, result.message);
      });
    }
  }

  it("counts a line once however many reads print it, and two lines as two", async () => {
    for (const [planted, whole] of [
      [(token: string) => [entry(`{"msg":"x","seen":"${token}"}`, 30)], 1],
      [(token: string) => [entry(`{"msg":"x","seen":"${token}"}`, 30), entry(`{"msg":"y","seen":"${token}"}`, 31)], 2],
    ] as const) {
      const api = fakeApi();
      // In the read where the run's lines come and in the one after it: the buffer gives an entry again.
      const later = (n: number, fake: Api): Reply =>
        n < 2 ? cleanFrom(2)(n) : printed([...BEFORE, ...RUN_LINES, ...planted(fake.token())]);
      const result = await run(api, (fake) => [buffer(fake, later)]);
      expect(result.message).toMatch(
        new RegExp(
          `^spike-links: flyctl's output holds the token: lines holding the token, each counted once: ${String(whole)},`,
        ),
      );
      expect(result.message).toContain("in 3 reads");
      expectNoToken(api, result.said, result.message);
    }
  });

  it("counts the token in the read that comes after its lines", async () => {
    const api = fakeApi();
    const later = (n: number, fake: Api): Reply =>
      n < 3 ? cleanFrom(2)(n) : printed([...BEFORE, ...RUN_LINES, entry(`late ${fake.token()}`, 40, "proxy")]);
    const result = await run(api, (fake) => [buffer(fake, later)]);
    expect(result.message).toMatch(
      /^spike-links: flyctl's output holds the token: lines holding the token, each counted once: 1,/,
    );
    expectNoToken(api, result.said, result.message);
  });

  it("says the token was found, not only that its lines never came, when both are so", async () => {
    const api = fakeApi();
    const later = (n: number, fake: Api): Reply =>
      printed([
        ...BEFORE,
        ...(n === 1 ? [entry(`GET /v1/invitations/web-preview?token=${fake.token()}`, 9, "proxy")] : []),
      ]);
    const result = await run(api, (fake) => [buffer(fake, later)]);
    expect(result.message).toMatch(
      /^spike-links: flyctl's output holds the token: lines holding the token, each counted once: 1,/,
    );
    expect(result.message).toContain(`in ${String(POLLS)} reads`);
    expect(result.message).toContain("hold 0 preflight lines and 0 POST lines, where the run sent 2 and 1");
    expectNoToken(api, result.said, result.message);
  });

  it("fails on the token in the output of a read that failed, and never says that output", async () => {
    const api = fakeApi();
    const later = (_n: number, fake: Api): Reply => ({ code: 1, stdout: "", stderr: `Error: ${fake.token()}\n` });
    const result = await run(api, (fake) => [buffer(fake, later)]);
    expect(result.message).toMatch(
      /^spike-links: flyctl's output holds the token: lines holding the token, each counted once: 1,/,
    );
    expectNoToken(api, result.said, result.message);
  });
});

describe("spikeLinks when its lines never come", () => {
  it("fails after 12 reads, 5 seconds apart, and says how many of its lines came", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [buffer(fake, () => printed([...BEFORE, PREFLIGHT_LINE(20)]))]);
    expect(result.message).toBe(
      "spike-links: after 12 reads, 5 seconds apart, the log buffer's new entries hold 1 preflight line and 0 POST lines, where the run sent 2 and 1: the check can't show what the API logged, so it fails",
    );
    expect(result.calls).toHaveLength(1 + POLLS);
    expect(result.slept).toEqual(Array.from({ length: POLLS }, () => POLL_MS));
    expectNoToken(api, result.said, result.message);
  });

  it("doesn't take lines that were in the buffer before the requests for the run's own", async () => {
    const api = fakeApi();
    const before = [...BEFORE, ...RUN_LINES];
    const result = await run(api, (fake) => [buffer(fake, () => printed(before), printed(before))]);
    expect(result.message).toContain("hold 0 preflight lines and 0 POST lines");
  });

  it("doesn't take a scanner's 404 elsewhere, nor one line printed twice, for a line of its own", async () => {
    const api = fakeApi();
    // The preflight and the POST came, the second preflight didn't; a request to a path the API doesn't
    // have was logged meanwhile, and the first preflight's line is printed again by the next read.
    const reads: Record<number, Entry[]> = {
      1: [PREFLIGHT_LINE(20), STRAY_404(19)],
      2: [PREFLIGHT_LINE(20), POST_LINE(21)],
    };
    const result = await run(api, (fake) => [buffer(fake, (n) => printed([...BEFORE, ...(reads[n] ?? [])]))]);
    expect(result.message).toContain("hold 1 preflight line and 1 POST line, where the run sent 2 and 1");
    expect(result.said).not.toContain("spike-links: every check passed");
  });

  it("doesn't take a line of another status, another operation or another program for the run's own", async () => {
    const api = fakeApi();
    const others = [
      entry(requestLine("a", { preflight: "previewInvitationWeb", status: 404, ms: 0 }), 30),
      entry(requestLine("b", { op: "previewInvitationWeb", status: 200, ms: 0 }), 31),
      entry(requestLine("c", { op: "listClubs", status: 404, ms: 0 }), 32),
      entry(JSON.stringify({ level: 30, status: 404, msg: "something else" }), 33),
      entry(`{"preflight":"previewInvitationWeb","status":204,"msg":"request"`, 34),
    ];
    const result = await run(api, (fake) => [buffer(fake, () => printed([...BEFORE, ...others]))]);
    expect(result.message).toContain("hold 0 preflight lines and 0 POST lines");
  });
});

describe("spikeLinks when dev answers otherwise", () => {
  const json =
    (status: number, body: unknown, headers: Record<string, string> = {}) =>
    () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const allowed = { "access-control-allow-origin": PAGE, vary: "Origin" };
  const preflightWith = (headers: Record<string, string>) => () => new Response(null, { status: 204, headers });
  const PREFLIGHT_HEADERS = {
    "access-control-allow-origin": PAGE,
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type",
  };
  const cases: readonly [string, Partial<Record<string, Answer>>, string][] = [
    ["the preflight's status", { OPTIONS: json(404, { code: "NOT_FOUND" }) }, "the preflight answered 404, not 204"],
    [
      "the preflight's allowance",
      { OPTIONS: preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-origin": "" }) },
      "the preflight doesn't allow https://tadayo.app",
    ],
    [
      "a preflight for every origin",
      { OPTIONS: preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-origin": "*" }) },
      "the preflight doesn't allow https://tadayo.app",
    ],
    [
      "a preflight without the page's method",
      { OPTIONS: preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-methods": "GET, PUT" }) },
      "the preflight doesn't allow POST",
    ],
    [
      "a preflight without the page's header",
      { OPTIONS: preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-headers": "authorization" }) },
      "the preflight doesn't allow the header content-type",
    ],
    [
      "a preflight that allows credentials",
      { OPTIONS: preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-credentials": "true" }) },
      "the preflight allows credentials",
    ],
    [
      "the POST's status",
      { POST: json(400, { code: "INVALID_REQUEST" }, allowed) },
      "the page's POST answered 400, not 404",
    ],
    ["the POST's 200", { POST: json(200, { inviter_name: "Ben" }, allowed) }, "the page's POST answered 200, not 404"],
    [
      "the POST's code, never said",
      { POST: json(404, { code: "GONE" }, allowed) },
      "the page's POST has a code other than NOT_FOUND",
    ],
    [
      "the POST's body",
      { POST: () => new Response("not found", { status: 404, headers: allowed }) },
      "the page's POST has no code, where NOT_FOUND was expected",
    ],
    [
      "the POST's allowance",
      { POST: json(404, { code: "NOT_FOUND" }, { vary: "Origin" }) },
      "the page's POST doesn't allow https://tadayo.app",
    ],
    [
      "the POST's Vary",
      { POST: json(404, { code: "NOT_FOUND" }, { "access-control-allow-origin": PAGE }) },
      "the page's POST has no Vary: Origin",
    ],
    [
      "a POST that allows credentials",
      { POST: json(404, { code: "NOT_FOUND" }, { ...allowed, "access-control-allow-credentials": "true" }) },
      "the page's POST allows credentials",
    ],
    [
      "the status of the preflight with the token in its URL",
      { "OPTIONS?": json(404, { code: "NOT_FOUND" }) },
      "the preflight with the token in its URL answered 404, not 204",
    ],
    [
      "the allowance of the preflight with the token in its URL",
      {
        "OPTIONS?": preflightWith({
          ...PREFLIGHT_HEADERS,
          "access-control-allow-origin": "https://tadayo.app.example",
        }),
      },
      "the preflight with the token in its URL doesn't allow https://tadayo.app",
    ],
  ];

  for (const [what, answers, said] of cases) {
    it(`fails on ${what}, before it reads the buffer again`, async () => {
      const api = fakeApi(answers);
      const result = await run(api, (fake) => [buffer(fake, cleanFrom(1))]);
      expect(result.outcome).toBeInstanceOf(OpsError);
      expect(result.message).toBe(
        `spike-links: ${said}: dev isn't answering as the page expects, so the logs weren't read`,
      );
      expect(result.calls).toEqual([LOGS]);
      expect(api.sent).toHaveLength(3);
      expectNoToken(api, result.said, result.message);
    });
  }

  it("names every wrong answer, and only the status of one with the wrong status", async () => {
    const api = fakeApi({ OPTIONS: json(404, {}), "OPTIONS?": json(200, {}) });
    const result = await run(api, (fake) => [buffer(fake, cleanFrom(1))]);
    expect(result.message).toBe(
      "spike-links: the preflight answered 404, not 204; the preflight with the token in its URL answered 200, not 204: dev isn't answering as the page expects, so the logs weren't read",
    );
  });

  it("takes the headers' names as the browser does: methods exactly, headers in any case, among others", async () => {
    const api = fakeApi({
      OPTIONS: preflightWith({
        "access-control-allow-origin": PAGE,
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "X-One, Content-Type",
      }),
      "OPTIONS?": preflightWith({ ...PREFLIGHT_HEADERS, "access-control-allow-methods": "post" }),
    });
    const result = await run(api, (fake) => [buffer(fake, cleanFrom(1))]);
    expect(result.message).toBe(
      "spike-links: the preflight with the token in its URL doesn't allow POST: dev isn't answering as the page expects, so the logs weren't read",
    );
  });

  it("never says a code, even one that holds the token", async () => {
    const api = fakeApi();
    const echo = ((input: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? api.fetcher(input, init).then(() => json(404, { code: api.token() }, allowed)())
        : api.fetcher(input, init)) as typeof fetch;
    const { spawn } = fakeSpawn([buffer(api, cleanFrom(1))]);
    const said: string[] = [];
    const outcome = await spikeLinks({
      fly: flyOf(spawn, ENV),
      fetch: echo,
      say: (line) => said.push(line),
      sleep: () => Promise.resolve(),
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const message = outcome instanceof Error ? outcome.message : "";
    expect(message).toBe(
      "spike-links: the page's POST has a code other than NOT_FOUND: dev isn't answering as the page expects, so the logs weren't read",
    );
    expectNoToken(api, said, message);
  });

  it("says a request got no answer by the error's kind alone, which can't carry the URL", async () => {
    const api = fakeApi();
    const failing = ((input: string | URL | Request, init?: RequestInit) =>
      urlOf(input).includes("?")
        ? Promise.reject(
            Object.assign(new TypeError(`fetch failed: ${urlOf(input)}`), { cause: { code: "ECONNRESET" } }),
          )
        : api.fetcher(input, init)) as typeof fetch;
    const { spawn, calls } = fakeSpawn([buffer(api, cleanFrom(1))]);
    const said: string[] = [];
    const outcome = await spikeLinks({
      fly: flyOf(spawn, ENV),
      fetch: failing,
      say: (line) => said.push(line),
      sleep: () => Promise.resolve(),
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const message = outcome instanceof Error ? outcome.message : "";
    expect(message).toBe(
      "spike-links: the preflight with the token in its URL got no answer (TypeError, ECONNRESET): dev isn't answering as the page expects, so the logs weren't read",
    );
    expect(calls).toHaveLength(1);
    expectNoToken(api, said, message);
  });
});

describe("spikeLinks when flyctl fails", () => {
  it("sends nothing when the first read fails, and says flyctl's error", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [
      buffer(fake, cleanFrom(1), { code: 1, stdout: "", stderr: "Error: not authorized to access this app\n" }),
    ]);
    expect(result.message).toBe(
      "spike-links: flyctl couldn't read the log buffer: exit code 1: Error: not authorized to access this app",
    );
    expect(api.sent).toEqual([]);
  });

  it("fails when a later read fails or runs out of time", async () => {
    for (const reply of [
      { code: 2, stdout: "", stderr: "Error: unexpected EOF\n" },
      { code: null, timedOut: true, stdout: "", stderr: "" },
    ]) {
      const api = fakeApi();
      const result = await run(api, (fake) => [buffer(fake, () => reply)]);
      expect(result.outcome).toBeInstanceOf(OpsError);
      expect(result.message).toMatch(
        /^spike-links: flyctl couldn't read the log buffer: (exit code 2: Error: unexpected EOF|it ran out of time)$/,
      );
      expect(result.calls).toEqual([LOGS, LOGS]);
    }
  });

  it("fails on output that isn't the JSON flyctl prints with --json, without saying it", async () => {
    for (const stdout of [
      "2026-11-21T17:00:01Z app[4d89] iad [info] listening\n",
      "[]",
      '{"level":"info"}',
      '{"message":"a"} {"message":',
      "{} x",
    ]) {
      const api = fakeApi();
      const result = await run(api, (fake) => [buffer(fake, cleanFrom(1), { stdout })]);
      expect(result.message, stdout).toBe("spike-links: flyctl's output isn't the JSON it prints with --json");
      expect(api.sent, stdout).toEqual([]);
    }
  });

  it("never makes another flyctl call, nor names another app", async () => {
    const api = fakeApi();
    const result = await run(api, (fake) => [buffer(fake, cleanFrom(3))]);
    expect(new Set(result.calls)).toEqual(new Set([LOGS]));
  });
});

describe("the spike-links script", () => {
  function context(env: Record<string, string | undefined>, args: string[], api: Api, routes: readonly Route[]) {
    const { spawn, calls } = fakeSpawn(routes);
    const said: string[] = [];
    const ctx: OpsContext = {
      env,
      args,
      repo: "/repo",
      spawn,
      fetch: api.fetcher,
      connect: () => {
        throw new Error("spike-links connects to no database");
      },
      sleep: () => Promise.resolve(),
      say: (line) => said.push(line),
    };
    return { ctx, calls, said };
  }

  it("is listed, and runs with FLY_API_TOKEN alone", async () => {
    expect(Object.keys(SCRIPTS)).toContain("spike-links");
    const api = fakeApi();
    const { ctx, calls, said } = context(ENV, [], api, [buffer(api, cleanFrom(1))]);
    await runScript("spike-links", ctx);
    expect(calls.map(lineOf)).toEqual([LOGS, LOGS, LOGS]);
    expect(said.at(-1)).toBe("spike-links: every check passed");
  });

  it("takes no option, and needs FLY_API_TOKEN, before it reads or sends anything", async () => {
    for (const [env, args, error] of [
      [ENV, ["--to", "x"], /spike-links: Unknown option '--to'/],
      [ENV, ["loose"], /spike-links: .*positional/],
      [{ HOME: "/home/runner" }, [], /^set FLY_API_TOKEN$/],
    ] as const) {
      const api = fakeApi();
      const { ctx, calls } = context(env, [...args], api, [buffer(api, cleanFrom(1))]);
      await expect(runScript("spike-links", ctx)).rejects.toThrow(error);
      expect(calls).toEqual([]);
      expect(api.sent).toEqual([]);
    }
  });
});
