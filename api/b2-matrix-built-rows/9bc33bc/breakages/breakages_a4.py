"""Deliberate breakages of the outside audit's A4 fix (api/b2-matrix-built-rows): the app's BUILT_OPERATIONS tied
to the privacy matrix's judged rows, no "missing" binding for a built route, and Cleo's video link named by every
request that takes a drop. Every vitest run passes --fsModuleCache=false.

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

V = ["npx", "vitest", "run", "--fsModuleCache=false"]
T_ROWS_M = "gives every operation of the contract a row, and the app a route for each, the preflight, and no other"
T_ROLE = "answers the author as its account and its row say, and leaks nothing the scanner can find"
T_UNBUILT = "answers every operation nobody has built yet with the neutral not-found, and nothing else"
T_BIND = "binds every Id parameter of every built route to an object of the world"
T_TWO = "names each drop once as Ben's photo and once as Cleo's video link (the outside audit's A4)"
SUITES = {
    "harness": ("tests", [*V, "src/privacy/harness.test.ts"]),
    "app": ("services/api", [*V, "src/app.test.ts"]),
    "matrix-rows": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", "a route with no row fails"]),
    "matrix-author": ("tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts", "-t", "answers the author as its account"]),
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
ROW_CHECK = (
    "    ...[...built]\n"
    "      .filter((id) => rows[id] === NONE)\n"
    "      .map((id) => `${id} is built but its row is NONE: a built route's row is judged, never the skeleton's`),\n"
    "    ...Object.entries(rows)\n"
    "      .filter(([id, row]) => row !== NONE && !built.has(id))\n"
    "      .map(([id]) => `${id} isn't built but its row isn't NONE: only a built route has a row of its own`),\n"
)

B = [
    ("B1 the audit's deleteComment, built with its row left NONE", [(APP, [(TABLE, LEAK_COMMENT + TABLE)])], "matrix-rows", T_ROWS_M),
    ("B2 B1 with the row check undone: the binding check sees it", [(APP, [(TABLE, LEAK_COMMENT + TABLE)]), (ROWS, [(ROW_CHECK, "")])], "matrix-rows", T_ROWS_M),
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
        "      const values = bindAll(parameter.name, targets);\n", "      const values = [bind(parameter.name, targets)];\n"
    )])], "harness", T_TWO),
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
        for name, files, suite, words in B:
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
    for name, files, suite, words in B:
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
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            for path, text in origs.items():
                (ROOT / path).write_text(text)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
