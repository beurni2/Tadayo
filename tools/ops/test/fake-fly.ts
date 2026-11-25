// A made-up `flyctl` and `git`, as a `Spawn`: each call is recorded, and answered by the first route
// whose text its command line starts with (docs/plans/api-b0-deploy.md, section 6). No flyctl has been
// run in a cloud session (a session refuses to run a downloaded binary), so what the scripts say to it
// is checked here, argument by argument, and what it answers is as flyctl 0.5.8's source describes
// it (read on 11 November 2026, with fly-go v0.11.8's types: a field that is zero or empty is left
// out of what it prints); the first real run, after slice 10b, checks the rest. Test support,
// outside `src`, so the image doesn't carry it.

import type { Spawn, SpawnOptions, Spawned } from "../src/spawn.ts";

/** A made-up Fly token, built from pieces so no secret scanner reads one whole. */
export const FAKE_FLY_TOKEN = ["fm2", "_", "F".repeat(40)].join("");

export interface RecordedCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
}

export type Reply = Partial<Spawned>;
export type Route = readonly [
  /** The start of the command line (`flyctl machine list`), or a pattern for all of it. */
  match: string | RegExp,
  /** What it answers; a function gets the call and how many calls this route has already had. */
  reply: Reply | ((call: RecordedCall, earlier: number) => Reply),
];

/** The command line of a call, as the routes see it. */
export const lineOf = (call: RecordedCall) => [call.command, ...call.args].join(" ");

export function fakeSpawn(routes: readonly Route[]): { spawn: Spawn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const taken = new Map<number, number>();
  const spawn: Spawn = (command, args, options = {}) => {
    const call = { command, args, options };
    calls.push(call);
    const line = lineOf(call);
    const index = routes.findIndex(([match]) =>
      typeof match === "string" ? line.startsWith(match) : match.test(line),
    );
    const route = routes[index];
    if (route === undefined) return Promise.reject(new Error(`the fake has no route for: ${line}`));
    const earlier = taken.get(index) ?? 0;
    taken.set(index, earlier + 1);
    const reply = typeof route[1] === "function" ? route[1](call, earlier) : route[1];
    return Promise.resolve({ code: 0, timedOut: false, stdout: "", stderr: "", ...reply });
  };
  return { spawn, calls };
}

/** One Machine as `flyctl machine list --json` has it (the Machines API's own fields). */
export function machine(id: string, group: string, state: string, tag = "deployment-1") {
  return {
    id,
    name: `${group}-${id}`,
    state,
    region: "iad",
    image_ref: { registry: "registry.fly.io", repository: "tadayo-api-dev", tag, digest: "sha256:0" },
    config: {
      image: `registry.fly.io/tadayo-api-dev:${tag}`,
      metadata: { fly_process_group: group, fly_platform_version: "v2" },
    },
  };
}

export const json = (value: unknown): Reply => ({ stdout: JSON.stringify(value) });

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID made at `ms`: its first ten characters are the time, in Crockford's base 32; the rest is fixed here. */
export function ulidAt(ms: number, rest = "0123456789ABCDEFGH"): string {
  let time = "";
  let left = ms;
  for (let index = 0; index < 10; index += 1) {
    time = `${CROCKFORD[left % 32] ?? ""}${time}`;
    left = Math.floor(left / 32);
  }
  return `${time}${rest.slice(0, 16)}`;
}

/** A made-up token's email, as flyctl puts it in a peer's name: no real person's. */
export const PEER_EMAIL = "someone-example-invalid";

/** The name flyctl 0.5.8's agent gives the peer it makes for a session: `interactive-<host>-<email>-<ULID>`. */
export const sessionPeer = (host: string, ms: number, email = PEER_EMAIL) =>
  `interactive-${host}-${email}-${ulidAt(ms)}`;

/** What `flyctl wireguard list <org> --json` prints: fly-go's `WireGuardPeer`, whose fields carry no JSON names of their own. */
export const peerList = (names: readonly string[]): Reply =>
  json(
    names.map((name, index) => ({
      ID: `peer${String(index)}`,
      Pubkey: "cHVibGljLWtleS1vZi1hLXBlZXItbm90LWEtc2VjcmV0PQ==",
      Region: "iad",
      Name: name,
      Peerip: `fdaa:0:1:a7b::${String(index + 2)}`,
      GatewayStatus: null,
    })),
  );

/** A Machine's id as Fly writes one, 14 hexadecimal digits: the worker's on `dev`, as `deploy-dev`'s run printed it. */
export const WORKER_ID = "84ed273f616468";

/** One event of `flyctl machine status`'s "Event Logs" table: an exit carries its code (flyctl 0.5.8's status.go). */
export const eventRow = (state: string, kind: string, at: string, exit?: { code: number; requested?: boolean }) =>
  [
    state,
    kind,
    "flyd",
    at,
    exit === undefined
      ? ""
      : `exit_code=${String(exit.code)},oom_killed=false,requested_stop=${String(exit.requested ?? false)}`,
  ].join(" │ ");

/**
 * What `flyctl machine status <id>` prints, its tables as tablewriter lays them out with no borders: the VM table
 * (with a time of its own, which isn't an event), then the "Event Logs" table, its title in bold.
 */
export const machineStatus = (id: string, rows: readonly string[]): Reply => ({
  stdout: [
    `Machine ID: ${id}`,
    "State: started",
    "",
    "\x1b[1mVM\x1b[0m",
    `  ID      = ${id}`,
    "  Created = 2026-11-12T03:00:00Z",
    "",
    "\x1b[1mEvent Logs\x1b[0m",
    "STATE │ EVENT │ SOURCE │ TIMESTAMP │ INFO",
    ...rows,
    "",
  ].join("\n"),
});

/** What `flyctl logs --no-tail --json` prints: each entry by `json.Encoder` with four spaces (render.go). */
export const logEntries = (messages: readonly string[], id = WORKER_ID): Reply => ({
  stdout: messages
    .map((message, index) =>
      JSON.stringify(
        {
          level: "info",
          instance: id,
          message,
          region: "iad",
          timestamp: `2026-11-25T02:${String(50 + Math.floor(index / 60))}:${String(index % 60).padStart(2, "0")}.000Z`,
          meta: { instance: id, region: "iad", event: { provider: "app" } },
        },
        null,
        4,
      ),
    )
    .map((text) => `${text}\n`)
    .join(""),
});
