"""api/b2-scanner-blind-spots: the plan's section 3 breakages, each applied to the code under test (the contract
and a route, or the logger and its caller), run against the suites registered for it beforehand, and every file
restored from its own copy and checked after.

Usage: run.py <worktree> <out dir> [NAME ...] [--control] [--check]
Caught: the run exits non-zero and its output holds every registered pattern. A control run (main's tests, in a
worktree at main) is recorded as passed (missed) or failed.
"""
import json, os, pathlib, re, subprocess, sys

SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
NODE = "/opt/nvm/versions/node/v26.13.0/bin"
ENV = dict(os.environ, PATH=f"{NODE}:{os.environ['PATH']}",
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")

COMMON = "packages/contracts/src/common.ts"
DAYS = "packages/contracts/src/schemas/days.ts"
CLUBS = "packages/contracts/src/schemas/clubs.ts"
CONTRIB = "packages/contracts/src/schemas/contributing.ts"
ACCOUNT = "packages/contracts/src/schemas/account.ts"
OPENAPI = "packages/contracts/openapi.yaml"
BODIES = "services/api/src/bodies.ts"
HOME = "services/api/src/clubs/home.ts"
LIST = "services/api/src/clubs/list.ts"
DROPS = "services/api/src/drops/drops.ts"
ME = "services/api/src/identity/me.ts"
LOGGING = "services/api/src/logging.ts"
MATRIX = "tests/src/privacy/matrix.test.ts"

ROLE = "member in the audience"
PATTERN = f"answers the {ROLE} as|wrote a request line for every answer"
CELL = re.escape(f"answers the {ROLE}")
LISTS = r"holds its own key list for every object schema an answer can hold before a day"
SERVED = r"holds the keys served for a reason to the contract"
CONTRACT_TEST = {"kind": "unit", "pkg": "packages/contracts", "files": ["src/contract.test.ts"], "words": []}

def matrix(*words):
    return {"kind": "matrix", "words": [CELL, *words]}
def scanner(*words):
    return {"kind": "unit", "pkg": "tests", "files": ["src/privacy/scanner.test.ts"], "words": list(words)}
def wl(schema, key):
    article = "an" if schema[0] in "AEIOU" else "a"
    return rf"whitelist at \S+: {article} {schema} that has {key}"
def keys(key):
    return rf"keys at \S*{key}: a key that names"

LOG_KEY = lambda key: re.escape(f"the API's log: a key the API's log doesn't write: {key}")
LOG_TEXT = lambda at: re.escape("the API's log: text people wrote at ") + at

L1 = [(HOME, "      return home === null ? null : homeBody(now, home);\n    });\n",
       "      return home === null ? null : homeBody(now, home);\n    });\n    request.log.info({ served: { home: body } }, \"home served\");\n")]

BREAKAGES = [
  {"name": "S1", "what": "drop_count on every Occurrence, the day before and after its reveal (contract and occurrenceBody)",
   "contract": True,
   "edits": [(COMMON, "    phase: OccurrencePhase,\n  }),\n);", "    phase: OccurrencePhase,\n    drop_count: z.int().min(0),\n  }),\n);"),
             (BODIES, "    phase: day.phase,\n  };", "    phase: day.phase,\n    drop_count: 0,\n  };")],
   "runs": [matrix(wl("Occurrence", "drop_count"), keys("drop_count")), scanner(LISTS, SERVED)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S2", "what": "the open day's drop ids under its ViewerDay (contract and Home's route)",
   "contract": True,
   "edits": [(DAYS, "  z.object({ is_star: z.boolean(), joined_later: z.boolean() }),",
              "  z.object({ is_star: z.boolean(), joined_later: z.boolean(), drop_ids: z.array(Id) }),"),
             (HOME, "viewer: { is_star: home.day.isStar, joined_later: home.day.joinedLater },",
              "viewer: { is_star: home.day.isStar, joined_later: home.day.joinedLater, drop_ids: home.day.drops.map((drop) => drop.id) },")],
   "runs": [matrix(wl("ViewerDay", "drop_ids")), scanner(LISTS)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S3", "what": "committed_at on the commit's DropReceipt, before the reveal (contract and createDrop's route)",
   "contract": True,
   "edits": [(CONTRIB, "    allowance: Allowance,\n    highlight: HighlightPointer,\n  }),",
              "    allowance: Allowance,\n    committed_at: Instant,\n    highlight: HighlightPointer,\n  }),"),
             (DROPS, "    allowance: allowanceBody(receipt.allowance),\n    highlight: {",
              "    allowance: allowanceBody(receipt.allowance),\n    committed_at: contractInstant(receipt.occurrence.revealAt),\n    highlight: {"),
             (DROPS, "} from \"@tadayo/domain\";", "  contractInstant,\n} from \"@tadayo/domain\";")],
   "runs": [matrix(wl("DropReceipt", "committed_at"), keys("committed_at")), scanner(LISTS, SERVED)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S4", "what": "drop_count on each ClubSummary of listClubs (contract and listClubs' route)",
   "contract": True,
   "edits": [(CLUBS, "    member_count: z.int().min(1).max(6),\n    open_day: Occurrence.optional(),",
              "    member_count: z.int().min(1).max(6),\n    drop_count: z.int().min(0).optional(),\n    open_day: Occurrence.optional(),"),
             (LIST, "      member_count: club.memberCount,\n", "      member_count: club.memberCount,\n      drop_count: 0,\n")],
   "runs": [matrix(wl("ClubSummary", "drop_count"), keys("drop_count")), scanner(LISTS, SERVED)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S5", "what": "filesize on every Allowance (contract and allowanceBody)",
   "contract": True,
   "edits": [(COMMON, "    is_star: z.boolean(),\n  }),\n);", "    is_star: z.boolean(),\n    filesize: z.int().min(0),\n  }),\n);"),
             (BODIES, "    is_star: allowance.isStar,\n  };", "    is_star: allowance.isStar,\n    filesize: 0,\n  };")],
   "runs": [matrix(wl("Allowance", "filesize"), keys("filesize")), scanner(LISTS, SERVED)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S6", "what": "avatarUrl on Me, outside the lists (contract and getMe's route)",
   "contract": True,
   "edits": [(ACCOUNT, "    age_confirmed: z.boolean(),\n    version: Version,\n  }),",
              "    age_confirmed: z.boolean(),\n    version: Version,\n    avatarUrl: z.string().optional(),\n  }),"),
             (ME, "    age_confirmed: account.ageConfirmed,\n    version: account.version,\n  };",
              "    age_confirmed: account.ageConfirmed,\n    version: account.version,\n    avatarUrl: String(account.version),\n  };")],
   "runs": [matrix(keys("avatarUrl")), scanner(SERVED)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "S7", "what": "a new schema, DayStats, under the waiting Home (contract and Home's route)",
   "contract": True,
   "edits": [(DAYS, "export const HomeWaiting = named(",
              "export const DayStats = named(\"DayStats\", \"A breakage's own schema.\", z.object({ added: z.int().min(0) }));\n\nexport const HomeWaiting = named("),
             (DAYS, "    mode: tag(\"waiting\"),\n    ...homeBase,\n    next: Occurrence,\n",
              "    mode: tag(\"waiting\"),\n    ...homeBase,\n    next: Occurrence,\n    stats: DayStats,\n"),
             (HOME, "        next: occurrenceBody(home.next),\n        recent_days: home.recentDays.map(dayLinkBody),\n      };\n    case \"day\":",
              "        next: occurrenceBody(home.next),\n        stats: { added: 0 },\n        recent_days: home.recentDays.map(dayLinkBody),\n      };\n    case \"day\":")],
   "runs": [matrix(wl("HomeWaiting", "stats"), r"whitelist at \S+: a DayStats, which this file holds no list for"), scanner(LISTS)],
   "control": [matrix(), CONTRACT_TEST]},
  {"name": "L1", "what": "Home's handler logs its whole answer as { served: { home: body } }",
   "edits": L1,
   "runs": [matrix(LOG_KEY("served"))],
   "control": [matrix()]},
  {"name": "L2", "what": "L1, with the redaction back to pino's paths one level down",
   "edits": L1 + [(LOGGING, "      formatters: { log: redactLine },\n",
                   "      redact: { paths: [...REDACTED_FIELDS, ...REDACTED_FIELDS.map((field) => `*.${field}`)], censor: BLANKED },\n")],
   "runs": [matrix(LOG_KEY("served"), LOG_TEXT(r"\$\.served\.home\.")),
            {"kind": "unit", "pkg": "services/api", "files": ["src/logging.test.ts"],
             "words": [r"blanks every listed field, at the top, one level down and four levels down",
                       r"blanks Home's whole answer logged by mistake"]}],
   "control": []},
  {"name": "L3", "what": "listClubs' handler logs a club's name as { club: name }",
   "edits": [(LIST, "      return clubListBody(now, await listClubs(tx, account.id, now));\n",
              "      const listing = await listClubs(tx, account.id, now);\n      request.log.info({ club: listing.clubs[0]?.name ?? \"none\" }, \"clubs listed\");\n      return clubListBody(now, listing);\n")],
   "runs": [matrix(LOG_KEY("club"), LOG_TEXT(r"\$\.club"))],
   "control": [matrix()]},
  {"name": "L4", "what": "the matrix's app back at silent",
   "edits": [(MATRIX, "    log: { level: \"info\", stream:", "    log: { level: \"silent\", stream:")],
   "runs": [{"kind": "matrix", "words": [r"wrote a request line for every answer the scanner read"]}],
   "control": []},
]

def sh(cmd, cwd, timeout=2400):
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
    return sh([f"{NODE}/npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts",
               "-t", PATTERN], f"{wt}/tests")

def label(run):
    return "matrix as the " + ROLE if run["kind"] == "matrix" else f"{run['pkg']} {' '.join(run['files'])}"

def main():
    wt, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    control = "--control" in sys.argv
    only = [a for a in sys.argv[3:] if not a.startswith("--")]
    out.mkdir(parents=True, exist_ok=True)
    for b in BREAKAGES:
        for f, old, new in b["edits"]:
            if control and f in (LOGGING, MATRIX):
                continue
            assert (wt / f).read_text().count(old) == 1, (b["name"], f, old[:80])
    if "--check" in sys.argv:
        print(f"{len(BREAKAGES)} breakages, anchors ok"); return
    results = []
    for b in BREAKAGES:
        if only and b["name"] not in only: continue
        runs = b["control"] if control else b["runs"]
        if not runs: continue
        files = sorted({f for f, _, _ in b["edits"]} | ({OPENAPI} if b.get("contract") else set()))
        saved = {f: (wt / f).read_text() for f in files}
        try:
            for f, old, new in b["edits"]:
                p = wt / f; p.write_text(p.read_text().replace(old, new, 1))
            if b.get("contract"):
                code, text = sh([f"{NODE}/node", "scripts/openapi.ts", "write"], wt / "packages/contracts")
                assert code == 0, text
            patch = sh(["git", "diff", "--", *files], wt)[1]
            (out / f"{b['name']}.patch").write_text(patch)
            for i, run in enumerate(runs):
                code, text = run_one(wt, run)
                (out / f"{b['name']}.{i}.txt").write_text(text)
                found = [w for w in run["words"] if re.search(w, text)]
                if control:
                    verdict = "passed (missed)" if code == 0 else "failed"
                else:
                    verdict = "caught" if code != 0 and len(found) == len(run["words"]) else ("FAILED, words missing" if code != 0 else "NOT CAUGHT")
                line = {"name": b["name"], "what": b["what"], "run": f"{run['kind']}: {label(run)}", "exit": code,
                        "verdict": verdict, "missing": [w for w in run["words"] if w not in found]}
                results.append(line); print(json.dumps(line), flush=True)
        finally:
            for f, text in saved.items():
                (wt / f).write_text(text)
            for f, text in saved.items():
                assert (wt / f).read_text() == text, (b["name"], f, "not restored")
    (out / ("control.json" if control else "results.json")).write_text(json.dumps(results, indent=1))

main()
