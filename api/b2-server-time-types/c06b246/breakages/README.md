# A14's third part, after the second review: breakages and controls (commit c06b246)

The plan, `docs/plans/api-b2-server-time-types.md` on the branch `api/b2-server-time-types`, registers these in
section 3 (after the second review: T0, C0, P1 to P13, B15 and B16 again, P6's and P8's edits moved with the third
commit's `parts`, and P14 and P15 new) and records how they ran in section 3.1. `run3.py` is the runner: each breakage
is a text edit, applied to a detached worktree at `f5000a3` holding a copy of this commit's code and tests (made before
the commit, which holds them unchanged; the merge of `main` at `79b0478` before it brings no server code), run against
the suites registered for it, and undone; each edited file is copied before, restored from that copy after, and
checked equal to the tree's own. Each matrix run starts on a fresh Postgres 16 cluster in the session. A breakage's
`.patch` is its edit and its `.N.txt` the output of its Nth run; caught means the run failed, its output held every
pattern registered for it and none registered as absent. Each run's verdict is one line of a log below;
`results.json` and `control.json` hold only the last invocation's.

- `run-unit.log`: P1 to P15 on the slice's tree, each caught, naming its own (P13 and P14 in `harness.test.ts`, every
  other in `one-clock.test.ts`); then the controls on `main`'s tree at `f5000a3`, with `main`'s tests: T0 (the slice's
  `one-clock.test.ts` on `main`'s code: caught, its list exactly the 25 found and not kept, and only
  `notBeforeReveal(at)` and `notBeforeReveal(revealAt)` kept and not found) and C0 (`main`'s `one-clock.test.ts`:
  passed, missed, as registered).
- `run-matrix.log`: B15 (Home's `server_now` from `?since=`, with no cast: `branch/B15.0.txt`, caught by
  `one-clock.test.ts`'s compile test; `branch/B15.1.txt`, caught by the matrix as the member in the audience on the
  request of time names) and B16 (Home's `server_now` replaced by `?since=`'s text after `homeBody`: `branch/B16.0.txt`,
  `one-clock.test.ts` passing, the miss registered beforehand; `branch/B16.1.txt`, caught by the matrix the same way).
  Their controls on `main` are run2's (`../../9ce4321/breakages/`): `main`'s tree and tests haven't changed since.
- `branch/`: the slice's outputs and patches. `main/`: T0's and C0's outputs.
