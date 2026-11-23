// The checks and the renditions of a photo, from its bytes alone (docs/plans/api-b2-spike-prepare.md sections 3
// and 4; D09; spec 23, 33; ADR-014; T12), run in this process; the worker runs them in a photo's own process, which
// ./image-process.test.ts tests. Every image here is made in the test, by `sharp` or byte by byte, so no photograph
// is committed and nothing in one names anybody.

import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageTimeout } from "./image-process.ts";
import {
  heldBytes,
  jpegScans,
  MAX_HELD_BYTES,
  MAX_JPEG_SCANS,
  MAX_PIXELS,
  MAX_WEBP_CHUNKS,
  prepareImage,
  signatureOf,
  webpChunks,
  webpCoding,
  type Rendition,
} from "./image.ts";
import { animatedWebp, hiddenScansJpeg, junkWebp, losslessAlphaWebp, manyScansJpeg, pattern } from "./testing.ts";

const MiB = 1024 * 1024;

/** A flat image of `width` by `height`, in `format`. */
async function flat(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg"): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: "#4a7a5c" }, limitInputPixels: false });
  return format === "png"
    ? image.png().toBuffer()
    : format === "webp"
      ? image.webp().toBuffer()
      : image.jpeg().toBuffer();
}

/** Noise, which no codec can make small. */
async function noise(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#000000", noise: { type: "gaussian", mean: 128, sigma: 50 } },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

function kinds(renditions: readonly Rendition[]): Record<string, [number, number]> {
  return Object.fromEntries(renditions.map((r) => [r.kind, [r.width, r.height]]));
}

async function ready(bytes: Buffer, declared: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg") {
  const prepared = await prepareImage(bytes, declared);
  if (!prepared.ok) throw new Error(`expected renditions, got ${prepared.rejection}`);
  return prepared.renditions;
}

describe("the file signature, from the real bytes (spec 33)", () => {
  it("knows JPEG, PNG and WebP by their first bytes, and nothing else", async () => {
    expect(signatureOf(await flat(8, 8, "jpeg"))).toBe("image/jpeg");
    expect(signatureOf(await flat(8, 8, "png"))).toBe("image/png");
    expect(signatureOf(await flat(8, 8, "webp"))).toBe("image/webp");
    expect(signatureOf(Buffer.from("GIF89a"))).toBeUndefined();
    expect(signatureOf(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeUndefined();
    expect(signatureOf(Buffer.from("RIFF\0\0\0\0WAVE"))).toBeUndefined();
    expect(signatureOf(Buffer.from([0xff, 0xd8]))).toBeUndefined();
    expect(signatureOf(Buffer.alloc(0))).toBeUndefined();
  });
});

describe("what is refused, and with which code (D09, spec 33)", () => {
  it("refuses another format than the three as unsupported_type, by its bytes, whatever it was declared as", async () => {
    const base = sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } });
    const others = [
      await base.clone().gif().toBuffer(),
      await base.clone().tiff().toBuffer(),
      await base.clone().heif({ compression: "av1" }).toBuffer(),
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ),
      Buffer.from("plain text, nothing like an image"),
    ];
    for (const bytes of others) {
      for (const declared of ["image/jpeg", "image/png", "image/webp"] as const) {
        expect(await prepareImage(bytes, declared)).toEqual({ ok: false, rejection: "unsupported_type" });
      }
    }
  });

  it("refuses bytes that aren't the type the intent declared as unsupported_type", async () => {
    expect(await prepareImage(await flat(16, 16, "png"), "image/jpeg")).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
    expect(await prepareImage(await flat(16, 16, "jpeg"), "image/webp")).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
    expect(await prepareImage(await flat(16, 16, "webp"), "image/png")).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
  });

  it("decodes none but the three, even past the signature check: an SVG behind a JPEG's first bytes", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const disguised = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), svg]);
    const prepared = await prepareImage(disguised, "image/jpeg");
    expect(prepared.ok).toBe(false);
    // Each other format's own bytes, given to the decoder itself with no signature check: refused by it.
    const base = sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } });
    const others = {
      gif: await base.clone().gif().toBuffer(),
      tiff: await base.clone().tiff().toBuffer(),
      avif: await base.clone().heif({ compression: "av1" }).toBuffer(),
      svg,
    };
    for (const [format, bytes] of Object.entries(others)) {
      const said = await sharp(bytes)
        .metadata()
        .then(() => "decoded")
        .catch((error: unknown) => (error as Error).message);
      expect({ format, refused: /unsupported image format/.test(said) }).toEqual({ format, refused: true });
    }
    for (const kind of ["jpeg", "png", "webp"] as const) {
      expect((await sharp(await flat(16, 16, kind)).metadata()).format).toBe(kind);
    }
  });

  it("refuses more than 20 MiB as too_large, before reading anything else", async () => {
    const jpeg = await flat(16, 16);
    const padded = Buffer.concat([jpeg, Buffer.alloc(20 * MiB + 1 - jpeg.length)]);
    expect(padded.length).toBe(20 * MiB + 1);
    expect(await prepareImage(padded, "image/jpeg")).toEqual({ ok: false, rejection: "too_large" });
    expect(await prepareImage(Buffer.alloc(20 * MiB + 1), "image/png")).toEqual({ ok: false, rejection: "too_large" });
  });

  it("takes exactly 20 MiB", async () => {
    const jpeg = await flat(16, 16);
    // Bytes after a JPEG's end marker are ignored by its decoder.
    const padded = Buffer.concat([jpeg, Buffer.alloc(20 * MiB - jpeg.length)]);
    expect(padded.length).toBe(20 * MiB);
    expect((await prepareImage(padded, "image/jpeg")).ok).toBe(true);
  });

  it("refuses more than 64 megapixels by the header as too_many_pixels, and takes exactly 64,000,000", async () => {
    expect(MAX_PIXELS).toBe(64_000_000);
    expect(await prepareImage(await flat(8001, 8000, "png"), "image/png")).toEqual({
      ok: false,
      rejection: "too_many_pixels",
    });
    expect(await prepareImage(await flat(16001, 4000, "webp"), "image/webp")).toEqual({
      ok: false,
      rejection: "too_many_pixels",
    });
    expect(kinds(await ready(await flat(8000, 8000, "png"), "image/png"))).toEqual({
      full: [2560, 2560],
      display: [1290, 1290],
    });
  }, 60_000);

  it("refuses a photo whose pixels end early as unreadable, though its header reads", async () => {
    const whole = await noise(400, 300);
    const cut = whole.subarray(0, Math.floor(whole.length / 2));
    expect((await sharp(cut).metadata()).width).toBe(400);
    expect(await prepareImage(cut, "image/jpeg")).toEqual({ ok: false, rejection: "unreadable" });
  });

  it("refuses a signature with nothing readable after it as unreadable", async () => {
    expect(await prepareImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), "image/jpeg")).toEqual({
      ok: false,
      rejection: "unreadable",
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(await prepareImage(png, "image/png")).toEqual({ ok: false, rejection: "unreadable" });
  });
});

describe("the file's structure, walked before any decoder reads it (FQ138)", () => {
  /** A JPEG's segments by hand: SOI, then each part as given. */
  const jpeg = (...parts: number[][]) => Buffer.from([0xff, 0xd8, ...parts.flat()]);
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0];
  const trailer = Buffer.concat([Buffer.from("VP8 ", "latin1"), Buffer.alloc(4)]);

  it("counts a JPEG's scans: one for a baseline, each SOS for a progressive", async () => {
    expect(jpegScans(await flat(64, 48))).toBe(1);
    expect(
      jpegScans(
        await sharp(await flat(64, 48))
          .jpeg({ progressive: true })
          .toBuffer(),
      ),
    ).toBe(10);
    expect(jpegScans(manyScansJpeg(64, 64, 100))).toBe(100);
    expect(jpegScans(manyScansJpeg(4704, 4704, 2688))).toBe(2688);
  });

  it("counts no SOS inside a segment, nor a stuffed byte, a restart, fill bytes or anything after the EOI", () => {
    // An APP1 of 10 bytes holding an SOS's bytes, as an EXIF thumbnail does.
    const app1 = [0xff, 0xe1, 0, 10, 0xff, 0xda, 0xff, 0xda, 0xff, 0xda, 0, 0];
    // A scan's data with a stuffed 0xFF, a restart and fill bytes before the next marker.
    const data = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56, 0xff, 0xff];
    expect(jpegScans(jpeg(app1, sos, data, sos, [0xff, 0xd9], sos, sos))).toBe(2);
    // After the EOI, two bytes that would read as a segment's length, then scans: none is counted.
    expect(jpegScans(jpeg(sos, data, [0xff, 0xd9, 0x00, 0x02], sos, sos))).toBe(1);
    expect(jpegScans(jpeg(sos, data))).toBe(1);
    expect(jpegScans(jpeg(sos.slice(0, 3)))).toBe(1);
    expect(jpegScans(jpeg())).toBe(0);
  });

  it("gives no count for a reserved marker before the EOI, which libjpeg passes over without its length at a restart", () => {
    // Where a restart is due, libjpeg scans on past a marker of 0x02 to 0xBF as if it had no length (R4-1).
    const data = [0x12, 0xff, 0x00, 0x34];
    expect(jpegScans(jpeg(sos, data, [0xff, 0x05, 0, 12], sos, [0, 0], [0xff, 0xd9]))).toBeUndefined();
    expect(jpegScans(jpeg(sos, data, [0xff, 0x02, 0, 2], [0xff, 0xd9]))).toBeUndefined();
    expect(jpegScans(jpeg(sos, data, [0xff, 0xbf, 0, 2], [0xff, 0xd9]))).toBeUndefined();
    expect(jpegScans(jpeg([0xff, 0x80, 0, 2], sos, [0xff, 0xd9]))).toBeUndefined();
    // Not inside a segment, which is passed over by its length, nor after the EOI; TEM has no length; SOF0's length
    // is passed over.
    expect(jpegScans(jpeg([0xff, 0xe1, 0, 6, 0xff, 0x05, 0, 2], sos, data, [0xff, 0xd9, 0xff, 0x05]))).toBe(1);
    expect(jpegScans(jpeg(sos, data, [0xff, 0x01], sos, [0xff, 0xd9]))).toBe(2);
    expect(jpegScans(jpeg([0xff, 0xc0, 0, 4, 0xff, 0xda], sos, [0xff, 0xd9]))).toBe(1);
    // Round 4's file, by its structure: two scans seen, the rest behind the reserved marker.
    expect(jpegScans(hiddenScansJpeg(256, 256, 150, 256))).toBeUndefined();
  });

  it("refuses a JPEG that hides its scans behind a reserved marker as unsupported_type, before its decode", async () => {
    // 881 scans hidden at 4704 by 4704: libjpeg would read each of them, for seconds, before a row (R4-1).
    const hidden = hiddenScansJpeg(4704, 4704, 881, 32767);
    const started = performance.now();
    expect(await prepareImage(hidden, "image/jpeg")).toEqual({ ok: false, rejection: "unsupported_type" });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it(`refuses a JPEG of more than ${String(MAX_JPEG_SCANS)} scans as unsupported_type, before its decode, and takes one of ${String(MAX_JPEG_SCANS)}`, async () => {
    expect(MAX_JPEG_SCANS).toBe(100);
    expect(await prepareImage(manyScansJpeg(64, 64, 101), "image/jpeg")).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
    expect(kinds(await ready(manyScansJpeg(64, 64, 100)))).toEqual({ full: [64, 64], display: [64, 64] });
  });

  it("counts a WebP's chunks at its top level, up to its RIFF's end, and none if that end isn't the file's", async () => {
    const lossy = await flat(64, 48, "webp");
    expect(webpChunks(lossy)).toBe(1);
    expect(
      webpChunks(
        await sharp(lossy)
          .withExif({ IFD0: { Artist: "x" } })
          .webp()
          .toBuffer(),
      ),
    ).toBe(3);
    expect(webpChunks(await junkWebp(10))).toBe(12);
    // Bytes past the RIFF's end, or a RIFF that names more bytes than there are.
    expect(webpChunks(Buffer.concat([lossy, trailer]))).toBeUndefined();
    expect(webpChunks(lossy.subarray(0, lossy.length - 2))).toBeUndefined();
    expect(webpChunks(lossy.subarray(0, 11))).toBeUndefined();
  });

  it("reads a WebP's coding no further than its RIFF's end, as libwebp does (PR #111's third review: R3-2)", async () => {
    const lossless = await sharp(await flat(64, 48, "webp"))
      .webp({ lossless: true })
      .toBuffer();
    expect(webpCoding(Buffer.concat([lossless.subarray(0, 12), trailer]))).toBe("lossy");
    const animation = animatedWebp(64, 48, [{ still: lossless, x: 0, y: 0, width: 64, height: 48 }]);
    expect(webpCoding(animation)).toBeUndefined();
    expect(webpCoding(Buffer.concat([animation, trailer]))).toBeUndefined();
  });

  it("refuses a WebP whose RIFF size isn't its length as unreadable: one frame on 64 megapixels with a trailer had passed as lossy", async () => {
    const corner = await pattern(64, 64).webp().toBuffer();
    const single = animatedWebp(8000, 8000, [{ still: corner, x: 7936, y: 7936, width: 64, height: 64 }]);
    expect(Buffer.concat([single, trailer]).length).toBeLessThan(256);
    expect(await prepareImage(Buffer.concat([single, trailer]), "image/webp")).toEqual({
      ok: false,
      rejection: "unreadable",
    });
    expect(await prepareImage(Buffer.concat([await flat(64, 48, "webp"), trailer]), "image/webp")).toEqual({
      ok: false,
      rejection: "unreadable",
    });
  });

  it(`refuses a WebP of more than ${String(MAX_WEBP_CHUNKS)} chunks as unsupported_type, and takes one of ${String(MAX_WEBP_CHUNKS)}`, async () => {
    expect(MAX_WEBP_CHUNKS).toBe(1000);
    // `VP8X`, `VP8 ` and the empty chunks.
    expect(await prepareImage(await junkWebp(MAX_WEBP_CHUNKS - 1), "image/webp")).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
    expect(kinds(await ready(await junkWebp(MAX_WEBP_CHUNKS - 2), "image/webp"))).toEqual({
      full: [64, 64],
      display: [64, 64],
    });
  });
});

describe("a decode that can't stream (FQ138)", () => {
  type Canvas = { width: number; height: number; channels: 3 | 4; background: string };
  const canvas = (width: number, height: number, channels: 3 | 4 = 3): Canvas => ({
    width,
    height,
    channels,
    background: channels === 4 ? "#4a7a5c80" : "#4a7a5c",
  });
  const make = (create: Canvas) => sharp({ create, limitInputPixels: false });
  const progressive = (create: Canvas, chromaSubsampling = "4:4:4") =>
    make(create).jpeg({ progressive: true, chromaSubsampling }).toBuffer();
  const interlaced = (create: Canvas, sixteen = false) =>
    (sixteen ? make(create).toColourspace("rgb16") : make(create)).png({ progressive: true }).toBuffer();
  const refused = { ok: false, rejection: "too_many_pixels" };

  it("counts what libjpeg and libvips hold whole: every coefficient of a JPEG of more than one scan, every pixel of an interlaced PNG, and nothing for the rest", () => {
    expect(MAX_HELD_BYTES).toBe(128 * MiB);
    const header = { width: 4000, height: 3000, channels: 3, depth: "uchar", isProgressive: true };
    const none = new Uint8Array();
    // 64 two-byte coefficients for each 8-by-8 block of each component, padded to whole 32-pixel MCUs.
    expect(heldBytes({ ...header, format: "jpeg" }, none)).toBe(4000 * 3008 * 3 * 2);
    expect(heldBytes({ ...header, format: "jpeg", width: 1, height: 1 }, none)).toBe(32 * 32 * 3 * 2);
    expect(heldBytes({ ...header, format: "jpeg", channels: 4 }, none)).toBe(4000 * 3008 * 4 * 2);
    expect(heldBytes({ ...header, format: "png" }, none)).toBe(4000 * 3000 * 3);
    expect(heldBytes({ ...header, format: "png", channels: 4, depth: "ushort" }, none)).toBe(4000 * 3000 * 4 * 2);
    expect(heldBytes({ ...header, format: "jpeg", isProgressive: false }, none)).toBe(0);
    expect(heldBytes({ ...header, format: "png", isProgressive: false }, none)).toBe(0);
  });

  it("counts a WebP by how its chunks code it: nothing when lossy, 4 bytes a pixel lossless, 5 lossy with alpha, 10 a canvas pixel animated or unreadable", async () => {
    const lossy = await flat(64, 48, "webp");
    const lossless = await sharp(lossy).webp({ lossless: true }).toBuffer();
    const alpha = await sharp({ create: { width: 64, height: 48, channels: 4, background: "#4a7a5c80" } })
      .webp()
      .toBuffer();
    const losslessAlpha = await sharp(alpha).webp({ lossless: true }).toBuffer();
    // An `ALPH` and other chunks before the image chunk are passed over, as libwebp passes them.
    const withMetadata = await sharp(alpha)
      .withExif({ IFD0: { Artist: "x" } })
      .webp()
      .toBuffer();
    const animation = animatedWebp(64, 48, [
      { still: lossy, x: 0, y: 0, width: 64, height: 48 },
      { still: await flat(16, 16, "webp"), x: 48, y: 32, width: 16, height: 16 },
    ]);
    expect(webpCoding(lossy)).toBe("lossy");
    expect(webpCoding(lossless)).toBe("lossless");
    expect(webpCoding(alpha)).toBe("lossy with alpha");
    expect(webpCoding(losslessAlpha)).toBe("lossless");
    expect(webpCoding(withMetadata)).toBe("lossy with alpha");
    expect(webpCoding(animation)).toBeUndefined();
    expect(webpCoding(lossy.subarray(0, 12))).toBeUndefined();

    const header = (bytes: Buffer) => sharp(bytes).metadata();
    expect((await header(animation)).pages).toBe(2);
    expect(heldBytes(await header(lossy), lossy)).toBe(0);
    expect(heldBytes(await header(lossless), lossless)).toBe(64 * 48 * 4);
    expect(heldBytes(await header(alpha), alpha)).toBe(64 * 48 * 5);
    expect(heldBytes(await header(losslessAlpha), losslessAlpha)).toBe(64 * 48 * 4);
    expect(heldBytes(await header(animation), animation)).toBe(64 * 48 * 10);
    // A still WebP whose coding can't be read counts as an animation; and any pages at all, libvips' own reading,
    // count as an animation whatever the chunks say, one page included.
    expect((await header(lossy)).pages).toBeUndefined();
    expect(heldBytes(await header(lossy), lossy.subarray(0, 12))).toBe(64 * 48 * 10);
    expect(heldBytes({ ...(await header(lossy)), pages: 2 }, lossy)).toBe(64 * 48 * 10);
    expect(heldBytes({ ...(await header(lossy)), pages: 1 }, lossy)).toBe(64 * 48 * 10);
    // libvips gives one page to an animation of a single frame, which it still puts on its canvas.
    const one = animatedWebp(64, 48, [{ still: lossy, x: 0, y: 0, width: 64, height: 48 }]);
    expect((await header(one)).pages).toBe(1);
    expect(heldBytes(await header(one), one)).toBe(64 * 48 * 10);
  });

  it("refuses a progressive JPEG whose coefficients pass 128 MiB as too_many_pixels, subsampled or not, and takes one within it", async () => {
    // 4736 x 4736 x 3 components x 2 bytes is 134,578,176; 4704 x 4704 x 3 x 2 is 132,765,696; the budget 134,217,728.
    expect(await prepareImage(await progressive(canvas(4736, 4736)), "image/jpeg")).toEqual(refused);
    expect(await prepareImage(await progressive(canvas(4736, 4736), "4:2:0"), "image/jpeg")).toEqual(refused);
    expect((await prepareImage(await progressive(canvas(4704, 4704)), "image/jpeg")).ok).toBe(true);
    // CMYK has four components: 4096 x 4096 x 4 x 2 is the budget exactly.
    const cmyk = (width: number) =>
      make(canvas(width, 4096)).toColourspace("cmyk").jpeg({ progressive: true }).toBuffer();
    expect(await prepareImage(await cmyk(4128), "image/jpeg")).toEqual(refused);
    expect((await prepareImage(await cmyk(4096), "image/jpeg")).ok).toBe(true);
  }, 60_000);

  it("refuses an interlaced PNG whose pixels pass 128 MiB as too_many_pixels, by its channels and its depth, and takes one within it", async () => {
    // 5793 x 5793 x 4 is 134,235,396 and 5792 x 5792 x 4 is 134,189,056; at 16 bits, 4096 x 4096 x 8 is the budget.
    expect(await prepareImage(await interlaced(canvas(5793, 5793, 4)), "image/png")).toEqual(refused);
    expect((await prepareImage(await interlaced(canvas(5792, 5792, 4)), "image/png")).ok).toBe(true);
    expect(await prepareImage(await interlaced(canvas(4097, 4096, 4), true), "image/png")).toEqual(refused);
    expect((await prepareImage(await interlaced(canvas(4096, 4096, 4), true), "image/png")).ok).toBe(true);
  }, 60_000);

  it("refuses a WebP that holds the whole image past 128 MiB as too_many_pixels, lossless, lossy with alpha or animated, and takes one within it", async () => {
    // Lossless at 4 bytes a pixel: 5793 x 5793 x 4 is 134,235,396 and 5792 x 5792 x 4 is 134,189,056.
    const lossless = (side: number) => pattern(side, side, 4).webp({ lossless: true }).toBuffer();
    expect(await prepareImage(await lossless(5793), "image/webp")).toEqual(refused);
    expect((await prepareImage(await lossless(5792), "image/webp")).ok).toBe(true);
    // Lossy with alpha at 5: 5182 x 5182 x 5 is 134,265,620 and 5181 x 5181 x 5 is 134,213,805.
    expect(await prepareImage(await losslessAlphaWebp(5182, 5182), "image/webp")).toEqual(refused);
    expect((await prepareImage(await losslessAlphaWebp(5181, 5181), "image/webp")).ok).toBe(true);
    // Animated at 10 a canvas pixel: 3664 x 3664 x 10 is 134,248,960 and 3663 x 3663 x 10 is 134,175,690.
    const corner = await pattern(64, 64).webp().toBuffer();
    const animated = async (side: number) =>
      animatedWebp(side, side, [
        { still: await pattern(side, side).webp().toBuffer(), x: 0, y: 0, width: side, height: side },
        { still: corner, x: (side - 64) & ~1, y: (side - 64) & ~1, width: 64, height: 64 },
      ]);
    expect(await prepareImage(await animated(3664), "image/webp")).toEqual(refused);
    expect((await prepareImage(await animated(3663), "image/webp")).ok).toBe(true);
    // An animation of 64 megapixels whose frames are small is refused by its canvas, its file a few hundred bytes.
    const small = animatedWebp(8000, 8000, [
      { still: corner, x: 0, y: 0, width: 64, height: 64 },
      { still: corner, x: 7936, y: 7936, width: 64, height: 64 },
    ]);
    expect(small.length).toBeLessThan(4096);
    expect(await prepareImage(small, "image/webp")).toEqual(refused);
    // So is one of a single small frame, which libvips gives one page (PR #111's third review: R3-2).
    const single = animatedWebp(8000, 8000, [{ still: corner, x: 7936, y: 7936, width: 64, height: 64 }]);
    expect(await prepareImage(single, "image/webp")).toEqual(refused);
  }, 120_000);

  it("takes the same sizes when their decode streams: a baseline JPEG, a PNG that isn't interlaced, a lossy WebP with no alpha", async () => {
    expect((await prepareImage(await make(canvas(4736, 4736)).jpeg().toBuffer(), "image/jpeg")).ok).toBe(true);
    expect(
      (
        await prepareImage(
          await make(canvas(5793, 5793, 4))
            .png()
            .toBuffer(),
          "image/png",
        )
      ).ok,
    ).toBe(true);
    expect((await prepareImage(await make(canvas(8000, 8000)).webp().toBuffer(), "image/webp")).ok).toBe(true);
  }, 60_000);
});

describe("the renditions (TECH-DESIGN section 1, Images)", () => {
  it("makes full inside 2560 and display inside 1290 wide and 2560 tall, JPEG, for a landscape photo", async () => {
    const renditions = await ready(await noise(4032, 3024));
    expect(kinds(renditions)).toEqual({ full: [2560, 1920], display: [1290, 968] });
    for (const rendition of renditions) {
      expect(signatureOf(rendition.bytes)).toBe("image/jpeg");
      const read = await sharp(rendition.bytes).metadata();
      expect([read.format, read.width, read.height]).toEqual(["jpeg", rendition.width, rendition.height]);
    }
  });

  it("keeps a portrait's display 1290 wide", async () => {
    expect(kinds(await ready(await flat(3024, 4032)))).toEqual({ full: [1920, 2560], display: [1290, 1720] });
  });

  it("never makes a long screenshot's display taller than its full", async () => {
    expect(kinds(await ready(await flat(1290, 2796, "png"), "image/png"))).toEqual({
      full: [1181, 2560],
      display: [1181, 2560],
    });
  });

  it("never enlarges a small photo", async () => {
    expect(kinds(await ready(await flat(800, 600, "webp"), "image/webp"))).toEqual({
      full: [800, 600],
      display: [800, 600],
    });
  });

  it("makes the pixels upright from the EXIF orientation, which it doesn't keep", async () => {
    const turned = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#ff0000" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(turned).metadata()).orientation).toBe(6);
    const renditions = await ready(turned);
    expect(kinds(renditions)).toEqual({ full: [20, 40], display: [20, 40] });
    for (const rendition of renditions) expect((await sharp(rendition.bytes).metadata()).orientation).toBeUndefined();
  });

  it("strips the location, the capture date, every EXIF, XMP, IPTC and ICC block (spec 23, ADR-014)", async () => {
    const tagged = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#33aa66" } })
      .withIccProfile("p3")
      .withExif({
        IFD0: { Make: "CameraMakerName", Artist: "ArtistNameHere" },
        IFD2: { DateTimeOriginal: "2026:11:01 10:00:00" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "38/1 53/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "77/1 2/1 0/1" },
      })
      .withXmp(
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
          '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>XmpCreatorName</dc:creator>' +
          "</rdf:Description></rdf:RDF></x:xmpmeta>",
      )
      .jpeg()
      .toBuffer();
    const before = await sharp(tagged).metadata();
    expect([before.exif !== undefined, before.icc !== undefined, before.xmp !== undefined]).toEqual([true, true, true]);
    for (const word of ["ArtistNameHere", "CameraMakerName", "2026:11:01", "XmpCreatorName", "ICC_PROFILE"]) {
      expect(tagged.includes(word)).toBe(true);
    }
    for (const rendition of await ready(tagged)) {
      const after = await sharp(rendition.bytes).metadata();
      expect([after.exif, after.icc, after.xmp, after.iptc]).toEqual([undefined, undefined, undefined, undefined]);
      expect(after.space).toBe("srgb");
      for (const word of [
        "ArtistNameHere",
        "CameraMakerName",
        "2026:11:01",
        "XmpCreatorName",
        "ICC_PROFILE",
        "Exif",
        "http://ns.adobe.com/xap",
        "Photoshop 3.0",
      ]) {
        expect(rendition.bytes.includes(word)).toBe(false);
      }
    }
  });

  it("strips a PNG's EXIF and text too", async () => {
    const exif = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#123456" } })
      .withExif({ IFD0: { Artist: "PngArtistName" } })
      .png()
      .toBuffer();
    // A tEXt chunk after the header (8 bytes of signature, then IHDR's 25), as a PNG carries a comment.
    const data = Buffer.from("Comment\0PngCommentText", "latin1");
    const typed = Buffer.concat([Buffer.from("tEXt", "latin1"), data]);
    const text = Buffer.alloc(12 + data.length);
    text.writeUInt32BE(data.length, 0);
    typed.copy(text, 4);
    text.writeUInt32BE(crc32(typed), 8 + data.length);
    const png = Buffer.concat([exif.subarray(0, 33), text, exif.subarray(33)]);
    const header = await sharp(png).metadata();
    expect(header.exif).toBeDefined();
    expect(header.comments).toEqual([{ keyword: "Comment", text: "PngCommentText" }]);
    for (const rendition of await ready(png, "image/png")) {
      expect((await sharp(rendition.bytes).metadata()).exif).toBeUndefined();
      expect(rendition.bytes.includes("PngArtistName")).toBe(false);
      expect(rendition.bytes.includes("PngCommentText")).toBe(false);
    }
  });

  it("gives the same renditions for the same bytes, so a second try writes the same objects", async () => {
    const bytes = await noise(1600, 1200);
    const first = await ready(bytes);
    const second = await ready(bytes);
    expect(
      second.map((r) => [r.kind, r.bytes.equals(first.find((f) => f.kind === r.kind)?.bytes ?? Buffer.alloc(0))]),
    ).toEqual([
      ["full", true],
      ["display", true],
    ]);
  });
});

describe("a slow decode", () => {
  it("is the worker's limit, a failure to try again, never a rejection of the photo", async () => {
    // 64 megapixels at 16 bits a channel with alpha, not interlaced so its decode streams: small to make, and about
    // two seconds to decode for `full` on one thread.
    const bytes = await sharp({
      create: { width: 8000, height: 8000, channels: 4, background: "#4a7a5c80" },
      limitInputPixels: false,
    })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    await expect(prepareImage(bytes, "image/png", { seconds: 1 })).rejects.toBeInstanceOf(ImageTimeout);
  }, 60_000);

  it("is an error, never a rejection, when the code asks sharp for something it refuses", async () => {
    await expect(prepareImage(await flat(16, 16), "image/jpeg", { seconds: 0.5 })).rejects.toThrow(/seconds/);
  });
});
