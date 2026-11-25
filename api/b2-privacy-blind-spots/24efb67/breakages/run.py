"""api/b2-privacy-blind-spots: the plan's section 3 breakages, each applied to a file the slice doesn't change,
run against the suites named beforehand, and the file restored and checked after.

Usage: run.py <worktree> <out dir> [--only NAME ...] [--check]
Caught: the run exits non-zero and its output holds every registered pattern. A control run (on main's tests)
is expected to pass: it shows what the suites missed before the slice.
"""
import os, re, subprocess, sys, pathlib, json

SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
NODE = "/opt/nvm/versions/node/v26.13.0/bin"
ENV = dict(os.environ, PATH=f"{NODE}:{os.environ['PATH']}",
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")

RS = "packages/domain/src/authorization/read-sql.ts"
RD = "packages/domain/src/authorization/read.ts"
HM = "packages/domain/src/clubs/home.ts"
HR = "services/api/src/clubs/home.ts"
JD = "tests/src/privacy/home.ts"

def matrix(role, words=None):
    return {"kind": "matrix", "role": role, "words": words or [re.escape(f"answers the {role}")]}
def db(files, words):
    return {"kind": "db", "files": files, "words": words}
def unit(pkg, files, words):
    return {"kind": "unit", "pkg": pkg, "files": files, "words": words}

AUDIENCE = "member in the audience"
BOTH = "blocked: Cleo blocked the author, both still members"
AUTH = db(["src/db/authorization.test.ts"], [r"FAIL\s+src/db/authorization\.test\.ts"])
HOME_BLOCK = db(["src/db/home.test.ts"], [r"leaves out each other's drops when one of two members blocked"])
JUDGE = lambda words: unit("tests", ["src/privacy/home.test.ts"], words)
ALONE = [r"refuses on each of its conditions alone"]
EDGES = [r"holds the star's leaving and deletion to the reveal"]

INLINE = '''       AND x.id IN (
    SELECT d.id
      FROM app.drops d
      JOIN app.drop_audience a ON a.drop_id = d.id
      JOIN app.memberships m ON m.interval_id = a.interval_id
      JOIN app.users u ON u.id = m.user_id
      JOIN app.occurrences o ON o.id = d.occurrence_id
      JOIN app.clubs c ON c.id = d.club_id
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
      JOIN app.memberships am ON am.interval_id = d.author_interval_id
      JOIN app.users au ON au.id = am.user_id
     WHERE m.user_id = ${viewer}::pg_catalog.text
       AND u.state = 'active' AND m.state = 'active' AND d.state = 'active' AND o.status = 'scheduled'
       AND c.suspended_at IS NULL
       AND ${starKeepsDay(sql)}
       AND au.state = 'active'
       AND NOT EXISTS (SELECT FROM app.blocks b WHERE b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id)
       AND o.reveal_at <= ${now}::pg_catalog.timestamptz))`;
}'''

BREAKAGES = [
  {"name": "B1", "what": "readableDrops and mayRead without the author's account being active",
   "edits": [(RS, "       AND au.state = 'active'\n", ""), (RD, '    facts.authorAccount === "active" &&\n', "")],
   "runs": [matrix(AUDIENCE), AUTH], "control": [matrix(AUDIENCE)]},
  {"name": "B2", "what": "starKeepsDay and mayRead without the star's leaving before the reveal",
   "edits": [(RS, "(s.left_at IS NULL OR s.left_at >= o.reveal_at)\n       AND ", ""),
             (RD, "    notBeforeReveal(facts.starLeftAt, facts.revealAt) &&\n", "")],
   "runs": [matrix(AUDIENCE), AUTH], "control": [matrix(AUDIENCE)]},
  {"name": "B3", "what": "starKeepsDay and mayRead without the star's deletion asked before the reveal",
   "edits": [(RS, "\n       AND (su.deletion_requested_at IS NULL OR su.deletion_requested_at >= o.reveal_at)`;", "`;"),
             (RD, "    notBeforeReveal(facts.starDeletionRequestedAt, facts.revealAt) &&\n", "")],
   "runs": [matrix(AUDIENCE), AUTH], "control": [matrix(AUDIENCE)]},
  {"name": "B4", "what": "a one-way block: the viewer's own block of the author dropped, in both fragments",
   "edits": [(RS, "WHERE (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)\n                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))",
              "WHERE (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))"),
             (RS, "WHERE (b.blocker_user_id = ${viewer}::pg_catalog.text AND b.blocked_user_id = am.user_id)\n                           OR (b.blocker_user_id = am.user_id",
              "WHERE (b.blocker_user_id = am.user_id")],
   "runs": [matrix(BOTH), HOME_BLOCK, AUTH],
   "control": [matrix("blocked: Cleo blocked the author, leaving by the block"), db(["src/db/home.test.ts"], [])]},
  {"name": "B5", "what": "no block at all, in both fragments and mayRead",
   "edits": [(RS, "       AND NOT EXISTS (SELECT FROM app.blocks b\n                        WHERE (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)\n                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))\n", ""),
             (RD, "    Object.is(facts.blocked, false) &&\n", "")],
   "runs": [matrix(BOTH), HOME_BLOCK, AUTH],
   "control": [matrix("blocked: the author blocked Cleo as the day opened, leaving by the block and keeping the drop (FQ88)")]},
  {"name": "B6", "what": "the audit's inline Home: the page's drops by its own statement, with a one-way block",
   "edits": [(HM, "import { readableDrops, type FragmentSql, type QuerySql }", "import { readableDrops, starKeepsDay, type FragmentSql, type QuerySql }"),
             (HM, '''       AND x.id IN (${readableDrops(sql, viewer, now, "media")}))`;
}

/**
 * The open day's highlight rail''', INLINE + '''

/**
 * The open day's highlight rail''')],
   "runs": [unit("packages/domain", ["src/authorization/one-module.test.ts"], [r"finds no other code that names them", r"clubs/home\.ts:\d+: a drop's audience", r"clubs/home\.ts:\d+: the blocks"]),
            HOME_BLOCK, matrix(BOTH)],
   "control": [matrix(BOTH.replace("both still members", "leaving by the block")), db(["src/db/home.test.ts"], [])]},
  {"name": "B7", "what": "Home's time from `?t=` by a cast to ServerNow",
   "edits": [(HR, "      const now = await deps.clock.sample(tx);\n",
              '      const t = (request.query as Record<string, unknown> | null)?.["t"];\n      const now = typeof t === "string" ? (Temporal.Instant.from(t) as ServerNow) : await deps.clock.sample(tx);\n'),
             (HR, "  type RecentDay,\n} from \"@tadayo/domain\";", "  type RecentDay,\n  type ServerNow,\n} from \"@tadayo/domain\";")],
   "runs": [unit("packages/domain", ["src/time/one-clock.test.ts"], [r"finds no code outside the time module that makes a ServerNow", r"clubs/home\.ts:\d+"]), matrix(AUDIENCE, [re.escape(f"answers the {AUDIENCE}"), r'manipulated \{\\"query\\":\{\\"t\\":'])],
   "control": [matrix(AUDIENCE)]},
  {"name": "B8", "what": "Home's time from If-Modified-Since by a cast to ServerNow",
   "edits": [(HR, "      const now = await deps.clock.sample(tx);\n",
              '      const since = request.headers["if-modified-since"];\n      const now = typeof since === "string" ? (Temporal.Instant.fromEpochMilliseconds(Date.parse(since)) as ServerNow) : await deps.clock.sample(tx);\n'),
             (HR, "  type RecentDay,\n} from \"@tadayo/domain\";", "  type RecentDay,\n  type ServerNow,\n} from \"@tadayo/domain\";")],
   "runs": [unit("packages/domain", ["src/time/one-clock.test.ts"], [r"finds no code outside the time module that makes a ServerNow", r"clubs/home\.ts:\d+"]), matrix(AUDIENCE, [re.escape(f"answers the {AUDIENCE}"), r"if-modified-since"])],
   "control": [matrix(AUDIENCE)]},
]

JUDGE_EDITS = [
  ("J01", "the viewer's account", 'world.accounts.get(account)?.state !== "active") return false;', 'false) return false;', ALONE),
  ("J02", "the audience", "    mine &&\n", "", ALONE),
  ("J03", "the viewer's interval ended", "member?.account === account && member.leftAt === null;", "member?.account === account;", ALONE),
  ("J04", "the drop's state", '    found.state === "active" &&\n', "", ALONE),
  ("J05", "the day's status", '    day.status === "scheduled" &&\n', "", ALONE),
  ("J06", "the club's suspension", "    world.clubs.get(day.club)?.suspendedAt === null &&\n", "", ALONE),
  ("J07", "the star gone before the reveal", "    (star.leftAt === null || !before(star.leftAt, day.revealAt)) &&\n", "", ALONE),
  ("J08", "the star's deletion before the reveal", "    (starAsked === null || !before(starAsked, day.revealAt)) &&\n", "", ALONE),
  ("J09", "the author's account", '    world.accounts.get(author.account)?.state === "active" &&\n', "", ALONE),
  ("J10", "a block either way", "    !blocked &&\n", "", ALONE),
  ("J11", "the viewer's own block of the author", "(a === account && b === author.account) || ", "", ALONE),
  ("J12", "the author's block of the viewer", " || (a === author.account && b === account)", "", ALONE),
  ("J13", "the reveal", "    !before(now, day.revealAt)\n", "    true\n", ALONE),
  ("J14", "the star's leaving at any time", "(star.leftAt === null || !before(star.leftAt, day.revealAt))", "star.leftAt === null", EDGES),
  ("J15", "the star's deletion at any time", "(starAsked === null || !before(starAsked, day.revealAt))", "starAsked === null", EDGES),
  ("J16", "anyone's block", '''home.blocks.some(
    ([a, b]) => (a === account && b === author.account) || (a === author.account && b === account),
  );''', "home.blocks.length > 0;", EDGES),
]
for name, what, old, new, words in JUDGE_EDITS:
    BREAKAGES.append({"name": name, "what": f"mayView without {what}", "edits": [(JD, old, new)],
                      "runs": [JUDGE(words)], "control": []})

def sh(cmd, cwd, timeout=1800):
    p = subprocess.run(cmd, cwd=cwd, env=ENV, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr

def fresh_db(wt):
    code, out = sh(["bash", f"{SP}/s4/pgci.sh"], wt)
    assert code == 0, out
    code, out = sh(["python3", "tools/ci/ci_steps.py", "db-bootstrap"], wt)
    assert code == 0, out

def run_one(wt, run):
    if run["kind"] == "unit":
        return sh([f"{NODE}/npx", "vitest", "run", *run["files"]], f"{wt}/{run['pkg']}")
    fresh_db(wt)
    if run["kind"] == "db":
        return sh([f"{NODE}/npx", "vitest", "run", "--config", "vitest.db.config.ts", *run["files"]], f"{wt}/tests")
    return sh([f"{NODE}/npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts",
               "-t", re.escape(f"answers the {run['role']} as")], f"{wt}/tests")

def label(run):
    return run.get("role") or " ".join(run.get("files", []))

def main():
    wt, out = sys.argv[1], pathlib.Path(sys.argv[2])
    control = "--control" in sys.argv
    only = [a for a in sys.argv[3:] if not a.startswith("--")]
    out.mkdir(parents=True, exist_ok=True)
    for b in BREAKAGES:
        for f, old, new in b["edits"]:
            assert (pathlib.Path(wt) / f).read_text().count(old) == 1, (b["name"], f, old[:80])
    if "--check" in sys.argv:
        print(f"{len(BREAKAGES)} breakages, anchors ok"); return
    results = []
    for b in BREAKAGES:
        if only and b["name"] not in only: continue
        runs = b["control"] if control else b["runs"]
        if not runs: continue
        files = sorted({f for f, _, _ in b["edits"]})
        assert sh(["git", "status", "--porcelain", "--", *files], wt)[1].strip() == "", (b["name"], "target dirty")
        for f, old, new in b["edits"]:
            p = pathlib.Path(wt) / f; p.write_text(p.read_text().replace(old, new))
        patch = sh(["git", "diff", "--", *files], wt)[1]
        (out / f"{b['name']}.patch").write_text(patch)
        try:
            for i, run in enumerate(runs):
                code, text = run_one(wt, run)
                (out / f"{b['name']}.{i}.txt").write_text(text)
                found = [w for w in run["words"] if re.search(w, text)]
                if control:
                    verdict = "passed (missed)" if code == 0 else "failed"
                else:
                    verdict = "caught" if code != 0 and len(found) == len(run["words"]) else ("FAILED, words missing" if code != 0 else "NOT CAUGHT")
                line = {"name": b["name"], "what": b["what"], "run": f"{run['kind']}: {label(run)}", "exit": code, "verdict": verdict,
                        "missing": [w for w in run["words"] if w not in found]}
                results.append(line); print(json.dumps(line), flush=True)
        finally:
            sh(["git", "checkout", "--", *files], wt)
            assert sh(["git", "status", "--porcelain", "--", *files], wt)[1].strip() == "", (b["name"], "not restored")
    (out / ("control.json" if control else "results.json")).write_text(json.dumps(results, indent=1))

main()
