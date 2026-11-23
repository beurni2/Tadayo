# Deliberate breakages of `api/b2-worker-hardening` at `1251ee6`

The worker's hardening, its second commit: each photo prepared under a user of its own (ADR-038;
`docs/plans/api-b2-worker-hardening.md` section 2). 44 breakages, each one change to `services/worker/src/privileges.ts`
(P01 to P11 `photoUserFor`, A01 to A03 `asRoot`, W01 to W11 the sweep), `image-process.ts` (X01 to X06), `start.ts`
(S01), `prepare.ts` (R01), `main.ts` (M01), the Dockerfile and `fly.toml` (D01 to D10), run with `breakages.py` on the
tree this commit holds, before it was committed. A breakage is caught when the suite fails and a failing test's name
holds the words registered for it.

- `run.log`: the whole run, 43 breakages. 42 caught by a test. W05 (a sweep's exit not 0 taken as done) was **not
  caught**: no test made a sweep fail by its exit. The harness got a case for it ("a sweep that exits other than 0, or
  is killed by a signal, is never done: a process left behind may have killed it"), and W11 (an exit by a signal taken
  as done) was added.
- `run2.log`: W05 and W11 again, both caught by that case, and W01, W07 to W10. In the first run W01 and W07 to W09 (the
  sweep's refusal of root, root's group, and the worker's own uid and gid) were registered against the unit test "the
  sweep refuses root, …", which runs as the session's root, whose own ids are root's, so it can't tell them apart there;
  the harness's case, in the worker's mode, catches all four, and is the one registered now. On `ci`'s runner, which
  isn't root, the unit test catches them too.
- W01 and X01 (the sweep taking root; the photo's process started as the worker) run the harness's children as root
  without the worker's mode, so they ran in a container of the image (`privbox`: `--pids-limit 1024 --memory 3g`).
  An earlier run of W01 on the session's machine, where the sweep's program didn't yet refuse root, sent `kill(-1)` as
  root and ended every process of the session's container, twice: `run-interrupted.log` and `out-interrupted/` are
  those runs as far as they went. The tree was restored by its hash both times, and the program now exits 2 as root (W10
  is that check taken out).
- `before.sha` and `after.sha` (and `before2.sha`, `after2.sha`): the hash of the tree's diff and new files outside
  `docs/` before and after each run, equal.

For each: the change alone (`out/<code>.patch`) and the suite's output (`out/<code>.txt`).
