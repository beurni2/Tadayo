#!/bin/bash
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
cd /home/user/tadayo-share
bash /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4/pgci.sh > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/pg2.log 2>&1 && python3 tools/ci/ci_steps.py db-bootstrap > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/boot2.log 2>&1; echo "boot $?"
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/before2.sha
python3 /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/breakages.py M01 I17 I18 I19 I20 I21 I22 I23 I24 M02 M03 P10 S01 S02 S03 S04 W01 R01 R02 > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/run-part2.log 2>&1; echo "breakages exit $? $(date -u +%T)"
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/after2.sha
cat /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/before.sha /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/before2.sha /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk3/after2.sha
for s in format lint typecheck copy-lint openapi tools-tests guards; do python3 tools/ci/ci_steps.py $s > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2r2/fast-$s.log 2>&1; echo "$s exit $?"; done
echo "all done $(date -u +%T)"
