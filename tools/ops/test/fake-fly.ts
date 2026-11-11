// A made-up `flyctl` and `git`, as a `Spawn`: each call is recorded, and answered by the first route
// whose text its command line starts with (docs/plans/api-b0-deploy.md, section 6). flyctl can't be
// installed in a cloud session, so what the scripts say to it is checked here, argument by argument,
// and what it answers is as the vendor's documentation and source describe it (read on 11 November
// 2026); the first real run, after slice 10b, checks the rest. Test support, outside `src`, so the
// image doesn't carry it.

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
