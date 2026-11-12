// `onMachine` against a made-up `flyctl` (test/fake-fly.ts): a command run inside the API's Machine,
// where the Supabase service key is (docs/plans/api-b0-deploy.md, section 6; T56; ADR-034). It goes
// over `flyctl ssh console`, which exits 0 when the command did and 1 otherwise, with flyctl's own
// last line saying the command's exit status (flyctl 0.5.8 and golang.org/x/crypto's source); and
// whatever the command did, the WireGuard peer the session made is removed, and no other.

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
import {
  COMMAND_SECONDS,
  SESSION_MS,
  TUNNEL_SECONDS,
  hostSlug,
  onMachine,
  peerOfThisRun,
  ulidTime,
} from "./on-machine.ts";
import { OpsError } from "./ops-error.ts";

const LIST = "flyctl machine list -a tadayo-api-dev --json";
const COMMAND = ["node", "/app/tools/ops/src/main.ts", "storage-setup", "--here", "--ref", "abcdefghijklmnopqrst"];
const SSH = `flyctl ssh console -a tadayo-api-dev --machine a1 -q -C ${COMMAND.join(" ")}`;
const ORGS = "flyctl orgs list --json";
const PEERS = "flyctl wireguard list tadayo-org --json";
const REMOVE = "flyctl wireguard remove tadayo-org";
const ENV = { FLY_API_TOKEN: FAKE_FLY_TOKEN, HOME: "/home/runner" };

const HOST = "runnervm0abc1";
/** When the session starts and ends, by the runner's clock. */
const SINCE = 1_794_460_000_000;
const UNTIL = SINCE + 40_000;
const OURS = sessionPeer(HOST, SINCE + 3_000);

const machines = json([machine("w1", "worker", "started"), machine("a1", "api", "started")]);
const orgs = json({ "tadayo-org": "Tadayo" });

/** flyctl's own last line for a command that failed on the Machine (`ssh shell: ` and x/crypto's `Waitmsg`). */
const exited = (status: number, extra = "") =>
  `Error: ssh shell: Process exited with status ${String(status)}${extra}\n`;

/** The routes of a run whose session answers `session`, with the organization's peers `peers`. */
const routes = (session: Reply, peers: readonly string[] = [OURS]): Route[] => [
  [LIST, machines],
  [SSH, session],
  [ORGS, orgs],
  [PEERS, peerList(peers)],
  [REMOVE, { stdout: 'Removing WireGuard peer "…" for organization tadayo-org\nRemoved peer.\n' }],
];

async function run(list: readonly Route[], command: readonly string[] = COMMAND) {
  const { spawn, calls } = fakeSpawn(list);
  const said: string[] = [];
  const clock = [SINCE, UNTIL];
  const outcome = await onMachine({
    fly: flyOf(spawn, ENV),
    label: "storage-setup",
    command,
    say: (line) => said.push(`machine: ${line}`),
    note: (line) => said.push(line),
    host: HOST,
    now: () => clock.shift() ?? UNTIL,
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  return { calls: calls.map(lineOf), raw: calls, said, outcome };
}

const message = (outcome: unknown) =>
  outcome instanceof OpsError ? outcome.message : `not an OpsError: ${String(outcome)}`;
const REMOVED = "storage-setup: removed the WireGuard peer this run made";
const BY_HAND =
  "`flyctl wireguard list tadayo-org` lists the organization's peers, and `flyctl wireguard remove tadayo-org <name>` removes one; this run's names start with interactive-runnervm0abc1-";

describe("onMachine: the command, over SSH", () => {
  it("runs the command in the API's started Machine, as one string, says what it printed, then removes the run's peer", async () => {
    const result = await run(routes({ stdout: "first\nsecond\n", stderr: "a warning\n" }));
    expect(result.outcome).toBeUndefined();
    expect(result.calls).toEqual([LIST, SSH, ORGS, PEERS, `${REMOVE} ${OURS}`]);
    expect(result.raw[1]?.args).toEqual([
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
    expect(result.said).toEqual(["machine: first", "machine: second", "machine: a warning", REMOVED]);
  });

  it("gives the session the tunnel's wait, the connection and the command's time, and flyctl the token and HOME only", async () => {
    const result = await run(routes({}));
    expect(SESSION_MS).toBe((TUNNEL_SECONDS + 60 + COMMAND_SECONDS) * 1000);
    expect(SESSION_MS).toBe(600_000);
    expect(result.raw[1]?.options.timeoutMs).toBe(600_000);
    for (const call of result.raw) expect(call.options.env).toEqual(ENV);
    // The listing and the removal are quick calls.
    expect(result.raw.slice(2).map((call) => call.options.timeoutMs)).toEqual([120_000, 120_000, 120_000]);
  });

  it("fails with the command's exit code, after saying what it printed, when the command failed, and still removes the peer", async () => {
    const result = await run(
      routes({ code: 1, stdout: "half of it\n", stderr: `set SUPABASE_SERVICE_KEY\n${exited(1)}` }),
    );
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 1");
    // flyctl's own line isn't said as the Machine's: the failure says it in its words.
    expect(result.said).toEqual(["machine: half of it", "machine: set SUPABASE_SERVICE_KEY", REMOVED]);
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
      expect(result.said, line).toEqual([REMOVED]);
    }
  });

  it("reads flyctl's line in colour, as a terminal would show it, the same way", async () => {
    const result = await run(
      routes({ code: 1, stderr: "\u001b[31mError: \u001b[0mssh shell: Process exited with status 3\n" }),
    );
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 3");
    expect(result.said).toEqual([REMOVED]);
  });

  it("fails when the Machine ended the session without an exit status", async () => {
    const result = await run(
      routes({ code: 1, stderr: "Error: ssh shell: wait: remote command exited without exit status or exit signal\n" }),
    );
    expect(message(result.outcome)).toBe(
      "storage-setup: the Machine ended the session without saying how the command ended",
    );
    expect(result.said).toEqual([REMOVED]);
  });

  it("says flyctl's own failure in its words, and doesn't look for a peer it needn't have made", async () => {
    const result = await run(routes({ code: 1, stderr: "Error: tunnel unavailable: context deadline exceeded\n" }, []));
    expect(message(result.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: tunnel unavailable: context deadline exceeded",
    );
    // Nothing reached the Machine, so finding no peer of this run's is no news.
    expect(result.said).toEqual([]);
    expect(result.calls).toEqual([LIST, SSH, ORGS, PEERS]);
  });

  it("removes a peer the agent made before its tunnel failed", async () => {
    const result = await run(routes({ code: 1, stderr: "Error: tunnel unavailable: no handshake\n" }));
    expect(message(result.outcome)).toMatch(/^storage-setup: flyctl couldn't run it on the Machine: exit code 1: /);
    expect(result.said).toEqual([REMOVED]);
  });

  it("reads any other exit code as flyctl's failure, never as the command's, even with a status line last", async () => {
    for (const reply of [
      { code: 126, stderr: "Error: context deadline exceeded\n" },
      { code: 127, stderr: exited(1) },
      { code: 2, stderr: exited(0) },
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
    const result = await run(routes({ code: null, timedOut: true, stdout: "supabase-probe: run 1\n" }));
    expect(message(result.outcome)).toBe(
      "storage-setup: the session ran out of time after 600 seconds, and the command may still be running on the Machine",
    );
    expect(result.said).toEqual(["machine: supabase-probe: run 1", REMOVED]);
  });

  it("passes a session that exited 0 having printed nothing, which only the script's own last line can judge (run.ts)", async () => {
    const result = await run(routes({}));
    expect(result.outcome).toBeUndefined();
    expect(result.said).toEqual([REMOVED]);
  });

  it("gives a line the Machine printed that looks like flyctl's no weight: only flyctl's exit code and last line count", async () => {
    const passed = await run(routes({ stderr: exited(1) }));
    expect(passed.outcome).toBeUndefined();
    expect(passed.said).toEqual(["machine: Error: ssh shell: Process exited with status 1", REMOVED]);
    // Exit 1 with the Machine's imitation earlier and flyctl's real failure last: flyctl's failure.
    const failed = await run(routes({ code: 1, stderr: `${exited(0)}Error: connection lost\n` }));
    expect(message(failed.outcome)).toBe(
      "storage-setup: flyctl couldn't run it on the Machine: exit code 1: Error: connection lost",
    );
    expect(failed.said).toEqual(["machine: Error: ssh shell: Process exited with status 0", REMOVED]);
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
  it("removes only the peers this runner's host made during the session", async () => {
    const others = [
      sessionPeer("founders-laptop", SINCE + 3_000), // another host, at the same time
      sessionPeer(HOST, SINCE - 3_600_000), // this host's name, an hour before
      sessionPeer(HOST, UNTIL + 60_000), // this host's name, a minute after
      sessionPeer(`${HOST}x`, SINCE + 3_000), // a host whose name starts like this one's
      `static-${HOST}-${PEER_EMAIL}-${ulidAt(SINCE + 3_000)}`, // a peer made by hand
      `interactive-${HOST}-${PEER_EMAIL}-not-a-ulid`,
      `interactive-${HOST}-${ulidAt(SINCE + 3_000)}`, // no email part
    ];
    const second = sessionPeer(HOST, UNTIL - 1_000, "another-example-invalid");
    const result = await run(routes({}, [...others.slice(0, 3), OURS, ...others.slice(3), second]));
    expect(result.outcome).toBeUndefined();
    expect(result.calls.slice(4)).toEqual([`${REMOVE} ${OURS}`, `${REMOVE} ${second}`]);
    expect(result.said).toEqual([REMOVED]);
  });

  it("never says a peer's name, which holds the token's email, nor what flyctl printed about it", async () => {
    const failing: Route[] = [
      [LIST, machines],
      [SSH, {}],
      [ORGS, orgs],
      [PEERS, peerList([OURS])],
      [REMOVE, { code: 1, stdout: `Removing WireGuard peer "${OURS}"\n`, stderr: `Error: couldn't remove ${OURS}\n` }],
    ];
    for (const list of [routes({ stdout: "done\n" }), failing]) {
      const result = await run(list);
      const all = [...result.said, message(result.outcome)].join("\n");
      expect(all).not.toContain(PEER_EMAIL);
      expect(all).not.toContain(ulidAt(SINCE + 3_000));
    }
  });

  it("fails a session that worked when a peer of this run's is still there, with the way to remove it by hand", async () => {
    const result = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, orgs],
      [PEERS, peerList([OURS])],
      [REMOVE, { code: 1, stderr: "Error: not allowed\n" }],
    ]);
    expect(result.said).toEqual([
      "machine: done",
      "storage-setup: flyctl couldn't remove a WireGuard peer this run made (exit code 1)",
    ]);
    expect(message(result.outcome)).toBe(
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    );
  });

  it("fails when the session reached the Machine and no peer of this run's is found, since one must have been made", async () => {
    const result = await run(routes({ stdout: "done\n" }, [sessionPeer("founders-laptop", SINCE)]));
    expect(message(result.outcome)).toBe(
      `storage-setup: none of the organization's WireGuard peers is one this run made, though its session reached the Machine, so it can't say it removed it: ${BY_HAND}`,
    );
    expect(result.calls).toEqual([LIST, SSH, ORGS, PEERS]);
  });

  it("fails when the peers can't be listed, or their list read, and says how to look by hand", async () => {
    for (const reply of [
      { code: 1, stderr: "Error: unauthorized\n" },
      { stdout: "not json" },
      json({}),
      json([{ name: "x" }]),
    ]) {
      const result = await run([
        [LIST, machines],
        [SSH, { stdout: "done\n" }],
        [ORGS, orgs],
        [PEERS, reply],
      ]);
      expect(message(result.outcome), JSON.stringify(reply)).toMatch(
        /^storage-setup: flyctl couldn't list the organization's WireGuard peers \((exit code 1: Error: unauthorized|its answer isn't a list it can read)\), so the one this run may have made can't be removed: /,
      );
      expect(message(result.outcome)).toContain(BY_HAND);
    }
  });

  it("fails when the token's organization can't be told, naming the ones it sees, with no advice the runner can't take", async () => {
    const several = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, json({ a: "A", b: "B" })],
    ]);
    expect(message(several.outcome)).toBe(
      "storage-setup: the token sees 2 organizations, a and b, so the WireGuard peer this run may have made can't be removed: `flyctl wireguard list <org>` lists the organization's peers, and `flyctl wireguard remove <org> <name>` removes one; this run's names start with interactive-runnervm0abc1-",
    );
    const refused = await run([
      [LIST, machines],
      [SSH, { stdout: "done\n" }],
      [ORGS, { code: 1, stderr: "Error: unauthorized\n" }],
    ]);
    expect(message(refused.outcome)).toMatch(
      /^storage-setup: flyctl couldn't list the organizations: exit code 1: Error: unauthorized, so the WireGuard peer/,
    );
  });

  it("throws the command's failure, not the peer's, when both went wrong, and says the peer's first", async () => {
    const result = await run([
      [LIST, machines],
      [SSH, { code: 1, stderr: exited(4) }],
      [ORGS, orgs],
      [PEERS, peerList([OURS])],
      [REMOVE, { code: 1 }],
    ]);
    expect(message(result.outcome)).toBe("storage-setup: it failed on the Machine, with exit code 4");
    expect(result.said).toEqual([
      "storage-setup: flyctl couldn't remove a WireGuard peer this run made (exit code 1)",
      `storage-setup: 1 of the WireGuard peers this run made is still there: ${BY_HAND}`,
    ]);
  });
});

describe("the peer's name, as flyctl makes it", () => {
  it("reads a ULID's time from its first ten characters, and nothing from what isn't one", () => {
    // The ULID specification's own example: `ulid(1469918176385)` is 01ARYZ6S41TSV4RRFFQ69G5FAV.
    expect(ulidTime("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(1_469_918_176_385);
    expect(ulidTime(ulidAt(SINCE))).toBe(SINCE);
    for (const text of [
      "",
      "01ARZ3NDEKTSV4RRFFQ69G5FA",
      "01ARZ3NDEKTSV4RRFFQ69G5FAVX",
      "01arz3ndektsv4rrffq69g5fav",
      "8ZZZZZZZZZZZZZZZZZZZZZZZZZ",
      "01ARZ3NDEKTSV4RRFFQ69G5FAU",
    ]) {
      expect(ulidTime(text), text).toBeUndefined();
    }
  });

  it("puts the host in it as flyctl does: the first label, with any other character a hyphen", () => {
    expect(hostSlug("fv-az123-456.internal.cloudapp.net")).toBe("fv-az123-456");
    expect(hostSlug("runner_vm 1")).toBe("runner-vm-1");
    expect(hostSlug("")).toBe("");
  });

  it("takes a peer as this run's only when it names this host and was made in the session, give or take two seconds", () => {
    expect(peerOfThisRun(sessionPeer(HOST, SINCE - 2_000), HOST, SINCE, UNTIL)).toBe(true);
    expect(peerOfThisRun(sessionPeer(HOST, UNTIL + 2_000), HOST, SINCE, UNTIL)).toBe(true);
    expect(peerOfThisRun(sessionPeer(HOST, SINCE - 2_001), HOST, SINCE, UNTIL)).toBe(false);
    expect(peerOfThisRun(sessionPeer(HOST, UNTIL + 2_001), HOST, SINCE, UNTIL)).toBe(false);
    expect(peerOfThisRun(sessionPeer("fv-az1", SINCE), "fv-az1.internal.cloudapp.net", SINCE, UNTIL)).toBe(true);
    // A host with no name names no peer.
    expect(peerOfThisRun(`interactive--${PEER_EMAIL}-${ulidAt(SINCE)}`, "", SINCE, UNTIL)).toBe(false);
  });
});
