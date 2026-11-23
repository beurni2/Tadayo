// A photo's checks and its renditions, from its bytes alone (docs/plans/api-b2-spike-prepare.md sections 3 and 4;
// TECH-DESIGN sections 1 and 5, "Media pipeline", step 2; D09; spec 23, 33; ADR-014; T12). It reads no database, no
// Storage and no clock, and keeps nothing between calls. The worker runs it only in a process of its own, one for
// each photo, which it watches and ends (./image-process.ts, ./image-child.ts): a decoder may hold more than any of
// these checks foresees, and that process alone pays for it.
//
// The order of the checks puts the cheapest refusal first, and nothing is decoded that a header refuses:
// 1. More than 20 MiB: too_large (D09).
// 2. The file signature, from the real bytes, never the declared type (spec 33): JPEG, PNG or WebP, and the one the
//    intent declared, else unsupported_type. The device sends what it declares (ADR-014), so a mismatch is a broken
//    or hostile client.
// 3. The file's structure, walked before any decoder reads it (FQ138): a JPEG of more than 100 scans, or a WebP of
//    more than 1,000 chunks, is no photo an encoder makes, and would cost the decoder time out of all proportion:
//    unsupported_type. A WebP whose RIFF size isn't its length: unreadable, as libwebp reads no further than the
//    size says, and a check that read on would see what the decoder doesn't.
// 4. The header, with no pixel decoded: its format the signature's (else unsupported_type), and its width times
//    height at most 64,000,000 pixels (D09), else too_many_pixels. A header that can't be read: unreadable.
// 5. What the decode would hold at once, from the header and, for a WebP, its chunks: at most 128 MiB (FQ138), else
//    too_many_pixels.
// 6. Each rendition, decoded with the pixel limit again, `failOn: "warning"` and a timeout: pixel data that won't
//    decode is unreadable; the timeout is the worker's limit, not the photo's fault, so it throws ImageTimeout,
//    which the outbox tries again.
//
// Only three of libvips' loaders can run in this process, whatever the bytes are (spec 33: "Reject active
// formats"): importing this module blocks every loader and allows the JPEG, PNG and WebP loaders that read a
// buffer (`sharp.block` and `sharp.unblock`, `sharp`'s own allow-list example). So an SVG, a PDF or a TIFF that
// slipped past the signature is refused by the decoder too. It also turns `sharp`'s operation cache off, so no
// decoded image outlives its job, and gives libvips one thread, as the worker's Machine has one shared CPU.
//
// The renditions keep no metadata: without `withMetadata`, `keepExif` or `keepIccProfile`, `sharp` writes no EXIF
// (location, capture time, camera), XMP, IPTC or ICC profile, and converts to sRGB. `autoOrient` makes the pixels
// upright first, so the orientation tag isn't needed.

import type { UploadContentType, UploadRejection } from "@tadayo/domain";
import { UPLOAD_MAX_BYTES } from "@tadayo/domain/limits";
import sharp, { type Metadata } from "sharp";
import { DECODE_SECONDS, ImageTimeout } from "./image-process.ts";

sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({ operation: ["VipsForeignLoadJpegBuffer", "VipsForeignLoadPngBuffer", "VipsForeignLoadWebpBuffer"] });
sharp.cache(false);
sharp.concurrency(1);

/** D09: 64 megapixels decoded. */
export const MAX_PIXELS = 64_000_000;
/**
 * The most a decode may hold at once beyond what a streaming one does, in bytes (FQ138). A baseline JPEG, a PNG that
 * isn't interlaced and a lossy WebP with no alpha stream decode a few rows at a time. The others hold the whole image
 * before they give a row (`heldBytes`): within 64 megapixels, up to 610 MiB counted, which the 512 MB Machine can't
 * hold beside everything else. 128 MiB keeps their peak near the largest a streaming decode reaches
 * (docs/plans/api-b2-spike-prepare.md section 4.4, measured), and takes any photo the app sends (ADR-014).
 */
export const MAX_HELD_BYTES = 128 * 1024 * 1024;
/**
 * The most scans a JPEG may have. libjpeg takes in every scan before it gives a row, in one step that no timeout
 * interrupts, and a valid file can have thousands, each a pass over every block of its component: one of 2,688 scans
 * took 20 seconds where `sharp`'s own progressive JPEG of the same size took 0.7. An encoder's progressive JPEG has
 * about 10, and `jpegtran`'s scan scripts allow 100.
 */
export const MAX_JPEG_SCANS = 100;
/**
 * The most chunks a WebP may have at its top level. A still image has at most six (`VP8X`, `ICCP`, `ALPH`, the image,
 * `EXIF`, `XMP `), an animation one more for each frame. libwebp keeps a record of every chunk, and libvips finds
 * each frame by walking the list from its start: a 20 MiB file of 2.6 million empty chunks held 400 MiB, and one of
 * 20,000 frames took 4.6 seconds, a time that grows with the square of their number. 1,000 frames take about 10 ms.
 */
export const MAX_WEBP_CHUNKS = 1000;

/** A drop's photo's renditions (TECH-DESIGN section 1, "Images"): `widget` waits for widgets, `thumbnail` for B6. */
export const RENDITION_KINDS = ["full", "display"] as const;
export type RenditionKind = (typeof RENDITION_KINDS)[number];

/** Each kind's box: `fit: "inside"`, never enlarged. `display` is 1290 px wide, and never taller than `full`. */
const BOXES: Readonly<Record<RenditionKind, { readonly width: number; readonly height: number }>> = {
  full: { width: 2560, height: 2560 },
  display: { width: 1290, height: 2560 },
};

export interface Rendition {
  readonly kind: RenditionKind;
  /** A JPEG with no metadata. */
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
}

export type Prepared =
  | { readonly ok: false; readonly rejection: UploadRejection }
  | { readonly ok: true; readonly renditions: readonly Rendition[] };

const SIGNATURES: readonly { readonly type: UploadContentType; readonly matches: (bytes: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    matches: (b) => b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  },
  {
    type: "image/webp",
    matches: (b) =>
      b.length >= 12 &&
      Buffer.from(b.subarray(0, 4)).toString("latin1") === "RIFF" &&
      Buffer.from(b.subarray(8, 12)).toString("latin1") === "WEBP",
  },
];

/** The type the bytes' own first bytes say, or undefined for anything but JPEG, PNG and WebP. */
export function signatureOf(bytes: Uint8Array): UploadContentType | undefined {
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type;
}

/** `sharp`'s name for each format's decoder. */
const FORMATS: Readonly<Record<UploadContentType, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The scans of a JPEG, its SOS markers, found as libjpeg finds its markers, up to the first EOI: a marker segment is
 * passed over by its length, so a thumbnail inside an EXIF block isn't counted; between segments and in a scan's
 * entropy-coded data, a marker is the next 0xFF followed by a byte that isn't 0x00 (a stuffed byte), 0xFF (fill), a
 * restart or TEM. A file that ends first gives the scans counted so far.
 */
export function jpegScans(bytes: Uint8Array): number {
  let scans = 0;
  for (let at = 2; ;) {
    at = bytes.indexOf(0xff, at);
    if (at < 0 || at + 1 >= bytes.length) return scans;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xd9) return scans;
    if (marker === 0xff) {
      at += 1;
    } else if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
    } else {
      if (marker === 0xda) scans += 1;
      at += 2 + (((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0));
    }
  }
}

/** Where a WebP's RIFF chunk ends, by its size: libwebp reads nothing past it. */
function riffEnd(bytes: Uint8Array): number {
  if (bytes.length < 12) return bytes.length;
  return 8 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
}

/**
 * How many chunks a WebP has at its top level, each passed over by its size, as libwebp walks them. Undefined when its
 * RIFF size doesn't end it exactly: libwebp would read fewer bytes than there are, or wait for more.
 */
export function webpChunks(bytes: Uint8Array): number | undefined {
  if (bytes.length < 12 || riffEnd(bytes) !== bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let chunks = 0;
  for (let at = 12; at + 8 <= bytes.length; chunks += 1) {
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  return chunks;
}

/** How a WebP that isn't animated codes its pixels, as libwebp reads its chunks. */
export type WebpCoding = "lossy" | "lossy with alpha" | "lossless";

/**
 * The first image chunk at the top level of a WebP, `VP8 ` (lossy) or `VP8L` (lossless), and whether an `ALPH` chunk
 * came before it, as libwebp takes them, up to the end its RIFF size gives: every other chunk is skipped. Undefined
 * when there is none, as in an animation, whose frames are inside `ANMF` chunks, or a file that ends first.
 */
export function webpCoding(bytes: Uint8Array): WebpCoding | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(bytes.length, riffEnd(bytes));
  let alpha = false;
  for (let at = 12; at + 8 <= end;) {
    const fourcc = Buffer.from(bytes.subarray(at, at + 4)).toString("latin1");
    if (fourcc === "VP8 ") return alpha ? "lossy with alpha" : "lossy";
    if (fourcc === "VP8L") return "lossless";
    if (fourcc === "ALPH") alpha = true;
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  return undefined;
}

/**
 * The bytes the decode will hold whole before it gives a row, or 0 when it streams, from the header and a WebP's
 * chunks. `isProgressive` and `pages` are libvips' own reading of the header, the one its decoder acts on:
 * `isProgressive` is a JPEG with more than one scan (libjpeg's `jpeg_has_multiple_scans`, whatever its frame marker
 * says) or an Adam7 PNG, and `pages` a WebP's frames, which libvips gives every WebP that says it is animated, even one
 * of a single frame, and no still one.
 * - JPEG of more than one scan: libjpeg keeps 64 two-byte coefficients for each 8-by-8 block of each component, its
 *   blocks padded to whole MCUs of at most 32 pixels a side. Counting every component at full size is the most a
 *   subsampled one needs.
 * - Interlaced PNG: every pixel, each of its samples 1 byte, or 2 at 16 bits, which is a PNG's most.
 * - WebP, lossy: libvips gives libwebp the scale it needs, so its rows are the rendition's size: 0.
 * - WebP, lossless: libwebp keeps every pixel as 4 bytes, whatever its scale.
 * - WebP, lossy with alpha: the alpha plane, a byte a pixel, and, when it is coded losslessly, its decoder's 4: 5.
 * - WebP, animated (any pages at all): libvips composites each frame onto a canvas of 4 bytes a pixel, beside
 *   another, and a frame's own alpha besides; the worst frames measured 9.2 bytes a canvas pixel, counted as 10.
 *   Even a single frame is put on its canvas, whole when it doesn't fill it.
 *   A WebP whose coding can't be read is counted the same: libwebp would refuse it, or it is an animation. So an
 *   animation is counted by two readings, libvips' pages first, as its decoder acts on them, and then the chunks,
 *   where its frames sit in `ANMF`: neither alone decides, should the other ever read a file otherwise.
 */
export function heldBytes(
  header: {
    readonly format: string;
    readonly width: number;
    readonly height: number;
    readonly channels: number;
    readonly depth: string;
    readonly isProgressive: boolean;
    readonly pages?: number | undefined;
  },
  bytes: Uint8Array,
): number {
  const pixels = header.width * header.height;
  if (header.format === "webp") {
    if (header.pages !== undefined) return pixels * 10;
    const coding = webpCoding(bytes);
    return pixels * (coding === "lossy" ? 0 : coding === "lossless" ? 4 : coding === "lossy with alpha" ? 5 : 10);
  }
  if (!header.isProgressive) return 0;
  if (header.format === "jpeg") {
    const padded = (side: number) => Math.ceil(side / 32) * 32;
    return padded(header.width) * padded(header.height) * header.channels * 2;
  }
  if (header.format === "png") {
    return pixels * header.channels * (header.depth === "uchar" ? 1 : 2);
  }
  return 0;
}

/** `sharp`'s own words for its timeout: "timeout: 12% complete". */
function timedOut(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("timeout:");
}

/**
 * The checks of section 3, then `display` and `full`, or the rejection's code. Throws ImageTimeout when a decode
 * outlasts `limit` (`DECODE_SECONDS` unless given; the tests make it short). The worker calls it only through
 * prepareIsolated (./image-process.ts).
 */
export async function prepareImage(
  bytes: Uint8Array,
  declared: UploadContentType,
  limit: { readonly seconds: number } = { seconds: DECODE_SECONDS },
): Promise<Prepared> {
  if (bytes.length > UPLOAD_MAX_BYTES) return { ok: false, rejection: "too_large" };
  const type = signatureOf(bytes);
  if (type === undefined || type !== declared) return { ok: false, rejection: "unsupported_type" };
  if (type === "image/jpeg" && jpegScans(bytes) > MAX_JPEG_SCANS) return { ok: false, rejection: "unsupported_type" };
  if (type === "image/webp") {
    const chunks = webpChunks(bytes);
    if (chunks === undefined) return { ok: false, rejection: "unreadable" };
    if (chunks > MAX_WEBP_CHUNKS) return { ok: false, rejection: "unsupported_type" };
  }

  // Each pipeline is built outside its `try`, so a mistake of this code's, which `sharp` throws as it is built,
  // is an error and never a rejection of the photo; only what the decode itself says is the photo's.
  // The header alone: with the pixel limit on, metadata() itself refuses a large image by an error's words.
  const reader = sharp(bytes, { limitInputPixels: false });
  let header: Metadata;
  try {
    header = await reader.metadata();
  } catch {
    return { ok: false, rejection: "unreadable" };
  }
  if (header.format !== FORMATS[type]) return { ok: false, rejection: "unsupported_type" };
  const { width, height, channels } = header;
  if (![width, height, channels].every((n) => Number.isInteger(n) && n >= 1)) {
    return { ok: false, rejection: "unreadable" };
  }
  if (width * height > MAX_PIXELS) return { ok: false, rejection: "too_many_pixels" };
  if (heldBytes(header, bytes) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };

  const renditions: Rendition[] = [];
  for (const kind of RENDITION_KINDS) {
    // Each its own pipeline from the bytes, one after the other, so no two decodes are held at once.
    const pipeline = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning", autoOrient: true })
      .resize({ ...BOXES[kind], fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .timeout({ seconds: limit.seconds });
    try {
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      renditions.push({ kind, bytes: data, width: info.width, height: info.height });
    } catch (error) {
      if (timedOut(error)) throw new ImageTimeout();
      return { ok: false, rejection: "unreadable" };
    }
  }
  return { ok: true, renditions };
}
