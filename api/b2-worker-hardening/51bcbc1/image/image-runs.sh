#!/bin/bash
# The audit's A6 runs, in the image built from the commit's tree (I, by default tadayo-api-dev:a6r3). Each start's exit code and
# output, one file each. No database or Supabase is reachable or given: a start that passes the refusal stops at its
# first setting.
I=${I:-tadayo-api-dev:a6r3}
OUT=$1; D=$2
WORKER_FLY='prlimit --core=1 --msgqueue=0 --nproc=256 -- setpriv --euid=node --egid=node --groups=node --inh-caps=-all --bounding-set=-all,+setuid,+setgid,+kill --no-new-privs --'
API_FLY='setpriv --reuid=node --regid=node --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs --'
run() { name=$1; shift; { echo "\$ docker run $*"; docker run --rm "$@" 2>&1; echo "exit $?"; } > "$OUT/$name.txt"; }
run 01-worker-root-image-env --entrypoint "" $I node services/worker/src/main.ts
run 02-worker-root-variable-empty --entrypoint "" -e TADAYO_PHOTO_USER= $I node services/worker/src/main.ts
run 03-worker-root-node-env-empty --entrypoint "" -e NODE_ENV= $I node services/worker/src/main.ts
run 04-worker-root-both-empty --entrypoint "" -e NODE_ENV= -e TADAYO_PHOTO_USER= $I node services/worker/src/main.ts
run 05-worker-as-node --entrypoint "" --user node $I node services/worker/src/main.ts
run 06-api-root --entrypoint "" $I node services/api/src/main.ts
run 07-api-as-node --entrypoint "" --user node $I node services/api/src/main.ts
run 08-image-cmd $I
run 09-api-fly-command --entrypoint "" $I $API_FLY node --disable-sigusr1 services/api/src/main.ts
run 10-worker-fly-command --entrypoint "" $I $WORKER_FLY node --disable-sigusr1 services/worker/src/main.ts
run 11-worker-fly-command-real-photo --entrypoint "" -v "$D:/evidence:ro" $I $WORKER_FLY node /evidence/real.mjs
# Round 3 of the review: a start that sets NODE_ENV to something else, the worker's ids without the rest of fly's
# start, and what the image itself holds.
run 12-api-root-node-env-development --entrypoint "" -e NODE_ENV=development $I node services/api/src/main.ts
run 13-worker-root-node-env-development --entrypoint "" -e NODE_ENV=development -e TADAYO_PHOTO_USER= $I node services/worker/src/main.ts
run 14-worker-setpriv-euid-alone --entrypoint "" $I setpriv --euid=node -- node --disable-sigusr1 services/worker/src/main.ts
run 15-worker-fly-command-without-no-new-privs --entrypoint "" $I prlimit --core=1 --msgqueue=0 --nproc=256 -- setpriv --euid=node --egid=node --groups=node --inh-caps=-all --bounding-set=-all,+setuid,+setgid,+kill -- node --disable-sigusr1 services/worker/src/main.ts
run 16-image-marker-and-settings --entrypoint "" $I sh -c 'ls -l /etc/tadayo-built-image; printenv NODE_ENV TADAYO_PHOTO_USER; id tadayo-image'
