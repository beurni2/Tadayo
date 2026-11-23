#!/bin/bash
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
cd /home/user/tadayo-share
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > $SP/s2brk6/before-x2.sha
python3 $SP/s2brk6/breakages.py $(seq -f "X%02g" 1 29) > $SP/s2brk6/run-x2.log 2>&1
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > $SP/s2brk6/after-x2.sha
echo done >> $SP/s2brk6/run-x2.log
