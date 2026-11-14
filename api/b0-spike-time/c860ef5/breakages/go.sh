set -u
cd /home/user/tadayo-s5-brk
bash /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4/pgci.sh > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s5brk/pgci.log 2>&1 || { echo pgci failed; exit 1; }
. /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s5/dbenv.sh
python3 tools/ci/ci_steps.py db-bootstrap > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s5brk/boot.log 2>&1 || { echo boot failed; exit 1; }
echo "baseline:"
for s in "packages/domain src/authorization/days.test.ts" "services/api src/clubs/list.test.ts" "tools/ops src/spike-time.test.ts src/run-remote.test.ts" "tests --config vitest.db.config.ts src/db/home-days.test.ts src/db/club-list.test.ts src/db/ops-spike-time.test.ts src/db/ops-dev-clock.test.ts" "tests --config vitest.privacy.config.ts src/privacy/account.test.ts"; do
  set -- $s; pkg=$1; shift
  (cd $pkg && npx vitest run "$@" > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s5brk/base-$(echo $pkg | tr / -).log 2>&1); echo "  $pkg exit $?"
done
python3 /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s5brk/run.py
