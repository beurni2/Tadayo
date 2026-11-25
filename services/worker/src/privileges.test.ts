// Each photo under a user of its own (./privileges.ts; docs/plans/api-b2-worker-hardening.md sections 2 and 3;
// ADR-038). The rules that read the worker's mode and its photo user are tested here as they are. What the kernel
// does with them can only be seen as root: ./privileges-harness.ts is started as root (directly when this process is
// root, as in the session, and through `sudo -n` when it isn't, as on CI's runner, whose sudo needs no password),
// takes the worker's mode itself and reports what each photo's process could and couldn't do, one line of JSON a
// case. A runner that can do neither fails here: it never skips.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GRACE_MS, PEAK_BYTES } from "./image-process.ts";
import {
  asRoot,
  IMAGE_MARKER,
  inImage,
  NO_INSPECTOR,
  photoUserFor,
  startFactsSaid,
  type StartFacts,
  sweep,
  SweepFailed,
  SWEEP_PROGRAM,
  SWEEP_SECONDS,
} from "./privileges.ts";

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

/**
 * /proc/self/status as fly.toml's worker command leaves it, the kernel's spacing and all: setpriv's `--euid`, `--egid`
 * and `--groups`, its bounding set of kill, setgid and setuid, no inheritable capability, and no new privileges. Each
 * field of `changed` replaces the one of that name, and one given as undefined is left out.
 */
function startedWith(changed: Readonly<Record<string, string | undefined>> = {}): () => StartFacts {
  const fields: Record<string, string | undefined> = {
    Name: "node",
    Uid: "0\t1000\t0\t1000",
    Gid: "0\t1000\t0\t1000",
    Groups: "1000 ",
    CapInh: "0000000000000000",
    CapPrm: "00000000000000e0",
    CapEff: "0000000000000000",
    CapBnd: "00000000000000e0",
    CapAmb: "0000000000000000",
    NoNewPrivs: "1",
    ...changed,
  };
  const status = Object.entries(fields)
    .flatMap(([name, value]) => (value === undefined ? [] : [`${name}:\t${value}\n`]))
    .join("");
  return () => ({ marked: false, status });
}

/** Started as fly.toml starts the worker, without the image's marker. */
const AS_FLY = startedWith();

/**
 * The refusal of a start in the image that isn't fly.toml's worker command, with what it found (startFactsSaid): the
 * ids, then the four fields of /proc status that startedAsFly reads.
 */
const REFUSED =
  /^worker: in production it starts only as fly\.toml's worker command starts it, root turned to its own user, never as root alone or as one user alone \(it found uid \d+, euid \d+, egid \d+, NoNewPrivs [^,]+, CapBnd [^,]+, CapInh [^,]+, Groups [^,)]+\)$/;

/** The message `call` throws, or "nothing thrown". */
function thrown(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  return "nothing thrown";
}

/** Started as root, as in the session, without the image's marker. */
const OUTSIDE = startedWith({
  Uid: "0\t0\t0\t0",
  Gid: "0\t0\t0\t0",
  Groups: " ",
  CapBnd: "000001fffeffffff",
  NoNewPrivs: "0",
});

describe("the photo user (photoUserFor)", () => {
  it("is none, photos prepared in the worker's own user, when neither the variable nor the start asks for one, outside the image", () => {
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

  it("in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it, as root alone first of all", () => {
    // The audit's A6: a start as plain root (`docker run`, `fly machine run`, a configuration without the worker's
    // command) prepared strangers' photos as root. In the image, no start but fly.toml's worker command goes on,
    // whatever the variable says, and the image sets the variable too (the Dockerfile), so a start that drops it is
    // refused as well.
    const production = (env: Record<string, string>) => ({ ...env, NODE_ENV: "production" });
    for (const ids of [
      { uid: 0, euid: 0, egid: 0 },
      { uid: 1000, euid: 1000, egid: 1000 },
      { uid: 1000, euid: 0, egid: 0 },
      // Root's group kept as the effective one: `setpriv --euid` without `--egid`.
      { uid: 0, euid: 1000, egid: 0 },
    ]) {
      for (const env of [{}, { TADAYO_PHOTO_USER: "" }, named("tadayo-image")]) {
        const said = thrown(() =>
          photoUserFor(
            production(env),
            ids,
            () => {
              throw new Error("/etc/passwd isn't read");
            },
            AS_FLY,
          ),
        );
        expect(said, JSON.stringify([ids, env])).toMatch(REFUSED);
        // The line names the ids it found, and the status as it was.
        expect(said, JSON.stringify([ids, env])).toContain(
          `(it found uid ${String(ids.uid)}, euid ${String(ids.euid)}, egid ${String(ids.egid)}, NoNewPrivs 1, CapBnd 00000000000000e0, CapInh 0000000000000000, Groups 1000)`,
        );
      }
    }
    // As fly.toml starts it, the image's variable gives the user; without the variable it stops, as outside the image.
    expect(photoUserFor(production(named("tadayo-image")), WORKER, () => PASSWD, AS_FLY)).toEqual({
      uid: 10001,
      gid: 10001,
    });
    expect(() => photoUserFor(production({}), WORKER, () => PASSWD, AS_FLY)).toThrow(/TADAYO_PHOTO_USER isn't set/);
    // With fly.toml's ids but not the rest of its start, it stops too: each of setpriv's other flags is read back.
    for (const [field, value] of [
      ["NoNewPrivs", "0"],
      ["NoNewPrivs", undefined],
      ["CapBnd", "000001ffffffffff"],
      ["CapBnd", "00000000000000c0"],
      ["CapBnd", "00000000000000e1"],
      ["CapBnd", undefined],
      ["CapInh", "00000000000000e0"],
      ["CapInh", undefined],
      ["Groups", "0 1000"],
      ["Groups", "1000 0"],
      ["Groups", undefined],
    ] as const) {
      const said = thrown(() =>
        photoUserFor(production(named("tadayo-image")), WORKER, () => PASSWD, startedWith({ [field]: value })),
      );
      expect(said, `${field}: ${String(value)}`).toMatch(REFUSED);
      // The line names what it found in that field, a field left out as missing, and the ids as they were.
      expect(said, `${field}: ${String(value)}`).toContain(`(it found uid 0, euid 1000, egid 1000, `);
      expect(said, `${field}: ${String(value)}`).toContain(`${field} ${value ?? "missing"}`);
    }
    // The kernel's own spacing is read as it is: a trailing space, no supplementary group at all.
    for (const groups of ["1000 ", "", " "]) {
      expect(
        photoUserFor(production(named("tadayo-image")), WORKER, () => PASSWD, startedWith({ Groups: groups })),
        JSON.stringify(groups),
      ).toEqual({ uid: 10001, gid: 10001 });
    }
    // Only the image's own value turns the rule on, and outside the image the start's other flags aren't asked for.
    for (const value of ["", "test", "development", "Production"]) {
      expect(
        photoUserFor({ NODE_ENV: value }, { uid: 0, euid: 0, egid: 0 }, () => PASSWD, OUTSIDE),
        value,
      ).toBeUndefined();
      expect(
        photoUserFor(
          { ...named("tadayo-image"), NODE_ENV: value },
          WORKER,
          () => PASSWD,
          startedWith({ NoNewPrivs: "0" }),
        ),
        value,
      ).toEqual({ uid: 10001, gid: 10001 });
    }
  });

  it("says what a refused start was found to be: its ids and the four fields of its status, each kept to what a field holds", () => {
    // All Fly's log keeps of a refused start is its line (PR #118's merge: refused on Fly, where the same command
    // passes in the session and in Docker, with nothing said of what it found).
    const status = (fields: Record<string, string>) => () =>
      Object.entries(fields)
        .map(([name, value]) => `${name}:\t${value}\n`)
        .join("");
    expect(startFactsSaid(WORKER, AS_FLY().status)).toBe(
      "uid 0, euid 1000, egid 1000, NoNewPrivs 1, CapBnd 00000000000000e0, CapInh 0000000000000000, Groups 1000",
    );
    expect(startFactsSaid({ uid: 0, euid: 0, egid: 0 }, OUTSIDE().status)).toBe(
      "uid 0, euid 0, egid 0, NoNewPrivs 0, CapBnd 000001fffeffffff, CapInh 0000000000000000, Groups none",
    );
    // A field left out is missing; anything but digits, a to f and spaces is a "?"; a value is cut at 64 characters.
    expect(startFactsSaid(WORKER, "")).toBe(
      "uid 0, euid 1000, egid 1000, NoNewPrivs missing, CapBnd missing, CapInh missing, Groups missing",
    );
    expect(
      startFactsSaid(
        WORKER,
        status({ NoNewPrivs: "1", CapBnd: "00000000000000E0", CapInh: "0, (x)", Groups: "1000 ".repeat(20) })(),
      ),
    ).toBe(
      `uid 0, euid 1000, egid 1000, NoNewPrivs 1, CapBnd 00000000000000?0, CapInh 0? ???, Groups ${"1000 ".repeat(12)}1000`,
    );
    // A tab, or any other blank but a space, is a "?" too, inside any field; and each field is cut, not Groups alone.
    expect(
      startFactsSaid(
        WORKER,
        status({ NoNewPrivs: "1\v1", CapBnd: "0".repeat(70), CapInh: "0\f0", Groups: "1000\t0\u00a00" })(),
      ),
    ).toBe(`uid 0, euid 1000, egid 1000, NoNewPrivs 1?1, CapBnd ${"0".repeat(64)}, CapInh 0?0, Groups 1000?0?0`);
  });

  it("in the image by its marker alone, whatever NODE_ENV says, stops the worker just the same", () => {
    // A start that clears NODE_ENV (`env -u NODE_ENV`, a configuration that sets it to something else) is still in
    // the image: the Dockerfile writes IMAGE_MARKER, and no setting takes a file away.
    expect(IMAGE_MARKER).toBe("/etc/tadayo-built-image");
    const marked = (facts: () => StartFacts) => () => ({ ...facts(), marked: true });
    for (const env of [{}, { NODE_ENV: "" }, { NODE_ENV: "development" }]) {
      for (const ids of [
        { uid: 0, euid: 0, egid: 0 },
        { uid: 0, euid: 1000, egid: 0 },
      ]) {
        expect(
          () => photoUserFor({ ...env, ...named("tadayo-image") }, ids, () => PASSWD, marked(AS_FLY)),
          JSON.stringify([env, ids]),
        ).toThrow(/in production it starts only as fly\.toml's worker command starts it/);
      }
      expect(() => photoUserFor(env, { uid: 0, euid: 0, egid: 0 }, () => PASSWD, marked(OUTSIDE))).toThrow(
        /in production it starts only as fly\.toml's worker command starts it/,
      );
      expect(() =>
        photoUserFor(
          { ...env, ...named("tadayo-image") },
          WORKER,
          () => PASSWD,
          marked(startedWith({ CapBnd: "000001ffffffffff" })),
        ),
      ).toThrow(/in production it starts only as fly\.toml's worker command starts it/);
      expect(photoUserFor({ ...env, ...named("tadayo-image") }, WORKER, () => PASSWD, marked(AS_FLY))).toEqual({
        uid: 10001,
        gid: 10001,
      });
    }
    // inImage itself: NODE_ENV's own value, or the marker.
    expect(inImage({ NODE_ENV: "production" }, () => false)).toBe(true);
    expect(inImage({}, () => true)).toBe(true);
    expect(inImage({ NODE_ENV: "Production" }, () => false)).toBe(false);
    expect(inImage({}, () => false)).toBe(false);
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
    expect(SWEEP_PROGRAM.indexOf("process.kill(-1")).toBeLessThan(SWEEP_PROGRAM.indexOf("/usr/bin/rm"));
    // Once no process of its user is left, a failure is exit status 3: what was left, not a process (sweepLeft).
    expect(lines.indexOf("try {")).toBeGreaterThan(lines.indexOf("} while (alive());"));
    expect(lines.at(-1)).toBe("} catch { process.exit(3); }");
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
/** The harness's `real-child` run, which two tests read: started once, by the first that asks. */
let realChildRun: Promise<HarnessRun> | undefined;
const realChild = (): Promise<HarnessRun> => (realChildRun ??= harness(["real-child"], 90));

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
      left: "left",
      signal: "exit",
      done: "swept",
      euid: 64998,
    });
  });

  it("in the worker's mode, never starts a photo's process without the photo's user: started so, it could take root back", () => {
    // The audit's A6. Started without a user, a child of the worker's mode has real uid 0 and keeps setuid in its
    // permitted set (fly.toml's bounding set): under fly.toml's command it could take effective uid 0 and read root's
    // files (measured in the session on 2026-11-24, docs/JOURNAL.md). prepareIsolated refuses, and starts nothing.
    expect(fact("no-user")).toEqual({ case: "no-user", outcome: "refused", started: false, euid: 64998 });
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

  it("a process left behind may lower the sweep's scheduling group, but it is the sweep's own: the worker's stays as it was", () => {
    // Round 2 of PR #118's review: the sweep's /proc files are its user's, so a leftover may write its autogroup's
    // priority; in the worker's session, that was the worker's. The sweep starts in a session of its own.
    const watcher = fact("watcher");
    const group = watcher["group"] as { before: string | null; after: string | null };
    expect(group.after).toBe(group.before);
    if (group.before !== null) {
      // The leftover's write did land, on the sweep's own group, and the worker's isn't at its value.
      expect(watcher["seen"]).toMatchObject({ autogroup: "set" });
      expect(group.after).not.toBe("nice 19");
    }
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
    // Every process of the photo user had ended: what it left couldn't all be removed, and the error says so.
    expect(fact("start-sweep-fails")).toEqual({ case: "start-sweep-fails", failedAt: "the sweep, left", euid: 64998 });
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

  it("the real child prepares a real photo as the photo's user, reading a read-only view of the checkout, and leaves nothing", async () => {
    // The audit's A6 (a reviewer ran it by hand). The fake children above show what the isolation holds back; this
    // shows the real one works inside it: its modules and sharp's library read as tadayo-image would read /app, with
    // no environment, no home and no folder of its own, on a 12-megapixel photo.
    const real = await realChild();
    expect(real.stderr).toBe("");
    expect(real.code).toBe(0);
    const prepared = real.cases.get("real-child");
    expect(prepared).toMatchObject({
      view: "read-only",
      outcome: "prepared",
      // No supplementary group at all: Node's spawn clears them before it sets the child's group and user.
      ranAs: { uid: 64999, gid: 64999, groups: "" },
      left: { processes: 0, files: [], ipc: [] },
      euid: 64998,
    });
    // 4032 by 3024 fits `full`'s box at 2560 by 1920, and `display`'s at 1290 wide (967.5 high, rounded by libvips).
    const renditions = prepared?.["renditions"] as { kind: string; width: number; height: number; jpeg: boolean }[];
    expect(renditions.map(({ kind, width, jpeg }) => ({ kind, width, jpeg }))).toEqual([
      { kind: "full", width: 2560, jpeg: true },
      { kind: "display", width: 1290, jpeg: true },
    ]);
    expect(renditions[0]?.height).toBe(1920);
    expect([967, 968]).toContain(renditions[1]?.height);
    // Its peak, from the child's own VmHWM and the worker's reads: well under the worker's cap for one photo.
    expect(prepared?.["peakMiB"]).toBeGreaterThan(16);
    expect(prepared?.["peakMiB"]).toBeLessThan(PEAK_BYTES / 1024 / 1024);
  }, 100_000);

  it("in the image, fly.toml's worker command itself goes past the photo user's check, and each start short of it stops there", async () => {
    // Round 3 of PR #118's review: the worker's mode by its ids alone let `setpriv --euid` through, which keeps root's
    // group, every capability in reserve and the image's setuid programs. Here fly.toml's own command runs, read from
    // fly.toml and changed only in its user, then each start that leaves out or widens one of its flags. None is given
    // a database, so the one that goes on stops at DATABASE_URL, its first setting.
    const real = await realChild();
    expect(real.code).toBe(0);
    const started = real.cases.get("fly-start");
    expect(started?.["command"]).toBe("found");
    const ended = started?.["ended"] as Record<string, { code: number | null; stderr: string; stdout: string }>;
    expect(ended["fly"]).toEqual({ code: 1, stderr: "worker: DATABASE_URL isn't set\n", stdout: "" });
    // Each refused start's line names what the kernel says of the flag it left out or widened.
    const found: Record<string, RegExp> = {
      withoutNoNewPrivs: /NoNewPrivs 0, CapBnd 00000000000000e0, CapInh 0000000000000000, Groups 64998\)/,
      widerBoundingSet: /NoNewPrivs 1, CapBnd 00000000000000e1, CapInh 0000000000000000, Groups 64998\)/,
      inheritable: /NoNewPrivs 1, CapBnd 00000000000000e0, CapInh 0000000000000020, Groups 64998\)/,
      rootsGroup: /NoNewPrivs 1, CapBnd 00000000000000e0, CapInh 0000000000000000, Groups 0 64998\)/,
      euidAlone: /\(it found uid 0, euid 64998, egid 0, NoNewPrivs 0, /,
      rootAlone: /\(it found uid 0, euid 0, egid 0, NoNewPrivs 0, /,
    };
    for (const [name, what] of Object.entries(found)) {
      expect(ended[name]?.code, name).toBe(1);
      expect(ended[name]?.stdout, name).toBe("");
      expect(ended[name]?.stderr.endsWith("\n"), name).toBe(true);
      expect(ended[name]?.stderr.slice(0, -1), name).toMatch(REFUSED);
      expect(ended[name]?.stderr, name).toMatch(what);
    }
    expect(Object.keys(ended)).toHaveLength(7);
  }, 100_000);

  it("a sweep that doesn't finish in time stops the worker: a process of the photo's user may be alive", async () => {
    const stopped = await harness(["sweep-timeout"], 60);
    expect(stopped.code).toBe(1);
    expect(stopped.stderr).toBe(
      "worker: a photo's processes weren't all ended, so the worker stops, and its Machine restarts without them\n",
    );
    expect(stopped.cases.get("sweep-timeout")).toMatchObject({ started: true });
    expect(stopped.cases.has("sweep-timeout-settled")).toBe(false);
  }, 70_000);

  it("a sweep that ends every process but can't remove what the photo's user left stops the worker, saying so", async () => {
    // Exit status 3 (SWEEP_PROGRAM): the stop line names what is left, not a process (round 2 of PR #118's review).
    const stopped = await harness(["sweep-left"], 60);
    expect(stopped.code).toBe(1);
    expect(stopped.stderr).toBe(
      "worker: every process of a photo's user ended, but what it left couldn't all be removed, so the worker stops, and its Machine restarts without them\n",
    );
    expect(stopped.cases.get("sweep-left")).toMatchObject({ started: true });
    expect(stopped.cases.has("sweep-left-settled")).toBe(false);
  }, 70_000);
});
