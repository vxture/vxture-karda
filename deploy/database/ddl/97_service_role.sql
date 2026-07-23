-- Least-privilege service role (data_platform_100 section 2.2.4 / governance
-- section 7). The runtime connects as karda_svc, NOT the DB
-- owner. SELECT/INSERT/DELETE on the contract schemas; NO DDL; NO blanket UPDATE
-- (column-level UPDATE is granted per the whitelist in 98_column_locks.sql).
-- The password is injected at bootstrap (never in the repo).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'karda_svc') THEN
    CREATE ROLE karda_svc LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA vx_provision, local_authz, local_usage TO karda_svc;

GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA vx_provision, local_authz, local_usage
  TO karda_svc;

-- Domain schemas (added by the product) must grant the service role explicitly;
-- the contract schemas above are the factory baseline.

-- karda_kb: karda's knowledge-base domain (docs/30-design/210-data-model.md).
-- Same posture as the contract schemas - SELECT/INSERT/DELETE only, no DDL, no
-- blanket UPDATE; column-level UPDATE is whitelisted in 98_column_locks.sql.
GRANT USAGE ON SCHEMA karda_kb TO karda_svc;

GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA karda_kb TO karda_svc;
