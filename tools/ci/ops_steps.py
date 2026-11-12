#!/usr/bin/env python3
"""The ops workflow's steps (docs/plans/B0.md, slice 10b; .github/workflows/ops.yml).

  python3 tools/ci/ops_steps.py <step>

  check         the run is main's, and the script and its inputs are ones it takes
  setup-flyctl  flyctl 0.5.8 from its GitHub release, checked against its SHA-256, on the job's
                PATH; nothing for a script that doesn't call flyctl
  run           node tools/ops/src/main.ts <script> [--option=value], in the step's own
                environment

The workflow passes its inputs as environment variables, OPS_SCRIPT, OPS_ORG, OPS_TO and
OPS_BRANCH, and never writes them into a command line, so an input is only ever an argument, and
always as `--option=value`, so that a value starting with a dash is never read as an option.
SCRIPTS is the interface of docs/plans/api-b0-deploy.md, section 4's table: what each script reads
on the runner and the one option it takes, if any. ops.yml has one job per script, run only for
that script and naming only its secrets (a job's `if:` is decided before a runner gets the job, so
a skipped job's secrets reach no runner; a step's `if:` would not do), and ops_steps_test.py reads
ops.yml to hold it to that. SECRETS is the repository secret behind each variable: the repository's
names keep a `DEV_` prefix that the scripts' don't have (DEV_DATABASE_URL is DATABASE_URL).

The scripts themselves check what they are given (tools/ops: the guard keeps them on tadayo-dev,
and the redactor goes over every line they print), so this file checks only what the workflow
decides: where it runs from, which script, and which option goes with it.

A run is main's, so that main's reviewed files run with the secrets. The check stops a mistake,
not a branch: a branch's own copy of ops.yml or of this file could drop it, and any workflow on any
branch can name the repository's secrets (docs/LIMITATIONS.md, 2026-11-12). deploy-branch is the one
script that runs a branch's files: it builds the checkout as it is, so its job checks out the branch
after `check`, and from then on that branch's own files run (its copy of this file and of
ci_steps.py, its pnpm settings and lockfile, tools/ops and their dependencies), in a job that holds
FLY_API_TOKEN and the job's read-only token and no other secret. Only a branch made from main once
this file is there can be deployed.

Tests: python3 tools/ci/ops_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import hashlib
import http.client
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from dataclasses import dataclass, field

# The version whose source the scripts' calls and readings were checked against (slice 10a).
FLYCTL_VERSION = "0.5.8"
FLYCTL_URL = (f"https://github.com/superfly/flyctl/releases/download/v{FLYCTL_VERSION}/"
              f"flyctl_{FLYCTL_VERSION}_Linux_x86_64.tar.gz")
FLYCTL_SHA256 = "0115ae5202c9984695e22e4e99a375565ae3d7edc462377ce00c833406c877ac"
DOWNLOAD_SECONDS = 120

MAIN = "refs/heads/main"
# deploy-branch's own rule for a branch's name (tools/ops/src/deploy-branch.ts, checkBranch), so
# that nothing it would refuse is checked out first. fullmatch, since Python's `$` would let a
# final line break through, where the script's JavaScript `$` doesn't.
BRANCH_PART = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
BRANCH_MAX = 100


@dataclass(frozen=True)
class Option:
    flag: str
    required: bool


@dataclass(frozen=True)
class Script:
    variables: tuple
    options: dict = field(default_factory=dict)
    flyctl: bool = False


SCRIPTS = {
    "fly-app-create": Script(("FLY_API_TOKEN",), {"OPS_ORG": Option("--org", False)}, flyctl=True),
    "bootstrap": Script(("DATABASE_ADMIN_URL", "DATABASE_APP_PASSWORD", "DATABASE_URL",
                         "SUPABASE_DEV_PROJECT_REF")),
    "migrate": Script(("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF")),
    "seed": Script(("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF")),
    "dev-clock": Script(("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF"),
                        {"OPS_TO": Option("--to", False)}),
    "worker-scale": Script(("FLY_API_TOKEN",), {"OPS_TO": Option("--to", True)}, flyctl=True),
    "deploy-branch": Script(("FLY_API_TOKEN", "GITHUB_TOKEN"),
                            {"OPS_BRANCH": Option("--branch", True)}, flyctl=True),
    "storage-setup": Script(("FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF"), flyctl=True),
    "supabase-probe": Script(("FLY_API_TOKEN", "SUPABASE_DEV_PROJECT_REF",
                              "SUPABASE_ACCESS_TOKEN"), flyctl=True),
}
# The repository secret each variable is given from (docs/plans/B0.md's secrets row). GITHUB_TOKEN
# is the job's own token, not a secret.
SECRETS = {
    "FLY_API_TOKEN": "FLY_API_TOKEN",
    "DATABASE_ADMIN_URL": "DEV_DATABASE_ADMIN_URL",
    "DATABASE_APP_PASSWORD": "DEV_DATABASE_APP_PASSWORD",
    "DATABASE_URL": "DEV_DATABASE_URL",
    "SUPABASE_DEV_PROJECT_REF": "SUPABASE_DEV_PROJECT_REF",
    "SUPABASE_ACCESS_TOKEN": "SUPABASE_ACCESS_TOKEN",
}
JOB_TOKEN = "GITHUB_TOKEN"
INPUTS = ("OPS_ORG", "OPS_TO", "OPS_BRANCH")
FLAGS = {"OPS_ORG": "--org", "OPS_TO": "--to", "OPS_BRANCH": "--branch"}


def branch_name(branch):
    """True when deploy-branch would take this as a branch's name: parts of letters, digits and
    . _ - between single slashes, each starting with a letter or a digit."""
    return (len(branch) <= BRANCH_MAX and ".." not in branch and not branch.endswith(".")
            and all(BRANCH_PART.fullmatch(part) and not part.endswith(".lock")
                    for part in branch.split("/")))


class Shell:
    """Runs commands in the repository. The tests replace it with a recording fake."""

    def __init__(self, root):
        self.root = root

    def run(self, cmd):
        print("+ " + " ".join(cmd), flush=True)
        return subprocess.run(cmd, cwd=self.root).returncode


def download(url, path):
    """Fetches url to path. The tests replace it."""
    with urllib.request.urlopen(url, timeout=DOWNLOAD_SECONDS) as answer, open(path, "wb") as out:
        while chunk := answer.read(1 << 20):
            out.write(chunk)


class Steps:
    def __init__(self, root, shell, environ=None, fetch=download):
        self.root = root
        self.shell = shell
        self.environ = os.environ if environ is None else environ
        self.fetch = fetch

    def value(self, name):
        return self.environ.get(name, "")

    def script(self):
        """The script OPS_SCRIPT names, or None after saying why it isn't one."""
        name = self.value("OPS_SCRIPT")
        if name not in SCRIPTS:
            print(f"ops: {name!r} isn't one of the scripts: {', '.join(SCRIPTS)}")
            return None
        return name

    def problems(self, name):
        """What is wrong with the inputs given for this script, as lines; empty when nothing is."""
        script = SCRIPTS[name]
        found = []
        for variable in INPUTS:
            given = self.value(variable)
            if given and variable not in script.options:
                found.append(f"ops: {name} takes no {FLAGS[variable]}, and one was given")
        for variable, option in script.options.items():
            if option.required and not self.value(variable):
                found.append(f"ops: {name} needs {option.flag}: give it in the run's inputs")
        branch = self.value("OPS_BRANCH")
        if branch and "OPS_BRANCH" in script.options and not branch_name(branch):
            found.append("ops: --branch takes a branch's name: letters, digits and . _ - in parts "
                         "between single slashes, each part starting with a letter or a digit")
        return found

    def validated(self):
        """The script to run, once the run is main's and its inputs are ones the script takes;
        None after saying what is wrong."""
        ref = self.value("GITHUB_REF")
        if ref != MAIN:
            print(f"ops: runs only from main, whose scripts are the reviewed ones; this run is {ref!r}. "
                  "Start it again with main chosen (deploy-branch takes the branch as its input)")
            return None
        name = self.script()
        if name is None:
            return None
        found = self.problems(name)
        for line in found:
            print(line)
        return None if found else name

    # Steps

    def check(self):
        name = self.validated()
        if name is None:
            return 1
        print(f"ops: {name}, from main")
        return 0

    def setup_flyctl(self):
        name = self.script()
        if name is None:
            return 1
        if not SCRIPTS[name].flyctl:
            print(f"ops: setup-flyctl: {name} doesn't call flyctl, so none is installed")
            return 0
        temp = self.value("RUNNER_TEMP") or tempfile.gettempdir()
        github_path = self.value("GITHUB_PATH")
        if not github_path:
            print("ops: setup-flyctl: GITHUB_PATH isn't set, so flyctl can't be put on the job's PATH")
            return 1
        folder = os.path.join(temp, f"flyctl-{FLYCTL_VERSION}")
        os.makedirs(folder, exist_ok=True)
        archive = os.path.join(folder, "flyctl.tar.gz")
        try:
            self.fetch(FLYCTL_URL, archive)
        except (OSError, http.client.HTTPException) as error:
            print(f"ops: setup-flyctl: couldn't download flyctl {FLYCTL_VERSION}: {error}")
            return 1
        with open(archive, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        if digest != FLYCTL_SHA256:
            print(f"ops: setup-flyctl: flyctl {FLYCTL_VERSION}'s archive has SHA-256 {digest}, "
                  f"not {FLYCTL_SHA256}, so it isn't used")
            return 1
        with tarfile.open(archive) as tar:
            member = next((m for m in tar.getmembers() if m.name == "flyctl"), None)
            if member is None or not member.isfile():
                print("ops: setup-flyctl: the archive has no file named flyctl")
                return 1
            source = tar.extractfile(member)
            binary = os.path.join(folder, "flyctl")
            with source, open(binary, "wb") as out:
                out.write(source.read())
        os.chmod(binary, 0o755)
        os.remove(archive)
        with open(github_path, "a", encoding="utf-8") as f:
            f.write(folder + "\n")
        print(f"ops: setup-flyctl: flyctl {FLYCTL_VERSION} (SHA-256 checked) is on the job's PATH")
        return 0

    def run(self):
        # check has said all this already; run says it again, since it is the step that starts
        # the script with its secrets.
        name = self.validated()
        if name is None:
            return 1
        missing = [v for v in SCRIPTS[name].variables if not self.value(v)]
        for variable in missing:
            # ops_steps_test.py holds ops.yml to giving every variable, so an empty one is most
            # likely a repository secret that isn't set: say which, before node starts.
            if variable == JOB_TOKEN:
                print(f"ops: {name} has no {variable}: its step in ops.yml gives it the job's token")
            else:
                print(f"ops: {name} has no {variable}: the repository secret {SECRETS[variable]} is "
                      "empty in this run (is it set? Settings, Secrets and variables, Actions)")
        if missing:
            return 1
        cmd = ["node", os.path.join("tools", "ops", "src", "main.ts"), name]
        for variable, option in SCRIPTS[name].options.items():
            given = self.value(variable)
            if given:
                cmd.append(f"{option.flag}={given}")
        return self.shell.run(cmd)


STEPS = {"check": Steps.check, "setup-flyctl": Steps.setup_flyctl, "run": Steps.run}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/ops_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return STEPS[argv[1]](Steps(root, Shell(root)))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
