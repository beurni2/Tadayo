#!/bin/bash
# Round 2's tree: the changed breakage entries, the two-purges test under the old ending, then db-tests and privacy.
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
export DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres" DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
cd /home/user/tadayo-push && git diff 0a1994e > $SP/s4d/r2.diff
cd /home/user/tadayo-commit && git checkout -q -- . && git apply $SP/s4d/r2.diff && echo "applied $(git status --short | wc -l)"
cmp -s /home/user/tadayo-commit/tests/src/db/devices.test.ts /home/user/tadayo-push/tests/src/db/devices.test.ts && echo "trees match"
bash $SP/s4/pgci.sh >/dev/null 2>&1
python3 tools/ci/ci_steps.py db-bootstrap > $SP/dbrk/boot3.log 2>&1; echo "boot $?"
BREAK_OUT=$SP/dbrk/out3 python3 $SP/dbrk/breakages2.py D03 D04 D21 M07 M08 > $SP/dbrk/run3.log 2>&1; echo "subset $?"
# The two-purges test with the ending as round 1 found it (D21's patch), ten times.
bash $SP/s4/pgci.sh >/dev/null 2>&1
python3 tools/ci/ci_steps.py db-bootstrap > $SP/dbrk/boot4.log 2>&1; echo "boot $?"
cp packages/domain/src/identity/devices.ts $SP/dbrk/devices.ts.keep
patch -s -p1 < $SP/dbrk/out3/D21.patch && echo "D21 applied"
: > $SP/dbrk/purges10.log
for i in 1 2 3 4 5 6 7 8 9 10; do
  (cd tests && npx vitest run --config vitest.db.config.ts src/db/devices.test.ts -t "lets two removals of long-ended sign-ins purge at once" 2>&1 | grep -E "Tests |×|deadlock" | head -4) >> $SP/dbrk/purges10.log
  echo "-- run $i" >> $SP/dbrk/purges10.log
done
cp $SP/dbrk/devices.ts.keep packages/domain/src/identity/devices.ts
git -C /home/user/tadayo-commit diff --quiet 0a1994e -- packages/domain/src/identity/devices.ts; cmp -s packages/domain/src/identity/devices.ts /home/user/tadayo-push/packages/domain/src/identity/devices.ts && echo "devices.ts restored"
# The final tree's suites.
cd /home/user/tadayo-push
bash $SP/s4/pgci.sh >/dev/null 2>&1
python3 tools/ci/ci_steps.py db-bootstrap > $SP/s4d/r2-boot.log 2>&1; echo "boot $?"
python3 tools/ci/ci_steps.py db-tests > $SP/s4d/r2-db.log 2>&1; echo "db-tests $?"
python3 tools/ci/ci_steps.py privacy > $SP/s4d/r2-privacy.log 2>&1; echo "privacy $?"
