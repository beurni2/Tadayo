// What the `ops` scripts ask of `flyctl` (docs/plans/api-b0-deploy.md, section 6; T56). One place
// knows how `flyctl` is run and what it prints, so that the scripts can be tested against a fake
// (test/fake-fly.ts), since `flyctl` can't be installed in a cloud session and the first real run
// is after slice 10b.
//
// `flyctl` is given the Fly token and `HOME`, and nothing else of the environment, and is never
// given a shell. Every call is by an argument list that names the app (`DEV_APP`), so no script
// can touch another one. `flyctl` prints some failures with exit code 0 (`machine exec` does, for
// the command it ran), so a script says what it asks for and checks the answer it gets.

import { DEV_APP, readVariables } from "./environment.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawn, Spawned } from "./spawn.ts";

export interface FlyCallOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export interface Fly {
  /** `flyctl <args>`: its whole output is collected, and the call is killed after `timeoutMs`. */
  readonly run: (args: readonly string[], options?: FlyCallOptions) => Promise<Spawned>;
}

/** A call that isn't a long one (a deploy, a command on a Machine) gets this long. */
const QUICK_MS = 120_000;

/** `flyctl` for `FLY_API_TOKEN`, an org token, which can make the app and add its certificate. */
export function flyOf(spawn: Spawn, env: Readonly<Record<string, string | undefined>>): Fly {
  const { FLY_API_TOKEN: token } = readVariables(env, ["FLY_API_TOKEN"]);
  const home = env["HOME"];
  const childEnv: Record<string, string> =
    home === undefined || home === "" ? { FLY_API_TOKEN: token } : { FLY_API_TOKEN: token, HOME: home };
  return { run: (args, options = {}) => spawn("flyctl", args, { env: childEnv, timeoutMs: QUICK_MS, ...options }) };
}

/** Why a call failed, for a message: the exit code and the first lines it printed, each cut short. */
export function why(result: Spawned): string {
  if (result.timedOut) return "it ran out of time";
  const text = result.stderr.trim() === "" ? result.stdout : result.stderr;
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 3)
    .map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));
  const code = result.code === null ? "no exit code" : `exit code ${String(result.code)}`;
  return lines.length === 0 ? code : `${code}: ${lines.join(" / ")}`;
}

/** The standard output as JSON, or nothing when it isn't. */
export function jsonOf(result: Spawned): unknown {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

export interface Machine {
  readonly id: string;
  readonly state: string;
  /** The process group that `fly.toml` named, or nothing for a Machine made another way. */
  readonly group: string | undefined;
  /** What the Machine runs: the image reference's tag and the image path, each when it has one. */
  readonly tag: string | undefined;
  readonly image: string | undefined;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** The Machines of the app, as `flyctl machine list --json` has them. */
export async function machines(fly: Fly): Promise<Machine[]> {
  const result = await fly.run(["machine", "list", "-a", DEV_APP, "--json"]);
  if (result.code !== 0) throw new OpsError(`couldn't list ${DEV_APP}'s Machines: ${why(result)}`);
  const list = jsonOf(result);
  if (!Array.isArray(list)) throw new OpsError(`flyctl's list of ${DEV_APP}'s Machines isn't a list`);
  return list.map((item: unknown) => {
    const entry = record(item);
    const id = text(entry?.["id"]);
    const state = text(entry?.["state"]);
    if (id === undefined || state === undefined) {
      throw new OpsError(`flyctl's list of ${DEV_APP}'s Machines has an entry with no id or no state`);
    }
    const config = record(entry?.["config"]);
    return {
      id,
      state,
      group: text(record(config?.["metadata"])?.["fly_process_group"]),
      tag: text(record(entry?.["image_ref"])?.["tag"]),
      image: text(config?.["image"]),
    };
  });
}
