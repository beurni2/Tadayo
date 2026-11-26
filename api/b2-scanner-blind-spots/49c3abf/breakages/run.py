"""PR #137, round 3: the breakages registered for the round-3 fixes (docs/plans/api-b2-scanner-blind-spots.md,
section 5.8), each applied to the code under test, run against the suites registered for it, and every file restored
from its own copy and checked after. The one on the matrix (N6) is run again in a worktree at the PR's third commit
(573967b), as a control: what round 2's scanner made of it.

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

BREAKAGES = [
  {"name": "K13", "what": "no runs: a run of 12 characters of a text people wrote inside a longer value no longer found",
   "edits": [(SCANNER, "    if (this.#byInside !== undefined)\n      for (let at = 0; at + SHORTEST_RUN <= lower.length; at += 1) {\n",
              "    if (this.#byInside !== undefined && lower.length < 0)\n      for (let at = 0; at + SHORTEST_RUN <= lower.length; at += 1) {\n")],
   "runs": [scanner(RUN, r"aturday Peopl", PLANTED, r"cut short at both ends")]},
  {"name": "K14", "what": "a highlight no longer caught across two words (NEVER_STARTS on the word alone, as 573967b had it)",
   "edits": [(SCANNER, "      NEVER_STARTS.test(`${word}${words[index + 1] ?? \"\"}`) ||\n", "")],
   "runs": [scanner(WORDS, r"highLighted")]},
  {"name": "K15", "what": "the one-word spellings gone: mimetype, postid, videoid, datetaken, emptyslot",
   "edits": [(SCANNER, "    \"mimetype\",\n    \"postid\",\n    \"videoid\",\n    \"datetaken\",\n    \"emptyslot\",\n", "")],
   "runs": [scanner(WORDS, r"mimetype")]},
  {"name": "K16", "what": "Fastify's warning that quotes the URL kept whole (no REPLY_SENT_MESSAGE rule in ownMessage)",
   "edits": [(LOGGING, "  if (at !== undefined && (args[at] as string).startsWith(REPLY_SENT_MESSAGE)) {\n",
              "  if (at !== undefined && (args[at] as string).startsWith(\"never so\")) {\n")],
   "runs": [logging(ERRMSG, r"SECRET-RAW")]},
  {"name": "K17", "what": "a child's own log formatter wrapped whatever it is, as 573967b had it: a falsy one throws on each line",
   "edits": [(LOGGING, "      options === undefined || typeof own !== \"function\"\n", "      options === undefined || own === undefined\n")],
   "runs": [logging(WAYS, r"Cannot read properties of null|is not a function")]},
  {"name": "K18", "what": "a child's own log formatter called without pino's this, as 573967b had it",
   "edits": [(LOGGING, "(own as (fields: object) => unknown).call(this, fields)", "(own as (fields: object) => unknown).call(undefined, fields)")],
   "runs": [logging(WAYS, r"expected 'undefined' to be 'function'")]},
  {"name": "K19", "what": "absent bindings redacted as if present, as 573967b had it: setBindings(undefined) throws",
   "edits": [(LOGGING, "      setBindings.call(this, bindings === undefined || bindings === null ? bindings : redactLine(bindings));\n",
              "      setBindings.call(this, redactLine(bindings as Record<string, unknown>));\n")],
   "runs": [logging(WAYS, r"not\.toThrow|Cannot destructure")]},
  {"name": "K20", "what": "an err judged present when it isn't undefined or null, as 573967b had it: a falsy err gets a message",
   "edits": [(LOGGING, "(Boolean(fields?.err) && fields?.msg === undefined)", "(fields?.err !== undefined && fields.err !== null && fields.msg === undefined)")],
   "runs": [logging(ERRMSG, r"not to have property \"msg\"|toHaveProperty")]},
  {"name": "N6", "what": "createDrop logs a refused commit's caption less its first and last characters, inside a longer value",
   "edits": [(DROPS, "      if (error instanceof Refused) return refusal(reply, error);\n      throw error;\n    }\n    return created(reply, response);",
              "      if (error instanceof Refused) {\n        request.log.info({ trouble: `refused at ${(caption ?? \"none\").slice(1, -1)} here` }, \"commit refused\");\n        return refusal(reply, error);\n      }\n      throw error;\n    }\n    return created(reply, response);")],
   "runs": [matrix(CELL, LOG + r"text people wrote at \$\.trouble")], "control": True},
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
