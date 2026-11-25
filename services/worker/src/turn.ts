// The worker's first act (docs/plans/api-b2-worker-turn.md). fly.toml's worker command starts Node as root, under no
// new privileges, with setuid, setgid and kill alone in its bounding set, and sets no user or group id of its own: on
// Fly's kernel, an exec under no new privileges puts an effective id that differs from the real one back to the real
// one, so the effective ids can be taken only once Node runs (PR #132's start on `dev`). main.ts imports this module
// before any other, and it imports only ./privileges.ts, which imports only Node's own modules: Node evaluates a
// module's imports in their order, each one's own first, so no other module of the worker's, and no package it uses,
// runs before the turn. Node's own modules are another matter: it loads each one the worker's modules name as it links
// them, before any of theirs runs, so their code runs as root before the turn, and `node:tls` (named by `postgres`)
// starts a thread there that reads the system's root certificates, which may still be ending as the turn runs
// (TURN_READINGS; round 2 of PR #135's review). turnToWorkerUser takes `node`'s effective group and user when the
// start is fly.toml's, and leaves any other start as it is, for photoUserFor to judge as the worker starts
// (./start.ts), but one already in the worker's mode in the image, which it refuses. A turn that fails writes the
// worker's own line alone, never an error's words (T52), and exits 1, before the worker reads anything (turnOrStop).
//
// Until the turn, Node runs as root: setuid, setgid and kill effective, under no new privileges. As no id changed at
// its exec, Node honours the settings it reads from its environment (NODE_OPTIONS among them, which could load code
// before this module), as glibc does its own: the image's ENV and fly.toml's [env] set none of them, each held to its
// names by tools/ops/src/deploy-files.test.ts, and the rest of the environment is Fly's secrets, which the founder sets.

import { turnOrStop } from "./privileges.ts";

turnOrStop();
