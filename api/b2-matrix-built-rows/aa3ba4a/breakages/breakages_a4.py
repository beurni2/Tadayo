"""Deliberate breakages of the outside audit's A4 fix (api/b2-matrix-built-rows), at its second head (round 1's fixes):
the app's BUILT_OPERATIONS tied to the privacy matrix's judged rows, no "missing" binding taken or acted on by a built
route, every bound value a row of its table, and Ben's video link named by every request that takes a drop and put in
every state the photo is. Every vitest run passes --fsModuleCache=false.

For each: change the places listed, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The files are restored after each. Run in a detached scratch worktree of the PR's last
head, never in the branch's own worktree; nothing else may use the database meanwhile.

  breakages_a4.py --check        count every anchor, change nothing
  breakages_a4.py B1 B2 ...      only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-a4-brk"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/a4/brk"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
APP = "services/api/src/app.ts"
ROWS = "tests/src/privacy/rows.ts"
BIND = "tests/src/privacy/bindings.ts"
HARNESS = "tests/src/privacy/harness.ts"
MATRIX = "tests/src/privacy/matrix.test.ts"
READ = "packages/domain/src/authorization/read-sql.ts"
RESERVE = "tests/src/privacy/reservation.ts"
HOME = "packages/domain/src/clubs/home.ts"

V = ["npx", "vitest", "run", "--fsModuleCache=false"]
T_ROWS_M = "gives every operation of the contract a row, and the app a route for each, the preflight, and no other"
T_ROLE = "answers the author as its account and its row say, and leaks nothing the scanner can find"
T_UNBUILT = "answers every operation nobody has built yet with the neutral not-found, and nothing else"
T_BIND = "binds every Id parameter of every built route to an object of the world"
T_TWO = "names each drop once as Ben's photo and once as Ben's video link (the outside audit's A4)"
T_GUESS = "guesses another club's object of the same kind: its video link for the cell's video link (the outside audit's A4)"
T_TIE = "ties the built routes to the judged rows both ways (the outside audit's A4)"
T_ACTS = "refuses a built route that acts on comments while the world has none, though it takes no comment_id"
T_TABLES = "names a table for every binding, and the bindings each built route names or acts on"
T_LIMITS = "refused each role at the limits its allowance reaches: a friend's photos, the star's links, and the whole"
T_UPLOADS = "made, completed, retried and found again the uploads each role's slots allow, and refused them once the day revealed"
T_WALK = "has every operation whose request or answer can name a comment take comment_id, act on it, or refuse one"
SUITES = {
    "harness": ("tests", [*V, "src/privacy/harness.test.ts"]),
    "app": ("services/api", [*V, "src/app.test.ts"]),
    "matrix-rows": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", "a route with no row fails"]),
    "matrix-author": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", "answers the author as its account"]),
    "matrix-all": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts"]),
}

TABLE = "  getMe: () => getMe,\n"
LEAK_COMMENT = (
    "  deleteComment: (deps) => async (request, reply) => {\n"
    "    const { comment_id } = request.params as { comment_id: string };\n"
"    if (!/^[A-Za-z0-9_-]{1,64}$/.test(comment_id)) return notFound(request, reply);\n"
    "    const [row] = await deps.sql<{ body: string }[]>`SELECT body FROM app.comments WHERE id = ${comment_id}`;\n"
    "    return row === undefined ? notFound(request, reply) : reply.code(200).send({ text: row.body });\n"
    "  },\n"
)
LEAK_EMBED = (
    "  getEmbed: (deps) => async (request, reply) => {\n"
    "    const { drop_id } = request.params as { drop_id: string };\n"
"    if (!/^[A-Za-z0-9_-]{1,64}$/.test(drop_id)) return notFound(request, reply);\n"
    "    const [row] = await deps.sql<{ provider: string; canonical_url: string }[]>`\n"
    "      SELECT s.provider, s.canonical_url FROM app.drops d JOIN app.sources s ON s.id = d.source_id\n"
    "       WHERE d.id = ${drop_id} AND d.media_class = 'external_video'`;\n"
    "    return row === undefined ? notFound(request, reply) : reply.code(200).send(row);\n"
    "  },\n"
)
LEAK_LIST = (
    "  listComments: (deps) => async (request, reply) => {\n"
    "    const { drop_id } = request.params as { drop_id: string };\n"
    "    if (!/^[A-Za-z0-9_-]{1,64}$/.test(drop_id)) return notFound(request, reply);\n"
    "    const rows = await deps.sql<{ body: string }[]>`SELECT body FROM app.comments WHERE drop_id = ${drop_id}`;\n"
    "    return rows.length === 0 ? notFound(request, reply) : reply.code(200).send({ comments: rows });\n"
    "  },\n"
)
PHANTOM = (
    "    ...[...built]\n"
    "      .filter((id) => !ids.has(id))\n"
    "      .map((id) => `${id} is built but isn't an operation of the contract: buildApp never routes it`),\n"
)
ROW_CHECK = (
    "    ...[...built]\n"
    "      .filter((id) => rows[id] === NONE)\n"
    "      .map((id) => `${id} is built but its row is NONE: a built route's row is judged, never the skeleton's`),\n"
    "    ...Object.entries(rows)\n"
    "      .filter(([id, row]) => row !== NONE && !built.has(id))\n"
    "      .map(([id]) => `${id} isn't built but its row isn't NONE: only a built route has a row of its own`),\n"
)

MATRIX_CHECK = "  if (problems.length > 0) throw new Error(`the cell's bindings name nothing of its world: ${problems.join(\"; \")}`);\n"
S_COMMENT = "comment_id's value guess_"

B = [
    ("B1 the audit's deleteComment, built with its row left NONE", [(APP, [(TABLE, LEAK_COMMENT + TABLE)])], "matrix-rows", T_ROWS_M, S_COMMENT),
    ("B1c B1 with checkBoundRows's throw undone: the row check sees it", [(APP, [(TABLE, LEAK_COMMENT + TABLE)]), (MATRIX, [(MATRIX_CHECK, "")])], "matrix-rows", T_ROWS_M),
    ("B2 B1 with the row check undone: the binding check sees it", [(APP, [(TABLE, LEAK_COMMENT + TABLE)]), (ROWS, [(ROW_CHECK, "")])], "matrix-rows", T_ROWS_M, S_COMMENT),
    ("B2c B2 with checkBoundRows's throw undone: the binding check sees it", [(APP, [(TABLE, LEAK_COMMENT + TABLE)]), (ROWS, [(ROW_CHECK, "")]), (MATRIX, [(MATRIX_CHECK, "")])], "matrix-rows", T_ROWS_M),
    ("B3 the audit's getEmbed, built with its row left NONE", [(APP, [(TABLE, LEAK_EMBED + TABLE)])], "matrix-rows", T_ROWS_M),
    ("B4 B3 with the row check undone: the cells see it", [(APP, [(TABLE, LEAK_EMBED + TABLE)]), (ROWS, [(ROW_CHECK, "")])], "matrix-author", T_ROLE),
    ("B5 BUILT_OPERATIONS leaves one handler out", [(APP, [(
        "export const BUILT_OPERATIONS: readonly string[] = Object.freeze(Object.keys(HANDLERS));",
        'export const BUILT_OPERATIONS: readonly string[] = Object.freeze(Object.keys(HANDLERS).filter((id) => id !== "getHome"));',
    )])], "app", T_UNBUILT),
    ("B5m B5, on the matrix's row check", [(APP, [(
        "export const BUILT_OPERATIONS: readonly string[] = Object.freeze(Object.keys(HANDLERS));",
        'export const BUILT_OPERATIONS: readonly string[] = Object.freeze(Object.keys(HANDLERS).filter((id) => id !== "getHome"));',
    )])], "matrix-rows", T_ROWS_M),
    ("B6 upload_id, which two built routes take, back to missing", [(BIND, [("  upload_id: (targets) => targets.upload,\n", '  upload_id: "missing",\n')])], "harness", T_BIND),
    ("B7 specsFor sends a parameter's first value only", [(HARNESS, [(
        "  const values = bindAll(name, targets);\n", "  const values = bindAll(name, targets).slice(0, 1);\n"
    )])], "harness", T_TWO),
    ("B8 the read predicate lets a video link through in any drop state", [(READ, [(
        "       AND d.state = 'active'\n       AND o.status = 'scheduled'\n",
        "       AND (d.state = 'active' OR d.media_class = 'external_video')\n       AND o.status = 'scheduled'\n",
    )])], "matrix-author", T_ROLE),
    ("B9 a listComments that leaks comments, built with its row NONE and the row check undone", [
        (APP, [(TABLE, LEAK_LIST + TABLE)]), (ROWS, [(ROW_CHECK, "")])], "matrix-rows", T_ROWS_M, S_COMMENT),
    ("B9c B9 with checkBoundRows's throw undone: ACTS_ON in the binding check sees it", [
        (APP, [(TABLE, LEAK_LIST + TABLE)]), (ROWS, [(ROW_CHECK, "")]), (MATRIX, [(MATRIX_CHECK, "")])], "matrix-rows", T_ROWS_M),
    ("B10 upload_id bound to the cell's slot, an object of another kind", [(BIND, [(
        "  upload_id: (targets) => targets.upload,\n", "  upload_id: (targets) => targets.reservation,\n"
    )])], "matrix-author", T_ROLE, "upload_id's value rsv_"),
    ("B11 comment_id bound to Ben's photo, the review's probe", [(BIND, [(
        '  comment_id: "missing",\n', "  comment_id: (targets) => targets.drop,\n"
    )])], "matrix-author", T_ROLE, "comment_id's value drp_"),
    ("B12 elsewhereOf always gives the first value", [(HARNESS, [(
        "  const value = values[at];\n", "  const value = values[0];\n"
    )])], "harness", T_GUESS),
    ("B13 putInState leaves the video out", [(MATRIX, [("  await state.make(tx, w, ben.video);\n", "")])], "matrix-author", T_ROLE),
    ("B14 rowProblems without the built id that isn't an operation", [(ROWS, [(PHANTOM, "")])], "harness", T_TIE),
    ("B15 bindingProblems without ACTS_ON", [(BIND, [(
        "      ...(actsOn[operation.id] ?? [])\n", "      ...([] as string[])\n"
    )])], "harness", T_ACTS),
    ("B17 RESERVE_TABLE back to two photos, three links, three photos", [(RESERVE, [(
        '  "photo",\n  "photo",\n  "photo",\n  "external_video",\n  "external_video",\n  "external_video",\n  "photo",\n  "photo",\n];\n',
        '  "photo",\n  "photo",\n  "external_video",\n  "external_video",\n  "external_video",\n  "photo",\n  "photo",\n  "photo",\n];\n',
    )])], "matrix-all", T_LIMITS),
    ("B18 the uploads' table's request under a link's slot left out", [(MATRIX, [(
        '            [linkSlot, "a link\'s slot the table holds, live"],\n', ""
    )])], "matrix-all", T_UPLOADS),
    ("B19 ACTS_ON without getOccurrence", [(BIND, [('  getOccurrence: ["comment_id"],\n', "")])], "harness", T_WALK),
    ("B20 REFUSES_COMMENTS without getHome", [(BIND, [(
        '  getHome: {\n    file: "packages/domain/src/clubs/home.ts",\n'
        '    refusal: "home: the open day\'s drops have reactions or comments, or the viewer\'s favourite, which B6\'s page shows",\n'
        '  },\n', ""
    )])], "harness", T_WALK),
    ("B21 Home's refusal of a page with a comment lifted", [(HOME, [(
        '      if (flag(row["open_page_later"]))\n        throw new Error(\n'
        '          "home: the open day\'s drops have reactions or comments, or the viewer\'s favourite, which B6\'s page shows",\n'
        '        );\n', ""
    )])], "harness", T_WALK),
    ("B22 a role cell's upload taken from another club's world", [(MATRIX, [(
        "            upload,\n            ...(await rosterTargets(tx, w)),\n",
        "            upload: elsewhere.upload,\n            ...(await rosterTargets(tx, w)),\n",
    )])], "matrix-author", T_ROLE),
    ("B23 elsewhereOf gives the first value for one another club lacks", [(HARNESS, [(
        "  if (value === undefined)\n    throw new Error(\n"
        "      `another club has no value ${String(at + 1)} for ${name}: its binding gives ${String(values.length)}`,\n"
        "    );\n  return value;\n",
        "  return value ?? (values[0] as string);\n",
    )])], "harness", T_GUESS),
    ("B16 TABLES without star", [(BIND, [('  star: { table: "app.memberships", column: "interval_id", club: "club_id" },\n', "")])], "harness", T_TABLES),
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
        for name, files, suite, words, *_ in B:
            ok = suite in SUITES and len(words) > 6
            for path, changes in files:
                text = (ROOT / path).read_text()
                try:
                    ok = ok and apply(text, changes) != text
                except AssertionError as e:
                    ok = False
                    print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for name, files, suite, words, *setup in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        cwd, cmd = SUITES[suite]
        origs = {path: (ROOT / path).read_text() for path, _ in files}
        try:
            patch = ""
            for path, changes in files:
                broken = apply(origs[path], changes)
                (ROOT / path).write_text(broken)
                patch += "".join(difflib.unified_diff(origs[path].splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            (OUT / f"{code}.patch").write_text(patch)
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            errors = [l.strip()[:300] for l in out.splitlines() if l.startswith("Error:")] if "Failed Suites" in out else []
            in_setup = bool(setup) and any(setup[0] in e for e in errors)
            verdict = "CAUGHT" if caught else ("CAUGHT IN THE FILE'S SETUP" if in_setup else ("CAUGHT BY ANOTHER TEST" if failed or errors else ("NO RESULT" if not summary else "NOT CAUGHT")))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            for e in errors[:3]:
                print("   ", e, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            for path, text in origs.items():
                (ROOT / path).write_text(text)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
