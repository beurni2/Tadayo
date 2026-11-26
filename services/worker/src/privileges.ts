// Each photo under a user of its own (docs/plans/api-b2-worker-hardening.md section 2; ADR-038, which the founder
// approved at 21:09 UTC on 2026-11-23). A photo's process (./image-process.ts) parses a stranger's bytes, so code that
// took over one of its decoders must find nothing of the worker's within reach. The worker can't make that so for a
// process of its own user, so on Fly it is started as root and turned to `node` at once (fly.toml's worker command,
// `setpriv`, drops all but root's ids, and the worker's first module takes `node`'s effective group and user,
// turnToWorkerUser, as Fly's kernel undoes an effective id `setpriv` sets under no new privileges): its real user stays
// root, so no process of another user can read its environment or memory, open its pipes or attach to it (Linux's
// `ptrace_may_access` compares the caller's ids with every one of the worker's, its real and saved uid 0) or signal it
// (`kill_ok_by_cred`). Its `/proc` files are root's too unless `fs.suid_dumpable` is 1: taking other effective ids
// makes it non-dumpable then (`commit_creds`), and Linux gives a non-dumpable process's files to root
// (`task_dump_owner`). That setting is the kernel's, 0 in the session and in Docker here, and Fly's isn't read (PR
// #135's review). It keeps three capabilities (setuid, setgid, kill) that it can use only by taking effective uid 0. Each photo's process is then started as
// `TADAYO_PHOTO_USER` (`tadayo-image` in the image), with no group but its own.
//
// - The worker's mode: real uid 0, effective uid and group not 0. photoUserFor reads it at the start, with the
//   variable: both isolate each photo; neither prepares photos in the worker's own user, as the tests, CI's runner and
//   the session do; either alone stops the worker, as neither half isolates anything without the other. In the image
//   (inImage: `NODE_ENV=production`, or the marker the Dockerfile writes, which no setting can take away) only both
//   will do, and only as fly.toml's worker command leaves the process (startedAsFly: no new privileges, setuid, setgid
//   and kill alone in its bounding set, no inheritable capability, no group of root's): any other start stops it
//   whatever the variable says, and the image sets the variable itself (the Dockerfile), so a start as root alone is
//   refused twice over (the audit's A6: before, a start as plain root, by `docker run` or a configuration without
//   fly.toml's worker command, prepared strangers' photos as root). And a photo's process is never started without its
//   user in the worker's mode or in the image (./image-process.ts, NoPhotoUser): in the worker's mode it would have
//   real uid 0 and keep setuid in its permitted set, so code that took over a decoder could take effective uid 0 back.
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
//   #118's review: a leftover took the sweep over that way, and read the next photo). The sweep's `/proc` files are its
//   user's, so a leftover may also write its scheduling group's priority (`/proc/<pid>/autogroup`): the sweep starts
//   in a session of its own, so that group is its own, not the worker's (round 2 of the review: a leftover had set the
//   worker's to the lowest). A leftover that stops, kills or starves the sweep, or leaves more than it can remove within
//   SWEEP_SECONDS, keeps it from exiting 0 in time, and the worker stops: its Machine restarts (fly.toml's `[[restart]]` policy `on-failure`), and every process on it
//   ends with it. The photo in hand comes back once its lease has passed, its attempt counted, at
//   most five times (./outbox.ts). Photos are prepared one at a time, so no other photo's process is alive then.
// - What the sweep leaves. Once no process of the photo's user is left, the sweep removes what that user left in
//   memory or on disk where it may write: its files and folders in /tmp, /var/tmp, /dev/shm, /dev/mqueue and
//   /run/lock, and its System V shared memory, semaphores and message queues (with `ipcrm`). Left there, they would
//   hold the Machine's memory, and every later photo would be refused for its size (PR #118's review). The files are
//   removed by `find`, `chmod` and `rm`, which take a name as its bytes and a tree of any depth, so neither a name
//   that isn't UTF-8 nor a path longer than Linux's limit can keep one (round 2 of the review). Anything of the user's
//   still there after, or an `ipcrm` that fails, is exit status 3, and the worker stops, saying so: every process of
//   the user has ended by then, and its Machine's restart takes what is left.
// - At its start, before it claims a photo, the worker sweeps once, so nothing a photo left before a restart can wait
//   for the next one, whether or not the Machine's restart ended it (./start.ts).

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

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
 * until no thread of any process of that user is left but as a zombie: finding none (`ESRCH`) is the usual case, as
 * the photo's process group was killed already, and a process whose first thread has ended while others run shows as
 * a zombie, so each thread is read (/proc/<pid>/task). Then what the user left: in each folder where the user owns an
 * entry (names read as bytes), every folder of the user's made writable to it throughout (`chmod -R`, as the user may
 * have made them read-only; what it can't change is passed over), then every entry of the user's removed (`rm -rf`),
 * and the folder read again: an entry of the user's still there throws. A folder that isn't there, or can't be read,
 * is passed over. Then each System V object the user owns or made, by its id, from /proc/sysvipc, with `ipcrm`, 500 at
 * a time, so that no call nears Linux's limit on a program's arguments (the first program's single call failed with
 * tens of thousands, in Node's `execFileSync`); an `ipcrm` that fails throws. Anything
 * thrown once no process of the user is left is exit status 3 (what the user left wasn't all removed); before, it is 1.
 */
export const SWEEP_PROGRAM = [
  "if (process.getuid() === 0) process.exit(2);",
  'const fs = require("node:fs");',
  'const { spawnSync } = require("node:child_process");',
  "const uid = String(process.getuid());",
  "const self = String(process.pid);",
  "const running = (pid) => {",
  "  let tasks;",
  '  try { tasks = fs.readdirSync("/proc/" + pid + "/task"); } catch { return false; }',
  "  return tasks.some((task) => {",
  '    try { return !/^State:\\s+[ZX]/m.test(fs.readFileSync("/proc/" + pid + "/task/" + task + "/status", "latin1")); } catch { return false; }',
  "  });",
  "};",
  'const alive = () => fs.readdirSync("/proc").some((pid) => {',
  "  if (!/^\\d+$/.test(pid) || pid === self) return false;",
  "  let status;",
  '  try { status = fs.readFileSync("/proc/" + pid + "/status", "latin1"); } catch { return false; }',
  "  return /^Uid:\\s+(\\d+)/m.exec(status)?.[1] === uid && running(pid);",
  "});",
  "do {",
  '  try { process.kill(-1, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }',
  "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);",
  "} while (alive());",
  "try {",
  "const owned = (dir) => {",
  "  let names;",
  '  try { names = fs.readdirSync(dir, { encoding: "buffer" }); } catch (error) { if (error.code === "ENOENT" || error.code === "EACCES") return 0; throw error; }',
  "  return names.filter((name) => {",
  '    try { return String(fs.lstatSync(Buffer.concat([Buffer.from(dir + "/"), name])).uid) === uid; } catch (error) { if (error.code === "ENOENT") return false; throw error; }',
  "  }).length;",
  "};",
  'for (const dir of ["/tmp", "/var/tmp", "/dev/shm", "/dev/mqueue", "/run/lock"]) {',
  "  if (owned(dir) === 0) continue;",
  '  const mine = ["-xdev", "-mindepth", "1", "-maxdepth", "1", "-user", uid];',
  '  spawnSync("/usr/bin/find", [dir, ...mine, "-type", "d", "-exec", "/usr/bin/chmod", "-R", "u+rwx", "--", "{}", "+"], { stdio: "ignore" });',
  '  spawnSync("/usr/bin/find", [dir, ...mine, "-exec", "/usr/bin/rm", "-rf", "--one-file-system", "--", "{}", "+"], { stdio: "ignore" });',
  '  if (owned(dir) > 0) throw new Error("the sweep: the photo user\'s files in " + dir + " are still there");',
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
  "for (let at = 0; at < objects.length; at += 1000) {",
  '  const done = spawnSync("/usr/bin/ipcrm", objects.slice(at, at + 1000), { stdio: "ignore" });',
  '  if (done.status !== 0) throw new Error("the sweep: ipcrm failed");',
  "}",
  "} catch { process.exit(3); }",
].join("\n");

/**
 * Why the sweep failed: a user it won't sweep, a process that didn't start, an exit not 0 (or none), its time, or,
 * once every process of the user had ended, what the user left not all removed (exit status 3).
 */
export class SweepFailed extends Error {
  readonly code = "image.sweep_failed";
  readonly why: "refused" | "start" | "exit" | "time" | "left";
  constructor(why: "refused" | "start" | "exit" | "time" | "left") {
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
  setegid: (id: number) => void;
} {
  const { getuid, geteuid, getegid, seteuid, setegid } = process;
  if (
    getuid === undefined ||
    geteuid === undefined ||
    getegid === undefined ||
    seteuid === undefined ||
    setegid === undefined
  ) {
    throw new Error("worker: this platform has no user ids");
  }
  return { getuid, geteuid, getegid, seteuid, setegid };
}

/** This process's ids. */
export function idsOf(): Ids {
  const calls = posix();
  return { uid: calls.getuid(), euid: calls.geteuid(), egid: calls.getegid() };
}

/** Started as root and turned to a user and group of its own, as fly.toml starts the worker. */
export function inWorkerMode(ids: Ids): boolean {
  return ids.uid === 0 && ids.euid !== 0 && ids.egid !== 0;
}

/**
 * The file the Dockerfile writes, which says this is Tadayo's image: no setting can take it away, as one could take
 * away NODE_ENV (round 3 of PR #118's review).
 */
export const IMAGE_MARKER = "/etc/tadayo-built-image";

/** In the image: NODE_ENV is the image's `production`, or the image's marker is there (IMAGE_MARKER). */
export function inImage(
  env: Readonly<Record<string, string | undefined>> = process.env,
  marked: () => boolean = () => existsSync(IMAGE_MARKER),
): boolean {
  return env.NODE_ENV === "production" || marked();
}

/**
 * The bounding set fly.toml's worker command leaves (`--bounding-set=-all,+setuid,+setgid,+kill`): kill, setgid and
 * setuid, capabilities 5, 6 and 7, as /proc/self/status writes it.
 */
export const FLY_BOUNDING_SET = "00000000000000e0";

/**
 * Whether this process's /proc status is what fly.toml's worker command leaves, beyond its ids (inWorkerMode): no new
 * privileges, the bounding set FLY_BOUNDING_SET exactly, no inheritable capability, and no group of root's among its
 * groups. In the image, a worker started any other way (`setpriv --euid` alone, say, which keeps root's group, the
 * image's setuid programs and every capability in reserve) stops (round 3 of PR #118's review).
 */
export function startedAsFly(status: string): boolean {
  const groups = statusField(status, "Groups");
  return (
    statusField(status, "NoNewPrivs") === "1" &&
    statusField(status, "CapBnd") === FLY_BOUNDING_SET &&
    statusField(status, "CapInh") === "0000000000000000" &&
    groups !== undefined &&
    !groups.split(/\s+/).includes("0")
  );
}

/** One field of a /proc status, its value trimmed, or undefined when the status has no such field. */
function statusField(status: string, name: string): string | undefined {
  return new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(status)?.[1]?.trim();
}

/**
 * What a refused start was found to be, for the refusal's line (photoUserFor), which is all Fly's log keeps of it: the
 * ids inWorkerMode reads and the four fields startedAsFly reads, none of them secret. A field the status doesn't have
 * is "missing", an empty one "none"; each value keeps only the digits, the letters a to f and spaces a field's value
 * is made of (anything else is "?", a tab too), cut at 64 characters with no mark of the cut (the kernel lists groups
 * in order, so a cut list still shows a 0 first). On PR #118's merge the worker was refused on Fly, where the
 * same command passes in the session and in Docker, and its line said nothing of what it had found.
 */
export function startFactsSaid(ids: Ids, status: string): string {
  const said = (name: string): string => {
    const value = statusField(status, name);
    if (value === undefined) return "missing";
    return value.replace(/[^0-9a-f ]/g, "?").slice(0, 64) || "none";
  };
  const fields = ["NoNewPrivs", "CapBnd", "CapInh", "Groups"].map((name) => `${name} ${said(name)}`);
  return [`uid ${String(ids.uid)}`, `euid ${String(ids.euid)}`, `egid ${String(ids.egid)}`, ...fields].join(", ");
}

/** What photoUserFor reads of its start besides its ids: whether the image's marker is there, and its /proc status. */
export interface StartFacts {
  readonly marked: boolean;
  readonly status: string;
}

/** This process's StartFacts. */
export function startFactsOf(): StartFacts {
  return { marked: existsSync(IMAGE_MARKER), status: readFileSync("/proc/self/status", "latin1") };
}

/** What a failed sweep may have left (SweepFailed), for the worker's stop line, its log's only clue. */
export function sweepLeft(error: unknown): string {
  return error instanceof SweepFailed && error.why === "left"
    ? "every process of a photo's user ended, but what it left couldn't all be removed"
    : "a photo's processes weren't all ended";
}

/** The worker's stop line after a sweep failed with `error` (sweepLeft). */
export const stopLineFor = (error: unknown): string =>
  `worker: ${sweepLeft(error)}, so the worker stops, and its Machine restarts without them`;

/**
 * The worker stops at once, with one line on standard error and exit status 1, which Fly restarts. For a state in
 * which preparing another photo, or running another line of the worker's code, isn't safe.
 */
export function stopWorker(line: string = stopLineFor(undefined)): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

const isId = (value: string | undefined): boolean => value !== undefined && /^\d{1,10}$/.test(value);

/** The user fly.toml's worker command names (`--groups=node`), whose effective ids the worker takes itself (turnToWorkerUser). */
export const WORKER_USER = "node";

/** An empty capability set, as /proc/self/status writes it. */
const NO_CAPABILITY = "0000000000000000";

/** The identity calls turnToWorkerUser makes, and what it reads after them: Node's and Linux's, but in the tests. */
export interface TurnCalls {
  readonly setegid: (id: number) => void;
  readonly seteuid: (id: number) => void;
  /** The /proc status of each of this process's threads (threadStatuses). */
  readonly statuses: () => readonly string[];
  /** How many threads this process has, as the kernel counts them (threadCount). */
  readonly threads: () => number;
  /** Blocks this thread for so many milliseconds (pauseFor), between two readings of the statuses. */
  readonly pause: (milliseconds: number) => void;
}

/**
 * How many times, TURN_PAUSE_MS apart, the turn reads its threads' statuses again while one isn't the worker's mode, or
 * the listing doesn't hold as many as the kernel counts (threadCount): glibc's `setegid` and `seteuid` change every
 * thread's ids but one that is ending, which leaves /proc/self/task once it has ended (glibc's `setxid_mark_thread`
 * skips a thread marked as exiting). Once a thread has returned from its work, glibc marks it so only after its own
 * destructors have run, and it runs nothing more of its own; a thread ended by `pthread_exit` or cancelled is marked
 * before its cleanup runs, which would run with the ids it had, and no such thread is there at the turn. `ci`'s first
 * run at the second commit of PR #135 found one ending, its effective group changed and its effective user not: Node's
 * thread that reads the system's root certificates, which `node:tls` starts as it is loaded, and Node loads every
 * module of its own the worker's modules name, `node:tls` among them through `postgres`, before any of theirs runs, so
 * before the turn (round 2 of the review). A thread still wrong, or a listing still short, after about a second stops
 * the worker.
 */
export const TURN_READINGS = 100;
export const TURN_PAUSE_MS = 10;

/** Blocks this thread for `milliseconds`: Atomics.wait on a value nothing changes. */
export function pauseFor(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * The /proc status of each thread of this process, from `tasks` (/proc/self/task but in the tests): glibc's `setegid`
 * and `seteuid` change every thread's ids, and turnToWorkerUser checks that they did. A thread that ends while they are
 * read (its status gone, ENOENT, or its thread, ESRCH) is left out; any other failure throws.
 */
export function threadStatuses(tasks = "/proc/self/task"): string[] {
  const statuses: string[] = [];
  for (const thread of readdirSync(tasks)) {
    try {
      statuses.push(readFileSync(`${tasks}/${thread}/status`, "latin1"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ESRCH") throw error;
    }
  }
  return statuses;
}

/** What threadCount throws for a status with no thread count. */
export const NO_THREAD_COUNT = "worker: its status has no thread count";

/**
 * How many threads this process has, from the `Threads` field of its /proc status, which the kernel keeps with the
 * list /proc/self/task reads. A listing of that folder can leave out a live thread when one ahead of it is released
 * while it is read, so the turn takes a listing only when it holds that many statuses, the count read before and after
 * it (round 2 of PR #135's review). A release during the reading lowers the count read after it, so this finds every
 * live thread while none is created during the reading; one missed could hide only behind as many created as released.
 * None is at the turn: Node starts its threads as it loads the worker's modules, before turn.ts runs (under strace, in
 * the fresh check of PR #135's fourth commit). Throws NO_THREAD_COUNT when the status has no such count.
 */
export function threadCount(status: string = readFileSync("/proc/self/status", "latin1")): number {
  const count = statusField(status, "Threads");
  if (count === undefined || !/^\d{1,7}$/.test(count)) throw new Error(NO_THREAD_COUNT);
  return Number(count);
}

/** This process's TurnCalls: Node's `setegid` and `seteuid`, threadStatuses, threadCount and pauseFor. */
export function processTurnCalls(): TurnCalls {
  const { setegid, seteuid } = posix();
  return { setegid, seteuid, statuses: threadStatuses, threads: threadCount, pause: pauseFor };
}

/** A field of a /proc status as its words (an id or a group each), or undefined when the status has no such field. */
const words = (status: string, name: string): string[] | undefined =>
  statusField(status, name)
    ?.split(/\s+/)
    .filter((word) => word !== "");

const same = (found: readonly string[] | undefined, wanted: readonly string[]): boolean =>
  found !== undefined && found.length === wanted.length && found.every((word, at) => word === wanted[at]);

/**
 * Whether a thread's /proc status is the worker's mode exactly as the turn should leave it, for WORKER_USER's `user`:
 * startedAsFly's facts still; real and saved uid and gid 0, effective (and file system) uid and gid `user`'s; `user`'s
 * group its only group; no capability effective or ambient, and setuid, setgid and kill permitted (FLY_BOUNDING_SET),
 * which Linux leaves when the effective uid leaves 0 with the real one 0, unless a start set SECBIT_NO_SETUID_FIXUP,
 * which no /proc field shows (round 1 of PR #135's review).
 */
function turnedAsFly(status: string, user: { readonly uid: number; readonly gid: number }): boolean {
  const [uid, gid] = [String(user.uid), String(user.gid)];
  return (
    startedAsFly(status) &&
    same(words(status, "Uid"), ["0", uid, "0", uid]) &&
    same(words(status, "Gid"), ["0", gid, "0", gid]) &&
    same(words(status, "Groups"), [gid]) &&
    statusField(status, "CapEff") === NO_CAPABILITY &&
    statusField(status, "CapAmb") === NO_CAPABILITY &&
    statusField(status, "CapPrm") === FLY_BOUNDING_SET
  );
}

/**
 * What a turn that failed found, for its line, which is all Fly's log keeps of it (startFactsSaid's rule: each value
 * keeps digits, the letters a to f and spaces, a tab as a space, anything else "?", cut at 64 characters).
 */
function turnFactsSaid(status: string): string {
  return ["Uid", "Gid", "Groups", "NoNewPrivs", "CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"]
    .map((name) => {
      const value = statusField(status, name);
      if (value === undefined) return `${name} missing`;
      return `${name} ${
        value
          .replace(/\t/g, " ")
          .replace(/[^0-9a-f ]/g, "?")
          .slice(0, 64) || "none"
      }`;
    })
    .join(", ");
}

/** A failed call's error code, such as EPERM, for the turn's line: nothing else of the error. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^E[A-Z0-9]{1,15}$/.test(code) ? code : "no error code";
}

/**
 * Turns a worker started as fly.toml starts it to WORKER_USER's effective group, then its effective user, its real user
 * left root: the worker's mode (inWorkerMode), which photoUserFor then reads. fly.toml's worker command leaves it root,
 * its ids all 0, with startedAsFly's facts (no new privileges, setuid, setgid and kill alone in its bounding set, no
 * inheritable capability, no group of root's), and `--groups=node` leaves WORKER_USER's group its only group, which the
 * turn requires. The worker takes the two effective ids here, at its first statement (./turn.ts). `setpriv --euid
 * --egid` can't: at an exec under no new privileges, a kernel without "security/commoncap: don't assume "setid" if all
 * ids are identical" (Linux 6.17) takes an effective id other than the real one for a set-id program's and puts it back
 * to the real one, root's, which is how PR #132's start on Fly found the worker ("uid 0, euid 0, egid 0"), while this
 * session's kernel and Docker's keep it (docs/plans/api-b2-worker-turn.md section 0). As the effective uid leaves 0,
 * Linux empties the effective set and keeps setuid, setgid and kill in the permitted one (the real uid is 0), and the
 * turn reads every thread's status after it to check that it is so (turnedAsFly), and reads them again while one isn't,
 * as a thread that is ending keeps its ids until it has gone, or while the listing holds fewer than the kernel's count
 * of threads, before it and after (threadCount; TURN_READINGS). Any other start is left as it is, for photoUserFor to
 * judge, and /etc/passwd isn't read for it, but in the image one already in the worker's mode (below). Returns whether
 * it turned. Throws, having changed nothing, when /etc/passwd can't be read or WORKER_USER isn't a user in it with an
 * id and group of its own, neither root's, or when its groups aren't that group alone; and throws, saying the failed
 * call's error code or what it found, when a call fails, or a thread is still not as turnedAsFly says, or the listing
 * still short, at the last reading. In the image (inImage), it also throws for a start already in the worker's mode, as
 * `setpriv --euid --egid` leaves it on a kernel that keeps them: it would pass photoUserFor's check without the turn's
 * (turnedAsFly's capabilities among them; round 2 of PR #135's review). Each line is the worker's own, with no error's
 * words (T52). Its arguments are this process's but in the tests.
 */
export function turnToWorkerUser(
  ids: Ids = idsOf(),
  status: string = readFileSync("/proc/self/status", "latin1"),
  passwd: () => string = () => readFileSync("/etc/passwd", "utf8"),
  calls: TurnCalls = processTurnCalls(),
  image: () => boolean = () => inImage(),
): boolean {
  if (inWorkerMode(ids) && image()) {
    throw new Error(
      `worker: in production it starts as root, as fly.toml's worker command leaves it, and takes ${WORKER_USER}'s effective group and user itself, never started with them (it found ${startFactsSaid(ids, status)})`,
    );
  }
  if (!(ids.uid === 0 && ids.euid === 0 && ids.egid === 0 && startedAsFly(status))) return false;
  let users: string;
  try {
    users = passwd();
  } catch {
    throw new Error("worker: it couldn't read /etc/passwd as it started");
  }
  const entry = users
    .split("\n")
    .map((line) => line.split(":"))
    .find((fields) => fields.length === 7 && fields[0] === WORKER_USER);
  if (entry === undefined) {
    throw new Error(`worker: ${WORKER_USER}, the user fly.toml's worker command names, isn't in /etc/passwd`);
  }
  const [, , uid, gid] = entry;
  if (!isId(uid) || !isId(gid)) {
    throw new Error(`worker: ${WORKER_USER}'s entry in /etc/passwd isn't a user's id and group`);
  }
  const user = { uid: Number(uid), gid: Number(gid) };
  if (user.uid === 0 || user.gid === 0) throw new Error(`worker: ${WORKER_USER} is root, or in root's group`);
  if (!same(words(status, "Groups"), [String(user.gid)])) {
    throw new Error(
      `worker: its groups aren't ${WORKER_USER}'s group alone, as fly.toml's worker command leaves them (it found ${turnFactsSaid(status)})`,
    );
  }
  const failed = `worker: it couldn't take ${WORKER_USER}'s effective group and user as it started`;
  for (const [name, call, id] of [
    ["setegid", calls.setegid, user.gid],
    ["seteuid", calls.seteuid, user.uid],
  ] as const) {
    try {
      call(id);
    } catch (error) {
      throw new Error(`${failed} (${name} failed: ${errorCode(error)})`, { cause: error });
    }
  }
  for (let reading = 1; ; reading += 1) {
    let statuses: readonly string[];
    let counts: readonly number[];
    try {
      const before = calls.threads();
      statuses = calls.statuses();
      counts = [before, calls.threads()];
    } catch (error) {
      const said =
        error instanceof Error && error.message === NO_THREAD_COUNT
          ? "its status had no thread count"
          : `its threads' status couldn't be read: ${errorCode(error)}`;
      throw new Error(`${failed} (${said})`, { cause: error });
    }
    if (statuses.length === 0) throw new Error(`${failed} (it found no thread's status)`);
    const wrong = statuses.find((each) => !turnedAsFly(each, user));
    const whole = counts.every((count) => count === statuses.length);
    if (wrong === undefined && whole) return true;
    if (reading === TURN_READINGS) {
      throw new Error(
        wrong === undefined
          ? `${failed} (it read ${String(statuses.length)} threads' statuses where the process had ${counts.map(String).join(", then ")} threads)`
          : `${failed} (it found ${turnFactsSaid(wrong)})`,
      );
    }
    calls.pause(TURN_PAUSE_MS);
  }
}

/**
 * The worker's first act (./turn.ts): the turn (turnToWorkerUser), or, when it throws, the worker stopped (stopWorker)
 * with the turn's own line, or with this fixed line for any other error (a read of /proc/self/status that failed, say),
 * never an error's words (T52). Its arguments are the worker's own but in the tests.
 */
export function turnOrStop(turn: () => unknown = turnToWorkerUser, stop: (line: string) => void = stopWorker): void {
  try {
    turn();
  } catch (error) {
    stop(
      error instanceof Error && error.message.startsWith("worker: ")
        ? error.message
        : "worker: it couldn't take its own user as it started",
    );
  }
}

/**
 * The user each photo's process runs as, or undefined when photos are prepared in the worker's own user (the rules
 * above). Throws, stopping the worker as it starts, when only one half is there, or when the variable names no user,
 * or root, root's group, or the worker's own user or group. In the image (inImage: `NODE_ENV=production`, or the
 * Dockerfile's marker), there is always a user: any start but fly.toml's worker command (its ids, and startedAsFly)
 * throws first, before the variable is looked at, so neither a start as root alone (`docker run`, `fly machine run`, a
 * configuration without fly.toml's worker command) nor one as a user alone ever prepares a photo outside a user of its
 * own (the audit's A6). `facts` is startFactsOf but in the tests.
 */
export function photoUserFor(
  env: Readonly<Record<string, string | undefined>>,
  ids: Ids = idsOf(),
  passwd: () => string = () => readFileSync("/etc/passwd", "utf8"),
  facts: () => StartFacts = startFactsOf,
): PhotoUser | undefined {
  const name = env.TADAYO_PHOTO_USER;
  const named = name !== undefined && name !== "";
  const started = inWorkerMode(ids);
  const { marked, status } = facts();
  if (inImage(env, () => marked) && !(started && startedAsFly(status))) {
    throw new Error(
      `worker: in production it starts only as fly.toml's worker command starts it, root turned to its own user, never as root alone or as one user alone (it found ${startFactsSaid(ids, status)})`,
    );
  }
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
 * may have killed the sweep before it ran. It starts in a session of its own (`detached`), so in a scheduling group of
 * its own (the rules above). It refuses, starting nothing, root, root's group, and the worker's own
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
          detached: true,
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
      else reject(new SweepFailed(code === 3 ? "left" : "exit"));
    });
  });
}
