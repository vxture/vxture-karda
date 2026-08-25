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
| Production deploy target allocated: worker-02, `/srv/md0/karda`, port 3240 (was 3233, reallocated 2026-07-24; beta 3241 reserved) | port free; edge conf and `.env.example` carry real values | done 2026-07-23 (owner); port reallocated 2026-07-24; **host cutover 2026-07-26** - host `.env` `APP_PUBLISH_PORT` 3233->3240 and `karda-app` recreated (same image `sha-2af1e38`), now publishing 3240 |
| `production` GitHub Environment + required reviewer + deploy target secrets | a `v*.*.*` tag pauses for approval and resolves the right host | done 2026-07-23; **secrets reorganized 2026-07-27** - host-pointing secrets are now org-level `DEPLOY_WORKER02_*` (HOST/USER/PORT/KNOWN_HOSTS/SSH_KEY/SSH_KEY_PASSPHRASE, shared to the worker-02 repos, `#54`); `DEPLOY_DIR` stays per-repo |
| Platform-side registration **segment B** (edge vhost -> `vx-worker-02:3240` [reallocated 2026-07-24, was 3233], `product_webhooks` delivery address, secret transport) | vhost live; `production` secrets complete | sent 2026-07-23 (`80-liaison/40-2607230909`); port change re-sent 2026-07-24; **edge closed 2026-07-26** - edge on 3240, host cut over, `https://karda.vxture.com/api/health` 200. Remaining `product_webhooks` delivery-address registration folded into **segment C** (`80-liaison/120-2607261820`) |
| **`v0.2.0` shipped to production 2026-07-26** (Console + `write_document`/`create_entry` + processing runtime): `karda.vxture.com/api/health` reports `version=v0.2.0` (`sha-21cfc6b`), `/console` 200, three channels green. Deploy image-pull hardened for the China host (ACR-primary, skip-unchanged, base-image-if-missing, one-latest prune; `#48`/`#49`) | first user-visible release live | done - segment C letter (`120`) queued for the platform: webhook-address + metric-key registration + inert-secret cleanup |
| Owner-transported secrets: **`DEPLOY_WORKER02_SSH_KEY` + `DEPLOY_WORKER02_KNOWN_HOSTS`** (org-level since 2026-07-27) | first `v*.*.*` tag can deploy | done 2026-07-23 |
| **First production deploy** | stack live, health 200, VERSION traceable | **done 2026-07-23** - `v0.1.1` at `sha-2af1e38`; `v0.1.0` failed on a mangled `DEPLOY_DIR` and an empty host `.env`, both fixed |
| C2 channel live against the real platform | authenticated probe returns a valid envelope | **done 2026-07-23** - 200 with the unsubscribed envelope; 401 without a token and with a wrong one |
| C1 login loop end to end | a real authorize -> token exchange succeeds | blocked on the edge vhost (segment B) - `/auth/login` already 307s to the issuer correctly |
| Business-face DB structure via `db-init.yml` | `data.database.reachable=true` | **done 2026-07-24** - `db-init apply` (run `30086025097`, pinned `322e016`) applied `baseline -> 97 -> 98 -> incr/0001` to `vxturebiz_karda_prod`; post-apply assertion "20 declared, 20 exist"; `karda_svc` password set. This is also the go-live of the chunk-versioning domain migration (below) |
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
| Report the taxonomy audit findings to the platform line (8 standing gaps, 4 decisions requested) | `docs/80-liaison/10-2607221756-karda-taxonomy-findings-DONE.md` | closed 2026-07-22 - all landed in 070 batch 5 |
| Re-align the convention and guardrail to 070 batch 5 (TD register to the newly pinned `10-tech-debt.md`, path-keyed `DIR_EXEMPTIONS`, sequence/keyed subdirectory model) | `docs/00-meta/10-docs-convention.md`, `scripts/guardrails/` | done 2026-07-22, zero deviations |
| Product definition (what karda is, surfaces, business rules) | `docs/20-specs/10-product-definition.md` | Draft v0.4 in repo |
| Knowledge model / processing / retrieval / arda-channel design | `docs/30-design/{100,110,120,200}-*.md` | Draft v0.1 in repo |
| Resolve the open decisions carried by those drafts | `docs/20-specs/20-decisions.md` (register, authority) | **A/B groups ratified 2026-07-24** (KD-001..016 - all karda-alone design + params); C group external (Atlas / platform); D group owner-pending (KD-201..204). The "who can decide" split below is the original framing - the register now holds the rulings |
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
| 4 | **Asset layer**: KB/Folder/Document/Entry store+service, dual templates, filterable whitelist, both state machines, HTTP API | batch 3 | **done** - state machines + metadata (#25), KB ownership/store/service (#27), presets+seed (#30), content layer (#31), HTTP routes (this PR). 134 tests |
| 5a | **Processing pipeline** + queue/worker + object storage: five-stage model, failure taxonomy, fast-path parser, chunking, orchestrator, three-tier queue with org cap + per-KB serial window, worker mapping outcomes to doc state | nothing (deep parse=A2, embed=A1 stubbed) | **done** - 52 tests. Object storage + upload live (#36); queue worker live. **Chunk-commit atomic-replace persistence done (#38) and its versioning migration is LIVE in `vxturebiz_karda_prod` (2026-07-24)**. **Runtime wiring partly built (2026-07-24): singleton queue + content sink + resolver + enqueue-on-upload + internal-token tick endpoint (`POST /api/kb/processing/tick`)**. Remaining deferred (TD-007): an external scheduler driving `tick`, IR persistence, and KB-level embedding-model/params sourcing |
| 5b | **Vectorization**: embed chunks via Atlas | **Atlas A1 unimplemented** (KD-107) - the hard block; nothing to embed against | **done 2026-08-18** - Atlas /v1 shipped A1; `AtlasEmbedClient` + `chunk_embedding` store (ADR-002) + resume lever built. Activation = env + db-init `incr/0003` + Atlas grants (see the 2026-08-18 section) |
| 6a | **Retrieval evaluation chain, non-embedding parts**: scope resolution + whitelist floor, visible-set cache (event + TTL), RRF, degrade contract, and `karda.ask` over the LIVE Atlas A4 | A4 live (KD-108) | **done** - 37 retrieval tests. Whitelist holds through both degrade paths; real BM25 engine + vector recall deferred (TD-008) |
| 6b | **Vector recall + unified rerank**: dual-path RRF, cross-namespace union, rerank | **Atlas A1 + A3 unimplemented** (KD-107, KD-102) | **done 2026-08-18** - `VectorRecaller` (second recaller, KD-107 model lock, self-degrading) + `AtlasReranker` (A3, cap 100, order-only scores) through the existing chain seams |
| 7 | **Connector framework**: Binding lifecycle, poll/notify delivery, tombstone delete, revoke cascade. Arda first, an external doc source second | nothing structural (`220` + `binding` table landed) | arda connector waits on arda reply |
| 8 | **Tool surface** (`karda.*` seven tools, S2S gateway, OBO-only gate, `/.well-known/vxture-tools`) **+ Console** | 4, 6a | tool surface **done** - 32 tests; read tools wired, write tools gate correctly then not_implemented (TD-009). Console + recall testing deferred |

### Next phase - the A1-wait window (sequenced 2026-07-24)

The binding constraint is **Atlas A1 (embedding)**. The pipeline is
embed-before-commit (110-processing 6), so no chunks land until A1 exists - a
document flows fetch/parse/chunk and **parks at embed** by design, losing
nothing. So the core RAG flywheel cannot produce real data yet. Strategy for the
wait window: build karda into a complete, demoable product for everything
**except vector search**, so the day A1 lands the flywheel turns with no new
plumbing - 5b/6b drop into seams that already exist and are tested.

Design is NOT the blocker: the register's A/B groups (KD-001..016) were all
ratified by the owner 2026-07-24 (`20-specs/20-decisions.md`), so every track
below has its design inputs. What remains is the owner D-group (KD-201..204) and
the external C-group (Atlas A1/A2/A3, platform `product_310`/`product_110`) -
neither blocks the tracks below.

**Build track (owner endorsed all four, 2026-07-24), in execution order:**

| # | Track | Why here | Blocked by |
|---|-------|----------|-----------|
| 9 | **Tool-surface write backends** (TD-009) | most contained; `write_document` now creates + enqueues on the runtime just wired (#42); completes the agent-facing write path | nothing |
| 10 | **Console** (library + document management UI) - **9a/9b landed; Console UI landed 2026-07-26** at `/console`: libraries index (list + create), library detail (upload -> document list with content-state + A1-park hint, delete), the sharing ladder (private/workspace/organization, server-gated), and the governance switch. Client pages over the existing kb HTTP API; pure label/format logic in `_lib/format.ts` (unit-tested). Deferred: folders UI, processing-template choice on create, structured-entry authoring. **The search/ask surface landed 2026-08-18** (`/console/search` over new session routes `POST /api/kb/search` / `/api/kb/ask` + `console-retrieval.ts`): scope = whole visible set by default, library chips narrow within it, results carry snippets, ask renders the cited answer; degrade/partial states surfaced. Un-metered by design (first-party surface; Atlas costs still meter at Atlas under the call's taskId) | turns the finished-but-headless asset layer into a demoable product - the core "upload -> classify into graded libraries -> set per-library sharing" surface (KD-016); the one thing a stakeholder can see and validate | nothing (KD-006 keeps publish/govern/delete in Console, not tools) |
| 11 | **Connector framework** (batch 7) - **11a landed 2026-07-27** (no schema): the framework spine - the connector **capability registry** (`change_detection`/`delivery`/`fetch`/`reconcile`/`delete_signal`, arda registered, degradation analysis + the I4 delete-invariant check); **Binding lifecycle** (store over the existing `binding` table + service: create/pause/resume/revoke state machine, backfill->incremental, connector-known + uniqueness rules) with OBO owner-gated routes `POST/GET /api/kb/:id/bindings` and `POST /api/kb/:id/bindings/:bid` (pause\|resume\|revoke); the minimal **ingest envelope** parse/validate (upsert bytes-XOR-ref, delete-by-stable-id). **11b landed 2026-07-27 (no schema)**: the connector data-plane over the existing `document.source_ref` (JSON, immutable) + `idx_document_source_doc_id`. `ingestEnvelope` applies an envelope - upsert is a **supersede** (tombstone the prior live row via the writable `content_state`, insert the new one, enqueue on the backfill/sync tier), an unchanged hash is an idempotent ack, delete tombstones by stable id; `revokeCascade` moves every live connector doc of a revoked binding out of recall (wired into the revoke route). Ingest endpoint `POST /api/connectors/ingest` (INTERNAL_JOB_TOKEN). `fetch=direct` (inline bytes) stored now; `fetch=ref` parks the record until the fetch client lands. Deferred: the poll scheduler + the arda-specific `fetch=ref` retrieval (waits on arda) | external ingestion skeleton: Binding lifecycle, poll/notify, tombstone, revoke cascade; arda connector plugs in on arda's reply | nothing structural (KD-013/014 set); arda connector waits on arda |
| 12 | **Governance / verification runtime** - **runtime landed 2026-07-26**: `GovernanceService` (verify a document/entry -> stamps verifier + verifiedAt + expiresAt from the library interval; refuses when governance is off or synced-content is exempt) and the interval-expiry `sweep` (lapsed `verified` -> `stale` via `evaluateExpiry`, never fabricating a stale when a library has since turned governance off). Surfaced the verification columns on the content rows + `default_verifier`/`default_verify_interval_days` on the KB row (no DDL - already in schema). Routes: `POST /api/kb/:id/documents/:docId/verify` (assigned-verifier-or-admin gated), `POST /api/kb/governance/sweep` (INTERNAL_JOB_TOKEN, drainable like usage flush), KB `PATCH` extended for verifier assignment. Pure logic (`state.ts`) unit-tested end to end. **Console surface (12b) landed 2026-07-27**: verification badges on documents (unverified/verified/stale), a Verify/Re-verify button (shown when governance is on), and the library governance config (assign default verifier + re-verify interval) in the library detail. Deferred: a cron trigger for the sweep endpoint | `verified/stale` transitions, verifier assignment, interval-expiry sweep - the enterprise-trust layer; asset + retrieval already leave the state-machine seams | nothing |
| - | **BM25 recall engine** (TD-008) - **built 2026-07-27**: pure Okapi BM25 (`bm25.ts`) + `RecallCorpus` port (in-memory + Prisma over indexed chunks/entries) + `Bm25Recaller` behind the chain's `Recaller` seam; 12 tests. Chunk side is empty until A1 commits chunks, but the engine + path are live. Remaining to unblock search/ask end-to-end: the C2 visible-set fill + route-wiring (recaller + A4 generation) | staged LATE, just before A1 - it has no real chunks to index until A1, so building it earlier indexes nothing | real payoff gated on A1 |
| 13 | **Three-plane A4 integration - consumption side** (control=platform / capability=atlas / consumption=karda) - **karda side done 2026-07-27** (#68): the **S2S token-exchange caller** (`atlas-token.ts`, RFC 8693 service mode) mints an `aud=atlas` RS256 bearer from karda's own confidential client against the platform IdP - `requested_context={org_id, workspace_id}`, no `subject_token`, 300s/no-refresh, cached per `(org, ws)` with a 30s margin - and is **wired dynamically into `AtlasA4Client`** (mints per call from the request's org/ws, dropping the static token; #67's base/auth correction stays). `ask.ts`/`ask-tool.ts` thread `workspaceId` as the service context. New `atlas-token.test.ts` + updated `generation.test.ts`; 332 tests green. Corrects two now-stale `140` premises (platform token-exchange issuance IS in production; Atlas host IS registry-confirmed on vx-worker-02 port 3100) and re-pings the atlas line in `141`. **karda's blockers are fully cleared**; a live call turns on `ATLAS_BASE_URL` + `ATLAS_ASK_MODEL` alone once the atlas line confirms `141` items 1-3 | karda task 2 of the cross-product task table - the buildable half of the A4 link, independent of Atlas's own schedule | nothing (all karda-side prerequisites met) |

**Decision track (parallel, owner):** ratify D-group **KD-201..204**. **KD-202**
(private-lib retention) and **KD-203** (instantiation/archive metering) gate the
tier -> entitlement/quota mapping the platform needs to publish karda's five
DRAFT commercial plans; **KD-201** (first P-tier package) is a product-direction
call. Recommendations sit in `20-specs/20-decisions.md` section 3.

**Atlas replied 2026-07-27 (issue #70)** - answers `100`/`140`/`141`. Endpoint
`POST /model-platform/chat` + verify-side RS256/JWKS **confirmed** (matches karda's
built client); model selection is via `taskProfile` (auto-adapt: send a label, not a
`modelCode`) or the tenant-filtered list `GET /model-platform/models?tenantId=`
(#70 §6); 429/403 error contract final (`RATE_LIMITED`/`QUOTA_EXHAUSTED`). This
re-shapes the two karda-side A4 tasks:

- (a) **`taskProfile` auto-adapt wiring** is now **buildable** (§6 delivered the
  mechanism) - no longer blocked. The user-facing "pick a model" UI over the model
  list is a later Console surface.
- (b) **the live `karda.ask` <-> A4 call** no longer waits on Atlas: per #70 §5 the
  platform token-exchange has been live since 2026-07-12; the sole residual is
  whether **Atlas's product registration ran in production** (`product.products`
  row + `aud=atlas` OIDC client mapping) - a **platform-line** confirmation, filed
  as `vxture/vxture-platform#145`, **confirmed 2026-07-27** (`aud=atlas` is now a
  mintable audience). The caller, the client wiring, and the whitelist/degrade path
  (6a) are all built and tested.

  **Live E2E verification (2026-07-27, on worker-02):** proved the whole
  karda -> platform -> Atlas S2S chain works. Along the way it (i) caught + fixed a
  real bug in karda's token caller - it sent the context as a JSON
  `requested_context` blob; the platform wants separate `org_id`/`workspace_id`
  fields (`#74`); (ii) surfaced a D2 coverage gap, resolved when the owner added a
  karda **free subscription** (`vxture/vxture-platform#147`, closed - not a bug).
  With that, the `aud=atlas` token **mints** and Atlas **accepts** it: a
  `/model-platform/chat` call with a dummy code returns `404 MODEL_NOT_ROUTABLE`
  (past auth), confirming endpoint + contract + error semantics.

  **LIVE 2026-07-28** (`vxture/vxture-karda#76` closed). The Atlas-side blockers
  cleared in sequence via live iteration on `vxture/vxture-atlas#47`: a missing
  `model_grants.task_profile` column (migration), a per-tenant technical grant
  (admin-created, no tier auto-mapping), and a `modelCode`-verbatim-as-upstream-
  `model` bug (Atlas re-registered literal upstream IDs). All three registered
  models then generated real content (`doubao-seed-2-0-lite-260428`,
  `doubao-seed-2-0-pro-260215`, `glm-5.2`). Go-live took a **redeploy**, not just an
  env change: the running prod image (v0.2.2, commit #61) predated the feature, so
  `ATLAS_BASE_URL` activated nothing until **v0.2.3** (`sha-5a30f90`) shipped the
  token-exchange code. Now `POST /api/tools/ask` returns a `200` `AskToolResult`
  (generation client active) instead of `501`. `ATLAS_ASK_MODEL=doubao-seed-2-0-lite-260428`
  on the host. A grounded answer just needs indexed content (data, not integration).

**On A1 landing:** 5b (vectorize) + 6b (vector recall + rerank) complete the
flywheel through the tested seams; BM25 (TD-008) lands alongside for the
dual-path RRF.

### 2026-08-18 - A1 landed: the flywheel is built (Atlas /v1 alignment + 5b + 6b)

Atlas v0.24.0's consumption face now serves ALL four `/v1` capabilities
(chat/embed/rerank/parse - the Atlas interface doc set, plus letters
karda#100/#101/#102). That dissolved the plan's binding constraint, and the wait
window closed exactly as designed - 5b/6b dropped into the prepared seams:

- **/v1 contract alignment**: a shared Atlas core (`kb/atlas/client.ts`) speaks
  the error envelope `{code, message, retryable, retryAfterMs?}`; `taskId` is
  now sent on EVERY Atlas call (required since Atlas v0.15.0, #101) - tools
  accept a caller-threaded `task_id` and fall back to a per-call work-unit id;
  processing uses the stable `karda:ingest:<docId>`. Error branches key on
  `QUOTA_EXCEEDED`/`retryable`, never the never-thrown `QUOTA_EXHAUSTED`
  (#100); `retryAfterMs` is read null-safe (known Atlas defect).
- **5b vectorization**: `AtlasEmbedClient` behind the orchestrator's
  `EmbeddingClient` port; per-KB model lock (`KB.embedding_model`, fallback
  `ATLAS_EMBED_MODEL`; no model configured = park, never a guessed vector
  space); background tenant resolution via `vx_provision.app_instance`; vectors
  persist to `karda_kb.chunk_embedding` (ADR-002) atomically with the chunk
  commit; `POST /api/kb/processing/tick {"resume": true}` wakes the parked
  fleet and re-enqueues `processing` documents lost to a restart.
- **6b dual-path recall + rerank**: `VectorRecaller` (cosine, model lock,
  self-degrades to [] so an Atlas outage means lexical-only search, never a
  namespace failure) + `AtlasReranker` (cap 100 defensively enforced; scores
  are ORDER-ONLY per Atlas #89 - no absolute-threshold rules).
- **Port R3 (#104)**: container/dev/compose ports unified on 3240;
  `check-port-consistency.mjs` guards it in quality-gate.

**Activation checklist** (rewritten 2026-08-19 per KD-018 - selection moved
from env config to Atlas authorization): (1) db-init `apply` with
`incr/0003_chunk_embedding.sql` - **done 2026-08-18** (run 32140006415);
(2) Atlas-side: label karda's tenant grants with the three task profiles -
`karda.embed` (embedding-3 today), `karda.rerank` (rerank-v1),
`karda.ask` (the chat model of choice) - requested in the karda->atlas
liaison issue; NO karda host env for models (break-glass pins only);
(3) `tick {"resume": true}` to index the parked fleet; then verify
`karda.search` returns dual-path results.

### 2026-08-18 - the Runos channel (batch 14: karda as a capability supplier)

Owner direction: the capability platform gets knowledge READ and WRITE. Built
per `docs/30-design/230-runos-channel.md`:

| Item | State |
|------|-------|
| MCP endpoint `POST /api/mcp` (stateless Streamable HTTP; initialize/ping/tools list+call; bearer auth 503-fail-closed) | done 2026-08-18 |
| Tool surface = the registration contract: `karda.kb-read` (search/ask/list_kbs) + `karda.kb-write` (write_document/create_entry), snake_case ops, one endpoint | done 2026-08-18 |
| Channel rules: service-mode with org/workspace in arguments; `kb_ids` = required preset merge (product_110 D5, now also wired on the direct channel); service-mode writes land as processing/draft only (governance ladder, product definition section 15) | done 2026-08-18 |
| Shared backend assembly (`kb/tools/backends.ts`) - one knowledge service behind both channels | done 2026-08-18 |
| Mint `RUNOS_CHANNEL_TOKEN` -> karda host env -> Runos credential vault (promote hard-gates on the binding) | ops, pending |
| Register capabilities + endpoint in Runos (opera), promote to stable, grants for consuming agents | ops + runos line, pending |
| Liaison letter to runos: registration request + caller-identity-forwarding and endpoint-base questions | **sent 2026-08-18** - `vxture-runos#156` |

### 2026-08-18 - positioning uplift (KD-017): the Vxture Agent Knowledge Platform

The owner's blueprint (2026-08-18) elevates karda's positioning from "enterprise
knowledge capability domain" to **the shared knowledge infrastructure for AI
agents** - one of the five agent-infrastructure planes. Landed as
`docs/20-specs/30-agent-knowledge-blueprint.md` (positioning authority) +
`10-product-definition.md` v0.5 (statement rewrite, blueprint<->implementation
vocabulary mapping, v2/v3 roadmap alignment) + KD-017 in the register;
propagated to README / CLAUDE.md / package.json description.

**What the uplift adds to the roadmap (v2 per definition §9, no new v1 scope):**
knowledge-asset model (Fact / Claim / Entity / Event / Evidence - closes the
assertion-level provenance yucer asked in #103 Q14), Contextualization +
extraction stages in processing, Knowledge API widening (retrieve / get /
browse / find_entity / get_evidence / get_context on both channels), Atlas A2
deep-parse wiring, Web/External connectors. RAG is a mechanism, not the product
boundary; chunks are an intermediate product, not the core model.

### 2026-08-18 - provenance + seed + the Console retrieval surface

| Item | State |
|------|-------|
| Row-level provenance filled on every write path: `created_in_product` + `created_by` threaded through content-store -> upload -> write_document / create_entry / Console upload (S2S act.sub; "runos" on the Runos channel; "karda" + session sub on Console). Corrects the gap admitted in the #103 Q14 reply | done 2026-08-18 |
| TD-006 closed: preset seed invocation = `POST /api/kb/admin/seed-presets` (INTERNAL_JOB_TOKEN, idempotent). **Ops: run once against prod after the next deploy** - until then `create_entry` cannot resolve a template CODE on the live DB | done 2026-08-18 |
| Console retrieval surface `/console/search` (search + ask, recall testing per definition 5.4) | done 2026-08-18 |
| Atlas A2 deep-parse wiring | next - request-page wire format asked on #102 before building (no guessed wire shapes) |

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

## Batch 3-8 - the product build (plan from `#18`, merged 2026-07-23)

`#18` set the batch plan and it was never carried into this tracker - the file
stopped at Batch 2 while a month of work shipped (`v0.2.0` -> `v0.8.0`).
Reconstructed here from merged PRs and the live production build, 2026-08-25.

**One premise of `#18` has since been removed.** It argued Atlas gated two of the
four largest domains and that no karda-Atlas contract existed anywhere. The
contract landed (`#67`/`#68`/`#71`/`#74`/`#81`) and `karda.ask` went live
2026-07-28 (`v0.2.3`). Atlas is no longer the long pole; **the read models are**
(see Batch 9).

| # | Scope (`#18`) | State |
|---|---------------|-------|
| 3 | Domain data model - schema doc + DDL + Prisma lockstep + column locks | **done** - 22 tables, `check-data-architecture` green as a hard gate |
| 4 | Asset layer CRUD, dual templates, both state machines | **done** - Console 库/文档管理, upload -> 分级库 -> 逐库分享 + 治理开关 (`v0.2.0`) |
| 5 | Processing pipeline | **done** - 入队即处理 + 可抽干 tick (`v0.2.0`); 5b vectorize (`#105`); provenance on every write (`#108`) |
| 6 | Retrieval | **done** - 6b vector recall/rerank (`#105`); Console retrieval surface (`#108`); `karda.ask` <-> Atlas A4 live 2026-07-28 |
| 7 | Arda content channel | **blocked** - `200-arda-channel` still v0.1, awaiting the arda line (letter `30`, sent 2026-07-22) |
| 8 | Tool surface + Console | **partial** - seven-tool surface + `write_document`/`create_entry` + Console shipped; the four-domain portal shell shipped but three domains render the demo overlay (Batch 9) |

**Shipped outside `#18`'s plan** (the plan predates them, they are not scope creep):
Runos supplier channel `#106`; positioning uplift KD-017 `#107`; grant-driven
model selection KD-018 `#111`; Aliyun OSS object store KD-019 `#114`; design
system adoption KD-020 `#118`-`#120`.

## Batch 9 - the read models (in progress)

**The finding that opens this batch:** three of the four portal domains query no
database at all. `/api/channels`, `/api/evaluation`, `/api/pipeline` (+ tasks,
rebuild) were 100% demo overlay; `/api/overview` is half live. The overlay is
honestly labelled (`demoOps: true` reaches production), but the portal shell now
renders those domains as finished product - and **the more finished the shell
looks, the more expensive the mistake of reading demo as real becomes.**

Prisma holds 22 tables and none of them is a task, a call ledger, or an
evaluation run. So the batch splits by what each domain needs:

| Domain | Needs | Cost |
|--------|-------|------|
| 验证治理 (half of 验证评测) | nothing - `document.verification_state` / `entry.verification_state` exist since the baseline DDL | **done 2026-08-25** - `kb/governance/corpus-read.ts`, 8 unit tests; read by BOTH `/api/evaluation` and the 导航栏 card so they cannot disagree |
| 加工管道 (任务与队列) | a task/queue table | **DONE end to end 2026-08-25** - writes in `kb/processing/task-ledger.ts`, aggregation in `kb/processing/task-read.ts` (19 tests), `/api/pipeline/tasks` serves live with `sources: { tasks, ops }` |
| 供给通道 | a supply ledger | **DONE end to end 2026-08-25** - `kb/tools/supply-ledger.ts` writes at the one seam BOTH channels pass through; `kb/tools/supply-read.ts` aggregates; `/api/channels` serves live traffic with `sources: { traffic, registry }` |
| 质量评测 (other half of 验证评测) | eval-set + eval-run tables, and a runner | DDL + the runner; KD-011 ruled out synthetic QA generation, so sets are authored |
| 知识资产 ops figures (引用热度 / TOP 消费方) | the same supply ledger as 供给通道 | **DONE 2026-08-25** - `readAssetHeat` over 7 days of `supply_call_asset`; `/api/overview` serves it, and a seeded library's authored ops story is overridden the moment the ledger has anything real to say about it |

**Provenance contract, set by the first one done.** A page-wide `demoOps` flag
cannot survive a domain going half-live, so `EvaluationData` now carries
`sources: { corpus, steward, evaluation }` of type `FigureSource = "live" |
"demo"`, and the page's footnote renders per group. The other three payloads
adopt the same shape when their ledgers land - **do not let a section go live
under a page-wide flag**, that is how a demo figure gets read as real.

**Sequencing.** 验证治理 first because it cost no DDL. The rest landed as ONE
schema increment (`incr/0004`, authority `30-design/240-ops-read-models.md`),
executed against a throwaway Postgres on both the fresh and the live path before
merging - see 240 section 11.

**Still open in this batch**, and each for a stated reason rather than for lack
of time:

- `/api/pipeline` (加工流水) - its figures are the STEWARD's five-stage activity
  (理解/萃取/编织/验证/入藏) and its decision queue, not pipeline tasks. Those are
  a steward ledger that does not exist; the task tables cannot answer them.
- `/api/pipeline/rebuild` (受控重建) - build-then-swap rebuild jobs have no table.
  A rebuild is not a `processing_task`; modelling it as one would misreport both.
- 质量评测 - waits on an evaluation runner (240 section 8).

None of the three is blocked on DDL we chose not to write; all three are blocked
on a subsystem that does not exist yet, and each says so in its payload's
`sources` marker rather than in a comment.

---

# Phase plan, batches 10-15 (owner direction 2026-08-25)

## The finding this plan answers

A capability-by-capability audit against the industry frame (14 capability areas,
~70 features) found the platform's problem is **not** missing capability. It is
that the capability has no operator surface.

| layer | size |
|-------|------|
| capability | 32 API routes, 26 tables, 457 tests |
| monitoring - the portal's four domains | complete; read models landed in batch 9 |
| **operating - the Console** | **3 pages, 911 lines, outside the product shell** |

**Correction 2026-08-25.** An earlier version of this section said the Console
"calls 4 endpoints" and listed publish/unpublish and document verification among
capabilities with no operator entry point. Both were WRONG - the count came from
a grep that missed template-literal URLs, and the Console does surface publish
(the sharing ladder), governance toggles, verifier config and per-document
verify. It calls eight endpoints, and covers more than the first pass credited.

What is genuinely unsurfaced anywhere - no Console page, no portal page:

| Capability | Endpoint |
|---|---|
| Folder hierarchy | `/api/kb/[id]/folders`, `[folderId]` |
| Connector bindings and revoke-cascade | `/api/kb/[id]/bindings`, `[bindingId]` |
| Document preview / download | `/api/kb/[id]/documents/[docId]/download` |
| Re-verification sweep | `/api/kb/governance/sweep` |
| Queue drain / re-enqueue | `/api/kb/processing/tick` |
| Entitlement view, usage | `/api/entitlement`, `/api/usage/flush` |
| Failed-document view + retry | `processing_task` ledger (landed batch 9) |
| Processing-template config, filterable whitelist | `PATCH /api/kb/[id]` supports it; nothing calls it |

**The thesis survives the correction, and it was never mainly about missing
buttons:** the operating surface sits OUTSIDE the product shell, and the
product's primary object has no detail view inside it. Batch 10 is therefore
mostly a move, not a build - with a short list of genuinely absent surfaces
above.

### The Console is not the place to close it (owner ruling 2026-08-25)

The first cut of this plan assumed the operating surface goes into the Console.
The owner rejected the premise: apart from system configuration, this work
belongs in the product's own shell - uploading a document and reading one are
the primary act of a knowledge platform, not back-office administration.

Three findings confirm it, and the third is worse than the objection:

1. **The Console is a SECOND shell.** Its own header, and a hardcoded
   `#fafafa` background that does not follow the design system's theme at all -
   it predates the portal shell rather than living inside it.
2. **None of its three pages is configuration.** Library list + create, library
   detail + upload + sharing/governance toggles, and the 检验台 are all mainline
   work.
3. **An asset card on the 知识资产 page cannot be opened.** The page's only
   outbound links are 检验台 and 新建资产, both jumping to the Console. The
   product ruled 资产为核、首页即知识资产 - and then the asset has no detail view
   inside the product. The portal header's 设置 icon routing to `/console` is
   the same confusion admitting itself.

What is genuinely configuration barely exists in the app: OIDC and runtime
parameters are injected from the environment, the role/permission catalog is
seeded by db-init, and integration status is already its own `/status` page. The
workspace-level policy that remains (verification floor, default verifier,
connector credentials once KD-106 rules, usage and entitlement) is a SETTINGS
AREA inside the portal, not a parallel shell.

**So the Console is retired, not extended.** Batch 10 opens with the IA merge;
every batch below builds inside the portal shell.

| Console today | lands as |
|---|---|
| `/console` - library list + create | the 知识资产 page, which already lists assets: add create, and make the cards openable |
| `/console/[kbId]` - documents, upload, sharing, governance | `(portal)/assets/[kbId]` - the asset's own workspace, the product's primary object finally having a detail view |
| `/console/search` - 检验台 | `(portal)/bench` - it is already in the portal header's launcher |
| (nothing) | `(portal)/settings` - the workspace policy that is genuinely configuration; the header's 设置 icon points here instead of at `/console` |

This is an information-architecture merge, not a page port: the second header
and the hardcoded ground go away, and 911 lines get rehomed onto the shell that
already has the vocabulary, spacing, typography and theme handling
(`30-design/130-portal-shell.md`).

## Ordering principle

**Exploit before extend.** Every unsurfaced capability is sunk cost earning
nothing, and surfacing it costs no new schema and carries no integration risk.
So the UI batches come first even though the register names two deeper gaps (the
knowledge-asset model, and the missing evaluation runner) - with one exception,
noted as the parallel track below, because one of those gaps has a downstream
line already waiting on it.

A batch closes a **workflow loop for one role**, not a set of controls. A batch
that ships six buttons nobody can complete a job with has shipped nothing.

## Batch 10 - the knowledge owner can make a library correct

The primary role, and today its loop is broken at the operator layer: an owner
can create a library and upload into it, then cannot configure how it is
processed, cannot see why a document failed, cannot verify anything, and cannot
publish it - and reaches even that much only by leaving the product shell.

**Opens with the IA merge above.** The asset detail view is the batch's spine:
everything else in this table hangs off it, and it is also what makes an asset
card on the homepage finally clickable.

| Item | Backing capability | State |
|------|-------------------|-------|
| Library settings surface: processing-template picker, filterable whitelist (KD-001 cap 16), verification policy (default verifier / interval), sharing ladder | `knowledge_base` config columns, `presets.ts`, `metadata.ts` | **done 2026-08-25** |
| Failed-document view + retry / re-enqueue | `processing_task.failure_class`, `POST .../documents/[docId]/reprocess` | **done 2026-08-25** |
| Publish / unpublish | `/api/kb/[id]/publish`, `ownership.canPublish` | **done 2026-08-25** |
| Verify a document | `/api/kb/[id]/documents/[docId]/verify` | **done 2026-08-25** |
| Folder create / rename / delete | `/api/kb/[id]/folders`, `PATCH .../folders/[folderId]` | **done 2026-08-25** |
| Document preview - read the thing in place | `GET .../download?inline=1`, object store | **done 2026-08-25** |
| Retire the Console shell: rehome its three pages, drop `ConsoleHeader` and its hardcoded ground, repoint every `/console` link | - | **done 2026-08-25** |

**Landed so far (the IA merge):** `/console` -> `(portal)/assets/new`,
`/console/[kbId]` -> `(portal)/assets/[kbId]`, `/console/search` ->
`(portal)/bench`; `_lib` (api / format / ui) moved to `app/_lib` since the portal
already depended on it; `ConsoleHeader`, `console/layout.tsx` and `styles.page`
deleted - the last of those set a 920px width, its own padding and its own text
colour, and the pages using it were rendering a `<main>` INSIDE the shell's
`<main>`. Asset cards on the homepage are now links, which is the point of the
whole batch. ~90 strings localised: the Console was English-first and the product
is Chinese-first, so the merge would otherwise have shipped an English detail
view into the main product.

**Landed (the operating surface):** the asset detail view is now two tabs -
documents and settings - both built on DS. Documents: upload into a folder,
folder filter chips with counts, a pinned failure group carrying each failure
reason, in-place preview, verify, re-process, delete. Settings: sharing ladder,
processing-template picker, the filterable whitelist with its real budget,
verification policy, and the folder catalogue.

**Acceptance: MET, walked end to end 2026-08-25** against a throwaway Postgres
with the DDL baseline applied - create library, set template, upload, read in
place, see the failure and its reason, re-process, rename a folder, declare a
filterable field, publish to the workspace. Every step through the product shell,
no API client.

**"No new backend" was WRONG** (that line came from the same shallow read as the
Console-endpoint miscount corrected in #127). Four of the six items had no
reachable endpoint, so batch 10 added them - all thin, all over existing schema:

- `POST /api/kb/[id]/documents/[docId]/reprocess` - retry needed a route of its
  own. `/api/kb/processing/tick` is gated by `INTERNAL_JOB_TOKEN`, a machine
  credential, and it drains the WHOLE queue; neither fits a person clicking retry
  on one document. The transition is the state machine's (`failed -> processing`
  was already legal) and the re-run carries a new generation so it does not dedup
  against the task that just failed.
- `PATCH /api/kb/[id]/folders/[folderId]` - create and delete existed, rename did
  not. `folderNameTaken` already took an unused `exceptId` for exactly this.
- `GET/PUT /api/kb/[id]/metadata-fields` - `kb_metadata_field` had no API at all,
  so `validateMetadataFields` and the cap it enforces were unreachable. PUT
  replaces the whole set: the cap and duplicate rules are set properties, and
  `98_column_locks` revokes UPDATE on that table, so delete+insert is the only
  legal write anyway.
- `GET /api/kb/processing-templates` - the picker needs DB ids, since
  `processing_template_id` is an FK; the `PROCESSING_PRESETS` constants alone
  have nothing to PATCH with.

**No new schema.** All four are routes over tables the baseline already has.

**Two defects the walk-through caught, both invisible to type-check and tests:**

- Inline `text/plain` with no charset renders as mojibake - the browser falls
  back to the platform codepage, so a Chinese document previewed as garbage while
  the stored bytes were fine. `inlineContentType()` now states UTF-8 for text/*
  where the uploader declared none.
- DS `DialogTitle` ships `leading-none`, which resolves to `line-height: 0` under
  DS tokens (Tailwind v4 falls back to `--spacing-*`; DS registers
  `--spacing-none: 0px`). Every dialog title in every consumer is zero-height.
  Worked around locally with `leading-[1]`; **filed as TD-013 for DS.**

## Batch 11 - governance becomes operable

验证评测 is a dashboard today. The state machine, the sweep and the corpus read
model all exist; what is missing is the ability to *act* on what they show.

| Item | Backing capability | State |
|------|-------------------|-------|
| Re-verification work queue - the stale set, worked through, not counted | `queue-read.ts`, `GET /api/kb/governance/queue` | **done 2026-08-25** |
| Below-floor asset -> that library's pending-verification list | `corpus-read.belowFloor` now publishes `id` | **done 2026-08-25** |
| Trigger the sweep, and show what it changed | `POST /api/kb/governance/sweep` (session path added) | **done 2026-08-25** |
| Verification history on a document | `record.ts` over `verifier` / `verified_at` / `expires_at` | **done, but see "history" below** |

**Explicitly NOT in this batch:** the steward's pre-verification queue. The dock
renders it, but there is no steward ledger behind it - building the UI first
would make a demo figure look actionable, which is the exact failure mode the
`sources` markers exist to prevent.

**Acceptance: MET, walked end to end 2026-08-25** against a throwaway Postgres.
Three libraries (two governed, one with governance off), twelve documents seeded
across verified / lapsed / stale / unverified. Ran the sweep (1 item lapsed and
appeared at the top of the queue), worked the queue to empty, and watched
workspace coverage go **33% -> 67%** on the page and in the nav card. The number
moved, which is the whole criterion.

**What "verification history" actually is.** The plan said those three columns
back a history. They do not: each verify OVERWRITES them, so they hold exactly
one verification - the latest. Shipping a panel labelled 验证历史 over a single
row would be the same failure this batch's own plan warns about for the steward
queue. What the columns honestly support is the CURRENT RECORD with its clock
made legible - "5 天后到期" in warning tone, "已过期 30 天，待复验" - which is the
part an operator acts on. `record.ts` does that, and its name says what it is.
**Open: a real history needs an append-only `verification_event` ledger** (who /
when / from-state / to-state / by sweep-or-human). It is also what
`governance.audit` in the enterprise tier will need, and what would let the
sweep's staling be attributable at all. Owner call whether that is its own batch
or folds into 14.

**Two defects the walk-through found, both silent:**

- `KbService.update`'s runtime whitelist omitted `defaultVerifier` and
  `defaultVerifyIntervalDays`. The PATCH route read them, the service dropped
  them, and the UI reported success - so **the verification policy has never been
  savable**, from the moment that whitelist was written. With no interval nothing
  can ever expire, so the sweep could never do anything and the queue could never
  fill: batch 11's entire premise was resting on a write that silently did not
  happen. A test now pins every allowed key round-tripping.
- The 低于覆盖基线 list included libraries with governance OFF. Nothing in them
  can be verified, so the worst-covered row led to an empty queue - a dead end
  dressed as work, in the exact list this batch was making clickable. They are
  excluded from the LIST now but still count toward the coverage FIGURE.

**The coverage denominator - SETTLED (KD-208, owner 2026-08-25).** A library
with governance off keeps its content in the denominator. Coverage therefore
cannot reach 100% while any such library holds documents, and **that is the true
picture, not a defect**: those documents genuinely have not been verified. The
ruling is explicitly not to move the goalposts so the number looks better.
Consequence worth carrying forward: 覆盖率 100% must never be presented as a
target or a scorecard item - "everything that should be verified has been" is
answered by an EMPTY QUEUE, not by a percentage.

**Also landed:** `POST /api/kb/:id/entries/:entryId/verify`. The document verify
route has existed since Track 12; its twin did not, and ENTRIES ARE WHAT AGENTS
WRITE (`kb.create_entry` on the MCP/tool channel). They land unverified and count
in the coverage denominator, so without this route an agent-written entry could
drag coverage down with no way for a human to clear it - the governance ladder
that is supposed to make agent writes safe had no rung at the top.

## Batch 12 - external knowledge intake has a face

The connector framework, binding lifecycle and revoke-cascade are complete and
have zero UI. The framework carries nothing connector-specific, so whichever source lands
first is configuration rather than engineering.

**Note on coupling:** this batch is about the connector FRAMEWORK's face, not
about any one source. arda is one `connector_code` among several and is not a
dependency (KD-104); the batch ships and is useful with whatever sources exist,
including none.

| Item | Backing capability | State |
|------|-------------------|-------|
| Binding management: create, mode (backfill / incremental), pause, revoke | `BindingPanel.tsx` over the existing routes | **done 2026-08-25** |
| Revoke confirmation that states the cascade in advance | `revoke-preview.ts`, `GET .../revoke-preview` | **done 2026-08-25** |
| Sync state, cursor, last-synced, per-binding failure surface | binding row renders state / mode / cursor / last-synced | **done 2026-08-25** |

**Acceptance: MET, walked end to end 2026-08-25** against a throwaway Postgres.
Bound `arda / ops-manuals-2026` through the UI, drove a real five-document
backfill through `POST /api/connectors/ingest`, verified three of them, opened
the revoke confirmation - which stated **5 documents leaving recall, 3 of them
verified, and that the source can never be re-bound** - confirmed, and the
cascade reported the same 5. Pause and resume round-trip. Re-binding the revoked
source is refused with `binding_exists`, exactly as the dialog promised.

**The severe consequence was invisible, and it is not the document count.**
`uidx_binding_kb_connector_source` is UNIQUE over
(kb_id, connector_code, external_source_id) with **no state predicate**, and
`findBySource` matches revoked rows - so once a source is revoked from a library
it can NEVER be bound to that library again. Revoke is not "unsubscribe now,
resubscribe later"; it is permanent for that pair. Nothing in the API says so,
and an owner who learns it after clicking has learned it too late. The
confirmation now states it as plainly as the count, revoked bindings stay listed
(hiding them would make the constraint look arbitrary when it bites), and
`binding_exists` gets wording that names this cause rather than the generic 409.

**No confirm button until the cost is known.** If the preview read fails the
dialog says so and offers no way through - a confirmation over an unknown
consequence is not a confirmation.

**Also landed:** `GET /api/connectors`, the catalogue projection. The bind form
cannot offer a choice it has no way to enumerate, and the projection publishes
each connector's **degradations and I4 status**, not just its name - section 4
requires the trade-offs be explicitly accepted, which can only happen if the
owner sees them before binding.

**Coverage note.** The registry holds exactly one connector, and it is the
strongest possible declaration (notify/source/ref/list/tombstone), so the
degradation and I4-gap rendering paths have no live exercise. Pinned by unit
tests over the projection instead - including the weakest possible capability
set, which is the case that must never render as a clean bind.

## Batch 13 - the consumer-facing surface

For the other user: the agent developer deciding whether karda is worth calling.

| Item | Backing capability | State |
|------|-------------------|-------|
| 检验台 upgrade: verification_filter, library selection, citation expansion, degraded/partial disclosure | `console/search` (minimal today), retrieval chain | partial |
| Self-describing tool surface page | `/.well-known/vxture-tools` | endpoint only |
| 供给通道 drill-down by consumer; abnormal-channel diagnosis | `supply_call` ledger | ledger live, page top-level only |

**Acceptance:** an agent developer can answer "will karda give my agent good
answers, and what will it cost me" without reading our source.

## Batch 14 - the evaluation runner (the one systemic hole)

Not a UI batch. The register named this the only systemic capability hole: the
retrieval quality is the product's stated foundation, and **nothing can answer
whether a change made it better or worse**. Recall hit rate, citation precision
and grounded-answer rate are all demo figures today.

Builds the four tables designed and deliberately deferred in
`240-ops-read-models` section 8, plus the runner and the authoring UI. KD-011
already ruled out synthetic QA generation, so eval sets are authored.

**Why here and not earlier:** an evaluation runner needs a corpus somebody is
actually operating, and batches 10-12 are what produce one. Running it against a
seeded demo corpus would measure the seed.

**Acceptance:** a change to chunking, a model swap or a template edit produces a
before/after the team can read, and a regression is visible without anyone
noticing it by hand.

## Batch 15 - knowledge asset model v2

Fact / Claim / Entity / Event / Evidence as first-class objects; assertion-level
provenance; the Knowledge API widening (retrieve / get_context / get_evidence /
find_entity / browse). This is the largest design-implementation gap in the
register: the positioning was raised to "Agent 共享知识基础设施" (KD-017) and the
model behind it has not moved.

### Parallel track, starting now - not batch-ordered

Assertion-level provenance has a **downstream line already waiting**: yucer made
"据谁所说、何时、哪一版" a hard condition for external knowledge entering their
judgment path (`#103` Q14). Row-level provenance is complete and they can build
against it, but the assertion level is what they eventually need.

So the DESIGN of batch 15 runs in parallel with batches 10-13 rather than
queueing behind them - the design round trip is long, the UI batches do not
compete with it for thinking time, and leaving it until batch 15 starts means
the clock does not start for months. Implementation still lands in order.

## Outside the phases: what is blocked on other lines

None of these is scheduled, because none is ours to schedule. Each is ready and
self-verified on our side.

**Owner correction 2026-08-25: two of these were never blockers, and calling
them that was a coupling error.**

**Arda is not a dependency.** karda is a self-contained platform. `KD-104` already
ratified it - arda is ONE connector reached through the `220-connector-framework`
(an implementation-layer dependency), not a structural one, and karda closes its
own loop. The framework carries nothing connector-specific, so a different source
- or no source at all, with upload and the agent write path alone - is a complete
product. The Arda channel is now tracked as **one connector among several**, not
as a blocked requirement, and the capability register's "必须" on it was wrong.

**PDF rasterisation: not built, extension point kept (owner 2026-08-25).** Deep
parsing stays permanent-fail-for-now for MVP. That was already KD-101's ruling
("质量增强项，不是启动门"), so the Atlas A2 questions stop being a blocker and
become a roadmap item - the answer changes what we build later, not whether we
ship.

| Item | Waiting on | Since | Blocks MVP? |
|---|---|---|---|
| Runos capability registration | runos line - `runos#156`; until then the channel can receive but is never sent to | 2026-08-18 | the Runos channel only; the direct S2S channel is unaffected |
| Five plan tiers, and therefore all of C2 | **owner ruled 2026-08-25 (KD-207)**; now with the platform line - `vxture/vxture-platform#371` | 2026-08-25 | **yes - the whole commercial surface**, but no longer ours |
| Arda content channel | arda line - 5 questions | 2026-07-22 | **no** - one connector, not a dependency |
| Deep parsing (Atlas A2) | atlas line - 4 request-side questions | 2026-08-18 | **no** - scanned/complex layouts stay permanent-fail for MVP |

Only one of these blocks the product. It **was** ours; as of 2026-08-25 it is
not: owner ruled KD-207, the matrix landed in `entitlement/capability.ts` with
tests pinning the rulings, and `vxture/vxture-platform#371` carries the publish
request. C2 still resolves every workspace as unsubscribed until the platform
publishes - but nothing on the karda side is now waiting on itself.

---

## Decision track (owner)

| ID | State |
|----|-------|
| KD-201 首个 P 级知识包选型 | open |
| KD-202 private 库离职后保留期 | **ruled 2026-08-25 - 90 天** (see `20-specs/20-decisions.md` §1.1); unblocked yucer `#103` |
| KD-203 实例化/归档计量口径 | open - still blocks the platform publishing the five DRAFT plans, so C2 resolves every workspace as unsubscribed |
| KD-204 archived 保留策略 | open - now touches KD-206 (does 全域回收 reach archived snapshots?) |
| KD-205 图谱实例归属 | open, v2 |
| KD-206 客户删除请求波及已发布内容 | **ruled 2026-08-25 - 全域回收** (newly registered the same day); design landing still owed in `100-kb-model`'s content state machine |
