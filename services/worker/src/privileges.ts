// Each photo under a user of its own (docs/plans/api-b2-worker-hardening.md section 2; ADR-038, which the founder
// approved at 21:09 UTC on 2026-11-23). A photo's process (./image-process.ts) parses a stranger's bytes, so code that
// took over one of its decoders must find nothing of the worker's within reach. The worker can't make that so for a
// process of its own user, so on Fly it is started as root and turned to `node` at once (fly.toml's worker command:
// `setpriv --euid=node ...`): its real user stays root, which makes it non-dumpable, so its `/proc` files are the
// kernel's and no process of another user can read its environment or memory, open its pipes, attach to it or signal
// it, and it keeps three capabilities (setuid, setgid, kill) that it can use only by taking effective uid 0. Each
// photo's process is then started as `TADAYO_PHOTO_USER` (`tadayo-image` in the image), with no group but its own.
//
// - The worker's mode: real uid 0, effective uid not 0. photoUserFor reads it at the start, with the variable: both
//   isolate each photo; neither prepares photos in the worker's own user, as the tests, CI's runner and the session
//   do; either alone stops the worker, as neither half isolates anything without the other.
// - asRoot(fn) takes effective uid 0 for `fn` alone and returns to the worker's user. It is called from three places,
//   nowhere else: to start a photo's process (Node's `spawn` clears the child's groups and sets its group and user
//   before the child's program runs), to kill its process group (once the photo is answered or ends, and when its
//   memory or deadline is passed), and to start a sweep (as each photo settles, and once as the worker starts). For
//   that instant every thread of the worker has uid 0 (glibc's `seteuid` sets it for all of them), and `fn` returns
//   before any other code of the worker's runs, since each is synchronous.
// - The sweep. Once a photo's end settles, the worker starts one more process as the photo's user, which sends SIGKILL
//   to every process that user may signal (`kill(-1, SIGKILL)`): every process of that user but the sweep itself, in
//   one pass under the kernel's task list lock, so a process forking as fast as it can is caught too, and a process
//   with that signal pending never runs another instruction of its own. It runs with the worker's own group, not the
//   photo user's: Linux lets a process attach to another (ptrace, /proc/<pid>/mem, process_vm_writev) only when all
//   its user and group ids match, so a process the photo's process left behind can't attach to the sweep. It may
//   still signal it, as it may signal any process of its user, and Node opens an inspector anyone on the Machine can
//   reach (127.0.0.1:9229, with no password) when it is sent SIGUSR1: so the sweep runs with `--disable-sigusr1`, with
//   which Node keeps SIGUSR1 blocked in every thread and never catches it, so it stays pending and does nothing (PR
//   #118's review: a leftover took the sweep over that way, and read the next photo). A leftover that stops, kills or starves the sweep keeps it from exiting 0 within
//   SWEEP_SECONDS, and the worker stops: its Machine restarts (fly.toml's `[[restart]]` policy `on-failure`), and
//   every process on it ends with it. The photo in hand comes back once its lease has passed, its attempt counted, at
//   most five times (./outbox.ts). Photos are prepared one at a time, so no other photo's process is alive then.
// - What the sweep leaves. Once no process of the photo's user is left, the sweep removes what that user left in
//   memory or on disk where it may write: its files and folders in /tmp, /var/tmp, /dev/shm, /dev/mqueue and
//   /run/lock, and its System V shared memory, semaphores and message queues (with `ipcrm`). Left there, they would
//   hold the Machine's memory, and every later photo would be refused for its size (PR #118's review). A removal that
//   fails is an exit other than 0, and the worker stops.
// - At its start, before it claims a photo, the worker sweeps once, so nothing a photo left before a restart can wait
//   for the next one, whether or not the Machine's restart ended it (./start.ts).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

/** The user and group a photo's process runs as. */
export interface PhotoUser {
  readonly uid: number;
  readonly gid: number;
}

/** A process's real and effective user, and its effective group. */
export interface Ids {
  readonly uid: number;
  readonly euid: number;
  readonly egid: number;
}

/** How long the sweep may take, from its start to its exit, before the worker stops. */
export const SWEEP_SECONDS = 5;

/** Node's flag that keeps SIGUSR1 from opening its inspector (the rules above): the sweep's and each photo's process's. */
export const NO_INSPECTOR = "--disable-sigusr1";

/**
 * The sweep's program (the rules above). As root, kill(-1) would end every process on the Machine, so it first checks
 * its own user and exits 2 if it is root, whatever the refusal before its start let through: a sweep that doesn't
 * exit 0 stops the worker. Then SIGKILL to every process its user may signal but itself (kill(2) with pid -1), again
 * until none of that user's is left but as a zombie: finding none (`ESRCH`) is the usual case, as the photo's process
 * group was killed already. Then what the user left: in each folder, every entry the user owns, a folder's own
 * entries first (made writable to it first, as the user may have made them read-only); and each System V object the
 * user owns or made, by its id, from /proc/sysvipc. A folder that isn't there, or can't be read, is passed over.
 */
export const SWEEP_PROGRAM = [
  "if (process.getuid() === 0) process.exit(2);",
  'const fs = require("node:fs");',
  "const uid = String(process.getuid());",
  "const self = String(process.pid);",
  'const alive = () => fs.readdirSync("/proc").some((pid) => {',
  "  if (!/^\\d+$/.test(pid) || pid === self) return false;",
  "  let status;",
  '  try { status = fs.readFileSync("/proc/" + pid + "/status", "latin1"); } catch { return false; }',
  "  return /^Uid:\\s+(\\d+)/m.exec(status)?.[1] === uid && !/^State:\\s+[ZX]/m.test(status);",
  "});",
  "do {",
  '  try { process.kill(-1, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }',
  "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);",
  "} while (alive());",
  "const remove = (path) => {",
  "  if (fs.lstatSync(path).isDirectory()) {",
  "    fs.chmodSync(path, 0o700);",
  '    for (const name of fs.readdirSync(path)) remove(path + "/" + name);',
  "    fs.rmdirSync(path);",
  "  } else fs.unlinkSync(path);",
  "};",
  'for (const dir of ["/tmp", "/var/tmp", "/dev/shm", "/dev/mqueue", "/run/lock"]) {',
  "  let names;",
  '  try { names = fs.readdirSync(dir); } catch (error) { if (error.code === "ENOENT" || error.code === "EACCES") continue; throw error; }',
  "  for (const name of names) {",
  "    let stat;",
  '    try { stat = fs.lstatSync(dir + "/" + name); } catch (error) { if (error.code === "ENOENT") continue; throw error; }',
  '    if (String(stat.uid) === uid) remove(dir + "/" + name);',
  "  }",
  "}",
  "const objects = [];",
  'for (const [kind, flag] of [["shm", "-m"], ["sem", "-s"], ["msg", "-q"]]) {',
  "  let text;",
  '  try { text = fs.readFileSync("/proc/sysvipc/" + kind, "latin1"); } catch (error) { if (error.code === "ENOENT") continue; throw error; }',
  '  const [head, ...rows] = text.trim().split("\\n").map((line) => line.trim().split(/\\s+/));',
  '  const id = head.indexOf(kind === "msg" ? "msqid" : kind + "id");',
  '  const owner = head.indexOf("uid");',
  '  const maker = head.indexOf("cuid");',
  "  for (const row of rows) if (row[owner] === uid || row[maker] === uid) objects.push(flag, row[id]);",
  "}",
  'if (objects.length > 0) require("node:child_process").execFileSync("/usr/bin/ipcrm", objects, { stdio: "ignore" });',
].join("\n");

const STOP_LINE =
  "worker: a photo's processes weren't all ended, so the worker stops, and its Machine restarts without them";

/** Why the sweep failed: a user it won't sweep, a process that didn't start, an exit not 0, or its time. */
export class SweepFailed extends Error {
  readonly code = "image.sweep_failed";
  readonly why: "refused" | "start" | "exit" | "time";
  constructor(why: "refused" | "start" | "exit" | "time") {
    super(`image: the photo user's processes weren't swept: ${why}`);
    this.name = "SweepFailed";
    this.why = why;
  }
}

/** POSIX's identity calls, which Node has on Linux only. */
function posix(): {
  getuid: () => number;
  geteuid: () => number;
  getegid: () => number;
  seteuid: (id: number) => void;
} {
  const { getuid, geteuid, getegid, seteuid } = process;
  if (getuid === undefined || geteuid === undefined || getegid === undefined || seteuid === undefined) {
    throw new Error("worker: this platform has no user ids");
  }
  return { getuid, geteuid, getegid, seteuid };
}

/** This process's ids. */
export function idsOf(): Ids {
  const calls = posix();
  return { uid: calls.getuid(), euid: calls.geteuid(), egid: calls.getegid() };
}

/** Started as root and turned to a user of its own, as fly.toml starts the worker. */
export function inWorkerMode(ids: Ids): boolean {
  return ids.uid === 0 && ids.euid !== 0;
}

/**
 * The worker stops at once, with one line on standard error and exit status 1, which Fly restarts. For a state in
 * which preparing another photo, or running another line of the worker's code, isn't safe.
 */
export function stopWorker(line: string = STOP_LINE): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

const isId = (value: string | undefined): boolean => value !== undefined && /^\d{1,10}$/.test(value);

/**
 * The user each photo's process runs as, or undefined when photos are prepared in the worker's own user (the rules
 * above). Throws, stopping the worker as it starts, when only one half is there, or when the variable names no user,
 * or root, root's group, or the worker's own user or group.
 */
export function photoUserFor(
  env: Readonly<Record<string, string | undefined>>,
  ids: Ids = idsOf(),
  passwd: () => string = () => readFileSync("/etc/passwd", "utf8"),
): PhotoUser | undefined {
  const name = env.TADAYO_PHOTO_USER;
  const named = name !== undefined && name !== "";
  const started = inWorkerMode(ids);
  if (!named && !started) return undefined;
  if (!named) {
    throw new Error("worker: started to prepare each photo under a user of its own, but TADAYO_PHOTO_USER isn't set");
  }
  if (!started) {
    throw new Error(
      "worker: TADAYO_PHOTO_USER is set, but the worker wasn't started as root with its own user effective (fly.toml's worker command)",
    );
  }
  const entry = passwd()
    .split("\n")
    .map((line) => line.split(":"))
    .find((fields) => fields.length === 7 && fields[0] === name);
  if (entry === undefined) throw new Error("worker: TADAYO_PHOTO_USER names no user in /etc/passwd");
  const [, , uid, gid] = entry;
  if (!isId(uid) || !isId(gid)) throw new Error("worker: TADAYO_PHOTO_USER's entry isn't a user's id and group");
  const user = { uid: Number(uid), gid: Number(gid) };
  if (user.uid === 0 || user.gid === 0) throw new Error("worker: TADAYO_PHOTO_USER is root, or in root's group");
  if (user.uid === ids.euid || user.gid === ids.egid) {
    throw new Error("worker: TADAYO_PHOTO_USER is the worker's own user or group");
  }
  return user;
}

/**
 * `fn` with effective uid 0, then the worker's own again (the rules above). Refuses, running nothing, outside the
 * worker's mode. A worker that couldn't return to its own user stops.
 */
export function asRoot<T>(fn: () => T): T {
  const calls = posix();
  const before = idsOf();
  if (!inWorkerMode(before)) {
    throw new Error("worker: asRoot is only for a worker started as root with its own user effective");
  }
  calls.seteuid(0);
  try {
    return fn();
  } finally {
    try {
      calls.seteuid(before.euid);
    } catch {
      // Checked below.
    }
    if (calls.geteuid() !== before.euid) stopWorker("worker: couldn't return to its own user");
  }
}

/**
 * Ends every process of the photo's user (the rules above): resolves once the sweep has exited 0, rejects with
 * SweepFailed otherwise. An exit not 0, or none (killed by a signal), is never done: a process the photo left behind
 * may have killed the sweep before it ran. It refuses, starting nothing, root, root's group, and the worker's own
 * user and group. `seconds` and `program` are SWEEP_SECONDS and SWEEP_PROGRAM but in the root harness, which gives
 * the sweep a millisecond, or a program that fails, to show either stops the worker.
 */
export function sweep(
  user: PhotoUser,
  seconds: number = SWEEP_SECONDS,
  program: string = SWEEP_PROGRAM,
): Promise<void> {
  let own: Ids;
  try {
    own = idsOf();
  } catch {
    return Promise.reject(new SweepFailed("start"));
  }
  if (user.uid === 0 || user.gid === 0 || user.uid === own.euid || user.gid === own.egid) {
    return Promise.reject(new SweepFailed("refused"));
  }
  return new Promise((resolve, reject) => {
    let started;
    try {
      started = asRoot(() =>
        spawn(process.execPath, [NO_INSPECTOR, "-e", program], {
          uid: user.uid,
          gid: own.egid,
          env: {},
          stdio: "ignore",
        }),
      );
    } catch {
      reject(new SweepFailed("start"));
      return;
    }
    const timer = setTimeout(() => {
      reject(new SweepFailed("time"));
    }, seconds * 1000);
    started.on("error", () => {
      clearTimeout(timer);
      reject(new SweepFailed("start"));
    });
    started.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new SweepFailed("exit"));
    });
  });
}
