#!/usr/bin/env python3
"""The steps of the `ci` workflow (docs/TECH-DESIGN.md section 9; the B0 plan's slice 2).

  python3 tools/ci/ci_steps.py <step>

.github/workflows/ci.yml stays thin: each of its steps calls one step here. A step whose target
arrives in a later slice finds it instead of naming it, and passes while it is absent, so the
slices that bring the targets turn their steps on without touching tools/ci/ (guard 1). TARGETS
is the one list of them, and each step reads its own target from it:

  step          target (TARGETS)                               arrives in
  openapi       a workspace package's `openapi:check` script     slice 3
  unit          a workspace package's `test` script              slice 1 (domain), 5, 6
  web           a workspace package's `build` script             slice 10a
  db-bootstrap  db/bootstrap.sql                                 slice 4
  db-tests      a workspace package's `test:db` script           slice 4
  privacy       a workspace package's `test:privacy` script      slice 7
  swift         packages/swift/TadayoCore, TadayoAPI's Package.swift   slice 11

Slice 12 sets REQUIRE_TARGETS, and then every one of them fails when its target is missing
(T58). The ratchet keeps a target from going away once it has arrived: a branch fails when a
target present where it left main (`git merge-base origin/main HEAD`) is missing from it. A
file counts by its path, and a script once per package that has it, by the package's `name`, so
no package can lose a script that another keeps; the ratchet fails if a workspace package has no
`name`, or shares one with another. A target is retired on purpose only by adding it to
RETIRED_TARGETS, in a CI-configuration PR of its own (T58). The other steps always have their
targets:

  setup-pnpm    installs the pnpm that package.json's `packageManager` names
  install       pnpm install --frozen-lockfile
  lint, typecheck, format, copy-lint   the root scripts of the same names (format: format:check)
  db-check      the Postgres service answers, at toolchain.POSTGRES_MAJOR
  tools-tests   every tools/ci/*_test.py, each through `python3 -I -m unittest discover` with
                only tools/ci on the path, which fails when a file runs no test
  guards        guard 1 (ci_config_guard.py), guard 2 (journal_check.py --branch) and the
                ratchet; all three skipped on main
  ratchet       the ratchet alone, as the guards step runs it
  verdict       the final `ci` job: fails unless every job in $NEEDS (the workflow's
                `toJSON(needs)`) succeeded. ci_steps_test.py checks that ci.yml's `ci` job
                needs every other job and runs `if: always()`.

The package steps run `pnpm -r run <script>` without --if-present, so pnpm itself fails if it
finds no package with the script that this file found. The database steps (db-tests, privacy)
run one package at a time (--workspace-concurrency=1), because every package gets the same
database.

The database (ADR-026). ci.yml's `postgres` service on localhost:5432 is made like Supabase's:
its superuser is `supabase_admin`, and every password is `postgres`, CI's own and not a secret,
since the service lives only for the job. On every run, before it looks for db/bootstrap.sql,
db-bootstrap, as `supabase_admin`, runs SUPABASE_SQL: Supabase's API roles `anon`,
`authenticated` and `service_role` as Supabase's image has them, and the role `postgres` as
Supabase's image makes it, not a superuser but the database's owner. Each is made with a plain
CREATE ROLE, so a role already there fails the step. It then checks, connected as `postgres`,
that `postgres` isn't a superuser. db/bootstrap.sql is the file `ops` runs against `dev`, where
Supabase has made those roles, so it doesn't make them. db-bootstrap runs it as `postgres` with
`psql -v ON_ERROR_STOP=1 -v app_password=<password> -f db/bootstrap.sql`, and the file must give
the role `tadayo_app` that password. The tests then get DATABASE_URL (as `tadayo_app`) and
DATABASE_ADMIN_URL (`supabase_admin`, the superuser). A local run needs a server made the same
way (`initdb --username=supabase_admin`); see docs/JOURNAL.md section 1.1.

Exit 0 when the step passes or is skipped, 1 when it fails, 2 on bad usage.

Tests: python3 tools/ci/ci_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import toolchain  # noqa: E402

REQUIRE_TARGETS = False  # slice 12 turns this on (T58)

ADMIN_URL = "postgresql://supabase_admin:postgres@localhost:5432/postgres"
BOOTSTRAP_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
APP_PASSWORD = "tadayo-app-ci-only"
APP_URL = f"postgresql://tadayo_app:{APP_PASSWORD}@localhost:5432/postgres"
# Run as supabase_admin, in one transaction (ADR-026; supabase/postgres, migrations/db/).
SUPABASE_SQL = """
-- Supabase's API roles as its image has them: made without login by its initial schema
-- (init-scripts/00000000000000-initial-schema.sql), then made to inherit
-- (migrations/20230529180330_alter_api_roles_for_inherit.sql); service_role bypasses row-level
-- security.
CREATE ROLE anon NOLOGIN INHERIT;
CREATE ROLE authenticated NOLOGIN INHERIT;
CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS;
-- Supabase's `postgres`: made a superuser that owns the database (migrate.sh), then demoted
-- (migrations/10000000000000_demote-postgres.sql), and on 16 and later given these roles with
-- the ADMIN option (migrations/20250605172253_grant_with_admin_to_postgres_16_and_above.sql,
-- less `authenticator`, which CI doesn't make).
CREATE ROLE postgres NOSUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS
  PASSWORD 'postgres';
ALTER DATABASE postgres OWNER TO postgres;
GRANT ALL ON DATABASE postgres TO postgres;
GRANT anon, authenticated, service_role, pg_monitor, pg_read_all_data, pg_signal_backend
  TO postgres WITH ADMIN OPTION;
"""
NOT_SUPERUSER_SQL = "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
SWIFT_PACKAGES = ["packages/swift/TadayoCore", "packages/swift/TadayoAPI"]
# The targets that arrive in later slices: (step, kind, target, the slice that brings it).
TARGETS = [
    ("openapi", "script", "openapi:check", "slice 3"),
    ("unit", "script", "test", "slice 1"),
    ("web", "script", "build", "slice 10a"),
    ("db-bootstrap", "file", "db/bootstrap.sql", "slice 4"),
    ("db-tests", "script", "test:db", "slice 4"),
    ("privacy", "script", "test:privacy", "slice 7"),
] + [("swift", "file", f"{package}/Package.swift", "slice 11") for package in SWIFT_PACKAGES]
# Targets the ratchet lets go, each retired on purpose in a CI-configuration PR of its own (T58):
# (step, package name, script) for a script, (step, "", path) for a file.
RETIRED_TARGETS = set()
# pnpm's own settings can change how every script runs (`scriptShell`, `nodeOptions`, a pnpmfile's
# `updateConfig`), and pnpm-workspace.yaml and a root pnpmfile aren't CI configuration to guard 1.
# So the pnpm steps refuse any pnpm-workspace.yaml setting not listed here, and any root pnpmfile:
# adding one is a CI-configuration PR (T58). pnpm 12 ignores such settings in .npmrc.
PNPM_SETTINGS = {"packages", "allowBuilds"}
# allowBuilds may only deny: each entry is a package matcher and `false`, so a dependency's build
# script never runs (pnpm 12's strictDepBuilds fails an install on a build nobody ruled on). An
# entry that lets one run (`true`, or anything but `false`) is refused, so approving a build is a
# CI-configuration PR (T58). The matcher is bare, single-quoted or double-quoted, and none of the
# three can hold a backslash (a double-quoted key's escape, which would hide where the key ends),
# `$` or braces. The file is read as YAML reads it: printable ASCII only, so no other character can
# end a line, act as a space, or hide text in what looks like a comment (`workspace_packages`).
DENIED_BUILD = re.compile(r"""^ +(?:'([^'\\\s${}]+)'|"([^"\\\s${}]+)"|([@A-Za-z0-9][@A-Za-z0-9._/|^~<>= -]*?))"""
                          r": +false(?: +#[ -~]*| *)$")
PACKAGE_MANAGER = re.compile(r"^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[0-9a-f]+)?$")


def targets_of(step):
    """The step's (kind, target, slice) entries in TARGETS."""
    found = [(kind, target, slice_name) for s, kind, target, slice_name in TARGETS if s == step]
    if not found:
        raise KeyError(f"no target for the step {step!r} in TARGETS")
    return found


def describe(target):
    step, package, name = target
    what = f"{package}'s `{name}` script" if package else name
    return f"{what} (the `{step}` step)"


class Shell:
    """Runs commands in the repository. The tests replace it with a recording fake."""

    def __init__(self, root):
        self.root = root

    def run(self, cmd, env=None):
        print("+ " + " ".join(cmd), flush=True)
        return subprocess.run(cmd, cwd=self.root, env=self._env(env)).returncode

    def output(self, cmd, env=None):
        result = subprocess.run(cmd, cwd=self.root, env=self._env(env), capture_output=True,
                                text=True)
        return result.returncode, result.stdout + result.stderr

    @staticmethod
    def _env(extra):
        if not extra:
            return None
        env = dict(os.environ)
        env.update(extra)
        return env


class Steps:
    def __init__(self, root, shell, require_targets=REQUIRE_TARGETS, environ=None):
        self.root = root
        self.shell = shell
        self.require_targets = require_targets
        self.environ = os.environ if environ is None else environ

    # Helpers

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def absent(self, step, target, slice_name):
        if self.require_targets:
            print(f"ci: {step}: {target} is missing (every step needs its target from slice 12, T58)")
            return 1
        print(f"ci: {step}: {target} isn't here yet ({slice_name}), so this step passes empty")
        return 0

    def workspace_packages(self):
        """The directories pnpm-workspace.yaml lists that hold a package.json, sorted."""
        # Universal newlines turn \r\n and \r into \n, as YAML reads them. Any other character
        # outside printable ASCII is refused: str.splitlines(), str.strip() and \s treat some as line
        # ends or spaces where pnpm's YAML parser doesn't, which could hide text from this check.
        with open(self.path("pnpm-workspace.yaml"), encoding="utf-8") as f:
            text = f.read()
        for number, line in enumerate(text.split("\n"), start=1):
            if re.search(r"[^ -~]", line):
                raise ValueError(f"pnpm-workspace.yaml: line {number} holds a character other than "
                                 "printable ASCII (a tab, a control character or non-ASCII text); "
                                 "write it in printable ASCII only")
        patterns, inside = [], None
        for line in text.split("\n"):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith((" ", "-")):
                key = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(#.*)?$", line.rstrip())
                setting = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):", line)
                if setting and setting.group(1) not in PNPM_SETTINGS:
                    raise ValueError(f"pnpm-workspace.yaml: the setting `{setting.group(1)}` can "
                                     "change how scripts run; add it to PNPM_SETTINGS in "
                                     "tools/ci/ci_steps.py, in a CI-configuration PR (T58)")
                if not key:
                    raise ValueError(f"pnpm-workspace.yaml: can't read the line {line!r}")
                inside = key.group(1)
                continue
            if inside == "allowBuilds":
                if not DENIED_BUILD.match(line):
                    raise ValueError(f"pnpm-workspace.yaml: allowBuilds may only deny a "
                                     f"dependency's build script (`<package>: false`); {line!r} "
                                     "isn't one, and approving a build is a CI-configuration PR "
                                     "(T58)")
                continue
            if inside != "packages":
                raise ValueError(f"pnpm-workspace.yaml: can't read the line {line!r}")
            match = re.match(r"^\s*-\s*(['\"]?)([A-Za-z0-9_.*][A-Za-z0-9_./*-]*)\1\s*(?:#.*)?$", line)
            if not match:
                raise ValueError(f"pnpm-workspace.yaml: can't read the line {line!r}")
            patterns.append(match.group(2))
        if not patterns:
            raise ValueError("pnpm-workspace.yaml lists no packages")
        found = set()
        for pattern in patterns:
            # pnpm matches these differently from glob.glob, so a package could be run that this
            # file doesn't see: refuse them rather than disagree.
            if pattern.startswith("!"):
                raise ValueError("pnpm-workspace.yaml: exclusions aren't supported here")
            if "**" in pattern:
                raise ValueError("pnpm-workspace.yaml: `**` isn't supported here")
            # Relative to the root, so a root path holding `[`, `*` or `?` isn't read as a pattern.
            for directory in glob.glob(pattern, root_dir=self.root):
                if any(os.path.isfile(self.path(directory, name))
                       for name in ("package.yaml", "package.json5")):
                    raise ValueError(f"{directory}: only package.json manifests are supported here")
                if os.path.isfile(self.path(directory, "package.json")):
                    found.add(os.path.normpath(directory))
        return sorted(found)

    def manifests(self):
        """(directory, package name or None, scripts) for each workspace package."""
        result = []
        for directory in self.workspace_packages():
            with open(self.path(directory, "package.json"), encoding="utf-8") as f:
                manifest = json.load(f)
            if not isinstance(manifest, dict):
                raise ValueError(f"{directory}/package.json isn't a JSON object")
            scripts = manifest.get("scripts")
            if scripts is None:
                scripts = {}
            if not isinstance(scripts, dict):
                raise ValueError(f"{directory}/package.json: `scripts` isn't an object")
            result.append((directory, manifest.get("name"), scripts))
        return result

    def packages_with_script(self, script):
        return [directory for directory, _, scripts in self.manifests() if script in scripts]

    def package_step(self, step, env=None, one_at_a_time=False):
        (kind, script, slice_name), = targets_of(step)
        assert kind == "script", step
        problem = self.pnpm_settings_problem()
        if problem:
            print(f"ci: {step}: {problem}")
            return 1
        packages = self.packages_with_script(script)
        if not packages:
            return self.absent(step, f"a workspace package's `{script}` script", slice_name)
        print(f"ci: {step}: `{script}` in " + ", ".join(packages))
        # No --if-present: if pnpm finds no package with the script, it fails instead of passing.
        # pnpm's settings were checked above.
        command = ["pnpm", "-r"]
        if one_at_a_time:
            command.append("--workspace-concurrency=1")
        return self.shell.run(command + ["run", script], env=env)

    def present_targets(self):
        """The targets of TARGETS this tree has: (step, "", path) for each file, and
        (step, package name, script) for each workspace package that has a step's script."""
        manifests = self.manifests()
        # A script counts by its package's name, so each package needs a name of its own:
        # without one, or with another's, a package could lose a script unseen.
        named = {}
        for directory, name, _ in manifests:
            if not isinstance(name, str) or not name:
                raise ValueError(f"{directory}/package.json has no `name`")
            if name in named:
                raise ValueError(f"{named[name]} and {directory} are both named {name}")
            named[name] = directory
        present = set()
        for step, kind, target, _ in TARGETS:
            if kind == "file":
                if os.path.isfile(self.path(*target.split("/"))):
                    present.add((step, "", target))
                continue
            for _, name, scripts in manifests:
                if target in scripts:
                    present.add((step, name, target))
        return present

    def pnpm_settings_problem(self):
        """Why pnpm's settings can't be trusted to run the scripts as written, or None."""
        pnpmfiles = sorted(glob.glob(".pnpmfile*", root_dir=self.root))
        if pnpmfiles:
            return (f"{', '.join(pnpmfiles)} can change how scripts run; a pnpmfile is refused "
                    "here (T58)")
        try:
            self.workspace_packages()
        except (OSError, ValueError) as error:
            return str(error)
        return None

    def pnpm(self, step, args, env=None):
        problem = self.pnpm_settings_problem()
        if problem:
            print(f"ci: {step}: {problem}")
            return 1
        return self.shell.run(["pnpm", *args], env=env)

    def root_script(self, script):
        return self.pnpm(script, ["run", script])

    def database_env(self):
        return {"DATABASE_URL": APP_URL, "DATABASE_ADMIN_URL": ADMIN_URL}

    def on_main(self):
        branch = self.environ.get("GITHUB_REF_NAME")
        if not branch:
            code, out = self.shell.output(["git", "rev-parse", "--abbrev-ref", "HEAD"])
            branch = out.strip() if code == 0 else ""
        return branch == "main"

    # Steps

    def setup_pnpm(self):
        with open(self.path("package.json"), encoding="utf-8") as f:
            manager = json.load(f).get("packageManager", "")
        match = PACKAGE_MANAGER.match(manager)
        if not match:
            print(f"ci: setup-pnpm: package.json's packageManager {manager!r} isn't pnpm@<x.y.z>")
            return 1
        return self.shell.run(["npm", "install", "--global", f"pnpm@{match.group(1)}"])

    def install(self):
        return self.pnpm("install", ["install", "--frozen-lockfile"])

    def lint(self):
        return self.root_script("lint")

    def typecheck(self):
        return self.root_script("typecheck")

    def format(self):
        return self.root_script("format:check")

    def copy_lint(self):
        return self.root_script("copy-lint")

    def openapi(self):
        return self.package_step("openapi")

    def unit(self):
        return self.package_step("unit")

    def web(self):
        return self.package_step("web")

    def db_check(self):
        code, out = self.shell.output(
            ["psql", ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-tAc", "SHOW server_version_num"])
        if code != 0:
            print(f"ci: db-check: the Postgres service didn't answer: {out.strip()}")
            return 1
        version = out.strip()
        if not version.isdigit() or int(version) // 10000 != toolchain.POSTGRES_MAJOR:
            print(f"ci: db-check: the service runs Postgres {version}, not "
                  f"{toolchain.POSTGRES_MAJOR} (tools/ci/toolchain.py and ci.yml disagree)")
            return 1
        print(f"ci: db-check: Postgres {version}")
        return 0

    def db_bootstrap(self):
        # Supabase's roles and its `postgres` on every run (ADR-026), so Postgres 17 runs this
        # before db/bootstrap.sql exists.
        code = self.shell.run(["psql", ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", SUPABASE_SQL])
        if code != 0:
            return code
        code, out = self.shell.output(
            ["psql", BOOTSTRAP_URL, "-v", "ON_ERROR_STOP=1", "-tAc", NOT_SUPERUSER_SQL])
        if code != 0 or out.strip() != "f":
            print("ci: db-bootstrap: `postgres` must answer and not be a superuser, as on Supabase "
                  f"(ADR-026); it answered: {out.strip()!r}")
            return 1
        print("ci: db-bootstrap: `postgres` is made as Supabase makes it, not a superuser")
        (_, bootstrap, slice_name), = targets_of("db-bootstrap")
        if not os.path.isfile(self.path(*bootstrap.split("/"))):
            return self.absent("db-bootstrap", bootstrap, slice_name)
        return self.shell.run(["psql", BOOTSTRAP_URL, "-v", "ON_ERROR_STOP=1",
                               "-v", f"app_password={APP_PASSWORD}", "-f", bootstrap])

    def db_tests(self):
        return self.package_step("db-tests", env=self.database_env(), one_at_a_time=True)

    def privacy(self):
        return self.package_step("privacy", env=self.database_env(), one_at_a_time=True)

    def tools_tests(self):
        tests = sorted(glob.glob(os.path.join("tools", "ci", "*_test.py"), root_dir=self.root))
        if not tests:
            print("ci: tools-tests: no tools/ci/*_test.py found")
            return 1
        # unittest exits 5 when a file runs no test, so a file that forgets unittest.main() or
        # holds pytest-style functions fails instead of passing empty. -I and discover with
        # tools/ci as the top level keep the root off the path, so neither a root unittest.py
        # nor a tools/__init__.py (outside guard 1's paths) can stand in for the tests.
        ci_dir = os.path.join("tools", "ci")
        failed = [t for t in tests
                  if self.shell.run([sys.executable, "-I", "-m", "unittest", "discover", "-s",
                                     ci_dir, "-t", ci_dir, "-p", os.path.basename(t)]) != 0]
        for test in failed:
            print(f"ci: tools-tests: {test} failed")
        return 1 if failed else 0

    def swift(self):
        result = 0
        for _, manifest, slice_name in targets_of("swift"):
            package = os.path.dirname(manifest)
            if not os.path.isfile(self.path(*manifest.split("/"))):
                result |= self.absent("swift", manifest, slice_name)
                continue
            result |= self.shell.run(["docker", "run", "--rm", "-v", f"{self.root}:/work", "-w",
                                      "/work", toolchain.SWIFT_IMAGE, "swift", "test",
                                      "--package-path", package])
        return 1 if result else 0

    def guards(self):
        if self.on_main():
            print("ci: guards: skipped on main")
            return 0
        guard_1 = self.shell.run([sys.executable, "tools/ci/ci_config_guard.py"])
        guard_2 = self.shell.run([sys.executable, "tools/ci/journal_check.py", "--branch"])
        ratchet = self.shell.run([sys.executable, "tools/ci/ci_steps.py", "ratchet"])
        return 1 if guard_1 or guard_2 or ratchet else 0

    def ratchet(self):
        code, out = self.shell.output(["git", "merge-base", "origin/main", "HEAD"])
        base = out.strip()
        if code != 0 or not re.fullmatch(r"[0-9a-f]{40,64}", base):
            print("ci: ratchet: can't find where this branch left origin/main "
                  "(fetch it with full history)")
            return 1
        scratch = tempfile.mkdtemp(prefix="ci-ratchet-")
        tree = os.path.join(scratch, "base")
        try:
            code, out = self.shell.output(["git", "worktree", "add", "--detach", tree, base])
            if code != 0:
                print(f"ci: ratchet: can't check out {base[:12]}: {out.strip()}")
                return 1
            try:
                before = Steps(tree, self.shell).present_targets()
                now = self.present_targets()
            except (OSError, ValueError) as error:
                print(f"ci: ratchet: can't read the targets: {error}")
                return 1
        finally:
            self.shell.output(["git", "worktree", "remove", "--force", tree])
            shutil.rmtree(scratch, ignore_errors=True)
        lost = sorted(before - now - RETIRED_TARGETS)
        for target in lost:
            print(f"ci: ratchet: {describe(target)} is on main at {base[:12]} but not on this "
                  "branch (T58). To retire it on purpose, add it to RETIRED_TARGETS in "
                  "tools/ci/ci_steps.py, in a CI-configuration PR of its own")
        if lost:
            return 1
        print(f"ci: ratchet: passed: each of the {len(before)} target(s) on main at {base[:12]} is "
              f"still here or retired ({len(now)} here)")
        return 0

    def verdict(self):
        try:
            needs = json.loads(self.environ.get("NEEDS", ""))
        except ValueError:
            print("ci: verdict: NEEDS isn't the workflow's toJSON(needs)")
            return 1
        if not isinstance(needs, dict) or not needs:
            print("ci: verdict: no jobs to judge")
            return 1
        bad = {job: (info or {}).get("result") for job, info in needs.items()
               if (info or {}).get("result") != "success"}
        for job, result in sorted(bad.items()):
            print(f"ci: verdict: {job} {result}")
        if bad:
            return 1
        print("ci: verdict: every job succeeded: " + ", ".join(sorted(needs)))
        return 0


STEPS = {
    "setup-pnpm": Steps.setup_pnpm, "install": Steps.install, "lint": Steps.lint,
    "typecheck": Steps.typecheck, "format": Steps.format, "copy-lint": Steps.copy_lint,
    "openapi": Steps.openapi, "unit": Steps.unit, "web": Steps.web, "db-check": Steps.db_check,
    "db-bootstrap": Steps.db_bootstrap, "db-tests": Steps.db_tests, "privacy": Steps.privacy,
    "tools-tests": Steps.tools_tests, "swift": Steps.swift, "guards": Steps.guards,
    "ratchet": Steps.ratchet, "verdict": Steps.verdict,
}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/ci_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(HERE))
    return STEPS[argv[1]](Steps(root, Shell(root)))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
