"""Deliberate breakages of the audit's A6 fix on PR #118 (api/b2-worker-hardening), with round 3 of its review:
the image fails closed, by NODE_ENV or its marker, and only fly.toml's worker command goes on.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each.

  breakages_a6.py --check        count every anchor, change nothing
  breakages_a6.py A01 A02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-commit"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/a6r3/brk"))
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"])
MIGRATION = "none"
PRIV = "services/worker/src/privileges.ts"
WSTART = "services/worker/src/start.ts"
ASTART = "services/api/src/start.ts"
PROC = "services/worker/src/image-process.ts"
HARNESS = "services/worker/src/privileges-harness.ts"
DOCKER = "Dockerfile"
FLY = "fly.toml"

V = ["npx", "vitest", "run"]
SUITES = {
    "priv": ("services/worker", [*V, "src/privileges.test.ts"]),
    "wstart": ("services/worker", [*V, "src/start.test.ts"]),
    "astart": ("services/api", [*V, "src/start.test.ts"]),
    "deploy": ("tools/ops", [*V, "src/deploy-files.test.ts"]),
    "proc": ("services/worker", [*V, "src/image-process.test.ts"]),
}

B = [
    ("A01 the image's rule dropped from photoUserFor", PRIV,
     "  if (inImage(env, () => marked) && !(started && startedAsFly(status))) {", "  if (false && !(started && startedAsFly(status))) {", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A02 the image's rule for root alone only", PRIV,
     "  if (inImage(env, () => marked) && !(started && startedAsFly(status))) {", "  if (inImage(env, () => marked) && ids.euid === 0) {", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A03 the image's rule on any NODE_ENV at all", PRIV,
     '  return env.NODE_ENV === "production" || marked();', '  return (env.NODE_ENV !== undefined && env.NODE_ENV !== "") || marked();', "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A04 the image's rule dropped, seen by the entry as root", PRIV,
     "  if (inImage(env, () => marked) && !(started && startedAsFly(status))) {", "  if (false && !(started && startedAsFly(status))) {", "wstart",
     "in the image (NODE_ENV=production), stops before it reads anything when started as root alone"),
    ("A05 the worker reads its settings before the photo user", WSTART,
     "  const photoUser = photoUserFor(env, idsOf(), passwd);\n  const url = env.DATABASE_URL;\n  if (url === undefined || url === \"\") throw new Error(\"worker: DATABASE_URL isn't set\");\n",
     "  const url = env.DATABASE_URL;\n  if (url === undefined || url === \"\") throw new Error(\"worker: DATABASE_URL isn't set\");\n  const photoUser = photoUserFor(env, idsOf(), passwd);\n", "wstart",
     "in the image (NODE_ENV=production), stops before it reads anything when started as root alone"),
    ("A06 the API's refusal never called", ASTART,
     "  refuseRoot(env, ownIds());\n", "", "astart",
     "in the image (NODE_ENV=production), stops before it reads anything when started as root"),
    ("A07 the API refuses an effective root only", ASTART,
     '(ids.uid === 0 || ids.euid === 0)', '(ids.euid === 0)', "astart",
     "refuses root in the image only, by NODE_ENV or the image's marker, by its real user or its effective one"),
    ("A08 the API refuses root everywhere", ASTART,
     '(env.NODE_ENV === "production" || marked()) && (ids.uid', '(env.NODE_ENV !== "x" || marked()) && (ids.uid', "astart",
     "refuses root in the image only, by NODE_ENV or the image's marker, by its real user or its effective one"),
    ("A09 the API reads its settings before refusing root", ASTART,
     "  refuseRoot(env, ownIds());\n  const url = env.DATABASE_URL;\n  if (url === undefined || url === \"\") throw new Error(\"api: DATABASE_URL isn't set\");\n",
     "  const url = env.DATABASE_URL;\n  if (url === undefined || url === \"\") throw new Error(\"api: DATABASE_URL isn't set\");\n  refuseRoot(env, ownIds());\n", "astart",
     "in the image (NODE_ENV=production), stops before it reads anything when started as root"),
    ("A10 a photo's process started with no user in the worker's mode", PROC,
     "  if (user === undefined && (inWorkerMode(idsOf()) || inImage())) return Promise.reject(new NoPhotoUser());\n", "", "priv",
     "in the worker's mode, never starts a photo's process without the photo's user"),
    ("A11 the image names no photo user", DOCKER,
     "ENV TADAYO_PHOTO_USER=tadayo-image\n", "", "deploy",
     "makes the photo user, tadayo-image, with uid and gid 10001, no home, no shell and no password, nothing else, and names it"),
    ("A12 the image names it before it makes it", DOCKER,
     "RUN groupadd", "ENV TADAYO_PHOTO_USER=tadayo-image\nRUN groupadd", "deploy",
     "makes the photo user, tadayo-image, with uid and gid 10001, no home, no shell and no password, nothing else, and names it"),
    ("A13 fly.toml sets it again", FLY,
     '  LOG_LEVEL = "info"\n', '  LOG_LEVEL = "info"\n  TADAYO_PHOTO_USER = "tadayo-image"\n', "deploy",
     "makes the photo user, tadayo-image, with uid and gid 10001, no home, no shell and no password, nothing else, and names it"),
    ("A14 the harness's view of the checkout is writable", HARNESS,
     '["--bind", "-o", "ro", checkout, view]', '["--bind", checkout, view]', "priv",
     "the real child prepares a real photo as the photo's user, reading a read-only view of the checkout"),
    ("A15 the real child run as the worker's own user", HARNESS,
     "{ child: realChild, user: PHOTO }", "{ child: realChild }", "priv",
     "the real child prepares a real photo as the photo's user, reading a read-only view of the checkout"),
    # Round 3 of the review: the image's marker, fly.toml's start read back, the worker's group.
    ("A16 the worker ignores the image's marker", PRIV,
     '  return env.NODE_ENV === "production" || marked();', '  return env.NODE_ENV === "production";', "priv",
     "in the image by its marker alone, whatever NODE_ENV says, stops the worker just the same"),
    ("A17 the API ignores the image's marker", ASTART,
     '(env.NODE_ENV === "production" || marked()) && (ids.uid', '(env.NODE_ENV === "production") && (ids.uid', "astart",
     "refuses root in the image only, by NODE_ENV or the image's marker, by its real user or its effective one"),
    ("A18 the image writes no marker", DOCKER,
     "RUN touch /etc/tadayo-built-image\n", "", "deploy",
     "writes the image's marker, the file each entry reads to know it is in the image whatever NODE_ENV says"),
    ("A19 the worker looks for the marker elsewhere", PRIV,
     'export const IMAGE_MARKER = "/etc/tadayo-built-image";', 'export const IMAGE_MARKER = "/etc/tadayo-image";', "deploy",
     "writes the image's marker, the file each entry reads to know it is in the image whatever NODE_ENV says"),
    ("A20 the worker's mode by its user alone, root's group kept", PRIV,
     "  return ids.uid === 0 && ids.euid !== 0 && ids.egid !== 0;", "  return ids.uid === 0 && ids.euid !== 0;", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A21 fly's start read back without no-new-privs", PRIV,
     '    field("NoNewPrivs") === "1" &&\n', "", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A22 fly's start read back without its bounding set", PRIV,
     "    field(\"CapBnd\") === FLY_BOUNDING_SET &&\n", "", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A23 fly's start read back without its inheritable set", PRIV,
     '    field("CapInh") === "0000000000000000" &&\n', "", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A24 fly's start read back with root's group allowed", PRIV,
     '    !groups.split(/\\s+/).includes("0")\n', "    true\n", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A25 the rest of fly's start never asked for in the image", PRIV,
     "!(started && startedAsFly(status))", "!started", "priv",
     "in the image (NODE_ENV=production), stops the worker unless it was started as fly.toml starts it"),
    ("A26 a photo's process refused in the worker's mode only, not in the image", PROC,
     "(inWorkerMode(idsOf()) || inImage())", "inWorkerMode(idsOf())", "proc",
     "in the image (NODE_ENV=production), never starts a photo's process without the photo's user"),
    ("A27 fly.toml's worker command without no-new-privs", FLY,
     "--bounding-set=-all,+setuid,+setgid,+kill --no-new-privs -- node", "--bounding-set=-all,+setuid,+setgid,+kill -- node", "priv",
     "in the image, fly.toml's worker command itself goes past the photo user's check, and each start short of it stops there"),
    ("A28 the harness's fly start isn't fly.toml's", HARNESS,
     "    fly: words,\n", '    fly: without("--no-new-privs"),\n', "priv",
     "in the image, fly.toml's worker command itself goes past the photo user's check, and each start short of it stops there"),
]

def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def fresh():
    """A new cluster, bootstrapped: a migration once applied can't change, so each migration breakage needs one."""
    r = subprocess.run(["bash", SP + "/s4/pgci.sh"], env=ENV, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    r = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    assert r.returncode == 0, (r.stdout + r.stderr)[-800:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = swap(text, old, new) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        if path == MIGRATION or dirty:
            fresh()
            dirty = path == MIGRATION
        try:
            broken = swap(orig, old, new)
            p.write_text(broken)
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
