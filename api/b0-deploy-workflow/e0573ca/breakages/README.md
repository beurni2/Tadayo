# Slice 10c's deliberate breakages at `e0573ca`

Branch `api/b0-deploy-workflow`, commit `e0573ca` (the second commit, which answers round 1 of PR #52's review: the `pages` job on a runner of its own, wrangler in an empty temporary folder, `_worker.js` refused, `check-association`'s waits, `HttpTest`).

`breakages.py` holds 114 breakages: the first commit's 91 (`api/b0-deploy-workflow/b47c839/breakages/`), 7 of them with their text moved to this commit's, and 23 new for round 1's fixes (`assoc-*`, `deploy-*`, `http-*`, `wf-pages-*`). Each is one exact change of text in a scratch copy of `tools/ci/deploy_dev_steps.py` or `.github/workflows/deploy-dev.yml` (with `tools/ops/src/environment.ts` and `services/api/src/session.test.ts` copied beside them, which the tests read), and names the test that must catch it by the start of its name. A breakage is caught only when `deploy_dev_steps_test.py` fails and its output names that test; a run that fails some other way doesn't count.

Run in the api thread's session on 2026-11-13, on the tree committed as `e0573ca` (its code files unchanged since the run; only `docs/` changed after it):

    python3 -I breakages.py /home/user/tadayo-10c yaml > yaml.txt                # PyYAML present
    NO_YAML=1 python3 -S -I breakages.py /home/user/tadayo-10c noyaml > noyaml.txt  # tests run with -S, no YAML library

Both end `114/114 caught`. `yaml/` and `noyaml/` hold each breakage's test output; `yaml.txt` and `noyaml.txt` list each breakage, its verdict and the test run's exit status.
