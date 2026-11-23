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
// - asRoot(fn) takes effective uid 0 for `fn` alone and returns to the worker's user. It is used three times, nowhere
//   else: to start a photo's process (Node's `spawn` clears the child's groups and sets its group and user before the
//   child's program runs), to kill its process group, and to start the sweep. For that instant every thread of the
//   worker has uid 0 (glibc's `seteuid` sets it for all of them), and `fn` returns before any other code of the
//   worker's runs, since all three are synchronous.
// - The sweep. Once a photo's end settles, the worker starts one more process as the photo's user, which sends SIGKILL
//   to every process that user may signal (`kill(-1, SIGKILL)`): every process of that user but the sweep itself, in
//   one pass under the kernel's task list lock, so a process forking as fast as it can is caught too, and a process
//   with that signal pending never runs another instruction of its own. It runs with the worker's own group, not the
//   photo user's: Linux lets a process attach to another (ptrace, /proc/<pid>/mem) only when all its user and group ids
//   match, so a process the photo's process left behind can't take the sweep over. It can still stop or kill it, as
//   it may signal any process of its user; then the sweep doesn't exit 0 within SWEEP_SECONDS, and the worker stops:
//   its Machine restarts (fly.toml's `[[restart]]` policy `on-failure`), and every process on it ends with it. The
//   photo in hand comes back once its lease has passed, its attempt counted (./outbox.ts). Photos are prepared one at
//   a time, so no other photo's process is alive while the sweep runs.

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

/**
 * The sweep's program: SIGKILL to every process its user may signal, but itself (kill(2) with pid -1). Finding none
 * (`ESRCH`) is the usual case, as the photo's process group was killed already, and is done too. As root, kill(-1)
 * would end every process on the Machine, so the program first checks its own user and exits 2 if it is root,
 * whatever the refusal before its start let through: a sweep that doesn't exit 0 stops the worker.
 */
export const SWEEP_PROGRAM =
  'if (process.getuid() === 0) process.exit(2); try { process.kill(-1, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }';

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
        spawn(process.execPath, ["-e", program], {
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
