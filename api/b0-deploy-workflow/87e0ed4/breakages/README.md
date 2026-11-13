# Slice 10c's deliberate breakages at `87e0ed4`

Branch `api/b0-deploy-workflow`, commit `87e0ed4` (the third commit, which answers round 2 of PR #52's review: `check-head`, `check-site`, the site built in a `web` job with no secret, wrangler installed under `RUNNER_TEMP`, the deploy job's timeout, `check-association`'s last answer).

`breakages.py` holds 152 breakages: the second commit's 114 (`api/b0-deploy-workflow/e0573ca/breakages/`), 11 of them with their text moved because the code they break moved, and 38 new for round 2's fixes (`site-*`, `deploy-skips-site-check`, `head-*`, `wr-*`, `deploy-wrangler-in-checkout`, `deploy-no-install-check`, `assoc-seen-stale`, and the `wf-*` entries after the comment "round 2: the workflow file"). Each is one exact change of text in a scratch copy of `tools/ci/deploy_dev_steps.py` or `.github/workflows/deploy-dev.yml` (with `tools/ops/src/environment.ts` and `services/api/src/session.test.ts` copied beside them, which the tests read), and names the test that must catch it by the start of its name. A breakage is caught only when `deploy_dev_steps_test.py` fails and its output names that test; a run that fails some other way doesn't count.

Run in the api thread's session on 2026-11-13, on the tree committed as `87e0ed4` (its code files unchanged since the run; only `docs/` changed after it):

    python3 -I breakages.py /home/user/tadayo-10c yaml > yaml.txt                # PyYAML present
    NO_YAML=1 python3 -S -I breakages.py /home/user/tadayo-10c noyaml > noyaml.txt  # tests run with -S, no YAML library

Both end `152/152 caught`. `yaml/` and `noyaml/` hold each breakage's test output; `yaml.txt` and `noyaml.txt` list each breakage, its verdict and the test run's exit status.
