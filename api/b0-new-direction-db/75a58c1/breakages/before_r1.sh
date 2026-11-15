#!/bin/bash
# Runs the final test files against (a) the first commit's migrations and (b) main's, in the scratch worktree.
set -u
SP=$SCRATCH
M=<scratch worktree>
N=<branch worktree>
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
export DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres"
export DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
FILES="src/db/photo-messages.test.ts src/db/drops.test.ts src/db/kept.test.ts src/db/migrations.test.ts src/db/safety.test.ts"
cd $M
for f in photo-messages drops kept migrations safety; do cp $N/tests/src/db/$f.test.ts tests/src/db/$f.test.ts; done
run() {
  bash $SP/s4/pgci.sh >/dev/null 2>&1 || { echo "cluster failed"; return; }
  python3 tools/ci/ci_steps.py db-bootstrap >/dev/null 2>&1 || { echo "bootstrap failed"; return; }
  (cd tests && npx vitest run --config vitest.db.config.ts $FILES) > "$1" 2>&1
  echo "exit $? -> $1"
}
echo "first commit's schema (9bfa059's 0010 and 0011):"
run $SP/ndb/r1-before-9bfa059.log
mkdir -p $SP/ndb/held && mv db/migrations/0010_allowance_by_role.sql db/migrations/0011_photo_messages.sql $SP/ndb/held/
echo "main's schema (0cf30f3, no 0010 or 0011):"
run $SP/ndb/r1-before-main.log
mv $SP/ndb/held/0010_allowance_by_role.sql $SP/ndb/held/0011_photo_messages.sql db/migrations/
for f in photo-messages drops kept migrations safety; do git -C $N show 9bfa059:tests/src/db/$f.test.ts > tests/src/db/$f.test.ts; done
git status --short
