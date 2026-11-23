// How much memory one preparation takes at its peak, for the largest photo each decoder takes (FQ138; the worker's
// Machine has 512 MB, TECH-DESIGN section 6; docs/plans/api-b2-spike-prepare.md section 4.4). Each photo is
// prepared in a fresh Node process of its own, one after the other, which reports how far its peak resident memory
// rose during prepareImage alone, so neither this process nor another photo counts; and one past the budget is
// refused before its decode holds anything. The peak is Linux's `VmHWM`, which starts afresh with each program: the
// `maxRSS` of `process.resourceUsage()` begins a child at the size of the process that started it, which here grows
// as it makes the photos, and that hid a child's rise (PR #111's second review). Every image is made here, by `sharp` or chunk by chunk, and none is one
// colour: a codec stores a flat image in less, so it would measure a decoder at its best.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animatedWebp, losslessAlphaWebp, pattern } from "./testing.ts";

/**
 * The most one preparation may add to the worker's peak. With the process's own memory before it, about 100 MiB
 * here, that stays under 400 MiB of the Machine's 512 MB (488 MiB). Before FQ138's budget, a progressive JPEG or an
 * interlaced PNG within 64 megapixels added up to 671 MiB, and an animated WebP 647.
 */
const MAX_RISE_MIB = 288;
/** The most a refusal by the header may add: it reads the header alone. */
const MAX_REFUSAL_RISE_MIB = 32;

const IMAGE_MODULE = new URL("./image.ts", import.meta.url).pathname;
const CHILD = `
const [, modulePath, file, type] = process.argv;
const { readFileSync } = await import("node:fs");
const { prepareImage } = await import(modulePath);
const peakKiB = () => {
  const found = /^VmHWM:\\s+(\\d+) kB$/m.exec(readFileSync("/proc/self/status", "latin1"));
  if (found === null) throw new Error("no VmHWM in /proc/self/status");
  return Number(found[1]);
};
const bytes = readFileSync(file);
const before = peakKiB();
const prepared = await prepareImage(bytes, type);
const after = peakKiB();
process.stdout.write(JSON.stringify({ ok: prepared.ok, riseKiB: after - before, peakKiB: after }));
`;

/** An animated WebP of `side` by `side`: a first frame over the whole canvas, then 64 pixels at its far corner. */
async function animated(side: number, first: Buffer, firstSide = side): Promise<Buffer> {
  const corner = await pattern(64, 64).webp().toBuffer();
  return animatedWebp(side, side, [
    { still: first, x: 0, y: 0, width: firstSide, height: firstSide },
    { still: corner, x: (side - 64) & ~1, y: (side - 64) & ~1, width: 64, height: 64 },
  ]);
}

/**
 * The largest each decoder takes: at the held-bytes budget for those that hold the whole image, else 64 MP; then,
 * past the budget, the same kinds at 64 MP.
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

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "tadayo-image-memory-"));
});
afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("one preparation's peak memory (FQ138)", () => {
  it(`stays within ${String(MAX_RISE_MIB)} MiB for the largest photo each decoder takes, and refuses one past the budget holding nothing`, async () => {
    const run = promisify(execFile);
    const results: { name: string; refused: boolean; ok: boolean; riseMiB: number; peakMiB: number }[] = [];
    // One at a time: children started together each begin from more memory, which hides some of their rise.
    for (const [i, c] of CASES.entries()) {
      const file = join(folder, String(i));
      await writeFile(file, await c.bytes());
      const { stdout } = await run(process.execPath, ["--input-type=module", "-e", CHILD, IMAGE_MODULE, file, c.type], {
        env: { PATH: process.env.PATH ?? "" },
      });
      const { ok, riseKiB, peakKiB } = JSON.parse(stdout) as { ok: boolean; riseKiB: number; peakKiB: number };
      results.push({
        name: c.name,
        refused: c.refused === true,
        ok,
        riseMiB: Math.round(riseKiB / 1024),
        peakMiB: Math.round(peakKiB / 1024),
      });
      await rm(file);
    }
    console.info(
      results.map((r) => `${r.name}: ${String(r.riseMiB)} MiB more, ${String(r.peakMiB)} MiB at the peak`).join("\n"),
    );
    for (const result of results) {
      const most = result.refused ? MAX_REFUSAL_RISE_MIB : MAX_RISE_MIB;
      expect({ name: result.name, ok: result.ok, within: result.riseMiB <= most }).toEqual({
        name: result.name,
        ok: !result.refused,
        within: true,
      });
    }
  }, 300_000);
});
