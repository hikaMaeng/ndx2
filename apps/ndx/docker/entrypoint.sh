#!/usr/bin/env bash
set -euo pipefail

export NDX_ROOT="${NDX_ROOT:-/ndx}"
export POSTGRES_USER="${POSTGRES_USER:-ndev}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ndev}"
export POSTGRES_DB="${POSTGRES_DB:-$POSTGRES_USER}"
export PGDATA="${PGDATA:-$NDX_ROOT/pgvector/pgdata}"
export NDX_DATABASE_URL="${NDX_DATABASE_URL:-postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$POSTGRES_DB}"

mkdir -p "$NDX_ROOT/pgvector" "$NDX_ROOT/workspace" "$NDX_ROOT/.ndx/log" "$NDX_ROOT/.ndx/i18n"
if [[ -d /app/assets/i18n ]]; then
  cp -f /app/assets/i18n/*.json "$NDX_ROOT/.ndx/i18n/" 2>/dev/null || true
fi
chown -R postgres:postgres "$NDX_ROOT/pgvector" 2>/dev/null || true

if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
  if [[ -d "$PGDATA" ]]; then
    find "$PGDATA" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  password_file="$(mktemp)"
  chmod 600 "$password_file"
  printf '%s\n' "$POSTGRES_PASSWORD" > "$password_file"
  chown postgres:postgres "$password_file"
  su postgres -c "initdb -D '$PGDATA' --username='$POSTGRES_USER' --pwfile='$password_file'"
  rm -f "$password_file"
fi

su postgres -c "postgres -D '$PGDATA'" &
postgres_pid=$!

for attempt in {1..60}; do
  if pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$postgres_pid" 2>/dev/null; then
    wait "$postgres_pid"
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "PostgreSQL did not become ready." >&2
    kill "$postgres_pid" 2>/dev/null || true
    wait "$postgres_pid" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

if [[ "$POSTGRES_DB" != "postgres" ]]; then
  if ! su postgres -c "psql -U '$POSTGRES_USER' -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'\"" | grep -qx 1; then
    su postgres -c "createdb -U '$POSTGRES_USER' -O '$POSTGRES_USER' '$POSTGRES_DB'"
  fi
fi

node dist/server/index.js &
agent_pid=$!

term() {
  kill -TERM "$agent_pid" "$postgres_pid" 2>/dev/null || true
}

trap term INT TERM

set +e
wait -n "$agent_pid" "$postgres_pid"
status=$?
term
wait "$agent_pid" "$postgres_pid" 2>/dev/null
exit "$status"
