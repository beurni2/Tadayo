// A photo prepared in a process of its own, which the worker watches and ends (./image-process.ts;
// docs/plans/api-b2-spike-prepare.md section 3.6; FQ138; PR #111's third and fourth reviews). Each test here starts
// real child processes, the photo's own or, for a child that misbehaves, a fake one; the rules that turn a child's end
// into an answer are tested on their own, case by case. Every image is made in the test.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  DEADLINE_SECONDS,
  DECODE_SECONDS,
  GRACE_MS,
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

/** A process's command line, its arguments joined by spaces, or "" once it ended. */
function commandOf(pid: number): string {
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, "latin1")
      .split("\0")
      .join(" ");
  } catch {
    return "";
  }
}

/** A process has ended once it is gone, or a zombie its new parent hasn't reaped yet. */
function ended(pid: number): boolean {
  const state = statOf(pid)?.[0];
  return state === undefined || state === "Z";
}

/** The pipes and sockets this process holds open, as `/proc/self/fd` names them, by their inode. */
function pipesHeld(): Set<string> {
  const held = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const target = readlinkSync(`/proc/self/fd/${fd}`);
      if (/^(pipe|socket):/.test(target)) held.add(target);
    } catch {
      // Closed as it was listed.
    }
  }
  return held;
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
  }, 60_000);

  it("passes a rejection on as it is", async () => {
    expect((await prepareIsolated(await testImage(64, 48, "png"), "image/jpeg")).prepared).toEqual({
      ok: false,
      rejection: "unsupported_type",
    });
  }, 20_000);

  it("goes first to the kernel's out-of-memory killer, and starts with an empty environment", async () => {
    process.env["TADAYO_TEST_SECRET"] = "not for the child";
    try {
      const answer = await prepareIsolated(await testImage(64, 48), "image/jpeg");
      expect(answer.oomScoreAdj).toBe(1000);
      // The one variable `sharp` sets in its own process as it loads (`VIPSHOME`), and none of the worker's. There is no
      // Node channel either now (Node took its variables out of a forked child's environment as it started, so the
      // one this test counted before was `VIPSHOME` too, not the channel's, as its comment said).
      expect(answer.environment).toBe(1);
    } finally {
      delete process.env["TADAYO_TEST_SECRET"];
    }
  }, 20_000);

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
  }, 20_000);

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
    expect(GRACE_MS).toBe(2000);
  });
});

/**
 * Children that misbehave, as one could whose decoder a stranger's bytes took over (PR #111's round 4, R4-3; the check
 * of its fifth commit, C5-1): each writes its messages to fd 3 as ./image-frames.ts frames them, with a framing of its
 * own here, says it is ready, reads the photo, then does as its name says. A well-formed answer's renditions end with
 * the byte given, so the test can tell two answers apart.
 */
const PRELUDE = `
import { spawn } from "node:child_process";
import { Socket } from "node:net";
const worker = new Socket({ fd: 3, readable: true, writable: true });
worker.on("error", () => {});
const write = (bytes) => new Promise((resolve) => worker.write(bytes, () => resolve()));
const frame = (header, bodies = []) => {
  const json = Buffer.from(typeof header === "string" ? header : JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([length, json, ...bodies]);
};
const send = (header, bodies) => write(frame(header, bodies));
const answer = (tag) => frame(
  {
    kind: "prepared",
    prepared: {
      ok: true,
      renditions: [
        { kind: "full", width: 2, height: 1, length: 4 },
        { kind: "display", width: 2, height: 1, length: 4 },
      ],
    },
    peakBytes: 1,
    oomScoreAdj: 0,
    environment: 0,
  },
  [Buffer.from([0xff, 0xd8, 0xff, tag]), Buffer.from([0xff, 0xd8, 0xff, tag])],
);
await send({ kind: "ready" });
for await (const chunk of process.stdin) void chunk;
`;
/**
 * A process in a session of its own, outside the group the worker kills, that holds the child's fd 3 for 3 s and then
 * exits: the worker settles a child's end at once only if it has closed its own end of that pipe.
 */
const HOLDS = `spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { detached: true, stdio: ["ignore", "ignore", "ignore", 3] });`;
const MISBEHAVING = {
  // A message of no kind of the child's, after ready.
  bogus: `await send({ kind: "bogus" });
setInterval(() => {}, 1000);`,
  // A second ready.
  twice: `await send({ kind: "ready" });
setInterval(() => {}, 1000);`,
  // Starts a process in a session of its own that holds fd 3 for 3 s, then sends a header that isn't JSON.
  garbled: `${HOLDS}
await send("not json at all");
setInterval(() => {}, 1000);`,
  // A header that declares 4 GiB, then a megabyte at a time for as long as it can write: Node's channel would have
  // buffered all of it (C5-1).
  huge: `const length = Buffer.alloc(4);
length.writeUInt32BE(0xffffffff);
await write(length);
const megabyte = Buffer.alloc(1024 * 1024, 0x61);
for (;;) await write(megabyte);`,
  // An answer whose renditions declare more than the message's cap, then their bytes for as long as it can write.
  overlong: `await send({ kind: "prepared", prepared: { ok: true, renditions: [{ length: 2 ** 31 }, { length: 2 ** 31 }] } });
const megabyte = Buffer.alloc(1024 * 1024, 0x61);
for (;;) await write(megabyte);`,
  // Starts a process in a session of its own that holds fd 3 for 3 s, answers, writes a second answer and more after
  // it, and exits.
  trailing: `${HOLDS}
await write(Buffer.concat([answer(1), Buffer.from("trailing bytes"), answer(2)]));
await new Promise((resolve) => setTimeout(resolve, 100));
process.exit(0);`,
  // Starts a process in its group that holds its pipes open, answers 0.3 s later and exits.
  holder: `spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: [0, "ignore", "ignore", 3] });
await new Promise((resolve) => setTimeout(resolve, 300));
await write(answer(1));
process.exit(0);`,
  // Answers, and never exits.
  lingers: `await write(answer(1));
setInterval(() => {}, 1000);`,
  // Exits with a code of its own, without answering.
  exits: `process.exit(3);`,
  // Crashes, as a decoder that met what it couldn't read.
  aborts: `process.abort();`,
} as const;

/** A child that sends its answer before it is ready. */
const EARLY = `
import { Socket } from "node:net";
const worker = new Socket({ fd: 3, readable: true, writable: true });
const json = Buffer.from(JSON.stringify({ kind: "failed" }));
const length = Buffer.alloc(4);
length.writeUInt32BE(json.length);
worker.write(Buffer.concat([length, json]));
setInterval(() => {}, 1000);
`;

/**
 * A child that never reads the photo, and starts a process in a session of its own, outside the group the worker
 * kills, which keeps the child's standard input and fd 3 open (the fifth commit's check, C5-1 and C5-2). It says it is
 * ready, and exits without answering; once it has, the process it started begins a message on fd 3 and writes it a
 * byte at a time, as a holder mid-frame would.
 */
const TRICKLE = `
const { writeSync } = require("node:fs");
setTimeout(() => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(4096);
  try { writeSync(3, length); } catch {}
  setInterval(() => { try { writeSync(3, "x"); } catch {} }, 20);
}, 500);
setInterval(() => {}, 1000);
`;
const ESCAPES = `
import { spawn } from "node:child_process";
import { Socket } from "node:net";
spawn(process.execPath, ["-e", ${JSON.stringify(TRICKLE)}], {
  detached: true,
  env: {},
  stdio: [0, "ignore", "ignore", 3],
});
const worker = new Socket({ fd: 3, readable: true, writable: true });
const json = Buffer.from(JSON.stringify({ kind: "ready" }));
const length = Buffer.alloc(4);
length.writeUInt32BE(json.length);
await new Promise((resolve) => worker.write(Buffer.concat([length, json]), () => resolve()));
await new Promise((resolve) => setTimeout(resolve, 300));
process.exit(0);
`;

describe("a photo's process that misbehaves (R4-3, C5-1)", () => {
  let folder = "";
  const fake = (name: keyof typeof MISBEHAVING | "early" | "escapes") => pathToFileURL(join(folder, `${name}.mjs`));
  const tagOf = (answer: { readonly prepared: { readonly ok: boolean } }) =>
    answer.prepared.ok && "renditions" in answer.prepared
      ? (answer.prepared as { readonly renditions: readonly { readonly bytes: Uint8Array }[] }).renditions.map(
          (rendition) => rendition.bytes[3],
        )
      : [];
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  // The processes a fake child started, ended after each test, even one that failed on its time limit.
  const started: number[] = [];

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "tadayo-image-fake-"));
    for (const [name, body] of Object.entries(MISBEHAVING)) {
      await writeFile(join(folder, `${name}.mjs`), PRELUDE + body);
    }
    await writeFile(join(folder, "early.mjs"), EARLY);
    await writeFile(join(folder, "escapes.mjs"), ESCAPES);
  });
  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });
  afterEach(() => {
    for (const pid of started.splice(0)) if (!ended(pid)) process.kill(pid, "SIGKILL");
  });

  it("fails, to be tried again, when the child sends anything but ready and then its answer, and ends it at once", async () => {
    for (const name of ["bogus", "twice", "garbled", "early"] as const) {
      const from = performance.now();
      await expect(prepareIsolated(photo, "image/jpeg", { child: fake(name) }), name).rejects.toBeInstanceOf(
        ImageProcessFailed,
      );
      // Each never exits of itself: the worker ended it as its message broke the order, long before its deadline.
      expect(performance.now() - from, name).toBeLessThan(GRACE_MS);
    }
  }, 30_000);

  it("fails at once on a length past its cap, the worker holding none of what the child goes on writing (C5-1)", async () => {
    const before = peakOf("self") ?? 0;
    for (const name of ["huge", "overlong"] as const) {
      const from = performance.now();
      await expect(prepareIsolated(photo, "image/jpeg", { child: fake(name) }), name).rejects.toBeInstanceOf(
        ImageProcessFailed,
      );
      expect(performance.now() - from, name).toBeLessThan(GRACE_MS);
    }
    // Node's channel took the worker from 66 to 468 MiB in 10 s on the first (the fifth commit's check).
    expect((peakOf("self") ?? 0) - before).toBeLessThan(8 * MiB);
  }, 30_000);

  it("keeps the first answer, and reads nothing after it", async () => {
    const from = performance.now();
    expect(tagOf(await prepareIsolated(photo, "image/jpeg", { child: fake("trailing") }))).toEqual([1, 1]);
    // A process outside the group holds fd 3, so the end settles at once only because the worker closed its own end.
    expect(performance.now() - from).toBeLessThan(GRACE_MS);
  }, 20_000);

  it("settles when the child ends though a process it started holds its pipes, and ends that process", async () => {
    const run = prepareIsolated(photo, "image/jpeg", { child: fake("holder") });
    const child = await until(() => childrenOf(process.pid).find((pid) => commandOf(pid).includes("holder.mjs")), 300);
    const holder = await until(() => childrenOf(child)[0], 300);
    started.push(holder);
    const from = performance.now();
    expect(tagOf(await run)).toEqual([1, 1]);
    // The worker ends the group once the answer is in: no grace to wait.
    expect(performance.now() - from).toBeLessThan(GRACE_MS);
    await until(() => (ended(holder) ? true : undefined), 100);
  }, 20_000);

  it("closes its ends of the child's pipes as it settles, though a process the child started outside its group holds them mid-message", async () => {
    const before = pipesHeld();
    // A megabyte, more than a pipe holds: the worker's write waits on a child that never reads it.
    const run = prepareIsolated(Buffer.alloc(MiB, 0xff), "image/jpeg", { child: fake("escapes") });
    const child = await until(() => childrenOf(process.pid).find((pid) => commandOf(pid).includes("escapes.mjs")), 300);
    const escaped = await until(() => childrenOf(child)[0], 300);
    started.push(escaped);
    // The child's standard input and fd 3, as the worker holds them.
    const opened = [...pipesHeld()].filter((pipe) => !before.has(pipe));
    expect(opened.length).toBeGreaterThanOrEqual(2);
    await expect(run).rejects.toBeInstanceOf(ImageProcessFailed);
    // Outside the group, the process the child started outlives the child's end, holding the other ends and writing
    // its message a byte at a time; the worker's ends are closed all the same.
    expect(ended(escaped)).toBe(false);
    await until(() => (opened.some((pipe) => pipesHeld().has(pipe)) ? undefined : true), 100);
  }, 20_000);

  it("ends a child that answered at once, though it would never exit, and keeps its answer", async () => {
    const from = performance.now();
    expect(tagOf(await prepareIsolated(photo, "image/jpeg", { child: fake("lingers"), deadlineSeconds: 10 }))).toEqual([
      1, 1,
    ]);
    expect(performance.now() - from).toBeLessThan(GRACE_MS);
  }, 20_000);

  it("fails, to be tried again, when the child exits with a code of its own without answering (R4-5)", async () => {
    await expect(prepareIsolated(photo, "image/jpeg", { child: fake("exits") })).rejects.toBeInstanceOf(
      ImageProcessFailed,
    );
  }, 20_000);

  it("refuses the photo as unreadable when the child crashes once it holds it", async () => {
    expect((await prepareIsolated(photo, "image/jpeg", { child: fake("aborts") })).prepared).toEqual({
      ok: false,
      rejection: "unreadable",
    });
  }, 20_000);
});

describe("what a child's end comes to", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const prepared = {
    kind: "prepared" as const,
    prepared: {
      ok: true as const,
      renditions: [
        { kind: "full" as const, bytes: jpeg, width: 2560, height: 2560 },
        { kind: "display" as const, bytes: jpeg, width: 1290, height: 1290 },
      ],
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
    expect([...(answer.prepared.renditions[0]?.bytes ?? [])]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(outcomeOf(end({ answer: { ...prepared, prepared: refused("unreadable") } })).prepared).toEqual(
      refused("unreadable"),
    );
  });

  it("refuses the photo as too_many_pixels when the worker killed it for memory, its peak passed, or SIGKILL ended it", () => {
    expect(outcomeOf(end({ killed: "memory", signal: "SIGKILL" })).prepared).toEqual(refused("too_many_pixels"));
    expect(outcomeOf(end({ answer: prepared, peakBytes: 353 * MiB })).prepared).toEqual(refused("too_many_pixels"));
    expect(outcomeOf(end({ signal: "SIGKILL" })).prepared).toEqual(refused("too_many_pixels"));
  });

  it("refuses the photo as unreadable when the child crashed once it held it", () => {
    for (const signal of ["SIGSEGV", "SIGBUS", "SIGABRT", "SIGILL", "SIGFPE"] as const) {
      expect(outcomeOf(end({ signal })).prepared).toEqual(refused("unreadable"));
    }
  });

  it("throws ImageTimeout for its deadline even past its memory, and for a decode's timeout within it", () => {
    expect(() => outcomeOf(end({ killed: "time", signal: "SIGKILL", peakBytes: 400 * MiB }))).toThrow(ImageTimeout);
    expect(() => outcomeOf(end({ answer: { kind: "timeout" } }))).toThrow(ImageTimeout);
    // A decode's timeout past the memory is the memory's: tried again, it would pass the memory again (R4-4).
    expect(outcomeOf(end({ answer: { kind: "timeout" }, peakBytes: 400 * MiB })).prepared).toEqual(
      refused("too_many_pixels"),
    );
  });

  it("throws ImageProcessFailed when it ended before it was ready, of its own accord or by another signal without answering, or its code threw", () => {
    expect(() => outcomeOf(end({ ready: false, signal: "SIGSEGV" }))).toThrow(ImageProcessFailed);
    // Killed for a broken answer, whatever signal that left (the worker's SIGKILL is a memory kill's too).
    expect(() => outcomeOf(end({ killed: "broken", signal: "SIGKILL" }))).toThrow(ImageProcessFailed);
    expect(() => outcomeOf(end({ killed: "broken", signal: "SIGKILL", ready: false }))).toThrow(ImageProcessFailed);
    expect(() => outcomeOf(end({ answer: { kind: "failed" } }))).toThrow(ImageProcessFailed);
    // Exited with a code, or ended by a signal that isn't a crash, after it was given the photo (R4-5).
    expect(() => outcomeOf(end({}))).toThrow(ImageProcessFailed);
    expect(() => outcomeOf(end({ signal: "SIGTERM" }))).toThrow(ImageProcessFailed);
  });

  it("throws ImageProcessFailed for an answer that isn't one rendition of each kind, a JPEG inside its box, or a rejection's code", () => {
    const full = { kind: "full", bytes: jpeg, width: 2560, height: 2560 };
    const display = { kind: "display", bytes: jpeg, width: 1290, height: 2560 };
    for (const renditions of [
      [],
      [full],
      [full, full],
      [full, display, display],
      [full, display, { ...display, kind: "thumbnail" }],
      [full, { ...display, kind: "thumbnail" }],
      [full, { ...display, bytes: "not bytes" }],
      [full, { ...display, bytes: new Uint8Array(0) }],
      [full, { ...display, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }],
      [full, { ...display, width: 0 }],
      [full, { ...display, width: 1.5 }],
      [full, { ...display, width: 1291 }],
      [{ ...full, height: 2561 }, display],
      [{ ...full, width: 2561 }, display],
    ]) {
      const malformed = { ...prepared, prepared: { ok: true, renditions } } as unknown as typeof prepared;
      expect(() => outcomeOf(end({ answer: malformed }))).toThrow(ImageProcessFailed);
    }
    expect(
      outcomeOf(end({ answer: { ...prepared, prepared: { ok: true, renditions: [display, full] } } as never })).prepared
        .ok,
    ).toBe(true);
    for (const rejection of ["no_such_code", 42, undefined]) {
      const malformed = { ...prepared, prepared: { ok: false, rejection } } as unknown as typeof prepared;
      expect(() => outcomeOf(end({ answer: malformed }))).toThrow(ImageProcessFailed);
    }
  });
});
