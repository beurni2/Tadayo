#!/bin/bash
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
cd /home/user/tadayo-share/services/worker && npx vitest run > $SP/v2brk3/worker-suite.log 2>&1; echo "worker suite exit $?"
cd /home/user/tadayo-share/tools/ops && npx vitest run src/deploy-files.test.ts > $SP/v2brk3/deploy-suite.log 2>&1; echo "deploy suite exit $?"
cd /home/user/tadayo-share && python3 $SP/v2brk3/breakages.py > $SP/v2brk3/run.log 2>&1; echo "breakages exit $?"
python3 $SP/v2brk3/treehash.py > $SP/v2brk3/tree-after.txt
diff -q $SP/v2brk3/tree-before.txt $SP/v2brk3/tree-after.txt && echo "tree same"
