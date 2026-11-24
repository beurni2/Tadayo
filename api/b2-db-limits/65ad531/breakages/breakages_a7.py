"""Deliberate breakages of the outside audit's A7 fix, its first part (api/b2-db-limits): the role's time limits,
the three timeouts answered with the bare 503, and the pools sized on purpose. Every vitest run passes
--fsModuleCache=false, so no transformed module is reused between breakages.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. B1 to B3 change the migration, so the cluster is made
again before each of them and once more, with the real migration, after the last. Run in a detached scratch
worktree of the PR's last head, never in the branch's own worktree; nothing else may use the database meanwhile.

  breakages_a7.py --check        count every anchor, change nothing
  breakages_a7.py B01 B02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-a7-brk"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/a7/brk"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
MIGRATION = "db/migrations/0018_role_time_limits.sql"
APP = "services/api/src/app.ts"
API_CONN = "services/api/src/connection.ts"
WORKER_CONN = "services/worker/src/connection.ts"

V = ["npx", "vitest", "run", "--fsModuleCache=false"]
SUITES = {
    "limits": ("tests", [*V, "--config", "vitest.db.config.ts", "src/db/time-limits.test.ts"], False),
    "limits-fresh": ("tests", [*V, "--config", "vitest.db.config.ts", "src/db/time-limits.test.ts"], True),
    "app": ("services/api", [*V, "src/app.test.ts"], False),
    "api-conn": ("services/api", [*V, "src/connection.test.ts"], False),
    "worker-conn": ("services/worker", [*V, "src/connection.test.ts"], False),
}

T_ROLE = "are the role's own session defaults, which a new session as `tadayo_app` starts with"
T_REPRO = "end the waits on a held row with the bare 503, let another person read meanwhile, and leave the same request"
T_CODES = "answers a lock it waited for too long and a statement too slow with the bare 503"
T_TX = "are set again by each of the API's transactions, so they hold though its session started without them"
T_OTHER = "still answers any other failure of the database with the 500 and nothing in it"
T_API = "opens at most six connections, a size set on purpose for the session pooler"
T_WORKER = "opens at most two connections, one for each of its loops, a size set on purpose for the session pooler"

LOCK = "ALTER ROLE CURRENT_USER SET lock_timeout = '5s';\n"
STATEMENT = "ALTER ROLE CURRENT_USER SET statement_timeout = '10s';\n"
IDLE = "ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '15s';\n"
CODES = 'new Set(["55P03", "57014"])'
WRAP = "      await tx.unsafe(TRANSACTION_LIMITS).simple();\n"
ENTRY = "  sql.begin = ((...args: unknown[]) => {\n"
ARRAY = "      const result = body(tx);\n      return Array.isArray(result) ? Promise.all(result) : result;\n"
LIMITS = "\"SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'\""
TEST = "OUT_OF_TIME.has((error as { code?: unknown }).code as string)"
WARN = 'request.log.warn({ err: error }, "database out of time");'
ANSWER = "    return unavailable(reply);\n  }\n  // A bug, or a database that failed"

B = [
    ("B01 no lock_timeout", MIGRATION, [(LOCK, "")], "limits-fresh", T_ROLE),
    ("B02 no statement_timeout", MIGRATION, [(STATEMENT, "")], "limits-fresh", T_ROLE),
    ("B03 no idle_in_transaction_session_timeout", MIGRATION, [(IDLE, "")], "limits-fresh", T_ROLE),
    ("B04 55P03 not mapped", APP, [(CODES, 'new Set(["57014"])')], "app", T_CODES),
    ("B04r 55P03 not mapped, seen by the reproduction", APP, [(CODES, 'new Set(["57014"])')], "limits", T_REPRO),
    ("B05 57014 not mapped", APP, [(CODES, 'new Set(["55P03"])')], "app", T_CODES),
    ("B06 25P03 mapped to the 503 as well", APP, [(CODES, 'new Set(["55P03", "57014", "25P03"])')], "app", T_OTHER),
    ("B07 every database error mapped to 503", APP,
     [(TEST, '(error as { name?: unknown }).name === "PostgresError"')], "app", T_OTHER),
    ("B08 the API's max left at the default", API_CONN, [("{ max: API_POOL, types", "{ types")], "api-conn", T_API),
    ("B09 the worker's max left at the default", WORKER_CONN, [("    max: WORKER_POOL,\n", "")], "worker-conn", T_WORKER),
    ("B10 the warning carries the error's message", APP,
     [(WARN, 'request.log.warn({ err: error, detail: error.message }, "database out of time");')], "app", T_CODES),
    ("B11 a 503 of its own, without private, no-store", APP,
     [(ANSWER, "    return reply.code(503).send();\n  }\n  // A bug, or a database that failed")], "app", T_CODES),
    ("B12 the API's transactions set no limits of their own", API_CONN, [(WRAP, "")], "limits", T_TX),
    ("B13 only a begin without options sets them", API_CONN,
     [(ENTRY, ENTRY + "    if (args.length > 1) return begin(...args);\n")], "limits", T_TX),
    ("B14 the API's transactions set only the lock limit", API_CONN,
     [(LIMITS, "\"SET LOCAL lock_timeout = '5s'\"")], "limits", T_TX),
    ("B15 a body's array returned to postgres.js unrun", API_CONN, [(ARRAY, "      return body(tx);\n")], "limits", T_TX),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def fresh_cluster():
    a = run(["bash", SP + "/s4/pgci.sh"])
    b = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    if a.returncode or b.returncode:
        raise SystemExit("the cluster could not be made: " + a.stderr[-300:] + b.stderr[-300:])


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def apply(text, changes):
    for change in changes:
        text = change(text) if callable(change) else swap(text, *change)
    return text


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, changes, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = apply(text, changes) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False  # the cluster holds a broken migration
    for name, path, changes, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        cwd, cmd, fresh = SUITES[suite]
        p = ROOT / path
        orig = p.read_text()
        try:
            broken = apply(orig, changes)
            p.write_text(broken)
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            if fresh:
                fresh_cluster()
                dirty = True
            elif cwd == "tests" and dirty:
                p.write_text(orig)
                (ROOT / MIGRATION).read_text()
                fresh_cluster()
                dirty = False
                p.write_text(broken)
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
    if dirty:
        fresh_cluster()
        print("the cluster made again with the real migration", flush=True)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
