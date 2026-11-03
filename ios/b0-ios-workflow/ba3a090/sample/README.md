# Sample contact sheets, PR #10 at `ba3a090`

A hand run of `tools/ci/ios_steps.py sheets` from that commit, on a copy of the whole repository (`git archive ba3a090`), with stand-in images: not a run of the `ios` workflow, which first runs after PR #10 merges.

- `F02-upcoming.jpg`: a changed snapshot. Left, the state's render, handoff 0's (`design/reference/screens/F02-upcoming.png`), which the step prefers over 2.1's; middle, a stand-in committed reference (grey); right, a stand-in snapshot (blue), with the run's iOS, device, branch and commit.
- `A02-email.jpg`: a new snapshot of a state with no render: the snapshot alone, marked "built from spec, awaiting render" (T46).

These replace the samples under `../../f544332/sample/`, which were drawn in a scratch copy that held only 2.1's render, so their `F02-upcoming` sheet showed 2.1's render where a real run shows handoff 0's.
