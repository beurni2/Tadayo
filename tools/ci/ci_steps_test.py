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
from unittest import mock

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
    def __init__(self, parent=None):
        self.top = tempfile.mkdtemp(prefix="ci-steps-")
        self.root = os.path.join(self.top, parent) if parent else self.top
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
        shutil.rmtree(self.top, ignore_errors=True)


class QuietShell(ci_steps.Shell):
    """A real shell whose commands print nothing, so a test's own runs don't fill CI's log."""

    def run(self, cmd, env=None):
        return subprocess.run(cmd, cwd=self.root, env=self._env(env), stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL).returncode


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

    def test_a_root_holding_glob_characters_is_read_as_a_path(self):
        # glob reads `[x]` as a character class; the root mustn't be read as a pattern.
        repo = Repo(parent="odd [x] *")
        try:
            steps = ci_steps.Steps(repo.root, self.shell, environ={})
            self.assertEqual(steps.workspace_packages(),
                             ["apps/web", "packages/contracts", "packages/domain", "services/api",
                              "tests"])
        finally:
            repo.close()

    def test_a_matched_directory_without_package_json_is_left_out(self):
        # packages/* matches packages/swift, which holds Swift packages, not a pnpm package.
        self.repo.write("packages/swift/TadayoCore/Package.swift", "// swift-tools-version:6.0")
        steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
        self.assertNotIn("packages/swift", steps.workspace_packages())


class PnpmSettingsTest(StepsTest):
    # The privacy and security review's case: one pnpm setting, or a pnpmfile, could make every
    # pnpm script report success without running, outside guard 1's paths.
    PNPM_STEPS = ["install", "lint", "typecheck", "format", "copy-lint", "openapi", "unit", "web",
                  "db-tests", "privacy"]

    def setUp(self):
        super().setUp()
        self.repo.package("tests", **{script: "true" for script in
                                      ["openapi:check", "test", "build", "test:db",
                                       "test:privacy"]})

    def assertEveryPnpmStepRefuses(self, *named):
        for step in self.PNPM_STEPS:
            with self.subTest(step=step):
                shell = FakeShell()
                code, out = self.step(step, shell=shell)
                self.assertEqual(code, 1, out)
                self.assertEqual(shell.commands, [])
                for text in named:
                    self.assertIn(text, out)

    def test_the_workspace_s_own_settings_run_the_steps(self):
        for step in self.PNPM_STEPS:
            with self.subTest(step=step):
                shell = FakeShell()
                self.assertEqual(self.step(step, shell=shell)[0], 0)
                self.assertEqual(len(shell.commands), 1)

    def test_a_setting_not_listed_is_refused(self):
        for setting in ["scriptShell: /bin/true", "nodeOptions: --require ./x.cjs",
                        "pnpmfile: x.cjs", "ignoreScripts: true", "other:\n  - not/a/package"]:
            with self.subTest(setting=setting):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + setting + "\n")
                name = setting.split(":")[0]
                self.assertEveryPnpmStepRefuses(f"the setting `{name}`", "PNPM_SETTINGS")

    def test_a_line_that_isn_t_a_plain_setting_is_refused(self):
        for line in ['"scriptShell": /bin/true', "{scriptShell: /bin/true}", "---",
                     "packages: [apps/web]", "<<: *x"]:
            with self.subTest(line=line):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + line + "\n")
                self.assertEveryPnpmStepRefuses("pnpm-workspace.yaml")

    def test_allow_builds_may_deny_a_dependency_s_build_script(self):
        # pnpm 12's strictDepBuilds fails an install on a build script nobody has ruled on, and
        # Prism's @scarf/scarf has one: the workspace denies it, and the steps run.
        denials = ("allowBuilds:   # denied, so they never run\n"
                   '  "@scarf/scarf": false\n'
                   "  '@x/quoted': false  # a comment\n"
                   "  core-js: false\n"
                   "  nx@21.6.0 || 21.6.1: false\n"
                   "\n"
                   "  esbuild : false\n")
        for text in [WORKSPACE + denials, denials + WORKSPACE]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", text)
                self.test_the_workspace_s_own_settings_run_the_steps()
                steps = ci_steps.Steps(self.repo.root, self.shell, environ={})
                self.assertEqual(steps.workspace_packages(),
                                 ["apps/web", "packages/contracts", "packages/domain",
                                  "services/api", "tests"])

    def test_allow_builds_that_could_let_a_build_script_run_is_refused(self):
        # Anything but a plain `false` might run the script: YAML 1.2 reads `no` and `"false"` as
        # strings, and `False` or a tag is left to pnpm's parser. Approving a build is a
        # CI-configuration PR (T58).
        for entry in ["esbuild: true", "esbuild: True", "esbuild: False", "esbuild: no",
                      'esbuild: "false"', "esbuild: !!bool false", "esbuild: {}",
                      "esbuild:false", "esbuild: false extra", "esbuild: false\n    x: true",
                      '"a b": false', "'a b': false", "&a esbuild: false", "*a: false", "<<: false", "<<: *x",
                      "!!str esbuild: false", "? esbuild: false", "? esbuild\n  : false",
                      "esbuild:", "- esbuild", "${PKG}: false", "pkg${X}: false", "esbuild: ${ALLOW}",
                      "esbuild: set this to true or false"]:
            with self.subTest(entry=entry):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + "allowBuilds:\n  " + entry + "\n")
                self.assertEveryPnpmStepRefuses("allowBuilds may only deny", "(T58)")
        for text in ["allowBuilds: {esbuild: false}\n", "allowBuilds: false\n",
                     "allowBuilds: true\n"]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + text)
                self.assertEveryPnpmStepRefuses("can't read the line")

    def test_an_entry_outside_the_packages_list_is_refused(self):
        self.repo.write("pnpm-workspace.yaml", "  - packages/stray\n" + WORKSPACE)
        self.assertEveryPnpmStepRefuses("can't read the line")

    def test_a_root_pnpmfile_is_refused(self):
        for name in [".pnpmfile.cjs", ".pnpmfile.mjs"]:
            with self.subTest(name=name):
                self.repo.write(name, "module.exports = {}\n")
                self.assertEveryPnpmStepRefuses(name, "pnpmfile")
                os.remove(os.path.join(self.repo.root, name))


class TargetsTest(unittest.TestCase):
    def test_every_target_belongs_to_a_step_and_the_package_steps_are_all_listed(self):
        for step, kind, _, _ in ci_steps.TARGETS:
            self.assertIn(step, ci_steps.STEPS)
            self.assertIn(kind, {"script", "file"})
        self.assertEqual({s for s, kind, _, _ in ci_steps.TARGETS if kind == "script"},
                         {"openapi", "unit", "web", "db-tests", "privacy"})

    def test_nothing_is_retired_yet(self):
        self.assertEqual(ci_steps.RETIRED_TARGETS, set())

    def test_the_package_steps_look_for_the_documented_scripts(self):
        # The scripts later slices build to (the docstring's table): pinned here by name, and
        # tied to TARGETS, which the steps and the ratchet both read.
        self.assertEqual(PackageScriptStepsTest.CASES,
                         [(s, t) for s, kind, t, _ in ci_steps.TARGETS if kind == "script"])


class PackageScriptStepsTest(StepsTest):
    # The documented scripts, by name; TargetsTest ties them to TARGETS.
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

    # db-bootstrap asks `postgres` whether it is a superuser; "f" is Postgres's no.
    NOT_SUPER = {"psql": (0, "f\n")}

    def bootstrap(self, codes=None, outputs=None, require=False):
        shell = FakeShell(codes=codes, outputs=self.NOT_SUPER if outputs is None else outputs)
        code, out = self.step("db-bootstrap", require=require, shell=shell)
        return code, out, shell.commands

    def test_the_urls(self):
        # ADR-026: the superuser is supabase_admin; the file runs as Supabase's `postgres`.
        self.assertTrue(ci_steps.ADMIN_URL.startswith("postgresql://supabase_admin:"))
        self.assertTrue(ci_steps.BOOTSTRAP_URL.startswith("postgresql://postgres:"))
        self.assertTrue(ci_steps.APP_URL.startswith("postgresql://tadayo_app:"))

    def test_supabase_sql_makes_the_roles_as_supabase_s_image_has_them(self):
        sql = " ".join(ci_steps.SUPABASE_SQL.split())
        for line in ["CREATE ROLE anon NOLOGIN INHERIT;",
                     "CREATE ROLE authenticated NOLOGIN INHERIT;",
                     "CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS;",
                     "CREATE ROLE postgres NOSUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION "
                     "BYPASSRLS PASSWORD 'postgres';",
                     "ALTER DATABASE postgres OWNER TO postgres;",
                     "GRANT ALL ON DATABASE postgres TO postgres;",
                     "GRANT anon, authenticated, service_role, pg_monitor, pg_read_all_data, "
                     "pg_signal_backend TO postgres WITH ADMIN OPTION;"]:
            self.assertIn(line, sql)
        # A plain CREATE ROLE, so a role already there (a server's first role) fails the step.
        self.assertNotIn("IF NOT EXISTS", sql.upper())

    def test_bootstrap_makes_the_roles_checks_postgres_and_passes_while_the_file_is_absent(self):
        # On every run, so Postgres 17 runs this before slice 4.
        code, out, commands = self.bootstrap()
        self.assertEqual(code, 0, out)
        self.assertIn("db/bootstrap.sql", out)
        self.assertEqual(commands, [
            ["psql", ci_steps.ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", ci_steps.SUPABASE_SQL],
            ["psql", ci_steps.BOOTSTRAP_URL, "-v", "ON_ERROR_STOP=1", "-tAc",
             ci_steps.NOT_SUPERUSER_SQL]])

    def test_bootstrap_fails_when_the_roles_fail(self):
        for present in [False, True]:
            with self.subTest(file_present=present):
                if present:
                    self.repo.write("db/bootstrap.sql", "select 1;")
                code, _, commands = self.bootstrap(codes={ci_steps.SUPABASE_SQL: 3})
                self.assertEqual(code, 3)
                self.assertEqual(len(commands), 1)

    def test_bootstrap_refuses_a_superuser_postgres_or_no_answer(self):
        # A service whose first role is `postgres` would run the file as a superuser (ADR-026).
        self.repo.write("db/bootstrap.sql", "select 1;")
        for answer in [(0, "t\n"), (0, ""), (2, "connection refused")]:
            with self.subTest(answer=answer):
                code, out, commands = self.bootstrap(outputs={"psql": answer})
                self.assertEqual(code, 1)
                self.assertIn("superuser", out)
                self.assertEqual(len(commands), 2)

    def test_bootstrap_fails_when_absent_from_slice_12(self):
        self.assertEqual(self.bootstrap(require=True)[0], 1)

    def test_bootstrap_runs_the_file_as_postgres(self):
        self.repo.write("db/bootstrap.sql", "select 1;")
        code, _, commands = self.bootstrap()
        self.assertEqual(code, 0)
        self.assertEqual(commands[-1], ["psql", ci_steps.BOOTSTRAP_URL, "-v", "ON_ERROR_STOP=1",
                                        "-v", f"app_password={ci_steps.APP_PASSWORD}", "-f",
                                        "db/bootstrap.sql"])
        self.assertEqual(len(commands), 3)

    def test_a_failing_file_fails_the_step(self):
        self.repo.write("db/bootstrap.sql", "select 1;")
        self.assertEqual(self.bootstrap(codes={"db/bootstrap.sql": 1})[0], 1)


LIVE = os.environ.get("CI_STEPS_LIVE_POSTGRES") == "1" and shutil.which("psql")


@unittest.skipUnless(LIVE, "opt-in: set CI_STEPS_LIVE_POSTGRES=1 with a server made like ci's "
                           "at ci_steps.ADMIN_URL (docs/JOURNAL.md section 1.1)")
class SupabaseSqlLiveTest(unittest.TestCase):
    """Opt-in, for a server made like ci's service (`initdb --username=supabase_admin`): runs
    SUPABASE_SQL in a transaction it rolls back, so the server is left as it was. `ci` runs it
    for real in db-bootstrap, on a fresh Postgres 17 service, on every run."""

    CHECKS = """
SELECT rolname, rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb,
       rolreplication
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
  ORDER BY rolname;
SELECT 'owner', pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'postgres';
SELECT 'admin of', r.rolname, m.admin_option FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.roleid
  WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'postgres') ORDER BY r.rolname;
"""

    def psql(self, script):
        return subprocess.run(["psql", ci_steps.ADMIN_URL, "-q", "-tA", "-F", " ", "-v",
                               "ON_ERROR_STOP=1", "-f", "-"], input=script, capture_output=True,
                              text=True)

    def test_supabase_sql_makes_supabase_s_roles_and_postgres(self):
        result = self.psql("BEGIN;\n" + ci_steps.SUPABASE_SQL + self.CHECKS + "ROLLBACK;\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.split(), " ".join([
            "anon f t f f f f f", "authenticated f t f f f f f", "postgres t t t f t t t",
            "service_role f t t f f f f", "owner postgres",
            "admin of anon t", "admin of authenticated t", "admin of pg_monitor t",
            "admin of pg_read_all_data t", "admin of pg_signal_backend t",
            "admin of service_role t"]).split())

    def test_postgres_can_t_give_a_new_role_a_schema_without_a_grant(self):
        # Why ADR-026 exists: on 16 and later, Supabase's `postgres` can't run this as written,
        # where a superuser can.
        result = self.psql("BEGIN;\n" + ci_steps.SUPABASE_SQL + "SET ROLE postgres;\n"
                           "CREATE ROLE live_test_app LOGIN;\n"
                           "CREATE SCHEMA live_test AUTHORIZATION live_test_app;\nROLLBACK;\n")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("must be able to SET ROLE", result.stderr)


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
        shell = FakeShell(codes={"b_test.py": 1})
        code, out = self.step("tools-tests", shell=shell)
        self.assertEqual(code, 1)
        isolated = [sys.executable, "-I", "-m", "unittest", "discover", "-s", "tools/ci", "-t",
                    "tools/ci", "-p"]
        self.assertEqual(shell.commands, [isolated + ["a_test.py"], isolated + ["b_test.py"]])
        self.assertIn("tools/ci/b_test.py failed", out)

    def test_no_tests_is_a_failure(self):
        self.assertEqual(self.step("tools-tests")[0], 1)

    def run_real(self, text):
        self.repo.write("tools/ci/c_test.py", text)
        return self.step("tools-tests", shell=QuietShell(self.repo.root))

    def test_a_file_that_runs_no_test_fails(self):
        # pytest-style functions, or a TestCase file without unittest.main(), run nothing when
        # run as a script, and exit 0.
        code, out = self.run_real("def test_x():\n    assert False\n")
        self.assertEqual(code, 1, out)
        self.assertIn("c_test.py failed", out)

    def test_nothing_outside_tools_ci_can_stand_in_for_the_tests(self):
        # The privacy and security review's case: with the root on the path, a root unittest.py
        # or a tools/__init__.py (outside guard 1's paths) ran instead of the tests.
        self.repo.write("unittest.py", "import sys\nsys.exit(0)\n")
        self.repo.write("tools/__init__.py", "import sys\nsys.exit(0)\n")
        code, out = self.run_real("import unittest\n\nclass T(unittest.TestCase):\n"
                                  "    def test_x(self):\n        self.fail()\n")
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

    def package(self, directory, name=None, **scripts):
        self.write(f"{directory}/package.json",
                   json.dumps({"name": name or f"@tadayo/{os.path.basename(directory)}",
                               "scripts": scripts}))

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
        # The first review's case: `unit` would pass empty while every domain test stopped.
        self.clone.package("packages/domain", **{"test:unit": "vitest run"})
        self.clone.commit()
        self.assertFails("@tadayo/domain's `test` script (the `unit` step)", "RETIRED_TARGETS")

    def test_one_package_losing_a_script_another_keeps_fails(self):
        # The second review's case: `unit` still runs, but no longer runs domain's tests.
        self.clone.to_main(lambda: self.clone.package("tests", test="vitest run"))
        self.clone.git("merge", "-q", "--no-edit", "origin/main")
        self.assertPasses()
        self.clone.package("packages/domain", **{"test:unit": "vitest run"})
        self.clone.commit()
        self.assertFails("@tadayo/domain's `test` script")

    def test_dropping_the_package_from_the_workspace_fails(self):
        self.clone.write("pnpm-workspace.yaml", "packages:\n  - tests\n")
        self.clone.commit()
        self.assertFails("@tadayo/domain's `test` script")

    def test_moving_a_script_to_another_package_fails_unless_retired(self):
        self.clone.package("packages/domain")
        self.clone.package("tests", test="vitest run")
        self.clone.commit()
        self.assertFails("@tadayo/domain's `test` script")
        with mock.patch.object(ci_steps, "RETIRED_TARGETS", {("unit", "@tadayo/domain", "test")}):
            self.assertPasses()

    def test_moving_a_package_s_directory_keeps_its_targets(self):
        # A script counts by the package's name, not its directory.
        self.clone.git("mv", "packages/domain", "packages/core")
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
                self.assertFails(f"{path} (the `{step}` step)")
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

    def test_two_packages_with_one_name_fail(self):
        # The third review's case: one could lose `test` while the other keeps it, unseen.
        self.clone.package("packages/worker", name="@tadayo/domain", test="vitest run")
        self.clone.commit()
        self.assertFails("can't read the targets",
                         "packages/domain and packages/worker are both named @tadayo/domain")

    def test_a_package_without_a_name_fails(self):
        self.clone.write("packages/nameless/package.json", json.dumps({"scripts": {}}))
        self.clone.commit()
        self.assertFails("can't read the targets", "packages/nameless/package.json has no `name`")

    def test_a_manifest_that_isn_t_an_object_fails(self):
        for text in ["[]", '{"name": "@tadayo/odd", "scripts": []}',
                     '{"name": "@tadayo/odd", "scripts": ["test"]}', "{"]:
            with self.subTest(text=text):
                self.clone.write("packages/odd/package.json", text)
                self.clone.commit()
                self.assertFails("can't read the targets")

    def test_missing_origin_main_fails(self):
        self.clone.git("update-ref", "-d", "refs/remotes/origin/main")
        self.assertFails("origin/main")


def read_ci_job(lines):
    """The job ids under `jobs:`, and the `ci` job's `needs` and job-level `if: always()`."""
    if "jobs:" not in lines:
        raise AssertionError("ci.yml has no top-level `jobs:`")
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
            if not listed:
                raise AssertionError(f"can't read the ci job's needs: {line!r}")
            needs = [n.strip() for n in listed.group(1).split(",") if n.strip()]
        elif current == "ci" and re.match(r"^    if: always\(\)\s*(?:#.*)?$", line):
            always = True  # the job's own key, at the job's indentation, not a step's
    return jobs, needs, always


class WorkflowTest(unittest.TestCase):
    """The final `ci` job judges only the jobs it needs, so it must need every other job, and it
    must run when one of them fails."""

    def ci_yml(self):
        path = os.path.join(os.path.dirname(os.path.dirname(HERE)), ".github", "workflows",
                            "ci.yml")
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_the_ci_job_needs_every_other_job_and_always_runs(self):
        jobs, needs, always = read_ci_job(self.ci_yml().splitlines())
        self.assertIn("ci", jobs, "ci.yml has no `ci` job")
        self.assertIsNotNone(needs, "the ci job has no `needs: [...]` line")
        self.assertEqual(sorted(needs), sorted(j for j in jobs if j != "ci"))
        self.assertEqual(len(needs), len(set(needs)))
        self.assertTrue(always, "the ci job doesn't have `if: always()`")

    def test_a_step_s_if_always_isn_t_the_job_s(self):
        lines = ["jobs:", "  node:", "    runs-on: x", "  ci:", "    needs: [node]", "    steps:",
                 "      - name: note", "        if: always()", "        run: |",
                 "          if: always()"]
        self.assertEqual(read_ci_job(lines), (["node", "ci"], ["node"], False))

    def test_the_postgres_service_is_made_like_supabase_s(self):
        # ADR-026: the service's first role is supabase_admin, ADMIN_URL's user.
        text = self.ci_yml()
        self.assertIn("          POSTGRES_USER: supabase_admin\n", text)
        self.assertIn("          POSTGRES_DB: postgres\n", text)
        self.assertIn('--health-cmd "pg_isready -U supabase_admin"', text)


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
