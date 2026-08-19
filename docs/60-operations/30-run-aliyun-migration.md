# 30-run-aliyun-migration - move karda's data to Aliyun cloud (KD-019)

Owner direction 2026-08-19: business data moves to managed Aliyun services for
durability. Three stores, three very different moves - in THIS order, because
their criticality differs:

| Store | Today | Target | Criticality | Move |
|---|---|---|---|---|
| Postgres (`vx_karda_db`) | `karda-db` container, volume on worker-02 | **RDS PostgreSQL** | business truth - HIGHEST | dump/restore + DSN flip |
| Raw knowledge bytes (uploads: documents/tables/originals) | `FilesystemObjectStore` under `DATA_DIR` | **OSS bucket** | source material - HIGH | ossutil copy + env keys (adapter shipped) |
| Redis (RP sessions) | `karda-redis` container | own cloud Redis, **optional, LAST** | disposable | DSN flip, or don't move at all |

**Redis is NOT shared with the platform's instance.** The org rule "products
share no databases, only API contracts" applies to caches too: a shared Redis
means shared credentials over other products' session keys (session-hijack
blast radius), shared eviction policy, and one product's flush/hot-key incident
degrading everyone. karda's Redis holds only disposable login sessions - if
cost pressure ever argues for sharing, the correct answer is still "then leave
it in the container", not "share the instance".

## 1. OSS - raw knowledge bytes (adapter already shipped)

The `OssObjectStore` (kb/storage/oss.ts) implements the existing ObjectStore
port with zero new dependencies (hand-rolled V4 signing; canonicalization is
locked to Aliyun's official worked example by a golden test). Keys are
content-addressed IDENTICALLY to the filesystem store, so every
`document.storage_ref` survives the migration verbatim.

1. Create the bucket: **`vxture-karda-objects-prod`** (owner naming ruling
   2026-08-19: cloud resources carry symmetric `-prod`/`-beta` suffixes -
   bucket names are globally unique, so the env MUST live in the name here;
   this is the deliberate ADR-007 exception at the instance layer. **Also
   create `vxture-karda-objects-beta` now** to reserve the name against the
   global namespace - the beta tier is dormant (TD-001) but an empty bucket
   costs nothing and a squatted name later breaks the symmetry. Same pattern
   for the other cloud instances: RDS alias `vx-karda-db-prod` - the database
   INSIDE stays `vx_karda_db` per ADR-007 - and Redis `vx-karda-redis-prod`.)
   Private ACL, **versioning ON** (the durability the move is for), same
   region as the host's ACR (cn-beijing); block public access. After creation
   confirms availability, register the final names in CLAUDE.md's cascade
   table.
2. Create a RAM user scoped to THIS bucket only (least privilege - the same
   posture as `karda_svc`); note AK/SK.
3. Copy the existing tree (idempotent, re-runnable):
   `ossutil cp -r /srv/md0/karda/data/objects/ oss://<bucket>/ --update`
   (adjust the source to the host's `KARDA_OBJECT_ROOT`).
4. Host `.env`: set `ALIYUN_OSS_BUCKET/REGION/ACCESS_KEY_ID/ACCESS_KEY_SECRET`
   (+ `ALIYUN_OSS_ENDPOINT` to the `-internal` endpoint only if the host moves
   into the same VPC later; from worker-02 today use the public endpoint -
   https, signed, private bucket). Recreate the app container.
5. Verify: upload a document in Console -> object appears in the bucket;
   download an OLD document -> bytes come back (proves ref-compat); then the
   filesystem tree is a frozen fallback - keep it until the first backup cycle
   passes, then archive.

Selection is env-driven (`getObjectStore()`: OSS when configured -> filesystem
-> memory), so rollback = unset the four keys, recreate the container.

## 2. RDS - the business database

Pre-checks:
- Engine: RDS PostgreSQL **16+** (the DDL needs only `pgcrypto` /
  `gen_random_uuid`, JSONB, partial indexes - nothing 18-specific; match or
  exceed the container's major if possible to avoid dump-version friction).
- The instance must allow the `pgcrypto` extension and role creation
  (`karda_svc` login role; RDS master account plays the owner role db-init
  uses).
- Network: worker-02 is OUTSIDE Aliyun VPC - use the RDS public endpoint with
  TLS REQUIRED (`?sslmode=require`) + IP allowlist pinned to worker-02's
  egress IP. (If the app itself moves into Aliyun later, switch to the private
  endpoint and close the public one.)

Steps (small downtime window - minutes at current data volume):
1. Provision RDS; create database `vx_karda_db` (ADR-007: same name, env lives
   in the instance).
2. **db-init against RDS**: the workflow currently applies DDL inside the
   `karda-db` container. Before first RDS apply, db-init needs a variant that
   `psql`s the RDS master DSN from the runner/host instead (a
   `DATABASE_ADMIN_URL` secret). Until that lands, the equivalent manual step
   is: run `deploy/database/apply.sh` from worker-02 with `PGHOST/PGUSER`
   pointed at RDS master. Baseline -> 97 -> 98 -> incr/* order is unchanged;
   set the `karda_svc` password at the end (97's role-create works on RDS).
3. Freeze writes (stop the app container), `pg_dump --no-owner --no-privileges
   vx_karda_db` from the container, `pg_restore --data-only` into RDS (structure
   came from db-init, keeping DDL the single structure authority - do NOT
   restore schema from the dump).
4. Host `.env`: `DATABASE_URL=postgresql://karda_svc:...@<rds>:5432/vx_karda_db?sslmode=require`;
   start the app; verify `/api/health`, `/status` (db reachable), Console
   lists libraries/documents.
5. Keep the old container + volume stopped-but-intact for one week as
   rollback; then decommission. RDS automated backups + a weekly logical dump
   to OSS (`pg_dump | ossutil`) is the standing backup posture.

## 3. Redis - optional, last

Sessions only; worst case of loss = everyone signs in again. If moved: karda's
OWN instance (smallest spec), TLS, password auth, `REDIS_URL` flip, recreate
container. The platform's Redis is never the target (see above). Leaving it in
the container indefinitely is an acceptable end state.

## 4. What this runbook does NOT change

- DDL remains the single structure authority; db-init remains the only
  structure-change path (now pointed at RDS).
- The compose stack keeps `db`/`redis` services for LOCAL dev (dev compose is
  self-contained); production simply stops depending on them as each move
  lands.
- No credential enters the repo - AK/SK and DSNs are host `.env` / GitHub
  secrets, same four-layer hygiene as everything else.
