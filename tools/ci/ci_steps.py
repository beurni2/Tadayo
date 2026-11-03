#!/usr/bin/env python3
"""The steps of the `ci` workflow (docs/TECH-DESIGN.md section 9; the B0 plan's slice 2).

  python3 tools/ci/ci_steps.py <step>

.github/workflows/ci.yml stays thin: each of its steps calls one step here. A step whose target
arrives in a later slice finds it instead of naming it, and passes while it is absent, so the
slices that bring the targets turn their steps on without touching tools/ci/ (guard 1):

  step          target                                         arrives in
  openapi       a workspace package's `openapi:check` script     slice 3
  unit          a workspace package's `test` script              slice 1 (domain), 5, 6
  web           a workspace package's `build` script             slice 10a
  db-bootstrap  db/bootstrap.sql                                 slice 4
  db-tests      a workspace package's `test:db` script           slice 4
  privacy       a workspace package's `test:privacy` script      slice 7
  swift         packages/swift/TadayoCore, TadayoAPI's Package.swift   slice 11

Slice 12 sets REQUIRE_TARGETS, and then every one of them fails when its target is missing
(T58). The other steps always have their targets:

  setup-pnpm    installs the pnpm that package.json's `packageManager` names
  install       pnpm install --frozen-lockfile
  lint, typecheck, format, copy-lint   the root scripts of the same names (format: format:check)
  db-check      the Postgres service answers, at toolchain.POSTGRES_MAJOR
  tools-tests   every tools/ci/*_test.py
  guards        guard 1 (ci_config_guard.py) and guard 2 (journal_check.py --branch);
                both skipped on main
  verdict       the final `ci` job: fails unless every job in $NEEDS (the workflow's
                `toJSON(needs)`) succeeded

The database steps run against the `postgres` service that ci.yml declares on localhost:5432
with the password `postgres`. Before db/bootstrap.sql they create Supabase's roles `anon`,
`authenticated` and `service_role` as Supabase has them (no login; service_role bypasses
row-level security), so db/bootstrap.sql is the same file `ops` runs against `dev` and doesn't
create them. It is run as the superuser with
`psql -v ON_ERROR_STOP=1 -v app_password=<password> -f db/bootstrap.sql`, and must give the role
`tadayo_app` that password. The tests then get DATABASE_URL (as `tadayo_app`) and
DATABASE_ADMIN_URL (the superuser). The password is CI's own, not a secret: the service lives
only for the job.

Exit 0 when the step passes or is skipped, 1 when it fails, 2 on bad usage.

Tests: python3 tools/ci/ci_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import glob
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import toolchain  # noqa: E402

REQUIRE_TARGETS = False  # slice 12 turns this on (T58)

ADMIN_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
APP_PASSWORD = "tadayo-app-ci-only"
APP_URL = f"postgresql://tadayo_app:{APP_PASSWORD}@localhost:5432/postgres"
SWIFT_PACKAGES = ["packages/swift/TadayoCore", "packages/swift/TadayoAPI"]
SUPABASE_ROLES_SQL = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;
"""
PACKAGE_MANAGER = re.compile(r"^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[0-9a-f]+)?$")


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
        with open(self.path("pnpm-workspace.yaml"), encoding="utf-8") as f:
            lines = f.read().splitlines()
        patterns, inside = [], False
        for line in lines:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith((" ", "-")):
                inside = line.rstrip() == "packages:"
                continue
            if inside:
                match = re.match(r"^\s*-\s*(['\"]?)([A-Za-z0-9_./*-]+)\1\s*(?:#.*)?$", line)
                if not match:
                    raise ValueError(f"pnpm-workspace.yaml: can't read the line {line!r}")
                patterns.append(match.group(2))
        if not patterns:
            raise ValueError("pnpm-workspace.yaml lists no packages")
        found = set()
        for pattern in patterns:
            if pattern.startswith("!"):
                raise ValueError("pnpm-workspace.yaml: exclusions aren't supported here")
            for directory in glob.glob(self.path(pattern)):
                if os.path.isfile(os.path.join(directory, "package.json")):
                    found.add(os.path.relpath(directory, self.root))
        return sorted(found)

    def packages_with_script(self, script):
        names = []
        for directory in self.workspace_packages():
            with open(self.path(directory, "package.json"), encoding="utf-8") as f:
                if script in (json.load(f).get("scripts") or {}):
                    names.append(directory)
        return names

    def package_script(self, step, script, slice_name, env=None):
        packages = self.packages_with_script(script)
        if not packages:
            return self.absent(step, f"a workspace package's `{script}` script", slice_name)
        print(f"ci: {step}: `{script}` in " + ", ".join(packages))
        return self.shell.run(["pnpm", "-r", "--if-present", "run", script], env=env)

    def root_script(self, script):
        return self.shell.run(["pnpm", "run", script])

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
        return self.shell.run(["pnpm", "install", "--frozen-lockfile"])

    def lint(self):
        return self.root_script("lint")

    def typecheck(self):
        return self.root_script("typecheck")

    def format(self):
        return self.root_script("format:check")

    def copy_lint(self):
        return self.root_script("copy-lint")

    def openapi(self):
        return self.package_script("openapi", "openapi:check", "slice 3")

    def unit(self):
        return self.package_script("unit", "test", "slice 1")

    def web(self):
        return self.package_script("web", "build", "slice 10a")

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
        if not os.path.isfile(self.path("db", "bootstrap.sql")):
            return self.absent("db-bootstrap", "db/bootstrap.sql", "slice 4")
        code = self.shell.run(["psql", ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", SUPABASE_ROLES_SQL])
        if code != 0:
            return code
        return self.shell.run(["psql", ADMIN_URL, "-v", "ON_ERROR_STOP=1",
                               "-v", f"app_password={APP_PASSWORD}", "-f", "db/bootstrap.sql"])

    def db_tests(self):
        return self.package_script("db-tests", "test:db", "slice 4", env=self.database_env())

    def privacy(self):
        return self.package_script("privacy", "test:privacy", "slice 7", env=self.database_env())

    def tools_tests(self):
        tests = sorted(glob.glob(self.path("tools", "ci", "*_test.py")))
        if not tests:
            print("ci: tools-tests: no tools/ci/*_test.py found")
            return 1
        failed = [t for t in tests
                  if self.shell.run([sys.executable, os.path.relpath(t, self.root)]) != 0]
        for test in failed:
            print(f"ci: tools-tests: {os.path.relpath(test, self.root)} failed")
        return 1 if failed else 0

    def swift(self):
        present = [p for p in SWIFT_PACKAGES if os.path.isfile(self.path(p, "Package.swift"))]
        result = 0
        for package in SWIFT_PACKAGES:
            if package not in present:
                result |= self.absent("swift", f"{package}/Package.swift", "slice 11")
        for package in present:
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
        return 1 if guard_1 or guard_2 else 0

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
    "verdict": Steps.verdict,
}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/ci_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(HERE))
    return STEPS[argv[1]](Steps(root, Shell(root)))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
