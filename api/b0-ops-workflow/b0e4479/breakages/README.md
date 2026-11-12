# Slice 10b's deliberate breakages, at `b0e4479`

`api/b0-ops-workflow`'s third commit, `b0e4479` (round 2's fixes, PR #39): the last commit that changes code.

**Result: all 72 caught, twice** (`summary-yaml.txt` and `summary-no-yaml.txt`), run at 02:33 UTC on 2026-11-12 in a detached worktree of `b0e4479`: once with the session's PyYAML, and once with `NO_YAML=1`, which runs the tests as `python3 -S`, where no YAML library is found, so the test's own strict reader catches each breakage alone.

## What a breakage is

Each entry of `B` in `breakages.py` changes one exact text in `tools/ci/ops_steps.py` (32 entries) or `.github/workflows/ops.yml` (40 entries), in a scratch copy of the commit's `tools/ci` and `.github`, then runs `python3 -B -I tools/ci/ops_steps_test.py` there (with `-S` too under `NO_YAML=1`). A breakage counts as caught only if that run fails **and** its output names the test registered for it (a test's name, or the start of one). An entry whose text isn't found exactly (once, or at the given occurrence) is reported `NOT-APPLIED`, never caught.

The commands, from the folder that holds `breakages.py`:

```
git worktree add --detach /tmp/src b0e4479
python3 -B breakages.py /tmp/src results/yaml > summary-yaml.txt
NO_YAML=1 python3 -B breakages.py /tmp/src results/no-yaml > summary-no-yaml.txt
```

Names after the output folder run only those entries.

## Files

- `breakages.py`: the script and the list.
- `summary-yaml.txt`, `summary-no-yaml.txt`: one line per breakage (`caught`, `MISSED`, `FAILED-OTHER` or `NOT-APPLIED`, and the exit code), and the total.
- `results/yaml/<name>.txt`, `results/no-yaml/<name>.txt`: each breakage's file, the old and new text, the registered test, the exit code and the test run's whole output.
- `at-dcc69fc/`: round 2's five new breakages run the same two ways at `dcc69fc`, the commit round 2 reviewed. Without a YAML library all five pass every test (`MISSED`, 0 of 5); with PyYAML each fails only `YamlReaderTest.test_it_reads_ops_yml_as_a_yaml_library_would`, not the test registered for it (`FAILED-OTHER`). That is finding R1.

## The list

The 67 of `dcc69fc` (on `evidence` under `api/b0-ops-workflow/dcc69fc/breakages/`, whose README says where each came from), and round 2's five (finding R1: a `#` or a blank line inside a folded `>-` value is YAML's text, which the round-1 reader cut or joined):

- `folded-hidden-secret`: deploy-branch's `FLY_API_TOKEN` as `>-`, then `${{ secrets.FLY_API_TOKEN }} #${{ secrets.DEV_DATABASE_ADMIN_URL }}`;
- `folded-tojson-secrets`: migrate's `DATABASE_URL` as `>-`, then `${{ secrets.DEV_DATABASE_URL }}` and a line `#${{ toJSON(secrets) }}`;
- `folded-commented-check`: deploy-branch's check step as `>-`, a line `#`, then the command, which YAML reads as `# python3 tools/ci/ops_steps.py check`, a bash comment;
- `folded-description-expression`: `#${{ secrets.FLY_API_TOKEN }}` after `org`'s description;
- `folded-blank-line-splits-check`: deploy-branch's check step as `>-` with a blank line inside the command, which YAML reads as two lines.
