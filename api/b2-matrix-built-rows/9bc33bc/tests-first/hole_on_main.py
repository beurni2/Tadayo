"""The outside audit's A4 on main (f2ed830): two leaking handlers built with their rows left NONE, added to the
two hand-written BUILT lists, and the unbuilt pin moved from 39 to 37, as the audit's reviewer did. Every suite
that could see them is run; on main they all pass. Run in the scratch worktree of main, never a branch's own."""
import pathlib, subprocess, os, sys
ROOT = pathlib.Path("/home/user/tadayo-a4-main")
OUT = pathlib.Path(sys.argv[1])
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")
LEAKS = (
    "    deleteComment: async (request, reply) => {\n"
    "      const { comment_id } = request.params as { comment_id: string };\n"
"      if (!/^[A-Za-z0-9_-]{1,64}$/.test(comment_id)) return notFound(request, reply);\n"
    "      const [row] = await deps.sql<{ body: string }[]>`SELECT body FROM app.comments WHERE id = ${comment_id}`;\n"
    "      return row === undefined ? notFound(request, reply) : reply.code(200).send({ text: row.body });\n"
    "    },\n"
    "    getEmbed: async (request, reply) => {\n"
    "      const { drop_id } = request.params as { drop_id: string };\n"
"      if (!/^[A-Za-z0-9_-]{1,64}$/.test(drop_id)) return notFound(request, reply);\n"
    "      const [row] = await deps.sql<{ provider: string; canonical_url: string }[]>`\n"
    "        SELECT s.provider, s.canonical_url FROM app.drops d JOIN app.sources s ON s.id = d.source_id\n"
    "         WHERE d.id = ${drop_id} AND d.media_class = 'external_video'`;\n"
    "      return row === undefined ? notFound(request, reply) : reply.code(200).send(row);\n"
    "    },\n"
)
CHANGES = {
    "services/api/src/app.ts": [("    getMe,\n    updateMe: updateMeHandler(deps),\n", "    getMe,\n" + LEAKS + "    updateMe: updateMeHandler(deps),\n")],
    "services/api/src/app.test.ts": [('  "removeDevice",\n]);', '  "removeDevice",\n  "deleteComment",\n  "getEmbed",\n]);'),
                                     ("expect(unbuilt).toHaveLength(39);", "expect(unbuilt).toHaveLength(37);")],
    "services/api/src/session.test.ts": [('  "removeDevice",\n]);', '  "removeDevice",\n  "deleteComment",\n  "getEmbed",\n]);')],
}
V = ["npx", "vitest", "run", "--fsModuleCache=false"]
RUNS = [
    ("app", "services/api", [*V, "src/app.test.ts", "src/session.test.ts"]),
    ("harness", "tests", [*V, "src/privacy/harness.test.ts"]),
    ("matrix", "tests", [*V, "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts"]),
]
origs = {p: (ROOT / p).read_text() for p in CHANGES}
OUT.mkdir(parents=True, exist_ok=True)
try:
    for p, cs in CHANGES.items():
        t = origs[p]
        for old, new in cs:
            assert t.count(old) == 1, (p, old[:60])
            t = t.replace(old, new)
        (ROOT / p).write_text(t)
    d = subprocess.run(["git", "diff"], cwd=ROOT, capture_output=True, text=True).stdout
    (OUT / "hole-on-main.patch").write_text(d)
    for name, cwd, cmd in RUNS:
        r = subprocess.run(cmd, cwd=ROOT / cwd, env=ENV, capture_output=True, text=True)
        out = r.stdout + r.stderr
        (OUT / f"hole-on-main-{name}.txt").write_text(out)
        print(name, "exit", r.returncode, [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")], flush=True)
finally:
    for p, t in origs.items():
        (ROOT / p).write_text(t)
    print("restored:", repr(subprocess.run(["git", "status", "--short"], cwd=ROOT, capture_output=True, text=True).stdout))
