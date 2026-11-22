// The checks and the renditions of a photo, from its bytes alone (docs/plans/api-b2-spike-prepare.md sections 3
// and 4; D09; spec 23, 33; ADR-014; T12, T21). Every image here is made by `sharp` in the test, so no photograph
// is committed and nothing in one names anybody.

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contentHash, ImageTimeout, MAX_PIXELS, prepareImage, signatureOf, type Rendition } from "./image.ts";

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
    expect(
      await sharp(svg)
        .metadata()
        .catch((error: unknown) => (error as Error).message),
    ).toMatch(/unsupported image format/);
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
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#123456" } })
      .withExif({ IFD0: { Artist: "PngArtistName" } })
      .png()
      .toBuffer();
    expect((await sharp(png).metadata()).exif).toBeDefined();
    for (const rendition of await ready(png, "image/png")) {
      expect((await sharp(rendition.bytes).metadata()).exif).toBeUndefined();
      expect(rendition.bytes.includes("PngArtistName")).toBe(false);
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
    // 64 megapixels at 16 bits a channel with alpha, interlaced: small to make, seconds to decode.
    const bytes = await sharp({
      create: { width: 8000, height: 8000, channels: 4, background: "#4a7a5c80" },
      limitInputPixels: false,
    })
      .toColourspace("rgb16")
      .png({ progressive: true })
      .toBuffer();
    await expect(prepareImage(bytes, "image/png", { seconds: 1 })).rejects.toBeInstanceOf(ImageTimeout);
  }, 60_000);

  it("is an error, never a rejection, when the code asks sharp for something it refuses", async () => {
    await expect(prepareImage(await flat(16, 16), "image/jpeg", { seconds: 0.5 })).rejects.toThrow(/seconds/);
  });
});

describe("the scoped content hash (T21)", () => {
  it("is the same for one owner's same bytes, and different for another owner or other bytes", async () => {
    const bytes = await flat(32, 32);
    const other = await flat(32, 33);
    const a = contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes);
    expect(a).toHaveLength(32);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes).equals(a)).toBe(true);
    expect(contentHash("acct_bbbbbbbbbbbbbbbbbbbbbb", bytes).equals(a)).toBe(false);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", other).equals(a)).toBe(false);
  });

  it("is never a plain hash of the bytes, which anyone holding the photo could compute", async () => {
    const { createHash } = await import("node:crypto");
    const bytes = await flat(32, 32);
    expect(contentHash("acct_aaaaaaaaaaaaaaaaaaaaaa", bytes).equals(createHash("sha256").update(bytes).digest())).toBe(
      false,
    );
  });
});
