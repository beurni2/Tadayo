"""PR #137, round 4: the breakages registered for the round-4 fixes (docs/plans/api-b2-scanner-blind-spots.md,
section 5.11), each applied to the code under test, run against the suites registered for it, and every file restored
from its own copy and checked after. All are on the unit suites; K23 is registered to pass.

Usage: run.py <worktree> <out dir> [NAME ...] [--control] [--check]
Caught: the run exits non-zero and its output holds every registered pattern. A control run is recorded as passed
(missed) or failed, with the patterns it held.
"""
import difflib, json, os, pathlib, re, subprocess, sys

SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
NODE = "/opt/nvm/versions/node/v26.13.0/bin"
ENV = dict(os.environ, PATH=f"{NODE}:{os.environ['PATH']}",
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")

SCANNER = "tests/src/privacy/scanner.ts"
DAYS = "packages/contracts/src/schemas/days.ts"
OPENAPI = "packages/contracts/openapi.yaml"
APP = "services/api/src/app.ts"
LOGGING = "services/api/src/logging.ts"
DROPS = "services/api/src/drops/drops.ts"
ROSTER = "services/api/src/clubs/roster.ts"
SESSION = "services/api/src/session.ts"
HOME = "services/api/src/clubs/home.ts"
HARNESS = "tests/src/privacy/harness.ts"

ROLE = "member in the audience"
PATTERN = f"answers the {ROLE} as|wrote a request line for every answer|wrote one request line for every request"
CELL = re.escape(f"answers the {ROLE}")

def matrix(*words, t=None):
    return {"kind": "matrix", "words": list(words), "t": t}
def scanner(*words):
    return {"kind": "unit", "pkg": "tests", "files": ["src/privacy/scanner.test.ts"], "words": list(words)}
def logging(*words):
    return {"kind": "unit", "pkg": "services/api", "files": ["src/logging.test.ts"], "words": list(words)}

WORDS = r"reads a key's words in snake_case and camelCase"
OLD = r"names every key the never-list named before the outside audit"
LISTS = r"holds its own key list for every object schema an answer can hold before a day"
INLINE = r"finds no object those answers can hold but a named schema"
OPS = r"counts every operation whose answer can name a day or a drop, or that asks about one by its path"
NEEDLE = r"finds a needle whole, inside a value when it is 6 characters or more"
PLANTED = r"catches a caption, a name, a club's name, a kept-back value"
TEXTS = r"holds every text people wrote in the world"
CHILD = r"blanks a child logger's bindings as it blanks a line's own fields"
SPELLED = r"blanks a key the list doesn't spell when a word of it is a content word"
LOG = re.escape("the API's log: ")
OPENED = r"holds what has opened to its list"
CASE = r"finds a needle in any case and as JSON escapes it"
ERRMSG = r"gives a line with an error and no message of its own a fixed one"
SET = r"blanks bindings set later"
KEEP = r"keeps pino's own redaction of the list beneath it"
SIGNED_OUT = "answers each the same whatever the ids name|wrote one request line for every request"

RUN = r"a run of 12 of one inside a longer value"
WAYS = r"keeps pino's ways"

HOLDS = r"says whether a value holds a needle as `within` finds them, and stops at the first"
FORMATTER = r"blanks what a child's own bindings formatter brings"

BREAKAGES = [
  {"name": "K21", "what": "holds collects every needle, as within does: no stop at the first",
   "edits": [(SCANNER, "    let held = false;\n    this.#scan(value, shortInside, () => {\n      held = true;\n      return true;\n    });\n    return held;\n",
              "    return this.within(value, shortInside).length > 0;\n")],
   "runs": [scanner(HOLDS, r"to be less than 100")]},
  {"name": "K22", "what": "logProblems asks within(...).length > 0, as 49c3abf had it",
   "edits": [(SCANNER, "    if (facts.texts.holds(value, false)) problems.push(", "    if (facts.texts.within(value, false).length > 0) problems.push(")],
   "runs": [scanner(HOLDS, r"to be less than 100")]},
  {"name": "K23", "what": "the run lookup by first characters and a search, as 49c3abf had it, the stop at the first kept",
   "edits": [(SCANNER, "        for (const form of this.#byRun.get(lower.slice(at, at + SHORTEST_RUN)) ?? []) if (take(form)) return;",
              "        for (const form of this.#byInside?.get(lower.slice(at, at + SHORTEST_TEXT)) ?? [])\n          if (form.includes(lower.slice(at, at + SHORTEST_RUN)) && take(form)) return;")],
   "runs": [scanner()], "expect": "pass"},
  {"name": "K24", "what": "joinedNever off: one word read as two run together no longer caught",
   "edits": [(SCANNER, "      joinedNever(word) ||\n", "")],
   "runs": [scanner(WORDS, r"providerid")]},
  {"name": "K25", "what": "NEVER_ENDINGS as 49c3abf had it",
   "edits": [(SCANNER, "|count|total|color|colour|remaining|missing|duration|preview|timestamp|dimension|waveform|highlight)s?$/;", "|count|total)s?$/;")],
   "runs": [scanner(WORDS, r"slotsremaining")]},
  {"name": "K26", "what": "a child's own bindings formatter not wrapped, as 49c3abf had it",
   "edits": [(LOGGING, '  for (const name of ["log", "bindings"]) {\n', '  for (const name of ["log"]) {\n')],
   "runs": [logging(FORMATTER, re.escape("[redacted]"))]},
  {"name": "K27", "what": "falsy bindings other than null and undefined redacted as if present, as 49c3abf had it",
   "edits": [(LOGGING, "    return child.call(this, given ? redactLine(given) : bindings, redactedFormatters(options));\n",
              "    return child.call(\n      this,\n      given === undefined || given === null ? bindings : redactLine(given as Record<string, unknown>),\n      redactedFormatters(options),\n    );\n")],
   "runs": [logging(FORMATTER, r"to throw")]},
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
               "-t", run.get("t") or PATTERN], f"{wt}/tests")

def label(run):
    return "matrix as the " + ROLE if run["kind"] == "matrix" else f"{run['pkg']} {' '.join(run['files'])}"

def main():
    wt, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    control = "--control" in sys.argv
    only = [a for a in sys.argv[3:] if not a.startswith("--")]
    out.mkdir(parents=True, exist_ok=True)
    chosen = [b for b in BREAKAGES if (not only or b["name"] in only) and (not control or b.get("control"))]
    for b in chosen:
        for f, old, new in b["edits"]:
            assert (wt / f).read_text().count(old) == 1, (b["name"], f, old[:80])
    if "--check" in sys.argv:
        print(f"{len(chosen)} breakages, anchors ok"); return
    results = []
    for b in chosen:
        files = sorted({f for f, _, _ in b["edits"]} | ({OPENAPI} if b.get("contract") else set()))
        saved = {f: (wt / f).read_text() for f in files}
        try:
            for f, old, new in b["edits"]:
                p = wt / f; p.write_text(p.read_text().replace(old, new, 1))
            if b.get("contract"):
                code, text = sh([f"{NODE}/node", "scripts/openapi.ts", "write"], wt / "packages/contracts")
                assert code == 0, text
            # The breakage's own change, against the files as they stood (the slice's uncommitted work kept out).
            patch = "".join("".join(difflib.unified_diff(saved[f].splitlines(True), (wt / f).read_text().splitlines(True),
                                                         f"a/{f}", f"b/{f}")) for f in files)
            (out / f"{b['name']}.patch").write_text(patch)
            for i, run in enumerate(b["runs"]):
                code, text = run_one(wt, run)
                (out / f"{b['name']}.{i}.txt").write_text(text)
                found = [w for w in run["words"] if re.search(w, text)]
                if control:
                    verdict = "passed (missed)" if code == 0 else "failed"
                elif b.get("expect") == "pass":
                    verdict = "passed, as registered" if code == 0 else "FAILED, registered to pass"
                else:
                    verdict = "caught" if code != 0 and len(found) == len(run["words"]) else ("FAILED, words missing" if code != 0 else "NOT CAUGHT")
                line = {"name": b["name"], "what": b["what"], "run": f"{run['kind']}: {label(run)}", "exit": code,
                        "verdict": verdict, "found": found, "missing": [w for w in run["words"] if w not in found]}
                results.append(line); print(json.dumps(line), flush=True)
        finally:
            for f, text in saved.items():
                (wt / f).write_text(text)
            for f, text in saved.items():
                assert (wt / f).read_text() == text, (b["name"], f, "not restored")
    (out / ("control.json" if control else "results.json")).write_text(json.dumps(results, indent=1))

main()
