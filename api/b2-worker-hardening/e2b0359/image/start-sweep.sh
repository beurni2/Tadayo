#!/bin/sh
# As root in the image: what tadayo-image leaves before the worker starts (a process, a file, a file whose name isn't
# UTF-8), then the worker as fly.toml starts it, with a database that refuses.
live() { n=0; for f in /proc/[0-9]*/status; do if grep -q "^Uid:[[:space:]]*10001[[:space:]]" "$f" 2>/dev/null && ! grep -q "^State:[[:space:]]*Z" "$f" 2>/dev/null; then n=$((n+1)); fi; done; echo $n; }
setpriv --reuid=tadayo-image --regid=tadayo-image --clear-groups -- sh -c 'sleep 600 & touch /tmp/left-from-before; printf x > "/var/tmp/odd-$(printf "\376")"'
echo "before the worker: live processes of uid 10001: $(live), files of tadayo-image in /tmp and /var/tmp: $(find /tmp /var/tmp -user 10001 | wc -l)"
echo "the worker, as fly.toml starts it, with a database that refuses:"
$WORKER_CMD
echo "worker exit $?"
echo "after the worker: live processes of uid 10001: $(live), files of tadayo-image in /tmp and /var/tmp: $(find /tmp /var/tmp -user 10001 | wc -l)"
