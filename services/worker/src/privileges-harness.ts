// The root harness of ./privileges.test.ts (docs/plans/api-b2-worker-hardening.md section 3). Run as root, it imports
// the worker's modules, takes the worker's mode itself as fly.toml's command leaves it (real uid 0; groups, effective
// group and effective uid an unused id, 64998), and prepares photos with fake children as an unused photo user
// (64999). It writes one line of JSON a case to standard output, and asserts nothing: the test says what each must be.
// With `sweep-timeout`, it gives the sweep a millisecond, and the worker's stop ends it (exit status 1).
//
// The fake children are written to a fresh folder under the system's temporary folder, which the photo user can
// read: on CI's runner the checkout is under a home folder only its user may enter. Each says it is ready, reads the
// photo, then does as its name says; what it saw it writes to `out/`, a folder of the photo user's, as JSON.

import {
  chmodSync,
  chownSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareIsolated } from "./image-process.ts";
import { asRoot, sweep, SweepFailed } from "./privileges.ts";

const MiB = 1024 * 1024;
const WORKER = 64998;
const PHOTO = { uid: 64999, gid: 64999 };
const BYTES = Buffer.from("not a photo");

const PRELUDE = String.raw`
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
const out = new URL("./out/", import.meta.url).pathname;
const worker = new Socket({ fd: 3, readable: true, writable: true });
worker.on("error", () => {});
const frame = (header, bodies = []) => {
  const json = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([length, json, ...bodies]);
};
const send = (header, bodies) => new Promise((resolve) => worker.write(frame(header, bodies), () => resolve()));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const renditions = [{ kind: "full", width: 2, height: 1, length: 4 }, { kind: "display", width: 2, height: 1, length: 4 }];
const answer = () =>
  send({ kind: "prepared", prepared: { ok: true, renditions }, peakBytes: 1, oomScoreAdj: 0, environment: 0 }, [jpeg, jpeg]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mine = () => readdirSync("/proc").filter((entry) => /^\d+$/.test(entry)).filter((pid) => {
  try {
    const status = readFileSync("/proc/" + pid + "/status", "latin1");
    return /^Uid:\s+(\d+)/m.exec(status)?.[1] === String(process.getuid()) && !/^State:\s+Z/m.test(status);
  } catch {
    return false;
  }
}).length;
await send({ kind: "ready" });
for await (const chunk of process.stdin) void chunk;
`;

/**
 * The watcher a `watching` child leaves behind, as the photo user: it says it is ready, then looks through `/proc`
 * without pause for a process of its user running the sweep's program, and writes that process's user and group and
 * what opening its `/proc/<pid>/mem` gave, until the sweep ends it.
 */
const WATCHER = String.raw`
const fs = require("node:fs");
const [file, ready] = process.argv.slice(2);
const self = String(process.pid);
const uid = String(process.getuid());
fs.writeFileSync(ready, "");
const look = () => {
  for (const pid of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(pid) || pid === self) continue;
    try {
      if (!fs.readFileSync("/proc/" + pid + "/cmdline", "latin1").includes("process.kill(-1")) continue;
      const status = fs.readFileSync("/proc/" + pid + "/status", "latin1");
      const field = (name) => new RegExp("^" + name + ":\\s+(\\d+)", "m").exec(status)?.[1];
      if (field("Uid") !== uid) continue;
      let mem = "opened";
      try {
        fs.closeSync(fs.openSync("/proc/" + pid + "/mem", "r"));
      } catch (error) {
        mem = error.code ?? "error";
      }
      fs.writeFileSync(file, JSON.stringify({ uid: Number(field("Uid")), gid: Number(field("Gid")), mem }));
      return true;
    } catch {
      // That process has gone.
    }
  }
  return false;
};
const tick = () => {
  if (!look()) setImmediate(tick);
};
tick();
`;

const CHILDREN: Record<string, string> = {
  // What it can reach of the worker, its parent: its environment, its memory, its standard output, a signal.
  probe: String.raw`
const parent = process.ppid;
const attempt = (fn) => {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error.code ?? "error";
  }
};
const status = readFileSync("/proc/self/status", "latin1");
writeFileSync(out + "probe.json", JSON.stringify({
  uid: process.getuid(),
  euid: process.geteuid(),
  gid: process.getgid(),
  egid: process.getegid(),
  groups: process.getgroups(),
  capEff: /^CapEff:\s+(\S+)/m.exec(status)?.[1],
  capPrm: /^CapPrm:\s+(\S+)/m.exec(status)?.[1],
  environ: attempt(() => readFileSync("/proc/" + parent + "/environ")),
  mem: attempt(() => closeSync(openSync("/proc/" + parent + "/mem", "r"))),
  stdout: attempt(() => closeSync(openSync("/proc/" + parent + "/fd/1", "w"))),
  signal: attempt(() => process.kill(parent, 0)),
}));
await answer();
`,
  // A process in a session of its own, outside the group the worker kills, running before the answer.
  escapes: String.raw`
const file = out + "escaped.pid";
spawn(
  process.execPath,
  ["-e", "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);", file],
  { detached: true, stdio: "ignore" },
).unref();
for (let i = 0; i < 1000 && !(existsSync(file) && readFileSync(file, "latin1") !== ""); i += 1) await sleep(5);
await answer();
`,
  // A process in a session of its own that watches for the sweep, once the answer is in: what it sees of the sweep's
  // ids, and whether it could open the sweep's memory, which is what attaching to it takes (WATCHER).
  watching: String.raw`
const ready = out + "watcher.ready";
spawn(process.execPath, [new URL("./watcher.cjs", import.meta.url).pathname, out + "sweep.json", ready], {
  detached: true,
  stdio: "ignore",
}).unref();
for (let i = 0; i < 1000 && !existsSync(ready); i += 1) await sleep(5);
await answer();
`,
  // A shell in a session of its own forking as fast as it can, up to 256 processes of its user, still forking when
  // the answer is sent.
  forks: String.raw`
// As root (a worker that failed to start it as the photo user, which the probe shows), no process limit holds: no loop.
if (process.getuid() === 0) {
  await answer();
  process.exit(0);
}
spawn("/usr/bin/prlimit", ["--nproc=256", "/bin/sh", "-c", "while :; do sleep 60 & done"], {
  detached: true,
  stdio: "ignore",
}).unref();
let most = 0;
for (let i = 0; i < 2000 && most < 64; i += 1) {
  most = Math.max(most, mine());
  await sleep(5);
}
writeFileSync(out + "forks.json", JSON.stringify({ most }));
await answer();
`,
  // Past its memory, never answering: the time before each step up is noted, as the worker may kill it at any point.
  memory: String.raw`
const hold = [];
for (let i = 0; i < 24; i += 1) {
  appendFileSync(out + "memory.log", String(Date.now()) + "\n");
  hold.push(Buffer.alloc(8 * 1024 * 1024, 1));
  await sleep(5);
}
setInterval(() => {}, 1000);
`,
  // Past its deadline, never answering.
  deadline: String.raw`
setInterval(() => {}, 1000);
`,
  quick: String.raw`
await answer();
`,
};

const say = (fact: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(fact)}\n`);

/** The live processes (not zombies) whose real user is `uid`. */
function liveOf(uid: number): number[] {
  return readdirSync("/proc")
    .filter((entry) => /^\d+$/.test(entry))
    .filter((pid) => {
      try {
        const status = readFileSync(`/proc/${pid}/status`, "latin1");
        return /^Uid:\s+(\d+)/m.exec(status)?.[1] === String(uid) && !/^State:\s+Z/m.test(status);
      } catch {
        return false;
      }
    })
    .map(Number);
}

/** Gone, or a zombie its new parent hasn't reaped yet. */
function ended(pid: number): boolean {
  try {
    return /^State:\s+Z/m.test(readFileSync(`/proc/${String(pid)}/status`, "latin1"));
  } catch {
    return true;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `look` true within `ms`, looking every 5 ms. */
async function within(ms: number, look: () => boolean): Promise<boolean> {
  for (let waited = 0; waited <= ms; waited += 5) {
    if (look()) return true;
    await pause(5);
  }
  return look();
}

/** POSIX's identity calls, which Node has on Linux only. */
function posix() {
  const getuid = process.getuid?.bind(process);
  const geteuid = process.geteuid?.bind(process);
  const getegid = process.getegid?.bind(process);
  const seteuid = process.seteuid?.bind(process);
  const setegid = process.setegid?.bind(process);
  const setgroups = process.setgroups?.bind(process);
  if (
    getuid === undefined ||
    geteuid === undefined ||
    getegid === undefined ||
    seteuid === undefined ||
    setegid === undefined ||
    setgroups === undefined
  ) {
    throw new Error("the harness needs POSIX's user ids");
  }
  return { getuid, geteuid, getegid, seteuid, setegid, setgroups };
}
const { getuid, geteuid, getegid, seteuid, setegid, setgroups } = posix();
if (getuid() !== 0 || geteuid() !== 0) {
  process.stderr.write("the harness runs as root\n");
  process.exit(2);
}

const folder = mkdtempSync(join(tmpdir(), "tadayo-privileges-"));
chmodSync(folder, 0o755);
const out = join(folder, "out");
mkdirSync(out);
chownSync(out, PHOTO.uid, PHOTO.gid);
for (const [name, body] of Object.entries(CHILDREN)) writeFileSync(join(folder, `${name}.mjs`), PRELUDE + body);
writeFileSync(join(folder, "watcher.cjs"), WATCHER);
const child = (name: string) => pathToFileURL(join(folder, `${name}.mjs`));

/** As root again: every process of the photo user killed, by pid, and the folder removed. */
function cleanUp() {
  try {
    seteuid(0);
  } catch {
    // Already root.
  }
  for (let i = 0; i < 200; i += 1) {
    const left = liveOf(PHOTO.uid);
    if (left.length === 0) break;
    for (const pid of left) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // It ended.
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  rmSync(folder, { recursive: true, force: true });
}
process.on("exit", cleanUp);

/** The worker's mode, as `setpriv --euid --egid --groups` leaves it. */
function takeWorkersMode() {
  setgroups([WORKER]);
  setegid(WORKER);
  seteuid(WORKER);
}

/** A photo with the fake child `name`, as the photo user: how it ended and when, and the worker's ids after. */
async function photo(name: string, limits: { peakBytes?: number; deadlineSeconds?: number; sweepSeconds?: number }) {
  const started = Date.now();
  let outcome: string;
  try {
    const answer = await prepareIsolated(BYTES, "image/jpeg", { child: child(name), user: PHOTO, ...limits });
    outcome = answer.prepared.ok ? "prepared" : answer.prepared.rejection;
  } catch (error) {
    outcome = error instanceof Error ? error.name : "error";
  }
  const settledAt = Date.now();
  return { outcome, ms: settledAt - started, settledAt, euid: geteuid(), egid: getegid() };
}

/** What a fake child wrote to `out/`, or null if it wrote nothing there. */
const outOf = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(join(out, file), "utf8"));
  } catch {
    return null;
  }
};
const textOf = (file: string): string => {
  try {
    return readFileSync(join(out, file), "latin1");
  } catch {
    return "";
  }
};

if (process.argv[2] === "sweep-timeout") {
  takeWorkersMode();
  say({ case: "sweep-timeout", started: true });
  await photo("quick", { sweepSeconds: 0.001 });
  say({ case: "sweep-timeout-settled" });
  process.exit(0);
}

say({ case: "start", uid: getuid(), euid: geteuid(), photoUserFree: liveOf(PHOTO.uid).length === 0 });

let asRootAsPlainRoot = "ran";
try {
  asRoot(() => undefined);
} catch {
  asRootAsPlainRoot = "refused";
}
takeWorkersMode();
const why = async (user: { uid: number; gid: number }, program?: string) => {
  try {
    await sweep(user, undefined, program);
    return "swept";
  } catch (error) {
    return error instanceof SweepFailed ? error.why : "error";
  }
};
say({
  case: "refusals",
  asRootAsPlainRoot,
  sweepRoot: await why({ uid: 0, gid: PHOTO.gid }),
  sweepRootsGroup: await why({ uid: PHOTO.uid, gid: 0 }),
  sweepWorkersUser: await why({ uid: WORKER, gid: PHOTO.gid }),
  sweepWorkersGroup: await why({ uid: PHOTO.uid, gid: WORKER }),
  euid: geteuid(),
  egid: getegid(),
});

// A sweep that a process left behind killed, or that failed, is never done (no photo runs: the photo user has none).
say({
  case: "sweep-fails",
  status: await why(PHOTO, "process.exit(3)"),
  signal: await why(PHOTO, 'process.kill(process.pid, "SIGKILL")'),
  done: await why(PHOTO, "process.exit(0)"),
  euid: geteuid(),
});

{
  const { outcome, euid, egid } = await photo("probe", {});
  say({ case: "probe", outcome, child: outOf("probe.json"), euid, egid });
}

{
  const { outcome, euid } = await photo("escapes", {});
  const pid = Number(textOf("escaped.pid"));
  // A process with SIGKILL pending runs nothing more of its own, and is gone within milliseconds.
  const endedBy =
    pid > 0
      ? (await within(200, () => ended(pid)))
        ? "settle"
        : (await within(3000, () => ended(pid)))
          ? "later"
          : "never"
      : "none";
  say({ case: "escapes", outcome, wasRunning: pid > 0, endedBy, euid });
}

{
  const { outcome, euid } = await photo("watching", {});
  say({ case: "watcher", outcome, seen: outOf("sweep.json") ?? null, euid });
}

{
  const { outcome, euid } = await photo("forks", {});
  const { most } = (outOf("forks.json") ?? { most: 0 }) as { most: number };
  await within(200, () => liveOf(PHOTO.uid).length === 0);
  say({ case: "forks", outcome, most, left: liveOf(PHOTO.uid).length, euid });
}

{
  const { outcome, settledAt, euid } = await photo("memory", { peakBytes: 96 * MiB });
  const steps = textOf("memory.log").split("\n").slice(0, -1);
  const lastStep = Number(steps.at(-1));
  say({ case: "memory", outcome, msAfterCrossing: settledAt - lastStep, euid });
}

{
  const { outcome, ms, euid } = await photo("deadline", { deadlineSeconds: 0.5 });
  say({ case: "deadline", outcome, ms, euid });
}

say({ case: "end", left: liveOf(PHOTO.uid).length });
process.exit(0);
