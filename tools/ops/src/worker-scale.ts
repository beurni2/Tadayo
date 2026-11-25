// `worker-scale`: stops or starts the `worker` group of `tadayo-api-dev` (docs/plans/B0.md, slice
// 10a; docs/plans/api-b0-deploy.md, section 6). It is how a spike pauses the worker while it changes
// what the worker would read, and how it lets it run again.
//
// It stops the Machine and doesn't scale the group to zero: scaling down destroys Machines, and the
// next deploy would make new ones, while a Machine stopped by hand stays stopped across deploys
// (Fly's `fly deploy` launches only Machines that are started, starting or failed). It touches the
// worker's Machine and never the API's, and only when the app has exactly one: `dev` has one of each,
// and a second one (Fly's standby) would start along with it. Then it reads the state back, a few
// seconds at a time, instead of taking `flyctl`'s word that it has changed.
//
// A start is watched for WATCH_POLLS × WATCH_MS more, three times as long as `flyctl deploy`'s smoke check,
// since a worker that stops itself as it starts shows as started first, and Fly restarts it on a failure
// (fly.toml's `[[restart]]`), so it may show as started again by the next look. So the start is judged by
// the Machine's events as well: an exit that wasn't asked for, among the events that weren't there before
// the start, is a failed start. Either way it prints those events and the Machine's last lines in Fly's
// log (fly.ts `machineReport`), which no other step shows: on PR #118's merge the worker stopped itself as
// it started, `deploy-dev`'s smoke check said only that the app appeared to be crashing, and flyctl
// printed none of its lines (`docs/LIMITATIONS.md`, 2026-11-25).

import { DEV_APP } from "./environment.ts";
import { exitOf, machineEvents, machineLog, machineReport, machines, reportOf, type Fly, why } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

export interface WorkerScaleInput {
  readonly fly: Fly;
  readonly to: "stopped" | "started";
  readonly say: (line: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

const POLLS = 10;
const POLL_MS = 3000;
/** How long a start is watched once the Machine shows as started: 30 seconds. */
const WATCH_POLLS = 6;
const WATCH_MS = 5000;
const LABEL = "worker-scale";

const STOPPED = ["stopped", "suspended"];
const STOPPING = ["stopping", "suspending"];
const MAY_BE_STOPPED = ["started", "starting"];
const MAY_BE_STARTED = ["stopped", "suspended", "created"];

export async function workerScale(input: WorkerScaleInput): Promise<void> {
  const { fly, say } = input;
  const stopping = input.to === "stopped";
  const verb = stopping ? "stop" : "start";
  const done = (state: string) => (stopping ? STOPPED.includes(state) : state === "started");

  const workers = (await machines(fly)).filter((machine) => machine.group === "worker");
  const [worker, ...others] = workers;
  if (worker === undefined) throw new OpsError("worker-scale: the app has no worker Machine; deploy first");
  if (others.length > 0) {
    throw new OpsError(
      `worker-scale: the app has ${String(workers.length)} worker Machines, and dev has one: nothing was changed`,
    );
  }
  if (done(worker.state)) {
    say(`worker-scale: the worker Machine is already ${input.to}`);
    return;
  }
  const waiting = stopping ? STOPPING : ["starting"];
  const moves = (stopping ? MAY_BE_STOPPED : MAY_BE_STARTED).includes(worker.state);
  if (!moves && !waiting.includes(worker.state)) {
    throw new OpsError(`worker-scale: the worker Machine is ${worker.state}: nothing was changed`);
  }
  // The events before the start, so that the watch below knows which are the start's own.
  const before = stopping ? undefined : new Set((await machineEvents(fly, worker.id)) ?? []);
  if (moves) {
    say(`worker-scale: ${verb === "stop" ? "stopping" : "starting"} the worker Machine`);
    const command = stopping
      ? ["machine", "stop", worker.id, "-a", DEV_APP, "-s", "SIGTERM"]
      : ["machine", "start", worker.id, "-a", DEV_APP];
    const result = await fly.run(command);
    if (result.code !== 0)
      throw new OpsError(`worker-scale: flyctl couldn't ${verb} the worker Machine: ${why(result)}`);
  }

  let state = worker.state;
  for (let poll = 0; poll < POLLS; poll += 1) {
    const now = (await machines(fly)).find((machine) => machine.id === worker.id);
    if (now === undefined) throw new OpsError("worker-scale: the worker Machine is gone");
    state = now.state;
    if (done(state)) {
      if (stopping) {
        say(`worker-scale: the worker Machine is ${input.to}`);
        return;
      }
      await watchStart(input, worker.id, before ?? new Set());
      return;
    }
    await input.sleep(POLL_MS);
  }
  if (!stopping) for (const line of await machineReport(fly, worker.id, LABEL)) say(line);
  throw new OpsError(
    `worker-scale: the worker Machine is ${state}, ${String((POLLS * POLL_MS) / 1000)} seconds after it was told to ${verb}`,
  );
}

/**
 * A start watched for WATCH_POLLS × WATCH_MS once the Machine shows as started (the header): it fails when the
 * Machine is then in any other state, or when an exit Fly wasn't asked for is among the events that weren't in
 * `before`. Either way it prints the Machine's events and its last lines in Fly's log first.
 */
async function watchStart(input: WorkerScaleInput, id: string, before: ReadonlySet<string>): Promise<void> {
  const { fly, say } = input;
  let state = "started";
  for (let poll = 0; poll < WATCH_POLLS && state === "started"; poll += 1) {
    await input.sleep(WATCH_MS);
    state = (await machines(fly)).find((machine) => machine.id === id)?.state ?? "gone";
  }
  const seconds = String((WATCH_POLLS * WATCH_MS) / 1000);
  const events = await machineEvents(fly, id);
  const exits = (events ?? [])
    .filter((row) => !before.has(row))
    .map(exitOf)
    .filter((exit) => exit !== undefined && !exit.requested);
  for (const line of reportOf(id, LABEL, events, await machineLog(fly, id))) say(line);
  if (state !== "started") {
    throw new OpsError(
      `worker-scale: the worker Machine started, then was ${state} within ${seconds} seconds; its events and its lines in Fly's log are above`,
    );
  }
  const [first] = exits;
  if (first !== undefined) {
    throw new OpsError(
      `worker-scale: the worker Machine started, but its process exited by itself within ${seconds} seconds (exit code ${String(first.code)}${first.oomKilled ? ", killed for memory" : ""}) and Fly started it again; its events and its lines in Fly's log are above`,
    );
  }
  say(`worker-scale: the worker Machine is started, and stayed started for ${seconds} seconds`);
}
