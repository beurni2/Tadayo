#!/bin/bash
# The image built from round 2's tree (tadayo-api-dev:hardening7), run as fly.toml runs it.
SP=/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad
EV=$SP/v2r2/evidence
IMG=tadayo-api-dev:hardening7
source $EV/cmds.env
D="docker run --rm --pids-limit 1024 --memory 3g -v $EV:/ev --entrypoint ''"
WORKER_ENV="-e TADAYO_PHOTO_USER=tadayo-image"
API_PROBE="${API_CMD/services\/api\/src\/main.ts//ev/status.mjs}"
WORKER_PROBE="${WORKER_CMD/services\/worker\/src\/main.ts//ev/status.mjs}"
WORKER_PHOTO="${WORKER_CMD/services\/worker\/src\/main.ts//ev/photo.mjs /ev/chair.jpg}"
WORKER_MANY="${WORKER_CMD/services\/worker\/src\/main.ts//ev/sweep-many.mjs}"
WORKER_LIMITS="${WORKER_CMD/services\/worker\/src\/main.ts//ev/probe-limits.mjs}"
{
  echo "== image: $IMG, built from the working tree of api/b2-worker-hardening (round 2's fixes), $(date -u +%FT%TZ)"
  echo "== the image's CMD: $(docker image inspect $IMG --format '{{json .Config.Cmd}}')  USER: '$(docker image inspect $IMG --format '{{.Config.User}}')'"
  echo "== fly.toml api, its node script swapped for status.mjs:"
  eval $D $IMG sh -c "\"$API_PROBE\""
  echo "== fly.toml worker, its node script swapped for status.mjs:"
  eval $D $WORKER_ENV $IMG sh -c "\"$WORKER_PROBE\""
  echo "== under the worker's command, a POSIX message queue (RLIMIT_MSGQUEUE 0):"
  eval $D $WORKER_ENV $IMG sh -c "\"$WORKER_LIMITS\""
  echo "== a crash of a process of tadayo-image that would dump core to a file (the container's core_pattern on the next line), at each core limit:"
  docker run --rm --entrypoint "" $IMG sh -c 'echo "core_pattern: $(cat /proc/sys/kernel/core_pattern)"; for limit in unlimited 1 0; do d=$(mktemp -d); chown tadayo-image $d; cd $d; prlimit --core=$limit -- setpriv --reuid=tadayo-image --regid=tadayo-image --clear-groups -- sh -c "kill -ABRT \$\$" 2>/dev/null; echo "--core=$limit: files left: $(ls $d | tr "\n" " ")"; cd /; done'
  echo "== tadayo-image:"
  docker run --rm --entrypoint "" $IMG sh -c 'grep tadayo-image /etc/passwd /etc/group; ls -l /usr/bin/ipcrm /usr/bin/prlimit /usr/bin/setpriv /usr/bin/find /usr/bin/chmod /usr/bin/rm; ls -ld /dev/mqueue /dev/shm /run/lock /tmp /var/tmp'
} > $EV/probes.txt 2>&1
# A real JPEG prepared under the worker's command as tadayo-image.
eval $D $WORKER_ENV $IMG sh -c "\"$WORKER_PHOTO\"" > $EV/photo-run.json 2> $EV/photo-run.stderr
# The start's sweep: what tadayo-image left before the worker starts, as fly.toml starts it.
docker run --rm --pids-limit 1024 --memory 3g -v $EV:/ev --entrypoint "" $WORKER_ENV -e "WORKER_CMD=$WORKER_CMD" -e DATABASE_URL=postgres://tadayo_app:password@127.0.0.1:1/tadayo -e SUPABASE_URL=https://tadayotestprojectref.supabase.co -e SUPABASE_SERVICE_KEY=sb_secret_testkeynotreal0000 -e TADAYO_ENVIRONMENT=dev $IMG sh /ev/start-sweep.sh > $EV/start-sweep.txt 2>&1
# B3's System V objects, then the sweep under the worker's command.
docker run --rm --pids-limit 1024 --memory 3g -v $EV:/ev --entrypoint "" $WORKER_ENV -e "WORKER_MANY=$WORKER_MANY" $IMG sh /ev/many.sh > $EV/sweep-many.txt 2>&1
# The root harness in the image, and its two modes.
docker run --rm --pids-limit 1024 --memory 3g --entrypoint "" $IMG node --disable-sigusr1 services/worker/src/privileges-harness.ts > $EV/harness-in-image.jsonl 2> $EV/harness-in-image.stderr
for mode in sweep-timeout sweep-left; do
  docker run --rm --pids-limit 1024 --memory 3g --entrypoint "" $IMG node --disable-sigusr1 services/worker/src/privileges-harness.ts $mode > $EV/harness-$mode.jsonl 2> $EV/harness-$mode.stderr; echo "exit $?" >> $EV/harness-$mode.stderr
done
echo done
