// How an `ops` script runs another program, with real child processes (docs/plans/api-b0-deploy.md,
// section 6; T56): no shell, so an argument is only ever an argument; only the environment the script
// gives it and `PATH`, so a token held for one program never reaches another; a time limit that
// kills; and a program that isn't there is an exit code and a name, not a thrown error.

import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spawnProcess } from "./spawn.ts";

const node = process.execPath;

describe("spawnProcess", () => {
  it("gives the child the environment it is given and PATH, and nothing else of this process's", async () => {
    process.env["OPS_SPAWN_TEST_ONLY_HERE"] = "not-for-the-child";
    try {
      const result = await spawnProcess(node, ["-e", "console.log(JSON.stringify(process.env))"], {
        env: { GIVEN: "one" },
      });
      expect(JSON.parse(result.stdout)).toEqual({ PATH: process.env["PATH"] ?? "", GIVEN: "one" });
    } finally {
      delete process.env["OPS_SPAWN_TEST_ONLY_HERE"];
    }
  });

  it("gives a child that is given no environment only PATH", async () => {
    const result = await spawnProcess(node, ["-e", "console.log(Object.keys(process.env).join())"]);
    expect(result.stdout).toBe("PATH\n");
  });

  it("collects standard output and standard error apart, and the exit code", async () => {
    const result = await spawnProcess(node, ["-e", "console.log('out'); console.error('err'); process.exitCode = 3"]);
    expect(result).toEqual({ code: 3, timedOut: false, stdout: "out\n", stderr: "err\n" });
  });

  it("writes the input to the child's standard input and closes it, and closes it at once when there is none", async () => {
    const echo = "let t=''; process.stdin.on('data', (d) => (t += d)).on('end', () => console.log(`got:${t}`));";
    expect((await spawnProcess(node, ["-e", echo], { input: "hello" })).stdout).toBe("got:hello\n");
    expect((await spawnProcess(node, ["-e", echo])).stdout).toBe("got:\n");
  });

  it("runs the child where it is told to", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "tadayo-spawn-")));
    const result = await spawnProcess(node, ["-e", "console.log(process.cwd())"], { cwd: dir });
    expect(result.stdout).toBe(`${dir}\n`);
  });

  it("reads no argument as anything but an argument: there is no shell", async () => {
    const odd = ["a b", ";echo no", "$HOME", "*", "`id`", "'quoted'", "--flag"];
    const result = await spawnProcess(node, ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", ...odd]);
    expect(JSON.parse(result.stdout)).toEqual(odd);
  });

  it("kills a child that outlives its time, and says it ran out of time and has no exit code", async () => {
    const started = Date.now();
    // The child ends by itself after fifteen seconds, so that a spawn that never killed it would leave nothing behind.
    const result = await spawnProcess(node, ["-e", "setTimeout(() => undefined, 15000)"], { timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("doesn't kill a child that finishes in its time", async () => {
    const result = await spawnProcess(node, ["-e", "console.log('done')"], { timeoutMs: 20_000 });
    expect(result).toEqual({ code: 0, timedOut: false, stdout: "done\n", stderr: "" });
  });

  it("says a program that isn't there as exit code 127 and its name, and throws nothing", async () => {
    const result = await spawnProcess("ops-no-such-program-here", ["--x"]);
    expect(result).toEqual({
      code: 127,
      timedOut: false,
      stdout: "",
      stderr: "ops-no-such-program-here: not found",
    });
  });

  it("says a program that can't start for another reason as exit code 127 and the reason, and throws nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tadayo-spawn-"));
    const file = join(dir, "not-a-program");
    await writeFile(file, "#!/bin/sh\necho hi\n", { mode: 0o644 });
    const result = await spawnProcess(file, []);
    expect(result).toEqual({
      code: 127,
      timedOut: false,
      stdout: "",
      stderr: `${file}: couldn't start (EACCES)`,
    });
  });

  it("collects all of what a child wrote on each stream, though it exits at once", async () => {
    const script = "process.stdout.write('o'.repeat(3_000_000)); process.stderr.write('e'.repeat(3_000_000));";
    const result = await spawnProcess(node, ["-e", script]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("o".repeat(3_000_000));
    expect(result.stderr).toBe("e".repeat(3_000_000));
  });

  it("waits for the streams to close, and not only for the child to exit: what the child's own children write is kept", async () => {
    // The shell exits at once; the process it leaves behind holds the output open for a third of a second more.
    const result = await spawnProcess("sh", ["-c", "(sleep 0.3; echo late) & echo early"]);
    expect(result).toEqual({ code: 0, timedOut: false, stdout: "early\nlate\n", stderr: "" });
  });

  it("doesn't hold the process that ran it open once the child is done, whatever time it was given", async () => {
    // A process that runs a quick child with an hour to finish must end with the child, not an hour later.
    const spawnFile = join(import.meta.dirname, "spawn.ts");
    const script = `const { spawnProcess } = await import(${JSON.stringify(spawnFile)});
      const result = await spawnProcess(process.execPath, ["-e", "0"], { timeoutMs: 3_600_000 });
      console.log(result.code);`;
    const started = Date.now();
    const result = await spawnProcess(node, ["--input-type=module", "-e", script], { timeoutMs: 20_000 });
    expect(result).toEqual({ code: 0, timedOut: false, stdout: "0\n", stderr: "" });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("isn't thrown by a child that exits without reading its input", async () => {
    const result = await spawnProcess(node, ["-e", "process.exit(0)"], { input: "x".repeat(5_000_000) });
    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
