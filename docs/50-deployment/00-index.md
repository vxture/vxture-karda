# 50-deployment - Infra, CI/CD, environments, bootstrap

Deployment and bootstrap material for this repo.

| File / dir | Purpose |
|------------|---------|
| `10-platform-registration-checklist.md` | platform-side registration actions (owner / platform line) when instantiating a product repo |
| `20-github-bootstrap-checklist.md` | one-time GitHub bootstrap: create public repo, enable scanning, first-push main, run CI once, apply the ruleset (in that order) |
| `rebuild/` | rebuild artifacts; holds `main-ruleset.json` (the branch-protection ruleset) |

The tag-to-env CD pipeline (deploy/build/rollback/db-init workflows and the
`tailnet-ssh-connect` composite action) is inherited from the template and lives
in `.github/`. It is authored but unexercised for karda: both checklists above
must be worked through before the first `beta-*` tag.
