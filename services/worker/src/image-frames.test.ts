// The messages a photo's process sends the worker, as bytes and back (./image-frames.ts;
// docs/plans/api-b2-worker-hardening.md section 1). No process here: the reader is given the bytes a child could
// write, whole, split byte by byte, or broken.

import { describe, expect, it } from "vitest";
import {
  BrokenAnswer,
  frameOf,
  HEADER_BYTES,
  MESSAGE_BYTES,
  MessageReader,
  type ChildMessage,
} from "./image-frames.ts";

const READY: ChildMessage = { kind: "ready" };
const PREPARED: ChildMessage = {
  kind: "prepared",
  prepared: {
    ok: true,
    renditions: [
      { kind: "full", bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), width: 2560, height: 1440 },
      { kind: "display", bytes: new Uint8Array([0xff, 0xd8, 0xff, 4]), width: 1290, height: 726 },
    ],
  },
  peakBytes: 123,
  oomScoreAdj: 1000,
  environment: 0,
};
const ANSWERS: readonly ChildMessage[] = [
  PREPARED,
  {
    kind: "prepared",
    prepared: { ok: false, rejection: "unreadable" },
    peakBytes: 5,
    oomScoreAdj: undefined,
    environment: 0,
  },
  { kind: "timeout" },
  { kind: "failed" },
];

/** A message's bytes as a child could write them: a length, then `header` as it is, then `bodies`. */
function raw(header: string | Buffer, bodies: readonly Buffer[] = [], length?: number): Buffer {
  const json = typeof header === "string" ? Buffer.from(header, "utf8") : header;
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(length ?? json.length);
  return Buffer.concat([prefix, json, ...bodies]);
}

/** Every message `bytes` makes, pushed `step` bytes at a time. */
function readAll(bytes: Buffer, step = bytes.length, reader = new MessageReader()): ChildMessage[] {
  const messages: ChildMessage[] = [];
  for (let at = 0; at < bytes.length; at += step) messages.push(...reader.push(bytes.subarray(at, at + step)));
  return messages;
}

/** The answer as a plain object, its renditions' bytes as arrays, to compare a Buffer with a Uint8Array. */
function plain(message: ChildMessage): unknown {
  if (message.kind !== "prepared" || !message.prepared.ok) return message;
  const renditions = message.prepared.renditions.map((rendition) => ({ ...rendition, bytes: [...rendition.bytes] }));
  return { ...message, prepared: { ...message.prepared, renditions } };
}

describe("a photo's process's messages", () => {
  it("come back as they were sent, ready then each kind of answer, whole or a byte at a time", () => {
    for (const answer of ANSWERS) {
      const bytes = Buffer.concat([frameOf(READY), frameOf(answer)]);
      for (const step of [bytes.length, 1, 7]) {
        const messages = readAll(bytes, step);
        expect(messages.map(plain)).toEqual([READY, answer].map(plain));
      }
    }
    const [, prepared] = readAll(Buffer.concat([frameOf(READY), frameOf(PREPARED)]));
    if (prepared?.kind !== "prepared" || !prepared.prepared.ok) throw new Error("expected renditions");
    for (const rendition of prepared.prepared.renditions) expect(Buffer.isBuffer(rendition.bytes)).toBe(true);
  });

  it("read nothing after the answer, though more bytes come in the same read or after it", () => {
    const reader = new MessageReader();
    const after = Buffer.from("anything at all, even a second answer");
    const messages = reader.push(Buffer.concat([frameOf(READY), frameOf({ kind: "failed" }), after]));
    expect(messages).toEqual([READY, { kind: "failed" }]);
    expect(reader.done).toBe(true);
    expect(reader.heldBytes).toBe(0);
    expect(reader.push(frameOf(PREPARED))).toEqual([]);
    expect(reader.push(raw("not json"))).toEqual([]);
  });

  it("take a header of HEADER_BYTES, and a message of MESSAGE_BYTES, and keep only what each length allows", () => {
    const header = '{"kind":"ready"}';
    expect(readAll(raw(header.padEnd(HEADER_BYTES, " ")))).toEqual([READY]);
    // Renditions that fill the message to its last byte: the reader keeps exactly that once the header is in.
    const half = MESSAGE_BYTES / 2;
    const answer = (left: number) =>
      JSON.stringify({
        kind: "prepared",
        prepared: { ok: true, renditions: [{ length: left - half }, { length: half }] },
      }).padEnd(200, " ");
    const left = MESSAGE_BYTES - 4 - 200;
    const reader = new MessageReader();
    reader.push(frameOf(READY));
    expect(reader.push(raw(answer(left)))).toEqual([]);
    expect(reader.heldBytes).toBe(left);
    expect(() => new MessageReader().push(Buffer.concat([frameOf(READY), raw(answer(left + 1))]))).toThrow(
      BrokenAnswer,
    );
  });
});

describe("a broken answer", () => {
  /** `bytes` refused: push throws BrokenAnswer, keeps nothing, and refuses whatever comes after. */
  function refused(bytes: Buffer, step = bytes.length) {
    const reader = new MessageReader();
    expect(() => readAll(bytes, step, reader)).toThrow(BrokenAnswer);
    expect(reader.heldBytes).toBe(0);
    expect(() => reader.push(frameOf(READY))).toThrow(BrokenAnswer);
  }
  const ready = frameOf(READY);

  it("is a header's length of 0, past HEADER_BYTES, or of 4 GiB, refused at its fourth byte with nothing kept", () => {
    refused(raw("", [], 0));
    refused(raw('{"kind":"ready"}'.padEnd(HEADER_BYTES + 1, " ")));
    const reader = new MessageReader();
    const huge = raw("", [], 0xffffffff);
    expect(reader.push(huge.subarray(0, 3))).toEqual([]);
    expect(() => reader.push(huge.subarray(3, 4))).toThrow(BrokenAnswer);
    expect(reader.heldBytes).toBe(0);
  });

  it("is a header that isn't a JSON object of one of the child's kinds", () => {
    for (const header of ["not json", "[]", "42", "null", '"ready"', "{}", '{"kind":"bogus"}', '{"kind":"prepared"}']) {
      refused(Buffer.concat([ready, raw(header)]));
    }
    refused(raw("not json"));
    refused(raw(Buffer.from([0xff, 0xfe, 0x00])));
  });

  it("is a message out of order: an answer before ready, or a second ready", () => {
    refused(frameOf({ kind: "failed" }));
    refused(frameOf(PREPARED));
    refused(Buffer.concat([ready, ready]), 1);
  });

  it("is a prepared answer whose renditions aren't a list of at most two, each with a length that fits", () => {
    const answer = (renditions: unknown) =>
      raw(JSON.stringify({ kind: "prepared", prepared: { ok: true, renditions } }));
    for (const renditions of [
      "two",
      { length: 4 },
      [{ length: 1 }, { length: 1 }, { length: 1 }],
      [{ kind: "full" }],
      [{ length: -1 }],
      [{ length: 1.5 }],
      [{ length: "4" }],
      [null],
      [{ length: MESSAGE_BYTES }],
      [{ length: Number.MAX_SAFE_INTEGER }, { length: Number.MAX_SAFE_INTEGER }],
      [{ length: 2 ** 53 }],
    ]) {
      refused(Buffer.concat([ready, answer(renditions)]));
    }
  });
});
