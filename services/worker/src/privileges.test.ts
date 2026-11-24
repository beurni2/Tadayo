// Each photo under a user of its own (./privileges.ts; docs/plans/api-b2-worker-hardening.md sections 2 and 3;
// ADR-038). The rules that read the worker's mode and its photo user are tested here as they are. What the kernel
// does with them can only be seen as root: ./privileges-harness.ts is started as root (directly when this process is
// root, as in the session, and through `sudo -n` when it isn't, as on CI's runner, whose sudo needs no password),
// takes the worker's mode itself and reports what each photo's process could and couldn't do, one line of JSON a
// case. A runner that can do neither fails here: it never skips.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GRACE_MS } from "./image-process.ts";
import { asRoot, NO_INSPECTOR, photoUserFor, sweep, SweepFailed, SWEEP_PROGRAM, SWEEP_SECONDS } from "./privileges.ts";

const HARNESS = join(import.meta.dirname, "privileges-harness.ts");

/** An `/etc/passwd` as Debian's image has it, with the photo user the Dockerfile makes. */
const PASSWD = [
  "root:x:0:0:root:/root:/bin/bash",
  "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
  "node:x:1000:1000::/home/node:/bin/bash",
  "tadayo-image:x:10001:10001::/nonexistent:/usr/sbin/nologin",
  "tadayo-image-two:x:10002:10002::/nonexistent:/usr/sbin/nologin",
  "",
].join("\n");

/** The worker as fly.toml's command leaves it: real uid 0, effective uid and group `node`'s. */
const WORKER = { uid: 0, euid: 1000, egid: 1000 };

const named = (name?: string) => (name === undefined ? {} : { TADAYO_PHOTO_USER: name });

describe("the photo user (photoUserFor)", () => {
  it("is none, photos prepared in the worker's own user, when neither the variable nor the start asks for one", () => {
    for (const ids of [
      { uid: 1001, euid: 1001, egid: 1001 },
      { uid: 0, euid: 0, egid: 0 },
    ]) {
      for (const env of [{}, { TADAYO_PHOTO_USER: "" }]) {
        expect(
          photoUserFor(env, ids, () => {
            throw new Error("/etc/passwd isn't read");
          }),
        ).toBeUndefined();
      }
    }
  });

  it("is the user the variable names, from /etc/passwd, when the worker was started as fly.toml starts it", () => {
    expect(photoUserFor(named("tadayo-image"), WORKER, () => PASSWD)).toEqual({ uid: 10001, gid: 10001 });
    expect(photoUserFor(named("tadayo-image-two"), WORKER, () => PASSWD)).toEqual({ uid: 10002, gid: 10002 });
  });

  it("stops the worker when only one half is there: the variable without the start, or the start without it", () => {
    for (const ids of [
      { uid: 1001, euid: 1001, egid: 1001 },
      { uid: 0, euid: 0, egid: 0 },
      { uid: 1000, euid: 0, egid: 0 },
    ]) {
      expect(() => photoUserFor(named("tadayo-image"), ids, () => PASSWD)).toThrow(
        /TADAYO_PHOTO_USER is set, but the worker wasn't started as root with its own user effective/,
      );
    }
    for (const env of [{}, { TADAYO_PHOTO_USER: "" }]) {
      expect(() => photoUserFor(env, WORKER, () => PASSWD)).toThrow(/TADAYO_PHOTO_USER isn't set/);
    }
  });

  it("refuses a name that isn't a user's, matching whole names only", () => {
    for (const name of ["tadayo", "tadayo-imag", "nobody", "tadayo-image:x", "x:10001"]) {
      expect(() => photoUserFor(named(name), WORKER, () => PASSWD), name).toThrow(/names no user/);
    }
  });

  it("refuses root, root's group, the worker's own user and the worker's own group", () => {
    for (const [line, said] of [
      ["image:x:0:10001::/:/usr/sbin/nologin", /root, or in root's group/],
      ["image:x:10001:0::/:/usr/sbin/nologin", /root, or in root's group/],
      ["image:x:1000:10001::/:/usr/sbin/nologin", /the worker's own user or group/],
      ["image:x:10001:1000::/:/usr/sbin/nologin", /the worker's own user or group/],
      ["image:x:-1:10001::/:/usr/sbin/nologin", /isn't a user's id/],
      ["image:x:10001:abc::/:/usr/sbin/nologin", /isn't a user's id/],
      ["image:x:10001::/:/usr/sbin/nologin", /names no user/],
    ] as const) {
      expect(() => photoUserFor(named("image"), WORKER, () => `${PASSWD}${line}\n`), line).toThrow(said);
    }
  });
});

describe("outside the worker's mode", () => {
  it("asRoot refuses, and runs nothing", () => {
    let ran = false;
    expect(() => {
      asRoot(() => {
        ran = true;
      });
    }).toThrow(/only for a worker started as root/);
    expect(ran).toBe(false);
  });

  it("the sweep refuses root, root's group, and this process's own user and group, before it starts anything", async () => {
    const own = { uid: process.geteuid?.() ?? -1, gid: process.getegid?.() ?? -1 };
    for (const user of [
      { uid: 0, gid: 64999 },
      { uid: 64999, gid: 0 },
      { uid: own.uid, gid: 64999 },
      { uid: 64999, gid: own.gid },
    ]) {
      await expect(sweep(user), JSON.stringify(user)).rejects.toMatchObject({ why: "refused" });
    }
    // A user it would sweep, but this process isn't in the worker's mode: asRoot refuses to start it.
    const refused = sweep({ uid: 64999, gid: 64999 });
    await expect(refused).rejects.toBeInstanceOf(SweepFailed);
    await expect(refused).rejects.toMatchObject({ why: "start" });
  });

  it("the sweep's program sends SIGKILL to every process its user may signal, never as root, and counts finding none as done", () => {
    // Never run here: as root (the session), a program without its first check would end every process on the machine.
    // What it does is seen in the root harness below.
    const lines = SWEEP_PROGRAM.split("\n");
    expect(lines[0]).toBe("if (process.getuid() === 0) process.exit(2);");
    expect(lines).toContain(
      '  try { process.kill(-1, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }',
    );
    expect(SWEEP_PROGRAM.indexOf("process.kill(-1")).toBeLessThan(SWEEP_PROGRAM.indexOf("unlinkSync"));
    expect(SWEEP_SECONDS).toBe(5);
    // The sweep's and each photo's process's: SIGUSR1 opens no inspector (PR #118's review).
    expect(NO_INSPECTOR).toBe("--disable-sigusr1");
  });
});

/** What the harness reported: its lines by case, its exit code and its standard error. */
interface HarnessRun {
  readonly cases: Map<string, Record<string, unknown>>;
  readonly code: number | null;
  readonly stderr: string;
}

/** Starts the harness as root, with `args`; the whole run is given `seconds`. */
function harness(args: readonly string[], seconds: number): Promise<HarnessRun> {
  const root = process.getuid?.() === 0;
  const [command, rest] = root
    ? [process.execPath, [HARNESS, ...args]]
    : ["sudo", ["-n", process.execPath, HARNESS, ...args]];
  return new Promise((done, failed) => {
    const child = spawn(command, rest, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), seconds * 1000);
    child.on("error", failed);
    child.on("close", (code) => {
      clearTimeout(timer);
      const cases = new Map<string, Record<string, unknown>>();
      for (const line of stdout.split("\n").filter((text) => text !== "")) {
        const fact = JSON.parse(line) as Record<string, unknown>;
        cases.set(String(fact["case"]), fact);
      }
      done({ cases, code, stderr });
    });
  });
}

describe("as fly.toml starts the worker: root, turned to its own user (./privileges-harness.ts, as root)", () => {
  let run: HarnessRun;
  const fact = (name: string): Record<string, unknown> => {
    const found = run.cases.get(name);
    if (found === undefined) throw new Error(`the harness didn't report ${name}: ${run.stderr}`);
    return found;
  };

  beforeAll(async () => {
    run = await harness([], 100);
  }, 120_000);

  it("ran as root, with the photo's user and the worker's unused, and ended with nothing of the photo's user left", () => {
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(fact("start")).toMatchObject({
      uid: 0,
      euid: 0,
      photoUserFree: true,
      photoUserLeft: { files: [], ipc: [] },
    });
    expect(fact("end")).toMatchObject({ left: 0 });
  });

  it("asRoot refuses a process that is only root, and the sweep refuses root, the worker's user and its group", () => {
    expect(fact("refusals")).toEqual({
      case: "refusals",
      asRootAsPlainRoot: "refused",
      sweepRoot: "refused",
      sweepRootsGroup: "refused",
      sweepWorkersUser: "refused",
      sweepWorkersGroup: "refused",
      euid: 64998,
      egid: 64998,
    });
  });

  it("a sweep that exits other than 0, or is killed by a signal, is never done: a process left behind may have killed it", () => {
    expect(fact("sweep-fails")).toEqual({
      case: "sweep-fails",
      status: "exit",
      signal: "exit",
      done: "swept",
      euid: 64998,
    });
  });

  it("a photo's process is the photo's user alone, with no capability, and can't reach the worker", () => {
    const probe = fact("probe");
    expect(probe["outcome"]).toBe("prepared");
    expect(probe["child"]).toEqual({
      uid: 64999,
      euid: 64999,
      gid: 64999,
      egid: 64999,
      groups: [64999],
      capEff: "0000000000000000",
      capPrm: "0000000000000000",
      // Node's inspector, which SIGUSR1 would open for any process of its user: off (PR #118's review).
      usr1Caught: false,
      // The worker's environment (the database's URL, Storage's key: T56), its memory, its standard output (T52),
      // and a signal: none of them.
      environ: "EACCES",
      mem: "EACCES",
      stdout: "EACCES",
      signal: "EPERM",
    });
    expect(probe).toMatchObject({ euid: 64998, egid: 64998 });
  });

  it("a process the photo's process started in a session of its own has ended once the photo's end settles", () => {
    expect(fact("escapes")).toMatchObject({ outcome: "prepared", wasRunning: true, endedBy: "settle", euid: 64998 });
  });

  it("the sweep runs with the worker's group, not the photo user's, so a process left behind can't attach to it", () => {
    // Attaching (ptrace, /proc/<pid>/mem) needs every user and group id to match: the sweep's group is the worker's.
    expect(fact("watcher")).toMatchObject({
      outcome: "prepared",
      seen: { uid: 64999, gid: 64998, mem: "EACCES" },
      euid: 64998,
    });
  });

  it("a process left behind can't open the sweep's inspector: SIGUSR1 stays blocked, opens nothing, and the sweep runs to its own end", () => {
    // PR #118's review: with the inspector on, a leftover sent SIGUSR1, ran code in the sweep and outlived it. With
    // --disable-sigusr1, Node blocks the signal in every thread and never catches it: it stays pending and does nothing.
    expect(fact("sweep-usr1")).toEqual({
      case: "sweep-usr1",
      usr1Caught: false,
      usr1Blocked: true,
      inspector: false,
      status: "swept",
      euid: 64998,
    });
  });

  it("the worker's start ends a process of the photo's user before anything else, so none waits from before a restart", () => {
    expect(fact("start-sweep")).toEqual({
      case: "start-sweep",
      wasRunning: true,
      endedBy: "start",
      failedAt: "the database",
      euid: 64998,
    });
  });

  it("a sweep that can't finish as the worker starts stops it there, before it connects to the database", () => {
    expect(fact("start-sweep-fails")).toEqual({ case: "start-sweep-fails", failedAt: "the sweep", euid: 64998 });
  });

  it("sends no group kill once Node has reaped the photo's process, when its group's number may be another's", () => {
    // PR #118's review (S6): the kill once the answer is in reaches the group; the one as its end settles is skipped.
    expect(fact("reaped")).toEqual({ case: "reaped", outcome: "prepared", groupKills: 1, afterReap: 0, euid: 64998 });
  });

  it("what a photo's process left in memory or on disk is gone once its end settles: files, read-only folders, System V objects", () => {
    // PR #118's review: left there, they held the Machine's memory, and every later photo was refused for its size.
    expect(fact("hoards")).toEqual({
      case: "hoards",
      outcome: "prepared",
      made: true,
      left: { files: [], ipc: [] },
      euid: 64998,
    });
  });

  it("so has every process of a forking loop, caught mid-fork", () => {
    const forks = fact("forks");
    expect(forks).toMatchObject({ outcome: "prepared", left: 0, euid: 64998 });
    expect(forks["most"]).toBeGreaterThanOrEqual(64);
  });

  it("a process past its memory is still killed by the worker at once, not left to the sweep after GRACE_MS", () => {
    const memory = fact("memory");
    expect(memory).toMatchObject({ outcome: "too_many_pixels", euid: 64998 });
    expect(memory["msAfterCrossing"]).toBeLessThan(GRACE_MS / 2);
  });

  it("a process past its deadline is still killed by the worker at once", () => {
    const deadline = fact("deadline");
    expect(deadline).toMatchObject({ outcome: "ImageTimeout", euid: 64998 });
    // Its deadline is 0.5 s; a kill the worker couldn't send would leave it to the sweep, GRACE_MS later.
    expect(deadline["ms"]).toBeLessThan(500 + GRACE_MS / 2);
  });

  it("a sweep that doesn't finish in time stops the worker: a process of the photo's user may be alive", async () => {
    const stopped = await harness(["sweep-timeout"], 60);
    expect(stopped.code).toBe(1);
    expect(stopped.stderr).toBe(
      "worker: a photo's processes weren't all ended, so the worker stops, and its Machine restarts without them\n",
    );
    expect(stopped.cases.get("sweep-timeout")).toMatchObject({ started: true });
    expect(stopped.cases.has("sweep-timeout-settled")).toBe(false);
  }, 70_000);
});
