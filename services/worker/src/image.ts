// A photo's checks and its renditions, from its bytes alone (docs/plans/api-b2-spike-prepare.md sections 3 and 4;
// TECH-DESIGN sections 1 and 5, "Media pipeline", step 2; D09; spec 23, 33; ADR-014; T12, T21). It reads no
// database, no Storage and no clock, and keeps nothing between calls.
//
// The order of the checks puts the cheapest refusal first, and nothing is decoded that a header refuses:
// 1. More than 20 MiB: too_large (D09).
// 2. The file signature, from the real bytes, never the declared type (spec 33): JPEG, PNG or WebP, and the one the
//    intent declared, else unsupported_type. The device sends what it declares (ADR-014), so a mismatch is a broken
//    or hostile client.
// 3. The header, with no pixel decoded: its format the signature's (else unsupported_type), and its width times
//    height at most 64,000,000 pixels (D09), else too_many_pixels. A header that can't be read: unreadable.
// 4. What the decode would hold at once, from the header: at most 128 MiB for a decoder that can't stream (FQ138),
//    else too_many_pixels.
// 5. Each rendition, decoded with the pixel limit again, `failOn: "warning"` and a timeout: pixel data that won't
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

import { createHmac } from "node:crypto";
import { UPLOAD_MAX_BYTES, type UploadContentType, type UploadRejection } from "@tadayo/domain";
import sharp, { type Metadata } from "sharp";

sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({ operation: ["VipsForeignLoadJpegBuffer", "VipsForeignLoadPngBuffer", "VipsForeignLoadWebpBuffer"] });
sharp.cache(false);
sharp.concurrency(1);

/** D09: 64 megapixels decoded. */
export const MAX_PIXELS = 64_000_000;
/**
 * The most a decoder that can't stream may hold at once, in bytes (FQ138). Every decode here streams, a few rows at
 * a time, except two, which hold the whole image before they give a row: a JPEG whose data comes in more than one
 * scan (progressive, or each component in a scan of its own) keeps every coefficient until the last scan, and an
 * interlaced PNG keeps every pixel until its last pass. Within 64 megapixels those reach 488 MiB, which the 512 MB
 * Machine can't hold beside everything else. 128 MiB keeps their peak near the largest a streaming decode reaches
 * (docs/plans/api-b2-spike-prepare.md section 4.4, measured), and takes any photo the app sends (ADR-014).
 */
export const MAX_HELD_BYTES = 128 * 1024 * 1024;
/** The longest one rendition's decode may take, in seconds. */
export const DECODE_SECONDS = 60;

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

/** A decode took longer than the worker allows: try again, as it says nothing about the photo. */
export class ImageTimeout extends Error {
  readonly code = "image.timeout";
  constructor() {
    super("image: a decode took too long");
    this.name = "ImageTimeout";
  }
}

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
 * The bytes the decoder will hold whole before it gives a row, from the header alone, or 0 when it streams.
 * `isProgressive` is libvips' own reading of the header, the one its decoder acts on: a JPEG with more than one scan
 * (libjpeg's `jpeg_has_multiple_scans`, whatever its frame marker says), or an Adam7 PNG.
 * - JPEG: libjpeg keeps 64 two-byte coefficients for each 8-by-8 block of each component, its blocks padded to whole
 *   MCUs of at most 32 pixels a side. Counting every component at full size is the most a subsampled one needs.
 * - PNG: every pixel, each of its samples 1 byte, or 2 at 16 bits, which is a PNG's most.
 * - WebP: libvips gives libwebp the scale it needs, so its buffer is the rendition's size (measured, section 4.4).
 */
export function heldBytes(header: {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly depth: string;
  readonly isProgressive: boolean;
}): number {
  if (!header.isProgressive) return 0;
  if (header.format === "jpeg") {
    const padded = (side: number) => Math.ceil(side / 32) * 32;
    return padded(header.width) * padded(header.height) * header.channels * 2;
  }
  if (header.format === "png") {
    return header.width * header.height * header.channels * (header.depth === "uchar" ? 1 : 2);
  }
  return 0;
}

/** `sharp`'s own words for its timeout: "timeout: 12% complete". */
function timedOut(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("timeout:");
}

/**
 * The checks of section 3, then `display` and `full`, or the rejection's code. Throws ImageTimeout when a decode
 * outlasts `limit` (`DECODE_SECONDS` unless given; the tests make it short).
 */
export async function prepareImage(
  bytes: Uint8Array,
  declared: UploadContentType,
  limit: { readonly seconds: number } = { seconds: DECODE_SECONDS },
): Promise<Prepared> {
  if (bytes.length > UPLOAD_MAX_BYTES) return { ok: false, rejection: "too_large" };
  const type = signatureOf(bytes);
  if (type === undefined || type !== declared) return { ok: false, rejection: "unsupported_type" };

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
  if (heldBytes(header) > MAX_HELD_BYTES) return { ok: false, rejection: "too_many_pixels" };

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

/**
 * The scoped content hash (T21; db/migrations/0006_contributions.sql): HMAC-SHA-256 of the original's bytes, keyed
 * by the owner, so one account's same photo matches and two accounts' never do, and nobody holding the photo alone
 * can compute it.
 */
export function contentHash(ownerUserId: string, bytes: Uint8Array): Buffer {
  return createHmac("sha256", `tadayo.upload.v1:${ownerUserId}`).update(bytes).digest();
}
