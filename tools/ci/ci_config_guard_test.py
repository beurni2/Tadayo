#!/usr/bin/env python3
"""Tests for tools/ci/ci_config_guard.py (guard 1). Run: python3 tools/ci/ci_config_guard_test.py

Each test makes a scratch clone with an origin/main, commits on a branch the way a slice would,
and runs the guard there.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "ci_config_guard.py")


class Clone:
    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="ci-config-guard-")
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_", "GITHUB_"))}
        self.env.update(GIT_AUTHOR_NAME="Claude", GIT_AUTHOR_EMAIL="noreply@anthropic.com",
                        GIT_COMMITTER_NAME="Claude", GIT_COMMITTER_EMAIL="noreply@anthropic.com",
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_EDITOR="true")
        self.origin = os.path.join(self.root, "origin.git")
        self.work = os.path.join(self.root, "work")
        self.git("init", "-q", "--bare", "-b", "main", self.origin, cwd=self.root)
        self.git("clone", "-q", self.origin, self.work, cwd=self.root)
        for path in ["README.md", "package.json", "docs/JOURNAL.md", "docs/PROGRESS.md",
                     "tools/ci/journal_check.py", ".github/pull_request_template.md"]:
            self.write(path, "first\n")
        self.commit()
        self.git("push", "-q", "origin", "HEAD:main")
        self.git("fetch", "-q", "origin")
        self.git("checkout", "-q", "-b", "feature")

    def git(self, *args, cwd=None):
        result = subprocess.run(["git", *args], cwd=cwd or self.work, env=self.env,
                                capture_output=True, text=True)
        if result.returncode != 0:
            raise AssertionError(f"git {args} failed: {result.stderr}")
        return result.stdout

    def write(self, path, text):
        full = os.path.join(self.work, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)

    def commit(self, message="change"):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def change(self, *paths):
        for path in paths:
            self.write(path, f"changed {path}\n")
        self.commit()

    def guard(self, env=None):
        run_env = dict(self.env)
        run_env.update(env or {})
        result = subprocess.run([sys.executable, "-I", GUARD], cwd=self.work, env=run_env,
                                capture_output=True, text=True)
        return result.returncode, result.stdout + result.stderr

    def close(self):
        shutil.rmtree(self.root, ignore_errors=True)


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.clone = Clone()

    def tearDown(self):
        self.clone.close()

    def assertPasses(self):
        code, out = self.clone.guard()
        self.assertEqual(code, 0, out)
        return out

    def assertFails(self, *named):
        code, out = self.clone.guard()
        self.assertEqual(code, 1, out)
        for path in named:
            self.assertIn(path, out)
        return out

    def test_workflow_with_a_plan_fails(self):
        # The B0 plan's slice 2 test: `.github/` and `docs/plans/x.md` together.
        self.clone.change(".github/workflows/ci.yml", "docs/plans/x.md")
        self.assertFails("docs/plans/x.md")

    def test_workflow_with_the_three_logs_passes(self):
        self.clone.change(".github/workflows/ci.yml", "docs/DECISIONS.md", "docs/LIMITATIONS.md",
                          "docs/JOURNAL.md")
        self.assertPasses()

    def test_a_feature_branch_passes(self):
        self.clone.change("packages/domain/src/a.ts", "docs/JOURNAL.md", "docs/PROGRESS.md")
        self.assertPasses()

    def test_each_kind_of_ci_configuration_counts(self):
        for path in [".yamllint.yaml", ".claude/settings.json", "tools/ci/ci_steps.py",
                     ".github/pull_request_template.md"]:
            with self.subTest(path=path):
                clone = Clone()
                try:
                    clone.change(path, "package.json")
                    code, out = clone.guard()
                    self.assertEqual(code, 1, out)
                    self.assertIn("package.json", out)
                finally:
                    clone.close()

    def test_progress_is_not_one_of_the_logs(self):
        self.clone.change("tools/ci/ci_steps.py", "docs/JOURNAL.md", "docs/PROGRESS.md")
        self.assertFails("docs/PROGRESS.md")

    def test_ci_configuration_alone_passes(self):
        self.clone.change("tools/ci/ci_steps.py", ".yamllint.yaml")
        self.assertPasses()

    def test_a_similar_path_is_not_ci_configuration(self):
        # tools/ci-notes/ and .github-old are not CI configuration, so they don't trip the guard.
        self.clone.change("tools/ci-notes/a.md", ".github-old", "package.json")
        self.assertPasses()

    def test_a_deletion_counts(self):
        self.clone.git("rm", "-q", ".github/pull_request_template.md")
        self.clone.write("package.json", "changed\n")
        self.clone.commit()
        self.assertFails("package.json")

    def test_a_rename_out_of_tools_ci_counts_both_paths(self):
        os.makedirs(os.path.join(self.clone.work, "scripts"))
        self.clone.git("mv", "tools/ci/journal_check.py", "scripts/journal_check.py")
        self.clone.commit()
        out = self.assertFails("scripts/journal_check.py")
        self.assertIn("tools/ci/journal_check.py", out)

    def test_main_merged_in_is_not_the_branch_s_change(self):
        # Another PR changed package.json on main; this branch merges main and changes only CI.
        self.clone.git("checkout", "-q", "main")
        self.clone.git("pull", "-q", "--ff-only", "origin", "main")
        self.clone.change("package.json")
        self.clone.git("push", "-q", "origin", "HEAD:main")
        self.clone.git("checkout", "-q", "feature")
        self.clone.change(".github/workflows/ci.yml", "docs/JOURNAL.md")
        self.clone.git("fetch", "-q", "origin")
        self.clone.git("merge", "-q", "--no-edit", "origin/main")
        self.assertPasses()

    def test_main_moving_ahead_without_a_merge_is_not_the_branch_s_change(self):
        # Another PR changed package.json on main after this branch left it, and the branch
        # hasn't merged main: the guard compares with where the branch left main (three dots).
        self.clone.git("checkout", "-q", "main")
        self.clone.change("package.json")
        self.clone.git("push", "-q", "origin", "HEAD:main")
        self.clone.git("checkout", "-q", "feature")
        self.clone.change(".github/workflows/ci.yml", "docs/JOURNAL.md")
        self.clone.git("fetch", "-q", "origin")
        self.assertPasses()

    def test_a_path_git_would_quote_still_counts(self):
        # Without -z, git quotes `tools/ci/é x.py`, which would then not start with tools/ci/.
        self.clone.change("tools/ci/é x.py", "package.json")
        self.assertFails("package.json")

    def test_skipped_on_main(self):
        self.clone.git("checkout", "-q", "main")
        self.clone.change(".github/workflows/ci.yml", "package.json")
        code, out = self.clone.guard()
        self.assertEqual(code, 0, out)
        self.assertIn("skipped on main", out)

    def test_skipped_on_main_from_github_s_ref(self):
        # On a runner the branch comes from GITHUB_REF_NAME, which wins over git's own answer.
        self.clone.change(".github/workflows/ci.yml", "package.json")
        code, out = self.clone.guard({"GITHUB_REF_NAME": "main"})
        self.assertEqual(code, 0, out)
        self.assertIn("skipped on main", out)
        code, out = self.clone.guard({"GITHUB_REF_NAME": "api/b0-ci"})
        self.assertEqual(code, 1, out)

    def test_missing_origin_main_fails(self):
        self.clone.git("update-ref", "-d", "refs/remotes/origin/main")
        self.clone.change(".github/workflows/ci.yml")
        self.assertFails("origin/main")

    def test_a_branch_with_no_change_passes(self):
        self.assertPasses()


if __name__ == "__main__":
    unittest.main()
