#!/usr/bin/env python3
"""Tests for tools/ci/ops_steps.py. Run: python3 tools/ci/ops_steps_test.py

The steps run against a fake environment and a fake shell that records the commands, and, in
ProcessTest, as the workflow runs them: as a process, with a fake node on PATH. setup-flyctl is
given a fake download that writes an archive made here, so the checksum, the archive's member and
the job's PATH file are tested without the network; the real release's SHA-256 was read once, when
the version was chosen (docs/LIMITATIONS.md, flyctl's row). WorkflowFileTest reads
.github/workflows/ops.yml whole, with a strict reader of the YAML it uses, and holds every key and
value to the ones built from SCRIPTS and SECRETS: each of its scripts' jobs names exactly its
secrets. AlertsWorkflowFileTest does the same for .github/workflows/alerts.yml, whose one job runs
failure-alert.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import hashlib
import io
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ops_steps  # noqa: E402

MAIN = {"GITHUB_REF": "refs/heads/main"}
# A value for each script's required options, so that it passes.
REQUIRED = {"worker-scale": {"OPS_TO": "stopped"}, "deploy-branch": {"OPS_BRANCH": "main"}}


class FakeShell:
    def __init__(self, code=0):
        self.code = code
        self.commands = []

    def run(self, cmd):
        self.commands.append(list(cmd))
        return self.code


def variables_of(name):
    return {variable: f"value-of-{variable}" for variable in ops_steps.SCRIPTS[name].variables}


def call(step, environ, shell=None, fetch=None):
    """Runs one step; returns (exit code, what it printed, the shell)."""
    shell = shell or FakeShell()
    steps = ops_steps.Steps(ROOT, shell, environ=environ,
                            fetch=fetch or (lambda url, path: (_ for _ in ()).throw(AssertionError("no fetch"))))
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = getattr(steps, step)()
    return code, out.getvalue(), shell


class ScriptsTest(unittest.TestCase):
    """SCRIPTS is docs/plans/api-b0-deploy.md, section 4's table, spike-time
    (docs/plans/api-b0-spike-time.md, section 7), spike-links (docs/plans/api-b0-spike-links.md,
    section 4) and failure-alert (docs/plans/api-b2-failure-alerts.md, section 1.5)."""

    def test_the_scripts_and_what_each_reads(self):
        self.assertEqual({name: script.variables for name, script in ops_steps.SCRIPTS.items()}, {
            "fly-app-create": ("FLY_API_TOKEN",),
            "bootstrap": ("DATABASE_ADMIN_URL", "DATABASE_APP_PASSWORD", "DATABASE_URL",
                          "SUPABASE_DEV_PROJECT_REF"),
            "migrate": ("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF"),
            "seed": ("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF"),
            "dev-clock": ("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF"),
            "worker-scale": ("FLY_API_TOKEN",),
            "deploy-branch": ("FLY_API_TOKEN", "GITHUB_TOKEN"),
            "storage-setup": ("FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF"),
            "supabase-probe": ("FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"),
            "spike-time": ("FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF"),
            # It runs on the runner: flyctl reads dev's logs, and its requests go to dev's API.
            "spike-links": ("FLY_API_TOKEN",),
            # The counts are in dev's database, and the job's token writes the issue
            # (tools/ops/src/run.ts, failureAlertScript).
            "failure-alert": ("DATABASE_URL", "GITHUB_TOKEN", "SUPABASE_DEV_PROJECT_REF"),
        })

    def test_the_options_each_takes(self):
        # --to is worker-scale's whole question (stopped or started) and only dev-clock's target;
        # deploy-branch has nothing to deploy without --branch (tools/ops/src/run.ts).
        options = {name: {variable: (option.flag, option.required)
                          for variable, option in script.options.items()}
                   for name, script in ops_steps.SCRIPTS.items()}
        self.assertEqual(options, {
            "fly-app-create": {"OPS_ORG": ("--org", False)},
            "bootstrap": {}, "migrate": {}, "seed": {},
            "dev-clock": {"OPS_TO": ("--to", False)},
            "worker-scale": {"OPS_TO": ("--to", True)},
            "deploy-branch": {"OPS_BRANCH": ("--branch", True)},
            # Their --here and --ref are the Machine's half, which the runner's half starts.
            "storage-setup": {}, "supabase-probe": {}, "spike-time": {},
            "spike-links": {}, "failure-alert": {},
        })
        for script in ops_steps.SCRIPTS.values():
            for variable, option in script.options.items():
                self.assertEqual(ops_steps.FLAGS[variable], option.flag)

    def test_the_scripts_that_call_flyctl(self):
        self.assertEqual(sorted(n for n, s in ops_steps.SCRIPTS.items() if s.flyctl),
                         ["deploy-branch", "fly-app-create", "spike-links", "spike-time",
                          "storage-setup", "supabase-probe", "worker-scale"])
        # A script that reads the Fly token calls flyctl, and the other way round.
        for name, script in ops_steps.SCRIPTS.items():
            self.assertEqual(script.flyctl, "FLY_API_TOKEN" in script.variables, name)

    def test_the_workflow_that_runs_each(self):
        # failure-alert runs on alerts.yml's schedule; every other script by hand, from ops.yml.
        self.assertEqual({name: script.workflow for name, script in ops_steps.SCRIPTS.items()},
                         {**{name: "ops" for name in ops_steps.SCRIPTS}, "failure-alert": "alerts"})


class CheckTest(unittest.TestCase):
    def test_every_script_passes_from_main_with_what_it_needs(self):
        for name in ops_steps.SCRIPTS:
            with self.subTest(script=name):
                code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": name, **REQUIRED.get(name, {})})
                self.assertEqual(code, 0, out)
                self.assertEqual(out, f"ops: {name}, from main\n")

    def test_a_run_from_another_ref_is_refused(self):
        for ref in ("refs/heads/api/b1-clubs", "refs/heads/mainx", "refs/tags/main", "main", ""):
            with self.subTest(ref=ref):
                code, out, _ = call("check", {"GITHUB_REF": ref, "OPS_SCRIPT": "migrate"})
                self.assertEqual(code, 1)
                self.assertIn("ops: runs only from main", out)
                self.assertIn(repr(ref), out)
        code, out, _ = call("check", {"OPS_SCRIPT": "migrate"})
        self.assertEqual(code, 1)
        self.assertIn("ops: runs only from main", out)

    def test_an_unknown_script_is_refused(self):
        for name in ("", "deploy", "migrate ", "MIGRATE", "../migrate"):
            with self.subTest(script=name):
                code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": name})
                self.assertEqual(code, 1)
                self.assertIn(f"ops: {name!r} isn't one of the scripts: fly-app-create, bootstrap", out)

    def test_an_input_the_script_doesnt_take_is_refused(self):
        for name, script in ops_steps.SCRIPTS.items():
            for variable in ops_steps.INPUTS:
                if variable in script.options:
                    continue
                with self.subTest(script=name, input=variable):
                    code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": name, **REQUIRED.get(name, {}),
                                                  variable: "x"})
                    self.assertEqual(code, 1)
                    self.assertIn(f"ops: {name} takes no {ops_steps.FLAGS[variable]}, and one was given", out)

    def test_a_missing_required_option_is_refused(self):
        for name, flag in (("worker-scale", "--to"), ("deploy-branch", "--branch")):
            with self.subTest(script=name):
                code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": name})
                self.assertEqual(code, 1)
                self.assertIn(f"ops: {name} needs {flag}: give it in the run's inputs", out)

    def test_every_problem_is_said(self):
        code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": "worker-scale", "OPS_ORG": "x", "OPS_BRANCH": "y"})
        self.assertEqual(code, 1)
        self.assertEqual(out.splitlines(), [
            "ops: worker-scale takes no --org, and one was given",
            "ops: worker-scale takes no --branch, and one was given",
            "ops: worker-scale needs --to: give it in the run's inputs",
        ])

    def test_a_branch_s_name_follows_deploy_branch_s_rule(self):
        # tools/ops/src/deploy-branch.ts, checkBranch: what it would refuse is never checked out.
        for branch in ("main", "api/b1-clubs", "ios/b0-adopt-age", "a.b_c-d", "A1/b2/c3", "x" * 100):
            with self.subTest(branch=branch):
                code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": "deploy-branch", "OPS_BRANCH": branch})
                self.assertEqual(code, 0, out)
        for branch in ("-x", "--branch", "/main", "main/", "a//b", ".hidden", "a/.b", "a..b", "main.",
                       "a.lock", "a.lock/b", "a b", "a;b", "$(id)", "`id`", "main\n", "\nmain", "ma\nin",
                       "refs/heads/../x", "a~1", "a^", "a:b", "a\\b", "é", "x" * 101):
            with self.subTest(branch=branch):
                code, out, _ = call("check", {**MAIN, "OPS_SCRIPT": "deploy-branch", "OPS_BRANCH": branch})
                self.assertEqual(code, 1)
                self.assertIn("ops: --branch takes a branch's name", out)


class RunTest(unittest.TestCase):
    def environ(self, name, **inputs):
        return {**MAIN, "OPS_SCRIPT": name, **variables_of(name), **inputs}

    def test_each_script_runs_with_its_option_as_one_argument(self):
        cases = [
            ("fly-app-create", {}, []),
            ("fly-app-create", {"OPS_ORG": "tadayo"}, ["--org=tadayo"]),
            ("bootstrap", {}, []),
            ("migrate", {}, []),
            ("seed", {}, []),
            ("dev-clock", {}, []),
            ("dev-clock", {"OPS_TO": "2026-11-20T06:59:00Z"}, ["--to=2026-11-20T06:59:00Z"]),
            ("worker-scale", {"OPS_TO": "stopped"}, ["--to=stopped"]),
            # A value that starts with dashes stays the value of its option.
            ("worker-scale", {"OPS_TO": "--branch"}, ["--to=--branch"]),
            ("deploy-branch", {"OPS_BRANCH": "api/b1-clubs"}, ["--branch=api/b1-clubs"]),
            ("storage-setup", {}, []),
            ("supabase-probe", {}, []),
            ("spike-time", {}, []),
            ("spike-links", {}, []),
            ("failure-alert", {}, []),
        ]
        # Every script has a case, so a script added without one fails here.
        self.assertEqual({name for name, _, _ in cases}, set(ops_steps.SCRIPTS))
        for name, inputs, options in cases:
            with self.subTest(script=name, inputs=inputs):
                code, out, shell = call("run", self.environ(name, **inputs))
                self.assertEqual(code, 0, out)
                self.assertEqual(shell.commands,
                                 [["node", os.path.join("tools", "ops", "src", "main.ts"), name, *options]])

    def test_the_script_s_exit_code_is_the_step_s(self):
        code, _, _ = call("run", self.environ("migrate"), shell=FakeShell(code=3))
        self.assertEqual(code, 3)

    def test_a_missing_variable_names_its_repository_secret_and_nothing_runs(self):
        environ = self.environ("bootstrap")
        del environ["DATABASE_APP_PASSWORD"]
        environ["DATABASE_URL"] = ""
        code, out, shell = call("run", environ)
        self.assertEqual(code, 1)
        self.assertEqual(out.splitlines(), [
            "ops: bootstrap has no DATABASE_APP_PASSWORD: the repository secret DEV_DATABASE_APP_PASSWORD is "
            "empty in this run (is it set? Settings, Secrets and variables, Actions)",
            "ops: bootstrap has no DATABASE_URL: the repository secret DEV_DATABASE_URL is "
            "empty in this run (is it set? Settings, Secrets and variables, Actions)",
        ])
        self.assertEqual(shell.commands, [])
        environ = self.environ("deploy-branch", OPS_BRANCH="main")
        del environ["GITHUB_TOKEN"]
        code, out, shell = call("run", environ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "ops: deploy-branch has no GITHUB_TOKEN: its step in ops.yml gives it the job's token\n")
        self.assertEqual(shell.commands, [])
        environ = self.environ("failure-alert")
        environ["GITHUB_TOKEN"] = ""
        code, out, shell = call("run", environ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "ops: failure-alert has no GITHUB_TOKEN: its step in alerts.yml gives it the job's token\n")
        self.assertEqual(shell.commands, [])

    def test_every_variable_has_its_repository_secret(self):
        self.assertEqual(ops_steps.SECRETS, {
            "FLY_API_TOKEN": "FLY_API_TOKEN",
            "DATABASE_ADMIN_URL": "DEV_DATABASE_ADMIN_URL",
            "DATABASE_APP_PASSWORD": "DEV_DATABASE_APP_PASSWORD",
            "DATABASE_URL": "DEV_DATABASE_URL",
            "SUPABASE_DEV_PROJECT_REF": "SUPABASE_DEV_PROJECT_REF",
            "SUPABASE_ACCESS_TOKEN": "SUPABASE_ACCESS_TOKEN",
        })
        self.assertEqual(ops_steps.JOB_TOKEN, "GITHUB_TOKEN")

    def test_run_refuses_what_check_refuses(self):
        for environ in (
            {**self.environ("migrate"), "GITHUB_REF": "refs/heads/api/b1-clubs"},
            {**self.environ("migrate"), "OPS_SCRIPT": "deploy"},
            self.environ("migrate", OPS_TO="x"),
            self.environ("worker-scale"),
            self.environ("deploy-branch", OPS_BRANCH="-x"),
        ):
            with self.subTest(environ={k: v for k, v in environ.items() if k.startswith(("OPS_", "GITHUB_"))}):
                code, out, shell = call("run", environ)
                self.assertEqual(code, 1)
                self.assertTrue(out.startswith("ops: "))
                self.assertEqual(shell.commands, [])


def archive(members):
    """A .tar.gz holding the given members: {name: bytes} for files, {name: None} for folders."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            if data is None:
                info.type = tarfile.DIRTYPE
                tar.addfile(info)
            else:
                info.size = len(data)
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class SetupFlyctlTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.temp)
        self.github_path = os.path.join(self.temp, "github_path")
        open(self.github_path, "w").close()
        self.fetched = []

    def environ(self, name="worker-scale"):
        return {"OPS_SCRIPT": name, "RUNNER_TEMP": self.temp, "GITHUB_PATH": self.github_path}

    def fetch_bytes(self, data):
        def fetch(url, path):
            self.fetched.append(url)
            with open(path, "wb") as f:
                f.write(data)
        return fetch

    def setup(self, data, environ=None, sha=None):
        """Runs setup-flyctl with a download that writes data, and data's SHA-256 (or sha) as the
        one expected."""
        digest = sha or hashlib.sha256(data).hexdigest()
        with mock.patch.object(ops_steps, "FLYCTL_SHA256", digest):
            return call("setup_flyctl", environ or self.environ(), fetch=self.fetch_bytes(data))

    def folder(self):
        return os.path.join(self.temp, f"flyctl-{ops_steps.FLYCTL_VERSION}")

    def test_the_pinned_release(self):
        self.assertEqual(ops_steps.FLYCTL_VERSION, "0.5.8")
        self.assertEqual(ops_steps.FLYCTL_URL,
                         "https://github.com/superfly/flyctl/releases/download/v0.5.8/flyctl_0.5.8_Linux_x86_64.tar.gz")
        self.assertEqual(ops_steps.FLYCTL_SHA256, "0115ae5202c9984695e22e4e99a375565ae3d7edc462377ce00c833406c877ac")

    def test_flyctl_goes_on_the_job_s_path(self):
        binary = b"\x7fELF flyctl"
        code, out, _ = self.setup(archive({"flyctl": binary}))
        self.assertEqual(code, 0, out)
        self.assertEqual(self.fetched, [ops_steps.FLYCTL_URL])
        path = os.path.join(self.folder(), "flyctl")
        with open(path, "rb") as f:
            self.assertEqual(f.read(), binary)
        self.assertTrue(os.stat(path).st_mode & stat.S_IXUSR)
        self.assertEqual(sorted(os.listdir(self.folder())), ["flyctl"])  # the archive is gone
        with open(self.github_path, encoding="utf-8") as f:
            self.assertEqual(f.read(), self.folder() + "\n")
        self.assertIn("flyctl 0.5.8 (SHA-256 checked) is on the job's PATH", out)

    def test_only_the_member_named_flyctl_is_taken(self):
        code, out, _ = self.setup(archive({"README.md": b"read me", "flyctl": b"bin", "../escape": b"no"}))
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(os.listdir(self.folder())), ["flyctl"])
        self.assertFalse(os.path.exists(os.path.join(self.temp, "escape")))

    def test_an_archive_with_another_checksum_isn_t_used(self):
        data = archive({"flyctl": b"bin"})
        code, out, _ = self.setup(data, sha="0" * 64)
        self.assertEqual(code, 1)
        self.assertIn(f"has SHA-256 {hashlib.sha256(data).hexdigest()}, not {'0' * 64}, so it isn't used", out)
        self.assertFalse(os.path.exists(os.path.join(self.folder(), "flyctl")))
        with open(self.github_path, encoding="utf-8") as f:
            self.assertEqual(f.read(), "")

    def test_an_archive_without_the_file_is_refused(self):
        for members in ({"README.md": b"x"}, {"flyctl": None}, {"bin/flyctl": b"x"}):
            with self.subTest(members=list(members)):
                code, out, _ = self.setup(archive(members))
                self.assertEqual(code, 1)
                self.assertIn("the archive has no file named flyctl", out)
                with open(self.github_path, encoding="utf-8") as f:
                    self.assertEqual(f.read(), "")

    def test_a_failed_download_is_said(self):
        def fetch(url, path):
            raise OSError("the network is down")
        code, out, _ = call("setup_flyctl", self.environ(), fetch=fetch)
        self.assertEqual(code, 1)
        self.assertIn("couldn't download flyctl 0.5.8: the network is down", out)

    def test_nothing_is_installed_for_a_script_that_doesn_t_call_it(self):
        for name in ("bootstrap", "migrate", "seed", "dev-clock"):
            with self.subTest(script=name):
                code, out, _ = call("setup_flyctl", self.environ(name))  # its fetch fails the test
                self.assertEqual(code, 0)
                self.assertIn(f"{name} doesn't call flyctl, so none is installed", out)
        with open(self.github_path, encoding="utf-8") as f:
            self.assertEqual(f.read(), "")

    def test_it_needs_the_job_s_path_file_and_a_script(self):
        environ = self.environ()
        del environ["GITHUB_PATH"]
        code, out, _ = call("setup_flyctl", environ)
        self.assertEqual(code, 1)
        self.assertIn("GITHUB_PATH isn't set", out)
        code, out, _ = call("setup_flyctl", self.environ("deploy"))
        self.assertEqual(code, 1)
        self.assertIn("isn't one of the scripts", out)


class ProcessTest(unittest.TestCase):
    """ops_steps.py run as the workflow runs it: its exit status is what stops the job, and the real
    Shell starts node with the command as a list, never through a shell."""

    def setUp(self):
        self.temp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.temp)
        self.args_file = os.path.join(self.temp, "args")
        # A fake node: it writes each argument it was given, each ended by a NUL, and exits 3.
        node = os.path.join(self.temp, "node")
        with open(node, "w", encoding="utf-8") as f:
            f.write('#!/bin/sh\nprintf \'%s\\0\' "$@" > "$OPS_TEST_ARGS"\nexit 3\n')
        os.chmod(node, 0o755)

    def process(self, step, environ):
        env = {"PATH": self.temp + os.pathsep + "/usr/bin:/bin", "OPS_TEST_ARGS": self.args_file, **environ}
        return subprocess.run([sys.executable, "-I", "-B", os.path.join(HERE, "ops_steps.py"), step],
                              env=env, capture_output=True, text=True, timeout=60)

    def test_a_refusal_is_the_process_s_failure(self):
        done = self.process("check", {"GITHUB_REF": "refs/heads/api/b1-clubs", "OPS_SCRIPT": "migrate"})
        self.assertEqual(done.returncode, 1)
        self.assertIn("ops: runs only from main", done.stdout)
        done = self.process("run", {**MAIN, "OPS_SCRIPT": "migrate", "SUPABASE_DEV_PROJECT_REF": "x"})
        self.assertEqual(done.returncode, 1)
        self.assertIn("the repository secret DEV_DATABASE_URL is empty", done.stdout)
        self.assertFalse(os.path.exists(self.args_file))  # node never started
        done = self.process("check", {**MAIN, "OPS_SCRIPT": "migrate"})
        self.assertEqual(done.returncode, 0, done.stdout)

    def test_an_input_reaches_node_as_one_argument_and_its_exit_code_is_the_step_s(self):
        marker = os.path.join(self.temp, "ran")
        value = f"$(touch {marker}) `touch {marker}`; touch {marker} --branch=main x"
        done = self.process("run", {**MAIN, "OPS_SCRIPT": "dev-clock", "OPS_TO": value,
                                    "DATABASE_URL": "u", "SUPABASE_DEV_PROJECT_REF": "r"})
        self.assertEqual(done.returncode, 3, done.stdout + done.stderr)
        with open(self.args_file, "rb") as f:
            args = f.read().split(b"\0")[:-1]
        self.assertEqual([a.decode() for a in args],
                         [os.path.join("tools", "ops", "src", "main.ts"), "dev-clock", "--to=" + value])
        self.assertFalse(os.path.exists(marker))


def workflow(name="ops"):
    with open(os.path.join(ROOT, ".github", "workflows", f"{name}.yml"), encoding="utf-8") as f:
        return f.read()


def scripts_of(name):
    """The scripts that workflow runs, in SCRIPTS' order."""
    return [script for script, given in ops_steps.SCRIPTS.items() if given.workflow == name]


def secret_of(variable):
    """The expression a step's env gives a script's variable from."""
    return "${{ github.token }}" if variable == ops_steps.JOB_TOKEN else "${{ secrets.%s }}" % ops_steps.SECRETS[variable]


def setup_steps(pinned):
    """The steps every job of ops.yml and alerts.yml takes after its check: Node, pnpm and the
    workspace's packages."""
    return [{"uses": pinned["actions/setup-node"],
             "with": {"node-version-file": ".nvmrc", "package-manager-cache": "false"}},
            {"run": "python3 tools/ci/ci_steps.py setup-pnpm"},
            {"run": "python3 tools/ci/ci_steps.py install"}]


KEY = re.compile(r"[A-Za-z0-9_-]+")


FOLDED = re.compile(r"(?:^|[ -])[A-Za-z0-9_-]+: >-$")


def significant_lines(text):
    """(line number, indent, content) for each line that isn't blank or a comment, its comment cut
    (a `#` after a space or at the start), except in a folded value: YAML reads every line of a
    block scalar as its text, a `#` or a blank line among them, so those lines are taken whole,
    and one holding a `#`, a blank line inside one, or one indented unlike the first, fails. A tab
    fails (YAML refuses one in indentation), and so does a line ending in a space."""
    found = []
    lines = text.splitlines()
    folded = None  # (the key's indent, the first line's indent) while a folded value is read
    for number, line in enumerate(lines, 1):
        if "\t" in line:
            raise ValueError(f"line {number}: a tab")
        if line != line.rstrip():
            raise ValueError(f"line {number}: ends in a space")
        indent = len(line) - len(line.lstrip(" "))
        if folded and not line:
            later = next((rest for rest in lines[number:] if rest), "")
            if len(later) - len(later.lstrip(" ")) > folded[0]:
                raise ValueError(f"line {number}: a blank line inside a folded value")
            folded = None
            continue
        if folded and indent > folded[0]:
            if "#" in line:
                raise ValueError(f"line {number}: a `#` inside a folded value, which YAML reads as text")
            if folded[1] is None:
                folded = (folded[0], indent)
            elif indent != folded[1]:
                raise ValueError(f"line {number}: a folded value's line indented unlike its first")
            found.append((number, indent, line.strip()))
            continue
        folded = None
        content = re.split(r"(?:^| )#", line, maxsplit=1)[0].rstrip()
        if content.strip():
            found.append((number, len(content) - len(content.lstrip(" ")), content.strip()))
            if FOLDED.search(content):
                folded = (indent, None)
    return found


def scalar(number, text):
    """A plain scalar, '' or a quoted string with no quote inside; anything else fails."""
    if text == "{}":
        return {}
    if text.startswith("'"):
        if len(text) < 2 or not text.endswith("'") or "'" in text[1:-1]:
            raise ValueError(f"line {number}: a quoted value this reader doesn't take: {text!r}")
        return text[1:-1]
    if text[0] in "\"[]{}&*!|>%@`,?:-<" or ": " in text or text.endswith(":"):
        raise ValueError(f"line {number}: a value this reader doesn't take: {text!r}")
    return text


def parse_yaml(text):
    """A workflow file as dicts, lists and strings, read strictly: block mappings and sequences,
    plain and single-quoted scalars, `{}`, folded `>-` scalars (their lines taken whole, as YAML
    takes them: significant_lines) and comments, and nothing else. Any other line, a duplicate key,
    or a line indented where nothing can be, fails, so no line of the file goes unread or is read
    otherwise than YAML reads it."""
    lines = significant_lines(text)
    position = 0

    def block(indent):
        nonlocal position
        number, at, content = lines[position]
        if at != indent:
            raise ValueError(f"line {number}: indented {at}, where {indent} was expected")
        if content == "-" or content.startswith("- "):
            return sequence(indent)
        return mapping(indent)

    def value_after(number, indent, rest):
        """The value of a key whose text after the colon is rest."""
        nonlocal position
        if rest == ">-":
            words = []
            while position < len(lines) and lines[position][1] > indent:
                words.append(lines[position][2])
                position += 1
            if not words:
                raise ValueError(f"line {number}: a folded value with no text")
            return " ".join(words)
        if rest:
            return scalar(number, rest)
        if position >= len(lines) or lines[position][1] <= indent:
            raise ValueError(f"line {number}: a key with no value")
        return block(lines[position][1])

    def mapping(indent, first=None):
        nonlocal position
        found = {}
        while position < len(lines) or first:
            if first:
                number, content = first
                first = None
            else:
                number, at, content = lines[position]
                if at < indent:
                    break
                if at > indent:
                    raise ValueError(f"line {number}: indented {at}, where {indent} was expected")
                if content == "-" or content.startswith("- "):
                    break
                position += 1
            key, colon, rest = content.partition(":")
            if not colon or not KEY.fullmatch(key) or (rest and not rest.startswith(" ")):
                raise ValueError(f"line {number}: not a `key: value` this reader takes: {content!r}")
            if key in found:
                raise ValueError(f"line {number}: {key} twice")
            found[key] = value_after(number, indent, rest.strip())
        return found

    def sequence(indent):
        nonlocal position
        found = []
        while position < len(lines):
            number, at, content = lines[position]
            if at < indent:
                break
            if at > indent or not (content == "-" or content.startswith("- ")):
                raise ValueError(f"line {number}: expected an item of the list at indent {indent}")
            position += 1
            item = content[2:].strip()
            if not item:
                raise ValueError(f"line {number}: an empty item")
            if re.match(r"[A-Za-z0-9_-]+:(?: |$)", item):
                found.append(mapping(indent + 2, first=(number, item)))
            else:
                found.append(scalar(number, item))
        return found

    document = block(0)
    if position != len(lines):
        raise ValueError(f"line {lines[position][0]}: left unread")
    return document


def pins():
    """The actions ci.yml uses, by name: ops.yml and alerts.yml must use the same commits."""
    with open(os.path.join(ROOT, ".github", "workflows", "ci.yml"), encoding="utf-8") as f:
        found = dict(re.findall(r"uses: ([a-z-]+/[a-z-]+)@([0-9a-f]{40})", f.read()))
    return {name: f"{name}@{sha}" for name, sha in found.items()}


def expected_jobs():
    """Every job of ops.yml, exactly, built from SCRIPTS and SECRETS."""
    pinned = pins()
    checkout = {"uses": pinned["actions/checkout"], "with": {"persist-credentials": "false"}}
    jobs = {}
    for name in scripts_of("ops"):
        script = ops_steps.SCRIPTS[name]
        steps = [checkout, {"run": "python3 tools/ci/ops_steps.py check"}]
        if name == "deploy-branch":
            steps.append({"uses": pinned["actions/checkout"],
                          "with": {"ref": "refs/heads/${{ inputs.branch }}", "persist-credentials": "false"}})
        steps += setup_steps(pinned)
        if script.flyctl:
            steps.append({"run": "python3 tools/ci/ops_steps.py setup-flyctl"})
        env = {v: secret_of(v) for v in script.variables}
        steps.append({"name": name, "env": env, "run": "python3 tools/ci/ops_steps.py run"})
        permissions = {"contents": "read"}
        if name == "deploy-branch":
            permissions["actions"] = "read"
        jobs[name] = {"name": name, "if": f"inputs.script == '{name}'", "runs-on": "ubuntu-24.04",
                      "timeout-minutes": "40" if name == "deploy-branch" else "20",
                      "permissions": permissions, "steps": steps}
    return jobs


class YamlReaderTest(unittest.TestCase):
    """The reader WorkflowFileTest stands on: what it reads, and that it refuses what it can't."""

    def test_it_reads_the_subset(self):
        self.assertEqual(parse_yaml("a: 1  # c\n# c\nb:\n  c: ''\n\n  d: {}\n  e: >-  # c\n    x\n    y\n  # c\nf:\n"
                                    "  - g\n  - h: i\n    j: 'k'\n  - l: >-\n      m\n\n"),
                         {"a": "1", "b": {"c": "", "d": {}, "e": "x y"}, "f": ["g", {"h": "i", "j": "k"}, {"l": "m"}]})

    def test_it_refuses_what_it_can_t_read(self):
        for text in ("a: 1\na: 2\n", "a:\n  b: 1\n   c: 2\n", "a: [1]\n", "a: \"x\"\n", "a: |\n  x\n", "a: >\n  x\n",
                     "a: &x 1\n", "a: *x\n", "<<: x\n", "a: 'x'y'\n", "a:\n\tb: 1\n", "a: b: c\n", "a:\n",
                     "- a\nb: 1\n", "a:b\n", "'a': 1\n", "a: 1\n  b: 2\n", "a: 1 \n",
                     # a folded value's lines are its text, as YAML reads them: a `#` among them,
                     # a blank line inside one, or a line indented unlike the first, fails
                     "a: >-\n  x #y\n", "a: >-\n  x\n  #y\n", "a: >-\n  #\n  x\n", "- a: >-\n    x #y\n",
                     "a: >-\n  x\n\n  y\n", "a: >-\n  x\n    y\n", "a: >-\n    x\n  y\n"):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    parse_yaml(text)

    def test_it_reads_ops_yml_and_alerts_yml_as_a_yaml_library_would(self):
        # ci's runner has one: the ubuntu-24.04 image's python3-yaml, which `python3 -I` imports
        # (ci run 43138850682 ran this test). It isn't pinned, so on ci its absence fails the test
        # rather than skipping it; elsewhere, without one, the test is skipped.
        try:
            import yaml
        except ImportError:
            if os.environ.get("GITHUB_ACTIONS") == "true":
                self.fail("no yaml library on ci's runner: the image's python3-yaml has gone, so "
                          "install one before this step or say in docs/LIMITATIONS.md why not")
            self.skipTest("no yaml library here")

        def text(value):
            if isinstance(value, dict):
                return {k: text(v) for k, v in value.items()}
            if isinstance(value, list):
                return [text(v) for v in value]
            return str(value).lower() if isinstance(value, bool) else str(value)
        for name in ("ops", "alerts"):
            with self.subTest(workflow=name):
                theirs = yaml.safe_load(workflow(name))
                theirs["on"] = theirs.pop(True)  # YAML 1.1 reads the key `on` as true
                self.assertEqual(text(theirs), parse_yaml(workflow(name)))


class WorkflowFileTest(unittest.TestCase):
    """ops.yml, read whole: every key and value is the one this test builds from SCRIPTS and
    SECRETS, the inputs' descriptions aside, so a script's job names exactly its secrets and nothing
    else anywhere names one (docs/TECH-DESIGN.md section 9)."""

    def setUp(self):
        self.text = workflow()
        self.document = parse_yaml(self.text)

    def test_the_file_holds_these_keys_and_no_other(self):
        self.assertEqual(list(self.document), ["name", "on", "permissions", "concurrency", "env", "defaults", "jobs"])
        self.assertEqual(self.document["name"], "ops")
        self.assertEqual(self.document["permissions"], {})
        self.assertEqual(self.document["defaults"], {"run": {"shell": "bash"}})

    def test_it_runs_only_by_hand_with_these_inputs(self):
        inputs = self.document["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(self.document["on"]), ["workflow_dispatch"])
        self.assertEqual(list(self.document["on"]["workflow_dispatch"]), ["inputs"])
        descriptions = {name: given.pop("description") for name, given in inputs.items()}
        self.assertEqual(inputs, {
            "script": {"type": "choice", "required": "true", "options": scripts_of("ops")},
            "org": {"type": "string", "required": "false", "default": ""},
            "to": {"type": "string", "required": "false", "default": ""},
            "branch": {"type": "string", "required": "false", "default": ""},
        })
        for name, description in descriptions.items():
            with self.subTest(input=name):
                self.assertTrue(description)
                self.assertNotIn("${{", description)

    def test_the_inputs_reach_the_steps_as_variables_only(self):
        self.assertEqual(self.document["env"], {"OPS_SCRIPT": "${{ inputs.script }}", "OPS_ORG": "${{ inputs.org }}",
                                                "OPS_TO": "${{ inputs.to }}", "OPS_BRANCH": "${{ inputs.branch }}"})
        self.assertEqual(set(ops_steps.FLAGS), set(ops_steps.INPUTS))

    def test_one_run_at_a_time_and_none_cancelled(self):
        self.assertEqual(self.document["concurrency"], {"group": "ops-dev", "cancel-in-progress": "false"})

    def test_each_script_has_its_own_job_with_its_own_secrets_and_nothing_else(self):
        jobs = self.document["jobs"]
        expected = expected_jobs()
        self.assertEqual(list(jobs), list(expected))
        for name in expected:
            with self.subTest(job=name):
                self.assertEqual(jobs[name], expected[name])

    def test_every_expression_in_the_file_is_one_this_test_knows(self):
        # The same check, counted on the file's own text, apart from the reader above: every
        # `${{ … }}` in the file, comments included (none needs one), each whole on its line, as
        # often as the jobs and the inputs' variables need it.
        found = sorted(re.findall(r"\$\{\{.*?\}\}", self.text))
        self.assertEqual(self.text.count("${{"), len(found))
        wanted = ["${{ inputs.%s }}" % name for name in ("script", "org", "to", "branch", "branch")]
        for name in scripts_of("ops"):
            wanted += [secret_of(v) for v in ops_steps.SCRIPTS[name].variables]
        self.assertEqual(found, sorted(wanted))
        self.assertEqual(set(ops_steps.SECRETS) | {ops_steps.JOB_TOKEN},
                         {v for s in ops_steps.SCRIPTS.values() for v in s.variables})

    def test_the_pins_are_ci_yml_s(self):
        pinned = pins()
        self.assertEqual(sorted(pinned), ["actions/checkout", "actions/setup-node"])
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertEqual(len(uses), 2 * len(scripts_of("ops")) + 1)
        self.assertTrue(set(uses) <= set(pinned.values()))


class AlertsWorkflowFileTest(unittest.TestCase):
    """alerts.yml, read whole: every key and value is the one this test builds from SCRIPTS and
    SECRETS, so the schedule's one job runs failure-alert from main with exactly its secrets and the
    job's token, and may write only issues (docs/plans/api-b2-failure-alerts.md, section 1.5)."""

    def setUp(self):
        self.text = workflow("alerts")
        self.document = parse_yaml(self.text)

    def test_the_whole_file(self):
        pinned = pins()
        self.assertEqual(scripts_of("alerts"), ["failure-alert"])
        script = ops_steps.SCRIPTS["failure-alert"]
        self.assertEqual(self.document, {
            "name": "alerts",
            # Every 15 minutes, away from the hour's busy start (docs/LIMITATIONS.md, 2026-11-28),
            # or by hand; no other event, so no branch's push or pull request starts it.
            "on": {"schedule": [{"cron": "7,22,37,52 * * * *"}], "workflow_dispatch": {}},
            "permissions": {},
            "concurrency": {"group": "alerts-dev", "cancel-in-progress": "false"},
            # The script is fixed here, not an input: ops_steps.py check refuses any other ref
            # than main's, as for ops.
            "env": {"OPS_SCRIPT": "failure-alert"},
            "defaults": {"run": {"shell": "bash"}},
            "jobs": {"failure-alert": {
                "name": "failure-alert", "runs-on": "ubuntu-24.04", "timeout-minutes": "15",
                "permissions": {"contents": "read", "issues": "write"},
                "steps": [{"uses": pinned["actions/checkout"], "with": {"persist-credentials": "false"}},
                          {"run": "python3 tools/ci/ops_steps.py check"},
                          *setup_steps(pinned),
                          {"name": "failure-alert", "env": {v: secret_of(v) for v in script.variables},
                           "run": "python3 tools/ci/ops_steps.py run"}],
            }},
        })
        self.assertEqual(list(self.document), ["name", "on", "permissions", "concurrency", "env", "defaults", "jobs"])

    def test_every_expression_in_the_file_is_one_this_test_knows(self):
        # As for ops.yml, on the file's own text, comments included: the three variables' and
        # nothing else, so no input and no other secret reaches the job.
        found = sorted(re.findall(r"\$\{\{.*?\}\}", self.text))
        self.assertEqual(self.text.count("${{"), len(found))
        self.assertEqual(found, sorted(["${{ secrets.DEV_DATABASE_URL }}", "${{ github.token }}",
                                        "${{ secrets.SUPABASE_DEV_PROJECT_REF }}"]))

    def test_the_pins_are_ci_yml_s(self):
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertEqual(sorted(uses), sorted(pins().values()))


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        for argv in (["ops_steps.py"], ["ops_steps.py", "deploy"], ["ops_steps.py", "run", "x"]):
            with self.subTest(argv=argv):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(ops_steps.main(argv), 2)
                self.assertIn("steps: check, setup-flyctl, run", out.getvalue())


if __name__ == "__main__":
    unittest.main()
