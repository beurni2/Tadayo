#!/usr/bin/env python3
"""Tests for tools/ci/ci_steps.py. Run: python3 tools/ci/ci_steps_test.py

Each test builds a scratch repository with only the files a step looks for, and runs the step
with a fake shell that records the commands instead of running them.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import io
import json
import os
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
        for step, script in self.CASES:
            with self.subTest(step=step):
                self.repo.package("packages/contracts", **{script: "true"})
                shell = FakeShell()
                code, out = self.step(step, shell=shell)
                self.assertEqual(code, 0)
                self.assertEqual(shell.commands, [["pnpm", "-r", "--if-present", "run", script]])
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

    def test_bootstrap_passes_empty_while_absent(self):
        code, out = self.step("db-bootstrap")
        self.assertEqual(code, 0)
        self.assertIn("db/bootstrap.sql", out)
        self.assertEqual(self.shell.commands, [])

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


@unittest.skipUnless(shutil.which("psql") and shutil.which("pg_ctlcluster")
                     and os.environ.get("CI_STEPS_LIVE_POSTGRES") == "1",
                     "set CI_STEPS_LIVE_POSTGRES=1 with a local server as in ci.yml to run")
class SupabaseRolesLiveTest(unittest.TestCase):
    """Runs the roles' SQL against a real server, twice, as `ci` does when it re-runs."""

    def test_roles_sql_is_valid_and_repeatable(self):
        for _ in range(2):
            result = subprocess.run(["psql", ci_steps.ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c",
                                     ci_steps.SUPABASE_ROLES_SQL], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


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

    def test_the_image_is_pinned_by_digest_to_the_pinned_version(self):
        self.assertRegex(toolchain.SWIFT_IMAGE,
                         rf"^swift:{toolchain.SWIFT_VERSION}-noble@sha256:[0-9a-f]{{64}}$")


class ToolsTestsStepTest(StepsTest):
    def test_runs_every_test_file_and_fails_if_one_fails(self):
        self.repo.write("tools/ci/a_test.py", "")
        self.repo.write("tools/ci/b_test.py", "")
        self.repo.write("tools/ci/helper.py", "")
        shell = FakeShell(codes={"tools/ci/b_test.py": 1})
        code, out = self.step("tools-tests", shell=shell)
        self.assertEqual(code, 1)
        self.assertEqual([c[-1] for c in shell.commands], ["tools/ci/a_test.py", "tools/ci/b_test.py"])
        self.assertIn("b_test.py failed", out)

    def test_no_tests_is_a_failure(self):
        self.assertEqual(self.step("tools-tests")[0], 1)


class GuardsStepTest(StepsTest):
    def test_both_guards_run_off_main(self):
        code, _ = self.step("guards", environ={"GITHUB_REF_NAME": "api/b0-ci"})
        self.assertEqual(code, 0)
        self.assertEqual([c[1:] for c in self.shell.commands],
                         [["tools/ci/ci_config_guard.py"], ["tools/ci/journal_check.py", "--branch"]])

    def test_either_guard_failing_fails_the_step_and_both_still_run(self):
        for failing in ["tools/ci/ci_config_guard.py", "--branch"]:
            with self.subTest(failing=failing):
                shell = FakeShell(codes={failing: 1})
                code, _ = self.step("guards", environ={"GITHUB_REF_NAME": "x"}, shell=shell)
                self.assertEqual(code, 1)
                self.assertEqual(len(shell.commands), 2)

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
