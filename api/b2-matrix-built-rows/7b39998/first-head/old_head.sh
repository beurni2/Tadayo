#!/bin/bash
# B8 and B9 at the PR's first head (9bc33bc), where the review said each would pass: run in the detached scratch
# worktree, each file restored after.
set -u
ROOT=/home/user/tadayo-a4-brk
OUT=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/a4/r1/old
mkdir -p $OUT
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH DATABASE_URL=postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres DATABASE_ADMIN_URL=postgresql://supabase_admin:postgres@localhost:5432/postgres
cd $ROOT
test "$(git rev-parse --short=7 HEAD)" = 9bc33bc || { echo not at 9bc33bc; exit 1; }
python3 - <<'PY'
p='packages/domain/src/authorization/read-sql.ts'
s=open(p).read(); a="       AND d.state = 'active'\n       AND o.status = 'scheduled'\n"
assert s.count(a)==1
open(p,'w').write(s.replace(a,"       AND (d.state = 'active' OR d.media_class = 'external_video')\n       AND o.status = 'scheduled'\n"))
PY
git diff > $OUT/B8-at-9bc33bc.patch
(cd tests && npx vitest run --fsModuleCache=false --config vitest.privacy.config.ts src/privacy/matrix.test.ts -t "answers the author as its account") > $OUT/B8-at-9bc33bc.txt 2>&1
echo "B8 exit $?" | tee -a $OUT/summary.txt
git checkout -- packages/domain/src/authorization/read-sql.ts
python3 - <<'PY'
p='services/api/src/app.ts'
s=open(p).read(); a="  getMe: () => getMe,\n"
leak=("  listComments: (deps) => async (request, reply) => {\n"
"    const { drop_id } = request.params as { drop_id: string };\n"
"    if (!/^[A-Za-z0-9_-]{1,64}$/.test(drop_id)) return notFound(request, reply);\n"
"    const rows = await deps.sql<{ body: string }[]>`SELECT body FROM app.comments WHERE drop_id = ${drop_id}`;\n"
"    return rows.length === 0 ? notFound(request, reply) : reply.code(200).send({ comments: rows });\n"
"  },\n")
assert s.count(a)==1
open(p,'w').write(s.replace(a, leak + a))
p='tests/src/privacy/rows.ts'
s=open(p).read()
a=("    ...[...built]\n"
"      .filter((id) => rows[id] === NONE)\n"
"      .map((id) => `${id} is built but its row is NONE: a built route's row is judged, never the skeleton's`),\n"
"    ...Object.entries(rows)\n"
"      .filter(([id, row]) => row !== NONE && !built.has(id))\n"
"      .map(([id]) => `${id} isn't built but its row isn't NONE: only a built route has a row of its own`),\n")
assert s.count(a)==1
open(p,'w').write(s.replace(a,""))
PY
git diff > $OUT/B9-at-9bc33bc.patch
(cd tests && npx vitest run --fsModuleCache=false --config vitest.privacy.config.ts src/privacy/matrix.test.ts -t "a route with no row fails|answers the author as its account") > $OUT/B9-at-9bc33bc.txt 2>&1
echo "B9 exit $?" | tee -a $OUT/summary.txt
git checkout -- services/api/src/app.ts tests/src/privacy/rows.ts
git status --short
