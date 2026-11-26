#!/bin/bash
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
WT=/home/user/tadayo-a14b
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
export DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres"
export DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres"
OUT=$SP/pr137/r4run
cd $WT
git diff --stat > $OUT/diffstat-after-brk.txt
for s in unit tools-tests; do python3 tools/ci/ci_steps.py $s > $OUT/$s.txt 2>&1; echo "$s rc=$? $(date -u +%T)" >> $OUT/status; done
bash $SP/s4/pgci.sh > $OUT/pg1.txt 2>&1 && python3 tools/ci/ci_steps.py db-bootstrap > $OUT/boot1.txt 2>&1; echo "boot1 rc=$?" >> $OUT/status
s0=$(date +%s); python3 tools/ci/ci_steps.py db-tests > $OUT/db-tests.txt 2>&1; echo "db-tests rc=$? secs=$(( $(date +%s)-s0 )) $(date -u +%T)" >> $OUT/status
bash $SP/s4/pgci.sh > $OUT/pg2.txt 2>&1 && python3 tools/ci/ci_steps.py db-bootstrap > $OUT/boot2.txt 2>&1; echo "boot2 rc=$?" >> $OUT/status
s0=$(date +%s); python3 -c "import resource,subprocess,sys; r=subprocess.call(['python3','tools/ci/ci_steps.py','privacy'],stdout=open('$OUT/privacy.txt','w'),stderr=subprocess.STDOUT); print('maxrss_kb',resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss); sys.exit(r)" > $OUT/privacy-rss.txt; echo "privacy rc=$? secs=$(( $(date +%s)-s0 )) $(date -u +%T)" >> $OUT/status
echo done >> $OUT/status
