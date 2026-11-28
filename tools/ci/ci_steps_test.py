#!/usr/bin/env python3
"""Tests for tools/ci/ci_steps.py. Run: python3 tools/ci/ci_steps_test.py

Each test builds a scratch repository with only the files a step looks for, and runs the step
with a fake shell that records the commands instead of running them. The ratchet's and
tools-tests' tests run real git and Python in scratch repositories, and one test reads
.github/workflows/ci.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import base64
import contextlib
import hashlib
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
# What pnpm itself reads in WORKSPACE (`pnpm config get <setting> --json`).
WORKSPACE_READING = {"packages": ["apps/web", "packages/*", "services/api", "tests"]}


def audit_json(counts=None, advisories=()):
    """A report shaped as pnpm 12.16.1's `pnpm audit --json` printed it on 2026-11-28: each
    advisory (severity, GitHub's id, package) keyed by the registry's number, and the counts by
    severity in metadata."""
    vulnerabilities = {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, **(counts or {})}
    return json.dumps({
        "advisories": {str(1115806 + n): {
            "id": 1115806 + n, "github_advisory_id": ghsa, "module_name": module, "severity": severity,
            "title": f"{module} vulnerable to something", "url": f"https://github.com/advisories/{ghsa}",
            "vulnerable_versions": "<1.0.0", "patched_versions": ">=1.0.0", "findings": [], "cwe": []}
            for n, (severity, ghsa, module) in enumerate(advisories)},
        "metadata": {"vulnerabilities": vulnerabilities, "dependencies": 56, "devDependencies": 0,
                     "optionalDependencies": 42, "totalDependencies": 98},
    }, indent=2) + "\n"


CLEAN_AUDIT = audit_json()


class FakeShell:
    def __init__(self, codes=None, outputs=None, pnpm_reading=None):
        self.commands = []
        self.envs = []
        self.codes = codes or {}
        self.outputs = outputs or {}
        # The pnpm steps ask pnpm how it reads pnpm-workspace.yaml: kept apart from `commands`.
        self.queries = []
        self.pnpm_reading = WORKSPACE_READING if pnpm_reading is None else pnpm_reading

    def run(self, cmd, env=None):
        self.commands.append(cmd)
        self.envs.append(env)
        return self.codes.get(cmd[-1], 0) if cmd else 0

    def output(self, cmd, env=None):
        if cmd[:3] == ["pnpm", "config", "get"]:
            self.queries.append(cmd)
            if callable(self.pnpm_reading):
                return self.pnpm_reading(cmd)
            return 0, json.dumps(self.pnpm_reading.get(cmd[3]), indent=2) + "\n"
        self.commands.append(cmd)
        return self.outputs.get(cmd[0], (0, ""))

    def report(self, cmd, timeout):
        # The audit step's reports, by the command's words after `pnpm`: a clean one when not given.
        self.commands.append(cmd)
        self.timeouts = getattr(self, "timeouts", []) + [timeout]
        return self.outputs.get(" ".join(cmd[1:]), (0, CLEAN_AUDIT))


# Stand-ins for pnpm's two tarballs, and a lockfile that pins them as pnpm 12 does: pnpm's own
# document first (`packageManagerDependencies`), the project's second.
TARBALLS = {"pnpm-12.16.1.tgz": b"the wrapper\n", "pnpm-exe.linux-x64-12.16.1.tgz": b"the binary\n"}


def sri(data):
    return "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()


def lockfile(wrapper=TARBALLS["pnpm-12.16.1.tgz"], binary=TARBALLS["pnpm-exe.linux-x64-12.16.1.tgz"]):
    return ("---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    packageManagerDependencies:\n"
            "      pnpm:\n        specifier: 12.16.1\n        version: 12.16.1\n\npackages:\n\n"
            f"  '@pnpm/exe.linux-x64@12.16.1':\n    resolution: {{integrity: {sri(binary)}}}\n"
            "    cpu: [x64]\n    os: [linux]\n\n"
            f"  pnpm@12.16.1:\n    resolution: {{integrity: {sri(wrapper)}}}\n    hasBin: true\n\n"
            "snapshots:\n\n  '@pnpm/exe.linux-x64@12.16.1': {}\n\n  pnpm@12.16.1: {}\n\n"
            "---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n")


class PackingShell(FakeShell):
    """A fake shell whose `npm pack` writes the stand-in tarballs into its --pack-destination."""

    def __init__(self, tarballs=None, **kwargs):
        super().__init__(**kwargs)
        self.tarballs = TARBALLS if tarballs is None else tarballs
        self.folder = None

    def run(self, cmd, env=None):
        code = super().run(cmd, env)
        if cmd[:2] == ["npm", "pack"] and code == 0:
            self.folder = cmd[cmd.index("--pack-destination") + 1]
            for name, data in self.tarballs.items():
                with open(os.path.join(self.folder, name), "wb") as f:
                    f.write(data)
        return code


class Repo:
    def __init__(self, parent=None):
        self.top = tempfile.mkdtemp(prefix="ci-steps-")
        self.root = os.path.join(self.top, parent) if parent else self.top
        self.write("package.json", json.dumps({"packageManager": "pnpm@12.16.1"}))
        self.write("pnpm-lock.yaml", lockfile())
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
    PNPM_STEPS = ["install", "audit", "lint", "typecheck", "format", "copy-lint", "openapi", "unit",
                  "web", "db-tests", "privacy"]

    def setUp(self):
        super().setUp()
        self.repo.package("tests", **{script: "true" for script in
                                      ["openapi:check", "test", "build", "test:db",
                                       "test:privacy"]})

    QUERIES = [["pnpm", "config", "get", "packages", "--json"],
               ["pnpm", "config", "get", "allowBuilds", "--json"]]

    def assertEveryPnpmStepRefuses(self, *named, pnpm_reading=None):
        for step in self.PNPM_STEPS:
            with self.subTest(step=step):
                shell = FakeShell(pnpm_reading=pnpm_reading)
                code, out = self.step(step, shell=shell)
                self.assertEqual(code, 1, out)
                self.assertEqual(shell.commands, [])
                for text in named:
                    self.assertIn(text, out)

    def test_the_workspace_s_own_settings_run_the_steps(self, pnpm_reading=None):
        for step in self.PNPM_STEPS:
            with self.subTest(step=step):
                shell = FakeShell(pnpm_reading=pnpm_reading)
                code, out = self.step(step, shell=shell)
                self.assertEqual(code, 0, out)
                # audit asks pnpm twice: the production dependencies, then the whole tree.
                self.assertEqual(len(shell.commands), 2 if step == "audit" else 1)
                # Each step asked pnpm for its own reading of both settings first.
                self.assertEqual(shell.queries, self.QUERIES)

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
        reading = dict(WORKSPACE_READING, allowBuilds={
            "@scarf/scarf": False, "@x/quoted": False, "core-js": False, "nx@21.6.0 || 21.6.1": False,
            "esbuild": False})
        # Windows line ends read as YAML reads them.
        for text in [WORKSPACE + denials, denials + WORKSPACE, (WORKSPACE + denials).replace("\n", "\r\n")]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", text)
                self.test_the_workspace_s_own_settings_run_the_steps(pnpm_reading=reading)
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
                      "esbuild: set this to true or false",
                      # A double-quoted key's backslash escapes its quote, so YAML's key runs on past
                      # what looks like `: false` and the real value follows it.
                      '"a\\": false #": true', '"a\\\\\\": false #": true', '"dep@file:a\\": false #": true',
                      "'a\\b': false", "'${PKG}': false", '"${PKG}": false', "'{a}': false", '"{a}": false',
                      # YAML reads a `#` straight after a value as part of it.
                      "core-js: false#x", "core-js: false#",
                      # A bare key holds no `:` or `#`, so it can't hide `: true` before a comment.
                      "esbuild: true #: false", "dep@file:../dep: true #: false",
                      # Indented further, a line would continue the one above it.
                      "  esbuild: false", "esbuild: false\n    core-js: false"]:
            with self.subTest(entry=entry):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + "allowBuilds:\n  " + entry + "\n")
                self.assertEveryPnpmStepRefuses("allowBuilds may only deny", "(T58)")
        for text in ["allowBuilds: {esbuild: false}\n", "allowBuilds: false\n",
                     "allowBuilds: true\n"]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + text)
                self.assertEveryPnpmStepRefuses("can't read the line")

    def test_a_workspace_file_with_anything_but_printable_ascii_is_refused(self):
        # Python's splitlines(), strip() and \s treat these as line ends or spaces where pnpm's YAML
        # parser doesn't, so text this check took for a comment or a denial would reach pnpm as
        # something else.
        for entry in ["core-js: false\u2028# hidden: true", "core-js: false\u2029# hidden: true",
                      "core-js: false\x85# hidden: true", "core-js: false\v# hidden: true",
                      "core-js: false\f# hidden: true", "core-js: false\x1c# hidden: true",
                      "core-js:\xa0false", "core-js: false\u3000#x", "core-js:\tfalse",
                      "core-js: false # caf\u00e9"]:
            with self.subTest(entry=entry):
                self.repo.write("pnpm-workspace.yaml", WORKSPACE + "allowBuilds:\n  " + entry + "\n")
                self.assertEveryPnpmStepRefuses("printable ASCII")
        self.repo.write("pnpm-workspace.yaml", "# caf\u00e9\n" + WORKSPACE)
        self.assertEveryPnpmStepRefuses("line 1", "printable ASCII")

    def test_a_packages_entry_yaml_reads_differently_is_refused(self):
        # The second review's cases. YAML reads `tests#x` as one pattern, which matches nothing,
        # so pnpm would leave out a package this check counts and run none of its tests.
        for entry in ["  - tests#x", "  - tests#", "  - 'tests'#x", "  -tests", "- tests", "   - tests",
                      "  -  tests", "  - *a", "  - tests\n    - x", "  - tests\n    x", "  - &a tests",
                      "  - !!str tests", "  - ? tests", "  - tests: x", "  - 'tests", '  - "tests\'']:
            with self.subTest(entry=entry):
                self.repo.write("pnpm-workspace.yaml", "packages:\n  - apps/web\n" + entry + "\n")
                self.assertEveryPnpmStepRefuses("can't read the line")

    def test_a_header_yaml_reads_differently_is_refused(self):
        # YAML reads `packages:#:` as the key `packages:#`, so the real `packages` would be gone.
        for text in ["packages:#:\n  - tests\n", "packages:#\n  - tests\n",
                     WORKSPACE + "allowBuilds:#: {esbuild: true}\n",
                     'allowBuilds:#: &a "**"\n' + WORKSPACE + "  - *a\n"]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", text)
                self.assertEveryPnpmStepRefuses("can't read the line")

    def test_a_setting_or_a_denial_listed_twice_is_refused(self):
        # YAML refuses a key listed twice, or keeps one of the two: either way not this check's
        # reading, even when pnpm's answer would match it.
        packages = ["apps/web", "packages/*", "services/api", "tests"]
        for text, reading, named in [
                (WORKSPACE + "packages:\n  - tools/ops\n", {"packages": packages + ["tools/ops"]},
                 "`packages` is listed twice"),
                (WORKSPACE + "allowBuilds:\n  core-js: false\nallowBuilds:\n  esbuild: false\n",
                 dict(WORKSPACE_READING, allowBuilds={"core-js": False, "esbuild": False}),
                 "`allowBuilds` is listed twice"),
                (WORKSPACE + "allowBuilds:\n  core-js: false\n  'core-js': false\n",
                 dict(WORKSPACE_READING, allowBuilds={"core-js": False}), "lists `core-js` twice")]:
            with self.subTest(text=text):
                self.repo.write("pnpm-workspace.yaml", text)
                self.assertEveryPnpmStepRefuses(named, pnpm_reading=reading)

    def test_a_workspace_pnpm_reads_otherwise_is_refused(self):
        # If pnpm's own reading of either setting differs from this check's, nothing runs.
        for reading in [{"packages": ["apps/web", "packages/*", "services/api", "tests#x"]},
                        {"packages": None}, {},
                        dict(WORKSPACE_READING, allowBuilds={"esbuild": True}),
                        dict(WORKSPACE_READING, allowBuilds={}),
                        lambda cmd: (1, "ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS"),
                        lambda cmd: (0, "[WARN] ignored\n" + json.dumps(WORKSPACE_READING.get(cmd[3])))]:
            with self.subTest(reading=reading):
                self.assertEveryPnpmStepRefuses("pnpm reads pnpm-workspace.yaml's", pnpm_reading=reading)

    def test_an_entry_outside_the_packages_list_is_refused(self):
        self.repo.write("pnpm-workspace.yaml", "  - packages/stray\n" + WORKSPACE)
        self.assertEveryPnpmStepRefuses("can't read the line")

    def test_a_root_pnpmfile_is_refused(self):
        for name in [".pnpmfile.cjs", ".pnpmfile.mjs"]:
            with self.subTest(name=name):
                self.repo.write(name, "module.exports = {}\n")
                self.assertEveryPnpmStepRefuses(name, "pnpmfile")
                os.remove(os.path.join(self.repo.root, name))


def pinned_pnpm():
    """True when the pnpm on PATH is the one package.json pins, so a scratch repo uses it as is."""
    try:
        with open(os.path.join(HERE, "..", "..", "package.json"), encoding="utf-8") as f:
            match = ci_steps.PACKAGE_MANAGER.match(json.load(f).get("packageManager", ""))
        result = subprocess.run(["pnpm", "--version"], capture_output=True, text=True)
    except (OSError, ValueError):
        return False
    return bool(match) and result.returncode == 0 and result.stdout.strip() == match.group(1)


@unittest.skipUnless(pinned_pnpm(), "needs the pinned pnpm on PATH (ci's node job asks it on every run)")
class PnpmReadingLiveTest(unittest.TestCase):
    """The pinned pnpm reads each form this check accepts as the check does, and the files the
    second review built read differently and are refused before pnpm is asked."""

    def setUp(self):
        self.repo = Repo()
        with open(os.path.join(HERE, "..", "..", "package.json"), encoding="utf-8") as f:
            manager = json.load(f)["packageManager"]
        # The pin, so pnpm runs as itself and refuses settings it doesn't know.
        self.repo.write("package.json", json.dumps({"name": "root", "packageManager": manager}))

    def tearDown(self):
        self.repo.close()

    def problem(self, text):
        self.repo.write("pnpm-workspace.yaml", text)
        return ci_steps.Steps(self.repo.root, ci_steps.Shell(self.repo.root), environ={}).pnpm_settings_problem()

    def test_pnpm_reads_the_accepted_forms_as_this_check_does(self):
        denials = ("allowBuilds:   # denied\n"
                   '  "@scarf/scarf": false\n'
                   "  '@x/quoted': false  # a comment\n"
                   "  core-js: false\n"
                   "  nx@21.6.0 || 21.6.1: false\n"
                   "\n"
                   "  esbuild : false\n")
        for text in [WORKSPACE, WORKSPACE + denials, denials + WORKSPACE,
                     (WORKSPACE + denials).replace("\n", "\r\n")]:
            with self.subTest(text=text):
                self.assertIsNone(self.problem(text))

    def test_the_review_s_files_are_refused(self):
        for text in ["packages:\n  - apps/web#x\n  - tests\n", "packages:#:\n  - tests\n",
                     "packages:\n  - apps/web\n    - x\n",
                     'allowBuilds:#: &a "**"\npackages:\n  - tests\n  - *a\n']:
            with self.subTest(text=text):
                self.assertIn("pnpm-workspace.yaml", self.problem(text) or "")


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

    def setup_pnpm(self, shell=None):
        shell = shell or PackingShell()
        with mock.patch("platform.system", return_value="Linux"), \
                mock.patch("platform.machine", return_value="x86_64"):
            code, out = self.step("setup-pnpm", shell=shell)
        return code, out, shell

    def assertPacked(self, shell):
        self.assertEqual(shell.commands[0], ["npm", "pack", "--loglevel=error", "--pack-destination",
                                             shell.folder, "pnpm@12.16.1", "@pnpm/exe.linux-x64@12.16.1"])

    def test_setup_pnpm_installs_both_tarballs_offline_once_checked(self):
        code, out, shell = self.setup_pnpm()
        self.assertEqual(code, 0, out)
        self.assertEqual(len(shell.commands), 2)
        self.assertPacked(shell)
        self.assertEqual(shell.commands[1], [
            "npm", "install", "--global", "--offline",
            os.path.join(shell.folder, "pnpm-12.16.1.tgz"),
            os.path.join(shell.folder, "pnpm-exe.linux-x64-12.16.1.tgz")])
        self.assertFalse(os.path.exists(shell.folder))  # removed after the install

    def test_setup_pnpm_accepts_a_hash(self):
        self.repo.write("package.json", json.dumps({"packageManager": "pnpm@12.16.1+sha512.abc123"}))
        code, out, shell = self.setup_pnpm()
        self.assertEqual(code, 0, out)
        self.assertPacked(shell)

    def test_setup_pnpm_refuses_anything_else(self):
        for manager in ["", "pnpm@latest", "yarn@4.0.0", "pnpm@1.2.3; curl x", "pnpm@12"]:
            with self.subTest(manager=manager):
                self.repo.write("package.json", json.dumps({"packageManager": manager}))
                code, _, shell = self.setup_pnpm()
                self.assertEqual(code, 1)
                self.assertEqual(shell.commands, [])

    def test_setup_pnpm_refuses_a_tarball_the_lockfile_doesnt_pin(self):
        for name in TARBALLS:
            with self.subTest(tarball=name):
                code, out, shell = self.setup_pnpm(PackingShell(dict(TARBALLS, **{name: b"other\n"})))
                self.assertEqual(code, 1)
                self.assertIn("isn't the one pnpm-lock.yaml pins", out)
                self.assertPacked(shell)
                self.assertEqual(len(shell.commands), 1)  # nothing installed
                self.assertFalse(os.path.exists(shell.folder))

    def test_setup_pnpm_refuses_a_tarball_npm_pack_didnt_write(self):
        for name in TARBALLS:
            with self.subTest(tarball=name):
                left = {other: data for other, data in TARBALLS.items() if other != name}
                code, out, shell = self.setup_pnpm(PackingShell(left))
                self.assertEqual(code, 1)
                self.assertIn(f"npm pack wrote no {name}", out)
                self.assertEqual(len(shell.commands), 1)

    def test_setup_pnpm_stops_when_npm_pack_fails(self):
        code, _, shell = self.setup_pnpm(PackingShell(codes={"@pnpm/exe.linux-x64@12.16.1": 3}))
        self.assertEqual(code, 3)
        self.assertEqual(len(shell.commands), 1)

    def test_setup_pnpm_needs_each_integrity_once_in_pnpm_s_own_document(self):
        whole = lockfile()
        pnpm_document, rest = whole.split("\n---\n")
        cases = {
            "no wrapper": whole.replace("  pnpm@12.16.1:\n    resolution", "  pnpm@12.16.0:\n    resolution"),
            "no binary": whole.replace("'@pnpm/exe.linux-x64@12.16.1':\n    resolution",
                                       "'@pnpm/exe.linux-arm64@12.16.1':\n    resolution"),
            "a sha1 integrity": whole.replace(sri(TARBALLS["pnpm-12.16.1.tgz"]), "sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA="),
            "recorded twice": whole.replace("snapshots:", "  pnpm@12.16.1:\n    resolution: {integrity: "
                                            + sri(TARBALLS["pnpm-12.16.1.tgz"]) + "}\n\nsnapshots:"),
            "only in the project's document": pnpm_document.replace("  pnpm@12.16.1:\n    resolution",
                                                                    "  pnpm@12.16.0:\n    resolution")
            + "\n---\n" + rest + "\npackages:\n\n  pnpm@12.16.1:\n    resolution: {integrity: "
            + sri(TARBALLS["pnpm-12.16.1.tgz"]) + "}\n",
        }
        for name, text in cases.items():
            with self.subTest(case=name):
                self.repo.write("pnpm-lock.yaml", text)
                code, out, shell = self.setup_pnpm()
                self.assertEqual(code, 1, out)
                self.assertIn("must record", out)
                self.assertEqual(shell.commands, [])

    def test_the_repository_s_lockfile_pins_both_tarballs_of_its_pnpm(self):
        root = os.path.join(HERE, "..", "..")
        with open(os.path.join(root, "package.json"), encoding="utf-8") as f:
            version = ci_steps.PACKAGE_MANAGER.match(json.load(f)["packageManager"]).group(1)
        with open(os.path.join(root, "pnpm-lock.yaml"), encoding="utf-8") as f:
            digests = ci_steps.pnpm_digests(f.read(), version)
        self.assertEqual(sorted(digests), sorted(ci_steps.PNPM_PACKAGES))
        self.assertTrue(all(len(digest) == 64 for digest in digests.values()))

    def test_setup_pnpm_runs_on_x86_64_linux_alone(self):
        for system, machine in [("Linux", "aarch64"), ("Darwin", "x86_64"), ("Darwin", "arm64")]:
            with self.subTest(platform=(system, machine)):
                shell = PackingShell()
                with mock.patch("platform.system", return_value=system), \
                        mock.patch("platform.machine", return_value=machine):
                    code, out = self.step("setup-pnpm", shell=shell)
                self.assertEqual(code, 1)
                self.assertIn("x86-64 Linux only", out)
                self.assertEqual(shell.commands, [])


class AuditStepTest(StepsTest):
    """pnpm audit (the outside audit's B6): a high or critical advisory in a production dependency
    fails the step; the whole tree's are printed; a report the step can't read fails it."""

    PRODUCTION = "audit --prod --registry=https://registry.npmjs.org/ --json"
    EVERYTHING = "audit --registry=https://registry.npmjs.org/ --json"
    PRODUCTION_CMD = ["pnpm", *PRODUCTION.split()]
    EVERYTHING_CMD = ["pnpm", *EVERYTHING.split()]

    def audit(self, production=None, everything=None):
        outputs = {}
        if production is not None:
            outputs[self.PRODUCTION] = production
        if everything is not None:
            outputs[self.EVERYTHING] = everything
        shell = FakeShell(outputs=outputs)
        code, out = self.step("audit", shell=shell)
        return code, out, shell

    def test_a_clean_report_passes_after_both_audits(self):
        code, out, shell = self.audit()
        self.assertEqual(code, 0, out)
        self.assertEqual(shell.commands, [self.PRODUCTION_CMD, self.EVERYTHING_CMD])
        self.assertEqual(shell.timeouts, [ci_steps.AUDIT_SECONDS] * 2)
        self.assertEqual(out.splitlines(), [
            "ci: audit: the whole tree, dev tools' included, printed and not failed on: "
            "0 critical, 0 high, 0 moderate, 0 low, 0 info",
            "ci: audit: the production dependencies: 0 critical, 0 high, 0 moderate, 0 low, 0 info",
            "ci: audit: passed: no high or critical advisory in a production dependency",
        ])

    def test_both_audits_ask_the_public_registry_whatever_npmrc_says(self):
        # pnpm 12 reads `registry` from a repository's .npmrc, and a server answering `{}` makes an
        # audit clean; the flag on the command line wins over it (PR #157's review, S1).
        self.assertEqual(ci_steps.AUDIT_REGISTRY, "https://registry.npmjs.org/")
        self.repo.write(".npmrc", "registry=http://127.0.0.1:9/\n")
        code, out, shell = self.audit()
        self.assertEqual(code, 0, out)
        self.assertEqual(len(shell.commands), 2)
        for cmd in shell.commands:
            self.assertEqual([a for a in cmd if a.startswith("--registry")],
                             ["--registry=https://registry.npmjs.org/"])

    def test_a_high_or_critical_advisory_in_production_fails(self):
        for severity in ci_steps.FAILING_SEVERITIES:
            with self.subTest(severity=severity):
                report = audit_json({severity: 1}, [(severity, "GHSA-aaaa-bbbb-cccc", "left-pad")])
                code, out, shell = self.audit(production=(1, report))
                self.assertEqual(code, 1, out)
                self.assertIn(f"  {severity} GHSA-aaaa-bbbb-cccc left-pad: left-pad vulnerable to something\n", out)
                self.assertIn("ci: audit: failed: 1 high or critical advisory(ies) in the production dependencies", out)
                # The whole tree was still printed first.
                self.assertEqual(len(shell.commands), 2)

    def test_lower_advisories_in_production_are_printed_and_pass(self):
        report = audit_json({"moderate": 1, "low": 1, "info": 1},
                            [("low", "GHSA-low0-0000-0000", "a"), ("moderate", "GHSA-mod0-0000-0000", "b"),
                             ("info", "GHSA-info-0000-0000", "c")])
        code, out, _ = self.audit(production=(1, report))
        self.assertEqual(code, 0, out)
        lines = out.splitlines()
        start = lines.index("ci: audit: the production dependencies: 0 critical, 0 high, 1 moderate, 1 low, 1 info")
        # The most severe first.
        self.assertEqual(lines[start + 1:start + 4], [
            "  moderate GHSA-mod0-0000-0000 b: b vulnerable to something",
            "  low GHSA-low0-0000-0000 a: a vulnerable to something",
            "  info GHSA-info-0000-0000 c: c vulnerable to something"])
        self.assertTrue(lines[-1].startswith("ci: audit: passed"))

    def test_dev_tools_advisories_are_printed_not_failed_on(self):
        # As on 2026-11-28: the whole tree had 2 high (lodash and @faker-js/faker, dev tools only).
        everything = audit_json({"high": 2, "moderate": 3, "low": 1},
                                [("high", "GHSA-r5fr-rjxr-66jc", "lodash"), ("high", "GHSA-qxc2-j82w-r537", "@faker-js/faker")])
        code, out, _ = self.audit(everything=(1, everything))
        self.assertEqual(code, 0, out)
        self.assertIn("printed and not failed on: 0 critical, 2 high, 3 moderate, 1 low, 0 info\n", out)
        self.assertIn("  high GHSA-r5fr-rjxr-66jc lodash: lodash vulnerable to something\n", out)

    def test_a_count_the_list_leaves_out_still_fails(self):
        # An ignore setting takes the advisory's entry out of pnpm's list, but not its count.
        code, out, _ = self.audit(production=(1, audit_json({"critical": 1})))
        self.assertEqual(code, 1, out)
        self.assertIn("ci: audit: the production dependencies: 1 critical, 0 high", out)
        self.assertIn("failed: 1 high or critical", out)

    def test_a_listed_advisory_the_counts_leave_out_still_fails(self):
        code, out, _ = self.audit(production=(1, audit_json({}, [("high", "GHSA-aaaa-bbbb-cccc", "x")])))
        self.assertEqual(code, 1, out)
        self.assertIn("failed: 1 high or critical", out)

    def test_a_production_report_it_can_t_read_fails_and_nothing_more_runs(self):
        good = json.loads(CLEAN_AUDIT)

        def changed(change):
            report = json.loads(CLEAN_AUDIT)
            change(report)
            return json.dumps(report)
        cases = {
            "not json": (1, "ERR_PNPM_AUDIT_BAD_RESPONSE The audit endpoint responded with 500"),
            "a list": (0, "[]"),
            "a warning before it": (0, "WARN something\n" + CLEAN_AUDIT),
            "no metadata": (0, json.dumps({"advisories": {}})),
            "no counts": (0, json.dumps({"advisories": {}, "metadata": {}})),
            "no advisories": (0, json.dumps({"metadata": good["metadata"]})),
            "advisories as a list": (0, changed(lambda r: r.update(advisories=[]))),
            "a count missing": (0, changed(lambda r: r["metadata"]["vulnerabilities"].pop("critical"))),
            "a count as text": (0, changed(lambda r: r["metadata"]["vulnerabilities"].update(high="0"))),
            "a count as true": (0, changed(lambda r: r["metadata"]["vulnerabilities"].update(high=True))),
            "a count below zero": (0, changed(lambda r: r["metadata"]["vulnerabilities"].update(high=-1))),
            "a count as a float": (0, changed(lambda r: r["metadata"]["vulnerabilities"].update(high=0.0))),
        }
        for name, answer in cases.items():
            with self.subTest(case=name):
                code, out, shell = self.audit(production=answer)
                self.assertEqual(code, 1, out)
                self.assertIn(f"ci: audit: `pnpm {self.PRODUCTION}` (exit", out)
                self.assertIn("gave no report this step reads", out)
                self.assertIn("so the production dependencies are unchecked", out)
                self.assertEqual(shell.commands, [self.PRODUCTION_CMD])

    def test_no_report_at_all_fails_and_points_at_pnpm_s_own_error(self):
        # pnpm 12.16.1 says a registry's bad answer (ERR_PNPM_AUDIT_BAD_RESPONSE) on standard error
        # alone and prints nothing on standard output, which is all the step reads.
        for answer in [(1, ""), (0, ""), (1, "  \n")]:
            with self.subTest(answer=answer):
                code, out, shell = self.audit(production=answer)
                self.assertEqual(code, 1, out)
                self.assertIn(f"ci: audit: `pnpm {self.PRODUCTION}` printed no report (exit {answer[0]}): "
                              "pnpm's own error, if it gave one, is just above, "
                              "so the production dependencies are unchecked", out)
                self.assertEqual(shell.commands, [self.PRODUCTION_CMD])

    def test_pnpm_s_error_and_an_unknown_severity_and_no_answer_fail(self):
        code, out, _ = self.audit(production=(1, json.dumps({"error": {"code": "ERR_PNPM_FETCH_500",
                                                                       "message": "x"}})))
        self.assertEqual(code, 1, out)
        self.assertIn(f"`pnpm {self.PRODUCTION}` failed (exit 1): pnpm's error 'ERR_PNPM_FETCH_500'", out)
        report = json.loads(audit_json({}, [("high", "GHSA-aaaa-bbbb-cccc", "x")]))
        next(iter(report["advisories"].values()))["severity"] = "severe"
        code, out, _ = self.audit(production=(1, json.dumps(report)))
        self.assertEqual(code, 1, out)
        self.assertIn("lists an advisory whose severity 'severe' isn't one of info, low, moderate, high, critical", out)
        code, out, shell = self.audit(production=(None, ""))
        self.assertEqual(code, 1, out)
        self.assertIn(f"`pnpm {self.PRODUCTION}` gave no answer in {ci_steps.AUDIT_SECONDS} seconds, "
                      "so the production dependencies are unchecked", out)
        self.assertEqual(len(shell.commands), 1)

    def test_a_whole_tree_report_it_can_t_read_is_said_and_the_step_goes_on(self):
        for answer in [(None, ""), (1, "not json")]:
            with self.subTest(answer=answer):
                code, out, _ = self.audit(everything=answer)
                self.assertEqual(code, 0, out)
                self.assertIn(f"ci: audit: the whole tree: `pnpm {self.EVERYTHING}`", out)
                self.assertIn("printed only, so the step goes on", out)
                self.assertTrue(out.splitlines()[-1].startswith("ci: audit: passed"))
        # and a failing production report still fails beside it
        code, _, _ = self.audit(production=(1, audit_json({"high": 1})), everything=(None, ""))
        self.assertEqual(code, 1)

    def test_the_real_shell_keeps_standard_error_out_and_gives_up_in_time(self):
        temp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, temp)
        shell = ci_steps.Shell(temp)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code, said = shell.report([sys.executable, "-c", "import sys; print('{}'); "
                                       "print('ci_steps_test: a line on standard error, kept out', file=sys.stderr); "
                                       "sys.exit(1)"], 30)
        self.assertEqual((code, said), (1, "{}\n"))
        with contextlib.redirect_stdout(out):
            self.assertEqual(shell.report([sys.executable, "-c", "import time; time.sleep(30)"], 0.5), (None, ""))


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

    def test_the_node_job_audits_last_once_its_packages_are_installed(self):
        # The audit reads pnpm-lock.yaml and asks the registry; it runs once, as the node job's last
        # step, so a registry that's down can't keep the job's other checks from running (PR #157's
        # review, S2).
        text = self.ci_yml()
        self.assertEqual(text.count("ci_steps.py audit"), 1)
        node = text[text.index("\n  node:\n"):text.index("\n  postgres:\n")]
        steps = re.findall(r"^      - run: python3 tools/ci/ci_steps.py (\S+)$", node, re.M)
        self.assertLess(steps.index("install"), steps.index("audit"))
        self.assertEqual(steps[-1], "audit")
        self.assertTrue(node.rstrip("\n").endswith("      - run: python3 tools/ci/ci_steps.py audit"))

    def test_the_audit_s_two_waits_take_at_most_half_the_node_job_s_limit(self):
        text = self.ci_yml()
        node = text[text.index("\n  node:\n"):text.index("\n  postgres:\n")]
        minutes = re.findall(r"^    timeout-minutes: (\d+)$", node, re.M)
        self.assertEqual(len(minutes), 1, node)
        self.assertLessEqual(2 * ci_steps.AUDIT_SECONDS, int(minutes[0]) * 60 // 2)

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

    def test_slice_12_turned_targets_on(self):
        # Since slice 12, a step whose target is missing fails (the B0 plan, slices 2 and 12).
        self.assertTrue(ci_steps.REQUIRE_TARGETS)


if __name__ == "__main__":
    unittest.main()
