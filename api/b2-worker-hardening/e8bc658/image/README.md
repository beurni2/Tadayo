# api/b2-worker-hardening: the image as Fly starts it, at the third commit

Built in the session (`docker build --build-arg NODE_IMAGE=tadayo-node-ca:local`: the pinned base with the session's
CA added so pnpm could install; nothing else differs from `NODE_IMAGE`) and run with `docker run` as `fly.toml`'s
`[processes]` commands run.

- `harness-in-image.jsonl`: `services/worker/src/privileges-harness.ts` run as root in the image built from the third
  commit's tree (`node --disable-sigusr1`), 2026-11-24 ~01:05 UTC. Each line is one case that
  `services/worker/src/privileges.test.ts` checks, and each is as the test expects. Since the second commit:
  `sweep-usr1` (a `SIGUSR1` sent as root to a waiting sweep is neither caught nor acted on: it stays blocked, nothing
  listens on 9229, the sweep exits 0 on its own), `hoards` (files, read-only folders and System V objects the photo
  user left, and segments given away both ways, all gone once the photo's end settles), `start-sweep` and
  `start-sweep-fails` (the worker's start ends a process of the photo user left from before, and stops before the
  database when it can't), `reaped` (no group kill after the photo's process was reaped). Standard error was empty.
- `probes.txt`: the image's bare `CMD`, then each `fly.toml` command with its Node script swapped for `status.mjs`:
  the API all `node` with no capability; the worker real uid 0, effective `node`, `CAP_SETUID`, `CAP_SETGID` and
  `CAP_KILL` permitted but not effective, its own `environ` unreadable, its processes capped at 256 and its core size
  0 (`prlimit`); both with `--disable-sigusr1`, so `SIGUSR1` is blocked (`SigBlk` bit `0x200`) and not caught
  (`SigCgt`). Then the `tadayo-image` user and the tools and folders the sweep uses.
- `photo-run.json`: a real JPEG (900 x 1125) prepared by `prepareIsolated` under the worker's command with
  `TADAYO_PHOTO_USER=tadayo-image` (`photo.mjs`): the child as uid and gid 10001, the sweep as uid 10001 with the
  worker's gid 1000, nothing of uid 10001 left after the answer.
- `start-sweep.txt`: a process and a file of `tadayo-image` left before the worker starts; the worker, started as
  `fly.toml` starts it with a database that refuses, ends the process and removes the file before it fails to
  connect.

`probes.txt`, `photo-run.json` and `start-sweep.txt` were taken at ~00:03 UTC on an image built before the last
test changes (the harness's new `hoards` objects and four JPEG cases); its runtime code is this commit's: a sha256 over
every TypeScript file in `/app/services` and `/app/packages` but the tests and the harness is the same in both images
(`ab049104...`).
