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
//   - its agent, a flyctl left running in the background on the runner, makes a WireGuard peer in
//     the app's organization and brings up a tunnel to Fly's private network over a websocket (no
//     root, no kernel module, no UDP), waiting up to 240 seconds for it (`TUNNEL_SECONDS`);
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
// The peer reaches the organization's whole private network until it is removed, and flyctl never
// removes one it made: on a fresh runner, every run would leave one more. So, whatever the command
// did, the runner lists the organization's peers and removes the ones this run made (ADR-034). flyctl
// names a peer `interactive-<host>-<the token's email, as a slug>-<ULID>`, and a ULID starts with
// the time it was made, so a peer is this run's when it names this runner's host and was made
// during the session; none other is touched. The names hold an email, so none is printed. A peer
// this run couldn't remove fails the run, with the commands that remove it by hand.

import { hostname } from "node:os";
import { DEV_APP } from "./environment.ts";
import { jsonOf, machineList, machines, onlyOrganization, why, type Fly } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

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
  /** The runner's host name and clock, by which flyctl's agent names and dates its peer: the real ones unless a test gives its own. */
  readonly host?: string;
  readonly now?: () => number;
}

/** What the command gets on the Machine, once it has started, before the runner gives up on it (supabase-probe.ts keeps its own deadline a minute inside it). */
export const COMMAND_SECONDS = 300;
/** How long flyctl 0.5.8 waits for its tunnel before it gives up (`agent/client.go`, `WaitForTunnel`). */
export const TUNNEL_SECONDS = 240;
/** The certificate, the SSH handshake and Node's start, with room to spare. */
const CONNECT_SECONDS = 60;
/** The whole call: the tunnel, the connection and the command, so that only a session that hangs is cut short. */
export const SESSION_MS = (TUNNEL_SECONDS + CONNECT_SECONDS + COMMAND_SECONDS) * 1000;
const PLAIN_WORD = /^[A-Za-z0-9._/:=@-]+$/;

const linesOf = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

// flyctl prints its own failure last, as `Error: <what went wrong>` (`internal/cli/cli.go`,
// `printError`), with the first word in colour only on a terminal; the code that ends the colour is left out of the match.
// eslint-disable-next-line no-control-regex -- the escape that starts a terminal colour
const COLOUR = /\u001b\[[0-9;]*m/g;
const FLYCTL_ERROR = /^Error: /;
// golang.org/x/crypto's `Waitmsg.String`, which flyctl wraps as `ssh shell`.
const EXITED = /^Error: ssh shell: Process exited with status (\d+)(?: from signal (\w+))?(?:\. Reason was: .*)?$/;
const NO_STATUS = "Error: ssh shell: wait: remote command exited without exit status or exit signal";

// ---- The run's WireGuard peer.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
/** The milliseconds a ULID starts with (its first ten characters, in Crockford's base 32), or nothing when it isn't one. */
export function ulidTime(text: string): number | undefined {
  if (!ULID.test(text)) return undefined;
  let ms = 0;
  for (const character of text.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(character);
  return ms;
}

/** The host as flyctl puts it in a peer's name: the name's first label, with anything but letters, digits, `\` and `-` made a `-` (`internal/wireguard/wg.go`). */
export const hostSlug = (host: string): string => (host.split(".")[0] ?? "").replace(/[^a-zA-Z0-9\\-]/g, "-");

/** The clocks of the runner and of flyctl's agent are one, so this is only for the milliseconds a ULID rounds to. */
const SLACK_MS = 2_000;

/** True for the name of a peer flyctl's agent made on this host between `since` and `until`. */
export function peerOfThisRun(name: string, host: string, since: number, until: number): boolean {
  const prefix = `interactive-${hostSlug(host)}-`;
  if (hostSlug(host) === "" || !name.startsWith(prefix)) return false;
  const rest = name.slice(prefix.length);
  const dash = rest.lastIndexOf("-");
  if (dash < 1) return false;
  const made = ulidTime(rest.slice(dash + 1));
  return made !== undefined && made >= since - SLACK_MS && made <= until + SLACK_MS;
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

interface Session {
  readonly label: string;
  readonly host: string;
  readonly since: number;
  readonly until: number;
  /** Whether the session got as far as the Machine, so that a peer of this run's must be there. */
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
  const { label, host } = session;
  const byHand = (org: string) =>
    `\`flyctl wireguard list ${org}\` lists the organization's peers, and \`flyctl wireguard remove ${org} <name>\` removes one; this run's names start with interactive-${hostSlug(host)}-`;
  let org: string;
  try {
    org = await onlyOrganization(fly, label);
  } catch (error) {
    const reason = error instanceof OpsError ? error.message : `${label}: the organization couldn't be found`;
    return `${reason}, so the WireGuard peer this run may have made can't be removed: ${byHand("<org>")}`;
  }
  const listed = await fly.run(["wireguard", "list", org, "--json"]);
  const names = listed.code === 0 ? peerNames(jsonOf(listed)) : undefined;
  if (names === undefined) {
    const reason = listed.code === 0 ? "its answer isn't a list it can read" : why(listed);
    return `${label}: flyctl couldn't list the organization's WireGuard peers (${reason}), so the one this run may have made can't be removed: ${byHand(org)}`;
  }
  const ours = names.filter((name) => peerOfThisRun(name, host, session.since, session.until));
  if (ours.length === 0) {
    return session.reached
      ? `${label}: none of the organization's WireGuard peers is one this run made, though its session reached the Machine, so it can't say it removed it: ${byHand(org)}`
      : undefined;
  }
  let left = 0;
  for (const name of ours) {
    const removed = await fly.run(["wireguard", "remove", org, name]);
    // What flyctl prints names the peer, and so the token's email: only its exit code is said.
    if (removed.code === 0) continue;
    left += 1;
    note(
      `${label}: flyctl couldn't remove a WireGuard peer this run made (${removed.timedOut ? "it ran out of time" : `exit code ${String(removed.code)}`})`,
    );
  }
  if (left > 0)
    return `${label}: ${String(left)} of the WireGuard peers this run made ${left === 1 ? "is" : "are"} still there: ${byHand(org)}`;
  note(`${label}: removed the WireGuard peer this run made`);
  return undefined;
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

  const now = input.now ?? Date.now;
  const since = now();
  const result = await fly.run(
    ["ssh", "console", "-a", DEV_APP, "--machine", target.id, "-q", "-C", input.command.join(" ")],
    { timeoutMs: SESSION_MS },
  );
  const until = now();

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
    failure = new OpsError(`${label}: the Machine ended the session without saying how the command ended`);
  } else if (result.code !== 0) {
    const reason = flyctlFailed ? `exit code ${String(result.code)}: ${last}` : why(result);
    failure = new OpsError(`${label}: flyctl couldn't run it on the Machine: ${reason}`);
  }

  const reached = result.code === 0 || exited !== null || noStatus;
  const host = input.host ?? hostname();
  const leftover = await removeThisRunsPeers(fly, { label, host, since, until, reached }, note);
  if (failure !== undefined) {
    if (leftover !== undefined) note(leftover);
    throw failure;
  }
  if (leftover !== undefined) throw new OpsError(leftover);
}
