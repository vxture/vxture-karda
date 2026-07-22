# 70-workplan - Build plan and batch tracker

Karda's build plan. Each batch is one PR with machine-checked acceptance.
Authority for the inherited part of the plan: platform repo
`docs/30-design/product_240_repo-template.md`; for the karda product part, this
repo's `docs/20-specs/` and `docs/30-design/`.

## Batch 0 - instantiation (inherited baseline)

| Item | Acceptance | State |
|------|-----------|-------|
| Instantiate `vxture-template` as product code `karda` | no `__PRODUCT_CODE__` / `@product-code` token remains; derived names literal throughout | done 2026-07-22 |
| Governance shell (root files, secret hygiene, SCA gate, docs skeleton, guardrails) | `check-docs-numbering.mjs --strict` exit 0; `gitleaks detect` 0 hits; osv scan clean | inherited |
| Platform integration layer C1/C2/C3 + business-face DB baseline + offline verification pages | offline Mock-green | inherited |
| Tag-to-env deploy pipeline (`deploy`/`build`/`rollback`/`db-init` + `tailnet-ssh-connect`) | authored; verified in the template against a live demo instantiation | inherited, unexercised for karda |

Inherited artifacts are rigid: they arrive already accepted in the template and
are not re-litigated here. What is NOT inherited is anything repo-specific -
GitHub repo, environments, secrets, and platform registration all start empty.

## Batch 1 - repo bootstrap (not started)

| Item | Acceptance | State |
|------|-----------|-------|
| GitHub bootstrap per `docs/50-deployment/20-github-bootstrap-checklist.md` (create public repo, secret scanning + push protection, first-push `main`, one CI run, THEN apply `main-ruleset.json`) | five required checks green on `main`; ruleset active | todo |
| Platform-side registration per `docs/50-deployment/10-platform-registration-checklist.md` (OIDC clients `karda`/`karda-beta`, C2/C3 secrets, edge vhost `karda.vxture.com`) | credentials issued; vhost live | todo |
| GitHub Environments `beta` / `production` with `DEPLOY_*` (exact `DEPLOY_DIR`) and a required reviewer on `production` | a `beta-*` tag deploys; a `v*.*.*` tag pauses for approval | todo |
| Restore the standard's two-tier tag->env routing (inherited `deploy.yml` is prod-only) | `beta-*` tag routes to the `beta` environment | todo - TD-001, blocked on a beta target |

## Batch 2 - docs convention + karda product definition and design

| Item | Lands in | State |
|------|----------|-------|
| Repo docs convention (org taxonomy section 3 delegates in-repo organization) + guardrail rewrite (file names, directory names, README whitelist) | `docs/00-meta/10-docs-convention.md` | done 2026-07-22 |
| Product definition (what karda is, surfaces, business rules) | `docs/20-specs/10-product-definition.md` | Draft v0.4 in repo |
| Knowledge model / processing / retrieval / arda-channel design | `docs/30-design/{100,110,120,200}-*.md` | Draft v0.1 in repo |
| Resolve the open decisions carried by those drafts (4 + 4 + 5 + Arda-side alignment) | the same documents | todo |
| Decisions taken along the way | `docs/30-design/decisions/ADR-NNN-*` | todo |

The org domain-code registration for `karda` (taxonomy section 5) landed on the
platform side (branch `docs/register-karda-domain-code`). It governs karda
documents that stay in the PLATFORM repo; it does not apply inside this repo.

Still staged in the git-ignored `temp/`:
`product_110_amendment_user-dimension.md` - a platform-repo document (it is a
draft amendment to `product_110_sharing-isolation.md`), so it does not land here.

## Later

| Batch | Scope |
|-------|-------|
| 3 | Karda domain schema + DDL increment (three-part DDL, service role, column locks, Prisma lockstep guardrail) |
| 4 | Karda application surfaces on top of the inherited shell |
| 5 | Online integration against real platform endpoints; first beta deploy |
