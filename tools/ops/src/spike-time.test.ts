/// <reference lib="esnext.temporal" />
// `spike-time`'s run, on fakes (docs/plans/api-b0-spike-time.md, sections 5 and 6; T1, T5): a made-up
// Supabase project for the sign-in (test/fake-supabase.ts), a made-up API whose clock the made-up
// database moves, and that answers each read at its own `server_now`. The run has to pass an API that
// switches at the instant, and fail one that switches a second early or late, answers with another
// cache header or anything more or less than the club list, or never reaches the instant; whatever
// fails or hangs, an API, Auth or the database, the run's user is deleted, and a clean-up the deadline
// cuts, or a user made by a call whose answer was lost, says what may be left. The
// club the run writes and its move of the clock, on Postgres, are tests/src/db/ops-spike-time.test.ts,
// which also holds `expectedClubList` against the API's own day choice and serializer; the runner's
// and the Machine's halves, as run.ts wires them, are in run-remote.test.ts.

import { describe, expect, it } from "vitest";
import { FAKE_PUBLISHABLE, FAKE_SECRET, FAKE_URL, fakeSupabase, type Fake } from "../test/fake-supabase.ts";
import { COMMAND_SECONDS } from "./on-machine.ts";
import { OpsError } from "./ops-error.ts";
import {
  ANSWERS_AFTER,
  canonical,
  expectedClubList,
  firstDate,
  judge,
  LEAD_SECONDS,
  POLL_MS,
  SPIKE_LIMITS,
  spikeTime,
  ZONE,
  type SpikeAccount,
  type SpikeClub,
  type SpikeInput,
} from "./spike-time.ts";

const RUN = "1a2b3c4d-0000-4000-8000-000000000000";
const API_ROOT = "https://api.example.test";
const at = (text: string) => Temporal.Instant.from(text);

/** The run's club as `writeClub` would write it from Monday 16 November 2026, 06:50 in New York. */
const CLUB: SpikeClub = {
  id: "club_s5",
  name: "S5 1a2b3c4d",
  timezone: ZONE,
  membershipId: "mem_ana",
  first: {
    id: "occ_mon",
    star: { membershipId: "mem_ana", displayName: "Ana" },
    localDate: Temporal.PlainDate.from("2026-11-16"),
    revealAt: at("2026-11-16T12:00:00Z"),
    closeAt: at("2026-11-17T06:00:00Z"),
  },
  second: {
    id: "occ_tue",
    star: { membershipId: "mem_ben", displayName: "Ben" },
    localDate: Temporal.PlainDate.from("2026-11-17"),
    revealAt: at("2026-11-17T12:00:00Z"),
    closeAt: at("2026-11-18T06:00:00Z"),
  },
};

/** A day as the contract's `Occurrence`, written out here, apart from the script's own. */
function day(which: "first" | "second", phase: "open" | "collecting") {
  const d = CLUB[which];
  return {
    id: d.id,
    club_id: CLUB.id,
    star: { membership_id: d.star.membershipId, display_name: d.star.displayName },
    local_date: d.localDate.toString(),
    reveal_at: d.revealAt.toString(),
    close_at: d.closeAt.toString(),
    phase,
  };
}

const floorSecond = (instant: Temporal.Instant) =>
  Temporal.Instant.fromEpochNanoseconds(instant.epochNanoseconds - (instant.epochNanoseconds % 1_000_000_000n));

/** The made-up API's answer at `now`, by T5 written out here: `skew` moves the instants it decides by. */
function clubList(now: Temporal.Instant, skewSeconds = 0) {
  const decided = now.add({ seconds: -skewSeconds });
  const has = (from: Temporal.Instant) => Temporal.Instant.compare(from, decided) <= 0;
  const firstOpen = has(CLUB.first.revealAt) && !has(CLUB.first.closeAt);
  const secondOpen = has(CLUB.second.revealAt) && !has(CLUB.second.closeAt);
  const next = !has(CLUB.first.revealAt)
    ? day("first", "collecting")
    : !has(CLUB.second.revealAt)
      ? day("second", "collecting")
      : undefined;
  const open = firstOpen ? day("first", "open") : secondOpen ? day("second", "open") : undefined;
  return {
    server_now: floorSecond(now).toString(),
    clubs: [
      {
        id: CLUB.id,
        name: CLUB.name,
        timezone: ZONE,
        my_membership_id: "mem_ana",
        state: "active",
        member_count: 2,
        ...(open === undefined ? {} : { open_day: open }),
        ...(next === undefined ? {} : { next_day: next }),
      },
    ],
    invitations: [],
  };
}

interface Call {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
  readonly key: string | null;
  readonly body: string;
}

interface World {
  readonly input: SpikeInput;
  readonly supabase: Fake;
  readonly calls: Call[];
  readonly said: string[];
  readonly written: SpikeAccount[];
  readonly moves: Temporal.Instant[];
  /** Each wait the run asked for between two reads, in milliseconds. */
  readonly sleeps: number[];
  /** dev's clock as the made-up API reads it. */
  readonly clock: { now: Temporal.Instant };
}

/** A promise that ends only when `signal` does, as a call that never answers. */
function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted === true) reject(new Error("ended"));
    signal?.addEventListener("abort", () => {
      reject(new Error("ended"));
    });
  });
}

interface Options {
  /** How far dev's clock goes on between two reads, in microseconds; 0 is a clock that doesn't move. */
  step?: number;
  /** The API decides a day by instants this many seconds off its own clock. */
  skew?: number;
  cacheControl?: string;
  /** Answer number n (from 1) of the club list is this instead. */
  odd?: { n: number; status?: number; body?: unknown };
  /** Every read of the club list answers this status, with no body. */
  down?: number;
  /** What the answer carries beyond the club list. */
  extra?: (body: ReturnType<typeof clubList>) => unknown;
  /** A call that never answers, by `METHOD path`. */
  hangs?: string;
  writeClub?: SpikeInput["database"]["writeClub"];
  moveClock?: SpikeInput["database"]["moveClock"];
  budget?: AbortSignal;
  deadline?: AbortSignal;
  windowMs?: number;
}

function world(options: Options = {}): World {
  const supabase = fakeSupabase();
  const calls: Call[] = [];
  const said: string[] = [];
  const written: SpikeAccount[] = [];
  const moves: Temporal.Instant[] = [];
  const sleeps: number[] = [];
  const clock = { now: at("2026-11-16T11:50:00.000001Z") };
  let offset = 0n;
  let reads = 0;
  let version = 1;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "cache-control": "private, no-store", ...headers },
    });
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
    if (options.hangs === `${request.method} ${url.pathname}`) return hang(init?.signal);
    if (url.origin === FAKE_URL) return supabase.fetch(request.url, body === "" ? init : { ...init, body });
    if (url.origin !== API_ROOT) throw new Error("no network here");
    calls.push({
      method: request.method,
      path: url.pathname,
      authorization: request.headers.get("authorization"),
      key: request.headers.get("idempotency-key"),
      body,
    });
    if (!/^Bearer user-token-/.test(request.headers.get("authorization") ?? "")) return json(401, {});
    if (request.method === "GET" && url.pathname === "/v1/me") {
      return json(200, { id: "acct_ana", age_confirmed: version > 1, version });
    }
    if (request.method === "PATCH" && url.pathname === "/v1/me") {
      version += 1;
      return json(200, { id: "acct_ana", display_name: "Ana", age_confirmed: true, version });
    }
    if (request.method === "GET" && url.pathname === "/v1/clubs") {
      reads += 1;
      clock.now = clock.now.add({ microseconds: options.step ?? 250_013 });
      if (options.down !== undefined) return new Response(null, { status: options.down });
      if (options.odd?.n === reads) return json(options.odd.status ?? 200, options.odd.body ?? {});
      const list = clubList(clock.now, options.skew);
      return json(200, options.extra ? options.extra(list) : list, {
        "cache-control": options.cacheControl ?? "private, no-store",
      });
    }
    return json(404, {});
  };
  const input: SpikeInput = {
    fetch: fetcher,
    url: FAKE_URL,
    publishableKey: FAKE_PUBLISHABLE,
    serviceKey: FAKE_SECRET,
    api: API_ROOT,
    run: RUN,
    // A turn of the event loop, so that the limits' timers can fire while a window reads.
    sleep: (ms) => {
      sleeps.push(ms);
      return new Promise((resolve) => {
        setImmediate(resolve);
      });
    },
    say: (line) => said.push(line),
    budget: options.budget ?? new AbortController().signal,
    deadline: options.deadline ?? new AbortController().signal,
    limits: { windowMs: options.windowMs ?? 10_000, callMs: 2_000 },
    database: {
      writeClub:
        options.writeClub ??
        ((account) => {
          written.push(account);
          return Promise.resolve(CLUB);
        }),
      moveClock:
        options.moveClock ??
        ((to) => {
          moves.push(to);
          const before = offset;
          offset += (to.epochNanoseconds - clock.now.epochNanoseconds) / 1000n;
          clock.now = to;
          return Promise.resolve({ before, after: offset });
        }),
    },
  };
  return { input, supabase, calls, said, written, moves, sleeps, clock };
}

const names = (checks: readonly { name: string }[]) => checks.map((check) => check.name);
const failed = (checks: readonly { name: string; ok: boolean; note?: string }[]) =>
  checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.note ?? ""}`);

const ALL = [
  "sign-in: the service key makes the run's user",
  "sign-in: the user signs in without an email",
  "api: GET /v1/me makes the run's account",
  "api: PATCH /v1/me names it Ana and confirms its age",
  "database: the club is written",
  "reveal: dev's clock moves to 2026-11-16T11:59:40Z",
  "reveal: every answer is the club's days as T5 has them at its server_now",
  "reveal: answers came from both sides of 2026-11-16T12:00:00Z",
  "close: dev's clock moves to 2026-11-17T05:59:40Z",
  "close: every answer is the club's days as T5 has them at its server_now",
  "close: answers came from both sides of 2026-11-17T06:00:00Z",
  "cleanup: delete the run's user",
];

describe("spike-time against an API that switches at the instant", () => {
  it("signs in, makes the account the app's way, writes the club, watches both instants from 20 seconds before, and deletes the user", async () => {
    const w = world();
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual([]);
    expect(names(checks)).toEqual(ALL);
    // The run's user is gone, and the account it wrote the club for is the one the API made for it.
    expect(w.supabase.users.size).toBe(0);
    const subject = w.supabase.calls.find((call) => call.path === "/auth/v1/admin/users");
    expect(subject?.status).toBe(200);
    expect(w.written).toEqual([
      { id: "acct_ana", subject: expect.stringMatching(/^00000000-0000-4000-8000-/) as unknown },
    ]);
    expect(w.moves.map(String)).toEqual(["2026-11-16T11:59:40Z", "2026-11-17T05:59:40Z"]);
    // The profile as the app finishes it: the version it read, a fresh idempotency key, the name and the age.
    const patch = w.calls.find((call) => call.method === "PATCH");
    expect(patch?.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.parse(patch?.body ?? "{}")).toEqual({ expected_version: 1, display_name: "Ana", age_confirmed: true });
    expect(w.said).toEqual([
      "spike-time: club S5 1a2b3c4d in America/New_York: Ana's day 2026-11-16 opens 2026-11-16T12:00:00Z and closes 2026-11-17T06:00:00Z; Ben's day 2026-11-17 opens 2026-11-17T12:00:00Z",
      "spike-time: reveal: dev's clock moved to 2026-11-16T11:59:40Z, 0 s ahead before, 579 s after",
      "spike-time: reveal at 2026-11-16T12:00:00Z: 79 answers before it and 5 at or after it; the last before at 2026-11-16T11:59:59Z: open none, next Ana's 2026-11-16 (collecting); the first after at 2026-11-16T12:00:00Z, 0 s after it: open Ana's 2026-11-16 (open), next Ben's 2026-11-17 (collecting)",
      expect.stringMatching(
        /^spike-time: close: dev's clock moved to 2026-11-17T05:59:40Z, 579 s ahead before, 65358 s after$/,
      ),
      "spike-time: close at 2026-11-17T06:00:00Z: 79 answers before it and 5 at or after it; the last before at 2026-11-17T05:59:59Z: open Ana's 2026-11-16 (open), next Ben's 2026-11-17 (collecting); the first after at 2026-11-17T06:00:00Z, 0 s after it: open none, next Ben's 2026-11-17 (collecting)",
    ]);
    // Every read of the club list is the signed-in user's, and nothing it prints is a key, a token or the address.
    expect(w.calls.every((call) => /^Bearer user-token-/.test(call.authorization ?? ""))).toBe(true);
    const printed = JSON.stringify([w.said, checks]);
    for (const secret of [FAKE_SECRET, FAKE_PUBLISHABLE, "user-token-", "hashed", "@probe.invalid"]) {
      expect(printed).not.toContain(secret);
    }
  });

  it("reads four times a second, and watches each instant until five answers are at or after it", async () => {
    expect(POLL_MS).toBe(250);
    expect(ANSWERS_AFTER).toBe(5);
    expect(LEAD_SECONDS).toBe(20);
    const w = world();
    expect(failed(await spikeTime(w.input))).toEqual([]);
    // A wait of POLL_MS after each read, but the one that brings each window's fifth answer after its instant.
    const reads = w.calls.filter((call) => call.path === "/v1/clubs").length;
    expect(reads).toBe(2 * (79 + ANSWERS_AFTER));
    expect(w.sleeps).toEqual(Array.from({ length: reads - 2 }, () => POLL_MS));
  });
});

describe("spike-time against an API that doesn't", () => {
  it("fails a switch a second early or a second late, at each instant, naming the first answer that was wrong", async () => {
    for (const [skew, first] of [
      [
        -1,
        "at server_now 2026-11-16T11:59:59Z it showed open Ana's 2026-11-16 (open), next Ben's 2026-11-17 (collecting), where T5 has open none, next Ana's 2026-11-16 (collecting); it differs at clubs[0].next_day.close_at, clubs[0].next_day.id",
      ],
      [
        1,
        "at server_now 2026-11-16T12:00:00Z it showed open none, next Ana's 2026-11-16 (collecting), where T5 has open Ana's 2026-11-16 (open), next Ben's 2026-11-17 (collecting)",
      ],
    ] as const) {
      const w = world({ skew });
      const checks = await spikeTime(w.input);
      const wrong = failed(checks);
      expect(wrong, String(skew)).toHaveLength(2);
      expect(wrong[0], String(skew)).toMatch(
        /^reveal: every answer is the club's days as T5 has them at its server_now: \d+ wrong; the first: /,
      );
      expect(wrong[0], String(skew)).toContain(first);
      expect(wrong[1], String(skew)).toMatch(
        /^close: every answer is the club's days as T5 has them at its server_now: \d+ wrong/,
      );
      expect(w.supabase.users.size).toBe(0);
    }
  });

  it("fails an answer with another cache header, another status, no server_now, or anything more than the club list", async () => {
    const cases: [Options, string][] = [
      [{ cacheControl: "no-store, marker-7f3a" }, "answered with a Cache-Control other than private, no-store"],
      [{ odd: { n: 3, status: 500 } }, "answered HTTP 500"],
      [{ odd: { n: 3, body: { clubs: [], invitations: [] } } }, "answered with no server_now in whole seconds"],
      [
        { odd: { n: 3, body: { server_now: "2026-11-16T11:59:40.5Z", clubs: [], invitations: [] } } },
        "answered with no server_now in whole seconds",
      ],
      [
        { odd: { n: 3, body: { server_now: "2026-11-31T11:59:40Z", clubs: [], invitations: [] } } },
        "answered with no server_now in whole seconds",
      ],
      [
        {
          extra: (body) => ({
            ...body,
            clubs: body.clubs.map((club) => ({ ...club, next_day: { ...club.next_day, count: 4 } })),
          }),
        },
        "it differs at clubs[0].next_day.count",
      ],
      [{ extra: (body) => ({ ...body, invitations: undefined }) }, "it differs at invitations"],
    ];
    for (const [options, note] of cases) {
      const checks = await spikeTime(world(options).input);
      const wrong = failed(checks);
      expect(wrong[0], note).toMatch(
        /^reveal: every answer is the club's days as T5 has them at its server_now: \d+ wrong; the first: /,
      );
      expect(wrong[0], note).toContain(note);
      expect(checks.at(-1)).toEqual({ name: "cleanup: delete the run's user", ok: true });
    }
    // The header's own value is never printed, and a missing header is said as missing.
    const odd = world({ cacheControl: "no-store, marker-7f3a" });
    const oddChecks = await spikeTime(odd.input);
    expect(JSON.stringify([odd.said, oddChecks])).not.toContain("marker-7f3a");
    const answer = { status: 200, cacheControl: null, json: clubList(at("2026-11-16T11:59:41Z")) };
    expect(judge(answer, CLUB).problem).toBe("answered with no Cache-Control");
  });

  it("fails when its answers never reach the instant, when the window runs out, and still deletes the user", async () => {
    const w = world({ step: 0, windowMs: 50 });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual([
      expect.stringMatching(
        /^reveal: answers came from both sides of 2026-11-16T12:00:00Z: \d+ before and 0 after, when its minute ran out$/,
      ),
      expect.stringMatching(/^close: answers came from both sides of 2026-11-17T06:00:00Z: \d+ before and 0 after/),
    ]);
    expect(w.supabase.users.size).toBe(0);
  });

  it("fails when no answer came before the instant, as when dev's clock lands past it", async () => {
    // A clock that goes past the instant, its lead and ten seconds more: every answer is right, and
    // all of them come after it, so the window saw no switch.
    let w: World | undefined = undefined;
    w = world({
      moveClock: (to) => {
        if (w !== undefined) w.clock.now = to.add({ seconds: LEAD_SECONDS + 10 });
        return Promise.resolve({ before: 0n, after: 0n });
      },
    });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual([
      "reveal: answers came from both sides of 2026-11-16T12:00:00Z: 0 before and 5 after",
      "close: answers came from both sides of 2026-11-17T06:00:00Z: 0 before and 5 after",
    ]);
    expect(w.supabase.users.size).toBe(0);
  });

  it("makes no second move of dev's clock after a reveal's window with no answer, and still deletes the user", async () => {
    const w = world({ down: 503, windowMs: 50 });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual([
      expect.stringMatching(
        /^reveal: every answer is the club's days as T5 has them at its server_now: \d+ wrong; the first: answered HTTP 503$/,
      ),
      "reveal: answers came from both sides of 2026-11-16T12:00:00Z: 0 before and 0 after, when its minute ran out",
      "close: dev's clock moves again only after a reveal's window that had answers: the reveal's window had no answer with a server_now, so the close isn't watched",
    ]);
    expect(w.moves.map(String)).toEqual(["2026-11-16T11:59:40Z"]);
    expect(checks.at(-1)).toEqual({ name: "cleanup: delete the run's user", ok: true });
    expect(w.supabase.users.size).toBe(0);
  });
});

describe("spike-time when something fails or hangs", () => {
  it("stops at an API that doesn't answer, and deletes the user", async () => {
    const w = world({ hangs: "GET /v1/me" });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual(["api: GET /v1/me makes the run's account: no answer"]);
    expect(names(checks)).toEqual([...ALL.slice(0, 3), "cleanup: delete the run's user"]);
    expect(w.supabase.users.size).toBe(0);
    expect(w.written).toEqual([]);
  });

  it("stops when the budget is spent during a call to Auth that hangs, and still deletes the user before the deadline", async () => {
    const budget = new AbortController();
    const w = world({ hangs: "POST /auth/v1/admin/generate_link", budget: budget.signal });
    const run = spikeTime(w.input);
    setTimeout(() => {
      budget.abort();
    }, 20);
    const checks = await run;
    expect(failed(checks)).toEqual(["sign-in: the user signs in without an email: the run's time ran out"]);
    expect(checks.at(-1)).toEqual({ name: "cleanup: delete the run's user", ok: true });
    expect(w.supabase.users.size).toBe(0);
  });

  it("starts no new work once the budget is spent, and still deletes the user", async () => {
    const budget = new AbortController();
    const w = world({
      budget: budget.signal,
      writeClub: () => {
        budget.abort();
        return Promise.resolve(CLUB);
      },
    });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual(["reveal: dev's clock moves to 2026-11-16T11:59:40Z: the run's time ran out"]);
    expect(w.moves).toEqual([]);
    expect(checks.at(-1)).toEqual({ name: "cleanup: delete the run's user", ok: true });
    expect(w.supabase.users.size).toBe(0);
  });

  it("fails, naming the user it leaves, when the deadline cuts the clean-up", async () => {
    const deadline = new AbortController();
    const w = world({
      deadline: deadline.signal,
      writeClub: () => {
        deadline.abort();
        return Promise.reject(new Error("statement timeout"));
      },
    });
    const checks = await spikeTime(w.input);
    expect(failed(checks)).toEqual([
      "database: the club is written: statement timeout",
      `cleanup: delete the run's user: the run's time ran out; spike-${RUN}@probe.invalid is left`,
    ]);
    expect(w.supabase.users.size).toBe(1);
  });

  it("fails, naming the user it leaves, when Auth won't delete it", async () => {
    const w = world({
      hangs: "DELETE /auth/v1/admin/users/00000000-0000-4000-8000-00000001",
      deadline: AbortSignal.timeout(100),
    });
    const checks = await spikeTime({ ...w.input, budget: AbortSignal.timeout(100_000) });
    expect(checks.at(-1)).toEqual({
      name: "cleanup: delete the run's user",
      ok: false,
      note: `the run's time ran out; spike-${RUN}@probe.invalid is left`,
    });
  });

  it("stops at a club the database refuses, or a move of the clock it refuses, saying why, and deletes the user", async () => {
    const refusedClub = world({
      writeClub: () =>
        Promise.reject(new Error("app.occurrences: 2026-11-16 isn't mem_ana's day in its schedule (T6)")),
    });
    const club = await spikeTime(refusedClub.input);
    expect(failed(club)).toEqual([
      "database: the club is written: app.occurrences: 2026-11-16 isn't mem_ana's day in its schedule (T6)",
    ]);
    expect(names(club)).toEqual([...ALL.slice(0, 5), "cleanup: delete the run's user"]);
    expect(refusedClub.moves).toEqual([]);
    expect(refusedClub.supabase.users.size).toBe(0);

    const refusedMove = world({
      moveClock: () =>
        Promise.reject(new OpsError("dev-clock: the clock only moves forward (T3), so nothing is changed")),
    });
    const move = await spikeTime(refusedMove.input);
    expect(failed(move)).toEqual([
      "reveal: dev's clock moves to 2026-11-16T11:59:40Z: dev-clock: the clock only moves forward (T3), so nothing is changed",
    ]);
    expect(names(move)).toEqual([...ALL.slice(0, 6), "cleanup: delete the run's user"]);
    expect(refusedMove.calls.filter((call) => call.path === "/v1/clubs")).toEqual([]);
    expect(refusedMove.supabase.users.size).toBe(0);
  });

  it("leaves a database call that never settles at the run's limit, says it may still commit, and deletes the user", async () => {
    const never = () => new Promise<never>(() => undefined);
    const club = world({ writeClub: never, budget: AbortSignal.timeout(50), deadline: AbortSignal.timeout(5_000) });
    const clubChecks = await spikeTime(club.input);
    expect(failed(clubChecks)).toEqual([
      "database: the club is written: the run's time ran out while it was under way, so it may still commit",
    ]);
    expect(clubChecks.at(-1)).toEqual({ name: "cleanup: delete the run's user", ok: true });
    expect(club.supabase.users.size).toBe(0);

    const move = world({ moveClock: never, budget: AbortSignal.timeout(50), deadline: AbortSignal.timeout(5_000) });
    const moveChecks = await spikeTime(move.input);
    expect(failed(moveChecks)).toEqual([
      "reveal: dev's clock moves to 2026-11-16T11:59:40Z: the run's time ran out while it was under way, so it may still commit",
    ]);
    expect(move.calls.filter((call) => call.path === "/v1/clubs")).toEqual([]);
    expect(move.supabase.users.size).toBe(0);
  });

  it("names the address it may leave when the call that makes the user has no clear answer, but not after a refusal", async () => {
    const MAY_BE_LEFT = `cleanup: the run's user may be left: the call that makes it had no clear answer, so spike-${RUN}@probe.invalid may have been made: delete it by that address`;
    const makes = (request: Request) =>
      request.method === "POST" && new URL(request.url).pathname === "/auth/v1/admin/users";
    // Auth makes the user, and then the answer is lost, a gateway answers 502 in its place, or a 200
    // comes back without the user's id.
    for (const [after, note] of [
      [() => Promise.reject(new Error("socket hang up")), "no answer"],
      [() => Promise.resolve(new Response("{}", { status: 502 })), "answered HTTP 502"],
      [() => Promise.resolve(new Response("{}", { status: 200 })), "answered HTTP 200"],
    ] as const) {
      const w = world();
      const lossy: typeof fetch = async (input, init) => {
        if (!makes(new Request(input, init))) return w.input.fetch(input, init);
        await w.input.fetch(input, init);
        return after();
      };
      const checks = await spikeTime({ ...w.input, fetch: lossy });
      expect(failed(checks), note).toEqual([`sign-in: the service key makes the run's user: ${note}`, MAY_BE_LEFT]);
      expect(w.supabase.users.size, note).toBe(1);
    }
    // A refusal makes nothing, so nothing is said to be left.
    const refused = world();
    const refusing: typeof fetch = (input, init) =>
      makes(new Request(input, init))
        ? Promise.resolve(new Response(JSON.stringify({ code: "email_exists" }), { status: 422 }))
        : refused.input.fetch(input, init);
    const checks = await spikeTime({ ...refused.input, fetch: refusing });
    expect(failed(checks)).toEqual(["sign-in: the service key makes the run's user: answered HTTP 422, email_exists"]);
    expect(refused.supabase.users.size).toBe(0);
  });

  it("refuses a project URL that isn't a Supabase project's before it calls anyone", async () => {
    const w = world();
    await expect(spikeTime({ ...w.input, url: "https://example.com" })).rejects.toThrow(OpsError);
    expect(w.supabase.calls).toEqual([]);
    expect(w.calls).toEqual([]);
  });
});

describe("what the run expects of each answer", () => {
  it("is T5 at the answer's server_now: a day open from its reveal, not a second before, until its close, not at it", () => {
    const cases: [string, string, string][] = [
      ["2026-11-16T11:59:59Z", "-", "occ_mon"],
      ["2026-11-16T12:00:00Z", "occ_mon", "occ_tue"],
      ["2026-11-17T05:59:59Z", "occ_mon", "occ_tue"],
      ["2026-11-17T06:00:00Z", "-", "occ_tue"],
      ["2026-11-17T12:00:00Z", "occ_tue", "-"],
      ["2026-11-18T06:00:00Z", "-", "-"],
    ];
    for (const [now, open, next] of cases) {
      const list = expectedClubList(CLUB, at(now)) as {
        clubs: { open_day?: { id: string }; next_day?: { id: string } }[];
      };
      expect(`${list.clubs[0]?.open_day?.id ?? "-"} ${list.clubs[0]?.next_day?.id ?? "-"}`, now).toBe(
        `${open} ${next}`,
      );
      expect(canonical(list), now).toBe(canonical(clubList(at(now))));
    }
  });

  it("judges an answer whole: one a second early, a second late, or with a key more or less is wrong", () => {
    const answer = (body: unknown) => ({ status: 200, cacheControl: "private, no-store", json: body });
    const reveal = at("2026-11-16T12:00:00Z");
    expect(judge(answer(clubList(reveal)), CLUB)).toEqual({ serverNow: reveal });
    expect(judge(answer(clubList(reveal, 1)), CLUB).problem).toMatch(
      /^at server_now 2026-11-16T12:00:00Z it showed open none/,
    );
    const early = at("2026-11-16T11:59:59.999999Z");
    expect(judge(answer(clubList(early, -1)), CLUB).problem).toMatch(
      /^at server_now 2026-11-16T11:59:59Z it showed open Ana's/,
    );
    const more = { ...clubList(reveal), extra: true };
    expect(judge(answer(more), CLUB).problem).toMatch(/it differs at extra$/);
    const less: Record<string, unknown> = clubList(reveal);
    delete less["invitations"];
    expect(judge(answer(less), CLUB).problem).toMatch(/it differs at invitations$/);
    // The order of an object's keys is no difference; the order of a list is.
    expect(canonical({ b: 1, a: [1, 2] })).toBe(canonical({ a: [1, 2], b: 1 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });

  it("says which of the run's own days an answer showed, named from what the run wrote, never a name, date or phase of the answer's", () => {
    const answer = (body: unknown) => ({ status: 200, cacheControl: "private, no-store", json: body });
    const reveal = at("2026-11-16T12:00:00Z");
    const list = clubList(reveal);
    const summary = list.clubs[0];
    if (summary === undefined) throw new Error("no club");
    const foreign = { display_name: "Someone Else", local_date: "1999-01-01", phase: "weird" };
    const cases: [unknown, string][] = [
      // The run's day by its id, with another star's name, another date and a phase the contract hasn't.
      [
        {
          ...list,
          clubs: [
            {
              ...summary,
              open_day: {
                ...day("first", "open"),
                star: { membership_id: "mem_ana", display_name: foreign.display_name },
                local_date: foreign.local_date,
                phase: foreign.phase,
              },
            },
          ],
        },
        "it showed open Ana's 2026-11-16 (another phase), next Ben's 2026-11-17 (collecting)",
      ],
      [
        { ...list, clubs: [{ ...summary, open_day: { ...day("first", "open"), id: "occ_someone", ...foreign } }] },
        "it showed open a day not the run's, next Ben's 2026-11-17 (collecting)",
      ],
      [
        { ...list, clubs: [{ ...summary, id: "club_someone", name: foreign.display_name }] },
        "it showed not the run's club",
      ],
      [{ ...list, clubs: [summary, { ...summary, id: "club_someone" }] }, "it showed no one club"],
    ];
    for (const [body, words] of cases) {
      const problem = judge(answer(body), CLUB).problem ?? "";
      expect(problem, words).toContain(words);
      for (const value of [...Object.values(foreign), "occ_someone", "club_someone"]) {
        expect(problem, words).not.toContain(value);
      }
    }
  });

  it("never prints a value of the answer's in where it differs, only the keys' path", () => {
    const answer = { ...clubList(at("2026-11-16T12:00:00Z")), "sb_secret_x leaked": "sb_secret_y" };
    const problem = judge({ status: 200, cacheControl: "private, no-store", json: answer }, CLUB).problem ?? "";
    expect(problem).not.toContain("sb_secret_y");
    expect(problem).toContain("it differs at sb_secret_x?leaked");
  });
});

describe("the first day's date", () => {
  it("is the earliest Monday to Friday in New York whose 07:00 is at least three minutes ahead, so the next date is never Sunday", () => {
    const cases: [string, string][] = [
      ["2026-11-16T11:50:00Z", "2026-11-16"], // Monday, 06:50
      ["2026-11-16T11:57:00Z", "2026-11-16"], // Monday, three minutes before 07:00 exactly
      ["2026-11-16T11:57:00.000001Z", "2026-11-17"], // a microsecond later: Tuesday
      ["2026-11-20T13:00:00Z", "2026-11-23"], // Friday, 08:00: not Saturday, but Monday
      ["2026-11-21T11:00:00Z", "2026-11-23"], // Saturday
      ["2026-11-22T11:00:00Z", "2026-11-23"], // Sunday
      ["2026-11-20T04:00:00Z", "2026-11-20"], // Thursday 23:00: Friday, whose next date is Saturday
      ["2026-03-07T12:00:00Z", "2026-03-09"], // Saturday before the spring change: Monday, in daylight time
    ];
    for (const [now, date] of cases) {
      const first = firstDate(at(now));
      expect(first.toString(), now).toBe(date);
      expect(first.dayOfWeek, now).toBeLessThanOrEqual(5);
      expect(first.add({ days: 1 }).dayOfWeek, now).not.toBe(7);
    }
  });
});

describe("the run's limits", () => {
  it("end the clean-up a minute inside the runner's limit, after a budget that holds both windows", () => {
    expect(SPIKE_LIMITS.deadlineMs).toBeLessThanOrEqual(COMMAND_SECONDS * 1000 - 60_000);
    expect(SPIKE_LIMITS.budgetMs).toBeLessThan(SPIKE_LIMITS.deadlineMs);
    expect(2 * SPIKE_LIMITS.windowMs).toBeLessThan(SPIKE_LIMITS.budgetMs);
    // A window is long enough for the lead and the answers after the instant, read four times a second.
    expect(SPIKE_LIMITS.windowMs).toBeGreaterThan((LEAD_SECONDS + ANSWERS_AFTER) * 1000 + 10_000);
    expect(SPIKE_LIMITS.callMs).toBeLessThan(SPIKE_LIMITS.windowMs);
  });
});
