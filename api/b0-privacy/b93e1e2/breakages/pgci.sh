#!/bin/bash
# Remake a cluster made like ci's postgres service (ADR-026; docs/LIMITATIONS.md), on port 5432.
set -e
P=/var/lib/postgresql/pgci
if [ -f $P/data/postmaster.pid ]; then
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $P/data -m fast -w stop" || true
fi
rm -rf $P
mkdir -p $P && printf 'postgres\n' > $P/pw && chown -R postgres $P
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $P/data --username=supabase_admin --pwfile=$P/pw --auth=scram-sha-256" >/dev/null
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $P/data -o '-p 5432 -k /tmp' -l $P/server.log -w start" >/dev/null
echo "pgci up"
