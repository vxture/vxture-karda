# pg16 -> 18 + ADR-007 db-name migration window (prod runbook)

Host-side migration window for the compose/naming changes landed by the
"build target + pg18 + ADR-007" PR: `postgres:16-alpine` -> `18-alpine` with the
parent-directory mount, `redis:7-alpine` -> `8-alpine`, and database
`vxturebiz_karda_prod` -> `vx_karda_db` (platform ADR-007; local record
`ADR-001`). Adapted from arda's 2026-08-10 execution (issues #190/#192, release
v0.10.1), including the lessons from its two real failures.

**Scope: production only.** Karda's beta tier is a dormant reserved channel
(TD-001): `deploy.yml` has no `beta-*` trigger and there is no beta stack or
data, so the window runs exactly once. Redis needs no manual step - Redis 8
loads the 7-generation AOF/RDB in place.

Karda specifics (differ from arda - do not copy arda commands blindly):

| Thing | Karda value |
|-------|-------------|
| stack root | `/srv/md0/karda` |
| containers | `karda-app` / `karda-redis` / `karda-db` |
| db superuser (container `POSTGRES_USER`) | `postgres` (arda used its product name) |
| old -> new db name | `vxturebiz_karda_prod` -> `vx_karda_db` |
| service role | `karda_svc` (unchanged) |
| data dir (bind mount) | `/srv/md0/karda/data/db` (was mounted at `/var/lib/postgresql/data`, now at `/var/lib/postgresql`) |
| operator env | `/srv/md0/karda/etc/.env` |

## Iron rules (paid for with arda incidents)

1. **Window before approval.** The `v*.*.*` deploy pauses at the production
   Environment gate. Finish the host-side window (backup -> move data dir ->
   patch .env) BEFORE clicking Approve. Arda approved first: the pg18 container
   exited in 0.5s on the pg16 data layout and prod threw 502.
2. **No db-init/seed between merge and window.** Once the PR is on `main`, the
   db-init default targets `vx_karda_db`; running it against the live old-name
   stack would create an empty new db alongside the real one.
3. Symptom recognition: `dependency failed to start: container karda-db is
   unhealthy` with the db exiting in under a second = data-layout/version
   mismatch, NOT a healthcheck-parameter problem.

## Standard window

```bash
ROOT=/srv/md0/karda
mkdir -p $ROOT/backup

# 1. Backup while the old db is alive. MUST verify non-zero size.
docker exec karda-db pg_dump -U postgres -d vxturebiz_karda_prod -Fc > $ROOT/backup/pre18.dump
ls -la $ROOT/backup/pre18.dump

# 2. Stop the stack, move the pg16 data dir aside (fresh pg18 init, no pg_upgrade).
docker stop karda-app karda-redis karda-db
mv $ROOT/data/db $ROOT/data/db.pg16.bak

# 3. Patch the operator env (backup first).
cp $ROOT/etc/.env $ROOT/etc/.env.bak.pre18
sed -i 's/vxturebiz_karda_prod/vx_karda_db/g' $ROOT/etc/.env

# 4. Release: push the vX.Y.Z tag (or it is already waiting) and ONLY NOW
#    approve the production pending deployment. The new stack initializes pg18
#    fresh, creating vx_karda_db; redis 8 loads the existing AOF.

# 5. Restore data. Ignored errors are EXPECTED (GRANTs referencing karda_svc,
#    which does not exist yet - arda saw 119 in each environment); step 6
#    rebuilds the role and completes them.
docker exec -i karda-db pg_restore -U postgres -d vx_karda_db --no-owner < $ROOT/backup/pre18.dump

# 6. Rebuild role + grants + locks through the canonical path: run the db-init
#    workflow pinned to the merged sha (it applies 97/98 idempotently and sets
#    the karda_svc password from etc/.env's DATABASE_URL):
#      gh workflow run db-init.yml -f action=apply -f confirm=yes -f expected_sha=<sha>
#    Then verify with a REAL query as the service identity:
#      PW=<svc password from etc/.env DATABASE_URL>
#      docker exec -e PGPASSWORD="$PW" karda-db \
#        psql -U karda_svc -d vx_karda_db -tAc 'select count(*) from vx_provision.app_instance;'

# 7. Restart the app to flush the connection pool of window-era failed
#    connections, then verify.
docker restart karda-app
curl -fsS http://127.0.0.1:3240/api/health
```

## Rescue: old container already replaced, no live dump taken

The bind-mounted data dir survives container replacement. Run a throwaway pg16
container directly on the moved-aside directory (old layout mount point):

```bash
docker run --rm -d --name pg16-rescue \
  -v /srv/md0/karda/data/db.pg16.bak:/var/lib/postgresql/data \
  postgres:16-alpine
sleep 12
docker exec pg16-rescue pg_dump -U postgres -d vxturebiz_karda_prod -Fc > /srv/md0/karda/backup/pre18.dump
docker stop pg16-rescue
# then resume at step 2 of the standard window
```

## Rollback

Any step fails: stop the stack -> `mv $ROOT/data/db.pg16.bak $ROOT/data/db` ->
`cp $ROOT/etc/.env.bak.pre18 $ROOT/etc/.env` -> run `rollback.yml` to the
previous sha image. Note the NEW compose mounts the parent directory - rolling
back also needs the pre-PR compose on the host (rollback.yml rsyncs the deploy
subset from the rollback ref, which restores the old mount). Keep the backup
dump throughout.

## Close-out

- After >= 1 day of stable operation delete the three window artifacts:
  `$ROOT/backup/pre18.dump`, `$ROOT/data/db.pg16.bak`, `$ROOT/etc/.env.bak.pre18`.
- Coordinate the platform `infra-allocation-registry` db-name row update via a
  GitHub issue on the platform repo (arda's counterpart: vxture-platform#206).
