// How much memory one preparation takes at its peak, for the largest photo each decoder takes (FQ138; the worker's
// Machine has 512 MB, TECH-DESIGN section 6; docs/plans/api-b2-spike-prepare.md section 4.4). Each photo is
// prepared in a fresh Node process of its own, which reports how far its peak resident memory rose during
// prepareImage alone, so neither this process nor another photo counts; and one past the budget is refused before
// its decode holds anything. Every image is made by `sharp` here.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The most one preparation may add to the worker's peak. With the process's own memory before it, 105 to 146 MiB
 * here, that stays under 440 MiB of the Machine's 512 MB (488 MiB). Before FQ138's budget, a progressive JPEG or an
 * interlaced PNG within 64 megapixels added up to 671 MiB.
 */
const MAX_RISE_MIB = 288;
/** The most a refusal by the header may add: it reads the header alone. */
const MAX_REFUSAL_RISE_MIB = 32;

const IMAGE_MODULE = new URL("./image.ts", import.meta.url).pathname;
const CHILD = `
const [, modulePath, file, type] = process.argv;
const { readFileSync } = await import("node:fs");
const { prepareImage } = await import(modulePath);
const bytes = readFileSync(file);
const before = process.resourceUsage().maxRSS;
const prepared = await prepareImage(bytes, type);
const after = process.resourceUsage().maxRSS;
process.stdout.write(JSON.stringify({ ok: prepared.ok, riseKiB: after - before, peakKiB: after }));
`;

type Canvas = { width: number; height: number; channels: 3 | 4 };
const make = ({ width, height, channels }: Canvas) =>
  sharp({
    create: { width, height, channels, background: channels === 4 ? "#4a7a5c80" : "#4a7a5c" },
    limitInputPixels: false,
  });

/** The largest each decoder takes: at the held-bytes budget for the two that hold the whole image, else 64 MP. */
const CASES: readonly { name: string; type: string; bytes: () => Promise<Buffer>; refused?: true }[] = [
  {
    name: "a progressive JPEG at the budget",
    type: "image/jpeg",
    bytes: () =>
      make({ width: 4704, height: 4704, channels: 3 })
        .jpeg({ progressive: true, chromaSubsampling: "4:4:4" })
        .toBuffer(),
  },
  {
    name: "a progressive CMYK JPEG at the budget",
    type: "image/jpeg",
    bytes: () =>
      make({ width: 4096, height: 4096, channels: 3 }).toColourspace("cmyk").jpeg({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced PNG at the budget",
    type: "image/png",
    bytes: () => make({ width: 5792, height: 5792, channels: 4 }).png({ progressive: true }).toBuffer(),
  },
  {
    name: "an interlaced 16-bit PNG at the budget",
    type: "image/png",
    bytes: () =>
      make({ width: 4096, height: 4096, channels: 4 }).toColourspace("rgb16").png({ progressive: true }).toBuffer(),
  },
  {
    name: "a 16-bit PNG of 64 megapixels",
    type: "image/png",
    bytes: () => make({ width: 8000, height: 8000, channels: 4 }).toColourspace("rgb16").png().toBuffer(),
  },
  {
    name: "a baseline JPEG of 64 megapixels to turn upright",
    type: "image/jpeg",
    bytes: () => make({ width: 8000, height: 8000, channels: 3 }).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
  },
  {
    name: "a lossless WebP with alpha of 64 megapixels",
    type: "image/webp",
    bytes: () => make({ width: 8000, height: 8000, channels: 4 }).webp({ lossless: true }).toBuffer(),
  },
  {
    name: "a lossy WebP of 64 megapixels",
    type: "image/webp",
    bytes: () => make({ width: 8000, height: 8000, channels: 3 }).webp().toBuffer(),
  },
  // Past the budget, within 64 megapixels: before FQ138, 424 and 668 MiB more (PR #111's first review).
  {
    name: "a progressive JPEG of 64 megapixels",
    type: "image/jpeg",
    bytes: () =>
      make({ width: 8000, height: 8000, channels: 3 })
        .jpeg({ progressive: true, chromaSubsampling: "4:4:4" })
        .toBuffer(),
    refused: true,
  },
  {
    name: "an interlaced 16-bit PNG of 64 megapixels",
    type: "image/png",
    bytes: () =>
      make({ width: 8000, height: 8000, channels: 4 }).toColourspace("rgb16").png({ progressive: true }).toBuffer(),
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
    const files = await Promise.all(
      CASES.map(async (c, i) => {
        const file = join(folder, String(i));
        await writeFile(file, await c.bytes());
        return file;
      }),
    );
    const run = promisify(execFile);
    const results = await Promise.all(
      CASES.map(async (c, i) => {
        const { stdout } = await run(
          process.execPath,
          ["--input-type=module", "-e", CHILD, IMAGE_MODULE, files[i] ?? "", c.type],
          { env: { PATH: process.env.PATH ?? "" } },
        );
        const { ok, riseKiB, peakKiB } = JSON.parse(stdout) as { ok: boolean; riseKiB: number; peakKiB: number };
        return {
          name: c.name,
          refused: c.refused === true,
          ok,
          riseMiB: Math.round(riseKiB / 1024),
          peakMiB: Math.round(peakKiB / 1024),
        };
      }),
    );
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
  }, 180_000);
});
