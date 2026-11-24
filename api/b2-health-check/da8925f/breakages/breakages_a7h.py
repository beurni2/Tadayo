"""Deliberate breakages of the outside audit's A7 fix, its second part (api/b2-health-check, PR #127): the
contract's getHealth, its handler, fly.toml's HTTP check and the privacy matrix's row. Every vitest run passes
--fsModuleCache=false, so no transformed module is reused between breakages.

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Run in a detached scratch worktree of the PR's last
head, never in the branch's own worktree; nothing else may use the database meanwhile.

  breakages_a7h.py --check        count every anchor, change nothing
  breakages_a7h.py B01 B02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-a7h-brk"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/a7h/brk"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
H = "services/api/src/health.ts"
OPS = "packages/contracts/src/operations.ts"
OP = "packages/contracts/src/operation.ts"
DOC = "packages/contracts/src/document.ts"
FLY = "fly.toml"
MATRIX = "tests/src/privacy/matrix.test.ts"
DEVICES = "services/api/src/identity/devices.ts"

V = ["npx", "vitest", "run", "--fsModuleCache=false"]
SIGNED_OUT = "callers without a session"
ROLE = "answers the author as its account"
SUITES = {
    "health": ("services/api", [*V, "src/health.test.ts"]),
    "health-db": ("tests", [*V, "--config", "vitest.db.config.ts", "src/db/health.test.ts"]),
    "contract": ("packages/contracts", [*V, "src/contract.test.ts"]),
    "deploy": ("tools/ops", [*V, "src/deploy-files.test.ts"]),
    "session": ("services/api", [*V, "src/session.test.ts"]),
    "matrix-signed-out": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", SIGNED_OUT]),
    "matrix-author": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", ROLE]),
}

T_QUERY = "asks the database `SELECT 1` once, with nothing else: no table, no value, no transaction"
T_TIMER = "leaves no timer behind once it has answered"
T_FAIL = "answers the bare 503 when the query fails, and logs one warning by the error's class and code (T52)"
T_SLOW = "answers the bare 503 at its bound when the query never comes back, and logs that it was slow"
T_LATE = "logs nothing more when a query it gave up on fails later"
T_SHARED = "shares one query among the checks that come while it is out, and sends a new one once it has come back"
T_GIVEUP = "sends a new query once the checks gave up on the one that is out, so one stuck query fails no check after them"
T_GUARDS = "lets go of a probe only for the check that gave up on the current one, or as it settles itself"
T_BOUND = "gives up before Fly's own check timeout, so the API's answer is the one Fly reads"
T_DB = "answers the bare 503 within its bound while every connection of the pool is held, and 204 once they're free"
T_CPUBLIC = "needs no session for exactly the signed-out page, a logged-out device's removal and the health check"
T_C503 = "documents a 503 only for the health check, with nothing in it, and no 404 where nothing is named"
T_FLY = "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and asks the health route, not the port"
T_SESSION = "never ask who is calling, whatever the header says, and make no account"
T_SIGNED_OUT = "answers each the same whatever the ids name, the gate's one 401, the neutral not-found for a public route"
T_ROLE = "answers the author as its account and its row say, and leaks nothing the scanner can find"

SQL = "const sent: Promise<Outcome> = deps.sql`SELECT 1`\n"
RACE = "      outcome = await Promise.race([asked, late]);\n"
ANSWER = "    return unavailable(reply);\n  };\n"
WARN = '    else request.log.warn({ err: outcome.error }, "database unreachable");\n'
TCP = '  [[services.tcp_checks]]\n    grace_period = "20s"\n    interval = "15s"\n    timeout = "3s"\n'
HTTP = ('  [[services.http_checks]]\n    grace_period = "20s"\n    interval = "15s"\n    timeout = "3s"\n'
        '    method = "GET"\n    path = "/v1/health"\n    protocol = "http"\n')
SIGNED_OUT_JUDGE = "const expected: Expected = HEALTH_JUDGED.has(spec.operation.id)\n            ? healthExpected\n"
ROLE_JUDGE = 'gate === undefined && id === "getHealth"\n                                              ? healthExpected\n'
PARSE = "    const parsed = RemoveDeviceRequest.safeParse(request.body);\n"

B = [
    ("B01 204 without asking the database", H, [(SQL, "const sent: Promise<Outcome> = Promise.resolve()\n")], "health", T_FAIL),
    ("B01d 204 without asking the database, on Postgres", H, [(SQL, "const sent: Promise<Outcome> = Promise.resolve()\n")], "health-db", T_DB),
    ("B02 no bound", H, [(RACE, "      outcome = await asked;\n")], "health", T_SLOW),
    ("B02d no bound, on Postgres", H, [(RACE, "      outcome = await asked;\n")], "health-db", T_DB),
    ("B03 a failed query answered with the 500", H,
     [(ANSWER, '    return outcome === "late" ? unavailable(reply) : reply.code(500).header("cache-control", "private, no-store").send();\n  };\n')],
     "health", T_FAIL),
    ("B04 the 503 with a body", H,
     [(ANSWER, '    return reply.code(503).header("cache-control", "private, no-store").send({ code: "UNAVAILABLE" });\n  };\n')],
     "health", T_FAIL),
    ("B05 the warning carries the error's message", H,
     [(WARN, '    else request.log.warn({ err: outcome.error, detail: String(outcome.error) }, "database unreachable");\n')],
     "health", T_FAIL),
    ("B06 the bound longer than Fly's timeout", H, [("export const HEALTH_MS = 2_000;", "export const HEALTH_MS = 5_000;")], "health", T_BOUND),
    ("B07 getHealth behind the gate", OPS, [("    public: true,\n    unavailable: true,\n", "    unavailable: true,\n")], "contract", T_CPUBLIC),
    ("B07m getHealth behind the gate, seen by the matrix", OPS, [("    public: true,\n    unavailable: true,\n", "    unavailable: true,\n")],
     "matrix-signed-out", T_SIGNED_OUT),
    ("B08 getHealth's 503 left out of the document", DOC, [("  if (op.unavailable) {", "  if (op.unavailable && op.public === undefined) {")], "contract", T_C503),
    ("B09 NOT_FOUND back on every public operation", OP,
     [('if (op.path.includes("{") || (op.public && op.body)) codes.push("NOT_FOUND");', 'if (op.path.includes("{") || op.public) codes.push("NOT_FOUND");')],
     "contract", T_C503),
    ("B10 the handler queries a table", H, [(SQL, "const sent: Promise<Outcome> = deps.sql`SELECT 1 FROM app.users LIMIT 1`\n")], "health", T_QUERY),
    ("B11 fly.toml keeps the TCP check", FLY, [(HTTP, TCP)], "deploy", T_FLY),
    ("B12 fly.toml's check on another path", FLY, [('    path = "/v1/health"\n', '    path = "/health"\n')], "deploy", T_FLY),
    ("B13 fly.toml's method in lower case", FLY, [('    method = "GET"\n', '    method = "get"\n')], "deploy", T_FLY),
    ("B14 the warning logged where the query fails, not by each check", H,
     [(RACE, "      void asked.then((settled) => {\n"
             '        if (settled !== "answered") request.log.warn({ err: settled.error }, "database unreachable");\n'
             "      });\n"
             "      outcome = await Promise.race([asked, late]);\n"),
      (WARN, "")],
     "health", T_LATE),
    ("B15 the timer left running after a 204", H, [("      clearTimeout(timer);\n", "")], "health", T_TIMER),
    ("B16 the signed-out callers' row judged as the neutral not-found", MATRIX,
     [(SIGNED_OUT_JUDGE, SIGNED_OUT_JUDGE.replace("? healthExpected", "? NEUTRAL"))], "matrix-signed-out", T_SIGNED_OUT),
    ("B16r a role's row judged as the neutral not-found", MATRIX,
     [(ROLE_JUDGE, ROLE_JUDGE.replace("? healthExpected", "? NEUTRAL"))], "matrix-author", T_ROLE),
    ("B17 every check sends its own query", H, [("    if (probe !== undefined) return probe;\n", "")], "health", T_SHARED),
    ("B19 a check that gives up keeps the probe", H,
     [('    if (outcome === "late" && probe === asked) probe = undefined;\n', "")], "health", T_GIVEUP),
    ("B20 any check that gives up lets the probe go, the current one or not", H,
     [('    if (outcome === "late" && probe === asked) probe = undefined;\n',
       '    if (outcome === "late") probe = undefined;\n')], "health", T_GUARDS),
    ("B21 a probe that settles clears the probe, itself or not", H,
     [("        if (probe === sent) probe = undefined;\n", "        probe = undefined;\n")], "health", T_GUARDS),
    ("B18 removeDevice reads the database before it refuses a body", DEVICES,
     [(PARSE, "    await deps.sql`SELECT 1 FROM app.device_registrations LIMIT 1`;\n" + PARSE)], "session", T_SESSION),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def apply(text, changes):
    for old, new in changes:
        text = swap(text, old, new)
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
    for name, path, changes, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        cwd, cmd = SUITES[suite]
        p = ROOT / path
        orig = p.read_text()
        try:
            broken = apply(orig, changes)
            p.write_text(broken)
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
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
