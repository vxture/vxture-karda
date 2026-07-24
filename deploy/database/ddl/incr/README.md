# incr - numbered DDL increments

Structure changes to a live database ship here as idempotent, numbered SQL
increments (`0001_slug.sql`, `0002_slug.sql`, ...) applied by the db-init
workflow - never by editing `00_baseline.sql` (which is create-once) and never by
the container entrypoint.

Each increment must be idempotent: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, etc. Adding a writable column also requires updating
`../98_column_locks.sql`, or the service-role write fails with permission denied.

## Baseline safety on live databases

db-init applies **`00_baseline.sql` first, then every increment** - on *both* fresh
and live databases. On a live database the baseline's `CREATE TABLE IF NOT EXISTS`
is a no-op for tables that already exist, so a table keeps its *old* shape until the
increment that alters it runs afterwards.

Consequence: any **standalone** statement in the baseline that references a column
added by a later increment (a `CREATE INDEX`, a bare `ALTER`, etc.) will fail on a
live database, because at baseline time the old table is missing that column. Column
definitions and constraints written *inside* the `CREATE TABLE (...)` body are safe -
they no-op with the table. Only free-standing statements are dangerous.

Rule: when a new column also needs a standalone statement in the baseline, guard that
statement on the column's existence (see `idx_chunk_active` in `00_baseline.sql`) so a
fresh DB builds it and a live DB defers to the increment. The increment stays the
authority for the live path.

## Shipped increments

- `0001_chunk_versioning.sql` - chunk atomic-replace versioning: `document`
  gains `active_chunk_version`; `chunk` gains `version` and its uniqueness moves
  from `(document_id, ordinal)` to `(document_id, version, ordinal)`.
