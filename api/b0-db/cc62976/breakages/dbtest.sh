#!/bin/bash
# Runs the db tests (or the named files) against the local ci-like Postgres; FRESH=1 remakes it first.
set -e
cd /home/user/tadayo-contract
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
if [ -n "$FRESH" ]; then
  bash /tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4/pgci.sh >/dev/null
  python3 tools/ci/ci_steps.py db-bootstrap >/dev/null 2>&1
fi
export DATABASE_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.APP_URL)')"
export DATABASE_ADMIN_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.ADMIN_URL)')"
rm -rf tools/ci/__pycache__
cd tests && npx vitest run --config vitest.db.config.ts "$@" 2>&1 | grep -vE '^\s*$'
