# ADR-001: adopt platform ADR-007 database naming (vx_karda_db)

- Status: accepted
- Date: 2026-08-10

## Context

The platform-level ADR-007 (see the platform repo) standardizes product database
naming: one database name per product, identical in every environment, with the
environment carried by the stack/instance (separate hosts/containers/volumes),
never by the database name. Arda migrated on 2026-08-10 (its issues #190/#192,
release v0.10.1); karda inherits the same template-era `vxturebiz_karda_prod` /
`vxturebiz_karda_beta` pair and syncs to the same target.

## Decision

- Database name: `vx_karda_db` in every environment (prod today; beta/dev when
  they materialize). The `POSTGRES_DB` env override remains injectable but the
  defaults across compose / db-init / .env.example are the single new name.
- Service role: `karda_svc`, unchanged.
- Production container names: unchanged (`karda-app` / `karda-redis` /
  `karda-db`). ADR-007's `vx-<code>-postgres-db-<env>` container style is
  OPTIONAL and is deliberately not adopted for the live prod stack - renaming
  containers would touch deploy.sh, db-init.yml and the platform status page
  for zero data-model benefit. The new local dev stack
  (`docker-compose.dev.yml`) does use the style (`vx-karda-*-dev`), so the
  convention is exercised where it is free.
- Code and Prisma never carry the database-name literal; it is injected
  configuration only (verified: `schema.prisma` has no url literal; the app
  reads `DATABASE_URL`).

## Consequences

- A one-time production migration window is required (dump -> fresh pg18 init
  -> restore -> role rebuild): `docs/50-deployment/30-pg18-adr007-migration.md`.
- Between the merge of the renaming PR and the window, db-init/seed must NOT be
  run with default env against the live old-name database.
- The platform `infra-allocation-registry` row must be updated after the window
  (issue-based liaison, like vxture-platform#206 for arda).
