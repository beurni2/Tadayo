// The API's and the worker's entries as processes, against the test database (ADR-013; T1, T14):
// with `prod`, on a database that has no dev clock, the API listens and answers over HTTP with the
// neutral not-found, and the worker starts and exits; with `dev`, which needs the dev clock this
// database doesn't have, each stops with the time module's message.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SERVICES = join(import.meta.dirname, "..", "..", "..", "services");
const url = process.env.DATABASE_URL ?? "";
const running: ChildProcess[] = [];

afterEach(() => {
  for (const child of running.splice(0)) child.kill("SIGKILL");
});

function start(service: "api" | "worker", environment: string) {
  const child = spawn(process.execPath, [join(SERVICES, service, "src", "main.ts")], {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_URL: url,
      TADAYO_ENVIRONMENT: environment,
      PORT: "0",
      HOST: "127.0.0.1",
    },
  });
  running.push(child);
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk: Buffer) => (output.stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output.stderr += chunk.toString()));
  const exited = new Promise<number | null>((done) => child.on("close", done));
  return { child, output, exited };
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
  it("listens with prod and answers a request over HTTP with the neutral not-found (T14)", async () => {
    expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
    const api = start("api", "prod");
    const listening = await waitFor(api, /api: listening at (http:\/\/127\.0\.0\.1:\d+)/);
    expect(listening, api.output.stderr).not.toBeNull();
    const response = await fetch(`${listening?.[1] ?? ""}/v1/me`, { headers: { authorization: "Bearer x" } });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.text()).toBe('{"code":"NOT_FOUND"}');
  }, 30_000);

  it("stops with dev, which needs the dev clock this database doesn't have (ADR-013)", async () => {
    const api = start("api", "dev");
    expect(await api.exited).toBe(1);
    expect(api.output.stderr).toMatch(/app\.dev_clock/);
    expect(api.output.stdout).not.toMatch(/listening/);
  }, 30_000);
});

describe("the worker's entry against the test database", () => {
  it("starts with prod and exits, with no jobs yet", async () => {
    const worker = start("worker", "prod");
    expect(await worker.exited, worker.output.stderr).toBe(0);
    expect(worker.output.stdout).toMatch(/worker: started/);
  }, 30_000);

  it("stops with dev, which needs the dev clock this database doesn't have (ADR-013)", async () => {
    const worker = start("worker", "dev");
    expect(await worker.exited).toBe(1);
    expect(worker.output.stderr).toMatch(/app\.dev_clock/);
  }, 30_000);
});
