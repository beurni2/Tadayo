# The `ios` test step's time limit (`ios/b1-ci-test-step-time`)

CI configuration only (T58), under the workflow freeze the coordinator gave the ios lane at 13:44 UTC on 2026-11-23. No test, wait or check of the app changes.

## 1. What happened

The `ios` workflow's build job runs one step for the tests, `python3 tools/ci/ios_steps.py test`: a pass on iOS 27.2 with the snapshot tests, then iOS 26.5's simulator booted and a pass on it without them. The step had 50 minutes (`.github/workflows/ios.yml`), and the job 135.

From about 10:00 UTC on 2026-11-23 the runner ran slow, as it did on 2026-11-20 (`docs/LIMITATIONS.md`, 2026-11-20). The iOS 27.2 pass took 26 to 40 minutes, where it took 14 at 07:47 UTC. The 50-minute step stopped seven test steps partway into iOS 26.5:

| Run | Attempt | Branch, commit | iOS 27.2's pass | iOS 26.5 |
|---|---|---|---|---|
| 45142323495 | 1 | `main`, `4404ff1` | 32 min 21 s | its pass (17 min 41 s) ended past the limit |
| 45142323495 | 2 | `main`, `4404ff1` | 32 min 54 s | stopped partway |
| 45150202042 | 1 | `ios/b1-create-handoff-9`, `3a76bdc` | 33 min 54 s | stopped partway |
| 45154528212 | 1 | `ios/b1-ui-code-wait`, `b6e18c4` | 39 min 51 s | stopped partway |
| 45163601888 | 1 | `ios/b1-create-handoff-9`, `b91724b` | 32 min 11 s | stopped partway |
| 45174501515 | 1 | `ios/b1-create-handoff-9`, `b7e1c92` | 32 min 0 s | stopped partway |
| 45176168837 | 1 | `ios/b1-ui-code-wait`, `1294c5d` | 32 min 25 s | stopped partway |

The only full pass in that time was 45154528212's attempt 2: 26 min 2 s on iOS 27.2 and 18 min 24 s on iOS 26.5. The times are the step's own lines ("ios: test: the pass on iOS 27.2 took …") in each build job's log, read through `gh api repos/beurni2/Tadayo/actions/jobs/<id>/logs`.

So since 10:00 UTC no `ios` PR has shown a full iOS 26.5 pass at its head, and a re-run doesn't help: it keeps the workflow of its own commit, so it hits the same limit.

## 2. The change

- `.github/workflows/ios.yml`: the `test` step's `timeout-minutes` goes from 50 to 90, and the build job's from 135 to 175. The steps' sum (5, 5, 35, 25, 90 and 5) stays 10 under the job's, so a hung step still fails the step and lets `collect` and the upload run (`docs/LIMITATIONS.md`, 2026-11-03).
- `tools/ci/ios_steps_test.py`: `WorkflowFileTest.test_each_step_has_its_timeout_and_the_job_its_backstop` pins the new value, 90. `test_a_step_that_hangs_times_out_before_the_job` is unchanged and still holds.

Why 90: the slowest pass seen, 39 min 51 s on iOS 27.2, plus iOS 26.5's boot (about 2.5 minutes) and its pass (about 18 minutes) comes to about 62 minutes, which leaves about 25 to spare. The cost is that a step that truly hangs runs 40 minutes longer before it's stopped. Each test's own waits are unchanged, and so is what a failure reports.

## 3. Verification

- In the session: `python3 -I tools/ci/ios_steps_test.py` (211 pass). The same test fails with the step put back at 50, which is the negative control. `yamllint -c .yamllint.yaml .github/workflows/ios.yml` and `python3 -I tools/ci/ci_steps.py guards` both pass.
- This branch changes no path that starts an `ios` run, and `ci` runs the workflow tests. The new limit is first used by the first `ios` run on `main` after the merge, and by each open PR once `main` is merged into it.

## 4. After the merge

1. Release the freeze through the coordinator.
2. Read `main`'s `ios` run: done when the test step runs both passes within its limit.
3. Merge `main` into `ios/b1-create-handoff-9` (#113) and `ios/b1-ui-code-wait` (#114), pushing each at once, so each gets a full iOS 26.5 pass at its head.
