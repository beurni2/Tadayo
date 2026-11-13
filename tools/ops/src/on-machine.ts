// Runs a command inside the API's Machine of `tadayo-api-dev` (docs/plans/api-b0-deploy.md, section
// 6; TECH-DESIGN sections 8 and 9; T56; ADR-034). Some of what `ops` does needs Supabase's service
// key, which lives only in Fly's secrets (the app's own secrets, set by the founder): `storage-setup`,
// and the API half of the Supabase probe. So the runner starts the same script on the Machine, with
// `--here`, and reads what it printed.
//
// It goes over SSH: `flyctl ssh console -a tadayo-api-dev --machine <id> -q -C "<command>"`. The
// first runs used `flyctl machine exec`, one request to Fly's Machines API that waits for the
// command to end, and Fly answers that request with HTTP 408 after about 60 seconds, whatever time
// limit it carries (run 43160900116; docs/LIMITATIONS.md): the probe takes longer. An SSH session
// lasts as long as its command. What flyctl 0.5.8 does (its source, read on 12 November 2026):
//   - its agent, a second flyctl that this call starts for itself (below), makes a WireGuard peer in
//     the app's organization and brings up a tunnel to Fly's private network over a websocket (no
//     root, no kernel module, no UDP), then checks the tunnel once, with a DNS lookup of at most five
//     seconds (`agent/client.go`, `WaitForTunnel`); a check that fails ends the session with
//     `Error: tunnel unavailable: …`, and nothing retries it. That check is all flyctl bounds: making
//     the peer and connecting the websocket have no deadline of their own, so only `SESSION_MS` ends
//     a session that hangs there;
//   - Fly issues a one-hour SSH certificate for the session;
//   - the command runs on the Machine in its own environment, secrets and fly.toml's `[env]` with it
//     (Fly's documentation runs `fly ssh console -C` for a migration that needs the database's
//     address), with no shell and no terminal, so its output and its errors stay apart;
//   - flyctl exits 0 when the command did; otherwise 1, with its own last line
//     `Error: ssh shell: Process exited with status N` (` from signal S` when a signal ended it, and
//     `. Reason was: …` when the signal came with one), which is how the code is read.
// An exit status of 0 is needed and isn't enough: flyctl 0.5.8 also exits 0, having printed nothing,
// when the session closed before the Machine answered the request to run the command (its
// `ssh/io.go` turns that end of file into success). So what says a script finished is its own last
// line, which run.ts asks for.
//
// Each session gets a folder and an agent of its own (`Fly.run`'s `ownAgent`): flyctl keeps its
// configuration, the peer's WireGuard state with it, in a new empty folder made for the session
// (`FLY_CONFIG_DIR`), and runs an agent for that one call (`FLY_AGENT_ISOLATED=1`), which stops at
// the end of its input, when flyctl exits; the folder, which holds the peer's private key, is
// removed after the session. Otherwise every call on a runner shares one agent, a flyctl left
// running in the background, which keeps the organization's tunnel, and checks it against its own
// copy of the WireGuard state: read from the configuration once, as it starts, and changed only by
// its own writes (flyctl 0.5.8's `agent/server/server.go`, `buildTunnel` and
// `validateTunnelsUnlocked`; `flyctl/flyctl.go`). The clean-up below removes the peer at Fly from
// another flyctl, which that copy never learns, so the agent gives the tunnel to the next session
// until its own check, two minutes after it starts. In `deploy-dev`, which runs two scripts over SSH
// in one job, the second session made no peer and failed its tunnel's one check (run 43467951472,
// both attempts; docs/LIMITATIONS.md, 2026-11-13), as that source says a shared agent would. A fresh
// runner per script, as `ops` has, never met it.
//
// The peer reaches the organization's whole private network until it is removed, and flyctl never
// removes one it made: on a fresh runner, every run would leave one more. So the runner lists the
// organization's peers before the session and again after it, whatever the command did, and removes
// the ones the session made (ADR-034): those that weren't there before and whose names start as
// flyctl's agent names a peer on this runner, `interactive-<host>-` (the whole name is
// `interactive-<host>-<the token's email, as a slug>-<ULID>`). A peer that was there before is never
// touched, and no clock is read (T1: only the time module reads one). A new peer named otherwise is
// left, but fails the run with the commands to look at it by hand, since it may be this run's under a
// name not foreseen; no other runner holds the token while this one runs (`ops-dev`'s concurrency
// group), though a host named like this one with more after a dash couldn't be told from it. When
// the peers can't be listed first, no session starts. Before the session the runner says that it
// makes a peer and how to remove it by hand, for a run cancelled or cut off before its clean-up. The
// names hold an email, so none is printed. A peer this run couldn't remove fails the run, and so does
// finding none of this run's after a session that reached the Machine, which must have made one;
// after flyctl's own failure or a timeout, which may have made one, the runner says what to look at
// by hand.

import { mkdtemp, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { DEV_APP } from "./environment.ts";
import { jsonOf, machineList, machines, onlyOrganization, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";
import type { Spawned } from "./spawn.ts";

export interface OnMachineInput {
  readonly fly: Fly;
  /** The script's name, for the messages. */
  readonly label: string;
  /** The command's words, which go to the Machine as one line. */
  readonly command: readonly string[];
  /** Says a line the Machine printed. */
  readonly say: (line: string) => void;
  /** Says a line of the runner's own, about the run's WireGuard peer, which isn't the Machine's report (run.ts reads that apart). */
  readonly note: (line: string) => void;
  /** The runner's host name, which flyctl's agent puts in its peer's name: the real one unless a test gives its own. */
  readonly host?: string;
  /** Makes the session's own folder for flyctl's agent, and removes it after: the real ones unless a test gives its own. */
  readonly agentFolder?: AgentFolder;
}

export interface AgentFolder {
  /** A new empty folder, by its absolute path, that only the runner's user may read (mode 0700). */
  readonly make: () => Promise<string>;
  /** Removes the folder and everything in it. */
  readonly remove: (path: string) => Promise<void>;
}

/** Under the system's temporary folder, made with mode 0700 (`mkdtemp`). */
export const AGENT_FOLDER: AgentFolder = {
  make: () => mkdtemp(join(tmpdir(), "tadayo-flyctl-")),
  remove: (path) => rm(path, { recursive: true, force: true }),
};

/** An error's own words, for a message. */
const wordsOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What the command gets on the Machine, once it has started, before the runner gives up on it (supabase-probe.ts keeps its own deadline a minute inside it). */
export const COMMAND_SECONDS = 300;
/** Room for flyctl's agent to make the peer and bring its tunnel up: flyctl 0.5.8 bounds neither (`internal/wireguard/wg.go`'s `Create` runs under `context.TODO()`), only its one check of the tunnel, five seconds. */
export const TUNNEL_SECONDS = 240;
/** The certificate, the SSH handshake and Node's start, with room to spare. */
const CONNECT_SECONDS = 60;
/** The whole call: the tunnel, the connection and the command, so that only a session that hangs is cut short. */
export const SESSION_MS = (TUNNEL_SECONDS + CONNECT_SECONDS + COMMAND_SECONDS) * 1000;
const PLAIN_WORD = /^[A-Za-z0-9._/:=@-]+$/;

/** The lines of a text, without the empty lines it ends with (flyctl ends some of its errors with one). */
function linesOf(text: string): string[] {
  const trimmed = text.replace(/\n+$/, "");
  return trimmed === "" ? [] : trimmed.split("\n");
}

// flyctl prints its own failure as `Error: <what went wrong>` (`internal/cli/cli.go`, `printError`),
// with the first word in colour only on a terminal (the code that ends the colour is left out of the
// match). A session's failures end there; an error that carries a description, a suggestion or a
// link has those printed after it (the agent's own failure to start, with its log, does), so that
// failure's lines are all said and `why` words it.
// eslint-disable-next-line no-control-regex -- the escape that starts a terminal colour
const COLOUR = /\u001b\[[0-9;]*m/g;
const FLYCTL_ERROR = /^Error: /;
// golang.org/x/crypto's `Waitmsg.String`, which flyctl wraps as `ssh shell`.
const EXITED = /^Error: ssh shell: Process exited with status (\d+)(?: from signal (\w+))?(?:\. Reason was: .*)?$/;
// x/crypto's `ExitMissingError`: the session's channel closed with no status, which the Machine's end
// and a connection lost on the way both give.
const NO_STATUS = "Error: ssh shell: wait: remote command exited without exit status or exit signal";
// The agent's one check of its new tunnel failed (`agent/remote.go`).
const TUNNEL_UNAVAILABLE = /^Error: tunnel unavailable\b/;

// ---- The run's WireGuard peer.

/** The host as flyctl puts it in a peer's name: the name's first label, with anything but letters, digits, `\` and `-` made a `-` (`internal/wireguard/wg.go`). */
export const hostSlug = (host: string): string => (host.split(".")[0] ?? "").replace(/[^a-zA-Z0-9\\-]/g, "-");

/** True for a name that starts as flyctl's agent names the peer it makes on this host: `interactive-<host>-`, then its email part and a ULID. */
export function sessionPeerOf(name: string, host: string): boolean {
  const slug = hostSlug(host);
  return slug !== "" && name.startsWith(`interactive-${slug}-`);
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** The names of the organization's peers, as `flyctl wireguard list <org> --json` has them (fly-go's `WireGuardPeer`: `Name`, `Region`, `Peerip`, …), or nothing when that isn't a list of them. */
function peerNames(answer: unknown): string[] | undefined {
  if (!Array.isArray(answer)) return undefined;
  const names: string[] = [];
  for (const entry of answer) {
    const name = record(entry)?.["Name"];
    if (typeof name !== "string") return undefined;
    names.push(name);
  }
  return names;
}

/** A flyctl call's answer, or, when `Fly.run` refused it or flyctl couldn't be started, why not. */
type Attempted = Spawned | { readonly unmade: string };

/** Makes a flyctl call without throwing, so that the clean-up always gets to its end. */
async function attempt(fly: Fly, args: readonly string[]): Promise<Attempted> {
  try {
    return await fly.run(args);
  } catch (error) {
    return { unmade: error instanceof Error ? error.message : String(error) };
  }
}

/** The names of the organization's peers, in flyctl's order, or why there are none to read. */
async function listPeers(fly: Fly, org: string): Promise<{ names: ReadonlySet<string> } | { reason: string }> {
  const listed = await attempt(fly, ["wireguard", "list", org, "--json"]);
  if ("unmade" in listed) return { reason: `the call wasn't made: ${listed.unmade}` };
  const names = listed.code === 0 ? peerNames(jsonOf(listed)) : undefined;
  if (names !== undefined) return { names: new Set(names) };
  return { reason: listed.code === 0 ? "its answer isn't a list it can read" : why(listed) };
}

/** What to do by hand about the organization's peers, for the founder. */
const byHandFor = (org: string, host: string) =>
  `\`flyctl wireguard list ${org}\` lists the organization's peers, and \`flyctl wireguard remove ${org} <name>\` removes one; this run's names start with interactive-${hostSlug(host)}-`;

interface Session {
  readonly label: string;
  readonly host: string;
  readonly org: string;
  /** The organization's peers before the session. */
  readonly before: ReadonlySet<string>;
  /** Whether flyctl said how the command ended, or that it ended unsaid: the session reached the Machine, so a peer of this run's must be there. */
  readonly reached: boolean;
}

/**
 * Removes the peers this run made, and says so. Gives back what went wrong, in words for the
 * founder, or nothing when every peer of this run's is gone. It throws nothing: the session's own
 * outcome is said whatever happens here.
 */
async function removeThisRunsPeers(
  fly: Fly,
  session: Session,
  note: (line: string) => void,
): Promise<string | undefined> {
  const { label, host, org } = session;
  const byHand = byHandFor(org, host);
  const after = await listPeers(fly, org);
  if ("reason" in after) {
    return `${label}: flyctl couldn't list the organization's WireGuard peers (${after.reason}), so the one this run may have made can't be removed: ${byHand}`;
  }
  const fresh = [...after.names].filter((name) => !session.before.has(name));
  const ours = fresh.filter((name) => sessionPeerOf(name, host));
  const strangers = fresh.length - ours.length;
  // A peer that appeared during the session under another name is left, and said, without its name.
  // flyctl names each peer its agent makes interactive-<host>-…, so once one of this run's is found,
  // the others aren't its; with none found, this run's may be among them under a name not foreseen.
  const unknown =
    strangers === 0
      ? undefined
      : `${label}: ${String(strangers)} WireGuard ${strangers === 1 ? "peer that isn't" : "peers that aren't"} named for this runner appeared in the organization during the session and ${strangers === 1 ? "is" : "are"} left${ours.length === 0 ? ", though this run's may be among them" : ""}: ${byHand}`;
  if (ours.length === 0) {
    if (unknown !== undefined) return unknown;
    // A session that reached the Machine made a peer. flyctl's own failure may have come before or after its agent made one, and a timeout before or after the Machine.
    return session.reached
      ? `${label}: none of the organization's WireGuard peers is one this run made, though its session reached the Machine, so it can't say it removed it: ${byHand}`
      : `${label}: no new WireGuard peer named for this runner is listed, so none was removed; if the session made one, ${byHand}`;
  }
  const failed: string[] = [];
  for (const name of ours) {
    const removed = await attempt(fly, ["wireguard", "remove", org, name]);
    if (!("unmade" in removed) && removed.code === 0) continue;
    failed.push(name);
    // What flyctl prints names the peer, and so the token's email, as may the reason a call wasn't made: only how it ended is said.
    const ending =
      "unmade" in removed
        ? "couldn't be started"
        : removed.timedOut
          ? "ran out of time"
          : `ended with exit code ${String(removed.code)}`;
    note(`${label}: flyctl's removal of a WireGuard peer this run made ${ending}`);
  }
  // flyctl 0.5.8 can exit 1 after removing the peer (its `PruneInvalidPeers` runs after the removal),
  // so a peer counts as left only when a new list still shows it, or when no list can be had.
  let left = failed.length;
  if (left > 0) {
    const again = await listPeers(fly, org);
    if (!("reason" in again)) left = failed.filter((name) => again.names.has(name)).length;
  }
  if (left > 0) {
    if (unknown !== undefined) note(unknown);
    return `${label}: ${String(left)} of the WireGuard peers this run made ${left === 1 ? "is" : "are"} still there: ${byHand}`;
  }
  note(`${label}: removed the WireGuard peer this run made`);
  return unknown;
}

export async function onMachine(input: OnMachineInput): Promise<void> {
  const { fly, label, say, note } = input;
  if (input.command.length === 0 || !input.command.every((word) => PLAIN_WORD.test(word))) {
    throw new OpsError(`${label}: a command for the Machine is plain words: letters, digits and . _ / : = @ -`);
  }
  const all = await machines(fly);
  const target = all.find((machine) => machine.group === "api" && machine.state === "started");
  if (target === undefined) {
    // A Machine that crashed is restarted a few times and then left stopped (fly.toml's `[[restart]]`),
    // and deploying again leaves it stopped: what it died of is in Fly's log, which no script reads.
    const advice = all.some((machine) => machine.group === "api")
      ? `if it stopped on its own, Fly's log of ${DEV_APP} says why`
      : "deploy first";
    throw new OpsError(`${label}: the API has no started Machine (the app's Machines: ${machineList(all)}); ${advice}`);
  }

  // The peers there are before the session, so that the one it makes can be told from them.
  let org: string;
  try {
    org = await onlyOrganization(fly, label);
  } catch (error) {
    if (!(error instanceof OpsError)) throw error;
    throw new OpsError(
      `${error.message}, so no SSH session is started: the WireGuard peer one makes couldn't be removed`,
    );
  }
  const before = await listPeers(fly, org);
  if ("reason" in before) {
    throw new OpsError(
      `${label}: flyctl couldn't list the organization's WireGuard peers (${before.reason}), so no SSH session is started: the peer one makes couldn't be told from the others and removed`,
    );
  }
  const host = input.host ?? hostname();
  const folders = input.agentFolder ?? AGENT_FOLDER;
  let folder: string;
  try {
    folder = await folders.make();
  } catch (error) {
    throw new OpsError(
      `${label}: couldn't make a folder for flyctl's agent (${wordsOf(error)}), so no SSH session is started`,
    );
  }
  note(
    `${label}: the SSH session makes a WireGuard peer in ${org}, which this run removes after it; if the run is cancelled or cut off first, ${byHandFor(org, host)}`,
  );

  let result: Spawned;
  try {
    result = await fly.run(
      ["ssh", "console", "-a", DEV_APP, "--machine", target.id, "-q", "-C", input.command.join(" ")],
      { timeoutMs: SESSION_MS, ownAgent: folder },
    );
  } finally {
    // Only now that the call has ended. The session's agent stops at the end of its input, which
    // flyctl holds, when flyctl exits (`internal/command/agent/run.go`); one cut off while it makes
    // the peer (`Create`, which nothing bounds) finishes that call first, and can't save the peer
    // into a folder that is gone, and GitHub ends any process left with the job. The folder holds the
    // peer's private key, of no use once the peer is removed below, on a runner that ends with the
    // job: a folder left is said, and the run goes on to its peer, which matters more.
    await folders.remove(folder).catch((error: unknown) => {
      note(`${label}: the folder of flyctl's agent couldn't be removed: ${wordsOf(error)}`);
    });
  }

  // Every line that came back is said, also from a session that failed or was cut short, except
  // flyctl's own last line, which the outcome below says in its words.
  const errors = linesOf(result.stderr);
  const last = (errors.at(-1) ?? "").replace(COLOUR, "");
  const flyctlFailed = !result.timedOut && result.code !== 0 && FLYCTL_ERROR.test(last);
  for (const line of linesOf(result.stdout)) say(line);
  for (const line of flyctlFailed ? errors.slice(0, -1) : errors) say(line);

  const exited = result.code === 1 && flyctlFailed ? EXITED.exec(last) : null;
  const noStatus = result.code === 1 && flyctlFailed && last === NO_STATUS;
  let failure: OpsError | undefined;
  if (result.timedOut) {
    failure = new OpsError(
      `${label}: the session ran out of time after ${String(SESSION_MS / 1000)} seconds, and the command may still be running on the Machine`,
    );
  } else if (exited !== null) {
    const signal = exited[2] === undefined ? "" : `, ended by signal ${exited[2]}`;
    failure = new OpsError(`${label}: it failed on the Machine, with exit code ${exited[1] ?? ""}${signal}`);
  } else if (noStatus) {
    failure = new OpsError(
      `${label}: the session ended without saying how the command ended: the Machine closed it, or the connection to it was lost`,
    );
  } else if (result.code !== 0) {
    const reason = flyctlFailed ? `exit code ${String(result.code)}: ${last}` : why(result);
    const hint =
      flyctlFailed && TUNNEL_UNAVAILABLE.test(last)
        ? "; flyctl checks a new tunnel only once, for at most five seconds, so running the script again may work"
        : "";
    failure = new OpsError(`${label}: flyctl couldn't run it on the Machine: ${reason}${hint}`);
  }

  const reached = result.code === 0 || exited !== null || noStatus;
  const leftover = await removeThisRunsPeers(fly, { label, host, org, before: before.names, reached }, note);
  if (failure !== undefined) {
    if (leftover !== undefined) note(leftover);
    throw failure;
  }
  if (leftover !== undefined) throw new OpsError(leftover);
}
