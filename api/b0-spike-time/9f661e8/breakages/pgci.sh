#!/bin/bash
# Remake a local Postgres 16 cluster the way ci.yml's service is made (superuser supabase_admin, password postgres).
set -e
pg_dropcluster --stop 16 main 2>/dev/null || true
echo postgres > /tmp/pgpw
chmod 644 /tmp/pgpw
pg_createcluster 16 main -- --username=supabase_admin --pwfile=/tmp/pgpw --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
pg_ctlcluster 16 main start
rm -f /tmp/pgpw
psql "postgresql://supabase_admin:postgres@localhost:5432/postgres" -tAc "select version()" | cut -c1-40
