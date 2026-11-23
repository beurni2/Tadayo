// A Storage for the tests, in memory (the worker's own tests, tests/src/db and the privacy matrix): the originals
// the app put, by object key, and the renditions the worker put, by key. It can be made to fail, all at once or at
// one call, to stand in for Storage away. And the images those tests prepare, made here by `sharp`, so no
// photograph is committed and nothing in one names anybody.

import { crc32, deflateSync } from "node:zlib";
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

/** A WebP of `chunks`, its RIFF header made for them. */
function riffWebp(chunks: readonly Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/**
 * A lossy WebP of 64 by 64 (`VP8X`, `VP8 `) followed, inside its RIFF, by `junk` empty chunks of a kind libwebp
 * doesn't know, which it keeps a record of all the same: 8 bytes each, so 20 MiB holds 2.6 million.
 */
export async function junkWebp(junk: number): Promise<Buffer> {
  const still = await pattern(64, 64).webp().toBuffer();
  const empty = Buffer.alloc(junk * 8);
  for (let i = 0; i < junk; i += 1) empty.write("JUNK", i * 8, "latin1");
  return riffWebp([riffChunk("VP8X", Buffer.concat([Buffer.alloc(4), u24(63), u24(63)])), imageChunks(still), empty]);
}

/** One PNG chunk: its length, its four letters, its data and its CRC. */
function pngChunk(kind: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(kind, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * A PNG of 64 by 64 with `count` `zTXt` chunks before its pixels, each inflating to `mib` MiB, a few dozen KB each in
 * the file: libpng inflates every one as it reads the header, and libvips keeps their text.
 */
export function textBombPng(count: number, mib: number): Buffer {
  const rows = Buffer.alloc(64 * (1 + 64 * 3));
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64 * 3; x += 1) rows[y * (1 + 64 * 3) + 1 + x] = (x * 3 + y) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const text = deflateSync(Buffer.alloc(Math.round(mib * 1024 * 1024), 0x41), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    ...Array.from({ length: count }, (_, i) =>
      pngChunk("zTXt", Buffer.concat([Buffer.from(`Comment${String(i)}\0\0`, "latin1"), text])),
    ),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Bits written most significant first, with a 0x00 after each 0xFF, as a JPEG's entropy-coded data has them. */
class JpegBits {
  readonly out: number[] = [];
  #acc = 0;
  #n = 0;
  put(value: number, bits: number): void {
    for (let i = bits - 1; i >= 0; i -= 1) {
      this.#acc = (this.#acc << 1) | ((value >> i) & 1);
      this.#n += 1;
      if (this.#n === 8) this.#byte(this.#acc);
    }
  }
  #byte(b: number): void {
    this.out.push(b);
    if (b === 0xff) this.out.push(0);
    this.#acc = 0;
    this.#n = 0;
  }
  done(): Buffer {
    if (this.#n > 0) this.#byte((this.#acc << (8 - this.#n)) | ((1 << (8 - this.#n)) - 1));
    return Buffer.from(this.out);
  }
}

/** One JPEG marker segment: its marker, its length and its body. */
function jpegSegment(marker: number, body: Uint8Array): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

/**
 * A progressive JPEG of `width` by `height`, three components, every coefficient zero, in `scans` scans of a valid
 * progression, so libjpeg warns of nothing: for each component in turn, its DC first at Al 13 and refined down to 0,
 * then each AC coefficient alone, first at Al 13 and refined down to 0, as far as `scans` goes. Each scan passes
 * over every block of its component. Ported from PR #111's third review (`manyscans.py`).
 */
export function manyScansJpeg(width: number, height: number, scans: number): Buffer {
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const sof = Buffer.alloc(15);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof.writeUInt8(3, 5);
  for (let c = 0; c < 3; c += 1) sof.set([c + 1, 0x11, 0], 6 + c * 3);
  // DC table 0: category 0 alone, a 1-bit code. AC table 0: EOB0 to EOB14, 4-bit codes in that order.
  const dc = Buffer.from([0x00, 1, ...Array<number>(15).fill(0), 0]);
  const ac = Buffer.from([
    0x10,
    0,
    0,
    0,
    15,
    ...Array<number>(12).fill(0),
    ...Array.from({ length: 15 }, (_, n) => n << 4),
  ]);
  const parts: Buffer[] = [
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xdb, Buffer.from([0, ...Array<number>(64).fill(1)])),
    jpegSegment(0xc2, sof),
    jpegSegment(0xc4, Buffer.concat([dc, ac])),
  ];
  const dcScan = () => {
    const bits = new JpegBits();
    for (let i = 0; i < blocks; i += 1) bits.put(0, 1);
    return bits.done();
  };
  const acScan = () => {
    const bits = new JpegBits();
    for (let left = blocks; left > 0;) {
      const run = Math.min(left, 32767);
      const n = 31 - Math.clz32(run);
      bits.put(n, 4);
      if (n > 0) bits.put(run - (1 << n), n);
      left -= run;
    }
    return bits.done();
  };
  let made = 0;
  const scan = (component: number, ss: number, ah: number, al: number, data: Buffer) => {
    if (made >= scans) return;
    parts.push(jpegSegment(0xda, Buffer.from([1, component, 0x00, ss, ss, (ah << 4) | al])), data);
    made += 1;
  };
  for (let component = 1; component <= 3; component += 1) {
    const dcData = dcScan();
    scan(component, 0, 0, 13, dcData);
    for (let ah = 13; ah > 0; ah -= 1) scan(component, 0, ah, ah - 1, dcData);
    const acData = acScan();
    for (let k = 1; k <= 63; k += 1) {
      scan(component, k, 0, 13, acData);
      for (let ah = 13; ah > 0; ah -= 1) scan(component, k, ah, ah - 1, acData);
    }
  }
  if (made < scans) throw new Error(`testing: a progression has at most ${String(made)} scans`);
  parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

/**
 * A progressive JPEG of `width` by `height` whose scans after its first restart are hidden behind a reserved marker
 * (0x05) met where that restart is due. A walk that passes over every marker segment by its length counts two scans;
 * libjpeg's `jpeg_resync_to_restart` scans on past the marker as if it had no length, and reads the rest of the
 * restarts, then `hidden` more AC scans, each a pass over every block of the first component. Ported from PR #111's
 * fourth review (`hidescans.py`); `restart` is the restart interval in blocks.
 */
export function hiddenScansJpeg(width: number, height: number, hidden: number, restart: number): Buffer {
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const sof = Buffer.alloc(15);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof.writeUInt8(3, 5);
  for (let c = 0; c < 3; c += 1) sof.set([c + 1, 0x11, 0], 6 + c * 3);
  const dc = Buffer.from([0x00, 1, ...Array<number>(15).fill(0), 0]);
  const ac = Buffer.from([
    0x10,
    0,
    0,
    0,
    15,
    ...Array<number>(12).fill(0),
    ...Array.from({ length: 15 }, (_, n) => n << 4),
  ]);
  const sos = (components: number[], ss: number, ah: number, al: number) =>
    jpegSegment(
      0xda,
      Buffer.from([components.length, ...components.flatMap((c) => [c, 0x00]), ss, ss, (ah << 4) | al]),
    );
  const dri = (interval: number) => jpegSegment(0xdd, Buffer.from([interval >> 8, interval & 0xff]));
  const eobRuns = (count: number) => {
    const bits = new JpegBits();
    for (let left = count; left > 0;) {
      const run = Math.min(left, 32767);
      const n = 31 - Math.clz32(run);
      bits.put(n, 4);
      if (n > 0) bits.put(run - (1 << n), n);
      left -= run;
    }
    return bits.done();
  };
  // Seen by the walk: one interleaved DC scan, then restarts every `restart` blocks and an AC scan's first interval.
  const dcBits = new JpegBits();
  for (let i = 0; i < blocks * 3; i += 1) dcBits.put(0, 1);
  const seen: Buffer[] = [sos([1, 2, 3], 0, 0, 13), dcBits.done(), dri(restart), sos([1], 1, 0, 13)];
  const intervals: Buffer[] = [];
  for (let left = blocks; left > 0; left -= restart) intervals.push(eobRuns(Math.min(left, restart)));
  seen.push(intervals[0] ?? Buffer.alloc(0));
  // Hidden from it: the other intervals, no more restarts, then the AC scans of the first component.
  const unseen: Buffer[] = intervals.slice(1).flatMap((data, i) => [Buffer.from([0xff, 0xd0 + (i % 8)]), data]);
  unseen.push(dri(0));
  let made = 0;
  const scan = (ss: number, ah: number, al: number) => {
    if (made >= hidden) return;
    unseen.push(sos([1], ss, ah, al), eobRuns(blocks));
    made += 1;
  };
  for (let ah = 13; ah > 0; ah -= 1) scan(1, ah, ah - 1);
  for (let k = 2; k <= 63; k += 1) {
    scan(k, 0, 13);
    for (let ah = 13; ah > 0; ah -= 1) scan(k, ah, ah - 1);
  }
  if (made < hidden) throw new Error(`testing: at most ${String(made)} scans can be hidden`);
  // The reserved marker's "length" runs to the EOI, padded with zeros so that neither of its bytes is 0xFF.
  let body = Buffer.concat(unseen);
  while ((((body.length + 2) >> 8) & 0xff) === 0xff || ((body.length + 2) & 0xff) === 0xff) {
    body = Buffer.concat([body, Buffer.from([0])]);
  }
  if (body.length + 2 > 0xffff) throw new Error("testing: the hidden scans don't fit in a segment's length");
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xdb, Buffer.from([0, ...Array<number>(64).fill(1)])),
    jpegSegment(0xc2, sof),
    jpegSegment(0xc4, Buffer.concat([dc, ac])),
    ...seen,
    jpegSegment(0x05, body),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** Bits written least significant first, as a lossless WebP's stream has them. */
class WebpBits {
  readonly out: number[] = [];
  #acc = 0;
  #n = 0;
  put(value: number, bits: number): void {
    for (let i = 0; i < bits; i += 1) {
      this.#acc |= ((value >> i) & 1) << this.#n;
      this.#n += 1;
      if (this.#n === 8) {
        this.out.push(this.#acc);
        this.#acc = 0;
        this.#n = 0;
      }
    }
  }
  /** A canonical Huffman code, its first bit first. */
  code(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.put((value >> i) & 1, 1);
  }
  done(): Buffer {
    if (this.#n > 0) this.out.push(this.#acc);
    return Buffer.concat([Buffer.from(this.out), Buffer.alloc(16)]);
  }
}

/**
 * A lossless WebP of `width` by `height` whose image uses `groups` meta-Huffman groups of five one-symbol codes each:
 * libwebp builds a table of thousands of entries for every group, whatever the image's size. Ported from PR #111's
 * third review (`huffbomb.py`).
 */
export function huffmanWebp(width: number, height: number, groups: number): Buffer {
  const order = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const b = new WebpBits();
  const oneSymbol = () => {
    b.put(1, 1); // simple
    b.put(0, 1); // one symbol
    b.put(0, 1); // of 1 bit
    b.put(0, 1); // symbol 0
  };
  const all256OfLength8 = () => {
    // A normal code whose code-length code is symbol 16 alone: 43 repeats of length 8 (6 * 42 + 4).
    b.put(0, 1);
    b.put(9 - 4, 4);
    for (let i = 0; i < 9; i += 1) b.put(order[i] === 16 ? 1 : 0, 3);
    b.put(1, 1);
    b.put(2, 3);
    b.put(43 - 2, 6);
    for (let k = 0; k < 43; k += 1) b.put(k < 42 ? 3 : 1, 2);
  };
  b.put(0x2f, 8);
  b.put(width - 1, 14);
  b.put(height - 1, 14);
  b.put(0, 1);
  b.put(0, 3);
  b.put(0, 1); // no transform
  b.put(0, 1); // no colour cache
  b.put(1, 1); // meta Huffman
  b.put(0, 3); // precision 2
  const across = (width + 3) >> 2;
  const down = (height + 3) >> 2;
  if (across * down < groups) throw new Error("testing: too few entropy blocks for the groups");
  b.put(0, 1); // the entropy image: no colour cache
  all256OfLength8(); // green
  all256OfLength8(); // red
  oneSymbol(); // blue
  oneSymbol(); // alpha
  oneSymbol(); // distance
  for (let i = 0; i < across * down; i += 1) {
    const group = i % groups;
    b.code(group & 255, 8);
    b.code(group >> 8, 8);
  }
  for (let g = 0; g < groups; g += 1) for (let c = 0; c < 5; c += 1) oneSymbol();
  return riffWebp([riffChunk("VP8L", b.done())]);
}
