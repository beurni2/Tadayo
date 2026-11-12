# Slice 10b's deliberate breakages, at `dcc69fc`

`api/b0-ops-workflow`'s second commit, `dcc69fc` (round 1's fixes): the last commit before round 2.

**Result: all 67 caught** (`summary.txt`), run at 02:05 UTC on 2026-11-12 in a detached worktree of `dcc69fc`.

## What a breakage is

Each entry of `B` in `breakages.py` changes one exact text in `tools/ci/ops_steps.py` (32 entries) or `.github/workflows/ops.yml` (35 entries), in a scratch copy of the commit's `tools/ci` and `.github`, then runs `python3 -B -I tools/ci/ops_steps_test.py` there. A breakage counts as caught only if that run fails **and** its output names the test registered for it (a test's name, or the start of one). An entry whose text isn't found exactly (once, or at the given occurrence) is reported `NOT-APPLIED`, never caught.

The command, from the folder that holds `breakages.py`:

```
git worktree add --detach /tmp/src dcc69fc
python3 -B breakages.py /tmp/src results > summary.txt
```

## Files

- `breakages.py`: the script and the list.
- `summary.txt`: one line per breakage (`caught`, `MISSED`, `FAILED-OTHER` or `NOT-APPLIED`, and the exit code), and the total.
- `results/<name>.txt`: each breakage's file, the old and new text, the registered test, the exit code and the test run's whole output.

## The list

The first commit (`7823576`) had 49, all caught; 47 of them are here, moved to the one-job-per-script layout, and two were renamed for it (`branch-checkout-always` is `step-level-if`, `token-in-job-env` is `token-in-workflow-env`). Round 1's fixes added 18, among them every weakening the review found to pass the first commit's tests: `blank-line-extra-secret`, `comment-extra-secret`, `blank-line-extra-permission` (finding C1), `bracket-secret-on-install`, `bracket-github-token`, `tojson-secrets` (C2), `main-returns-0`, `no-sys-exit` (C3), `shell-true` (C4), `continue-on-error-check` (C5), and `secret-unprefixed`, `missing-said-as-ops-yml` (B1), `actions-read-elsewhere`, `job-env-secret`, `setup-flyctl-in-db-job`, `missing-job`, `deploy-timeout` and `description-expression`.
