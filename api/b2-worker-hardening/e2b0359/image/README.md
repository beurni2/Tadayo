# api/b2-worker-hardening: the image as Fly starts it, at the fourth commit (e2b0359)

Built in the session from the fourth commit's tree (`docker build --build-arg NODE_IMAGE=tadayo-node-ca:local`: the
pinned base with the session's CA added so pnpm could install; nothing else differs from `NODE_IMAGE`), tagged
`tadayo-api-dev:hardening7`, and run with `docker run` as `fly.toml`'s `[processes]` commands run (`run.sh`,
`cmds.env`). Every TypeScript file under `/app/services` and `/app/packages` in the image (131, the tests and the
harness included) is byte for byte the commit's.

- `probes.txt`: the image's bare `CMD`, then each `fly.toml` command with its Node script swapped for `status.mjs`. The
  API all `node` with no capability. The worker real uid 0, effective `node`; `CAP_SETUID`, `CAP_SETGID` and
  `CAP_KILL` permitted but not effective; inheritable set empty (`--inh-caps=-all`); its own `environ` unreadable;
  processes capped at 256, core size 1 byte, POSIX message queues 0 bytes (`prlimit --core=1 --msgqueue=0`). Both
  with `--disable-sigusr1`, so `SIGUSR1` is blocked and not caught. Under the worker's command a POSIX queue can't be
  made (`EMFILE`). As `tadayo-image`, a crash leaves a core file at no limit and none at 1 or 0 (this container's
  `core_pattern` is a file; a pipe pattern, which `--core=1` is for, can't be set in a container). Then the
  `tadayo-image` user and the tools and folders the sweep uses.
- `photo-run.json`: a real JPEG (the iOS fixture `chair.jpg`, 1290 x 1612, progressive) prepared by
  `prepareIsolated` under the worker's command with `TADAYO_PHOTO_USER=tadayo-image` (`photo.mjs`): the child as uid
  and gid 10001, the sweep as uid 10001 with the worker's gid 1000, both renditions made, nothing of uid 10001 left
  after the answer.
- `start-sweep.txt`: a process, a file and a file whose name isn't UTF-8, all of `tadayo-image`, left before the
  worker starts; the worker, started as `fly.toml` starts it with a database that refuses, ends the process and
  removes both files before it fails to connect (`start-sweep.sh`).
- `sweep-many.txt`: 32,000 message queues and 32,000 semaphore sets of `tadayo-image` (as round 2's security review
  made), then `sweep` under the worker's command: all 64,000 gone in under a second (`many.sh`, `sweep-many.mjs`).
- `ipcrm-one-call.txt`: the same 64,000 removed with one `ipcrm` call, through Node's `execFileSync` (as the third
  commit's sweep called it) and through `spawnSync`: `execFileSync` throws "Maximum call stack size exceeded" once
  `ipcrm` has removed them all, so the third commit's sweep exited 1 and stopped the worker; `spawnSync` returns
  status 0 (`ipcrm-one-call.cjs`).
- `harness-in-image.jsonl`: `services/worker/src/privileges-harness.ts` run as root in the image
  (`node --disable-sigusr1`): 15 lines, each case as `privileges.test.ts` expects. Since the third commit: `watcher`
  (a leftover sets the sweep's scheduling group to 19, `autogroup: "set"`, and the worker's reads `nice 0` before and
  after), `hoards` (also `/var/tmp`, `/run/lock`, `/dev/mqueue`, names that aren't UTF-8, a tree 2,100 folders deep
  and 1,200 more queues: nothing left), `sweep-fails` (`left` for exit status 3), `start-sweep-fails` (`the sweep,
  left`). Standard error was empty.
- `harness-sweep-left.*` and `harness-sweep-timeout.*`: the harness's two modes that stop the worker, each with its
  own line and exit 1: what was left couldn't all be removed (a file of the photo user's in a folder of root's), and a
  sweep that doesn't finish in time.
