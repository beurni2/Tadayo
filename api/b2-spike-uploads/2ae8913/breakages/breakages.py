"""Deliberate breakages of round 1's fixes in spike S1's first PR (api/b2-spike-uploads, PR #109), one change
each, in a scratch worktree at the PR's head.

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
OUT = pathlib.Path(SP) / "upl-brk/out"
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

D_SECOND = "gives the neutral not-found for a second upload under the same slot with a new key, pending or preparing"
D_RACE = "puts two uploads with new keys under one slot in order by the counter: the one that waited makes nothing"
M_WAITS = "makes an upload written past the domain wait for a release in flight, then refuses it under the released"
M_INDEX = "refuses a second upload under a slot past the domain while the first isn't rejected, and takes one after"
O_EXPIRY = "is its owner's until its expires_at, and nobody's from it on"
O_OTHER = "is never another account's, and an upload nobody has is nobody's"
S_CLAIMS = "believes a token only for the object it asked for, with upsert off in the token, where Storage reads it"
S_OBJECT = "fails on any other answer, never reading it as missing, nor a 200 whose body isn't an object's as there"
R_UNTIL = "gives the signed upload as good for Storage's lifetime, and never past the upload's own expires_at"
R_HEADERS = "names its headers itself, the upload's own type and upsert off, and passes on nothing else Storage's"
P_TOKEN = "names the control of the upload URL when its token isn't one the API believes: its object, upsert false"
P_OVER = "names the overwrite's control when the signed URL puts over the object, or Storage answers it otherwise"
J_ONE = "gives the neutral not-found for a slot that holds an upload but rejected ones: one slot, one photo"
J_REPLAY = "answers PROFILE_INCOMPLETE to an unfinished account, and the neutral not-found to anyone the slot isn't"
C_PAST = "catches a signed upload good past its upload's own expiry, and takes one shorter than a minute that ends"

# (name, file, old, new, suite, words a failing test's name must hold); `old` may be a list of pairs.
B = [
    # The domain (P2: one slot, one photo).
    ("K01 the domain lets a slot that holds an upload take another", DOMAIN,
     '  if (holding.length > 0) throw new Refused("NOT_FOUND");\n', "", "db", D_SECOND),
    ("K02 the domain counts a rejected upload as holding the slot", DOMAIN,
     "WHERE reservation_id = ${reservationId} AND state <> 'rejected' LIMIT 1",
     "WHERE reservation_id = ${reservationId} LIMIT 1", "db", "makes one more upload, for a new object, under a slot whose upload was rejected"),
    # Migration 0016 (D1: the guard's FOR SHARE; P2: the index).
    ("M01 the guard reads the reservation without FOR SHARE", MIG, "\n    FOR SHARE;\n", ";\n", "mig", M_WAITS),
    ("M02 no index keeps one upload per slot", MIG,
     "CREATE UNIQUE INDEX uploads_one_per_reservation ON app.uploads (reservation_id)\n  WHERE reservation_id IS NOT NULL AND state <> 'rejected';\n",
     "", "mig", M_INDEX),
    ("M03 the index counts a rejected upload", MIG,
     "  WHERE reservation_id IS NOT NULL AND state <> 'rejected';\n", "  WHERE reservation_id IS NOT NULL;\n", "mig", M_INDEX),
    # Whose an upload is (P5).
    ("O01 an upload is its owner's at its expires_at", OWNS,
     "Temporal.Instant.compare(now, upload.expiresAt) < 0", "Temporal.Instant.compare(now, upload.expiresAt) <= 0", "owns", O_EXPIRY),
    ("O02 an upload is anyone's", OWNS, "upload.owner === userId && ", "", "owns", O_OTHER),
    # Storage's client (P1: the token's claims; T9: an object's details).
    ("S01 a token with upsert on is believed", STORAGE,
     "if (url !== `${UPLOADS_BUCKET}/${objectKey}` || upsert !== false) return undefined;",
     "if (url !== `${UPLOADS_BUCKET}/${objectKey}`) return undefined;", "storage", S_CLAIMS),
    ("S02 a token for another object is believed", STORAGE,
     "if (url !== `${UPLOADS_BUCKET}/${objectKey}` || upsert !== false) return undefined;",
     "if (upsert !== false) return undefined;", "storage", S_CLAIMS),
    ("S03 any 200 is an object there", STORAGE,
     'if (status === 200 && logical === 200 && typeof json === "object" && json !== null && !Array.isArray(json)) {',
     "if (status === 200 && logical === 200) {", "storage", S_OBJECT),
    # The route (D4: never past the upload's expiry; P3: headers by name).
    ("R01 the signed upload outlives its upload", ROUTE,
     "const until = Temporal.Instant.compare(lifetime, toSign.expiresAt) < 0 ? lifetime : toSign.expiresAt;",
     "const until = lifetime;", "route", R_UNTIL),
    ("R02 the signed upload drops x-upsert", ROUTE,
     'headers: { "Content-Type": toSign.contentType, "x-upsert": "false" },',
     'headers: { "Content-Type": toSign.contentType },', "route", R_HEADERS),
    # The probe (P1/T2: the overwrite; P4/T10: the token rule).
    ("P01 the probe believes a token with upsert on", PROBE,
     "if (url !== object || upsert !== false) return false;", "if (url !== object) return false;", "probe", P_TOKEN),
    ("P02 the probe takes any refusal of the second PUT", PROBE,
     "settle(again, (reply) => storageStatus(reply) === 409)", "settle(again, (reply) => reply.status >= 400)", "probe", P_OVER),
    ("P03 the probe doesn't read the bytes back after the second PUT", PROBE,
     "settle(kept, (reply) => reply.status === 200 && sameBytes(reply.bytes, PNG))",
     "settle(kept, (reply) => reply.status === 200)", "probe", P_OVER),
    # The judge and the scanner (P2, T1, D4).
    ("J01 the judge lets a slot that holds an upload take another", JUDGE,
     'if (upload.reservation === reservation && upload.state !== "rejected") return { kind: "pinned", answer: NEUTRAL };',
     "", "judge", J_ONE),
    ("J02 the judge answers a replay from the receipt whoever asks", JUDGE,
     "if (slot === undefined || account === null || adderOf(world, account, slot.day) !== slot.interval) return NEUTRAL;",
     "if (slot === undefined || account === null) return NEUTRAL;", "judge", J_REPLAY),
    ("C01 the scanner lets a signed upload outlive its upload", SCANNER,
     "          lifetime > UPLOAD_LIFETIME.most ||\n          Temporal.Instant.compare(expires, upload.expiresAt) > 0\n",
     "          lifetime > UPLOAD_LIFETIME.most\n", "scanner", C_PAST),
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
