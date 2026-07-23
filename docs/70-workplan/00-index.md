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
| GitHub bootstrap per `docs/50-deployment/20-github-bootstrap-checklist.md` (public repo, first-push `main`, one CI run, THEN apply `main-ruleset.json`) | five required checks green on `main`; ruleset active | **done 2026-07-22** - ruleset `19556856` active with all five contexts; `main` green at `40dd18d` |
| `ALIYUN_ACR_NAMESPACE` repo variable (governance section 6: read from `vars`, never hardcoded) | `build.yml` registry preflight passes | done 2026-07-22 = `vx-foundation` |
| Dependabot registry credential (`.github/dependabot.yml` `registries:` block) | npm update runs stop failing `private_source_authentication_failure` | done 2026-07-22 |
| Platform-side registration **segment A** (directory row, tier seeding, `karda` production OIDC client, C2 credentials, C3 signing secret) | credentials issued and usable by the runtime | **landed in production 2026-07-23** (platform letters `30-2607230000` / `40-2607230130`): product row, OIDC client, five DRAFT plan skeletons. Follow-ups open in `80-liaison/50-2607230957` - see below |
| Production deploy target allocated: worker-02, `/srv/md0/karda`, port 3233 | port free; edge conf and `.env.example` carry real values | done 2026-07-23 (owner) |
| `production` GitHub Environment + required reviewer + non-secret `DEPLOY_*` | a `v*.*.*` tag pauses for approval and resolves the right host | done 2026-07-23 - `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PORT`/`DEPLOY_DIR` set |
| Platform-side registration **segment B** (edge vhost -> `vx-worker-02:3233`, `product_webhooks` delivery address, secret transport) | vhost live; `production` secrets complete | sent 2026-07-23 (`80-liaison/40-2607230909`), awaiting reply |
| Owner-transported secrets: **`DEPLOY_SSH_KEY` + `DEPLOY_KNOWN_HOSTS`** | first `v*.*.*` tag can deploy | **the only two hard blockers left**; both fail the workflow immediately if absent |
| Host-side `.env` at `/srv/md0/karda/etc/.env` (owner writes it directly, incl. `OIDC_CLIENT_SECRET`, `PLATFORM_API_URL`, `PLATFORM_INTERNAL_AUTH_TOKEN`) | app starts configured | todo - **must exist before the first deploy**; see the timing trap in `60-operations/20-run-first-deploy.md` section 2. `ENV_FILE_BASE64` is then unnecessary |
| Tier -> entitlement/quota mapping for the platform to publish the five DRAFT plans | platform admin publishes real `features`/`quota` | blocked on `20-specs/10-product-definition.md` reaching v1 - its section 11 still carries 7 product-level decisions, two of which drive quota semantics |
| Beta tier (`beta` Environment, `beta-*` trigger and routing, env-aware paths, `karda-beta` OIDC client) | `beta-*` tag routes to the beta environment | deferred - TD-001, awaiting the dedicated beta server |

**Tiering, to keep it straight**: beta + production is the standard deployment
model for every vxture product and karda follows it. During the development phase
every product deploys **straight to production**, so only the production half is
wired; beta is a reserved release channel that gets **its own separate server**
later. That is a phase-and-hardware deferral, not an opt-out - TD-001 tracks it as
an unfinished item, not an accepted deviation.

## Batch 2 - docs convention + karda product definition and design

| Item | Lands in | State |
|------|----------|-------|
| Repo docs convention (org taxonomy section 3 delegates in-repo organization) + guardrail rewrite (file names, directory names, README whitelist) | `docs/00-meta/10-docs-convention.md` | done 2026-07-22 |
| Report the taxonomy audit findings to the platform line (8 standing gaps, 4 decisions requested) | `docs/80-liaison/10-2607221756-karda-taxonomy-findings.md` | closed 2026-07-22 - all landed in 070 batch 5 |
| Re-align the convention and guardrail to 070 batch 5 (TD register to the newly pinned `10-tech-debt.md`, path-keyed `DIR_EXEMPTIONS`, sequence/keyed subdirectory model) | `docs/00-meta/10-docs-convention.md`, `scripts/guardrails/` | done 2026-07-22, zero deviations |
| Product definition (what karda is, surfaces, business rules) | `docs/20-specs/10-product-definition.md` | Draft v0.4 in repo |
| Knowledge model / processing / retrieval / arda-channel design | `docs/30-design/{100,110,120,200}-*.md` | Draft v0.1 in repo |
| Resolve the open decisions carried by those drafts | the same documents | 25 items open, split by who can decide - see below |
| Arda-side alignment on the content channel (5 items; `200-arda-channel` stays v0.1 until answered) | `docs/30-design/200-arda-channel.md` | sent 2026-07-22 (`80-liaison/30-2607222338`), awaiting reply |
| Decisions taken along the way | `docs/30-design/decisions/ADR-NNN-*` | todo |

### Who can decide the 25 open items

Sequencing follows from this split, not from document order: anything with an
external round trip goes out first, because its clock only starts when the letter
does. Karda-internal items compete for our working time, not for waiting time, so
they run in parallel rather than after.

| Decider | Items | Examples |
|---------|-------|----------|
| karda alone | ~11 | chunk defaults, `filterable` field ceiling, recall parameter baseline, tool-surface boundary |
| arda line | 5 | all of `200-arda-channel` section 12 - **sent** |
| platform / L0 | 4 | visible-set invalidation event contract (`product_310` defines it), private-library retention, instantiation metering, the Arda/Karda boundary ruling |
| atlas line | 1 | parsing-model deployment affinity (batch interface + co-located workers) |
| ontos line / L3 direction | 2 | graph instance ownership, first P-tier knowledge package selection |

The org domain-code registration for `karda` (taxonomy section 5) landed on the
platform side (branch `docs/register-karda-domain-code`). It governs karda
documents that stay in the PLATFORM repo; it does not apply inside this repo.

Unblocked 2026-07-22: `220` is free (vxtpl moved to `940-vxtpl`, the out-of-tier
band), so karda's platform-side spec directory `vxture/docs/20-specs/220-karda/`
can be created whenever there is platform-perspective content to put in it.
Nothing forces it yet - per taxonomy section 6, a product with no real specs to
host does not pre-create an empty directory, and karda's specs currently live
here, not there.

Still staged in the git-ignored `temp/`:
`product_110_amendment_user-dimension.md` - a platform-repo document (it is a
draft amendment to `product_110_sharing-isolation.md`), so it does not land here.

## Later

| Batch | Scope |
|-------|-------|
| 3 | Karda domain schema + DDL increment (three-part DDL, service role, column locks, Prisma lockstep guardrail) |
| 4 | Karda application surfaces on top of the inherited shell |
| 5 | Online integration against real platform endpoints; first beta deploy |
