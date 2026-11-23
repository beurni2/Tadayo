#!/bin/bash
cd /home/user/tadayo-share
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk2/before.sha
python3 /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk2/breakages.py > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk2/run.log 2>&1
(git diff -- . ":!docs"; git ls-files -o --exclude-standard -- . ":!docs" | sort | xargs cat) | sha256sum > /tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s2brk2/after.sha
