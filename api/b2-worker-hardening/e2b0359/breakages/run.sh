#!/bin/bash
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
T=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/v2brk5/tree
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
python3 $SP/v2brk5/treehash.py $T > $SP/v2brk5/tree-before.txt
docker run --rm --pids-limit 1024 --memory 3g -e NO_COLOR=1 -v $T:$T -w $T/services/worker --entrypoint "" tadayo-api-dev:hardening7 node $T/node_modules/vitest/vitest.mjs run > $SP/v2brk5/worker-suite.log 2>&1; echo "worker suite (in the image) exit $?"
cd $T/tools/ops && npx vitest run src/deploy-files.test.ts > $SP/v2brk5/deploy-suite.log 2>&1; echo "deploy suite exit $?"
cd $T && BREAK_ROOT=$T python3 $SP/v2brk5/breakages.py > $SP/v2brk5/run.log 2>&1; echo "breakages exit $?"
python3 $SP/v2brk5/treehash.py $T > $SP/v2brk5/tree-after.txt
diff -q $SP/v2brk5/tree-before.txt $SP/v2brk5/tree-after.txt && echo "tree same"
