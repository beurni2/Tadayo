// How much memory a photo's preparation takes, in the process of its own the worker prepares it in
// (./image-process.ts; FQ138; the worker's Machine has 512 MB, TECH-DESIGN section 6;
// docs/plans/api-b2-spike-prepare.md section 4.4). Each photo goes through prepareIsolated, as the worker sends it,
// one after the other, and the child's peak resident memory is Linux's `VmHWM`, which starts afresh with each
// program. The photos named here, of each kind the largest at the budget or at 64 megapixels, must stay under the
// child's cap, PEAK_BYTES (not every photo the checks take: the cap holds the rest); one past the budget is
// refused before its decode holds anything; and the files PR #111's third review and the lane's own probes built
// to hold what no header shows are refused, by their structure or by the cap. Then the largest are prepared back to
// back, twice, from a fresh Node process that doesn't load `sharp`, as the worker doesn't: its own memory must stay
// where it started, whatever the photos held. Every image is made here, by `sharp` or byte by byte, and none is one
// colour: a codec stores a flat image in less, so it would measure a decoder at its best.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PEAK_BYTES, prepareIsolated } from "./image-process.ts";
import {
  animatedWebp,
  huffmanWebp,
  junkWebp,
  losslessAlphaWebp,
  manyScansJpeg,
  pattern,
  textBombPng,
} from "./testing.ts";

const MiB = 1024 * 1024;
/** The most a refusal by the structure or the header may take: the child reads the header alone. */
const MAX_REFUSAL_PEAK_MIB = 160;
/**
 * The most the worker's own memory may rise while it sends the largest photos to their processes. A worker that
 * decoded a photo itself would pass 250 MiB at the first large one; one that doesn't still holds each photo's bytes
 * and renditions until V8 collects them, which it does lazily, and its allocator keeps much of what it frees: over
 * 78 photos back to back the lane measured the rise level off at 92 MiB, and at 75 with a collection forced after
 * every 13 (docs/plans/api-b2-spike-prepare.md section 4.4).
 */
const MAX_WORKER_RISE_MIB = 128;

const PROCESS_MODULE = new URL("./image-process.ts", import.meta.url).pathname;

/** An animated WebP of `side` by `side`: a first frame over the whole canvas, then 64 pixels at its far corner. */
async function animated(side: number, first: Buffer, firstSide = side): Promise<Buffer> {
  const corner = await pattern(64, 64).webp().toBuffer();
  return animatedWebp(side, side, [
    { still: first, x: 0, y: 0, width: firstSide, height: firstSide },
    { still: corner, x: (side - 64) & ~1, y: (side - 64) & ~1, width: 64, height: 64 },
  ]);
}

/**
 * Of each kind, the largest: at the held-bytes budget for those that hold the whole image (64 MP for a greyscale
 * one), else 64 MP; then, past the budget, the same kinds at 64 MP.
 */
const CASES: readonly { name: string; type: string; bytes: () => Promise<Buffer>; refused?: true }[] = [
  {
    name: "a progressive JPEG at the budget",
    type: "image/jpeg",
    bytes: () => pattern(4704, 4704).jpeg({ progressive: true, chromaSubsampling: "4:4:4" }).toBuffer(),
  },
  {
    name: "a progressive CMYK JPEG at the budget",
    type: "image/jpeg",
    bytes: () => pattern(4096, 4096).toColourspace("cmyk").jpeg({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced PNG at the budget",
    type: "image/png",
    bytes: () => pattern(5792, 5792, 4).png({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced 16-bit PNG at the budget",
    type: "image/png",
    bytes: () => pattern(4096, 4096, 4).toColourspace("rgb16").png({ progressive: true }).toBuffer(),
  },
  // With one or two samples a pixel, these reach 64 MP within the budget.
  {
    name: "a greyscale progressive JPEG of 64 megapixels",
    type: "image/jpeg",
    bytes: () => pattern(8000, 8000).toColourspace("b-w").jpeg({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced 16-bit greyscale PNG of 64 megapixels",
    type: "image/png",
    bytes: () => pattern(8000, 8000).toColourspace("grey16").png({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced greyscale PNG with alpha of 64 megapixels",
    type: "image/png",
    bytes: () => pattern(8000, 8000, 4).toColourspace("b-w").png({ progressive: true }).toBuffer(),
  },
  {
    name: "a lossless WebP at the budget",
    type: "image/webp",
    bytes: () => pattern(5792, 5792, 4).webp({ lossless: true }).toBuffer(),
  },
  {
    name: "a lossy WebP with a lossless alpha at the budget",
    type: "image/webp",
    bytes: () => losslessAlphaWebp(5181, 5181),
  },
  {
    name: "an animated WebP at the budget",
    type: "image/webp",
    bytes: async () => animated(3663, await losslessAlphaWebp(3663, 3663)),
  },
  {
    name: "a 16-bit PNG of 64 megapixels",
    type: "image/png",
    bytes: () => pattern(8000, 8000, 4).toColourspace("rgb16").png().toBuffer(),
  },
  {
    name: "a baseline JPEG of 64 megapixels to turn upright",
    type: "image/jpeg",
    bytes: () => pattern(8000, 8000).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
  },
  {
    name: "a lossy WebP of 64 megapixels",
    type: "image/webp",
    bytes: () => pattern(8000, 8000).webp().toBuffer(),
  },
  // Past the budget, within 64 megapixels: before FQ138, 424, 668, 278, 340 and 647 MiB more (PR #111's reviews).
  {
    name: "a progressive JPEG of 64 megapixels",
    type: "image/jpeg",
    bytes: () => pattern(8000, 8000).jpeg({ progressive: true, chromaSubsampling: "4:4:4" }).toBuffer(),
    refused: true,
  },
  {
    name: "an interlaced 16-bit PNG of 64 megapixels",
    type: "image/png",
    bytes: () => pattern(8000, 8000, 4).toColourspace("rgb16").png({ progressive: true }).toBuffer(),
    refused: true,
  },
  {
    name: "a lossless WebP of 64 megapixels",
    type: "image/webp",
    bytes: () => pattern(8000, 8000, 4).webp({ lossless: true }).toBuffer(),
    refused: true,
  },
  {
    name: "a lossy WebP with a lossless alpha of 64 megapixels",
    type: "image/webp",
    bytes: () => losslessAlphaWebp(8000, 8000),
    refused: true,
  },
  {
    name: "an animated WebP of 64 megapixels, its frames small",
    type: "image/webp",
    bytes: async () => animated(8000, await pattern(64, 64).webp().toBuffer(), 64),
    refused: true,
  },
];

/** A file built to hold what no header shows, and the code it is refused with. */
const HOSTILE: readonly { name: string; type: string; bytes: () => Promise<Buffer>; rejection: string }[] = [
  {
    name: "a 50 KB PNG whose compressed text inflates to 49 MiB (R3-1)",
    type: "image/png",
    bytes: () => Promise.resolve(textBombPng(1, 49)),
    rejection: "too_many_pixels",
  },
  {
    name: "a 164 KB PNG of four compressed texts of 40 MiB (R3-1)",
    type: "image/png",
    bytes: () => Promise.resolve(textBombPng(4, 40)),
    rejection: "too_many_pixels",
  },
  {
    name: "a lossless WebP of 1 megapixel and 65,536 Huffman groups (R3-4)",
    type: "image/webp",
    bytes: () => Promise.resolve(huffmanWebp(1024, 1024, 65_536)),
    rejection: "too_many_pixels",
  },
  {
    name: "a lossless WebP at the budget with 30,000 Huffman groups (R3-4)",
    type: "image/webp",
    bytes: () => Promise.resolve(huffmanWebp(5792, 5792, 30_000)),
    rejection: "too_many_pixels",
  },
  {
    name: "one lossless frame on 64 megapixels, with a trailer past its RIFF (R3-2)",
    type: "image/webp",
    bytes: async () =>
      Buffer.concat([
        animatedWebp(8000, 8000, [
          {
            still: await pattern(8000, 7998, 4).webp({ lossless: true }).toBuffer(),
            x: 0,
            y: 0,
            width: 8000,
            height: 7998,
          },
        ]),
        Buffer.concat([Buffer.from("VP8 ", "latin1"), Buffer.alloc(4)]),
      ]),
    rejection: "unreadable",
  },
  {
    name: "one small frame on 64 megapixels, no trailer (R3-2)",
    type: "image/webp",
    bytes: async () =>
      animatedWebp(8000, 8000, [
        { still: await pattern(64, 64).webp().toBuffer(), x: 7936, y: 7936, width: 64, height: 64 },
      ]),
    rejection: "too_many_pixels",
  },
  {
    name: "a 20 MiB WebP of 2.6 million empty chunks",
    type: "image/webp",
    bytes: () => junkWebp(2_621_400),
    rejection: "unsupported_type",
  },
  {
    name: "a progressive JPEG at the budget of 2,688 scans (R3-6)",
    type: "image/jpeg",
    bytes: () => Promise.resolve(manyScansJpeg(4704, 4704, 2688)),
    rejection: "unsupported_type",
  },
];

/** A fresh Node process that sends each file to its own process in turn, as the worker does, and reports. */
const BACK_TO_BACK = `
const [, modulePath, ...rest] = process.argv;
const { readFileSync } = await import("node:fs");
const { peakOf, prepareIsolated } = await import(modulePath);
const start = peakOf("self");
const photos = [];
for (let i = 0; i < rest.length; i += 2) {
  const answer = await prepareIsolated(readFileSync(rest[i]), rest[i + 1]);
  photos.push({ ok: answer.prepared.ok, peak: answer.peakBytes });
}
process.stdout.write(JSON.stringify({ start, end: peakOf("self"), photos }));
`;

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "tadayo-image-memory-"));
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("a photo's process's peak memory (FQ138)", () => {
  it(`keeps each named photo's process under ${String(PEAK_BYTES / MiB)} MiB, of each kind the largest at the budget or at 64 megapixels, and refuses those past the budget holding nothing`, async () => {
    const results: { name: string; refused: boolean; ok: boolean; peakMiB: number }[] = [];
    for (const c of CASES) {
      const answer = await prepareIsolated(await c.bytes(), c.type as "image/jpeg");
      results.push({
        name: c.name,
        refused: c.refused === true,
        ok: answer.prepared.ok,
        peakMiB: Math.round(answer.peakBytes / MiB),
      });
    }
    console.info(results.map((r) => `${r.name}: ${String(r.peakMiB)} MiB at the peak`).join("\n"));
    for (const result of results) {
      const most = result.refused ? MAX_REFUSAL_PEAK_MIB : PEAK_BYTES / MiB;
      expect({ name: result.name, ok: result.ok, within: result.peakMiB <= most }).toEqual({
        name: result.name,
        ok: !result.refused,
        within: true,
      });
    }
  }, 300_000);

  it("refuses every file built to hold what no header shows, by its structure or by the cap", async () => {
    const results: { name: string; answer: string; peakMiB: number }[] = [];
    for (const c of HOSTILE) {
      const answer = await prepareIsolated(await c.bytes(), c.type as "image/jpeg");
      results.push({
        name: c.name,
        answer: answer.prepared.ok ? "taken" : answer.prepared.rejection,
        peakMiB: Math.round(answer.peakBytes / MiB),
      });
    }
    console.info(results.map((r) => `${r.name}: ${r.answer}, ${String(r.peakMiB)} MiB at the peak`).join("\n"));
    expect(results.map((r) => [r.name, r.answer])).toEqual(HOSTILE.map((c) => [c.name, c.rejection]));
  }, 300_000);

  it(`leaves the worker's own memory within ${String(MAX_WORKER_RISE_MIB)} MiB of where it started, the largest photos sent back to back, twice`, async () => {
    const args: string[] = [];
    for (const [i, c] of CASES.filter((c) => c.refused !== true).entries()) {
      const file = join(folder, String(i));
      await writeFile(file, await c.bytes());
      args.push(file, c.type);
    }
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", BACK_TO_BACK, PROCESS_MODULE, ...args, ...args],
      { env: { PATH: process.env.PATH ?? "" }, maxBuffer: 1024 * 1024 },
    );
    const { start, end, photos } = JSON.parse(stdout) as {
      start: number;
      end: number;
      photos: { ok: boolean; peak: number }[];
    };
    console.info(
      `the worker: ${String(Math.round(start / MiB))} MiB at the start, ${String(Math.round(end / MiB))} MiB at ` +
        `its peak after ${String(photos.length)} photos, each process's peak at most ` +
        `${String(Math.round(Math.max(...photos.map((p) => p.peak)) / MiB))} MiB`,
    );
    expect(photos.every((p) => p.ok)).toBe(true);
    expect((end - start) / MiB).toBeLessThanOrEqual(MAX_WORKER_RISE_MIB);
  }, 300_000);
});
