// The root harness of ./privileges.test.ts (docs/plans/api-b2-worker-hardening.md section 3). Run as root, it imports
// the worker's modules, takes the worker's mode itself as fly.toml's command leaves it (real uid 0; groups, effective
// group and effective uid an unused id, 64998), and prepares photos with fake children as an unused photo user
// (64999). It writes one line of JSON a case to standard output, and asserts nothing: the test says what each must be.
// With `sweep-timeout`, it gives the sweep a millisecond, and the worker's stop ends it (exit status 1); with
// `sweep-left`, the photo's user owns a folder holding one of root's, which its sweep can't remove, and the worker's
// stop says so (round 2 of PR #118's review). It sends a
// sweep SIGUSR1, as a process left behind could, and starts the worker's own start (./start.ts) with a process of the
// photo user running, against a database nothing answers for (PR #118's review). It asks for a photo's process with no
// user in the worker's mode, which must start nothing. With `real-child`, in a mount namespace of its own, it views
// the checkout read-only from the temporary folder, as the image's /app is read; runs fly.toml's worker command from
// it, changed only in its user, and the starts short of it, in the image's NODE_ENV (round 3 of PR #118's review);
// and prepares a real photo with the real child (./image-child.ts) as the photo user (the audit's A6).
//
// The fake children are written to a fresh folder under the system's temporary folder, which the photo user can
// read: on CI's runner the checkout is under a home folder only its user may enter. Each says it is ready, reads the
// photo, then does as its name says; what it saw it writes to `out/`, a folder of the photo user's, as JSON.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  chownSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
  constants,
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { NoPhotoUser, prepareIsolated } from "./image-process.ts";
import { asRoot, sweep, SweepFailed } from "./privileges.ts";
import { startWorker } from "./start.ts";

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
// The smallest baseline JPEG of 2 by 1 the worker takes (./image-process.ts, baselineJpeg).
const segment = (marker, body) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
const jpeg = Buffer.from([
  0xff, 0xd8,
  ...segment(0xdb, new Array(65).fill(1)),
  ...segment(0xc0, [8, 0, 1, 0, 2, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
  ...segment(0xc4, new Array(29).fill(0)),
  ...segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
  0x12, 0xff, 0xd9,
]);
const renditions = [{ kind: "full", width: 2, height: 1, length: jpeg.length }, { kind: "display", width: 2, height: 1, length: jpeg.length }];
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
 * without pause for a process of its user running the sweep's program, and writes that process's user and group, what
 * opening its `/proc/<pid>/mem` gave, and what setting its scheduling group to the lowest priority gave (round 2 of
 * PR #118's review: the sweep's `/proc` files are its user's), until the sweep ends it.
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
      let autogroup = "set";
      try {
        fs.writeFileSync("/proc/" + pid + "/autogroup", "19");
      } catch (error) {
        autogroup = error.code ?? "error";
      }
      const seen = { uid: Number(field("Uid")), gid: Number(field("Gid")), mem, autogroup };
      fs.writeFileSync(file, JSON.stringify(seen));
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

/**
 * Perl that makes a System V shared memory segment and gives it to the uid it is passed, so its maker and its owner
 * differ (Node has no shmctl: `IPC_STAT` is 2, `IPC_SET` 1, and the owner is 4 bytes into the structure).
 */
const GIVE_SEGMENT = [
  'my $id = shmget(0, 65536, 0600 | 01000); defined $id or die "shmget: $!";',
  'my $ds = ""; shmctl($id, 2, $ds) or die "stat: $!";',
  'substr($ds, 4, 4) = pack("L", $ARGV[0]); shmctl($id, 1, $ds) or die "set: $!";',
].join(" ");

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
  // Whether SIGUSR1 is caught, which is Node opening its inspector (bit 10, from 1).
  usr1Caught: (BigInt("0x" + (/^SigCgt:\s+(\S+)/m.exec(status)?.[1] ?? "0")) & 0x200n) !== 0n,
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
  // ids, whether it could open the sweep's memory, which is what attaching to it takes, and whether it could lower its
  // scheduling group's priority (WATCHER).
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
  // What a process of the photo's user can leave once it has gone, holding the Machine's memory or disk: a file, and a
  // folder it made read-only with a folder and files in it, in /tmp and /dev/shm; and System V shared memory, a
  // semaphore and a message queue (PR #118's review), and a segment it made and gave to another user, so the photo user
  // is only its maker (GIVE_SEGMENT). Since round 2 of the review: names that aren't UTF-8 (one alone in /var/tmp, and
  // one in each read-only folder), a file in /run/lock, a queue in /dev/mqueue where the machine has one, a tree deeper
  // than a path may be long (4096 bytes), and more System V queues than one call of ipcrm is given (500).
  hoards: String.raw`
import { chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const bytes = (path, ...more) => Buffer.concat([Buffer.from(path), Buffer.from(more)]);
for (const dir of ["/tmp", "/dev/shm"]) {
  writeFileSync(dir + "/tadayo-hoard", Buffer.alloc(1024 * 1024, 1));
  mkdirSync(dir + "/tadayo-hoard-folder/inner", { recursive: true });
  writeFileSync(dir + "/tadayo-hoard-folder/inner/file", "x");
  writeFileSync(bytes(dir + "/tadayo-hoard-folder/inner/", 0xfe, 0x41), "x");
  chmodSync(dir + "/tadayo-hoard-folder/inner", 0o500);
  chmodSync(dir + "/tadayo-hoard-folder", 0o500);
}
writeFileSync(bytes("/var/tmp/tadayo-", 0xff), Buffer.alloc(1024 * 1024, 1));
writeFileSync("/run/lock/tadayo-hoard", "x");
if (existsSync("/dev/mqueue")) writeFileSync("/dev/mqueue/tadayo-hoard", "");
mkdirSync("/tmp/tadayo-deep");
process.chdir("/tmp/tadayo-deep");
for (let depth = 0; depth < 2100; depth += 1) {
  mkdirSync("a");
  process.chdir("a");
}
writeFileSync("file", "x");
process.chdir("/");
execFileSync("/usr/bin/ipcmk", ["-M", "65536"], { stdio: "ignore" });
execFileSync("/usr/bin/ipcmk", ["-S", "1"], { stdio: "ignore" });
execFileSync("/usr/bin/ipcmk", ["-Q"], { stdio: "ignore" });
execFileSync("/usr/bin/perl", ["-e", ${JSON.stringify(GIVE_SEGMENT)}, "65534"], { stdio: "ignore" });
execFileSync("/usr/bin/perl", ["-e", 'msgget(0, 0600 | 01000) // die "msgget: $!" for 1 .. 1200'], { stdio: "ignore" });
writeFileSync(out + "hoards.json", JSON.stringify({ made: true }));
await answer();
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

/** What `uid` owns where any user may write, by name (read as bytes), and its System V objects, as `kind:id`. */
function leftOf(uid: number): { files: string[]; ipc: string[] } {
  const files: string[] = [];
  for (const dir of ["/tmp", "/var/tmp", "/dev/shm", "/dev/mqueue", "/run/lock"]) {
    let names: Buffer[] = [];
    try {
      names = readdirSync(dir, { encoding: "buffer" });
    } catch {
      // Not on this machine.
    }
    for (const name of names) {
      try {
        if (lstatSync(Buffer.concat([Buffer.from(`${dir}/`), name])).uid === uid)
          files.push(`${dir}/${name.toString()}`);
      } catch {
        // Removed as it was listed.
      }
    }
  }
  const ipc: string[] = [];
  for (const kind of ["shm", "sem", "msg"]) {
    let rows: string[][] = [];
    try {
      rows = readFileSync(`/proc/sysvipc/${kind}`, "latin1")
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/));
    } catch {
      // No System V objects here.
    }
    const [head = [], ...body] = rows;
    const id = head.indexOf(kind === "msg" ? "msqid" : `${kind}id`);
    for (const row of body) {
      if (row[head.indexOf("uid")] === String(uid) || row[head.indexOf("cuid")] === String(uid)) {
        ipc.push(`${kind}:${row[id] ?? ""}`);
      }
    }
  }
  return { files, ipc };
}

/** Whether something on this machine accepts a connection on 127.0.0.1's `port`. */
function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
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
// A child that only notes it started, in a folder any user may write to: the photo's process asked for with no user.
const anyone = join(folder, "anyone");
mkdirSync(anyone);
chmodSync(anyone, 0o1777);
writeFileSync(
  join(folder, "marker.mjs"),
  `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(join(anyone, "started"))}, String(process.getuid()));\n`,
);
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
  const left = leftOf(PHOTO.uid);
  for (const file of left.files) rmSync(file, { recursive: true, force: true });
  const flags: Record<string, string> = { shm: "-m", sem: "-s", msg: "-q" };
  for (const object of left.ipc) {
    const [kind = "", id = ""] = object.split(":");
    try {
      execFileSync("/usr/bin/ipcrm", [flags[kind] ?? "", id], { stdio: "ignore" });
    } catch {
      // Removed already.
    }
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

if (process.argv[2] === "sweep-left") {
  takeWorkersMode();
  // As in start-sweep-fails below; cleanUp removes it, as root, as the harness ends.
  const stuck = join("/tmp", `harness-stuck-${String(process.pid)}`);
  asRoot(() => {
    mkdirSync(join(stuck, "roots"), { recursive: true });
    writeFileSync(join(stuck, "roots", "file"), "");
    chownSync(stuck, PHOTO.uid, PHOTO.gid);
  });
  say({ case: "sweep-left", started: true });
  await photo("quick", {});
  say({ case: "sweep-left-settled" });
  process.exit(0);
}

// The real child (./image-child.ts), not a fake, prepares a real photo as the photo's user (the audit's A6, which a
// reviewer ran by hand). The photo user can't read the checkout where it is on CI's runner, under a home folder only
// the runner's user may enter, so the harness shows it a view of the checkout: the same tree, bound read-only onto a
// folder under the system's temporary folder, in a mount namespace of the harness's own (`unshare`), which no other
// process sees and which ends with it. In the image, /app is root's and anyone may read it, as the view is here.
if (process.argv[2] === "real-child") {
  const inside = spawnSync(
    "/usr/bin/unshare",
    [
      "--mount",
      "--propagation",
      "private",
      "--",
      process.execPath,
      fileURLToPath(import.meta.url),
      "real-child-inside",
    ],
    { stdio: "inherit" },
  );
  process.exit(inside.status ?? 1);
}

if (process.argv[2] === "real-child-inside") {
  const checkout = join(import.meta.dirname, "..", "..", "..");
  // Never inside `folder`, which cleanUp removes with all it holds.
  const view = mkdtempSync(join(tmpdir(), "tadayo-checkout-"));
  chmodSync(view, 0o755);
  // Before the mount, so a view left mounted by a failure past it is still taken down; first among the exit
  // listeners, so it is detached before anything else runs. Each step on its own: a view that won't detach is still
  // tried, and an empty folder is still removed.
  process.prependListener("exit", () => {
    try {
      seteuid(0);
    } catch {
      // Already root.
    }
    try {
      execFileSync("/usr/bin/umount", ["--lazy", view]);
    } catch {
      // Never mounted, or the namespace's end takes it with it.
    }
    try {
      rmdirSync(view);
    } catch {
      // A folder that isn't empty is left as it is.
    }
  });
  execFileSync("/usr/bin/mount", ["--bind", "-o", "ro", checkout, view]);
  // Asked of the kernel, as root, whose permissions would let it write anything: nothing is written to find out.
  let writable: string;
  try {
    accessSync(view, constants.W_OK);
    writable = "writable";
  } catch (error) {
    writable = (error as NodeJS.ErrnoException).code === "EROFS" ? "read-only" : `refused: ${String(error)}`;
  }

  // fly.toml's worker command as fly.toml has it, its user `node` (which a runner may not have) made the worker's
  // unused id, from the view, in the image's NODE_ENV, with no database: it goes past the photo user's check to its
  // first setting. Each start short of it stops at that check (the audit's A6; round 3 of PR #118's review).
  const command = /^\s*worker\s*=\s*"(.*)"\s*$/m.exec(readFileSync(join(view, "fly.toml"), "utf8"))?.[1] ?? "";
  const words = command.split(" ").map((word) => word.replace(/=node$/, `=${String(WORKER)}`));
  const entryAt = words.indexOf("node");
  const entry = words.slice(entryAt);
  const without = (word: string) => words.filter((candidate) => candidate !== word);
  const starts: Record<string, string[]> = {
    fly: words,
    withoutNoNewPrivs: without("--no-new-privs"),
    widerBoundingSet: words.map((word) => (word.startsWith("--bounding-set=") ? `${word},+chown` : word)),
    inheritable: words.map((word) => (word === "--inh-caps=-all" ? "--inh-caps=-all,+kill" : word)),
    rootsGroup: words.map((word) => (word.startsWith("--groups=") ? `${word},0` : word)),
    euidAlone: ["setpriv", `--euid=${String(WORKER)}`, "--", ...entry],
    rootAlone: entry,
  };
  const ended: Record<string, { code: number | null; stderr: string; stdout: string }> = {};
  for (const [name, start] of Object.entries(starts)) {
    const [program = "", ...args] = start;
    const run = spawnSync(program, args, {
      cwd: view,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, NODE_ENV: "production", TADAYO_PHOTO_USER: "nobody" },
      encoding: "utf8",
      timeout: 30_000,
    });
    ended[name] = { code: run.status, stderr: run.stderr, stdout: run.stdout };
  }
  say({ case: "fly-start", command: entryAt > 0 ? "found" : "missing", ended });

  // A 12-megapixel photo, as a phone's camera makes them: smooth, so it compresses as a photo does.
  const small = await sharp({
    create: {
      width: 504,
      height: 378,
      channels: 3,
      background: "#000000",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .png()
    .toBuffer();
  const photoBytes = await sharp(small).resize(4032, 3024).jpeg({ quality: 90 }).toBuffer();
  const realChild = pathToFileURL(join(view, "services", "worker", "src", "image-child.ts"));
  takeWorkersMode();
  // While it runs, the real child's ids, from its /proc status, which any user may read.
  let ranAs: { uid: number; gid: number; groups: string } | null = null;
  const watch = setInterval(() => {
    for (const pid of readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      try {
        if (!readFileSync(`/proc/${pid}/cmdline`, "latin1").includes(realChild.pathname)) continue;
        const status = readFileSync(`/proc/${pid}/status`, "latin1");
        // A field's value, which may be empty (Groups, when there is no supplementary group): never the next line's.
        const field = (name: string) => new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(status)?.[1]?.trim() ?? "";
        ranAs = {
          uid: Number(field("Uid").split(/\s+/)[0]),
          gid: Number(field("Gid").split(/\s+/)[0]),
          groups: field("Groups"),
        };
      } catch {
        // That process has gone.
      }
    }
  }, 2);
  let outcome: string;
  let renditions: { kind: string; width: number; height: number; jpeg: boolean }[] = [];
  let peakMiB = 0;
  try {
    const answer = await prepareIsolated(photoBytes, "image/jpeg", { child: realChild, user: PHOTO });
    peakMiB = Math.round(answer.peakBytes / MiB);
    if (answer.prepared.ok) {
      outcome = "prepared";
      renditions = answer.prepared.renditions.map(({ kind, width, height, bytes }) => ({
        kind,
        width,
        height,
        jpeg: bytes[0] === 0xff && bytes[1] === 0xd8,
      }));
    } else {
      outcome = answer.prepared.rejection;
    }
  } catch (error) {
    outcome = error instanceof Error ? error.name : "error";
  }
  clearInterval(watch);
  say({
    case: "real-child",
    view: writable,
    outcome,
    renditions,
    peakMiB,
    ranAs,
    left: { processes: liveOf(PHOTO.uid).length, ...leftOf(PHOTO.uid) },
    euid: geteuid(),
  });
  process.exit(0);
}

say({
  case: "start",
  uid: getuid(),
  euid: geteuid(),
  photoUserFree: liveOf(PHOTO.uid).length === 0,
  photoUserLeft: leftOf(PHOTO.uid),
});

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

// A photo's process asked for with no user, in the worker's mode (the audit's A6): refused, and nothing started. Started
// so, it would be a child of real uid 0 that keeps setuid in its permitted set, able to take effective uid 0 back.
{
  let outcome = "prepared";
  try {
    await prepareIsolated(BYTES, "image/jpeg", { child: child("marker") });
  } catch (error) {
    outcome = error instanceof NoPhotoUser ? "refused" : error instanceof Error ? error.name : "error";
  }
  const started = await within(300, () => existsSync(join(anyone, "started")));
  say({ case: "no-user", outcome, started, euid: geteuid() });
}

// A sweep that a process left behind killed, or that failed, is never done (no photo runs: the photo user has none);
// exit status 3 is the program's own, once its user's processes have all ended: what they left wasn't all removed.
say({
  case: "sweep-fails",
  status: await why(PHOTO, "process.exit(1)"),
  left: await why(PHOTO, "process.exit(3)"),
  signal: await why(PHOTO, 'process.kill(process.pid, "SIGKILL")'),
  done: await why(PHOTO, "process.exit(0)"),
  euid: geteuid(),
});

// A sweep sent SIGUSR1, as a process left behind may send it: with --disable-sigusr1, Node keeps the signal blocked in
// every thread and never catches it, so it stays pending, no inspector opens on 127.0.0.1:9229 for that process to take
// the sweep over with, and the sweep carries on to its own end (PR #118's review).
{
  const ready = join(out, "sweep.ready");
  const swept = why(
    PHOTO,
    `require("node:fs").writeFileSync(${JSON.stringify(ready)}, ""); setTimeout(() => process.exit(0), 3000);`,
  );
  let usr1Caught: boolean | null = null;
  let usr1Blocked: boolean | null = null;
  let inspector = false;
  if (await within(3000, () => existsSync(ready))) {
    const pid = liveOf(PHOTO.uid).find((each) =>
      readFileSync(`/proc/${String(each)}/cmdline`, "latin1").includes("sweep.ready"),
    );
    if (pid !== undefined) {
      const status = readFileSync(`/proc/${String(pid)}/status`, "latin1");
      const bit = (field: string) =>
        (BigInt(`0x${new RegExp(`^${field}:\\s+([0-9a-f]+)`, "m").exec(status)?.[1] ?? "0"}`) & 0x200n) !== 0n;
      usr1Caught = bit("SigCgt");
      usr1Blocked = bit("SigBlk");
      asRoot(() => process.kill(pid, "SIGUSR1"));
      for (let i = 0; i < 20 && !inspector; i += 1) {
        inspector = await accepts(9229);
        await pause(25);
      }
    }
  }
  say({ case: "sweep-usr1", usr1Caught, usr1Blocked, inspector, status: await swept, euid: geteuid() });
}

// The worker's start, with a process a photo left before a restart still running: it ends that process before it
// connects to the database, which nothing answers for here (./start.ts).
{
  const left = asRoot(() =>
    spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      uid: PHOTO.uid,
      gid: PHOTO.gid,
      detached: true,
      stdio: "ignore",
      env: {},
    }),
  );
  left.unref();
  const pid = left.pid ?? -1;
  const wasRunning = await within(2000, () => liveOf(PHOTO.uid).includes(pid));
  let failedAt = "nowhere";
  try {
    await startWorker(
      {
        DATABASE_URL: "postgres://tadayo_app:password@127.0.0.1:1/tadayo",
        SUPABASE_URL: "https://tadayotestprojectref.supabase.co",
        SUPABASE_SERVICE_KEY: "sb_secret_testkeynotreal0000",
        TADAYO_ENVIRONMENT: "dev",
        TADAYO_PHOTO_USER: "harness-photo",
      },
      () => `harness-photo:x:${String(PHOTO.uid)}:${String(PHOTO.gid)}::/nonexistent:/usr/sbin/nologin\n`,
    );
  } catch (error) {
    failedAt = error instanceof Error && error.message.includes("as it started") ? "the sweep" : "the database";
  }
  const endedBy = (await within(200, () => ended(pid))) ? "start" : "never";
  say({ case: "start-sweep", wasRunning, endedBy, failedAt, euid: geteuid() });
}

// The worker's start, when its sweep can't finish: it stops before it connects (./start.ts), saying what was left. A
// folder of the photo user's holding one of root's, which the sweep can neither empty nor remove, is still there after
// `rm`, so its program exits 3. The photo user can't make that folder itself, so root makes it here; it has other ways
// to keep a sweep from exiting 0 in time, all of which stop the worker the same way (enough files to outlast
// SWEEP_SECONDS, a stopped or starved sweep: ADR-038, docs/LIMITATIONS.md).
{
  const stuck = join("/tmp", `harness-stuck-${String(process.pid)}`);
  asRoot(() => {
    mkdirSync(join(stuck, "roots"), { recursive: true });
    writeFileSync(join(stuck, "roots", "file"), "");
    chownSync(stuck, PHOTO.uid, PHOTO.gid);
  });
  let failedAt = "nowhere";
  try {
    await startWorker(
      {
        DATABASE_URL: "postgres://tadayo_app:password@127.0.0.1:1/tadayo",
        SUPABASE_URL: "https://tadayotestprojectref.supabase.co",
        SUPABASE_SERVICE_KEY: "sb_secret_testkeynotreal0000",
        TADAYO_ENVIRONMENT: "dev",
        TADAYO_PHOTO_USER: "harness-photo",
      },
      () => `harness-photo:x:${String(PHOTO.uid)}:${String(PHOTO.gid)}::/nonexistent:/usr/sbin/nologin\n`,
    );
  } catch (error) {
    failedAt = error instanceof Error && error.message.includes("as it started") ? "the sweep" : "the database";
    if (error instanceof Error && error.message.includes("left couldn't all be removed")) failedAt += ", left";
  }
  asRoot(() => {
    rmSync(stuck, { recursive: true, force: true });
  });
  say({ case: "start-sweep-fails", failedAt, euid: geteuid() });
}

// The group's kill as root, never once Node has reaped the photo's process: its group's number may then be reused
// (./image-process.ts, killGroup). Every SIGKILL to a group is noted with whether the group's leader was still there
// (alive, or a zombie not yet reaped, both of which keep /proc/<pid>).
{
  const kill = process.kill.bind(process);
  const kills: { leaderThere: boolean }[] = [];
  process.kill = (pid: number, signal?: string | number) => {
    if (pid < 0 && signal === "SIGKILL") kills.push({ leaderThere: existsSync(`/proc/${String(-pid)}`) });
    return kill(pid, signal);
  };
  let outcome: string;
  try {
    ({ outcome } = await photo("probe", {}));
  } finally {
    process.kill = kill;
  }
  say({
    case: "reaped",
    outcome,
    groupKills: kills.length,
    afterReap: kills.filter((each) => !each.leaderThere).length,
    euid: geteuid(),
  });
}

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
  // The worker's own scheduling group, before and after (null on a kernel without them).
  const group = (): string | null => {
    try {
      return readFileSync("/proc/self/autogroup", "latin1")
        .trim()
        .replace(/^\/autogroup-\d+ /, "");
    } catch {
      return null;
    }
  };
  const before = group();
  const { outcome, euid } = await photo("watching", {});
  say({ case: "watcher", outcome, seen: outOf("sweep.json") ?? null, group: { before, after: group() }, euid });
}

{
  const { outcome, euid } = await photo("forks", {});
  const { most } = (outOf("forks.json") ?? { most: 0 }) as { most: number };
  await within(200, () => liveOf(PHOTO.uid).length === 0);
  say({ case: "forks", outcome, most, left: liveOf(PHOTO.uid).length, euid });
}

{
  // And a segment root made and gave to the photo user, so the photo user is only its owner: the sweep removes what the
  // user owns or made.
  asRoot(() => {
    execFileSync("/usr/bin/perl", ["-e", GIVE_SEGMENT, String(PHOTO.uid)], { stdio: "ignore" });
  });
  const { outcome, euid } = await photo("hoards", {});
  say({ case: "hoards", outcome, made: outOf("hoards.json") !== null, left: leftOf(PHOTO.uid), euid });
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
