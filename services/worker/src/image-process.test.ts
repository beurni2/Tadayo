// A photo prepared in a process of its own, which the worker watches and ends (./image-process.ts;
// docs/plans/api-b2-spike-prepare.md section 3.6; FQ138; PR #111's third review). Each test here starts real child
// processes; the rules that turn a child's end into an answer are tested on their own, case by case. Every image is
// made in the test.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DEADLINE_SECONDS,
  DECODE_SECONDS,
  ImageProcessFailed,
  ImageTimeout,
  outcomeOf,
  PEAK_BYTES,
  peakOf,
  prepareIsolated,
  type ChildEnd,
} from "./image-process.ts";
import { prepareImage } from "./image.ts";
import { pattern, testImage, textBombPng } from "./testing.ts";

const MiB = 1024 * 1024;

const PROCESS_MODULE = new URL("./image-process.ts", import.meta.url).pathname;

/** A worker of its own: it sends the photo in the file to its process, and waits to be killed. */
const WORKER = `
const [, modulePath, file] = process.argv;
const { readFileSync } = await import("node:fs");
const { prepareIsolated } = await import(modulePath);
prepareIsolated(readFileSync(file), "image/png").catch(() => undefined);
setInterval(() => undefined, 1000);
`;

/** The fields of `/proc/<pid>/stat` after the program's name, which may hold spaces: its state, its parent, … */
function statOf(pid: number | string): string[] | undefined {
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, "latin1");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  } catch {
    return undefined;
  }
}

/** The processes whose parent is `pid`. */
function childrenOf(pid: number | undefined): number[] {
  return readdirSync("/proc")
    .filter((entry) => /^\d+$/.test(entry) && pid !== undefined && statOf(entry)?.[1] === String(pid))
    .map(Number);
}

/** A process has ended once it is gone, or a zombie its new parent hasn't reaped yet. */
function ended(pid: number): boolean {
  const state = statOf(pid)?.[0];
  return state === undefined || state === "Z";
}

/** What `look` finds, looking every 10 ms, at most `tries` times; it throws if it finds nothing. */
async function until<T>(look: () => T | undefined, tries: number): Promise<T> {
  for (let i = 0; i < tries; i += 1) {
    const found = look();
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("not found in time");
}

describe("a photo's own process", () => {
  it("answers as prepareImage does in this process, rendition for rendition, byte for byte", async () => {
    const photo = await pattern(3000, 2000).jpeg().toBuffer();
    const here = await prepareImage(photo, "image/jpeg");
    const { prepared, peakBytes } = await prepareIsolated(photo, "image/jpeg");
    expect(prepared).toEqual(here);
    if (!prepared.ok) throw new Error("expected renditions");
    for (const rendition of prepared.renditions) expect(Buffer.isBuffer(rendition.bytes)).toBe(true);
    expect(peakBytes).toBeGreaterThan(32 * MiB);
    expect(peakBytes).toBeLessThan(PEAK_BYTES);
  });

  it("passes a rejection on as it is", async () => {
    expect((await prepareIsolated(await testImage(64, 48, "png"), "image/jpeg")).prepared).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
  });

  it("goes first to the kernel's out-of-memory killer, and has none of the worker's environment", async () => {
    process.env["TADAYO_TEST_SECRET"] = "not for the child";
    try {
      const answer = await prepareIsolated(await testImage(64, 48), "image/jpeg");
      expect(answer.oomScoreAdj).toBe(1000);
      // Node's own channel to the worker, and nothing else.
      expect(answer.environment).toBeLessThanOrEqual(1);
    } finally {
      delete process.env["TADAYO_TEST_SECRET"];
    }
  });

  it("is killed past its peak memory, before it can answer, and the photo refused as too_many_pixels", async () => {
    // A 16-bit PNG of 64 megapixels streams, its process peaking near 300 MiB once both decodes are done
    // (image-memory.test.ts): one that answered would report that peak, and be refused for it all the same.
    const photo = await pattern(8000, 8000, 4).toColourspace("rgb16").png().toBuffer();
    const answer = await prepareIsolated(photo, "image/png", { peakBytes: 100 * MiB });
    expect(answer.prepared).toEqual({ ok: false, rejection: "too_many_pixels" });
    // Killed as it passed 100 MiB, within one read 10 ms apart: far below the peak it would have reached.
    expect(answer.peakBytes).toBeGreaterThan(100 * MiB);
    expect(answer.peakBytes).toBeLessThan(200 * MiB);
  }, 60_000);

  it("refuses a PNG whose compressed text would take the worker past its Machine, the worker holding none of it (R3-1)", async () => {
    // One `zTXt` of 49 MiB in a file of 50 KB took the process to 398 MiB, and four of 40 MiB to 943 MiB.
    const bombs = [textBombPng(1, 49), textBombPng(4, 40)];
    const before = peakOf("self") ?? 0;
    for (const bomb of bombs) {
      expect(bomb.length).toBeLessThan(200 * 1024);
      const answer = await prepareIsolated(bomb, "image/png");
      expect(answer.prepared).toEqual({ ok: false, rejection: "too_many_pixels" });
      expect(answer.peakBytes).toBeGreaterThan(PEAK_BYTES);
    }
    expect((peakOf("self") ?? 0) - before).toBeLessThan(32 * MiB);
  }, 60_000);

  it("is killed past its deadline, whatever it is doing, and the decode is tried again (ImageTimeout)", async () => {
    // A 16-bit PNG of 64 megapixels takes about two seconds to decode for `full`.
    const slow = await pattern(8000, 8000, 4).toColourspace("rgb16").png().toBuffer();
    const started = Date.now();
    await expect(prepareIsolated(slow, "image/png", { deadlineSeconds: 0.5 })).rejects.toBeInstanceOf(ImageTimeout);
    expect(Date.now() - started).toBeLessThan(1500);
  }, 60_000);

  it("passes a decode's own timeout on as ImageTimeout", async () => {
    const slow = await sharp({
      create: { width: 8000, height: 8000, channels: 4, background: "#4a7a5c80" },
      limitInputPixels: false,
    })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    await expect(prepareIsolated(slow, "image/png", { seconds: 1 })).rejects.toBeInstanceOf(ImageTimeout);
  }, 60_000);

  it("fails, to be tried again, when its code throws, never refusing the photo", async () => {
    // `sharp` refuses a timeout that isn't a whole number of seconds as it builds the pipeline.
    await expect(prepareIsolated(await testImage(16, 16), "image/jpeg", { seconds: 0.5 })).rejects.toBeInstanceOf(
      ImageProcessFailed,
    );
  });

  it("ends with the worker: a worker killed while its photo is decoded leaves no process behind", async () => {
    // A 16-bit PNG of 64 megapixels takes about two seconds to decode for `full`, and as long again for `display`.
    const slow = await pattern(8000, 8000, 4).toColourspace("rgb16").png().toBuffer();
    const folder = await mkdtemp(join(tmpdir(), "tadayo-image-orphan-"));
    const file = join(folder, "slow.png");
    await writeFile(file, slow);
    const worker = spawn(process.execPath, ["--input-type=module", "-e", WORKER, PROCESS_MODULE, file], {
      env: { PATH: process.env.PATH ?? "" },
      stdio: "ignore",
    });
    let child: number | undefined;
    try {
      // Its process, once its decode is well under way: starting and reading the photo take it to about 120 MiB, and
      // past 200 it decodes for seconds more (seen every 10 ms in the session: 200 MiB at 0.3 s, its answer at 4.1 s).
      // A child found sooner could end of the photo's bytes cut short, whether or not it ends with its worker.
      child = await until(() => childrenOf(worker.pid).find((pid) => (peakOf(pid) ?? 0) > 200 * MiB), 3000);
      worker.kill("SIGKILL");
      const orphan = child;
      // Within a second, where its decodes would take four.
      await until(() => (ended(orphan) ? true : undefined), 100);
    } finally {
      if (child !== undefined && !ended(child)) process.kill(child, "SIGKILL");
      worker.kill("SIGKILL");
      await rm(folder, { recursive: true, force: true });
    }
  }, 60_000);

  it("gives each decode a minute, and the process the header, both decodes and its start", () => {
    expect(DECODE_SECONDS).toBe(60);
    expect(DEADLINE_SECONDS).toBe(150);
    expect(PEAK_BYTES).toBe(352 * MiB);
  });
});

describe("what a child's end comes to", () => {
  const prepared = {
    kind: "prepared" as const,
    prepared: {
      ok: true as const,
      renditions: [{ kind: "full" as const, bytes: new Uint8Array([1, 2, 3]), width: 3, height: 1 }],
    },
    peakBytes: 90 * MiB,
    oomScoreAdj: 1000,
    environment: 1,
  };
  const end = (fields: Partial<ChildEnd>): ChildEnd => ({
    ready: true,
    signal: null,
    peakBytes: 90 * MiB,
    mostBytes: 352 * MiB,
    ...fields,
  });
  const refused = (rejection: "too_many_pixels" | "unreadable") => ({ ok: false as const, rejection });

  it("is the child's answer when it answered within its memory, its renditions as Buffers", () => {
    const answer = outcomeOf(end({ answer: prepared }));
    expect(answer.prepared.ok).toBe(true);
    if (!answer.prepared.ok) return;
    expect(Buffer.isBuffer(answer.prepared.renditions[0]?.bytes)).toBe(true);
    expect([...(answer.prepared.renditions[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
    expect(outcomeOf(end({ answer: { ...prepared, prepared: refused("unreadable") } })).prepared).toEqual(
      refused("unreadable"),
    );
  });

  it("refuses the photo as too_many_pixels when the worker killed it for memory, its peak passed, or SIGKILL ended it", () => {
    expect(outcomeOf(end({ killed: "memory", signal: "SIGKILL" })).prepared).toEqual(refused("too_many_pixels"));
    expect(outcomeOf(end({ answer: prepared, peakBytes: 353 * MiB })).prepared).toEqual(refused("too_many_pixels"));
    expect(outcomeOf(end({ signal: "SIGKILL" })).prepared).toEqual(refused("too_many_pixels"));
  });

  it("refuses the photo as unreadable when the child died otherwise once it held it", () => {
    expect(outcomeOf(end({ signal: "SIGSEGV" })).prepared).toEqual(refused("unreadable"));
    expect(outcomeOf(end({ signal: "SIGABRT" })).prepared).toEqual(refused("unreadable"));
    expect(outcomeOf(end({})).prepared).toEqual(refused("unreadable"));
  });

  it("throws ImageTimeout for its deadline or a decode's timeout, even past its memory", () => {
    expect(() => outcomeOf(end({ killed: "time", signal: "SIGKILL", peakBytes: 400 * MiB }))).toThrow(ImageTimeout);
    expect(() => outcomeOf(end({ answer: { kind: "timeout" } }))).toThrow(ImageTimeout);
  });

  it("throws ImageProcessFailed when it ended before it was ready, its code threw, or its answer is malformed", () => {
    expect(() => outcomeOf(end({ ready: false, signal: "SIGSEGV" }))).toThrow(ImageProcessFailed);
    expect(() => outcomeOf(end({ answer: { kind: "failed" } }))).toThrow(ImageProcessFailed);
    for (const renditions of [
      [{ kind: "thumbnail", bytes: new Uint8Array(1), width: 1, height: 1 }],
      [{ kind: "full", bytes: "not bytes", width: 1, height: 1 }],
      [{ kind: "full", bytes: new Uint8Array(1), width: 0, height: 1 }],
      [{ kind: "full", bytes: new Uint8Array(1), width: 1.5, height: 1 }],
    ]) {
      const malformed = { ...prepared, prepared: { ok: true, renditions } } as unknown as typeof prepared;
      expect(() => outcomeOf(end({ answer: malformed }))).toThrow(ImageProcessFailed);
    }
  });
});
