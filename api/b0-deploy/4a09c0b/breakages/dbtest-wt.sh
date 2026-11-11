#!/bin/bash
# Runs the named db test files of the worktree WT against the local ci-like Postgres (nothing else may use it meanwhile).
set -o pipefail
WT=${WT:?set WT to the worktree}
cd "$WT" || exit 1
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
DATABASE_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.APP_URL)')"
DATABASE_ADMIN_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.ADMIN_URL)')"
export DATABASE_URL DATABASE_ADMIN_URL
rm -rf tools/ci/__pycache__
cd tests && npx vitest run --config vitest.db.config.ts "$@" 2>&1 | grep -vE '^\s*$'
