#!/bin/sh
# As root in the image: 32,000 message queues and 32,000 semaphore sets of tadayo-image, then the worker's sweep.
setpriv --reuid=tadayo-image --regid=tadayo-image --clear-groups -- perl -e 'for (1 .. 32000) { msgget(0, 0600 | 01000) // die "msgget: $!"; semget(0, 1, 0600 | 01000) // die "semget: $!" }'
echo "perl exit $?"
$WORKER_MANY
