#!/usr/bin/env bash
# Start/stop the project-only PostgreSQL instance used in local development.
# It lives outside the repo (../lims-pgdata-parent) on port 5433 with local trust auth,
# so it never touches a system-wide PostgreSQL installation.
#   scripts/local-db.sh start | stop | status | init
set -euo pipefail
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
DATA_DIR="${LIMS_PGDATA:-$(cd "$(dirname "$0")/../.." && pwd)/lims-pgdata-parent/data}"
LOG="$(dirname "$DATA_DIR")/pg.log"
PORT="${LIMS_PGPORT:-5433}"

case "${1:-status}" in
  init)
    mkdir -p "$(dirname "$DATA_DIR")"
    "$PG_BIN/initdb" -D "$DATA_DIR" -U lims -A trust -E UTF8 --locale=C
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -c listen_addresses=localhost" -l "$LOG" start
    "$PG_BIN/psql" -h localhost -p "$PORT" -U lims -d postgres -c "create database lims" -c "create database lims_test"
    ;;
  start) "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -c listen_addresses=localhost" -l "$LOG" start ;;
  stop) "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop ;;
  status) "$PG_BIN/pg_ctl" -D "$DATA_DIR" status ;;
  *) echo "usage: $0 init|start|stop|status"; exit 1 ;;
esac
