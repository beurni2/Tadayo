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
// 4. Each rendition, decoded with the pixel limit again, `failOn: "warning"` and a timeout: pixel data that won't
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
import sharp from "sharp";

sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({ operation: ["VipsForeignLoadJpegBuffer", "VipsForeignLoadPngBuffer", "VipsForeignLoadWebpBuffer"] });
sharp.cache(false);
sharp.concurrency(1);

/** D09: 64 megapixels decoded. */
export const MAX_PIXELS = 64_000_000;
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
  let width: number;
  let height: number;
  try {
    const header = await reader.metadata();
    if (header.format !== FORMATS[type]) return { ok: false, rejection: "unsupported_type" };
    width = header.width;
    height = header.height;
  } catch {
    return { ok: false, rejection: "unreadable" };
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, rejection: "unreadable" };
  }
  if (width * height > MAX_PIXELS) return { ok: false, rejection: "too_many_pixels" };

  const renditions: Rendition[] = [];
  for (const kind of RENDITION_KINDS) {
    // Each its own pipeline from the bytes, so each streams the decode rather than holding the whole image.
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
