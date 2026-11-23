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
//   (`oom_score_adj` 1000), should the Machine run out between two reads.
// - Past its deadline, the child is killed and ImageTimeout thrown, as for a decode's own timeout, which libjpeg can
//   outlast: it takes in every scan of a progressive JPEG in one step.
// - A child that crashes once it holds the photo (a decoder that met what it couldn't read) refuses it as unreadable.
//   A child that ends before it is ready for the photo, that ends of its own accord or by another signal without
//   answering, whose code throws or whose answer isn't one the worker can record is a failure, tried again by the
//   outbox: it says nothing about the photo.
// - The worker reads only the child's own kinds of message, kills the child's process group (it is forked
//   `detached`), settles a child's end GRACE_MS after it ended even if something else holds its channel open, and
//   then closes its own ends of the child's pipes (PR #111's round 4, R4-3): each a child whose decoder a stranger's
//   bytes took over.
// - The child gets no environment and no output, so nothing it writes reaches the worker's log (T52). It is given the
//   declared type and the decode's limit as its arguments, and the photo's bytes on its standard input, which the
//   worker writes without a copy; its answer comes back over Node's channel.
// - What code that took over a decoder can still do (R4-2, and the fifth commit's check; the fix is its own PR:
//   docs/LIMITATIONS.md, 2026-11-23): it runs as the worker's user, so it can read the worker's environment from /proc;
//   on the channel, a frame that isn't Node's serialization ends the worker, and one that declares a huge length makes
//   the worker buffer it, up to 4 GiB, unwatched; a process it starts in a session of its own is outside the group the
//   worker kills, and if it holds the channel mid-frame, Node keeps reading it after the child's end has settled.

import { fork } from "node:child_process";
import { readFileSync } from "node:fs";
import type { UploadContentType } from "@tadayo/domain";
import { UPLOAD_REJECTIONS, type UploadRejection } from "@tadayo/domain/limits";
import type { Prepared, Rendition } from "./image.ts";

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
 * How long the worker waits, once the child has ended or been killed, for its channel to close. Its last message is
 * written before it exits, so the channel closes within milliseconds unless another process holds it open.
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

/** prepareImage's answer as it comes over the channel, a rendition's bytes a Uint8Array. */
export type SentPrepared =
  | { readonly ok: false; readonly rejection: UploadRejection }
  | {
      readonly ok: true;
      readonly renditions: readonly (Omit<Rendition, "bytes"> & { readonly bytes: Uint8Array })[];
    };

/** What the child sends the worker. */
export type ChildMessage =
  | { readonly kind: "ready" }
  | {
      readonly kind: "prepared";
      readonly prepared: SentPrepared;
      readonly peakBytes: number;
      /** Its `oom_score_adj` as it read it back, or undefined if it couldn't. */
      readonly oomScoreAdj: number | undefined;
      /** How many variables its environment has. */
      readonly environment: number;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "failed" };

/** prepareImage's answer from the child, and the child's peak resident memory. */
export interface ProcessAnswer {
  readonly prepared: Prepared;
  readonly peakBytes: number;
  /** What the child said of itself, for the tests. */
  readonly oomScoreAdj?: number | undefined;
  readonly environment?: number;
}

/** How a child ended, as the worker saw it. */
export interface ChildEnd {
  /** It said it was ready for the photo, and was given it. */
  readonly ready: boolean;
  /** Why the worker killed it, if it did. */
  readonly killed?: "memory" | "time";
  /** Its last message after `ready`, if any. */
  readonly answer?: ChildMessage;
  readonly signal: NodeJS.Signals | null;
  /** The highest peak the worker read or the child reported. */
  readonly peakBytes: number;
  readonly mostBytes: number;
}

/** One rendition of `kind`: a JPEG's first bytes, and a size inside its box. */
function wellFormedRendition(rendition: unknown, kind: RenditionKind): boolean {
  if (typeof rendition !== "object" || rendition === null) return false;
  const { kind: its, bytes, width, height } = rendition as Record<string, unknown>;
  const box = RENDITION_BOXES[kind];
  return (
    its === kind &&
    bytes instanceof Uint8Array &&
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= box.width &&
    height <= box.height
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

/** A message from the child, if it is one of the kinds it sends; anything else is ignored. */
function messageOf(message: unknown): ChildMessage | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const { kind } = message as Record<string, unknown>;
  return kind === "ready" || kind === "prepared" || kind === "timeout" || kind === "failed"
    ? (message as ChildMessage)
    : undefined;
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
 * prepareImage on `bytes` in a child process (the rules above). `seconds` is each decode's limit, `deadlineSeconds`
 * the child's and `peakBytes` its memory's; the tests make them small, and give a `child` module of their own to
 * play a child that misbehaves.
 */
export function prepareIsolated(
  bytes: Uint8Array,
  declared: UploadContentType,
  limits: {
    readonly seconds?: number;
    readonly deadlineSeconds?: number;
    readonly peakBytes?: number;
    readonly child?: URL;
  } = {},
): Promise<ProcessAnswer> {
  const seconds = limits.seconds ?? DECODE_SECONDS;
  const mostBytes = limits.peakBytes ?? PEAK_BYTES;
  return new Promise((resolve, reject) => {
    // `detached`: the child leads a process group of its own, so that killing the group ends what it started in that
    // group (a process it starts in a session of its own escapes it: the header).
    const child = fork(limits.child ?? CHILD, [declared, String(seconds)], {
      env: {},
      execArgv: [],
      serialization: "advanced",
      stdio: ["pipe", "ignore", "ignore", "ipc"],
      detached: true,
    });
    // A child that ends before it has read everything closes the pipe under the write: its end says why.
    child.stdin?.on("error", () => undefined);
    let ready = false;
    let killed: "memory" | "time" | undefined;
    let answer: ChildMessage | undefined;
    let seen = 0;
    const killGroup = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The group has ended.
      }
    };
    let grace: NodeJS.Timeout | undefined;
    // Once the child has ended or been killed, its end is settled when its channel closes, or after GRACE_MS if
    // something else holds the channel open: a process the child started, which the group's kill ends.
    const allowGrace = () => {
      grace ??= setTimeout(() => {
        settle(child.signalCode, false);
      }, GRACE_MS);
    };
    // A child that has answered keeps its answer, but is ended all the same: it may never exit of itself.
    const kill = (why: "memory" | "time") => {
      if (killed === undefined && answer === undefined) killed = why;
      killGroup();
      allowGrace();
    };
    const look = () => {
      if (child.pid === undefined) return;
      const peak = peakOf(child.pid);
      if (peak === undefined) return;
      seen = Math.max(seen, peak);
      if (peak > mostBytes) kill("memory");
    };
    const watch = setInterval(look, WATCH_MS);
    const deadline = setTimeout(
      () => {
        kill("time");
      },
      (limits.deadlineSeconds ?? DEADLINE_SECONDS) * 1000,
    );
    // A message that isn't one of the child's kinds, a second `ready` and anything after the answer are ignored.
    child.on("message", (sent: unknown) => {
      const message = messageOf(sent);
      if (message === undefined) return;
      if (message.kind === "ready") {
        if (ready) return;
        ready = true;
        child.stdin?.end(bytes);
      } else if (ready && answer === undefined) {
        answer = message;
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
      if (child.connected) child.disconnect();
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
    // A child that can't be started gives `error` and may never give `exit`.
    child.on("error", () => {
      settle(null, true);
    });
    child.on("exit", allowGrace);
    // `close` comes once the process has ended and its channel has closed, so after its last message.
    child.on("close", (_code, signal) => {
      settle(signal, false);
    });
  });
}
