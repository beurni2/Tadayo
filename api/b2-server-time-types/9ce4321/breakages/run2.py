"""api/b2-server-time-types, after the first review (run2): the plan's section 3 breakages, each applied to the slice's tree in a scratch worktree,
run against the suites named beforehand, and every file restored and checked after.

Usage: run.py <worktree> <out dir> [NAME ...] [--control] [--slice <dir>] [--check]
  Every file a breakage edits is copied first, restored from that copy after, and checked equal to the tree's
  own at the start, so the slice's tree may be an uncommitted copy.
  Without --control: <worktree> is the slice's tree. Caught: the run exits non-zero, its output holds every
  registered pattern, and none of its absent patterns. A run registered as a miss is expected to pass.
  With --control: <worktree> is main's tree, with main's tests; each control run is expected to pass (a miss).
  T0 copies the slice's one-clock.test.ts (from --slice <dir>) onto main's tree and runs it there.
"""
import os, re, subprocess, sys, pathlib, json, shutil, difflib

SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
NODE = "/opt/nvm/versions/node/v26.13.0/bin"
ENV = dict(os.environ, PATH=f"{NODE}:{os.environ['PATH']}",
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")

OC = "packages/domain/src/time/one-clock.test.ts"
HR = "services/api/src/clubs/home.ts"
CT = "packages/domain/src/drops/counter.ts"
AR = "packages/domain/src/clubs/apply-roster.ts"
GN = "packages/domain/src/schedule/generate.ts"
IV = "packages/domain/src/clubs/invitation.ts"
RD = "packages/domain/src/authorization/read.ts"
LC = "packages/domain/src/clubs/leave-club.ts"
ST = "tools/ops/src/spike-time.ts"
HS = "tests/src/privacy/harness.ts"
AUDIENCE = "member in the audience"

def unit(words, absent=()):
    return {"kind": "unit", "pkg": "packages/domain", "files": ["src/time/one-clock.test.ts"], "words": list(words), "absent": list(absent)}
def matrix(role, expect=None):
    return {"kind": "matrix", "role": role, "words": [re.escape(f"answers the {role}")], "absent": [], "expect": expect}
def harness(words, absent=()):
    return {"kind": "unit", "pkg": "tests", "files": ["src/privacy/harness.test.ts"], "words": list(words), "absent": list(absent)}
def caught_by(run, words):
    return dict(run, words=run["words"] + list(words))
def misses(run):
    return dict(run, expect="pass")

LIST = r"finds each plain instant the server's code takes on PLAIN_INSTANTS"
LIST_FAILED = r"FAIL\s+src/time/one-clock\.test\.ts > [^\n]*finds each plain instant"
# vitest prints the failing list as JSON, so the request's quotes come escaped: {\"query\":...
SINCE = r'getHome, manipulated \{\\"query\\":\{[^\n]*\\"since\\":\\"'
B16_NEW = ('      if (home === null) return null;\n'
           '      const since = (request.query as Record<string, unknown> | null)?.["since"];\n'
           '      const made = homeBody(now, home);\n'
           '      return typeof since === "string" && typeof made === "object" && made !== null && !Array.isArray(made)\n'
           '        ? { ...made, server_now: since }\n'
           '        : made;\n')
PLANTED = r"finds a plain instant a parameter or a field takes"
COMPILE = r"compiles the server's TypeScript without an error"
COMPILE_FAILED = r"FAIL\s+src/time/one-clock\.test\.ts > [^\n]*compiles the server's TypeScript"
B15_OLD = "      return home === null ? null : homeBody(now, home);\n"
B15_NEW = ('      const since = (request.query as Record<string, unknown> | null)?.["since"];\n'
           '      return home === null ? null : homeBody(typeof since === "string" ? Temporal.Instant.from(since) : now, home);\n')

SECTION_01 = ["withServerNow(now)", "homeBody(now)", "clubListBody(now)", "membersBody(now)", "scheduleBody(now)",
              "settleLapsed(at)", "holdSlot(slot).at", "freeSlot(at)", "consumeSlot(at)", "reservationExpiry(at)",
              "uploadExpiry(at)", "reserveReceipt(at)", "reserveAsMember(at)", "settleContributions(at)",
              "NewRevision.at", "purgeEnded(now)", "endSignIn(now)", "daysToMake(now)", "firstDate(confirmedAt)",
              "newMemberFirstDate(confirmedAt)", "finishEvent(at)",
              # Since the first review: spike S5's start (tools/ops) and two answers' times.
              "firstDate(now)", "startDay(now)", "LeftClub.leftAt", "DeviceRegistration.registeredAt"]
# Kept, and typed `unknown` on main, so not found there (the first review's PR2).
KEPT_NOT_ON_MAIN = ["packages/domain/src/authorization/read.ts: notBeforeReveal(at)",
                    "packages/domain/src/authorization/read.ts: notBeforeReveal(revealAt)"]

BREAKAGES = [
  {"name": "B15", "what": "Home's server_now from ?since=, with no cast (part 1's B15, registered then as missed by every suite)",
   "edits": [(HR, B15_OLD, B15_NEW)],
   "runs": [unit([COMPILE, r"not assignable to parameter of type 'ServerNow'"]), caught_by(matrix(AUDIENCE), [SINCE])],
   "control": [unit([]), matrix(AUDIENCE)]},
  {"name": "B16", "what": "Home's server_now replaced by ?since='s text after homeBody (the first review's privacy finding 1)",
   "edits": [(HR, B15_OLD, B16_NEW)],
   "runs": [misses(unit([])), caught_by(matrix(AUDIENCE), [SINCE])],
   "control": [matrix(AUDIENCE)]},
  {"name": "P1", "what": "settleLapsed takes a plain instant again",
   "edits": [(CT, "export async function settleLapsed(tx: QuerySql, key: CounterKey, at: ServerNow): Promise<CounterRow> {",
                  "export async function settleLapsed(tx: QuerySql, key: CounterKey, at: Temporal.Instant): Promise<CounterRow> {")],
   "runs": [unit([LIST, r"settleLapsed\(at\)"])], "control": []},
  {"name": "P2", "what": "homeBody takes a plain instant again, and B15 with it",
   "edits": [(HR, "export function homeBody(now: ServerNow, home: HomeRead): Json {",
                  "export function homeBody(now: Temporal.Instant, home: HomeRead): Json {"),
             (HR, "  type RecentDay,\n  type ServerNow,\n} from \"@tadayo/domain\";", "  type RecentDay,\n} from \"@tadayo/domain\";"),
             (HR, B15_OLD, B15_NEW)],
   "runs": [unit([LIST, r"homeBody\(now\)"], [COMPILE_FAILED])], "control": []},
  {"name": "P3", "what": "NewRevision.at a plain instant again, a field",
   "edits": [(AR, "  readonly proposer: string;\n  readonly at: ServerNow;", "  readonly proposer: string;\n  readonly at: Temporal.Instant;")],
   "runs": [unit([LIST, r"NewRevision\.at"])], "control": []},
  {"name": "P4", "what": "daysToMake takes ServerNow | Temporal.Instant, a union",
   "edits": [(GN, "export function daysToMake(facts: GenerationFacts, now: ServerNow): OwedDay[] {",
                  "export function daysToMake(facts: GenerationFacts, now: ServerNow | Temporal.Instant): OwedDay[] {")],
   "runs": [unit([LIST, r"daysToMake\(now\)"])], "control": []},
  {"name": "P5", "what": "a kept parameter renamed: wholeSecond(moment)",
   "edits": [(IV, "function wholeSecond(instant: Temporal.Instant): Temporal.Instant {\n  const nanoseconds = instant.epochNanoseconds;",
                  "function wholeSecond(moment: Temporal.Instant): Temporal.Instant {\n  const nanoseconds = moment.epochNanoseconds;")],
   "runs": [unit([LIST, r"wholeSecond\(moment\)", r"wholeSecond\(instant\)"])], "control": []},
  {"name": "P6", "what": "plainInstants reads a whole type only, no union",
   "edits": [(OC, "    (type.isUnion() ? type.types : [type]).some(\n", "    [type].some(\n")],
   "runs": [unit([LIST, PLANTED, r"late\(at\)", r"Asked\.at", r"DayFacts\.starLeftAt"])], "control": []},
  {"name": "P7", "what": "plainInstants reads parameters only, no fields",
   "edits": [(OC, "    const named = ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node);",
                  "    const named = ts.isParameter(node);")],
   "runs": [unit([LIST, PLANTED, r"Asked\.at", r"held\(slot\)\.at", r"Counter\.at", r"DayFacts\.revealAt"])], "control": []},
  {"name": "P8", "what": "plainInstants matches Temporal.Instant by name again, skipping every intersection (the first commit's)",
   "edits": [(OC, """      (part) => !checker.isTypeAssignableTo(part, serverNow) && checker.isTypeAssignableTo(part, instant),
    );""", """      (part) => {
        if (part.isIntersection()) return false;
        const symbol = part.getSymbol();
        return (
          symbol?.getName() === "Instant" &&
          (symbol.declarations ?? []).some((declaration) =>
            program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
          )
        );
      },
    );""")],
   "runs": [unit([PLANTED, r"stamped\(at\)", r"fixed\(at\)", r"chosen\(at\)"], [LIST_FAILED])], "control": []},
  {"name": "P9", "what": "the list test leaves the time module out again",
   "edits": [(OC, "const found = [...serverTypeScript(), ...timeModule()].flatMap(", "const found = [...serverTypeScript()].flatMap(")],
   "runs": [unit([LIST, r"civil\.ts: DayInstants\.revealAt", r"instant\.ts: contractInstant\(instant\)",
                  r"instant\.ts: INSTANT_TYPE\.serialize\(value\)"])], "control": []},
  {"name": "P10", "what": "notBeforeReveal takes unknown again",
   "edits": [(RD, "export function notBeforeReveal(at: Temporal.Instant | null, revealAt: Temporal.Instant): boolean {",
                  "export function notBeforeReveal(at: unknown, revealAt: unknown): boolean {")],
   "runs": [unit([LIST, r"notBeforeReveal\(at\)", r"notBeforeReveal\(revealAt\)"])], "control": []},
  {"name": "P11", "what": "spike S5's startDay takes a plain instant again (tools/ops)",
   "edits": [(ST, "export function startDay(now: ServerNow): Temporal.PlainDate {",
                  "export function startDay(now: Temporal.Instant): Temporal.PlainDate {")],
   "runs": [unit([LIST, r"spike-time\.ts: startDay\(now\)"])], "control": []},
  {"name": "P12", "what": "LeftClub.leftAt a plain instant again, an answer's time",
   "edits": [(LC, "  readonly leftAt: ServerNow;", "  readonly leftAt: Temporal.Instant;")],
   "runs": [unit([LIST, r"LeftClub\.leftAt"])], "control": []},
  {"name": "P13", "what": "the matrix's manipulations without the request of time names",
   "edits": [(HS, "    { ...spec, query: { ...spec.query, ...Object.fromEntries(TIME_NAMES.map((name) => [name, at])) } },\n", "")],
   "runs": [harness([r"FAIL\s+src/privacy/harness\.test\.ts > [^\n]*`since` in the query",
                     r"FAIL\s+src/privacy/harness\.test\.ts > [^\n]*`client_time` in the query",
                     r"FAIL\s+src/privacy/harness\.test\.ts > [^\n]*sends every other name a time might come under",
                     r"FAIL\s+src/privacy/harness\.test\.ts > [^\n]*gets the answers each step counts"])], "control": []},
]

def sh(cmd, cwd, timeout=1800):
    p = subprocess.run(cmd, cwd=cwd, env=ENV, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr

def fresh_db(wt):
    code, out = sh(["bash", f"{SP}/s4/pgci.sh"], wt); assert code == 0, out
    code, out = sh(["python3", "tools/ci/ci_steps.py", "db-bootstrap"], wt); assert code == 0, out

def run_one(wt, run):
    if run["kind"] == "unit":
        return sh([f"{NODE}/npx", "vitest", "run", *run["files"]], f"{wt}/{run['pkg']}")
    fresh_db(wt)
    return sh([f"{NODE}/npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts",
               "-t", re.escape(f"answers the {run['role']} as")], f"{wt}/tests")

def verdict_of(run, code, text, control):
    found = [w for w in run["words"] if re.search(w, text)]
    present = [w for w in run["absent"] if re.search(w, text)]
    if control:
        return ("passed (missed)" if code == 0 else "failed"), [], []
    if run.get("expect") == "pass":
        return ("passed, a miss registered beforehand" if code == 0 else "FAILED, registered as a miss"), [], []
    ok = code != 0 and len(found) == len(run["words"]) and not present
    return ("caught" if ok else ("NOT CAUGHT" if code == 0 else "FAILED, words wrong")), [w for w in run["words"] if w not in found], present

def main():
    args = sys.argv[1:]
    slice_dir = None
    if "--slice" in args:
        i = args.index("--slice"); slice_dir = args[i + 1]; del args[i:i + 2]
    wt, out = args[0], pathlib.Path(args[1])
    control = "--control" in args
    only = [a for a in args[2:] if not a.startswith("--")]
    out.mkdir(parents=True, exist_ok=True)
    if not control:
        for b in BREAKAGES:
            text = {}
            for f, old, new in b["edits"]:
                text.setdefault(f, (pathlib.Path(wt) / f).read_text())
                assert text[f].count(old) == 1, (b["name"], f, old[:80])
    if "--check" in args:
        print(f"{len(BREAKAGES)} breakages, anchors ok"); return
    results = []
    baseline = {f: (pathlib.Path(wt) / f).read_bytes() for b in BREAKAGES for f, _, _ in b["edits"]}
    if control and slice_dir and (not only or "T0" in only):
        # T0: the slice's check on main's code.
        assert sh(["git", "status", "--porcelain", "--", OC], wt)[1].strip() == ""
        own = (pathlib.Path(wt) / OC).read_bytes()
        shutil.copyfile(pathlib.Path(slice_dir) / OC, pathlib.Path(wt) / OC)
        try:
            run = unit([LIST] + [re.escape(n) for n in SECTION_01])
            code, text = run_one(wt, run)
            (out / "T0.0.txt").write_text(text)
            found = [w for w in run["words"] if re.search(w, text)]
            plus = sorted(set(re.findall(r'^\s*\+\s+"([^"]+)",?$', text, re.M)))
            minus = sorted(set(re.findall(r'^\s*-\s+"([^"]+)",?$', text, re.M)))
            extra = sorted(name.split(": ", 1)[1] for name in plus)
            exact = extra == sorted(SECTION_01) and minus == sorted(KEPT_NOT_ON_MAIN)
            v = "caught" if code != 0 and len(found) == len(run["words"]) and exact else "NOT AS REGISTERED"
            line = {"name": "T0", "what": "the slice's one-clock.test.ts on main's code (tests first)", "run": "unit: one-clock.test.ts",
                    "exit": code, "verdict": v, "missing": [w for w in run["words"] if w not in found],
                    "found_not_kept": len(plus), "kept_not_found": minus, "exactly_as_registered": exact}
            results.append(line); print(json.dumps(line), flush=True)
        finally:
            (pathlib.Path(wt) / OC).write_bytes(own)
            assert (pathlib.Path(wt) / OC).read_bytes() == own
            assert sh(["git", "status", "--porcelain", "--", OC], wt)[1].strip() == ""
        # C0: main's own check on main's code, which has the 21.
        code, text = run_one(wt, unit([]))
        (out / "C0.0.txt").write_text(text)
        line = {"name": "C0", "what": "main's one-clock.test.ts on main's code, which takes all 25 as plain instants", "run": "unit: one-clock.test.ts",
                "exit": code, "verdict": "passed (missed)" if code == 0 else "failed", "missing": []}
        results.append(line); print(json.dumps(line), flush=True)
    for b in BREAKAGES:
        if only and b["name"] not in only: continue
        runs = b["control"] if control else b["runs"]
        if not runs: continue
        files = sorted({f for f, _, _ in b["edits"]})
        # Each file restored from its own copy, taken before the breakage, and checked against the copy after.
        own = {f: (pathlib.Path(wt) / f).read_bytes() for f in files}
        for f in files:
            assert own[f] == baseline[f], (b["name"], f, "target not as the slice has it")
        try:
            for f, old, new in b["edits"]:
                p = pathlib.Path(wt) / f
                t = p.read_text(); assert t.count(old) == 1, (b["name"], f, old[:60]); p.write_text(t.replace(old, new))
            (out / f"{b['name']}{'.control' if control else ''}.patch").write_text("".join(
                "".join(difflib.unified_diff(own[f].decode().splitlines(True), (pathlib.Path(wt) / f).read_text().splitlines(True), f"a/{f}", f"b/{f}"))
                for f in files))
            for i, run in enumerate(runs):
                code, text = run_one(wt, run)
                (out / f"{b['name']}{'.control' if control else ''}.{i}.txt").write_text(text)
                verdict, missing, present = verdict_of(run, code, text, control)
                line = {"name": b["name"], "what": b["what"], "run": f"{run['kind']}: " + (run.get("role") or " ".join(run["files"])) +
                        (" (registered as a miss)" if run.get("expect") == "pass" else ""), "exit": code, "verdict": verdict,
                        "missing": missing, "present_but_absent_registered": present}
                results.append(line); print(json.dumps(line), flush=True)
        finally:
            for f in files:
                (pathlib.Path(wt) / f).write_bytes(own[f])
            for f in files:
                assert (pathlib.Path(wt) / f).read_bytes() == baseline[f], (b["name"], f, "not restored")
    (out / ("control.json" if control else "results.json")).write_text(json.dumps(results, indent=1))

main()
