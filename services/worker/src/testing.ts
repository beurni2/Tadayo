// A Storage for the tests, in memory (the worker's own tests, tests/src/db and the privacy matrix): the originals
// the app put, by object key, and the renditions the worker put, by key. It can be made to fail, all at once or at
// one call, to stand in for Storage away. And the images those tests prepare, made here by `sharp`, so no
// photograph is committed and nothing in one names anybody.

import sharp, { type Sharp } from "sharp";
import { StorageUnavailable, type WorkerStorage } from "./storage.ts";

export interface FakeWorkerStorage extends WorkerStorage {
  /** The originals, as the app's PUT left them. */
  readonly originals: Map<string, Uint8Array>;
  /** The renditions the worker put, by key, the last put of each. */
  readonly renditions: Map<string, Uint8Array>;
  /** Every read, in order, by key. */
  readonly reads: string[];
  /** Every put, in order, by key: a key put twice is there twice. */
  readonly puts: string[];
  /** Every call fails while on. */
  failing(on: boolean): void;
  /** The next `count` rendition puts fail, then they work again. */
  failPuts(count: number): void;
}

export function fakeWorkerStorage(): FakeWorkerStorage {
  const originals = new Map<string, Uint8Array>();
  const renditions = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const puts: string[] = [];
  let down = false;
  let putsToFail = 0;
  return {
    originals,
    renditions,
    reads,
    puts,
    failing(on) {
      down = on;
    },
    failPuts(count) {
      putsToFail = count;
    },
    readOriginal(objectKey) {
      reads.push(objectKey);
      if (down) return Promise.reject(new StorageUnavailable("reading an original got no answer"));
      return Promise.resolve(originals.get(objectKey) ?? null);
    },
    putRendition(key, bytes) {
      if (down) return Promise.reject(new StorageUnavailable("putting a rendition got no answer"));
      if (putsToFail > 0) {
        putsToFail -= 1;
        return Promise.reject(new StorageUnavailable("putting a rendition answered 503"));
      }
      puts.push(key);
      renditions.set(key, bytes);
      return Promise.resolve();
    },
  };
}

/** A flat image of `width` by `height`, in `format`, for a test to prepare. */
export function testImage(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: "#4a7a5c" }, limitInputPixels: false });
  return format === "png"
    ? image.png().toBuffer()
    : format === "webp"
      ? image.webp().toBuffer()
      : image.jpeg().toBuffer();
}

/**
 * An image of `width` by `height` that isn't one colour, for a test to measure a decoder at its worst: a 256-pixel
 * tile of gradients repeated, with more than 256 colours, so no codec stores it as a palette, and an alpha that
 * libwebp codes losslessly with a predictor rather than as a palette (checked for `sharp`'s WebP at effort 4).
 */
export function pattern(width: number, height: number, channels: 3 | 4 = 3): Sharp {
  const across = Math.min(256, width);
  const down = Math.min(256, height);
  const tile = Buffer.alloc(across * down * channels);
  let i = 0;
  for (let y = 0; y < down; y += 1) {
    for (let x = 0; x < across; x += 1) {
      tile[i++] = x;
      tile[i++] = y;
      tile[i++] = (x + y) & 255;
      if (channels === 4) tile[i++] = x ^ y;
    }
  }
  return sharp(tile, { raw: { width: across, height: down, channels }, limitInputPixels: false }).extend({
    right: width - across,
    bottom: height - down,
    extendWith: "repeat",
  });
}

/** One RIFF chunk: its four letters, its size, its payload, and a byte of padding to an even size. */
function riffChunk(fourcc: string, payload: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(payload.length, 4);
  return Buffer.concat([head, payload, Buffer.alloc(payload.length % 2)]);
}

/** A number as 24 bits, little-endian, as WebP's headers write it. */
function u24(n: number): Buffer {
  return Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255]);
}

/** A still WebP's image chunks, `ALPH` and `VP8 ` or `VP8L`, without its header and metadata. */
function imageChunks(still: Buffer): Buffer {
  const kept: Buffer[] = [];
  for (let at = 12; at + 8 <= still.length;) {
    const size = still.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    if (["ALPH", "VP8 ", "VP8L"].includes(still.subarray(at, at + 4).toString("latin1"))) {
      kept.push(still.subarray(at, end));
    }
    at = end;
  }
  return Buffer.concat(kept);
}

/** A frame of an animated WebP: a still WebP of `width` by `height`, at `x` and `y` (even) on the canvas. */
export interface WebpFrame {
  readonly still: Buffer;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * An animated WebP of `width` by `height`, its frames as given, built chunk by chunk (the container's own layout:
 * `VP8X` with the animation flag, `ANIM`, then an `ANMF` for each frame), so a test can put a small frame anywhere
 * on a large canvas without making the canvas's pixels.
 */
export function animatedWebp(width: number, height: number, frames: readonly WebpFrame[]): Buffer {
  const chunks = [
    riffChunk("VP8X", Buffer.concat([Buffer.from([0x12, 0, 0, 0]), u24(width - 1), u24(height - 1)])),
    riffChunk("ANIM", Buffer.alloc(6)),
    ...frames.map((frame) =>
      riffChunk(
        "ANMF",
        Buffer.concat([
          u24(frame.x / 2),
          u24(frame.y / 2),
          u24(frame.width - 1),
          u24(frame.height - 1),
          u24(100),
          Buffer.from([0]),
          imageChunks(frame.still),
        ]),
      ),
    ),
  ];
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/**
 * A lossy WebP of `width` by `height` whose alpha is coded losslessly with a predictor, built chunk by chunk (`VP8X`
 * with the alpha flag, `ALPH`, `VP8 `): the most a still WebP's decode holds, an alpha plane and its lossless
 * decoder's 4 bytes a pixel. `sharp` codes a large image's alpha as a palette, which libwebp decodes in less, so
 * the alpha here is the stream of a lossless WebP of the alpha alone, in its green channel, as WebP's container
 * has it.
 */
export async function losslessAlphaWebp(width: number, height: number): Promise<Buffer> {
  const across = Math.min(256, width);
  const down = Math.min(256, height);
  const tile = Buffer.alloc(across * down * 3);
  for (let y = 0; y < down; y += 1) {
    for (let x = 0; x < across; x += 1) tile[(y * across + x) * 3 + 1] = x ^ y;
  }
  const alpha = await sharp(tile, { raw: { width: across, height: down, channels: 3 }, limitInputPixels: false })
    .extend({ right: width - across, bottom: height - down, extendWith: "repeat" })
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
  // A simple lossless WebP: its `VP8L` chunk at 12, whose 5 bytes of signature and size come before the stream.
  if (alpha.subarray(12, 16).toString("latin1") !== "VP8L") throw new Error("testing: the alpha isn't one VP8L chunk");
  const stream = alpha.subarray(25, 20 + alpha.readUInt32LE(16));
  const first = stream[0] ?? 0;
  if ((first & 1) === 1 && ((first >> 1) & 3) === 3) throw new Error("testing: the alpha would decode as a palette");
  const lossy = await pattern(width, height).webp({ quality: 80 }).toBuffer();
  const body = Buffer.concat([
    Buffer.from("WEBP", "latin1"),
    riffChunk("VP8X", Buffer.concat([Buffer.from([0x10, 0, 0, 0]), u24(width - 1), u24(height - 1)])),
    riffChunk("ALPH", Buffer.concat([Buffer.from([1]), stream])),
    imageChunks(lossy),
  ]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
