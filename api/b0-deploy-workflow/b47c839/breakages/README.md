# Slice 10c's deliberate breakages at `b47c839`

Branch `api/b0-deploy-workflow`, commit `b47c839` (the first commit: `.github/workflows/deploy-dev.yml`, `tools/ci/deploy_dev_steps.py`, `tools/ci/deploy_dev_steps_test.py`, `tools/ci/pages/`).

`breakages.py` holds 91 breakages. Each is one exact change of text in a scratch copy of `tools/ci/deploy_dev_steps.py` or `.github/workflows/deploy-dev.yml` (with `tools/ops/src/environment.ts` and `services/api/src/session.test.ts` copied beside them, which the tests read), and names the test that must catch it by the start of its name. A breakage is caught only when `deploy_dev_steps_test.py` fails and its output names that test; a run that fails some other way doesn't count.

Run in the api thread's session on 2026-11-13, from the committed tree:

    python3 -I breakages.py /home/user/tadayo-10c yaml > yaml.txt            # PyYAML present
    NO_YAML=1 python3 -I breakages.py /home/user/tadayo-10c noyaml > noyaml.txt  # tests run with -S, no YAML library

Both end `91/91 caught`. `yaml/` and `noyaml/` hold each breakage's test output; `yaml.txt` and `noyaml.txt` list each breakage, its verdict and the test run's exit status.
