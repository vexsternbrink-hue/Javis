#!/usr/bin/env bash
# Startet ein temporäres lokales Postgres, spielt die Migration ein und prüft
# die Row-Level-Security-Regeln (Nutzer A vs. Nutzer B vs. anonym).
# Voraussetzung: PostgreSQL-Server-Binaries (initdb, pg_ctl) sind installiert.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "PostgreSQL-Server nicht gefunden (setze PGBIN)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
PORT="${RLS_TEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  # Postgres darf nicht als root laufen
  chown -R postgres "$TMP"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() {
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  /  /'
