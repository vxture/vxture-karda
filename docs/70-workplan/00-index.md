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
| Owner-transported secrets: **`DEPLOY_SSH_KEY` + `DEPLOY_KNOWN_HOSTS`** | first `v*.*.*` tag can deploy | done 2026-07-23 |
| **First production deploy** | stack live, health 200, VERSION traceable | **done 2026-07-23** - `v0.1.1` at `sha-2af1e38`; `v0.1.0` failed on a mangled `DEPLOY_DIR` and an empty host `.env`, both fixed |
| C2 channel live against the real platform | authenticated probe returns a valid envelope | **done 2026-07-23** - 200 with the unsubscribed envelope; 401 without a token and with a wrong one |
| C1 login loop end to end | a real authorize -> token exchange succeeds | blocked on the edge vhost (segment B) - `/auth/login` already 307s to the issuer correctly |
| Business-face DB structure via `db-init.yml` | `data.database.reachable=true` | in progress - `verify` run awaiting approval |
| Host-side `.env` at `/srv/md0/karda/etc/.env` | app starts configured | done 2026-07-23 - 26 keys, mode 600; written directly to the host. `ENV_FILE_BASE64` stays unused by design |
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

## Product development plan (batches 3-8)

The platform integration layer is done and verified end to end (see the batch-1
rows and `80-liaison/60-2607231722`). What follows is karda's own domain.

### The one thing that decides the shape of this plan

**Atlas gates two of the four largest domains.** `110-processing` section 4 states
the iron rule - "there is no second model host outside Atlas" - so parsing models,
OCR, table structure, embedding, rerank and generation all leave karda and land on
Atlas. karda hosts no model runtime at all, deliberately unlike RAGFlow.

The Atlas request (`80-liaison/70`) was answered on 2026-07-24 (`90`), and the
answer reshaped this plan more than a contract document would have. Atlas is not
yet an independent product - it is the combined `@vxture/service-model-platform`
inside the platform repo - and of karda's four asks, **only A4 (generation)
exists**. A1 embedding, A2 parsing models, and A3 rerank are **not built**: the
gap is capability, not documentation, so it cannot be closed by writing a
contract. Those await Atlas's own design-and-build schedule.

The consequence for sequencing: "wait for the Atlas contract" was the wrong
frame. What actually blocks is embedding (A1) - without it a chunk cannot enter a
vector index and retrieval has nothing to recall. So batch 5 and 6 each split
into a part that needs no Atlas capability we lack (storage, orchestration, the
BM25 and answering paths over the live A4) and a part that waits on A1/A3. The
former proceeds now; the latter is explicitly parked, not mocked-then-forgotten.

### Dependency map

| Domain | External dependency | Can start now? |
|--------|--------------------|----------------|
| Asset layer (objects, metadata, state machines, templates) | **none** | **yes** |
| Processing pipeline | Atlas (parsing models + embedding) | skeleton yes, real runs no |
| Retrieval | Atlas (rerank + generation) | skeleton yes, real runs no |
| Connector framework | **none** - `poll` is the default capability, so a connector needs no cooperation from the source beyond the five invariants | yes |
| The *arda* connector specifically | arda line (`80-liaison/30`, unanswered; urgency corrected in `80`) | no, but nothing else waits on it |
| C2 cache invalidation event | platform `product_310` | TTL fallback works meanwhile |
| Tool surface (7 tools) | the domains beneath it | last |

### Batches

| # | Scope | Blocked by | State |
|---|-------|-----------|-------|
| 3 | **Domain data model** | nothing | **done** (#19) |
| 4 | **Asset layer**: KB/Folder/Document/Entry store+service, dual templates, filterable whitelist, both state machines, U-tier flow | batch 3 | **in progress** - state machines, metadata, KB ownership/store/service landed (#25, #27) |
| 5a | **Processing pipeline, storage + orchestration**: three-tier queue, staged parsing to element tree, templated chunking, `failed` residency, atomic commit, own object storage for raw files | nothing (parse stages that call Atlas A2 are stubbed) | after 4 |
| 5b | **Vectorization**: embed chunks via Atlas | **Atlas A1 unimplemented** (KD-107) - the hard block; nothing to embed against | waits on Atlas capability |
| 6a | **Retrieval evaluation chain, non-embedding parts**: visible-set cache, whitelist, gating/CTA, citation assembly, BM25 path, the answering surface `karda.ask` over Atlas A4 | A4 is live (KD-108) | can proceed once 5a lands |
| 6b | **Vector recall + unified rerank**: dual-path RRF, cross-namespace union, rerank | **Atlas A1 + A3 unimplemented** (KD-107, KD-102) | waits on Atlas capability |
| 7 | **Connector framework**: Binding lifecycle, poll/notify delivery, tombstone delete, revoke cascade. Arda first, an external doc source second | nothing structural (`220` + `binding` table landed) | arda connector waits on arda reply |
| 8 | **Tool surface + Console**: the seven `karda.*` tools, recall testing, failure view | 4, 6a | last |

Batch 3 is deliberately first and deliberately narrow: every other domain writes
to or reads from these tables, and `lint:data-design` makes DDL/Prisma drift a
hard CI failure, so getting the shape wrong here is expensive to unwind later.

### Decisions that must land before batch 3 closes

`100-kb-model` section 11 carries four open items. Three do not touch the schema
(Entry edit rights, the preset ContentTemplate list, archive retention policy);
one does: **the filterable field cap** (proposed 16), which becomes a constraint.
The seven product-level items in `10-product-definition` section 11 do not block
batch 3 either, but two of them - first P-tier package selection, and the
instantiation/archive metering basis - gate the tier-to-entitlement mapping the
platform needs before it can publish karda's five DRAFT plans.

## Superseded

Earlier "Later" rows (domain schema / application surfaces / online integration)
are replaced by the batches above, now that the designs exist to plan against.
