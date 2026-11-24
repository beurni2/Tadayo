// Each photo's checks and renditions in a process of its own, which the worker watches and ends
// (docs/plans/api-b2-spike-prepare.md section 3.6; FQ138; PR #111's third review). Three reviews each found a hold no
// header shows: a PNG's compressed text, inflated as its header is read; a lossless WebP's Huffman tables; a WebP of
// millions of chunks. And a long-lived process keeps much of what its allocator freed, so photos within every check
// grow it photo by photo. So the worker never decodes a photo itself:
// - The child (./image-child.ts) runs prepareImage (./image.ts) on the one photo it is sent, answers and exits, and
//   whatever it held goes back to the system with it.
// - The worker reads the child's peak resident memory (Linux's `VmHWM`, which only rises) every 10 ms, and past
//   PEAK_BYTES kills it with SIGKILL: the photo is refused as too_many_pixels, the code FQ138 gives a photo the
//   worker can't hold. A child that reports a peak past it is refused the same way, as is one that SIGKILL ends
//   though the worker didn't send it: the child asks to go first to the kernel's out-of-memory killer
//   (`oom_score_adj` 1000), should the Machine run out between two reads. A child whose code a stranger's bytes took
//   over may set it back to 0 and hold memory outside its resident set (System V shared memory, /dev/shm), so the
//   kernel may take the worker instead, which restarts (PR #118's round 2; docs/LIMITATIONS.md).
// - Past its deadline, the child is killed and ImageTimeout thrown, as for a decode's own timeout, which libjpeg can
//   outlast: it takes in every scan of a progressive JPEG in one step.
// - A child that crashes once it holds the photo (a decoder that met what it couldn't read) refuses it as unreadable.
//   A child that ends before it is ready for the photo, that ends of its own accord or by another signal without
//   answering, whose code throws or whose answer isn't one the worker can record is a failure, tried again by the
//   outbox: it says nothing about the photo.
// - The child's messages come on a pipe of the worker's own, its fd 3, not Node's channel (./image-frames.ts;
//   docs/plans/api-b2-worker-hardening.md section 1): `ready`, then one answer, each length checked against a cap
//   before the worker keeps a byte of it. Anything else is a broken answer: the worker reads no more, kills the child
//   and fails the photo, tried again by the outbox. Once the answer is in, the worker reads no more and kills the
//   child's process group (it is started `detached`) all the same: it may never exit of itself.
// - The worker settles a child's end GRACE_MS after it ended even if something else holds one of its pipes open, and
//   then closes its own ends of both (PR #111's round 4, R4-3; C5-2), so a process the child started that holds one
//   mid-message is read no more.
// - The child gets no environment and no output, so nothing it writes reaches the worker's log (T52). It is given the
//   declared type and the decode's limit as its arguments, and the photo's bytes on its standard input, which the
//   worker writes without a copy.
// - On Fly the child runs as a user of its own, TADAYO_PHOTO_USER, not the worker's (./privileges.ts;
//   docs/plans/api-b2-worker-hardening.md section 2; ADR-038): it can't read the worker's environment or memory, open
//   its pipes or signal it, and once its end settles every process of that user is ended by the sweep, so a process
//   it started in a session of its own, outside the group the worker kills, doesn't outlive the photo. The worker
//   takes root for an instant to start it and to kill its group. Without that user (the tests, CI, the session) the
//   child runs as the worker's own, as before; in the worker's mode or in the image, never (NoPhotoUser). What it can still do:
//   docs/LIMITATIONS.md, 2026-11-23.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { UploadContentType } from "@tadayo/domain";
import { UPLOAD_REJECTIONS } from "@tadayo/domain/limits";
import { MessageReader, type ChildMessage, type SentPrepared } from "./image-frames.ts";
import type { Prepared } from "./image.ts";
import {
  asRoot,
  idsOf,
  inImage,
  inWorkerMode,
  NO_INSPECTOR,
  stopLineFor,
  stopWorker,
  sweep,
  type PhotoUser,
} from "./privileges.ts";

/** The longest one rendition's decode may take, in seconds (sharp's own timeout, in the child). */
export const DECODE_SECONDS = 60;
/** The longest the child may live: the header, both decodes at their limit, and its start. */
export const DEADLINE_SECONDS = 2 * DECODE_SECONDS + 30;
/**
 * The child's peak resident memory past which it is killed. The largest photos of each kind the checks take peak at
 * 249 to 324 MiB in the child, a 64-megapixel 16-bit PNG that streams at 303 to 304, and photos the size the app
 * sends (ADR-014) at 137 to 148 (docs/plans/api-b2-spike-prepare.md section 4.4). The worker holds 96 MiB with
 * nothing to do, and rose by up to 92 more over many photos (bytes V8 collects lazily, memory its allocator keeps),
 * so a child near this cap can take the Machine past its 512 MB (488 MiB): then the kernel kills the child, which
 * asked to go first, and the photo is refused all the same.
 */
export const PEAK_BYTES = 352 * 1024 * 1024;
/** How often the worker reads the child's peak. */
const WATCH_MS = 10;
/**
 * How long the worker waits, once the child has ended or been killed, for its pipes to close. Its last message is
 * written before it exits, so they close within milliseconds unless another process holds one open.
 */
export const GRACE_MS = 2000;

/** A drop's photo's renditions (TECH-DESIGN section 1, "Images"): `widget` waits for widgets, `thumbnail` for B6. */
export const RENDITION_KINDS = ["full", "display"] as const;
export type RenditionKind = (typeof RENDITION_KINDS)[number];

/**
 * Each kind's box (./image.ts fits each rendition inside it, never enlarged): `display` is 1290 px wide, and never
 * taller than `full`. Here, as the worker checks the child's answer against them without loading `sharp`.
 */
export const RENDITION_BOXES: Readonly<Record<RenditionKind, { readonly width: number; readonly height: number }>> = {
  full: { width: 2560, height: 2560 },
  display: { width: 1290, height: 2560 },
};

const CHILD = new URL("./image-child.ts", import.meta.url);

/** A decode took longer than the worker allows: try again, as it says nothing about the photo. */
export class ImageTimeout extends Error {
  readonly code = "image.timeout";
  constructor() {
    super("image: a decode took too long");
    this.name = "ImageTimeout";
  }
}

/** The child failed for a reason of its own, not the photo's: try again. */
export class ImageProcessFailed extends Error {
  readonly code = "image.process_failed";
  constructor() {
    super("image: the photo's process failed");
    this.name = "ImageProcessFailed";
  }
}

/**
 * In the worker's mode or in the image (./privileges.ts, inImage), a photo's process asked for without a user of its
 * own: refused, starting nothing (the audit's A6). Started so in the worker's mode, it would have real uid 0 and keep
 * setuid in its permitted set (fly.toml's bounding set), so code that took over a decoder could take effective uid 0
 * back; in the image, every photo has its user. The worker's start never leaves it so (photoUserFor); this is the last
 * check, where the process is started. Like any failure of a photo's preparation, the outbox tries it again and, the
 * fifth time, gives the event up (./outbox.ts).
 */
export class NoPhotoUser extends Error {
  readonly code = "image.no_photo_user";
  constructor() {
    super("image: in the worker's mode, a photo's process is started only as a user of its own, and none was given");
    this.name = "NoPhotoUser";
  }
}

/** The peak resident memory of a process (`self` or a pid) in bytes, from Linux's `VmHWM`; undefined once it ended. */
export function peakOf(pid: number | "self"): number | undefined {
  let status: string;
  try {
    status = readFileSync(`/proc/${String(pid)}/status`, "latin1");
  } catch {
    return undefined;
  }
  const found = /^VmHWM:\s+(\d+) kB$/m.exec(status);
  return found === null ? undefined : Number(found[1]) * 1024;
}

/** prepareImage's answer from the child, and the child's peak resident memory. */
export interface ProcessAnswer {
  readonly prepared: Prepared;
  readonly peakBytes: number;
  /** What the child said of itself, for the tests. */
  readonly oomScoreAdj?: number | undefined;
  readonly environment?: number;
}

const UNKILLABLE_LINE =
  "worker: a photo's process group couldn't be ended, so the worker stops, and its Machine restarts without it";

/**
 * SIGKILL to the process group `pid` leads, through `privileged`. A group that has ended (ESRCH) is done. Any other
 * refusal (EPERM: the worker can't use its kill) would leave the photo's processes running past their memory or
 * deadline, so the worker stops (PR #118's review).
 */
export function killGroupOf(pid: number, privileged: <T>(fn: () => T) => T): void {
  try {
    privileged(() => process.kill(-pid, "SIGKILL"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") stopWorker(UNKILLABLE_LINE);
  }
}

/** How a child ended, as the worker saw it. */
export interface ChildEnd {
  /** It said it was ready for the photo, and was given it. */
  readonly ready: boolean;
  /** Why the worker killed it before its answer, if it did: its memory, its deadline, or a broken answer. */
  readonly killed?: "memory" | "time" | "broken";
  /** Its last message after `ready`, if any. */
  readonly answer?: ChildMessage;
  readonly signal: NodeJS.Signals | null;
  /** The highest peak the worker read or the child reported. */
  readonly peakBytes: number;
  readonly mostBytes: number;
}

/**
 * A rendition as `prepareImage` writes it, whatever a child parsing a stranger's bytes sent (PR #118's review): a
 * baseline JPEG holding its start, its quantization and Huffman tables, one frame of exactly `width` by `height`, one
 * scan, and its end as its last two bytes. So no EXIF, XMP, ICC profile, comment or thumbnail reaches a member
 * (spec 33), no progressive scans, no frame larger than its box whatever the header says, and nothing after the end.
 * A marker segment is passed over by its length, which must end inside the bytes; in the scan's entropy-coded data,
 * a 0xFF is followed by a stuffed 0x00 or a restart, else it is the end. It checks the segments, not what the tables
 * or the scan hold, which are the child's like the picture: a taken-over child can still send a rendition no decoder
 * reads, or bytes aimed at one, so renditions stay untrusted downstream (PR #118's round 2; ADR-038).
 */
export function baselineJpeg(bytes: Uint8Array, width: number, height: number): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let frames = 0;
  for (let at = 2; at + 4 <= bytes.length;) {
    const marker = bytes[at + 1] ?? 0;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (bytes[at] !== 0xff || length < 2 || at + 2 + length > bytes.length) return false;
    if (marker === 0xc0) {
      const components = bytes[at + 9] ?? 0;
      const sized =
        bytes[at + 4] === 8 &&
        (((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0)) === height &&
        (((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0)) === width;
      frames += 1;
      if (frames > 1 || !sized || (components !== 1 && components !== 3) || length !== 8 + 3 * components) {
        return false;
      }
    } else if (marker === 0xda) {
      if (frames !== 1) return false;
      for (let next = at + 2 + length; ;) {
        next = bytes.indexOf(0xff, next);
        if (next < 0 || next + 1 >= bytes.length) return false;
        const after = bytes[next + 1] ?? 0;
        if (after === 0x00 || (after >= 0xd0 && after <= 0xd7)) {
          next += 2;
          continue;
        }
        return after === 0xd9 && next + 2 === bytes.length;
      }
    } else if (marker !== 0xdb && marker !== 0xc4) {
      return false;
    }
    at += 2 + length;
  }
  return false;
}

/** One rendition of `kind`: a size inside its box, and a baseline JPEG of that size (baselineJpeg). */
function wellFormedRendition(rendition: unknown, kind: RenditionKind): boolean {
  if (typeof rendition !== "object" || rendition === null) return false;
  const { kind: its, bytes, width, height } = rendition as Record<string, unknown>;
  const box = RENDITION_BOXES[kind];
  return (
    its === kind &&
    bytes instanceof Uint8Array &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= box.width &&
    height <= box.height &&
    baselineJpeg(bytes, width, height)
  );
}

/**
 * The child's answer is one the worker can record, whatever a child parsing a stranger's bytes sent: a rejection by
 * one of its codes, or exactly one rendition of each kind (PR #111's round 4, R4-3).
 */
function wellFormed(prepared: unknown): prepared is SentPrepared {
  if (typeof prepared !== "object" || prepared === null) return false;
  const { ok, rejection, renditions } = prepared as Record<string, unknown>;
  if (ok === false) return UPLOAD_REJECTIONS.some((code) => code === rejection);
  return (
    ok === true &&
    Array.isArray(renditions) &&
    renditions.length === RENDITION_KINDS.length &&
    RENDITION_KINDS.every((kind) => renditions.filter((rendition) => wellFormedRendition(rendition, kind)).length === 1)
  );
}

/** The signals a process crashes by: a decoder that met what it couldn't read. */
const CRASHES: ReadonlySet<NodeJS.Signals> = new Set(["SIGSEGV", "SIGBUS", "SIGABRT", "SIGILL", "SIGFPE"]);

/** The answer a child's end comes to (the rules above): a preparation, or ImageTimeout or ImageProcessFailed thrown. */
export function outcomeOf(end: ChildEnd): ProcessAnswer {
  if (end.killed === "time") throw new ImageTimeout();
  const { peakBytes } = end;
  if (end.killed === "memory" || peakBytes > end.mostBytes) {
    return { prepared: { ok: false, rejection: "too_many_pixels" }, peakBytes };
  }
  if (end.killed === "broken") throw new ImageProcessFailed();
  const { answer } = end;
  if (answer?.kind === "prepared") {
    if (!wellFormed(answer.prepared)) throw new ImageProcessFailed();
    const prepared: Prepared = answer.prepared.ok
      ? {
          ok: true,
          renditions: answer.prepared.renditions.map((r) => ({
            ...r,
            bytes: Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength),
          })),
        }
      : answer.prepared;
    return { prepared, peakBytes, oomScoreAdj: answer.oomScoreAdj, environment: answer.environment };
  }
  if (answer?.kind === "timeout") throw new ImageTimeout();
  if (answer?.kind === "failed" || !end.ready) throw new ImageProcessFailed();
  if (end.signal === "SIGKILL") return { prepared: { ok: false, rejection: "too_many_pixels" }, peakBytes };
  if (end.signal !== null && CRASHES.has(end.signal))
    return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };
  throw new ImageProcessFailed();
}

/**
 * prepareImage on `bytes` in a child process (the rules above), as `user` when the worker has one for photos
 * (./privileges.ts), else as the worker's own user; in the worker's mode or in the image, without `user`, it rejects
 * with NoPhotoUser and starts nothing. `seconds` is each decode's limit, `deadlineSeconds` the child's,
 * `peakBytes` its memory's and `sweepSeconds` the sweep's; the tests make them small, and give a `child` module of
 * their own to play a child that misbehaves.
 */
export function prepareIsolated(
  bytes: Uint8Array,
  declared: UploadContentType,
  limits: {
    readonly seconds?: number;
    readonly deadlineSeconds?: number;
    readonly peakBytes?: number;
    readonly child?: URL;
    readonly user?: PhotoUser | undefined;
    readonly sweepSeconds?: number;
  } = {},
): Promise<ProcessAnswer> {
  const seconds = limits.seconds ?? DECODE_SECONDS;
  const mostBytes = limits.peakBytes ?? PEAK_BYTES;
  const { user } = limits;
  if (user === undefined && (inWorkerMode(idsOf()) || inImage())) return Promise.reject(new NoPhotoUser());
  // As the photo's user, the start and the kill need the worker's root for an instant: the child's user isn't its own.
  const privileged = <T>(fn: () => T): T => (user === undefined ? fn() : asRoot(fn));
  return new Promise((resolve, reject) => {
    // `detached`: the child leads a process group of its own, so that killing the group ends what it started in that
    // group (a process it starts in a session of its own escapes it, which the sweep ends: ./privileges.ts). Its fd 3
    // is the worker's pipe for its messages (./image-frames.ts), and its environment is empty: no Node channel, no
    // variable at all. Node's inspector is off (NO_INSPECTOR), so no process of the photo's user can open it with
    // SIGUSR1.
    let child: ReturnType<typeof spawn>;
    try {
      child = privileged(() =>
        spawn(process.execPath, [NO_INSPECTOR, fileURLToPath(limits.child ?? CHILD), declared, String(seconds)], {
          env: {},
          stdio: ["pipe", "ignore", "ignore", "pipe"],
          detached: true,
          ...(user === undefined ? {} : { uid: user.uid, gid: user.gid }),
        }),
      );
    } catch {
      // A start Node refuses at once (a child it couldn't make) ran nothing of the photo's.
      reject(new ImageProcessFailed());
      return;
    }
    const answers = child.stdio[3] as Readable | null;
    // A child that ends before it has read everything closes the pipe under the write: its end says why.
    child.stdin?.on("error", () => undefined);
    answers?.on("error", () => undefined);
    let ready = false;
    let killed: "memory" | "time" | "broken" | undefined;
    let answer: ChildMessage | undefined;
    let seen = 0;
    const killGroup = () => {
      const { pid } = child;
      if (pid === undefined) return;
      // As the photo's user, once the child is reaped its number may be another group's when its own group is empty,
      // and the kill is root's: what is left of its group is the sweep's (./privileges.ts).
      if (user !== undefined && (child.exitCode !== null || child.signalCode !== null)) return;
      killGroupOf(pid, privileged);
    };
    let grace: NodeJS.Timeout | undefined;
    // Once the child has ended or been killed, its end is settled when its pipes close, or after GRACE_MS if
    // something else holds one open: a process the child started, which the group's kill ends unless it left the
    // group.
    const allowGrace = () => {
      grace ??= setTimeout(() => {
        settle(child.signalCode, false);
      }, GRACE_MS);
    };
    // The worker reads nothing more from the child once its answer is in, or once what it sent broke the order or a
    // cap, and ends it: a child that answered keeps its answer, and one that may never exit of itself is ended all the
    // same.
    const end = (why?: "memory" | "time" | "broken") => {
      if (why !== undefined && killed === undefined && answer === undefined) killed = why;
      if (why === "broken" || answer !== undefined) answers?.destroy();
      killGroup();
      allowGrace();
    };
    const look = () => {
      if (child.pid === undefined) return;
      const peak = peakOf(child.pid);
      if (peak === undefined) return;
      seen = Math.max(seen, peak);
      if (peak > mostBytes) end("memory");
    };
    const watch = setInterval(look, WATCH_MS);
    const deadline = setTimeout(
      () => {
        end("time");
      },
      (limits.deadlineSeconds ?? DEADLINE_SECONDS) * 1000,
    );
    // `ready`, then the answer: the reader refuses anything else, and reads nothing after the answer.
    const reader = new MessageReader();
    answers?.on("data", (chunk: Buffer) => {
      let messages: ChildMessage[];
      try {
        messages = reader.push(chunk);
      } catch {
        end("broken");
        return;
      }
      for (const message of messages) {
        if (message.kind === "ready") {
          ready = true;
          child.stdin?.end(bytes);
        } else {
          answer = message;
          end();
        }
      }
    });
    let settled = false;
    const settle = (signal: NodeJS.Signals | null, failed: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      clearTimeout(deadline);
      clearTimeout(grace);
      killGroup();
      child.stdin?.destroy();
      answers?.destroy();
      const finish = () => {
        if (failed) {
          reject(new ImageProcessFailed());
          return;
        }
        const reported = answer?.kind === "prepared" ? answer.peakBytes : 0;
        try {
          resolve(
            outcomeOf({
              ready,
              ...(killed === undefined ? {} : { killed }),
              ...(answer === undefined ? {} : { answer }),
              signal,
              peakBytes: Math.max(seen, typeof reported === "number" ? reported : 0),
              mostBytes,
            }),
          );
        } catch (error) {
          reject(error instanceof Error ? error : new ImageProcessFailed());
        }
      };
      // As the photo's user, its end settles once every process of that user has been ended; a sweep that failed may
      // have left one alive, so the worker stops rather than prepare another photo beside it (./privileges.ts).
      if (user === undefined) finish();
      else
        sweep(user, limits.sweepSeconds).then(finish, (error: unknown) => {
          stopWorker(stopLineFor(error));
        });
    };
    // A child that can't be started gives `error` and may never give `exit`.
    child.on("error", () => {
      settle(null, true);
    });
    child.on("exit", allowGrace);
    // `close` comes once the process has ended and its pipes have closed, so after its last message.
    child.on("close", (_code, signal) => {
      settle(signal, false);
    });
  });
}
