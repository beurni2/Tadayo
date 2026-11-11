// What the `ops` scripts ask of `flyctl` (docs/plans/api-b0-deploy.md, section 6; T56). One place
// knows how `flyctl` is run and what it prints, so that the scripts can be tested against a fake
// (test/fake-fly.ts): no `flyctl` has been run in a cloud session (its 0.5.8 release downloads, but
// a session refuses to run a downloaded binary, so the argument lists and the JSON keys were read
// from its source instead), and the first real run is after slice 10b.
//
// `flyctl` is given the Fly token and `HOME`, and nothing else of the environment, and is never
// given a shell. `run` makes no call whose argument list doesn't name the app (`DEV_APP`) with `-a`
// or `--app`, and no other app anywhere in it, so no script can touch another one; the two calls
// that name none are the token's list of organizations and the making of the app itself, which
// takes its name as an argument (`forDevApp`). `flyctl` prints some failures with exit code 0
// (`machine exec` does, for the command it ran), so a script says what it asks for and checks the
// answer it gets.

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

/**
 * True for an argument list that is about `DEV_APP` and no other app: it has `-a` or `--app` with
 * `DEV_APP` after it and no other app flag, in any spelling (`--app=x`, `-ax`); or it is one of
 * the two calls that name no app by a flag: `orgs list --json`, and `apps create DEV_APP`, with
 * `--org <slug>` or not.
 */
export function forDevApp(args: readonly string[]): boolean {
  if (args.length === 3 && args[0] === "orgs" && args[1] === "list" && args[2] === "--json") return true;
  if (args[0] === "apps" && args[1] === "create") {
    const rest = args.slice(3);
    const org = rest[1];
    const named = rest.length === 2 && rest[0] === "--org" && org !== undefined && !org.startsWith("-");
    return args[2] === DEV_APP && (rest.length === 0 || named);
  }
  let named = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "-a" || arg === "--app") {
      if (args[index + 1] !== DEV_APP) return false;
      named = true;
      index += 1;
    } else if (/^-a./.test(arg) || arg.startsWith("--app=")) {
      return false;
    }
  }
  return named;
}

/** `flyctl` for `FLY_API_TOKEN`, an org token, which can make the app and add its certificate. */
export function flyOf(spawn: Spawn, env: Readonly<Record<string, string | undefined>>): Fly {
  const { FLY_API_TOKEN: token } = readVariables(env, ["FLY_API_TOKEN"]);
  const home = env["HOME"];
  const childEnv: Record<string, string> =
    home === undefined || home === "" ? { FLY_API_TOKEN: token } : { FLY_API_TOKEN: token, HOME: home };
  return {
    run: (args, options = {}) => {
      if (!forDevApp(args)) {
        return Promise.reject(
          new OpsError(`flyctl: a call that doesn't name ${DEV_APP}, and no other app, isn't made`),
        );
      }
      return spawn("flyctl", args, { env: childEnv, timeoutMs: QUICK_MS, ...options });
    },
  };
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

/** The Machines in words, for a message: `<id> (<group>, <state>)` each, or `none`. */
export function machineList(list: readonly Machine[]): string {
  return list.length === 0
    ? "none"
    : list.map((machine) => `${machine.id} (${machine.group ?? "no group"}, ${machine.state})`).join(", ");
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
