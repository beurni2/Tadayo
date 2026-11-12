// `onMachine` against a made-up `flyctl` (test/fake-fly.ts): a command run inside the API's Machine,
// where the Supabase service key is (docs/plans/api-b0-deploy.md, section 6; T56; ADR-034). It goes
// over `flyctl ssh console`, which exits 0 when the command did and 1 otherwise, with flyctl's own
// last line saying the command's exit status (flyctl 0.5.8 and golang.org/x/crypto's source); and
// whatever the command did, the WireGuard peer the session made is removed, and no other: the
// organization's peers are listed before and after it, and only a new one named for this runner goes.

import { describe, expect, it } from "vitest";
import {
  FAKE_FLY_TOKEN,
  PEER_EMAIL,
  fakeSpawn,
  json,
  lineOf,
  machine,
  peerList,
  sessionPeer,
  ulidAt,
  type Reply,
  type Route,
} from "../test/fake-fly.ts";
import { flyOf } from "./fly.ts";
import { COMMAND_SECONDS, SESSION_MS, TUNNEL_SECONDS, hostSlug, onMachine, sessionPeerOf } from "./on-machine.ts";
import { OpsError } from "./ops-error.ts";

const LIST = "flyctl machine list -a tadayo-api-dev --json";
const COMMAND = ["node", "/app/tools/ops/src/main.ts", "storage-setup", "--here", "--ref", "abcdefghijklmnopqrst"];
const SSH = `flyctl ssh console -a tadayo-api-dev --machine a1 -q -C ${COMMAND.join(" ")}`;
const ORGS = "flyctl orgs list --json";
const PEERS = "flyctl wireguard list tadayo-org --json";
const REMOVE = "flyctl wireguard remove tadayo-org";
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };

const HOST = "runnervm0abc1";
/** When the session's peer was made: only its name holds it, and nothing reads it. */
const MADE = 1_794_460_003_000;
const OURS = sessionPeer(HOST, MADE);
/** A peer someone else made during the session, on another host. */
const LAPTOP = sessionPeer("founders-laptop", MADE);

const machines = json([machine("w1", "worker", "started"), machine("a1", "api", "started")]);
const orgs = json({ "tadayo-org": "Tadayo" });

/** flyctl's own last line for a command that failed on the Machine (`ssh shell: ` and x/crypto's `Waitmsg`). */
const exited = (status: number, extra = "") =>
  `Error: ssh shell: Process exited with status ${String(status)}${extra}\n`;

/** The peer listing's answers: the first `before` the session, then `after` it, and `later` for any list after that. */
const peersOf =
  (before: Reply, after: Reply, later: Reply = after) =>
  (_call: unknown, earlier: number): Reply =>
    earlier === 0 ? before : earlier === 1 ? after : later;

/** The routes of a run whose session answers `session`, with the organization's peers `before` and `after` it. */
const routes = (session: Reply, after: readonly string[] = [OURS], before: readonly string[] = []): Route[] => [
  [LIST, machines],
  [SSH, session],
  [ORGS, orgs],
  [PEERS, peersOf(peerList(before), peerList(after))],
  [REMOVE, { stdout: 'Removing WireGuard peer "…" for organization tadayo-org\nRemoved peer.\n' }],
];

async function run(list: readonly Route[], command: readonly string[] = COMMAND) {
  const { spawn, calls } = fakeSpawn(list);
  const said: string[] = [];
  const outcome = await onMachine({
    fly: flyOf(spawn, ENV),
    label: "storage-setup",
    command,
    say: (line) => said.push(`machine: ${line}`),
    note: (line) => said.push(line),
    host: HOST,
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, said, outcome };
}

const message = (outcome: unknown) =>
  outcome instanceof OpsError ? outcome.message : `not an OpsError: ${String(outcome)}`;
const BY_HAND =
  "`flyctl wireguard list tadayo-org` lists the organization's peers, and `flyctl wireguard remove tadayo-org <name>` removes one; this run's names start with interactive-runnervm0abc1-";
/** Said before every session: the peer it makes, and what to do if the run is cut off before its clean-up. */
const MAKING = `storage-setup: the SSH session makes a WireGuard peer in tadayo-org, which this run removes after it; if the run is cancelled or cut off first, ${BY_HAND}`;
const REMOVED = "storage-setup: removed the WireGuard peer this run made";
const NONE_FOUND = `storage-setup: none of the organization's WireGuard peers is one this run made, though its session reached the Machine, so it can't say it removed it: ${BY_HAND}`;
/** Said after a session that failed short of the Machine when no new peer of this run's is listed. */
const NONE_LISTED = `storage-setup: no new WireGuard peer named for this runner is listed, so none was removed; if the session made one before it failed, ${BY_HAND}`;
/** Beside a peer of this run's, found by its name, the others can't be this run's, and aren't said to be. */
const strangers = (n: number, besideOurs = false) =>
  `storage-setup: ${String(n)} WireGuard ${n === 1 ? "peer that isn't" : "peers that aren't"} named for this runner appeared in the organization during the session and ${n === 1 ? "is" : "are"} left${besideOurs ? "" : ", though this run's may be among them"}: ${BY_HAND}`;

describe("onMachine: the command, over SSH", () => {
  it("runs the command in the API's started Machine, as one string, says what it printed, then removes the run's peer", async () => {
    const result = await run(routes({ stdout: "first\nsecond\n", stderr: "a warning\n" }));
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, ORGS, PEERS, SSH, PEERS, `${REMOVE} ${OURS}`]);
    expect(result.raw[3]?.args).toEqual([
      "ssh",
      "console",
      "-a",
      "tadayo-api-dev",
      "--machine",
      "a1",
      "-q",
      "-C",
      COMMAND.join(" "),
    ]);
    expect(result.said).toEqual([MAKING, "machine: first", "machine: second", "machine: a warning", REMOVED]);
  });

  it("gives the session the tunnel's bound, the connection and the command's time, and flyctl the token and HOME only", async () => {
    const result = await run(routes({}));
    expect(SESSION_MS).toBe((TUNNEL_SECONDS + 60 + COMMAND_SECONDS) * 1000);
    expect(SESSION_MS).toBe(600_000);
    expect(result.raw[3]?.options.timeoutMs).toBe(600_000);
    for (const call of result.raw) expect(call.options.env).toEqual(ENV);
    // The organization, the listings and the removal are quick calls.
    expect([1, 2, 4, 5].map((index) => result.raw[index]?.options.timeoutMs)).toEqual([
      120_000, 120_000, 120_000, 120_000,
    ]);
  });

  it("fails with the command's exit code, after saying what it printed, when the command failed, and still removes the peer", async () => {
    const result = await run(
      routes({ code: 1, stdout: "half of it\n", stderr: `set SUPABASE_SERVICE_KEY\n${exited(1)}` }),
    );
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 1");
    // flyctl's own line isn't said as the Machine's: the failure says it in its words.
    expect(result.said).toEqual([MAKING, "machine: half of it", "machine: set SUPABASE_SERVICE_KEY", REMOVED]);
    expect(result.calls.at(-1)).toBe(`${REMOVE} ${OURS}`);
  });

  it("names the signal when one ended the command, with or without the reason x/crypto adds", async () => {
    for (const [line, expected] of [
      [exited(137, " from signal KILL"), "exit code 137, ended by signal KILL"],
      [exited(143, " from signal TERM. Reason was: out of memory"), "exit code 143, ended by signal TERM"],
      [exited(2, ". Reason was: a reason"), "exit code 2"],
    ] as const) {
      const result = await run(routes({ code: 1, stderr: line }));
      expect(message(result.outcome), line).toBe(`storage-setup: it failed on the Machine, with ${expected}`);
      expect(result.said, line).toEqual([MAKING, REMOVED]);
    }
  });

  it("reads flyctl's line in colour, as a terminal would show it, the same way", async () => {
    const result = await run(
      routes({ code: 1, stderr: "\u001b[31mError: \u001b[0mssh shell: Process exited with status 3\n" }),
    );
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 3");
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("fails when the session ended without an exit status, which the Machine's end and a lost connection both give", async () => {
    const result = await run(
      routes({
        code: 1,
        stdout: "supabase-probe: run 1\n",
        stderr: "Error: ssh shell: wait: remote command exited without exit status or exit signal\n",
      }),
    );
    expect(message(result.outcome)).toBe(
      "storage-setup: the session ended without saying how the command ended: the Machine closed it, or the connection to it was lost",
    );
    expect(result.said).toEqual([MAKING, "machine: supabase-probe: run 1", REMOVED]);
  });

  it("says every line of flyctl's failure to start its agent, which ends with its log, and words the failure from them", async () => {
    // printError's `Error:` line, then the error's description: the agent's log and where a copy is (agent/start.go).
    const stderr =
      "Error: can't establish agent: agent: failed to start\n" +
      "The agent failed to start with the following error log:\n\n" +
      "2026/11/12 08:00:00 the log's line\n\n" +
      "A copy of this log has been saved at /home/runner/.fly/agent-logs/1.log\n\n";
    const result = await run(routes({ code: 1, stderr }, []));
    expect(message(result.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: can't establish agent: agent: failed to start / The agent failed to start with the following error log: / 2026/11/12 08:00:00 the log's line",
    );
    expect(result.said).toEqual([
      MAKING,
      "machine: Error: can't establish agent: agent: failed to start",
      "machine: The agent failed to start with the following error log:",
      "machine: ",
      "machine: 2026/11/12 08:00:00 the log's line",
      "machine: ",
      "machine: A copy of this log has been saved at /home/runner/.fly/agent-logs/1.log",
      NONE_LISTED,
    ]);
    expect(result.calls).toEqual([LIST, ORGS, PEERS, SSH, PEERS]);
  });

  it("removes the peer the agent made before its one check of the tunnel failed, and says running it again may work", async () => {
    const result = await run(routes({ code: 1, stderr: "Error: tunnel unavailable: context deadline exceeded\n" }));
    expect(message(result.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: tunnel unavailable: context deadline exceeded; flyctl checks a new tunnel only once, for at most five seconds, so running the script again may work",
    );
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("reads flyctl's failure as its own though it ends with an empty line, and says none of it as the Machine's", async () => {
    const result = await run(
      routes({ code: 1, stderr: "Error: ssh: can't build tunnel for tadayo-org: websocket: bad handshake\n\n" }),
    );
    expect(message(result.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: ssh: can't build tunnel for tadayo-org: websocket: bad handshake",
    );
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("reads any other exit code as flyctl's failure, never as the command's, even with a status line last", async () => {
    for (const reply of [
      { code: 126, stderr: "Error: context deadline exceeded\n" },
      { code: 127, stderr: exited(1) },
      { code: 2, stderr: exited(0) },
      { code: 2, stderr: "Error: ssh shell: wait: remote command exited without exit status or exit signal\n" },
      { code: 1, stderr: "panic: a bug\ngoroutine 1 [running]:\n" },
      { code: 1 },
    ]) {
      const result = await run(routes(reply, []));
      expect(message(result.outcome), JSON.stringify(reply)).toMatch(
        /^storage-setup: flyctl couldn't run it on the Machine: (exit code \d+)/,
      );
    }
  });

  it("fails after saying what came back when the session ran out of time, and still removes the peer", async () => {
    // What the Machine printed last is said, even a line that starts as flyctl's own do: flyctl ended no session here.
    const result = await run(
      routes({ code: null, timedOut: true, stdout: "supabase-probe: run 1\n", stderr: "Error: still waiting\n" }),
    );
    expect(message(result.outcome)).toBe(
      "storage-setup: the session ran out of time after 600 seconds, and the command may still be running on the Machine",
    );
    expect(result.said).toEqual([MAKING, "machine: supabase-probe: run 1", "machine: Error: still waiting", REMOVED]);
  });

  it("says that the session makes a peer, and how to remove one by hand, before the session starts", async () => {
    const said: string[] = [];
    let beforeTheSession: string[] = [];
    const { spawn } = fakeSpawn([
      [LIST, machines],
      [
        SSH,
        () => {
          beforeTheSession = [...said];
          return { stdout: "done\n" };
        },
      ],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS]))],
      [REMOVE, {}],
    ]);
    await onMachine({
      fly: flyOf(spawn, ENV),
      label: "storage-setup",
      command: COMMAND,
      say: (line) => said.push(`machine: ${line}`),
      note: (line) => said.push(line),
      host: HOST,
    });
    // A run cancelled during its session has the line in its log already.
    expect(beforeTheSession).toEqual([MAKING]);
    expect(said).toEqual([MAKING, "machine: done", REMOVED]);
  });

  it("passes a session that exited 0 having printed nothing, which only the script's own last line can judge (run.ts)", async () => {
    const result = await run(routes({}));
    expect(result.outcome).toBeUndefined();
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("gives a line the Machine printed that looks like flyctl's no weight: only flyctl's exit code and last line count", async () => {
    const passed = await run(routes({ stderr: exited(1) }));
    expect(passed.outcome).toBeUndefined();
    expect(passed.said).toEqual([MAKING, "machine: Error: ssh shell: Process exited with status 1", REMOVED]);
    // Exit 1 with the Machine's imitation earlier and flyctl's real failure last: flyctl's failure.
    const failed = await run(routes({ code: 1, stderr: `${exited(0)}Error: connection lost\n` }));
    expect(message(failed.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: connection lost",
    );
    expect(failed.said).toEqual([MAKING, "machine: Error: ssh shell: Process exited with status 0", REMOVED]);
  });

  it("fails when the API has no started Machine, names the Machines there are, and runs nothing", async () => {
    const stopped = await run([[LIST, json([machine("a1", "api", "stopped"), machine("w1", "worker", "started")])]]);
    // A Machine that stopped on its own: deploying again won't start it, and the reason is in Fly's log.
    expect(message(stopped.outcome)).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: a1 (api, stopped), w1 (worker, started)); if it stopped on its own, Fly's log of tadayo-api-dev says why",
    );
    expect(stopped.calls).toEqual([LIST]);
    // No Machine at all, or a worker only: nothing has been deployed yet.
    const none = await run([[LIST, json([])]]);
    expect(message(none.outcome)).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: none); deploy first",
    );
    const workerOnly = await run([[LIST, json([machine("w1", "worker", "started")])]]);
    expect(message(workerOnly.outcome)).toBe(
      "storage-setup: the API has no started Machine (the app's Machines: w1 (worker, started)); deploy first",
    );
    expect(none.calls).toEqual([LIST]);
  });

  it("takes only plain words for the command, so nothing in it is read as anything else", async () => {
    for (const command of [
      [],
      ["node", ""],
      ["node", "a b"],
      ["node", "x;rm"],
      ["node", "$(id)"],
      ["node", "a\nb"],
      ["node", "'x'"],
    ]) {
      const result = await run([], command);
      expect(result.outcome, JSON.stringify(command)).toBeInstanceOf(OpsError);
      expect(result.calls, JSON.stringify(command)).toEqual([]);
    }
  });
});

describe("onMachine: the run's WireGuard peer, and no other", () => {
  it("removes every new peer named for this runner, and never one that was there before", async () => {
    const earlier = sessionPeer(HOST, MADE - 3_600_000); // this host's name, there before the session
    const byHand = `static-${HOST}-${PEER_EMAIL}-${ulidAt(MADE)}`; // made by hand, there before the session
    const second = sessionPeer(HOST, MADE + 1_000, "another-example-invalid");
    const result = await run(routes({}, [earlier, LAPTOP, byHand, OURS, second], [earlier, LAPTOP, byHand]));
    expect(result.outcome).toBeUndefined();
    expect(result.calls.slice(5)).toEqual([`${REMOVE} ${OURS}`, `${REMOVE} ${second}`]);
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("takes a new peer named for this runner whatever follows the host, an empty email part among them", async () => {
    // flyctl names it `interactive-<host>-<email>-<ULID>`: a principal with no email gives a double dash.
    const noEmail = `interactive-${HOST}--${ulidAt(MADE)}`;
    const result = await run(
      routes({ code: 1, stderr: "Error: error connecting to SSH server: ssh: handshake failed\n" }, [noEmail]),
    );
    expect(message(result.outcome)).toMatch(/^storage-setup: flyctl couldn't run it on the Machine: exit code 1: /);
    expect(result.calls.at(-1)).toBe(`${REMOVE} ${noEmail}`);
    expect(result.said).toEqual([MAKING, REMOVED]);
  });

  it("leaves a new peer not named for this runner, but fails the run, saying so without its name, whatever the session did", async () => {
    const other = `interactive-other-host-${PEER_EMAIL}-${ulidAt(MADE)}`;
    for (const session of [
      { stdout: "done\n" },
      { code: 1, stderr: "Error: create ssh certificate: no CA (try `flyctl ssh issue`)\n" },
      { code: null, timedOut: true },
    ]) {
      // Only strangers are new: this run's peer may be among them, under a name not foreseen.
      const alone = await run(routes(session, [LAPTOP, other]));
      expect(
        alone.calls.filter((call) => call.startsWith(REMOVE)),
        JSON.stringify(session),
      ).toEqual([]);
      if (session.code === undefined) expect(message(alone.outcome)).toBe(strangers(2));
      else expect(alone.said.at(-1), JSON.stringify(session)).toBe(strangers(2));
      expect([...alone.said, message(alone.outcome)].join("\n")).not.toContain(PEER_EMAIL);
    }
    // Beside this run's own peer: that one is removed, and the stranger still fails the run.
    const beside = await run(routes({ stdout: "done\n" }, [OURS, LAPTOP]));
    expect(beside.calls.at(-1)).toBe(`${REMOVE} ${OURS}`);
    expect(beside.said).toEqual([MAKING, "machine: done", REMOVED]);
    expect(message(beside.outcome)).toBe(strangers(1, true));
  });

  it("never says a peer's name, which holds the token's email, nor what flyctl printed about it", async () => {
    const naming = { stdout: `Removing WireGuard peer "${OURS}"\n`, stderr: `Error: couldn't remove ${OURS}\n` };
    for (const removal of [{}, { code: 1, ...naming }, { code: null, timedOut: true, ...naming }]) {
      const list: Route[] = [
        [LIST, machines],
        [SSH, { stdout: "done\n" }],
        [ORGS, orgs],
        [PEERS, peersOf(peerList([]), peerList([OURS, LAPTOP]))],
        [REMOVE, removal],
      ];
      const result = await run(list);
      const all = [...result.said, message(result.outcome)].join("\n");
      expect(all, JSON.stringify(removal)).not.toContain(PEER_EMAIL);
      expect(all, JSON.stringify(removal)).not.toContain(ulidAt(MADE));
    }
  });

  it("fails a session that worked when a peer of this run's is still there, with the way to remove it by hand", async () => {
    for (const [removal, said] of [
      [
        { code: 1, stderr: "Error: not allowed\n" },
        "flyctl's removal of a WireGuard peer this run made ended with exit code 1",
      ],
      [{ code: null, timedOut: true }, "flyctl's removal of a WireGuard peer this run made ran out of time"],
    ] as const) {
      const result = await run([
        [LIST, machines],
        [SSH, { stdout: "done\n" }],
        [ORGS, orgs],
        [PEERS, peersOf(peerList([]), peerList([OURS]))],
        [REMOVE, removal],
      ]);
      expect(result.said, said).toEqual([MAKING, "machine: done", `storage-setup: ${said}`]);
      expect(message(result.outcome)).toBe(
        `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
      );
      // The list after the removal still shows it, so it is counted as left.
      expect(result.calls.slice(-2)).toEqual([`${REMOVE} ${OURS}`, PEERS]);
    }
  });

  it("says a new peer not named for this runner too when one of this run's is still there, and fails with the one left", async () => {
    const result = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS, LAPTOP]))],
      [REMOVE, { code: 1 }],
    ]);
    expect(result.said).toEqual([
      MAKING,
      "machine: done",
      "storage-setup: flyctl's removal of a WireGuard peer this run made ended with exit code 1",
      strangers(1, true),
    ]);
    expect(message(result.outcome)).toBe(
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    );
  });

  it("goes on with the clean-up when a removal's flyctl can't be started, and counts its peer as left", async () => {
    // No route for the removal: the fake's spawn fails, as starting a flyctl that isn't there would.
    const result = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS]))],
    ]);
    expect(result.said).toEqual([
      MAKING,
      "machine: done",
      "storage-setup: flyctl's removal of a WireGuard peer this run made couldn't be started",
    ]);
    expect(message(result.outcome)).toBe(
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    );
    expect([...result.said, message(result.outcome)].join("\n")).not.toContain(PEER_EMAIL);
  });

  it("counts a peer as removed when flyctl failed after removing it, and as left when no list can tell", async () => {
    // flyctl 0.5.8 exits 1 when its clean-up of local state fails after the removal: a new list shows the peer gone.
    const gone = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS]), peerList([]))],
      [REMOVE, { code: 1, stdout: "Removed peer.\n", stderr: "Error: error saving config file\n" }],
    ]);
    expect(gone.outcome).toBeUndefined();
    expect(gone.said).toEqual([
      MAKING,
      "machine: done",
      "storage-setup: flyctl's removal of a WireGuard peer this run made ended with exit code 1",
      REMOVED,
    ]);
    const unknown = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS]), { code: 1, stderr: "Error: unauthorized\n" })],
      [REMOVE, { code: 1 }],
    ]);
    expect(message(unknown.outcome)).toBe(
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    );
  });

  it("fails when the session reached the Machine and no new peer of this run's is found, since one must have been made", async () => {
    for (const [before, after] of [
      [[], []],
      // Named for this runner, but there before the session: not this session's to remove.
      [[OURS], [OURS]],
    ] as const) {
      const result = await run(routes({ stdout: "done\n" }, after, before));
      expect(message(result.outcome)).toBe(NONE_FOUND);
      expect(result.calls).toEqual([LIST, ORGS, PEERS, SSH, PEERS]);
    }
    // A command that failed there, with a status or without one, reached it too: the peer is said, then the failure.
    for (const [session, failure] of [
      [{ code: 1, stderr: exited(3) }, "storage-setup: it failed on the Machine, with exit code 3"],
      [
        { code: 1, stderr: "Error: ssh shell: wait: remote command exited without exit status or exit signal\n" },
        "storage-setup: the session ended without saying how the command ended: the Machine closed it, or the connection to it was lost",
      ],
    ] as const) {
      const result = await run(routes(session, []));
      expect(result.said, failure).toEqual([MAKING, NONE_FOUND]);
      expect(message(result.outcome)).toBe(failure);
    }
  });

  it("says no peer of this run's is listed after a session that failed short of the Machine, and what to look at by hand", async () => {
    for (const session of [
      { code: 1, stderr: "Error: tunnel unavailable: context deadline exceeded\n" },
      { code: 1, stderr: "Error: error connecting to SSH server: ssh: handshake failed\n" },
      { code: null, timedOut: true },
    ]) {
      const result = await run(routes(session, []));
      expect(result.said, JSON.stringify(session)).toEqual([MAKING, NONE_LISTED]);
      expect(message(result.outcome), JSON.stringify(session)).not.toBe(NONE_LISTED);
    }
  });

  it("counts as left only a peer whose removal failed and a new list still shows, not one flyctl said it removed", async () => {
    const second = sessionPeer(HOST, MADE + 1_000, "another-example-invalid");
    const result = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      // Both still listed after the removals: flyctl's exit 0 for the first is taken as its removal.
      [PEERS, peersOf(peerList([]), peerList([OURS, second]))],
      [REMOVE, (call) => (call.args.at(-1) === OURS ? {} : { code: 1 })],
    ]);
    expect(result.calls.slice(5)).toEqual([`${REMOVE} ${OURS}`, `${REMOVE} ${second}`, PEERS]);
    expect(message(result.outcome)).toBe(
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    );
  });

  it("fails when the peers can't be listed after the session, or their list read, and says how to look by hand", async () => {
    for (const [reply, reason] of [
      [{ code: 1, stderr: "Error: unauthorized\n" }, "exit code 1: Error: unauthorized"],
      // A failed call is a failure, whatever its standard output holds.
      [{ code: 1, stdout: "[]" }, "exit code 1: []"],
      [{ stdout: "not json" }, "its answer isn't a list it can read"],
      [json({}), "its answer isn't a list it can read"],
      [json([{ name: "x" }]), "its answer isn't a list it can read"],
    ] as const) {
      const result = await run([
        [LIST, machines],
        [SSH, { stdout: "done\n" }],
        [ORGS, orgs],
        [PEERS, peersOf(peerList([]), reply)],
      ]);
      expect(message(result.outcome), JSON.stringify(reply)).toBe(
        `storage-setup: flyctl couldn't list the organization's WireGuard peers (${reason}), so the one this run may have made can't be removed: ${BY_HAND}`,
      );
      expect(result.calls.filter((call) => call.startsWith(REMOVE))).toEqual([]);
    }
  });

  it("starts no session when the peers can't be listed first, since its peer couldn't be told from them", async () => {
    for (const [reply, reason] of [
      [{ code: 1, stderr: "Error: unauthorized\n" }, "exit code 1: Error: unauthorized"],
      [{ code: 1, stdout: "[]" }, "exit code 1: []"],
      [{ stdout: "not json" }, "its answer isn't a list it can read"],
      [json([{ name: "x" }]), "its answer isn't a list it can read"],
    ] as const) {
      const result = await run([
        [LIST, machines],
        [SSH, { stdout: "done\n" }],
        [ORGS, orgs],
        [PEERS, reply],
      ]);
      expect(message(result.outcome), JSON.stringify(reply)).toBe(
        `storage-setup: flyctl couldn't list the organization's WireGuard peers (${reason}), so no SSH session is started: the peer one makes couldn't be told from the others and removed`,
      );
      expect(result.calls, JSON.stringify(reply)).toEqual([LIST, ORGS, PEERS]);
      expect(result.said).toEqual([]);
    }
    // A listing that couldn't be started says so, not as an exit code of flyctl's.
    const unmade = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
    ]);
    expect(message(unmade.outcome)).toBe(
      `storage-setup: flyctl couldn't list the organization's WireGuard peers (the call wasn't made: the fake has no route for: ${PEERS}), so no SSH session is started: the peer one makes couldn't be told from the others and removed`,
    );
  });

  it("starts no session when the token's organization can't be told, naming the ones it sees, with no advice the runner can't take", async () => {
    const several = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, json({ a: "A", b: "B" })],
    ]);
    expect(message(several.outcome)).toBe(
      "storage-setup: the token sees 2 organizations, a and b, so no SSH session is started: the WireGuard peer one makes couldn't be removed",
    );
    expect(several.calls).toEqual([LIST, ORGS]);
    const refused = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, { code: 1, stderr: "Error: unauthorized\n" }],
    ]);
    expect(message(refused.outcome)).toMatch(
      /^storage-setup: flyctl couldn't list the organizations: exit code 1: Error: unauthorized, so no SSH session is started/,
    );
    expect(refused.calls).toEqual([LIST, ORGS]);
  });

  it("throws the command's failure, not the peer's, when both went wrong, and says the peer's first", async () => {
    const result = await run([
      [LIST, machines],
      [SSH, { code: 1, stderr: exited(4) }],
      [ORGS, orgs],
      [PEERS, peersOf(peerList([]), peerList([OURS]))],
      [REMOVE, { code: 1 }],
    ]);
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 4");
    expect(result.said).toEqual([
      MAKING,
      "storage-setup: flyctl's removal of a WireGuard peer this run made ended with exit code 1",
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    ]);
  });
});

describe("the peer's name, as flyctl makes it", () => {
  it("puts the host in it as flyctl does: the first label, with any other character a hyphen", () => {
    expect(hostSlug("fv-az123-456.internal.cloudapp.net")).toBe("fv-az123-456");
    expect(hostSlug("runner_vm 1")).toBe("runner-vm-1");
    expect(hostSlug("")).toBe("");
  });

  it("takes a name as one this host's session makes when it starts interactive-<host>-, and no other", () => {
    // The ULID specification's own example: `ulid(1469918176385)` is 01ARYZ6S41TSV4RRFFQ69G5FAV.
    expect(sessionPeerOf(`interactive-${HOST}-${PEER_EMAIL}-01ARYZ6S41TSV4RRFFQ69G5FAV`, HOST)).toBe(true);
    expect(sessionPeerOf(OURS, HOST)).toBe(true);
    expect(sessionPeerOf(`interactive-${HOST}--${ulidAt(MADE)}`, HOST)).toBe(true);
    expect(sessionPeerOf(sessionPeer("fv-az1", MADE), "fv-az1.internal.cloudapp.net")).toBe(true);
    expect(sessionPeerOf(LAPTOP, HOST)).toBe(false);
    expect(sessionPeerOf(sessionPeer(`${HOST}x`, MADE), HOST)).toBe(false);
    expect(sessionPeerOf(`static-${HOST}-${PEER_EMAIL}-${ulidAt(MADE)}`, HOST)).toBe(false);
    expect(sessionPeerOf(`interactive-${HOST}`, HOST)).toBe(false);
    // A host with no name names no peer.
    expect(sessionPeerOf(`interactive--${PEER_EMAIL}-${ulidAt(MADE)}`, "")).toBe(false);
  });
});
