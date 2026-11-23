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
// - A child that dies otherwise once it holds the photo (a decoder's crash, an allocation refused) refuses it as
//   unreadable. A child that ends before it is ready for the photo, whose code throws or whose answer is malformed
//   is a failure, tried again by the outbox: it says nothing about the photo.
// - The child gets no environment, so none of the worker's secrets (T56) is in the process that parses a stranger's
//   bytes, and no output, so nothing it writes reaches the worker's log (T52). It is given the declared type and the
//   decode's limit as its arguments, and the photo's bytes on its standard input, which the worker writes without a
//   copy; its answer comes back over Node's channel.

import { fork } from "node:child_process";
import { readFileSync } from "node:fs";
import type { UploadContentType, UploadRejection } from "@tadayo/domain";
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

const KINDS = new Set(["full", "display"]);

/** The child's answer has the shape the worker records, whatever a child parsing a stranger's bytes sent. */
function wellFormed(prepared: unknown): prepared is SentPrepared {
  if (typeof prepared !== "object" || prepared === null) return false;
  const { ok, rejection, renditions } = prepared as Record<string, unknown>;
  if (ok === false) return typeof rejection === "string";
  return (
    ok === true &&
    Array.isArray(renditions) &&
    renditions.every((rendition: unknown) => {
      if (typeof rendition !== "object" || rendition === null) return false;
      const { kind, bytes, width, height } = rendition as Record<string, unknown>;
      return (
        typeof kind === "string" &&
        KINDS.has(kind) &&
        bytes instanceof Uint8Array &&
        typeof width === "number" &&
        typeof height === "number" &&
        Number.isInteger(width) &&
        Number.isInteger(height) &&
        width >= 1 &&
        height >= 1
      );
    })
  );
}

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
  return { prepared: { ok: false, rejection: "unreadable" }, peakBytes };
}

/**
 * prepareImage on `bytes` in a child process (the rules above). `seconds` is each decode's limit, `deadlineSeconds`
 * the child's and `peakBytes` its memory's; the tests make them small.
 */
export function prepareIsolated(
  bytes: Uint8Array,
  declared: UploadContentType,
  limits: { readonly seconds?: number; readonly deadlineSeconds?: number; readonly peakBytes?: number } = {},
): Promise<ProcessAnswer> {
  const seconds = limits.seconds ?? DECODE_SECONDS;
  const mostBytes = limits.peakBytes ?? PEAK_BYTES;
  return new Promise((resolve, reject) => {
    const child = fork(CHILD, [declared, String(seconds)], {
      env: {},
      execArgv: [],
      serialization: "advanced",
      stdio: ["pipe", "ignore", "ignore", "ipc"],
    });
    // A child that ends before it has read everything closes the pipe under the write: its end says why.
    child.stdin?.on("error", () => undefined);
    let ready = false;
    let killed: "memory" | "time" | undefined;
    let answer: ChildMessage | undefined;
    let seen = 0;
    const kill = (why: "memory" | "time") => {
      if (killed !== undefined || answer !== undefined) return;
      killed = why;
      child.kill("SIGKILL");
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
    child.on("message", (message: ChildMessage) => {
      if (message.kind === "ready" && !ready) {
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
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      settle(null, true);
    });
    // `close` comes once the process has ended and its channel has closed, so after its last message.
    child.on("close", (_code, signal) => {
      settle(signal, false);
    });
  });
}
