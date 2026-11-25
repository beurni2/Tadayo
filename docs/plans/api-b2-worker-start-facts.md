# api · B2 · worker-start-facts: the worker's refusal says what it found

Branch `api/b2-worker-start-facts`, from `main` at `b39dd02` (PR #130's merge). `services/worker` only: no
migration, no contract change, no workflow file, nothing the API runs.

## 0. What happened

- PR #118's merge left the `dev` worker crashing at its start (`deploy-dev` run 45534683082), with no line of its
  own in flyctl's output. PR #130 made `ops` `worker-scale --to started` print the Machine's events and its last lines
  in Fly's log on a failed start.
- The first start after PR #130's merge (`ops` run 45564360677, 06:57 UTC on 2026-11-25, on the founder's "Merge and
  start once") printed the cause. Each of the four runs Fly gave the Machine (its start and three restarts, then
  "machine has reached its max restart count of 3") wrote one line and exited with code 1:

  > worker: in production it starts only as fly.toml's worker command starts it, root turned to its own user, never
  > as root alone or as one user alone

  That is `services/worker/src/privileges.ts` `photoUserFor`'s refusal (the outside audit's A6, round 3 of PR #118's
  review): in the image, a worker not in the worker's mode (`inWorkerMode`: real uid 0, effective uid and group not
  0) or not as fly.toml's worker command leaves it (`startedAsFly`: `NoNewPrivs` 1, `CapBnd` exactly
  `00000000000000e0`, `CapInh` 0, no group 0) stops before it reads a setting.
- Fly's own line shows the command it ran was fly.toml's, through the image's entry, as root:
  `docker-entrypoint.sh prlimit --core=1 --msgqueue=0 --nproc=256 -- setpriv --euid=node --egid=node --groups=node
  --inh-caps=-all --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node --disable-sigusr1
  services/worker/src/main.ts`. The same command passes the check in the session (`privileges.test.ts`, "in the
  image, fly.toml's worker command itself goes past the photo user's check", run as root) and in Docker with the
  image (`docs/LIMITATIONS.md`, 2026-11-25). So something on Fly's Machine makes one of the seven facts differ, and
  the line doesn't say which. The stop run (`ops` run 45564522345) found the worker Machine already stopped.

## 1. The change

- `privileges.ts` `startFactsSaid(ids, status)`: the three ids `inWorkerMode` reads and the four fields `startedAsFly`
  reads, as one clause: `uid 0, euid 1000, egid 1000, NoNewPrivs 1, CapBnd 00000000000000e0, CapInh
  0000000000000000, Groups 1000`. A field the status doesn't have is `missing`, an empty one `none`. Each value keeps
  only what a field's value is made of (digits, `a` to `f`, spaces; anything else is `?`) and is cut at 64
  characters, so the line can't carry anything else into Fly's log.
- `photoUserFor`'s refusal ends with `(it found <startFactsSaid>)`. Nothing else in the rule changes: the same starts
  are refused and the same one goes on. `startedAsFly` reads its fields through the same `statusField`.
- None of these facts is a secret or personal data (T52, T56): a process's ids and its capability masks.

## 2. Tests (seen failing first on `main`'s code: 4 of 37)

- `privileges.test.ts`, "says what a refused start was found to be: its ids and the four fields of its status, each
  kept to what a field holds": fly.toml's start, root's, an empty status, and a status with capitals, punctuation and
  a long group list.
- "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it": every refused
  start's line matches `REFUSED` (the refusal and its clause) and names its ids, and each changed field names its
  value, or `missing`.
- "in the image, fly.toml's worker command itself goes past the photo user's check, and each start short of it stops
  there" (as root, `privileges-harness.ts`): each start's line names what the kernel says of the flag it left out or
  widened: `NoNewPrivs 0`; `CapBnd 00000000000000e1` (`+chown`); `CapInh 0000000000000020` (`+kill`); `Groups 0
  64998`; `euid 64998, egid 0` (`setpriv --euid` alone); `uid 0, euid 0, egid 0` (root alone).
- `start.test.ts`, "in the image (NODE_ENV=production), stops before it reads anything when started as root alone":
  the line names root's ids and the four fields.

## 3. After the merge

One `ops` `worker-scale --to started` from `main`, only on the founder's yes, with `dev` claimed through the
coordinator (and `--to stopped` if it fails). PR #130 prints the Machine's lines in Fly's log, so the refusal's
clause says which fact differs on Fly, and the fix follows on its own branch from `main`. Until then the worker stays
stopped and spikes S1's and S2's device runs wait.

## 4. Breakages

Each run against `privileges.test.ts` and `start.test.ts`, each restored after:
- K01: the clause leaves out `Groups`.
- K02: the refusal without its clause.
- K03: no `?` for characters a field doesn't hold.
- K04: no cut at 64 characters.
- K05: a missing field said as `none`.
- K06: `euid` and `egid` swapped in the clause.
- K07: `statusField` returns its value untrimmed (the rule itself).

## 5. Review

One fresh subagent, at the first commit (section 6 once it reports).
