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

## Decision track (owner)

| ID | State |
|----|-------|
| KD-201 首个 P 级知识包选型 | open |
| KD-202 private 库离职后保留期 | **ruled 2026-08-25 - 90 天** (see `20-specs/20-decisions.md` §1.1); unblocked yucer `#103` |
| KD-203 实例化/归档计量口径 | open - still blocks the platform publishing the five DRAFT plans, so C2 resolves every workspace as unsubscribed |
| KD-204 archived 保留策略 | open - now touches KD-206 (does 全域回收 reach archived snapshots?) |
| KD-205 图谱实例归属 | open, v2 |
| KD-206 客户删除请求波及已发布内容 | **ruled 2026-08-25 - 全域回收** (newly registered the same day); design landing still owed in `100-kb-model`'s content state machine |
