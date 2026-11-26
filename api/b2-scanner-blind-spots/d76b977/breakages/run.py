"""PR #137, round 1: the breakages registered for the round-1 fixes (docs/plans/api-b2-scanner-blind-spots.md,
section 5), each applied to the code under test, run against the suites registered for it, and every file restored
from its own copy and checked after. The four on the matrix are run again in a worktree at the PR's first commit
(6459ad3), as controls: what the slice's scanner and matrix made of each before round 1.

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

ROLE = "member in the audience"
PATTERN = f"answers the {ROLE} as|wrote a request line for every answer|wrote one request line for every request"
CELL = re.escape(f"answers the {ROLE}")

def matrix(*words):
    return {"kind": "matrix", "words": list(words)}
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

BREAKAGES = [
  {"name": "R1", "what": "neverKey as 6459ad3 had it: no superset of main's list, an acronym's plural split, a never-word written as two words missed",
   "edits": [(SCANNER, "  if (NEVER_KEY.test(key)) return true;\n", ""),
             (SCANNER, "    .replace(/([A-Z]{2,})s(?![a-z])/g, \"$1S\")\n", ""),
             (SCANNER, "      NEVER_WORDS.has(`${word}${words[index + 1] ?? \"\"}`) ||\n", "")],
   "runs": [scanner(WORDS, OLD)]},
  {"name": "R2", "what": "the round's new never-words gone: a number, whether there is any, a time, a last word `on`, a count at a word's end, and the split at digits",
   "edits": [(SCANNER, "    \"n\",\n    \"num\",\n    \"number\",\n    \"has\",\n    \"any\",\n", ""),
             (SCANNER, "    \"time\",\n    \"timestamp\",\n    \"created\",\n    \"updated\",\n", ""),
             (SCANNER, "(last === \"at\" || last === \"on\")", "last === \"at\""),
             (SCANNER, "|width|height|count|total)s?$/;", "|width|height)s?$/;"),
             (SCANNER, "    .replace(/([A-Za-z])([0-9])/g, \"$1_$2\")\n    .replace(/([0-9])([A-Za-z])/g, \"$1_$2\")\n", "")],
   "runs": [scanner(WORDS, r"num_drops")]},
  # R2 as run failed in its test on keyWords("url2x"), an assertion before `num_drops`, so its pattern was missing:
  # registered again, after its run and before these, as two breakages, each with its own pattern.
  {"name": "R2a", "what": "R2 without the split at digits: the new never-words, a last word `on` and a count at a word's end gone",
   "edits": [(SCANNER, "    \"n\",\n    \"num\",\n    \"number\",\n    \"has\",\n    \"any\",\n", ""),
             (SCANNER, "    \"time\",\n    \"timestamp\",\n    \"created\",\n    \"updated\",\n", ""),
             (SCANNER, "(last === \"at\" || last === \"on\")", "last === \"at\""),
             (SCANNER, "|width|height|count|total)s?$/;", "|width|height)s?$/;")],
   "runs": [scanner(WORDS, r"num_drops")]},
  {"name": "R2b", "what": "the split between letters and digits gone",
   "edits": [(SCANNER, "    .replace(/([A-Za-z])([0-9])/g, \"$1_$2\")\n    .replace(/([0-9])([A-Za-z])/g, \"$1_$2\")\n", "")],
   "runs": [scanner(WORDS, r"url2x")]},
  {"name": "R3", "what": "Home's open day and the revealed day back on OPENED_ONLY, their own lists gone",
   "edits": [(SCANNER, "  \"DropRevealed\",\n  \"HighlightEntry\",\n", "  \"DropRevealed\",\n  \"HighlightEntry\",\n  \"HomeDay\",\n  \"RevealedDay\",\n"),
             (SCANNER, "  // Home's open day: opened, but its `next` is the club's next day, still collecting.\n  HomeDay: { required: [\"mode\", \"server_now\", \"club\", \"club_today\", \"day\", \"recent_days\"], optional: [\"next\"] },\n", ""),
             (SCANNER, "  // The opened day: its `add_target` is the star's next day, still collecting.\n  RevealedDay: {\n    required: [\"stage\", \"server_now\", \"occurrence\", \"club\", \"viewer\", \"drops\", \"highlights\"],\n    optional: [\"add_target\", \"next_cursor\"],\n  },\n", "")],
   "runs": [scanner(LISTS)]},
  {"name": "R4", "what": "the log's needles matched only whole, not inside a value",
   "edits": [(SCANNER, "    for (let at = 0; at + SHORTEST_TEXT <= value.length; at += 1)\n", "    for (let at = 0; at < 0; at += 1)\n")],
   "runs": [scanner(NEEDLE, PLANTED)]},
  {"name": "R5", "what": "worldTexts without comments, labels, account names and invitations",
   "edits": [(SCANNER, "    texts.push(...drop.comments);\n", ""),
             (SCANNER, "  for (const club of world.clubs.values()) texts.push(club.name, ...club.labels.keys());\n", "  for (const club of world.clubs.values()) texts.push(club.name);\n"),
             (SCANNER, "  for (const account of world.accounts.values()) if (account.name !== null) texts.push(account.name);\n", "")],
   "runs": [scanner(TEXTS)]},
  {"name": "R6", "what": "an inline object in a day before its reveal: ViewerDay.joined_later as an object of its own (contract)",
   "contract": True,
   "edits": [(DAYS, "  z.object({ is_star: z.boolean(), joined_later: z.boolean() }),",
              "  z.object({ is_star: z.boolean(), joined_later: z.object({ count: z.int().min(0) }) }),")],
   "runs": [scanner(INLINE, r"ViewerDay\.joined_later")]},
  {"name": "R7", "what": "the author's preview off BEFORE_REVEAL_OPERATIONS",
   "edits": [(SCANNER, "  \"listMembers\",\n  \"getAuthorPreview\",\n]);", "  \"listMembers\",\n]);")],
   "runs": [scanner(OPS)]},
  {"name": "R8", "what": "a child logger's bindings not redacted (redactBindings no longer called)",
   "edits": [(APP, "  redactBindings(app.log);\n", "")],
   "runs": [logging(CHILD)]},
  {"name": "R9", "what": "the redaction back to the list's own spellings only",
   "edits": [(LOGGING, "  return REDACTED.has(squash(key)) || wordsOf(key).some((word) => WORDS.has(word));", "  return REDACTED.has(squash(key)) || wordsOf(key).length < 0;")],
   "runs": [logging(SPELLED)]},
  {"name": "M1", "what": "createDrop logs a refused commit's caption, which no world stores",
   "edits": [(DROPS, "      if (error instanceof Refused) return refusal(reply, error);\n      throw error;\n    }\n    return created(reply, response);",
              "      if (error instanceof Refused) {\n        request.log.info({ trouble: caption }, \"commit refused\");\n        return refusal(reply, error);\n      }\n      throw error;\n    }\n    return created(reply, response);")],
   "runs": [matrix(CELL, LOG + r"text people wrote at \$\.trouble")], "control": True},
  # Registered after M1's control run, which caught M1 too: the refused commits that carry a caption in that cell repeat
  # the caption of the drop the step had just added, which the world stores. A refused proposal's label is in no world.
  {"name": "M5", "what": "proposeRoster logs a refused proposal's first label, which no world stores",
   "edits": [(ROSTER, "      response = await deps.sql.begin((tx) => proposeRoster(tx, deps.clock, input, rosterRevisionBody));\n    } catch (error) {\n      if (error instanceof Refused) return refusal(reply, error);\n",
              "      response = await deps.sql.begin((tx) => proposeRoster(tx, deps.clock, input, rosterRevisionBody));\n    } catch (error) {\n      if (error instanceof Refused) {\n        request.log.info({ trouble: input.add[0]?.label ?? \"none\" }, \"proposal refused\");\n        return refusal(reply, error);\n      }\n")],
   "runs": [matrix(CELL, LOG + r"text people wrote at \$\.trouble")], "control": True},
  {"name": "M2", "what": "createInvitation logs the link's token, which only its answer gives",
   "edits": [(ROSTER, "    const { answer, token } = made;\n", "    const { answer, token } = made;\n    request.log.info({ trouble: token ?? \"none\" }, \"link made\");\n")],
   "runs": [matrix(CELL, LOG + r"a request's or answer's token at \$\.trouble")], "control": True},
  {"name": "M3", "what": "getHealth's answers write no request line",
   "edits": [(LOGGING, "export function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  request.log.info(",
              "export function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  if (request.routeOptions.config.operation === \"getHealth\") return;\n  request.log.info(")],
   "runs": [matrix(LOG + r"\d+ request lines for \d+ requests")], "control": True},
  {"name": "M4", "what": "getHealth's answers write two request lines",
   "edits": [(LOGGING, "export function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  request.log.info(",
              "export function requestLine(request: FastifyRequest, reply: FastifyReply): void {\n  if (request.routeOptions.config.operation === \"getHealth\") request.log.info({ op: \"getHealth\" }, \"request\");\n  request.log.info(")],
   "runs": [matrix(LOG + r"\d+ request lines for \d+ requests")], "control": True},
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
