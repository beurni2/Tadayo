#!/usr/bin/env python3
"""Guard 1 (docs/TECH-DESIGN.md section 9; docs/INVARIANTS.md T58).

  python3 tools/ci/ci_config_guard.py

A branch that changes CI configuration (`.yamllint.yaml`, `.github/`, `.claude/`, `tools/ci/`)
changes nothing else, except the logs `docs/DECISIONS.md`, `docs/LIMITATIONS.md` and
`docs/JOURNAL.md`. So the founder reads every change to the checks on its own.

It compares the branch with the point where it left main (`git diff origin/main...HEAD`), so a
merge of main into the branch brings none of main's own changes into the count. Renames count as
their two paths, so a file moved out of `tools/ci/` counts as a change there. Skipped on main
(GITHUB_REF_NAME on a runner, else git's current branch). Needs a full checkout
(fetch-depth: 0), and fails when origin/main is missing.

Exit 0 when the branch passes or the guard is skipped, 1 when it fails (each path printed).

Tests: python3 tools/ci/ci_config_guard_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import os
import subprocess
import sys

CI_FILES = {".yamllint.yaml"}
CI_DIRS = (".github/", ".claude/", "tools/ci/")
LOGS = {"docs/DECISIONS.md", "docs/LIMITATIONS.md", "docs/JOURNAL.md"}


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError("git " + " ".join(args) + " failed: " + result.stderr.strip())
    return result.stdout


def is_ci_configuration(path):
    return path in CI_FILES or path.startswith(CI_DIRS)


def branch_name():
    return os.environ.get("GITHUB_REF_NAME") or git("rev-parse", "--abbrev-ref", "HEAD").strip()


def changed_paths():
    out = git("diff", "--name-only", "--no-renames", "-z", "origin/main...HEAD")
    return sorted({path for path in out.split("\0") if path})


def check(paths):
    """The problems with these changed paths, as lines to print; empty when they pass."""
    ci = [p for p in paths if is_ci_configuration(p)]
    if not ci:
        return []
    others = [p for p in paths if not is_ci_configuration(p) and p not in LOGS]
    if not others:
        return []
    return (["This branch changes CI configuration, so it may change nothing else but "
             "docs/DECISIONS.md, docs/LIMITATIONS.md and docs/JOURNAL.md (T58).",
             "CI configuration it changes:"] + [f"  {p}" for p in ci]
            + ["Other files it changes, which belong in a PR of their own:"]
            + [f"  {p}" for p in others])


def main():
    if branch_name() == "main":
        print("guard 1: skipped on main")
        return 0
    if subprocess.run(["git", "rev-parse", "--verify", "-q", "origin/main"],
                      capture_output=True).returncode != 0:
        print("guard 1: origin/main is missing, so the branch can't be compared. "
              "Check out with fetch-depth: 0.")
        return 1
    problems = check(changed_paths())
    for line in problems:
        print(line)
    if problems:
        return 1
    print("guard 1: passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as error:
        print(f"guard 1: {error}")
        sys.exit(1)
