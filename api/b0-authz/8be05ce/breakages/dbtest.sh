#!/bin/bash
# Runs the db tests (or the named files) against the local ci-like Postgres; FRESH=1 remakes it first.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "${REPO:-/home/user/tadayo-authz}"
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
if [ -n "$FRESH" ]; then
  bash "$HERE/pgci.sh" >/dev/null
  python3 tools/ci/ci_steps.py db-bootstrap >/dev/null 2>&1
fi
export DATABASE_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.APP_URL)')"
export DATABASE_ADMIN_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.ADMIN_URL)')"
rm -rf tools/ci/__pycache__
cd tests && npx vitest run --config vitest.db.config.ts "$@" 2>&1 | grep -vE '^\s*$'
