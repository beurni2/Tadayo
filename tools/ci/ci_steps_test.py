#!/usr/bin/env python3
"""Tests for tools/ci/ci_steps.py. Run: python3 tools/ci/ci_steps_test.py

Each test builds a scratch repository with only the files a step looks for, and runs the step
with a fake shell that records the commands instead of running them. The ratchet's and
tools-tests' tests run real git and Python in scratch repositories, and one test reads
.github/workflows/ci.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ci_steps  # noqa: E402
import toolchain  # noqa: E402

WORKSPACE = """# The TypeScript workspace.
packages:
  - apps/web
  - packages/*
  - 'services/api'
  - "tests"   # a comment
other:
  - not/a/package
"""


class FakeShell:
    def __init__(self, codes=None, outputs=None):
        self.commands = []
        self.envs = []
        self.codes = codes or {}
        self.outputs = outputs or {}

    def run(self, cmd, env=None):
        self.commands.append(cmd)
        self.envs.append(env)
        return self.codes.get(cmd[-1], 0) if cmd else 0

    def output(self, cmd, env=None):
        self.commands.append(cmd)
        return self.outputs.get(cmd[0], (0, ""))


class Repo:
    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="ci-steps-")
        self.write("package.json", json.dumps({"packageManager": "pnpm@12.16.1"}))
        self.write("pnpm-workspace.yaml", WORKSPACE)
        for directory in ["apps/web", "packages/domain", "packages/contracts", "services/api",
                          "tests"]:
            self.package(directory)
        self.write("not/a/package/package.json", json.dumps({"scripts": {"openapi:check": "x"}}))

    def write(self, path, text):
        full = os.path.join(self.root, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)

    def package(self, directory, **scripts):
        self.write(f"{directory}/package.json", json.dumps({"name": directory, "scripts": scripts}))

    def close(self):
        shutil.rmtree(self.root, ignore_errors=True)


class StepsTest(unittest.TestCase):
    def setUp(self):
        self.repo = Repo()
        self.shell = FakeShell()

    def tearDown(self):
        self.repo.close()

    def step(self, name, require=False, environ=None, shell=None):
        steps = ci_steps.Steps(self.repo.root, shell or self.shell, require_targets=require,
                               environ=environ or {})
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = ci_steps.STEPS[name](steps)
        return code, out.getvalue()


class WorkspaceTest(StepsTest):
    def test_reads_the_listed_packages_with_globs_and_quotes(self):
        steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
        self.assertEqual(steps.workspace_packages(),
                         ["apps/web", "packages/contracts", "packages/domain", "services/api",
                          "tests"])

    def test_an_unreadable_workspace_fails_loudly(self):
        self.repo.write("pnpm-workspace.yaml", "packages:\n  - [a, b]\n")
        steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
        with self.assertRaises(ValueError):
            steps.workspace_packages()

    def test_an_empty_workspace_fails_loudly(self):
        self.repo.write("pnpm-workspace.yaml", "packages:\n")
        steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
        with self.assertRaises(ValueError):
            steps.workspace_packages()

    def test_patterns_pnpm_reads_differently_fail_loudly(self):
        # glob.glob reads `**` as `*`, and pnpm reads `**` at any depth.
        for pattern in ["packages/**", "!packages/old"]:
            with self.subTest(pattern=pattern):
                self.repo.write("pnpm-workspace.yaml", f"packages:\n  - '{pattern}'\n")
                steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
                with self.assertRaises(ValueError):
                    steps.workspace_packages()

    def test_a_manifest_other_than_package_json_fails_loudly(self):
        for name in ["package.yaml", "package.json5"]:
            with self.subTest(name=name):
                self.repo.write(f"packages/other/{name}", "name: other\n")
                steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
                with self.assertRaises(ValueError):
                    steps.workspace_packages()
                os.remove(os.path.join(self.repo.root, "packages", "other", name))

    def test_a_matched_directory_without_package_json_is_left_out(self):
        # packages/* matches packages/swift, which holds Swift packages, not a pnpm package.
        self.repo.write("packages/swift/TadayoCore/Package.swift", "// swift-tools-version:6.0")
        steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
        self.assertNotIn("packages/swift", steps.workspace_packages())


class PackageScriptStepsTest(StepsTest):
    CASES = [("openapi", "openapi:check"), ("unit", "test"), ("web", "build"),
             ("db-tests", "test:db"), ("privacy", "test:privacy")]

    def test_each_passes_empty_while_its_script_is_absent(self):
        for step, script in self.CASES:
            with self.subTest(step=step):
                code, out = self.step(step)
                self.assertEqual(code, 0)
                self.assertIn(f"`{script}` script", out)
                self.assertEqual(self.shell.commands, [])

    def test_each_fails_when_its_script_is_absent_from_slice_12(self):
        for step, script in self.CASES:
            with self.subTest(step=step):
                code, out = self.step(step, require=True)
                self.assertEqual(code, 1)
                self.assertIn("missing", out)

    def test_a_script_outside_the_workspace_doesn_t_count(self):
        # not/a/package has an openapi:check script, but the workspace doesn't list it.
        code, _ = self.step("openapi")
        self.assertEqual(code, 0)
        self.assertEqual(self.shell.commands, [])

    def test_each_runs_its_script_once_a_package_has_it(self):
        # Without --if-present, so pnpm fails if it finds no package with the script.
        # The database steps run one package at a time: every package gets the same database.
        one_at_a_time = {"db-tests", "privacy"}
        for step, script in self.CASES:
            with self.subTest(step=step):
                self.repo.package("packages/contracts", **{script: "true"})
                shell = FakeShell()
                code, out = self.step(step, shell=shell)
                self.assertEqual(code, 0)
                flags = ["--workspace-concurrency=1"] if step in one_at_a_time else []
                self.assertEqual(shell.commands, [["pnpm", "-r", *flags, "run", script]])
                self.assertIn("packages/contracts", out)

    def test_a_failing_script_fails_the_step(self):
        self.repo.package("packages/domain", test="vitest run")
        code, _ = self.step("unit", shell=FakeShell(codes={"test": 1}))
        self.assertEqual(code, 1)

    def test_database_steps_get_both_urls(self):
        self.repo.package("tests", **{"test:db": "x", "test:privacy": "y"})
        for step in ["db-tests", "privacy"]:
            with self.subTest(step=step):
                shell = FakeShell()
                self.step(step, shell=shell)
                self.assertEqual(shell.envs[0]["DATABASE_URL"], ci_steps.APP_URL)
                self.assertEqual(shell.envs[0]["DATABASE_ADMIN_URL"], ci_steps.ADMIN_URL)
                self.assertIn("tadayo_app:", ci_steps.APP_URL)


class RootStepsTest(StepsTest):
    def test_root_scripts(self):
        for step, script in [("lint", "lint"), ("typecheck", "typecheck"),
                             ("format", "format:check"), ("copy-lint", "copy-lint")]:
            with self.subTest(step=step):
                shell = FakeShell()
                self.assertEqual(self.step(step, shell=shell)[0], 0)
                self.assertEqual(shell.commands, [["pnpm", "run", script]])

    def test_install_is_frozen(self):
        self.step("install")
        self.assertEqual(self.shell.commands, [["pnpm", "install", "--frozen-lockfile"]])

    def test_setup_pnpm_installs_the_named_version(self):
        self.step("setup-pnpm")
        self.assertEqual(self.shell.commands, [["npm", "install", "--global", "pnpm@12.16.1"]])

    def test_setup_pnpm_accepts_a_hash(self):
        self.repo.write("package.json", json.dumps({"packageManager": "pnpm@12.16.1+sha512.abc123"}))
        self.step("setup-pnpm")
        self.assertEqual(self.shell.commands, [["npm", "install", "--global", "pnpm@12.16.1"]])

    def test_setup_pnpm_refuses_anything_else(self):
        for manager in ["", "pnpm@latest", "yarn@4.0.0", "pnpm@1.2.3; curl x", "pnpm@12"]:
            with self.subTest(manager=manager):
                self.repo.write("package.json", json.dumps({"packageManager": manager}))
                shell = FakeShell()
                self.assertEqual(self.step("setup-pnpm", shell=shell)[0], 1)
                self.assertEqual(shell.commands, [])


class DatabaseStepsTest(StepsTest):
    def test_db_check_accepts_the_pinned_major(self):
        version = f"{toolchain.POSTGRES_MAJOR}0011\n"
        code, out = self.step("db-check", shell=FakeShell(outputs={"psql": (0, version)}))
        self.assertEqual(code, 0, out)

    def test_db_check_refuses_another_major(self):
        code, out = self.step("db-check", shell=FakeShell(outputs={"psql": (0, "160004\n")}))
        self.assertEqual(code, 1)
        self.assertIn("disagree", out)

    def test_db_check_fails_without_a_server(self):
        code, _ = self.step("db-check", shell=FakeShell(outputs={"psql": (2, "refused")}))
        self.assertEqual(code, 1)

    def test_bootstrap_makes_supabase_s_roles_and_passes_while_the_file_is_absent(self):
        # The roles' SQL runs on every run, so Postgres 17 checks it before slice 4.
        code, out = self.step("db-bootstrap")
        self.assertEqual(code, 0)
        self.assertIn("db/bootstrap.sql", out)
        self.assertEqual(self.shell.commands,
                         [["psql", ci_steps.ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c",
                           ci_steps.SUPABASE_ROLES_SQL]])

    def test_bootstrap_fails_when_the_roles_fail_while_the_file_is_absent(self):
        shell = FakeShell(codes={ci_steps.SUPABASE_ROLES_SQL: 3})
        self.assertEqual(self.step("db-bootstrap", shell=shell)[0], 3)

    def test_bootstrap_fails_when_absent_from_slice_12(self):
        self.assertEqual(self.step("db-bootstrap", require=True)[0], 1)

    def test_bootstrap_makes_supabase_s_roles_then_runs_the_file(self):
        self.repo.write("db/bootstrap.sql", "select 1;")
        code, _ = self.step("db-bootstrap")
        self.assertEqual(code, 0)
        roles, bootstrap = self.shell.commands
        sql = roles[-1]
        for role in ["anon", "authenticated", "service_role"]:
            self.assertIn(f"CREATE ROLE {role} NOLOGIN NOINHERIT", sql)
        self.assertIn("service_role NOLOGIN NOINHERIT BYPASSRLS", sql)
        self.assertEqual(bootstrap, ["psql", ci_steps.ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-v",
                                     f"app_password={ci_steps.APP_PASSWORD}", "-f",
                                     "db/bootstrap.sql"])

    def test_bootstrap_stops_when_the_roles_fail(self):
        self.repo.write("db/bootstrap.sql", "select 1;")
        shell = FakeShell(codes={ci_steps.SUPABASE_ROLES_SQL: 3})
        self.assertEqual(self.step("db-bootstrap", shell=shell)[0], 3)
        self.assertEqual(len(shell.commands), 1)


@unittest.skipUnless(shutil.which("psql") and os.environ.get("CI_STEPS_LIVE_POSTGRES") == "1",
                     "opt-in: set CI_STEPS_LIVE_POSTGRES=1 with a server at ci_steps.ADMIN_URL")
class SupabaseRolesLiveTest(unittest.TestCase):
    """Opt-in, for a session's local server: runs the roles' SQL twice, to show it can run again
    on a server that already has the roles, and reads the roles' attributes back. `ci` runs the
    SQL once per run, on a fresh Postgres 17 service, in db-bootstrap."""

    def test_roles_sql_is_valid_repeatable_and_makes_supabase_s_roles(self):
        for _ in range(2):
            result = subprocess.run(["psql", ci_steps.ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c",
                                     ci_steps.SUPABASE_ROLES_SQL], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run(
            ["psql", ci_steps.ADMIN_URL, "-tA", "-F", " ", "-c",
             "SELECT rolname, rolcanlogin, rolinherit, rolbypassrls, rolsuper FROM pg_roles "
             "WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname"],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.split("\n")[:3],
                         ["anon f f f f", "authenticated f f f f", "service_role f f t f"])


class SwiftStepTest(StepsTest):
    def test_passes_empty_while_no_package_exists(self):
        code, out = self.step("swift")
        self.assertEqual(code, 0)
        self.assertIn("TadayoCore/Package.swift", out)
        self.assertEqual(self.shell.commands, [])

    def test_fails_when_absent_from_slice_12(self):
        self.assertEqual(self.step("swift", require=True)[0], 1)

    def test_runs_each_package_present_in_the_pinned_image(self):
        self.repo.write("packages/swift/TadayoCore/Package.swift", "// swift-tools-version:6.0")
        self.repo.write("packages/swift/TadayoDesign/Package.swift", "// SwiftUI: ios only")
        code, _ = self.step("swift")
        self.assertEqual(code, 0)
        self.assertEqual(self.shell.commands, [
            ["docker", "run", "--rm", "-v", f"{self.repo.root}:/work", "-w", "/work",
             toolchain.SWIFT_IMAGE, "swift", "test", "--package-path",
             "packages/swift/TadayoCore"]])

    def test_a_failing_package_fails_the_step(self):
        self.repo.write("packages/swift/TadayoAPI/Package.swift", "// swift-tools-version:6.0")
        shell = FakeShell(codes={"packages/swift/TadayoAPI": 1})
        self.assertEqual(self.step("swift", shell=shell)[0], 1)

    def test_a_failing_first_package_fails_the_step_and_the_second_still_runs(self):
        for package in ci_steps.SWIFT_PACKAGES:
            self.repo.write(f"{package}/Package.swift", "// swift-tools-version:6.0")
        shell = FakeShell(codes={"packages/swift/TadayoCore": 1})
        self.assertEqual(self.step("swift", shell=shell)[0], 1)
        self.assertEqual([c[-1] for c in shell.commands], ci_steps.SWIFT_PACKAGES)

    def test_the_image_is_pinned_by_digest_to_the_pinned_version(self):
        self.assertRegex(toolchain.SWIFT_IMAGE,
                         rf"^swift:{toolchain.SWIFT_VERSION}-noble@sha256:[0-9a-f]{{64}}$")


class ToolsTestsStepTest(StepsTest):
    def test_runs_every_test_file_through_unittest_and_fails_if_one_fails(self):
        self.repo.write("tools/ci/a_test.py", "")
        self.repo.write("tools/ci/b_test.py", "")
        self.repo.write("tools/ci/helper.py", "")
        shell = FakeShell(codes={"tools/ci/b_test.py": 1})
        code, out = self.step("tools-tests", shell=shell)
        self.assertEqual(code, 1)
        self.assertEqual(shell.commands, [[sys.executable, "-m", "unittest", "tools/ci/a_test.py"],
                                          [sys.executable, "-m", "unittest", "tools/ci/b_test.py"]])
        self.assertIn("b_test.py failed", out)

    def test_no_tests_is_a_failure(self):
        self.assertEqual(self.step("tools-tests")[0], 1)

    def run_real(self, text):
        self.repo.write("tools/ci/c_test.py", text)
        return self.step("tools-tests", shell=ci_steps.Shell(self.repo.root))

    def test_a_file_that_runs_no_test_fails(self):
        # pytest-style functions, or a TestCase file without unittest.main(), run nothing when
        # run as a script, and exit 0.
        code, out = self.run_real("def test_x():\n    assert False\n")
        self.assertEqual(code, 1, out)
        self.assertIn("c_test.py failed", out)

    def test_a_test_case_without_unittest_main_still_runs(self):
        code, out = self.run_real("import unittest\n\nclass T(unittest.TestCase):\n"
                                  "    def test_x(self):\n        self.fail()\n")
        self.assertEqual(code, 1, out)
        code, out = self.run_real("import unittest\n\nclass T(unittest.TestCase):\n"
                                  "    def test_x(self):\n        pass\n")
        self.assertEqual(code, 0, out)


class GuardsStepTest(StepsTest):
    GUARDS = [["tools/ci/ci_config_guard.py"], ["tools/ci/journal_check.py", "--branch"],
              ["tools/ci/ci_steps.py", "ratchet"]]

    def test_all_three_run_off_main(self):
        for branch in ["api/b0-ci", "api/b0-main"]:
            with self.subTest(branch=branch):
                shell = FakeShell()
                code, _ = self.step("guards", environ={"GITHUB_REF_NAME": branch}, shell=shell)
                self.assertEqual(code, 0)
                self.assertEqual([c[1:] for c in shell.commands], self.GUARDS)

    def test_any_failing_fails_the_step_and_all_still_run(self):
        for failing in ["tools/ci/ci_config_guard.py", "--branch", "ratchet"]:
            with self.subTest(failing=failing):
                shell = FakeShell(codes={failing: 1})
                code, _ = self.step("guards", environ={"GITHUB_REF_NAME": "x"}, shell=shell)
                self.assertEqual(code, 1)
                self.assertEqual(len(shell.commands), 3)

    def test_skipped_on_main(self):
        code, out = self.step("guards", environ={"GITHUB_REF_NAME": "main"})
        self.assertEqual(code, 0)
        self.assertIn("skipped on main", out)
        self.assertEqual(self.shell.commands, [])

    def test_falls_back_to_git_s_branch(self):
        shell = FakeShell(outputs={"git": (0, "main\n")})
        code, out = self.step("guards", shell=shell)
        self.assertEqual(code, 0)
        self.assertIn("skipped on main", out)


class Clone:
    """A scratch clone with an origin/main holding slice 1's targets, on a branch `feature`."""

    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="ci-ratchet-test-")
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_", "GITHUB_"))}
        self.env.update(GIT_AUTHOR_NAME="Claude", GIT_AUTHOR_EMAIL="noreply@anthropic.com",
                        GIT_COMMITTER_NAME="Claude", GIT_COMMITTER_EMAIL="noreply@anthropic.com",
                        GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", GIT_EDITOR="true")
        self.origin = os.path.join(self.root, "origin.git")
        self.work = os.path.join(self.root, "work")
        self.git("init", "-q", "--bare", "-b", "main", self.origin, cwd=self.root)
        self.git("clone", "-q", self.origin, self.work, cwd=self.root)
        self.write("pnpm-workspace.yaml", "packages:\n  - packages/*\n  - tests\n")
        self.package("packages/domain", test="vitest run")
        self.package("tests")
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

    def package(self, directory, **scripts):
        self.write(f"{directory}/package.json", json.dumps({"name": directory, "scripts": scripts}))

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", "change")

    def to_main(self, change):
        """Lands a change on origin/main, as another PR's merge would, and comes back."""
        self.git("checkout", "-q", "main")
        self.git("pull", "-q", "--ff-only", "origin", "main")
        change()
        self.commit()
        self.git("push", "-q", "origin", "HEAD:main")
        self.git("checkout", "-q", "feature")
        self.git("fetch", "-q", "origin")

    def ratchet(self):
        old = dict(os.environ)
        os.environ.clear()
        os.environ.update(self.env)
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = ci_steps.Steps(self.work, ci_steps.Shell(self.work), environ={}).ratchet()
        finally:
            os.environ.clear()
            os.environ.update(old)
        return code, out.getvalue()

    def close(self):
        shutil.rmtree(self.root, ignore_errors=True)


class RatchetTest(unittest.TestCase):
    def setUp(self):
        self.clone = Clone()

    def tearDown(self):
        self.clone.close()

    def assertPasses(self):
        code, out = self.clone.ratchet()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.clone.git("worktree", "list").count("\n"), 1, "a worktree was left")

    def assertFails(self, *named):
        code, out = self.clone.ratchet()
        self.assertEqual(code, 1, out)
        for text in named:
            self.assertIn(text, out)

    def test_an_unchanged_branch_passes(self):
        self.assertPasses()

    def test_renaming_the_only_test_script_fails(self):
        # The review's case: `unit` would pass empty while every domain test stopped running.
        self.clone.package("packages/domain", **{"test:unit": "vitest run"})
        self.clone.commit()
        self.assertFails("`unit`", "test")

    def test_dropping_the_package_from_the_workspace_fails(self):
        self.clone.write("pnpm-workspace.yaml", "packages:\n  - tests\n")
        self.clone.commit()
        self.assertFails("`unit`")

    def test_moving_a_script_to_another_package_passes(self):
        self.clone.package("packages/domain")
        self.clone.package("tests", test="vitest run")
        self.clone.commit()
        self.assertPasses()

    def test_a_new_target_passes(self):
        self.clone.write("db/bootstrap.sql", "select 1;\n")
        self.clone.package("tests", **{"test:db": "vitest run"})
        self.clone.commit()
        self.assertPasses()

    def test_removing_a_file_target_fails(self):
        for path, step in [("db/bootstrap.sql", "db-bootstrap"),
                           ("packages/swift/TadayoAPI/Package.swift", "swift")]:
            with self.subTest(path=path):
                self.clone.to_main(lambda: self.clone.write(path, "x\n"))
                self.clone.git("merge", "-q", "--no-edit", "origin/main")
                self.assertPasses()
                self.clone.git("rm", "-q", path)
                self.clone.commit()
                self.assertFails(f"`{step}`", path)
                self.clone.write(path, "x\n")
                self.clone.commit()

    def test_a_target_main_gained_after_the_branch_left_doesn_t_count(self):
        # The comparison is with where the branch left main, not with main's head.
        self.clone.to_main(lambda: self.clone.write("db/bootstrap.sql", "select 1;\n"))
        self.assertPasses()

    def test_an_unreadable_workspace_fails(self):
        self.clone.write("pnpm-workspace.yaml", "packages:\n  - 'packages/**'\n")
        self.clone.commit()
        self.assertFails("can't read the targets")

    def test_missing_origin_main_fails(self):
        self.clone.git("update-ref", "-d", "refs/remotes/origin/main")
        self.assertFails("origin/main")


class WorkflowTest(unittest.TestCase):
    """The final `ci` job judges only the jobs it needs, so it must need every other job."""

    def test_the_ci_job_needs_every_other_job_and_always_runs(self):
        path = os.path.join(os.path.dirname(os.path.dirname(HERE)), ".github", "workflows",
                            "ci.yml")
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        self.assertIn("jobs:", lines, "ci.yml has no top-level `jobs:`")
        jobs, current, needs, always = [], None, None, False
        for line in lines[lines.index("jobs:") + 1:]:
            if line and not line.startswith(" ") and not line.startswith("#"):
                break  # the next top-level key
            job = re.match(r"^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$", line)
            if job:
                current = job.group(1)
                jobs.append(current)
            elif current == "ci" and line.startswith("    needs:"):
                listed = re.match(r"^    needs: \[([A-Za-z0-9_, -]*)\]\s*$", line)
                self.assertIsNotNone(listed, f"can't read the ci job's needs: {line!r}")
                needs = [n.strip() for n in listed.group(1).split(",") if n.strip()]
            elif current == "ci" and line.strip() == "if: always()":
                always = True
        self.assertIn("ci", jobs, "ci.yml has no `ci` job")
        self.assertIsNotNone(needs, "the ci job has no `needs: [...]` line")
        self.assertEqual(sorted(needs), sorted(j for j in jobs if j != "ci"))
        self.assertEqual(len(needs), len(set(needs)))
        self.assertTrue(always, "the ci job doesn't have `if: always()`")


class VerdictStepTest(StepsTest):
    def verdict(self, needs):
        return self.step("verdict", environ={"NEEDS": json.dumps(needs) if needs is not None else ""})

    def test_every_job_succeeded(self):
        code, _ = self.verdict({"node": {"result": "success", "outputs": {}},
                                "swift": {"result": "success", "outputs": {}}})
        self.assertEqual(code, 0)

    def test_any_other_result_fails(self):
        for result in ["failure", "cancelled", "skipped", None]:
            with self.subTest(result=result):
                code, out = self.verdict({"node": {"result": "success"}, "swift": {"result": result}})
                self.assertEqual(code, 1)
                self.assertIn("swift", out)

    def test_no_jobs_or_bad_input_fails(self):
        for needs in [{}, None, [], "success"]:
            with self.subTest(needs=needs):
                self.assertEqual(self.verdict(needs)[0], 1)

    def test_a_job_without_its_record_fails(self):
        self.assertEqual(self.verdict({"node": None})[0], 1)


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(ci_steps.main(["ci_steps.py", "deploy"]), 2)
        self.assertIn("steps:", out.getvalue())

    def test_slice_12_has_not_turned_targets_on_yet(self):
        # Until slice 12, a step whose target hasn't arrived passes empty (the B0 plan, slice 2).
        self.assertFalse(ci_steps.REQUIRE_TARGETS)


if __name__ == "__main__":
    unittest.main()
