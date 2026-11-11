#!/bin/bash
# Slice 10a: what the built image does, run against the local ci-like Postgres (the app role's URL, never printed).
# Writes $OUT/image.txt. The image is built by `docker build --build-arg NODE_IMAGE=tadayo-node-ca:local`: the
# repository's Dockerfile, with the base swapped for the pinned base plus this session's proxy CA (see the header).
set -u
SCR=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/c10a
OUT=${OUT:-$SCR/evidence}
IMG=${IMG:-tadayo-api-dev:evidence}
mkdir -p "$OUT"
cd /home/user/tadayo-deploy || exit 1
export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH
DATABASE_URL="$(python3 -c 'import sys; sys.path.insert(0,"tools/ci"); import ci_steps; print(ci_steps.APP_URL)')"
export DATABASE_URL
rm -rf tools/ci/__pycache__
PW="$(python3 -c 'import os, urllib.parse as u; print(u.unquote(u.urlparse(os.environ["DATABASE_URL"]).password or ""))')"
SUPA=https://rhsycmycocbzakrydahi.supabase.co
REF=rhsycmycocbzakrydahi
PORT_API=18080
F="$OUT/image.txt"
: > "$F"
say() { printf '%s\n' "$*" >> "$F"; }
section() { say ""; say "== $*"; }

docker rm -f tadayo-api-evidence tadayo-worker-evidence >/dev/null 2>&1
cleanup() { psql "$DATABASE_URL" -q -c 'DROP TABLE IF EXISTS app.dev_clock; DROP FUNCTION IF EXISTS app.dev_clock_forward();' >/dev/null 2>&1; }
cleanup
trap cleanup EXIT

section "the database"
say "made like ci's service and bootstrapped (pgci.sh, then tools/ci/ci_steps.py db-bootstrap); db/migrations applied with tools/ops's local entry (pnpm --filter @tadayo/ops migrate, as tadayo_app):"
pnpm --silent --filter @tadayo/ops migrate > /dev/null 2>&1
say "migrate exit code: $?"

section "image"
say "built from the repository's Dockerfile with --build-arg NODE_IMAGE=tadayo-node-ca:local (the pinned base plus the session proxy's CA, local only)"
docker image inspect "$IMG" --format 'size_bytes={{.Size}}
user={{.Config.User}}
workdir={{.Config.WorkingDir}}
cmd={{json .Config.Cmd}}
entrypoint={{json .Config.Entrypoint}}
exposed_ports={{json .Config.ExposedPorts}}' >> "$F"
say "env names in the image:"
docker image inspect "$IMG" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -E 's/=.*//' | sort >> "$F"

section "files in the image (no node_modules)"
docker run --rm --entrypoint sh "$IMG" -c 'cd /app && find . -path ./node_modules -prune -o -type f -print | sort' >> "$F"
say "count of *.test.ts outside node_modules: $(docker run --rm --entrypoint sh "$IMG" -c "find /app -name '*.test.ts' -not -path '*/node_modules/*' | wc -l")"
say "count of .env* files: $(docker run --rm --entrypoint sh "$IMG" -c "find /app -name '.env*' | wc -l")"
say "dev dependencies present (vitest, eslint, typescript, prism, prettier, wrangler): $(docker run --rm --entrypoint sh "$IMG" -c "ls /app/node_modules/.pnpm | grep -E '^(vitest|eslint|typescript|@stoplight|prettier|wrangler)' | wc -l")"
say "packages in the virtual store: $(docker run --rm --entrypoint sh "$IMG" -c "ls /app/node_modules/.pnpm | grep -vE '^(lock.yaml|node_modules)$' | wc -l")"

section "api and worker in dev's configuration while the database has no app.dev_clock: both refuse, the message alone"
docker run --rm --network host -e DATABASE_URL -e SUPABASE_URL="$SUPA" -e TADAYO_ENVIRONMENT=dev "$IMG" >> "$F" 2>&1; say "api exit code: $?"
docker run --rm --network host -e DATABASE_URL -e SUPABASE_URL="$SUPA" -e TADAYO_ENVIRONMENT=dev "$IMG" node services/worker/src/main.ts >> "$F" 2>&1; say "worker exit code: $?"
say "the clock's table is made with tools/ops/sql/dev_clock.sql, as tadayo_app, for the rest of the run (the dev-clock script does the same on dev):"
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f tools/ops/sql/dev_clock.sql >> "$F" 2>&1; say "psql exit code: $?"

section "api: started as fly.toml's process group does (the image's CMD), dev configuration, local database"
docker run -d --name tadayo-api-evidence --network host \
  -e DATABASE_URL -e SUPABASE_URL="$SUPA" -e TADAYO_ENVIRONMENT=dev -e LOG_LEVEL=info -e PORT=$PORT_API \
  "$IMG" >/dev/null
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT_API/v1/me" 2>/dev/null; then break; fi
  sleep 0.5
done
say "GET /v1/me without a token:"
curl -s -i "http://127.0.0.1:$PORT_API/v1/me" | tr -d '\r' | sed -n '1,12p' >> "$F"
say ""
say "GET /v1/me with a malformed token:"
curl -s -o /dev/null -w 'http_status=%{http_code}\n' -H 'authorization: Bearer not-a-token' "http://127.0.0.1:$PORT_API/v1/me" >> "$F"
say "a TCP connect to the API's port (what fly.toml's tcp_checks does):"
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT_API") 2>/dev/null; then say "port $PORT_API accepts a connection"; else say "port $PORT_API refused a connection"; fi
START=$(date +%s.%N)
docker stop -t 30 tadayo-api-evidence >/dev/null
END=$(date +%s.%N)
say "docker stop took $(python3 -c "print(round($END - $START, 2))") seconds (kill_timeout in fly.toml is 30)"
say "exit code: $(docker inspect -f '{{.State.ExitCode}}' tadayo-api-evidence)"
say "log:"
docker logs tadayo-api-evidence 2>&1 | sed -E 's/"time":[0-9]+/"time":T/' >> "$F"
say "occurrences of the database password in the log: $(docker logs tadayo-api-evidence 2>&1 | grep -cF -- "$PW")"
docker rm -f tadayo-api-evidence >/dev/null

section "worker: started with fly.toml's command for its group"
docker run -d --name tadayo-worker-evidence --network host \
  -e DATABASE_URL -e SUPABASE_URL="$SUPA" -e TADAYO_ENVIRONMENT=dev -e LOG_LEVEL=info \
  "$IMG" node services/worker/src/main.ts >/dev/null
sleep 3
say "state while running: $(docker inspect -f '{{.State.Status}}' tadayo-worker-evidence)"
START=$(date +%s.%N)
docker stop -t 30 tadayo-worker-evidence >/dev/null
END=$(date +%s.%N)
say "docker stop took $(python3 -c "print(round($END - $START, 2))") seconds"
say "exit code: $(docker inspect -f '{{.State.ExitCode}}' tadayo-worker-evidence)"
say "log:"
docker logs tadayo-worker-evidence >> "$F" 2>&1
say "occurrences of the database password in the log: $(docker logs tadayo-worker-evidence 2>&1 | grep -cF -- "$PW")"
docker rm -f tadayo-worker-evidence >/dev/null

section "api and worker refuse a start with no database (the message alone)"
docker run --rm "$IMG" 2>&1 | head -3 | sed 's/^/api: /' >> "$F"; say "exit code: ${PIPESTATUS[0]}"
docker run --rm "$IMG" node services/worker/src/main.ts 2>&1 | head -3 | sed 's/^/worker: /' >> "$F"; say "exit code: ${PIPESTATUS[0]}"

section "the ops entry in the image (what the ops workflow's --here runs on the Machine)"
say "no script:"
docker run --rm "$IMG" node /app/tools/ops/src/main.ts 2>&1 | head -12 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "an unknown script:"
docker run --rm "$IMG" node /app/tools/ops/src/main.ts nonesuch 2>&1 | head -12 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "storage-setup --here with nothing set:"
docker run --rm "$IMG" node /app/tools/ops/src/main.ts storage-setup --here --ref "$REF" 2>&1 | head -6 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "storage-setup --here, SUPABASE_URL of another project (refused before any request):"
docker run --rm -e SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co -e SUPABASE_SERVICE_KEY=fixture-only-not-a-key \
  "$IMG" node /app/tools/ops/src/main.ts storage-setup --here --ref "$REF" 2>&1 | head -6 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "supabase-probe --here against the local database (refused before any request):"
docker run --rm --network host -e DATABASE_URL -e SUPABASE_URL="$SUPA" -e SUPABASE_PUBLISHABLE_KEY=fixture-only-not-a-key -e SUPABASE_SERVICE_KEY=fixture-only-not-a-key \
  "$IMG" node /app/tools/ops/src/main.ts supabase-probe --here --ref "$REF" 2>&1 | head -6 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "supabase-probe --here, SUPABASE_URL of another project:"
docker run --rm --network host -e DATABASE_URL -e SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co -e SUPABASE_PUBLISHABLE_KEY=fixture-only-not-a-key -e SUPABASE_SERVICE_KEY=fixture-only-not-a-key \
  "$IMG" node /app/tools/ops/src/main.ts supabase-probe --here --ref "$REF" 2>&1 | head -6 >> "$F"; say "exit code: ${PIPESTATUS[0]}"
say "occurrences of the database password anywhere above: $(grep -cF -- "$PW" "$F")"
cat "$F"
