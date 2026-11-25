// The API's and the worker's entries as processes, against the test database (ADR-013; T1, T14, T52):
// with `prod`, on a database that has no dev clock, the API listens and answers over HTTP, a request
// with no session with the one 401 and a path nobody serves with the neutral not-found, and writes a
// request line of the request's id, operation, status and time alone; the worker starts and stays up;
// each stops cleanly, with exit code 0, on SIGTERM (a deploy's signal) and on SIGINT (the signal
// `fly machine stop` sends by default), so a stop isn't a failure that fly.toml's `on-failure` would
// restart, and no request is cut short; with `dev`, which needs the dev clock this database doesn't
// have, each stops with the time module's message. Each puts its handlers in place before it writes
// the line that says it is up, so a signal sent as soon as that line is read stops it cleanly too.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { worldSql } from "./harness.ts";
import { confirmedWeek, forgetCommittedDays, holding, nothingToPrepare, waitingOn } from "./week-world.ts";

const SERVICES = join(import.meta.dirname, "..", "..", "..", "services");
const url = process.env.DATABASE_URL ?? "";
/** A Supabase project's URL as theirs are, which no request here makes the API fetch from. */
const PROJECT = "https://abcdefghijklmnopqrst.supabase.co";
/** A stand-in for Storage's key, which the API needs to start (T56) and no request here makes it send. */
const SERVICE_KEY = "sb_secret_notarealkeyforthestartuptests";
const running: ChildProcess[] = [];
/** Makes the process signal itself as it writes its ready line (./signal-at-ready.ts). */
const AT_READY = pathToFileURL(join(import.meta.dirname, "signal-at-ready.ts")).href;

afterEach(() => {
  for (const child of running.splice(0)) child.kill("SIGKILL");
});

// A started worker makes the days of whatever committed club another file left with a week, by the real
// clock, and commits them: none may stay (week-world.ts, forgetCommittedDays). It would also prepare an upload
// another file left preparing and live by the real clock, from the stand-in project below: there may be none.
beforeAll(async () => {
  const db = worldSql();
  try {
    await nothingToPrepare(db);
  } finally {
    await db.end();
  }
});
afterAll(forgetCommittedDays);

function start(
  service: "api" | "worker",
  environment: string,
  more: Record<string, string> = {},
  signalAtReady?: "SIGTERM" | "SIGINT",
) {
  const main = join(SERVICES, service, "src", "main.ts");
  const args = signalAtReady === undefined ? [main] : ["--import", AT_READY, main];
  const child = spawn(process.execPath, args, {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_URL: url,
      // Both read Storage's settings: the API signs upload URLs, the worker reads originals and puts renditions.
      SUPABASE_URL: PROJECT,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      TADAYO_ENVIRONMENT: environment,
      PORT: "0",
      HOST: "127.0.0.1",
      ...(signalAtReady === undefined ? {} : { TADAYO_TEST_SIGNAL_AT_READY: signalAtReady }),
      ...more,
    },
  });
  running.push(child);
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk: Buffer) => (output.stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output.stderr += chunk.toString()));
  const exited = new Promise<number | null>((done) => child.on("close", done));
  return { child, output, exited };
}

/** Sends `signal` and waits for the exit, which must come within ten seconds. */
async function stopWith(started: ReturnType<typeof start>, signal: "SIGTERM" | "SIGINT"): Promise<number | null> {
  started.child.kill(signal);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((done) => {
    timer = setTimeout(() => {
      done("timeout");
    }, 10_000);
  });
  const result = await Promise.race([started.exited, timeout]);
  clearTimeout(timer);
  expect(result, `${started.output.stdout}${started.output.stderr}`).not.toBe("timeout");
  return result === "timeout" ? null : result;
}

/** Waits until `output` has a line matching `pattern`, or the process exits, or 20 seconds pass. */
async function waitFor(started: ReturnType<typeof start>, pattern: RegExp): Promise<RegExpMatchArray | null> {
  const deadline = Date.now() + 20_000;
  const state = { exited: false };
  void started.exited.then(() => (state.exited = true));
  while (Date.now() < deadline && !state.exited) {
    const match = pattern.exec(started.output.stdout);
    if (match) return match;
    await new Promise((done) => setTimeout(done, 50));
  }
  return pattern.exec(started.output.stdout);
}

describe("the API's entry against the test database", () => {
  it("listens with prod and answers over HTTP: the one 401 without a session, the neutral not-found for a path nobody serves (T14)", async () => {
    expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
    const api = start("api", "prod");
    const listening = await waitFor(api, /api: listening at (http:\/\/127\.0\.0\.1:\d+)/);
    expect(listening, api.output.stderr).not.toBeNull();
    const base = listening?.[1] ?? "";
    // A header that isn't a token is no session, and says so without asking Supabase for anything.
    for (const headers of [{ authorization: "Bearer x" }, {}]) {
      const response = await fetch(`${base}/v1/me`, { headers });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(await response.text()).toBe('{"code":"UNAUTHENTICATED"}');
    }
    const unknown = await fetch(`${base}/v1/very-secret-path?email=ana@example.invalid`, {
      headers: { authorization: "Bearer x" },
    });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("private, no-store");
    expect(unknown.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await unknown.text()).toBe('{"code":"NOT_FOUND"}');
    // The log is the listening line and one line a request, which names neither the path nor a header (T52).
    const request = await waitFor(api, /"msg":"request"[^\n]*\n[^\n]*"msg":"request"[^\n]*\n[^\n]*"msg":"request"/);
    expect(request, api.output.stdout).not.toBeNull();
    const lines = api.output.stdout.split("\n").filter((line) => line.startsWith("{"));
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => entry["msg"])).toEqual([
      expect.stringMatching(/^Server listening at http:\/\/127\.0\.0\.1:\d+$/) as string,
      "request",
      "request",
      "request",
    ]);
    expect(entries.slice(1).map((entry) => [entry["op"], entry["status"]])).toEqual([
      ["getMe", 401],
      ["getMe", 401],
      [undefined, 404],
    ]);
    expect(api.output.stdout).not.toMatch(/Bearer|very-secret|ana@|example\.invalid/);
    // Storage's key never reaches the output (T56).
    expect(api.output.stdout + api.output.stderr).not.toContain(SERVICE_KEY);
  }, 30_000);

  it("writes at the level LOG_LEVEL names: the request line, which is info's, is there by default and gone at warn and at silent (T52)", async () => {
    expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
    for (const [level, lines] of [
      [undefined, 2],
      ["warn", 0],
      ["silent", 0],
    ] as const) {
      const api = start("api", "prod", level === undefined ? {} : { LOG_LEVEL: level });
      const listening = await waitFor(api, /api: listening at (http:\/\/127\.0\.0\.1:\d+)/);
      expect(listening, api.output.stderr).not.toBeNull();
      const base = listening?.[1] ?? "";
      expect((await fetch(`${base}/v1/me`)).status, String(level)).toBe(401);
      // The line a request gets is written as the answer goes out; where there is none, its absence has to be waited for.
      if (lines > 0) await waitFor(api, /"msg":"request"/);
      else await new Promise((done) => setTimeout(done, 400));
      const written = api.output.stdout.split("\n").filter((line) => line.startsWith("{"));
      // Fastify's own "Server listening" line is info's too, so the default writes it and the request line.
      expect(written, `${String(level)}: ${api.output.stdout}`).toHaveLength(lines);
      api.child.kill("SIGKILL");
      await api.exited;
    }
  }, 60_000);

  it("stops with dev, which needs the dev clock this database doesn't have (ADR-013)", async () => {
    const api = start("api", "dev");
    expect(await api.exited).toBe(1);
    expect(api.output.stderr).toMatch(/app\.dev_clock/);
    expect(api.output.stdout).not.toMatch(/listening/);
  }, 30_000);

  it.each(["SIGTERM", "SIGINT"] as const)(
    "stops on %s with exit code 0, writes its stop lines, and no longer listens",
    async (signal) => {
      expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
      const api = start("api", "prod");
      const listening = await waitFor(api, /api: listening at (http:\/\/127\.0\.0\.1:\d+)/);
      expect(listening, api.output.stderr).not.toBeNull();
      const base = listening?.[1] ?? "";
      // A request has been answered and its connection is kept alive and idle: a stop doesn't wait for it.
      expect((await fetch(`${base}/v1/me`)).status).toBe(401);
      expect(await stopWith(api, signal)).toBe(0);
      expect(api.output.stdout).toContain(`api: stopping on ${signal}\n`);
      expect(api.output.stdout).toMatch(/api: stopped\n$/);
      expect(api.output.stderr).toBe("");
      await expect(fetch(`${base}/v1/me`)).rejects.toThrow();
    },
    30_000,
  );

  it.each(["SIGTERM", "SIGINT"] as const)(
    "stops cleanly on a %s that comes as it writes its listening line: its handlers are in place first",
    async (signal) => {
      expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
      const api = start("api", "prod", {}, signal);
      expect(await api.exited, `${api.output.stdout}${api.output.stderr}`).toBe(0);
      expect(api.output.stdout).toMatch(
        new RegExp(`api: listening at http://127\\.0\\.0\\.1:\\d+\\napi: stopping on ${signal}\\n`),
      );
      expect(api.output.stdout).toMatch(/api: stopped\n$/);
      expect(api.output.stderr).toBe("");
    },
    30_000,
  );

  it("begins one stop when two signals come in a row, and the second, which has no handler left, ends the process or lets the first finish", async () => {
    const api = start("api", "prod");
    expect(await waitFor(api, /api: listening at/)).not.toBeNull();
    api.child.kill("SIGTERM");
    api.child.kill("SIGINT");
    const code = await api.exited;
    // The second signal arrived with no handler left for it, which is the default: it may end the
    // process (no exit code) before the first stop finished, or after (exit code 0). What this proves
    // is that only one stop began; that a stop finishes is the test above's, with one signal.
    expect(code === 0 || code === null, api.output.stdout).toBe(true);
    expect(api.output.stdout.match(/api: stopping on/g)).toHaveLength(1);
  }, 30_000);
});

describe("the worker's entry against the test database", () => {
  it("starts with prod and stays up, making days, until it is told to stop", async () => {
    const worker = start("worker", "prod");
    expect(
      await waitFor(
        worker,
        /worker: started, making days every minute and preparing uploads, each photo in the worker's own user\n/,
      ),
      worker.output.stderr,
    ).not.toBeNull();
    // Nothing ends it: a worker that exited would leave its Machine stopped (a clean exit isn't restarted).
    await new Promise((done) => setTimeout(done, 1_500));
    expect(worker.child.exitCode).toBeNull();
    expect(worker.child.signalCode).toBeNull();
    expect(await stopWith(worker, "SIGTERM")).toBe(0);
  }, 30_000);

  it.each(["SIGTERM", "SIGINT"] as const)(
    "stops on %s with exit code 0, and says which",
    async (signal) => {
      const worker = start("worker", "prod");
      expect(await waitFor(worker, /worker: started/), worker.output.stderr).not.toBeNull();
      expect(await stopWith(worker, signal)).toBe(0);
      expect(worker.output.stdout).toMatch(new RegExp(`worker: stopped on ${signal}\\n$`));
      expect(worker.output.stderr).toBe("");
    },
    30_000,
  );

  it.each(["SIGTERM", "SIGINT"] as const)(
    "stops cleanly on a %s that comes as it writes its started line: its handlers are in place first",
    async (signal) => {
      const worker = start("worker", "prod", {}, signal);
      expect(await worker.exited, `${worker.output.stdout}${worker.output.stderr}`).toBe(0);
      // Its first pass still runs, and makes whatever days a club another file left is owed: that line
      // may come between the two, and nothing else may.
      expect(worker.output.stdout).toMatch(
        new RegExp(
          `^worker: started, making days every minute and preparing uploads, each photo in the worker's own user\\n(worker: made \\d+ days?\\n)?worker: stopped on ${signal}\\n$`,
        ),
      );
      expect(worker.output.stderr).toBe("");
    },
    30_000,
  );

  it("finishes its stop when a second signal comes while a pass is still running: the handlers stay, so the default action never ends it", async () => {
    // A club whose row is held keeps the worker's first pass waiting, up to its lock limit, so the
    // signals below arrive one after another while the stop is under way, not together.
    const db = worldSql();
    try {
      const club = await db.begin((tx) =>
        confirmedWeek(tx, 6, { opened: "2026-11-02T14:00:00Z", confirmed: "2026-11-04T14:00:00Z" }),
      );
      const hold = await holding(db, club.club);
      const worker = start("worker", "prod");
      try {
        expect(await waitFor(worker, /worker: started/), worker.output.stderr).not.toBeNull();
        await waitingOn(db, hold.pid);
        worker.child.kill("SIGTERM");
        await new Promise((done) => setTimeout(done, 300));
        // The first signal is handled and the pass still waits: the worker is up.
        expect(worker.child.exitCode).toBeNull();
        expect(worker.child.signalCode).toBeNull();
        worker.child.kill("SIGTERM");
        worker.child.kill("SIGINT");
        await new Promise((done) => setTimeout(done, 300));
        expect(worker.child.exitCode, "a second signal ended the worker").toBeNull();
        expect(worker.child.signalCode, "a second signal ended the worker").toBeNull();
      } finally {
        await hold.release();
      }
      expect(await worker.exited, `${worker.output.stdout}${worker.output.stderr}`).toBe(0);
      // The first signal's name, once; the held club's days were made once its row was free.
      expect(worker.output.stdout).toMatch(/worker: stopped on SIGTERM\n$/);
      expect(worker.output.stdout.match(/worker: stopped on/g)).toHaveLength(1);
      expect(worker.output.stderr).toBe("");
    } finally {
      await db.end();
    }
  }, 30_000);

  it("stops with dev, which needs the dev clock this database doesn't have (ADR-013)", async () => {
    const worker = start("worker", "dev");
    expect(await worker.exited).toBe(1);
    expect(worker.output.stderr).toMatch(/app\.dev_clock/);
  }, 30_000);
});
