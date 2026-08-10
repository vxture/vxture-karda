# 50-deployment - Infra, CI/CD, environments, bootstrap

Deployment and bootstrap material for this repo.

| File / dir | Purpose |
|------------|---------|
| `10-platform-registration-checklist.md` | platform-side registration actions (owner / platform line) when instantiating a product repo |
| `20-github-bootstrap-checklist.md` | one-time GitHub bootstrap: create public repo, enable scanning, first-push main, run CI once, apply the ruleset (in that order) |
| `30-pg18-adr007-migration.md` | host-side migration window runbook: pg16 -> 18 + `vxturebiz_karda_prod` -> `vx_karda_db` (prod only; beta dormant per TD-001) |
| `rebuild/` | rebuild artifacts; holds `main-ruleset.json` (the branch-protection ruleset) |

The tag-to-env CD pipeline (deploy/build/rollback/db-init workflows and the
`tailnet-ssh-connect` composite action) is inherited from the template and lives
in `.github/`. Both checklists above are done and the production chain is
exercised (live since v0.1.0); the beta tier stays a reserved channel (TD-001).
