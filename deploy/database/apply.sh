#!/usr/bin/env bash
# Clean-baseline DDL applier. Run ONLY by the db-init workflow (batch E) - never
# by the container entrypoint (the entrypoint must never migrate). Fail-fast.
#
# ORDER (TD-010 closed 2026-08-30): baseline -> 97 -> incr/* -> 98.
# 98 runs LAST: on a live DB the increments are what add missing columns, and 98
# grants on the full column set; increments run after 97 because they GRANT to
# the service role 97 creates. Keep db-init.yml's inline copy in step with this.
set -euo pipefail

DDL_DIR="$(cd "$(dirname "$0")/ddl" && pwd)"
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"

for f in 00_baseline.sql 97_service_role.sql; do
  echo "applying ${f}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${DDL_DIR}/${f}"
done

shopt -s nullglob
for f in "${DDL_DIR}"/incr/*.sql; do
  echo "applying incr $(basename "${f}")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${f}"
done

echo "applying 98_column_locks.sql"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${DDL_DIR}/98_column_locks.sql"

echo "DDL applied."
