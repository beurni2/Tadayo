// How an `ops` script runs another program: `psql`, `flyctl`, `git`. No shell, so no argument is
// ever read as anything but an argument; and the child gets the environment the script gives it
// and `PATH`, nothing else, so a token the script holds for one program never reaches another.
// Output is collected, and the script decides what to say of it (every line it prints goes
// through the redactor, output.ts).

import { spawn as nodeSpawn } from "node:child_process";

export interface SpawnOptions {
  /** The child's whole environment, apart from `PATH`. */
  readonly env?: Readonly<Record<string, string>>;
  /** Written to the child's standard input, which is then closed. */
  readonly input?: string;
  /** The directory the child runs in. */
  readonly cwd?: string;
  /** The child is killed after this long. */
  readonly timeoutMs?: number;
}

export interface Spawned {
  /** The exit code, or null when a signal ended the child (a timeout among them). */
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type Spawn = (command: string, args: readonly string[], options?: SpawnOptions) => Promise<Spawned>;

/** The real one. A program that isn't there is an exit code 127 and its name, not a thrown error. */
export const spawnProcess: Spawn = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = nodeSpawn(command, [...args], {
      cwd: options.cwd,
      env: { PATH: process.env["PATH"] ?? "", ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: 127,
        timedOut: false,
        stdout: "",
        stderr:
          error.code === "ENOENT" ? `${command}: not found` : `${command}: couldn't start (${error.code ?? "error"})`,
      });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: timedOut ? null : code,
        timedOut,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
    // A child that exits without reading its input closes the pipe: that isn't ours to throw.
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.input ?? "");
  });
