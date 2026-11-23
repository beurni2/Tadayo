# api/b2-worker-hardening: the image as Fly starts it

Built from the branch's second commit's tree in the session (`docker build`, with the session's CA in the base
image so pnpm could install; nothing else differs from `NODE_IMAGE`), 2026-11-23 ~22:50 UTC, and run with
`docker run` exactly as `fly.toml`'s `[processes]` commands run.

- `probes.txt`: each process group's ids and capabilities from `/proc/self/status` (`status.mjs`): the API all
  `node` with no capability; the worker real uid 0, effective `node`, `CAP_SETUID`, `CAP_SETGID` and `CAP_KILL`
  permitted but not effective, its own `environ` unreadable (non-dumpable). The image's bare `CMD` and the
  `tadayo-image` user.
- `photo-run.json`: a real JPEG (900 x 1125) prepared by `prepareIsolated` under the worker's command, with
  `TADAYO_PHOTO_USER=tadayo-image` (`photo.mjs`): the child as uid and gid 10001, the sweep as uid 10001 with the
  worker's gid 1000 and the program that refuses root, none of uid 10001 left after the answer.
- `harness-in-image.jsonl`: `services/worker/src/privileges-harness.ts` run as root in the image, each line one
  case that `services/worker/src/privileges.test.ts` checks (refusals, a failed sweep never done, the child
  unable to read the worker's `environ`, `mem` or `fd/1` or signal it, a process left behind ended, a forking
  loop ended, the sweep's group, memory and deadline kills). Standard error was empty.

The run of ~21:50 UTC, before the sweep's program refused root and before the failing-sweep case, is under
`../image-first/`.
