"""PR #137, round 2: the breakages registered for the round-2 fixes (docs/plans/api-b2-scanner-blind-spots.md,
section 5.5), each applied to the code under test, run against the suites registered for it, and every file restored
from its own copy and checked after. The ones on the matrix are run again in a worktree at the PR's second commit
(d76b977), as controls: what round 1's scanner and matrix made of each. N1 is registered to pass: an id a request
carries is no text people wrote, which d76b977 counted as one.

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

BREAKAGES = [
  {"name": "K1", "what": "what has opened back off the lists as d76b977 had it: the day link's and the seven opened schemas' lists gone, and the closed world skipping them",
   "edits": [(SCANNER, "  // A closed day, among Home's recent days while the next one collects (the round-2 review).\n  DayLink: { required: [\"occurrence\"], optional: [\"cover_drop_id\"] },\n", ""),
             (SCANNER, "  DropRevealed: {\n    required: [\"view\", \"id\", \"author\", \"media_class\", \"highlight\", \"reactions\", \"viewer_favourite\"],\n    optional: [\"caption\", \"photo\", \"video\", \"viewer_reaction\"],\n  },\n", ""),
             (SCANNER, "  HighlightEntry: { required: [\"drop_id\", \"author\", \"star_pick\"], optional: [] },\n", ""),
             (SCANNER, "  ReactionSummary: { required: [\"reaction\"], optional: [\"people\"] },\n", ""),
             (SCANNER, "  ReplyPreview: { required: [\"comment_id\", \"author\", \"media_version\"], optional: [] },\n", ""),
             (SCANNER, "  RevealedDayDrop: {\n    required: [\"view\", \"id\", \"author\", \"media_class\", \"highlight\", \"reactions\", \"viewer_favourite\", \"section\"],\n    optional: [\"caption\", \"photo\", \"video\", \"viewer_reaction\", \"reply_preview\"],\n  },\n  RevealedPhoto: { required: [\"width\", \"height\", \"media_version\"], optional: [] },\n  RevealedVideo: { required: [\"provider\"], optional: [] },\n", ""),
             (SCANNER, "    } else if (beforeReveal) {\n",
              "    } else if (beforeReveal && !(kind !== undefined && [\"DayLink\", \"DropRevealed\", \"HighlightEntry\", \"ReactionSummary\", \"ReplyPreview\", \"RevealedDayDrop\", \"RevealedPhoto\", \"RevealedVideo\"].includes(kind))) {\n")],
   "runs": [scanner(LISTS, OPENED)]},
  {"name": "K2", "what": "the round's new never-words gone: a post, a video, taken, a length, w, h, dims, mime, remaining, missing, empty, slots left",
   "edits": [(SCANNER, "    \"post\",\n    \"video\",\n    \"taken\",\n    \"length\",\n    \"w\",\n    \"h\",\n    \"dims\",\n    \"mime\",\n    \"remaining\",\n    \"missing\",\n    \"empty\",\n    \"slotsleft\",\n", "")],
   "runs": [scanner(WORDS, r"post_id")]},
  {"name": "K3", "what": "a highlight at a word's start no longer caught",
   "edits": [(SCANNER, "      NEVER_STARTS.test(word) ||\n", "")],
   "runs": [scanner(WORDS, r"highlighted")]},
  {"name": "K4", "what": "the log's needles matched in their own case only",
   "edits": [(SCANNER, ".map((one) => one.toLowerCase())", ".map((one) => one)"),
             (SCANNER, "    const lower = value.toLowerCase();\n", "    const lower = value;\n")],
   "runs": [scanner(CASE, r"saturday people")]},
  {"name": "K5", "what": "the log's needles not looked for as JSON escapes them",
   "edits": [(SCANNER, "[needle, JSON.stringify(needle).slice(1, -1)]", "[needle]")],
   "runs": [scanner(CASE, r"JSON\.stringify\(\{ caption \}\)")]},
  {"name": "K6", "what": "no cuts: a value inside a text people wrote no longer found",
   "edits": [(SCANNER, "    if (this.#byInside !== undefined && lower.length >= SHORTEST_CUT)\n", "    if (this.#byInside !== undefined && lower.length < 0)\n")],
   "runs": [scanner(CASE, PLANTED, r"cut short")]},
  {"name": "K7", "what": "a line with an error and no message of its own: pino's copy of the error's message (no logMethod hook)",
   "edits": [(LOGGING, "      hooks: { logMethod: ownMessage },\n", "")],
   "runs": [logging(ERRMSG)]},
  {"name": "K8", "what": "bindings set later not redacted (setBindings unpatched)",
   "edits": [(LOGGING, "  if (setBindings !== undefined)\n", "  if (setBindings === null)\n")],
   "runs": [logging(SET, r"SECRET-SET-CAPTION")]},
  # K8 as run failed in its test, but on the comment two levels down: main's redaction, kept beneath since this round,
  # blanks the caption set at the top. Registered again, after its run, with the comment as its pattern.
  {"name": "K8a", "what": "K8 again: bindings set later not redacted, found two levels down",
   "edits": [(LOGGING, "  if (setBindings !== undefined)\n", "  if (setBindings === null)\n")],
   "runs": [logging(SET, r"SECRET-SET-COMMENT")]},
  {"name": "K9", "what": "a child's own log formatter not followed by redactLine",
   "edits": [(LOGGING, "      options === undefined || own === undefined\n", "      options !== null\n")],
   "runs": [logging(SET, r"photoUrl")]},
  {"name": "K10", "what": "pino's own redaction of the list, main's, gone from beneath",
   "edits": [(LOGGING, "      redact: { paths: PATHS, censor: BLANKED },\n", "")],
   "runs": [logging(KEEP)]},
  {"name": "K11", "what": "the round's new content words gone: content, query, search, reason, username, nickname",
   "edits": [(LOGGING, "  \"content\",\n  \"query\",\n  \"search\",\n  \"reason\",\n", ""),
             (LOGGING, "  \"username\",\n  \"nickname\",\n", "")],
   "runs": [logging(SPELLED, r"MARKER-must-never-appear")]},
  {"name": "K12", "what": "a `msg` among a line's fields not blanked",
   "edits": [(LOGGING, "  if (msg !== undefined) out.msg = BLANKED;\n", "  if (msg !== undefined) out.msg = msg;\n")],
   "runs": [logging(SET, r"SECRET-MSG-FIELD")]},
  {"name": "N1", "what": "createDrop logs a refused commit's reservation id, an id T52 allows: registered to pass",
   "expect": "pass",
   "edits": [(DROPS, "      if (error instanceof Refused) return refusal(reply, error);\n      throw error;\n    }\n    return created(reply, response);",
              "      if (error instanceof Refused) {\n        request.log.info({ trouble: reservationId ?? \"none\" }, \"commit refused\");\n        return refusal(reply, error);\n      }\n      throw error;\n    }\n    return created(reply, response);")],
   "runs": [matrix(CELL)], "control": True},
  {"name": "N2", "what": "createDrop logs a refused commit's caption less its first and last characters",
   "edits": [(DROPS, "      if (error instanceof Refused) return refusal(reply, error);\n      throw error;\n    }\n    return created(reply, response);",
              "      if (error instanceof Refused) {\n        request.log.info({ trouble: (caption ?? \"none\").slice(1, -1) }, \"commit refused\");\n        return refusal(reply, error);\n      }\n      throw error;\n    }\n    return created(reply, response);")],
   "runs": [matrix(CELL, LOG + r"text people wrote at \$\.trouble")], "control": True},
  {"name": "N3", "what": "the gate logs the credential of a caller with another scheme than Bearer",
   "edits": [(SESSION, "    if (account === null) return unauthenticated(reply);\n",
              "    if (account === null) {\n        const header = request.headers.authorization ?? \"\";\n        if (header !== \"\" && !/^bearer /i.test(header)) request.log.info({ trouble: header.slice(header.indexOf(\" \") + 1) }, \"no session\");\n        return unauthenticated(reply);\n      }\n")],
   "runs": [matrix(LOG + r"a request's or answer's token at \$\.trouble", t=SIGNED_OUT)], "control": True},
  {"name": "N4", "what": "getHealth's odd answers write no request line and its even ones two",
   "edits": [(LOGGING, "export function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  request.log.info(",
              "let healthAnswers = 0;\nexport function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  if (request.routeOptions.config.operation === \"getHealth\") {\n    healthAnswers += 1;\n    if (healthAnswers % 2 === 1) return;\n    request.log.info({ op: \"getHealth\" }, \"request\");\n  }\n  request.log.info(")],
   "runs": [matrix(LOG + r"0 request lines for request \d+")], "control": True},
  {"name": "N5", "what": "Home serves a count on each day link, which the contract names too",
   "contract": True,
   "edits": [(DAYS, "  z.object({ occurrence: Occurrence, cover_drop_id: Id.optional() }),", "  z.object({ occurrence: Occurrence, cover_drop_id: Id.optional(), drops: z.int().min(0).optional() }),"),
             (HOME, "    occurrence: occurrenceBody(recent.day),\n", "    occurrence: occurrenceBody(recent.day),\n    drops: 3,\n")],
   "runs": [matrix(CELL, r"a DayLink that has drops")], "control": True},
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
