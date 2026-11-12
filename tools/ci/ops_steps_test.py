#!/usr/bin/env python3
"""Tests for tools/ci/ops_steps.py. Run: python3 tools/ci/ops_steps_test.py

The steps run against a fake environment and a fake shell that records the commands. setup-flyctl
is given a fake download that writes an archive made here, so the checksum, the archive's member
and the job's PATH file are tested without the network; the real release's SHA-256 was read once,
when the version was chosen (docs/LIMITATIONS.md, flyctl's row). One test class reads
.github/workflows/ops.yml itself: each script's step is given exactly the secrets SCRIPTS names.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import hashlib
import io
import os
import re
import shutil
import stat
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
# The repository's secret behind each variable the scripts read (docs/plans/B0.md's secrets row;
# docs/plans/api-b0-deploy.md, section 4: "the names are the repository secrets' without the
# DEV_ prefix"), and the job's own token for GITHUB_TOKEN.
SOURCE = {
    "FLY_API_TOKEN": "${{ secrets.FLY_API_TOKEN }}",
    "DATABASE_ADMIN_URL": "${{ secrets.DEV_DATABASE_ADMIN_URL }}",
    "DATABASE_APP_PASSWORD": "${{ secrets.DEV_DATABASE_APP_PASSWORD }}",
    "DATABASE_URL": "${{ secrets.DEV_DATABASE_URL }}",
    "SUPABASE_DEV_PROJECT_REF": "${{ secrets.SUPABASE_DEV_PROJECT_REF }}",
    "SUPABASE_ACCESS_TOKEN": "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    "GITHUB_TOKEN": "${{ github.token }}",
}


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
    """SCRIPTS is docs/plans/api-b0-deploy.md, section 4's table."""

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
            "storage-setup": {}, "supabase-probe": {},
        })
        for script in ops_steps.SCRIPTS.values():
            for variable, option in script.options.items():
                self.assertEqual(ops_steps.FLAGS[variable], option.flag)

    def test_the_scripts_that_call_flyctl(self):
        self.assertEqual(sorted(n for n, s in ops_steps.SCRIPTS.items() if s.flyctl),
                         ["deploy-branch", "fly-app-create", "storage-setup", "supabase-probe",
                          "worker-scale"])
        # A script that reads the Fly token calls flyctl, and the other way round.
        for name, script in ops_steps.SCRIPTS.items():
            self.assertEqual(script.flyctl, "FLY_API_TOKEN" in script.variables, name)


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
        ]
        for name, inputs, options in cases:
            with self.subTest(script=name, inputs=inputs):
                code, out, shell = call("run", self.environ(name, **inputs))
                self.assertEqual(code, 0, out)
                self.assertEqual(shell.commands,
                                 [["node", os.path.join("tools", "ops", "src", "main.ts"), name, *options]])

    def test_the_script_s_exit_code_is_the_step_s(self):
        code, _, _ = call("run", self.environ("migrate"), shell=FakeShell(code=3))
        self.assertEqual(code, 3)

    def test_a_missing_variable_is_named_and_nothing_runs(self):
        environ = self.environ("bootstrap")
        del environ["DATABASE_APP_PASSWORD"]
        environ["DATABASE_URL"] = ""
        code, out, shell = call("run", environ)
        self.assertEqual(code, 1)
        self.assertIn("ops: bootstrap's step in ops.yml doesn't give it DATABASE_APP_PASSWORD, DATABASE_URL", out)
        self.assertEqual(shell.commands, [])

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


def workflow():
    with open(os.path.join(ROOT, ".github", "workflows", "ops.yml"), encoding="utf-8") as f:
        return f.read()


def steps_of(text):
    """The job's steps, each as its text from its `      - ` line to the next step."""
    body = text.split("\n    steps:\n", 1)[1]
    blocks = re.split(r"\n(?=      - )", body)
    return [b for b in blocks if b.startswith("      - ")]


def block_map(step, key):
    """A step's `key:` block (env or with) as {name: value}; a line it can't read fails."""
    lines = step.splitlines()
    try:
        start = lines.index(f"        {key}:")
    except ValueError:
        return {}
    found = {}
    for line in lines[start + 1:]:
        if not line.startswith("          "):
            break
        pair = re.fullmatch(r"          ([A-Za-z0-9_-]+): (.+?)(?:  # .*)?", line)
        if pair is None:
            raise AssertionError(f"a {key} line this test can't read: {line!r}")
        found[pair.group(1)] = pair.group(2)
    return found


class WorkflowFileTest(unittest.TestCase):
    """ops.yml stays thin, gives each script its own secrets and no other's, and keeps the rules
    of docs/TECH-DESIGN.md section 9."""

    def setUp(self):
        self.text = workflow()
        self.steps = steps_of(self.text)
        self.top = self.text.split("\njobs:\n", 1)[0]

    def test_it_runs_only_by_hand(self):
        on = self.top.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertEqual(re.findall(r"^  ([a-z_]+):", on, flags=re.M), ["workflow_dispatch"])
        self.assertEqual(re.findall(r"^      ([a-z_]+):", on, flags=re.M), ["script", "org", "to", "branch"])

    def test_the_script_input_lists_every_script_in_order(self):
        on = self.top.split("\non:\n", 1)[1]
        script = on.split("      script:\n", 1)[1].split("\n      org:", 1)[0]
        self.assertIn("        type: choice\n", script)
        self.assertIn("        required: true\n", script)
        options = re.findall(r"^          - ([a-z-]+)$", script, flags=re.M)
        self.assertEqual(options, list(ops_steps.SCRIPTS))
        for name in ("org", "to", "branch"):
            with self.subTest(input=name):
                block = re.search(rf"\n      {name}:\n((?:        [^\n]*\n|          [^\n]*\n)+)", on)
                self.assertIsNotNone(block)
                self.assertIn("        type: string\n", block.group(1))
                self.assertIn("        required: false\n", block.group(1))
                self.assertIn("        default: ''\n", block.group(1))

    def test_the_inputs_reach_the_steps_as_variables_only(self):
        job = self.text.split("\njobs:\n", 1)[1].split("\n    steps:\n", 1)[0]
        env = job.split("\n    env:\n", 1)[1]
        self.assertEqual(re.findall(r"^      ([A-Z_]+): (.*)$", env, flags=re.M), [
            ("OPS_SCRIPT", "${{ inputs.script }}"), ("OPS_ORG", "${{ inputs.org }}"),
            ("OPS_TO", "${{ inputs.to }}"), ("OPS_BRANCH", "${{ inputs.branch }}")])
        self.assertEqual(set(ops_steps.INPUTS) | {"OPS_SCRIPT"},
                         {"OPS_SCRIPT", "OPS_ORG", "OPS_TO", "OPS_BRANCH"})
        # No expression in any command (zizmor's template-injection), and no multi-line run.
        runs = re.findall(r"^\s+(?:- )?run:(.*)$", self.text, flags=re.M)
        self.assertTrue(runs)
        for run in runs:
            with self.subTest(run=run):
                self.assertNotIn("${{", run)
                self.assertNotIn(run.strip(), ("|", ">", "|-", ">-"))

    def test_every_run_calls_a_step_here(self):
        runs = [r.strip() for r in re.findall(r"^\s+(?:- )?run: (.*)$", self.text, flags=re.M)]
        for run in runs:
            with self.subTest(run=run):
                ops = re.fullmatch(r"python3 tools/ci/ops_steps\.py ([a-z-]+)", run)
                ci = re.fullmatch(r"python3 tools/ci/ci_steps\.py (setup-pnpm|install)", run)
                self.assertTrue(ops or ci, "a run: that isn't a step of ops_steps.py or ci_steps.py")
                if ops:
                    self.assertIn(ops.group(1), ops_steps.STEPS)

    def test_the_steps_in_order(self):
        def what(step):
            uses = re.search(r"uses: ([a-z/-]+)@", step)
            run = re.search(r"run: python3 tools/ci/(\w+)\.py ([a-z-]+)", step)
            name = re.search(r"name: ([a-z -]+)\n", step + "\n")
            if uses:
                return uses.group(1)
            if run.group(1) == "ops_steps" and run.group(2) == "run":
                return "run " + name.group(1)
            return run.group(2)
        self.assertEqual([what(s) for s in self.steps], [
            "actions/checkout", "check", "actions/checkout", "actions/setup-node", "setup-pnpm",
            "install", "setup-flyctl", *[f"run {name}" for name in ops_steps.SCRIPTS]])

    def test_the_branch_is_checked_out_only_for_deploy_branch_and_after_check(self):
        branch = self.steps[2]
        self.assertIn("        if: inputs.script == 'deploy-branch'\n", branch)
        self.assertEqual(block_map(branch, "with"),
                         {"ref": "refs/heads/${{ inputs.branch }}", "persist-credentials": "false"})
        self.assertIn("run: python3 tools/ci/ops_steps.py check", self.steps[1])
        self.assertNotIn("if:", self.steps[1])
        # The first checkout is the run's own ref, which check holds to main.
        self.assertEqual(block_map(self.steps[0], "with"), {"persist-credentials": "false"})

    def test_each_script_has_its_own_secrets_and_no_other_s(self):
        scripts = [s for s in self.steps if "ops_steps.py run" in s]
        self.assertEqual(len(scripts), len(ops_steps.SCRIPTS))
        for step, (name, script) in zip(scripts, ops_steps.SCRIPTS.items(), strict=True):
            with self.subTest(script=name):
                self.assertTrue(step.startswith(f"      - name: {name}\n"))
                self.assertIn(f"        if: inputs.script == '{name}'\n", step)
                self.assertEqual(block_map(step, "env"), {v: SOURCE[v] for v in script.variables})
        # No secret or token anywhere else: not in the job's env, nor in a step that isn't a script's.
        others = "\n".join(s for s in self.steps if "ops_steps.py run" not in s) + self.top
        others += self.text.split("\njobs:\n", 1)[1].split("\n    steps:\n", 1)[0]
        self.assertNotIn("secrets.", others)
        self.assertNotIn("github.token", others)
        self.assertNotIn("secrets: inherit", self.text)
        self.assertNotRegex(self.text, r"toJSON\(\s*secrets\s*\)")

    def test_one_run_at_a_time_and_none_cancelled(self):
        self.assertIn("\nconcurrency:\n  group: ops-dev\n  cancel-in-progress: false\n", self.top)
        self.assertEqual(len(re.findall(r"^ *concurrency:", self.text, flags=re.M)), 1)

    def test_permissions_are_least_privilege(self):
        self.assertIn("\npermissions: {}\n", self.top)
        self.assertNotRegex(self.text, r"(?:read|write)-all")
        job = self.text.split("\njobs:\n", 1)[1].split("\n    steps:\n", 1)[0]
        block = re.search(r"\n    permissions:\n((?:      [^\n]*\n)+)", job + "\n")
        self.assertIsNotNone(block)
        perms = [re.fullmatch(r"      ([a-z-]+): ([a-z]+)(?:  # .*)?", line) for line in block.group(1).splitlines()]
        self.assertTrue(all(perms), block.group(1))
        self.assertEqual([p.groups() for p in perms], [("contents", "read"), ("actions", "read")])
        self.assertEqual(len(re.findall(r"^ *permissions:", self.text, flags=re.M)), 2)
        self.assertEqual(re.findall(r"^  ([a-z_-]+):$", self.text.split("\njobs:\n", 1)[1], flags=re.M), ["ops"])

    def test_actions_are_pinned_to_commits(self):
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertEqual(len(uses), 3)
        for use in uses:
            with self.subTest(use=use):
                self.assertRegex(use, r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}$")

    def test_checkouts_keep_no_credentials(self):
        checkouts = self.text.count("uses: actions/checkout@")
        self.assertEqual(checkouts, 2)
        self.assertEqual(self.text.count("persist-credentials: false"), checkouts)

    def test_the_runner_and_the_job_s_limit(self):
        job = self.text.split("\njobs:\n", 1)[1].split("\n    steps:\n", 1)[0]
        self.assertIn("\n    runs-on: ubuntu-24.04\n", job)
        self.assertIn("\n    timeout-minutes: 40\n", job)


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
