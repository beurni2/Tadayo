// The messages a photo's process sends the worker on a pipe of the worker's own (docs/plans/api-b2-worker-hardening.md
// section 1; ./image-process.ts starts the process, ./image-child.ts is it). Not Node's channel: Node reads that
// outside any code of the worker's, so a frame that isn't its serialization ended the worker, and one that declared a
// huge length was buffered whole, up to 4 GiB (PR #111's round 4, R4-3; the check of its fifth commit, C5-1).
//
// A message is a 4-byte big-endian length, then that many bytes of a JSON object (its header), then the bytes the
// header names: a prepared answer's renditions, listed in its header as `{ kind, width, height, length }`, their bytes
// following in that order. No other message carries bytes. The header is at most HEADER_BYTES and a whole message at
// most MESSAGE_BYTES. JSON over at most 4 KiB, and bytes copied as they are, build nothing a frame can make large, as
// `v8.deserialize` would (it builds whatever objects a frame describes).
//
// The process sends `ready`, then exactly one answer: `prepared`, `timeout` or `failed`. The reader takes them in that
// order and nothing else: anything off it is a BrokenAnswer, and the worker stops reading at once. It holds at most one
// message, checks every length before it keeps any bytes for it, and reads nothing after the answer.

import type { UploadRejection } from "@tadayo/domain/limits";
import type { Rendition } from "./image.ts";

/** The longest a message's header may be, in bytes. */
export const HEADER_BYTES = 4 * 1024;
/**
 * The longest a whole message may be, in bytes. The largest renditions ./image.ts can make, of noise at quality 80,
 * are 3.97 MiB (`full`, 2560 by 2560) and 2.01 MiB (`display`, 1290 by 2560), measured in the session.
 */
export const MESSAGE_BYTES = 32 * 1024 * 1024;
/** The length's own bytes. */
const LENGTH_BYTES = 4;
/** How many renditions an answer may carry: one of each kind (./image-process.ts checks which). */
const MOST_RENDITIONS = 2;

/** prepareImage's answer as it comes over the pipe, a rendition's bytes a Uint8Array. */
export type SentPrepared =
  | { readonly ok: false; readonly rejection: UploadRejection }
  | {
      readonly ok: true;
      readonly renditions: readonly (Omit<Rendition, "bytes"> & { readonly bytes: Uint8Array })[];
    };

/** What the photo's process sends the worker. */
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

/** What the process sent isn't its messages in their order: the worker reads no more, and fails the photo. */
export class BrokenAnswer extends Error {
  readonly code = "image.broken_answer";
  constructor(why: string) {
    super(`image: the photo's process sent a broken answer: ${why}`);
    this.name = "BrokenAnswer";
  }
}

/** `message` as the bytes the process writes: its length, its header, and its renditions' bytes. */
export function frameOf(message: ChildMessage): Buffer {
  let header: unknown = message;
  let bodies: readonly Uint8Array[] = [];
  if (message.kind === "prepared" && message.prepared.ok) {
    const { renditions } = message.prepared;
    header = {
      ...message,
      prepared: {
        ok: true,
        renditions: renditions.map(({ bytes, ...rest }) => ({ ...rest, length: bytes.byteLength })),
      },
    };
    bodies = renditions.map((rendition) => rendition.bytes);
  }
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt32BE(json.length);
  return Buffer.concat([length, json, ...bodies]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The lengths of the bytes a header names, checked against what is left of the message, or BrokenAnswer thrown. */
function bodiesOf(header: Record<string, unknown>, left: number): number[] {
  const { kind } = header;
  if (kind === "ready" || kind === "timeout" || kind === "failed") return [];
  if (kind !== "prepared" || !isRecord(header.prepared)) throw new BrokenAnswer("a header of no known kind");
  if (header.prepared.ok !== true) return [];
  const { renditions } = header.prepared;
  if (!Array.isArray(renditions) || renditions.length > MOST_RENDITIONS) {
    throw new BrokenAnswer("renditions that aren't a list of at most two");
  }
  const lengths = renditions.map((rendition: unknown) => {
    const length = isRecord(rendition) ? rendition.length : undefined;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
      throw new BrokenAnswer("a rendition without a length");
    }
    return length;
  });
  if (lengths.reduce((sum, length) => sum + length, 0) > left)
    throw new BrokenAnswer("renditions past the message's cap");
  return lengths;
}

/** The message a header and its bytes make: each rendition's `length` replaced by its bytes. */
function messageOf(header: Record<string, unknown>, bodies: readonly Buffer[]): ChildMessage {
  if (header.kind !== "prepared" || !isRecord(header.prepared) || header.prepared.ok !== true) {
    return header as ChildMessage;
  }
  const renditions = (header.prepared.renditions as readonly Record<string, unknown>[]).map((rendition, i) => {
    const sent: Record<string, unknown> = { ...rendition, bytes: bodies[i] };
    delete sent.length;
    return sent;
  });
  return { ...header, prepared: { ...header.prepared, renditions } } as unknown as ChildMessage;
}

/**
 * Reads the process's messages from its pipe, chunk by chunk as they come: `ready`, then its answer. `push` returns the
 * messages a chunk completes, and throws BrokenAnswer at the first byte that breaks the order or a cap; once the answer
 * is read it reads nothing more. Each part of a message (its length, its header, its renditions' bytes) is copied into
 * a buffer of its own checked size as it comes, so the reader holds no more than the message's caps allow.
 */
export class MessageReader {
  /** The part being read, and the buffer it is copied into. */
  #part: "length" | "header" | "bodies" = "length";
  #into: Buffer = Buffer.alloc(LENGTH_BYTES);
  #filled = 0;
  #header: Record<string, unknown> = {};
  #lengths: readonly number[] = [];
  #seen: "nothing" | "ready" | "answer" = "nothing";
  #broken = false;

  /** The bytes the reader has kept for the message it is reading. */
  get heldBytes(): number {
    return this.#into.length;
  }

  /** Whether the answer has been read: nothing more will be. */
  get done(): boolean {
    return this.#seen === "answer";
  }

  push(chunk: Buffer): ChildMessage[] {
    if (this.#broken) throw new BrokenAnswer("bytes after a broken answer");
    const messages: ChildMessage[] = [];
    try {
      let at = 0;
      while (!this.done) {
        if (this.#filled === this.#into.length) {
          const message = this.#completed();
          if (message !== undefined) messages.push(message);
          continue;
        }
        if (at === chunk.length) break;
        const copied = chunk.copy(this.#into, this.#filled, at);
        this.#filled += copied;
        at += copied;
      }
    } catch (error) {
      this.#broken = true;
      throw error;
    } finally {
      if (this.done || this.#broken) this.#into = Buffer.alloc(0);
    }
    return messages;
  }

  /** The part just filled taken in: the next part to read, and the message when its last part is in. */
  #completed(): ChildMessage | undefined {
    const filled = this.#into;
    this.#filled = 0;
    if (this.#part === "length") {
      const bytes = filled.readUInt32BE(0);
      // A length of 0 makes an empty header, which isn't JSON.
      if (bytes > HEADER_BYTES) throw new BrokenAnswer("a header's length past its cap");
      this.#part = "header";
      this.#into = Buffer.alloc(bytes);
      return undefined;
    }
    if (this.#part === "header") {
      let header: unknown;
      try {
        header = JSON.parse(filled.toString("utf8"));
      } catch {
        throw new BrokenAnswer("a header that isn't JSON");
      }
      if (!isRecord(header)) throw new BrokenAnswer("a header that isn't an object");
      if ((header.kind === "ready") !== (this.#seen === "nothing")) throw new BrokenAnswer("a message out of order");
      this.#header = header;
      this.#lengths = bodiesOf(header, MESSAGE_BYTES - LENGTH_BYTES - filled.length);
      this.#part = "bodies";
      this.#into = Buffer.allocUnsafe(this.#lengths.reduce((sum, length) => sum + length, 0));
      return undefined;
    }
    const bodies: Buffer[] = [];
    let at = 0;
    for (const length of this.#lengths) {
      bodies.push(filled.subarray(at, at + length));
      at += length;
    }
    const message = messageOf(this.#header, bodies);
    this.#seen = this.#header.kind === "ready" ? "ready" : "answer";
    this.#part = "length";
    this.#into = Buffer.alloc(LENGTH_BYTES);
    return message;
  }
}
