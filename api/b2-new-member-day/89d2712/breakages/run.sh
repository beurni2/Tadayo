#!/bin/bash
# Baseline (each suite unbroken on a freshly made database), then every breakage.
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
export DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres"
export DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
cd /home/user/tadayo-b2m-mut
echo "head: $(git rev-parse HEAD)"
bash $SP/s4/pgci.sh > /dev/null 2>&1; echo "pgci $?"
python3 tools/ci/ci_steps.py db-bootstrap > /dev/null 2>&1; echo "db-bootstrap $?"
(cd packages/domain && npx vitest run src/schedule 2>&1 | grep -E "^ +Tests ") | sed 's/^/baseline unit: /'
for f in membership-change schedule-proposals days uniqueness schedule-commands; do
  (cd tests && npx vitest run --config vitest.db.config.ts src/db/$f.test.ts 2>&1 | grep -E "^ +Tests ") | sed "s/^/baseline $f: /"
done
(cd tests && npx vitest run --config vitest.privacy.config.ts src/privacy/schedule.test.ts 2>&1 | grep -E "^ +Tests ") | sed 's/^/baseline judge: /'
(cd tests && npx vitest run --config vitest.privacy.config.ts src/privacy/matrix.test.ts -t "a new member's pick through the app" 2>&1 | grep -E "^ +Tests ") | sed 's/^/baseline matrix: /'
bash $SP/s4/pgci.sh > /dev/null 2>&1; python3 tools/ci/ci_steps.py db-bootstrap > /dev/null 2>&1; echo "database made again before the breakages: $?"
python3 $SP/b2m/brk87/breakages.py
echo "exit $?"
