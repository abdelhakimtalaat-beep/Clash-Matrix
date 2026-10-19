#!/usr/bin/env bash
# Runs the migration + RLS tests on a throw-away local Postgres (needs postgres binaries; run as root or postgres).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
if [ -n "${DATABASE_URL:-}" ]; then   # CI: an empty Postgres is provided
  Q="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"
  $Q -f "$HERE/stub_supabase.sql" && $Q -f "$HERE/../migrations/0001_schema.sql" && $Q -f "$HERE/rls_tests.sql"; exit $?
fi
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); D=$(mktemp -d); chown postgres "$D"; PORT=54329
chmod -R a+rX "$HERE/.." 2>/dev/null || true
su postgres -c "$BIN/initdb -D $D/data -A trust >/dev/null && $BIN/pg_ctl -D $D/data -o '-p $PORT -k /tmp' -l $D/log -w start >/dev/null"
trap "su postgres -c '$BIN/pg_ctl -D $D/data -m immediate stop >/dev/null' || true; rm -rf $D" EXIT
Q="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$Q -c "create database t" && Q="$Q -d t"
$Q -f "$HERE/stub_supabase.sql" && $Q -f "$HERE/../migrations/0001_schema.sql" && $Q -f "$HERE/rls_tests.sql"
