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

import { DEV_APP } from "./environment.ts";
import { machines, type Fly, why } from "./fly.ts";
import { OpsError } from "./ops-error.ts";

export interface WorkerScaleInput {
  readonly fly: Fly;
  readonly to: "stopped" | "started";
  readonly say: (line: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

const POLLS = 10;
const POLL_MS = 3000;

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
  if ((stopping ? MAY_BE_STOPPED : MAY_BE_STARTED).includes(worker.state)) {
    say(`worker-scale: ${verb === "stop" ? "stopping" : "starting"} the worker Machine`);
    const command = stopping
      ? ["machine", "stop", worker.id, "-a", DEV_APP, "-s", "SIGTERM"]
      : ["machine", "start", worker.id, "-a", DEV_APP];
    const result = await fly.run(command);
    if (result.code !== 0)
      throw new OpsError(`worker-scale: flyctl couldn't ${verb} the worker Machine: ${why(result)}`);
  } else if (!waiting.includes(worker.state)) {
    throw new OpsError(`worker-scale: the worker Machine is ${worker.state}: nothing was changed`);
  }

  let state = worker.state;
  for (let poll = 0; poll < POLLS; poll += 1) {
    const now = (await machines(fly)).find((machine) => machine.id === worker.id);
    if (now === undefined) throw new OpsError("worker-scale: the worker Machine is gone");
    state = now.state;
    if (done(state)) {
      say(`worker-scale: the worker Machine is ${input.to}`);
      return;
    }
    await input.sleep(POLL_MS);
  }
  throw new OpsError(
    `worker-scale: the worker Machine is ${state}, ${String((POLLS * POLL_MS) / 1000)} seconds after it was told to ${verb}`,
  );
}
