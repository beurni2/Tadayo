#!/bin/bash
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
cd /home/user/tadayo-share
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > $SP/v2brk2/before.sha
python3 $SP/v2brk2/breakages.py > $SP/v2brk2/run.log 2>&1
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > $SP/v2brk2/after.sha
echo done >> $SP/v2brk2/run.log
