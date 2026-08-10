#!/usr/bin/env bash
# Local dev DDL bootstrap for the docker-compose.dev.yml stack. Applies ONLY the
# three-part baseline (00_baseline + 97_service_role + 98_column_locks) and then
# sets the karda_svc password the dev app connects with.
#
# NEVER apply ddl/incr/* here: increments exist for migrating EXISTING databases;
# the baseline already contains every increment, and old increments may predate
# the multi-schema split (unqualified statements would create orphan tables under
# public - a real arda incident).
#
#   bash deploy/database/apply-local-dev.sh [container]
set -euo pipefail

CONT="${1:-vx-karda-postgres-db-dev}"
DB="vx_karda_db"
SVC_PW="${KARDA_SVC_PASSWORD:-karda_svc_dev}"
DDL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/ddl" && pwd)"

run() { docker exec -i "$CONT" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

for f in 00_baseline.sql 97_service_role.sql 98_column_locks.sql; do
  echo "[apply-local-dev] applying ${f}"
  run < "${DDL_DIR}/${f}"
done

# Match the DATABASE_URL default in docker-compose.dev.yml. Piped over stdin so
# the password stays out of argv/ps.
esc="$(printf '%s' "$SVC_PW" | sed "s/'/''/g")"
printf "ALTER ROLE karda_svc PASSWORD '%s';\n" "$esc" | run
echo "[apply-local-dev] karda_svc password set"

# Prove the app-facing identity actually works: a real query as karda_svc.
docker exec -e PGPASSWORD="$SVC_PW" "$CONT" \
  psql -h 127.0.0.1 -U karda_svc -d "$DB" -tAc \
  "select count(*) from vx_provision.app_instance;" >/dev/null
echo "[apply-local-dev] svc-role smoke query OK - dev DB ready"
