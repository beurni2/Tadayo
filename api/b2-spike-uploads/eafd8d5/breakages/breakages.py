"""Deliberate breakages of round 2's fixes in spike S1's first PR (api/b2-spike-uploads, PR #109), one change
each, on the tree the round 2 commit holds.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. A breakage of the migration makes the local
database again from the changed file first, and the database is made again from the true file after the last
of them. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py K01 M02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-upl-brk"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(SP) / "upl-brk2/out"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
DOMAIN = "packages/domain/src/media/upload.ts"
OWNS = "packages/domain/src/authorization/upload.ts"
STORAGE = "services/api/src/media/storage.ts"
ROUTE = "services/api/src/media/uploads.ts"
MIG = "db/migrations/0016_upload_reservation.sql"
PROBE = "tools/ops/src/supabase-probe.ts"
JUDGE = "tests/src/privacy/upload.ts"
SCANNER = "tests/src/privacy/scanner.ts"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
PRIV = ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts"]
SUITES = {
    "db": ("tests", [*DB, "src/db/uploads.test.ts"]),
    "mig": ("tests", [*DB, "src/db/uploads.test.ts"]),
    "owns": ("packages/domain", ["npx", "vitest", "run", "src/authorization/upload.test.ts"]),
    "storage": ("services/api", ["npx", "vitest", "run", "src/media/storage.test.ts"]),
    "route": ("services/api", ["npx", "vitest", "run", "src/media/uploads.test.ts"]),
    "probe": ("tools/ops", ["npx", "vitest", "run", "src/supabase-probe.test.ts"]),
    "judge": ("tests", [*PRIV, "src/privacy/upload.test.ts"]),
    "scanner": ("tests", [*PRIV, "src/privacy/scanner.test.ts"]),
}

TESTING = "services/api/src/testing.ts"
S_DUP = "reads Storage's Duplicate, the object already there, as no URL to give, and no other 409 or refusal as it"
R_BYTES = "answers a replay once the bytes are in as the receipt does, with no URL, since Storage signs nothing for them"
J_BYTES = "answers the stored answer alone, with no URL, once the upload's bytes are in, pending though it is"
L_LOCK = "keeps no row that names the upload waiting while it is handed to preparation: its lock is FOR NO KEY UPDATE"
P_RESIGN = "names the second signing's control when Storage signs again for the object that is there, or refuses it"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # Storage's client (R2-1: its Duplicate on signing is the bytes in, and nothing else is).
    ("S04 Storage's Duplicate on signing is read as Storage unavailable", STORAGE,
     "      if (status !== 200 && logical === 409) return null;\n", "", "storage", S_DUP),
    ("S05 a 409 in a 200's body is read as the bytes in", STORAGE,
     "if (status !== 200 && logical === 409) return null;", "if (logical === 409) return null;", "storage", S_DUP),
    # The fake Storage and the route (R2-1).
    ("F01 the fake Storage signs for an object that is there", TESTING,
     "      if (objects.has(objectKey)) return Promise.resolve(null);\n", "", "route", R_BYTES),
    ("R03 the route answers a replay with the bytes in 503", ROUTE,
     "    if (signed === null) return created(reply, made.body);\n",
     "    if (signed === null) return unavailable(reply);\n", "route", R_BYTES),
    # The judge (R2-1).
    ("J03 the judge wants a URL while the upload is pending, whatever its bytes", JUDGE,
     " && !stored.has(upload.objectKey);", ";", "judge", J_BYTES),
    # The preparation's lock (R2-3).
    ("L01 the preparation locks the upload FOR UPDATE", DOMAIN,
     "FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;", "FROM app.uploads WHERE id = ${id} FOR UPDATE`;", "db", L_LOCK),
    # The probe's second signing (R2-1).
    ("P04 the probe takes any refusal of the second signing", PROBE,
     "settle(resigned, (reply) => reply.status !== 200 && storageStatus(reply) === 409)",
     "settle(resigned, (reply) => reply.status !== 200)", "probe", P_RESIGN),
    ("P05 the probe takes a 409 in a 200's body as the second signing refused", PROBE,
     "settle(resigned, (reply) => reply.status !== 200 && storageStatus(reply) === 409)",
     "settle(resigned, (reply) => storageStatus(reply) === 409)", "probe", P_RESIGN),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def remake():
    a = run(["bash", SP + "/s4/pgci.sh"])
    b = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    return a.returncode, b.returncode, (b.stdout + b.stderr)[-400:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def edit(text, old, new):
    if isinstance(old, list):
        for a, b in old:
            text = swap(text, a, b)
        return text
    return swap(text, old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = edit(text, old, new) != text and suite in SUITES and len(words) > 6
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
        try:
            broken = edit(orig, old, new)
            p.write_text(broken)
            # The breakage alone: the file as it stands before against the file broken.
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            note = ""
            if suite == "mig":
                dirty = True
                made = remake()
                note = f" (database made again: {made[0]} {made[1]})"
                if made[1] != 0:
                    note += " " + made[2].replace("\n", " | ")
            elif dirty:
                p.write_text(orig)
                made = remake()
                dirty = False
                p.write_text(edit(orig, old, new))
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}{note}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    if dirty:
        print("database made again from the true migration:", remake()[:2], flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
