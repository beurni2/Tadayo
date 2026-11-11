#!/bin/bash
# Runs the privacy tests (or the named files) of the worktree in $WT (default /home/user/tadayo-auth) against the local ci-like Postgres; FRESH=1 remakes it first.
set -eo pipefail
cd "${WT:-/home/user/tadayo-auth}"
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
if [ -n "$FRESH" ]; then
  bash /tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4/pgci.sh >/dev/null
  python3 -B tools/ci/ci_steps.py db-bootstrap >/dev/null 2>&1
fi
export DATABASE_URL="$(python3 -B -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.APP_URL)')"
export DATABASE_ADMIN_URL="$(python3 -B -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.ADMIN_URL)')"
rm -rf tools/ci/__pycache__
cd tests && npx vitest run --config vitest.privacy.config.ts "$@" 2>&1 | grep -vE '^\s*$'
