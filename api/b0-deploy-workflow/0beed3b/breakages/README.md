# Slice 10c's deliberate breakages at `0beed3b`

Branch `api/b0-deploy-workflow`, commit `0beed3b` (the fourth commit, which answers round 3 of PR #52's review: the `pages` job downloads the site to `${{ runner.temp }}/deploy-dev-site`, outside the checkout, and `check-site`, `pages-deploy` and `check-association` read it there; the `web` job checks its build with `check-build`; a Cloudflare token that isn't a bearer token is refused unsaid, and `Http` never quotes a header value; each guard of `pages-deploy` and `check-association` tested alone).

`breakages.py` holds 175 breakages: the third commit's 152 (`api/b0-deploy-workflow/87e0ed4/breakages/`), 12 of them changed (11 with their text moved because the code they break moved, `deploy-relative-site` now passing `DOWNLOAD` for the site, and `deploy-no-install-check` only for its test's new name, `test_nothing_runs_without_the_site`), and 23 new for round 3's fixes, after the comments "round 3: the download outside the checkout", "round 3: a token that isn't a bearer token" and "round 3: each guard alone". Each is one exact change of text in a scratch copy of `tools/ci/deploy_dev_steps.py` or `.github/workflows/deploy-dev.yml` (with `tools/ops/src/environment.ts` and `services/api/src/session.test.ts` copied beside them, which the tests read), and names the test that must catch it by the start of its name. A breakage is caught only when `deploy_dev_steps_test.py` fails and its output names that test; a run that fails some other way doesn't count.

Run in the api thread's session on 2026-11-13, on a detached worktree of `0beed3b` itself:

    python3 breakages.py <worktree> yaml > yaml.txt                # PyYAML present
    NO_YAML=1 python3 breakages.py <worktree> noyaml > noyaml.txt  # tests run with -S, no YAML library

Both end `175/175 caught`. `yaml/` and `noyaml/` hold each breakage's test output; `yaml.txt` and `noyaml.txt` list each breakage, its verdict and the test run's exit status.
