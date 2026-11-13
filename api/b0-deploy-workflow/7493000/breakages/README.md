# Slice 10c's deliberate breakages at `7493000`

Branch `api/b0-deploy-workflow`, commit `7493000` (the fifth commit, which answers round 4 of PR #52's review: `Http.request` turns only http.client's own header refusal, a `ValueError` whose words begin "Invalid header", into the `OSError` that keeps the header unsaid, and lets any other error go on as it came; the `RUNNER_TEMP` tests put a valid site where the guard must refuse it and run `check-site`, `pages-deploy` and `check-association`; a linked `RUNNER_TEMP` is tested for `setup-wrangler` too).

`breakages.py` holds 181 breakages: the fourth commit's 175 (`api/b0-deploy-workflow/0beed3b/breakages/`), one of them changed (`http-valueerror-escapes`, its text moved because the handler now names the error), and 6 new for round 4's fixes, after the comment "round 4: RUNNER_TEMP checked for the download, and Http's narrower catch". Each is one exact change of text in a scratch copy of `tools/ci/deploy_dev_steps.py` or `.github/workflows/deploy-dev.yml` (with `tools/ops/src/environment.ts` and `services/api/src/session.test.ts` copied beside them, which the tests read), and names the test that must catch it by the start of its name. A breakage is caught only when `deploy_dev_steps_test.py` fails and its output names that test; a run that fails some other way doesn't count.

Run in the api thread's session on 2026-11-13, on a detached worktree of `7493000` itself:

    python3 breakages.py <worktree> yaml > yaml.txt                # PyYAML present
    NO_YAML=1 python3 breakages.py <worktree> noyaml > noyaml.txt  # tests run with -S, no YAML library

Both end `181/181 caught`. `yaml/` and `noyaml/` hold each breakage's test output; `yaml.txt` and `noyaml.txt` list each breakage, its verdict and the test run's exit status.
