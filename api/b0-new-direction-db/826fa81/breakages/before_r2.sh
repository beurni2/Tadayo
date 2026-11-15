#!/bin/bash
# Runs the third commit's five test files against the second commit's migrations (75a58c1's 0010 and
# 0011), in the scratch worktree, then puts the third commit's migrations and tests there for the
# breakages.
set -u
SP=$SCRATCH
M=<scratch worktree>
N=<branch worktree>
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
export DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres"
export DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
FILES="src/db/photo-messages.test.ts src/db/drops.test.ts src/db/kept.test.ts src/db/migrations.test.ts src/db/safety.test.ts"
cd $M
for f in 0010_allowance_by_role 0011_photo_messages; do git -C $N show 75a58c1:db/migrations/$f.sql > db/migrations/$f.sql; done
for f in photo-messages drops kept migrations safety; do cp $N/tests/src/db/$f.test.ts tests/src/db/$f.test.ts; done
bash $SP/s4/pgci.sh >/dev/null 2>&1 || { echo "cluster failed"; exit 1; }
python3 tools/ci/ci_steps.py db-bootstrap >/dev/null 2>&1 || { echo "bootstrap failed"; exit 1; }
(cd tests && npx vitest run --config vitest.db.config.ts $FILES) > $SP/ndb/r2-before-75a58c1.log 2>&1
echo "exit $? -> $SP/ndb/r2-before-75a58c1.log"
for f in 0010_allowance_by_role 0011_photo_messages; do cp $N/db/migrations/$f.sql db/migrations/$f.sql; done
git status --short
