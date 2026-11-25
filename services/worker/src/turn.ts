// The worker's first act (docs/plans/api-b2-worker-turn.md). fly.toml's worker command starts Node as root, under no
// new privileges, with setuid, setgid and kill alone in its bounding set, and sets no user or group id of its own:
// on Fly's kernel, an exec under no new privileges puts an effective id that differs from the real one back to the
// real one, so the effective ids can be taken only once Node runs (PR #132's start on `dev`). main.ts imports this
// module before any other, and it imports only ./privileges.ts, which imports only Node's own modules: Node evaluates
// a module's imports in their order, each one's own first, so no other module of the worker's, and no package it
// uses, runs before the turn. turnToWorkerUser takes `node`'s effective group and user when the start is fly.toml's,
// and leaves any other start as it is, for photoUserFor to judge as the worker starts (./start.ts). A turn that fails
// writes its message alone and exits 1, before the worker reads anything.

import { stopWorker, turnToWorkerUser } from "./privileges.ts";

try {
  turnToWorkerUser();
} catch (error) {
  stopWorker(error instanceof Error ? error.message : "worker: it couldn't take its own user as it started");
}
