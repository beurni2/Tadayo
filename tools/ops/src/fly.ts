// What the `ops` scripts ask of `flyctl` (docs/plans/api-b0-deploy.md, section 6; T56). One place
// knows how `flyctl` is run and what it prints, so that the scripts can be tested against a fake
// (test/fake-fly.ts): no `flyctl` has been run in a cloud session (its 0.5.8 release downloads, but
// a session refuses to run a downloaded binary, so the argument lists and the JSON keys were read
// from its source instead), and the first real run is after slice 10b.
//
// `flyctl` is given the Fly token and `HOME`, and nothing else of the environment, and is never
// given a shell; a call with an agent of its own (`ownAgent`, the SSH session's) is given that
// agent's folder and the word that runs it, too. `run` makes no call whose argument list doesn't
// name the app (`DEV_APP`) with `-a` or `--app`, and has no other app flag in any spelling
// (`--app=x`, `-ax`); the calls that name
// none are the token's list of organizations, the making of the app itself, which takes its name
// as an argument, and the listing and removing of the organization's WireGuard peers, which
// on-machine.ts does for the peer its own SSH session made (`forDevApp`; ADR-034). `flyctl` prints
// some failures with exit code 0 (`certs check` does, for a host whose DNS isn't ready), so a
// script says what it asks for and checks the answer it gets.

import { isAbsolute } from "node:path";
import { DEV_APP, readVariables } from "./environment.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawn, Spawned } from "./spawn.ts";

export interface FlyCallOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  /**
   * An empty folder of the call's own, by its absolute path, where flyctl keeps its configuration
   * (`FLY_CONFIG_DIR`), the WireGuard state among it; and flyctl is told to run an agent of its own
   * for the call (`FLY_AGENT_ISOLATED=1`), which stops at the end of its input, when flyctl exits
   * (one still making the peer finishes that first: on-machine.ts), instead of the one agent every
   * call on the runner shares (flyctl 0.5.8's `helpers/config.go`,
   * `agent/agent.go` and `internal/command/agent/run.go`). That agent keeps a tunnel for the
   * organization in its own memory and gives it to the next session (`agent/server/server.go`,
   * `buildTunnel`), though the peer under it has since been removed (on-machine.ts).
   */
  readonly ownAgent?: string;
}

export interface Fly {
  /** `flyctl <args>`: its whole output is collected, and the call is killed after `timeoutMs`. */
  readonly run: (args: readonly string[], options?: FlyCallOptions) => Promise<Spawned>;
}

/** A call that isn't a long one (a deploy, a command on a Machine) gets this long. */
const QUICK_MS = 120_000;

/** An organization's slug, as Fly writes one. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** The name flyctl's agent gives a WireGuard peer it makes for a session (`internal/wireguard/wg.go`). */
const SESSION_PEER = /^interactive-[A-Za-z0-9-]+$/;

/**
 * True for an argument list that is about `DEV_APP` and no other app: it has `-a` or `--app` with
 * `DEV_APP` after it and no other app flag, in any spelling (`--app=x`, `-ax`); or it is one of
 * the calls that name no app by a flag: `orgs list --json`; `apps create DEV_APP`, with
 * `--org <slug>` or not; `wireguard list <slug> --json`; and `wireguard remove <slug> <peer>`, for
 * a peer of the kind an SSH session makes and no other (on-machine.ts says which of those are its own).
 */
export function forDevApp(args: readonly string[]): boolean {
  if (args.length === 3 && args[0] === "orgs" && args[1] === "list" && args[2] === "--json") return true;
  if (args[0] === "wireguard") {
    const [, verb, org = "", last = ""] = args;
    if (args.length !== 4 || !SLUG.test(org)) return false;
    return (verb === "list" && last === "--json") || (verb === "remove" && SESSION_PEER.test(last));
  }
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
      const { ownAgent, ...rest } = options;
      if (ownAgent !== undefined && !isAbsolute(ownAgent)) {
        return Promise.reject(new OpsError("flyctl: an agent's own folder is given by its absolute path"));
      }
      const env =
        ownAgent === undefined ? childEnv : { ...childEnv, FLY_CONFIG_DIR: ownAgent, FLY_AGENT_ISOLATED: "1" };
      return spawn("flyctl", args, { env, timeoutMs: QUICK_MS, ...rest });
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

const listing = (names: readonly string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;

/**
 * The one organization the token sees, by its slug (`flyctl orgs list --json`: `{"<slug>": "<name>"}`).
 * It won't guess between several: it fails, with `several` (what the caller can do about it) after the list.
 */
export async function onlyOrganization(fly: Fly, label: string, several?: string): Promise<string> {
  const result = await fly.run(["orgs", "list", "--json"]);
  if (result.code !== 0) throw new OpsError(`${label}: flyctl couldn't list the organizations: ${why(result)}`);
  const answer = jsonOf(result);
  const orgs =
    typeof answer === "object" && answer !== null && !Array.isArray(answer)
      ? (answer as Record<string, unknown>)
      : undefined;
  if (orgs === undefined) throw new OpsError(`${label}: flyctl's list of organizations isn't one it can read`);
  const slugs = Object.keys(orgs);
  const [only] = slugs;
  if (only === undefined) throw new OpsError(`${label}: the token sees no organization`);
  if (slugs.length > 1) {
    throw new OpsError(
      `${label}: the token sees ${String(slugs.length)} organizations, ${listing(slugs)}${several === undefined ? "" : `: ${several}`}`,
    );
  }
  return only;
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

/** A Machine's id, as Fly writes one: 14 hexadecimal digits. */
export const MACHINE_ID = /^[0-9a-f]{14}$/;
/** At most this many of a Machine's last lines in Fly's log are printed, and each cut at this length. */
const LOG_LINES = 60;
const LINE_CHARS = 400;

// Colours (an escape, `[`, numbers, a letter) and every other control character but the tab. Each regular
// expression names control characters on purpose, which is what no-control-regex warns of.
// eslint-disable-next-line no-control-regex
const COLOURS = /\x1b\[[0-9;]*[A-Za-z]/g;
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\x00-\x08\x0b-\x1f\x7f]/g;

/** A line flyctl printed, on one line, with its colours and other control characters taken out and its length cut. */
function plain(line: string): string {
  const text = line.replace(COLOURS, "").replace(/\n/g, " ").replace(CONTROLS, "").trimEnd();
  return text.length > LINE_CHARS ? `${text.slice(0, LINE_CHARS)}…` : text;
}

/**
 * The rows of a Machine's "Event Logs" table, as `flyctl machine status <id>` prints it (flyctl 0.5.8's
 * `internal/command/machine/status.go`): one row an event, its state, kind, source and time, and for an exit
 * `exit_code=<n>,oom_killed=<bool>,requested_stop=<bool>`. Nothing when flyctl can't say.
 */
export async function machineEvents(fly: Fly, id: string): Promise<string[] | undefined> {
  if (!MACHINE_ID.test(id)) return undefined;
  let result: Spawned;
  try {
    result = await fly.run(["machine", "status", id, "-a", DEV_APP]);
  } catch {
    return undefined;
  }
  if (result.code !== 0) return undefined;
  const lines = result.stdout.split("\n").map(plain);
  const title = lines.findIndex((line) => /^\s*Event Logs\s*$/.test(line));
  if (title === -1) return undefined;
  return lines.slice(title + 1).filter((line) => line.trim() !== "" && /\d{4}-\d{2}-\d{2}T/.test(line));
}

/** An exit among a Machine's events (machineEvents): its code, and whether Fly was asked to stop it. */
export interface ExitEvent {
  readonly code: number;
  readonly requested: boolean;
  readonly oomKilled: boolean;
}

export function exitOf(row: string): ExitEvent | undefined {
  const found = /exit_code=(-?\d+),oom_killed=(true|false),requested_stop=(true|false)/.exec(row);
  if (found === null) return undefined;
  return { code: Number(found[1]), oomKilled: found[2] === "true", requested: found[3] === "true" };
}

/**
 * A Machine's last lines in Fly's log, oldest first, at most LOG_LINES: `flyctl logs --no-tail --json` prints
 * what Fly's log buffer holds as one JSON object a line of the log, each indented and closed by a `}` of its own
 * on a line (flyctl 0.5.8's `logs/entry.go` and `internal/render/render.go`, `json.Encoder` with four spaces).
 * Each is its time, its level and its message. A secret a crash printed is held back as every line an `ops` script
 * says is, by the redactor in `main.ts` (output.ts), whose patterns cover a connection string's user and password,
 * a JSON Web Token and a Supabase secret key, and which holds back the run's own secret values too.
 */
export async function machineLog(fly: Fly, id: string): Promise<string[] | undefined> {
  if (!MACHINE_ID.test(id)) return undefined;
  let result: Spawned;
  try {
    result = await fly.run(["logs", "-a", DEV_APP, "--machine", id, "--no-tail", "--json"]);
  } catch {
    return undefined;
  }
  if (result.code !== 0) return undefined;
  const entries: string[] = [];
  let chunk: string[] = [];
  for (const line of result.stdout.split("\n")) {
    chunk.push(line);
    if (line !== "}") continue;
    try {
      const entry = record(JSON.parse(chunk.join("\n")));
      const message = text(entry?.["message"]);
      if (message !== undefined) {
        entries.push(plain(`${text(entry?.["timestamp"]) ?? ""} [${text(entry?.["level"]) ?? ""}] ${message}`));
      }
    } catch {
      // A chunk that isn't one entry is passed over.
    }
    chunk = [];
  }
  return entries.slice(-LOG_LINES);
}

/**
 * What Fly knows of a Machine's last runs, for a run's log once a start or a deploy has gone wrong, or to show one
 * held: its events (machineEvents) and its last lines in Fly's log (machineLog), each under a line that says what
 * follows. It never throws: a read that fails is a line that says so, since it is said beside another failure.
 */
export async function machineReport(fly: Fly, id: string, label: string): Promise<string[]> {
  return reportOf(id, label, await machineEvents(fly, id), await machineLog(fly, id));
}

/** machineReport's lines from events and log lines already read (undefined: flyctl couldn't say). */
export function reportOf(
  id: string,
  label: string,
  events: readonly string[] | undefined,
  log: readonly string[] | undefined,
): string[] {
  return [
    ...(events === undefined
      ? [`${label}: flyctl couldn't say Machine ${id}'s events`]
      : [`${label}: Machine ${id}'s events, as Fly lists them:`, ...events.map((row) => `  ${row}`)]),
    ...(log === undefined
      ? [`${label}: flyctl couldn't read Machine ${id}'s lines in Fly's log`]
      : log.length === 0
        ? [`${label}: Fly's log holds no line of Machine ${id}`]
        : [`${label}: Machine ${id}'s last lines in Fly's log:`, ...log.map((line) => `  ${line}`)]),
  ];
}
