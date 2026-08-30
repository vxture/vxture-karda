# Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused). Path pinned by the org taxonomy section 4
(`60-operations/10-tech-debt.md`, calibrated 2026-07-22).

## 索引

每条都必须有一行 `- **Status**:`，`check-tech-debt.mjs` 在 `quality-gate` 里硬性把关。
这张表存在的理由是 2026-08-27 的一次审计：TD-007 / 008 / 009 描述的是「还没建」，
而三样东西早就建好了——条目一路追加「what is now built」却从没关闭，**于是一个照着
债务表排下一阶段的人，会把三件已完成的事当成欠账**。清单漂了就等于没有。

| ID | 状态 | 摘要 |
|---|---|---|
| `TD-001` | **open** | beta tier not yet wired |
| `TD-002` | closed 2026-07-24 | db-init applied the wrong DDL and reported success |
| `TD-003` | closed 2026-07-24 | CI did not notice a workflow it had broken |
| `TD-004` | **open** | vectorization and rerank parked on Atlas capability |
| `TD-005` | closed 2026-08-27 | ownership transfer has no runtime write path |
| `TD-006` | closed 2026-08-18 | preset seed has no invocation point |
| `TD-007` | closed 2026-08-27 | processing pipeline runtime not yet built |
| `TD-008` | closed 2026-08-27 | retrieval recall backends not yet built |
| `TD-009` | closed 2026-08-27 | tool surface backends partially wired |
| `TD-010` | closed 2026-08-30 | db-init applies increments after 97/98, so live-added columns break |
| `TD-011` | closed 2026-07-28 | main ruleset let admins bypass all checks (bypass_actors always) |
| `TD-013` | OPEN (worked around locally; filed upstream as `vxture-design`#8) | DS DialogTitle ships `leading-none`, so every dialog title is zero-height |
| `TD-014` | closed 2026-08-30 | page titles cannot follow the locale (server metadata, client locale) |
| `TD-015` | **open** | recall does not reach copies: the lineage column exists and nothing reads it |

---

Per the platform's deviation discipline (`140-repo-governance-standard.md`,
execution model): a standard clause that cannot yet be met because an upstream
dependency is not ready must be (1) annotated at the implementation site, (2)
registered here by name (clause / reason / recovery condition), and (3) reported
to the platform line. Silent deviation fails self-rectify acceptance.

Karda was instantiated from `vxture-template` after the template closed its own
two debts (the `@vxture/shared` value-domain dependency, and a vendored
health-identity implementation that deviated from standard 025), so the inherited
code is already compliant: the liveness route and the entitlement value domains
import `@vxture/shared` directly rather than re-implementing anything locally.
Those closed entries are the template's history, not karda's, and are
deliberately not carried over.

| ID | Title | Opened | Status |
|----|-------|--------|--------|
| TD-014 | Page titles cannot follow the locale: `metadata` is server-rendered, the locale preference is client-side | 2026-08-25 | **closed** 2026-08-30 - cookie-backed server locale landed exactly as the Fix section specified |
| TD-009 | Tool surface: ALL nine tools wired (list_kbs/search/ask/write_document/create_entry/create_kb/attach_kb/detach_kb + manifest); `ask` activates once `ATLAS_CHAT_PATH`/`ATLAS_ASK_MODEL` are set | 2026-07-24 | effectively closed - only runtime config (ATLAS_*) + Atlas-blocked recall quality remain |
| TD-008 | BM25 recaller built + `karda.search` wired end-to-end (2026-07-27); vector recall + real rerank built 2026-08-18 (TD-004 closure) | 2026-07-24 | open - only the PLATFORM-namespace (P-tier) visible-set C2 fill remains |
| TD-007 | Processing pipeline has no real queue worker or raw object storage yet | 2026-07-24 | open - 5a is the pure pipeline; the runtime around it is deferred |
| TD-006 | Preset seed (`seedPresets`) has no invocation point wired yet | 2026-07-24 | **closed** 2026-08-18 - internal-token endpoint `POST /api/kb/admin/seed-presets` |
| TD-005 | Ownership transfer has no runtime write path (owner_sub is column-locked) | 2026-07-24 | open - needs a privileged path |
| TD-004 | Batches 5b/6b parked: vectorization and rerank depend on Atlas A1/A3, not yet built | 2026-07-24 | **closed** 2026-08-18 - Atlas /v1 shipped A1/A3; 5b/6b built through the prepared seams |
| TD-003 | A broken workflow YAML passed all five required checks; nothing in CI reads a workflow file | 2026-07-24 | **closed** 2026-07-24 (same day) |
| TD-002 | `db-init` applied the host's deployed DDL, not the pinned one - the version pin did nothing | 2026-07-24 | **closed** 2026-07-24 (same day) |
| TD-001 | Beta tier not yet wired: development phase deploys straight to production, so the standard's second tag->env tier is dormant | 2026-07-22 | open - awaiting the beta server |

## TD-001 - beta tier not yet wired

- **Status**: open - beta tier still unwired; standing org plan, not a deviation to fix here

- **Clause not yet met**: `140-repo-governance-standard.md` section 4 - product
  repos run two tag->env tiers, `beta-*` -> beta and `v*.*.*` -> production.
- **Standing org plan, unchanged**: beta + production is the standard deployment
  model for **all** vxture products. Karda is not opting out of it. What defers
  the beta half is phase and hardware, not design.
- **Reason**: during the development phase every product deploys **straight to
  production**. Karda's production stack targets **worker-02**; beta is a
  reserved release channel that will get **its own separate server**, not yet
  prepared. Until that server exists a `beta-*` tag would route to nothing, so
  the trigger stays out - a tag prefix with no environment behind it deploys
  nothing and fails confusingly.
- **Do not infer beta's target from arda.** Arda currently runs its beta on
  worker-02 (`/srv/md1/arda-beta`, port 3231), but that stack is slated for
  teardown; karda's beta belongs on the future dedicated server.
- **Annotated at**: `.github/workflows/deploy.yml` header comment.
- **Recovery condition**: the beta server is prepared and allocated to karda.
  Then add the `beta-*` tag trigger, the beta branch of
  `detect-target-environment`, an env-aware `stack_root`/`deploy_dir` (both
  currently hardcoded to the production `/srv/md0/karda`), the `beta` GitHub
  Environment (no reviewer gate) with its own `DEPLOY_*`, and the `karda-beta`
  OIDC client (deferred in liaison letter `20-2607222338` section 3.2); close
  this entry. `vxture-arda`'s `deploy.yml` is the reference two-tier routing.
- **Interim risk accepted**: with no pre-production tier live, a `v*.*.*` tag is
  the first time code meets a real host. The required-reviewer gate on the
  `production` environment therefore carries the full weight of pre-deploy
  scrutiny, and `rollback.yml` (pulls an immutable `sha-<short>` tag) is the only
  recovery path.
- **Report to platform line**: carried by
  `docs/80-liaison/40-2607230909-karda-platform-registration-b-DONE.md`.


## TD-002 - db-init applied the wrong DDL and reported success

- **Status**: closed 2026-07-24 - db-init now verifies what it applied

- **Clause defeated**: `140-repo-governance-standard.md` section 6 - `db-init`
  carries `expected_sha` specifically to "stop a floating ref applying stale
  DDL".
- **What happened** (2026-07-24): an `apply` run pinned to `35f9020` completed
  green, yet none of the ten `karda_kb` tables existed afterwards. The remote
  script did `cd "$REPO_DIR"` and applied DDL from `/srv/md0/karda/deploy`,
  which is populated by the **deploy** rsync - at that moment still `2af1e38`,
  a 149-line baseline with zero occurrences of `karda_kb`. Every statement is
  `IF NOT EXISTS`, so applying the stale file no-opped cleanly and printed
  `done`.
- **Why it is worse than a plain bug**: the pin created false assurance. It
  governed the runner's checkout while the applied bytes came from elsewhere,
  so the one guarantee the standard asks of it was precisely the one it could
  not give. And the failure mode is silent by construction - `IF NOT EXISTS`
  means "applied the wrong file" and "applied the right file twice" look
  identical.
- **Fix**: `db-init` now tars `deploy/database/ddl` from the pinned checkout to
  a `/tmp` staging directory on the host and applies from there, leaving the
  deployed copy (owned by the deploy rsync) untouched. It also logs the SHA
  whose DDL it is applying.
- **Second layer**: a post-apply assertion compares the table set the pinned
  baseline declares against what the database actually has, and fails loudly
  listing the missing ones. Verified offline against the real baseline: 20
  declared, a simulated 10-table database is rejected.
- **Not fixed by**: asserting the host's `VERSION` matches `expected_sha`. That
  would have caught this case but permanently couples schema changes to a prior
  deploy, which is backwards - schema often has to land before the code that
  uses it.


## TD-003 - CI did not notice a workflow it had broken

- **Status**: closed 2026-07-24 - `check-workflows.mjs` is in `quality-gate`

- **What happened** (2026-07-24): the TD-002 fix turned a literal `
` inside a
  shell `printf` into a real newline, splitting one line of `db-init.yml` in two.
  YAML then read the continuation as a new top-level key and the file stopped
  parsing. **All five required checks passed** and the change merged. The break
  surfaced only when GitHub refused to dispatch the workflow, reporting that it
  "does not have a `workflow_dispatch` trigger".
- **Root cause**: none of `quality-gate` / `build` / `test-coverage` / `audit` /
  `gitleaks` reads a workflow file. CI validated the application thoroughly and
  the pipeline that runs CI not at all.
- **Why the symptom misleads**: a workflow that cannot be parsed is
  indistinguishable from one that does not exist, so the error points at a
  missing trigger rather than at a syntax error - and it appears at the moment
  you need the pipeline, not at the moment you broke it.
- **Fix**: `scripts/guardrails/check-workflows.mjs`, wired into `quality-gate`
  and exposed as `pnpm lint:workflows`. It asserts that every workflow declares
  `on:`/`jobs:` and at least one recognised trigger, rejects tab indentation, and
  checks that block scalars (`run: |`) are terminated only by a key, a list item
  or a comment.
- **A heuristic that was tried and discarded**: flagging shell lines with an odd
  number of single quotes. It caught the real break but also cried wolf on
  `sed "s/'/''/g"`, which is valid. Matching the structure rather than the
  punctuation gives zero false positives on all seven current workflows while
  still rejecting the exact injected-newline shape.


## TD-004 - vectorization and rerank parked on Atlas capability

- **Status**: open - the real remaining blocker; waits on the Atlas endpoint grant (`vxture-platform#55`)

- **What is deferred**: batch 5b (embed chunks via Atlas A1) and batch 6b
  (vector recall + unified rerank via A1/A3). Karda hosts no model runtime by
  iron rule (`110-processing` section 4), so these cannot be built locally.
- **Why it is debt, not just a schedule**: the asset and processing storage/
  orchestration layers (5a) and the non-embedding retrieval chain plus
  `karda.ask` over the live A4 (6a) proceed now, which leaves karda with a
  processing pipeline that stops before `embedding` and a retrieval chain with a
  BM25 path but no vector path. That is a real, shippable-but-incomplete state
  that must be tracked so it is not mistaken for done.
- **External status**: A4 generation is live (KD-108). A1 embedding is the hard
  block (KD-107); A3 rerank next (KD-102); A2 parsing is a quality enhancer, not
  a start gate (KD-101). Atlas is now an independent product in active
  development; requirements submitted in `80-liaison/100-2607240931`.
- **Recovery condition**: Atlas ships A1 -> 5b and the vector half of 6a/6b
  unpark in order. Nothing in karda's own code blocks them; the interfaces are
  designed against the requirements letter so the wiring is small when capability
  lands.
- **Interim shape**: 5a defines the persistence port for chunks and vector
  references (`document.storage_ref`, `chunk.vector_ref` already exist in the
  schema) so vectorization is an implementation behind a stable seam, not a
  redesign.
- **CLOSED 2026-08-18**: Atlas's `/v1` consumption face shipped all four
  capabilities (chat/embed/rerank/parse - the Atlas interface doc, v0.24.0), so
  5b/6b were built exactly through the prepared seams: `AtlasEmbedClient`
  (A1) behind the orchestrator's `EmbeddingClient` port, vector persistence in
  `karda_kb.chunk_embedding` (ADR-002, written atomically with the chunk-version
  commit), `VectorRecaller` as the chain's second recaller (cosine, KD-107 model
  lock, self-degrading to lexical-only), and `AtlasReranker` (A3) behind the
  `Reranker` port with the existing degrade contract. Parked documents resume via
  `POST /api/kb/processing/tick {"resume": true}`. Activation is configuration,
  not code: `ATLAS_EMBED_MODEL` (+ per-KB `embedding_model`) and
  `ATLAS_RERANK_MODEL|ENDPOINT` on the host, plus Atlas-side grants for the
  chosen models (A1 currently serves Zhipu-family embedding models only). The
  A2 deep-parse path stays permanent-fail-for-now by choice (quality enhancer,
  KD-101), tracked in the workplan rather than here.

## TD-005 - ownership transfer has no runtime write path

- **Status**: closed 2026-08-27 - the privileged path exists (`deploy/database/ops/transfer-kb-owner.sql`); the column lock is UNCHANGED

- **What is missing**: `KbService` exposes `canTransfer` (the permission check)
  but no transfer write. `owner_sub` is column-locked (`98_column_locks`), so the
  service role cannot reassign a library's owner.
- **Why it is deliberate, not an oversight**: reassigning a departed user's
  library is an administrative act (definition 4.6: the home WS admin transfers).
  Handing that write to the runtime service role would mean widening the column
  lock to grant a capability the governance design withholds on purpose. The gap
  is the correct state; what is missing is the privileged path that performs it.
- **Recovery condition**: a db-init-style or admin-scoped operation that runs as
  the DB owner (not the service role) to set `owner_sub`, gated like other
  privileged structure/data changes. Small; deferred only because no departure/
  transfer flow is exercised in v1 yet.

- **CLOSED 2026-08-27.** The recovery condition asked for "a db-init-style or
  admin-scoped operation that runs as the DB owner (not the service role) to set
  `owner_sub`". That now exists: `deploy/database/ops/transfer-kb-owner.sql`,
  with the runbook at `docs/60-operations/50-run-transfer-kb-owner.md`.
  **The column lock was not widened** - which was the whole point of the entry.
- **Verified on a real database**, all five branches: transfer, a re-run of the
  same transfer (idempotent, and it does NOT report "transferred" when nothing
  moved), non-user tier, empty `new_owner`, missing library. The four refusals
  `RAISE EXCEPTION` inside the transaction, so the row is unchanged after each.
- **What this closing does NOT claim.** The path is gated by *possession of the
  owner DSN and the judgement of the person holding it* - not by a workflow with
  an approver. "Only the home workspace admin may transfer" is stated in
  `canTransferOwnership` and enforced by **nobody at runtime**, because an
  operator is not a session. The runbook says so in its own first section rather
  than leaving it to be discovered. Turning that into a machine gate means
  wrapping the script in a workflow with an environment reviewer; that is a
  separate, optional hardening and is deliberately not implied by this closure.
- **A related fact worth recording rather than fixing**: `canTransfer` on
  `KbService` still has no caller. It is the app-side half - who may ASK - and
  there is no departure flow in the product to call it from yet. Built, tested,
  unwired, on purpose; the same category as `140-assertion-model` section 11.3.

## TD-006 - preset seed has no invocation point

- **Status**: closed 2026-08-18 - `POST /api/kb/admin/seed-presets`; **still never run against production**

- **What exists**: `seedPresets()` (app/kb/lib/seed.ts) idempotently inserts the
  six processing presets and three content presets (FAQ/glossary/SOP, KD-002)
  via ON CONFLICT DO NOTHING. Fully unit-tested at the data level (9 tests).
- **What is missing**: nothing calls it in production. The templates are factory
  product data, so an empty karda_kb has no presets until something runs the
  seed.
- **Why deferred, not decided now**: the invocation point is a real choice with
  trade-offs - an app-startup hook (simple, but runs on every boot and needs a
  lock to avoid a thundering-herd insert across replicas), a one-shot admin/
  db-init step (explicit and gated, matches how structure changes ship), or a
  first-request lazy seed (no extra machinery, but couples seeding to traffic).
  It is not worth picking under time pressure while the surrounding admin surface
  does not exist yet.
- **Why idempotency was built in first anyway**: whichever invocation wins, it
  will re-run - a startup hook every boot, db-init every apply - so INSERT-only
  seeding against the unique keys is the correct shape regardless, and building
  it now means the wiring later is a one-line call, not a redesign.
- **Recovery condition**: the admin/console surface (batch 8) or a db-init seed
  step decides how factory data is applied; wire `seedPresets` into it.
- **CLOSED 2026-08-18**: the "explicit and gated" option won -
  `POST /api/kb/admin/seed-presets`, INTERNAL_JOB_TOKEN-gated (the tick/sweep/
  flush posture), 503 when no database is configured. Idempotent by
  construction, so the deploy runbook can hit it once per environment (or on
  every deploy) safely. Chosen over the startup hook (per-boot writes + replica
  herd) and over a db-init step (factory DATA is not schema STRUCTURE; db-init
  stays structure-only). Ops note: run it once against prod after the next
  deploy - until then the live DB has no preset templates and `create_entry`
  cannot resolve a template CODE.


## TD-007 - processing pipeline runtime not yet built

- **Status**: closed 2026-08-27 - runtime built (audit at the end of batch 15)
- **CLOSED 2026-08-27** (register audit at the end of batch 15). The runtime this
  entry says is "not yet built" has been built for months: `processing/queue.ts`,
  `worker.ts`, `runtime.ts` and `orchestrator.ts` all exist, `POST /api/kb/processing/tick`
  drains the queue, and batch 15 added a SECOND pass beside it (`extraction/tick`,
  KD-211). The entry kept accumulating "what is now built" notes and was never
  closed - so a reader planning the next phase would have counted it as debt.

- **What exists (5a)**: the pure pipeline - the five-stage model, idempotency
  key, failure taxonomy, queue-tier routing, the fast-path parser to element-tree
  IR, `general` chunking, and an orchestrator that runs a document through
  fetch/parse/chunk/embed/commit against injected ports. Fully tested (28 tests).
- **What is now built** (2026-07-24): object storage behind `storage_ref` (the
  document-upload path); and the **queue + worker** - the three tiers with the
  org concurrency cap and per-KB serial window, and the worker that runs the
  pipeline and maps its result onto the document state (indexed / failed) or
  parks it (suspend). 24 tests. The worker already handles the embed-unavailable
  path: it suspends, so a document flows through fetch/parse/chunk and parks,
  losing nothing.
- **Chunk-commit is built and LIVE** (2026-07-24): the atomic-replace
  CommitTarget writes a new chunk version, flips document.active_chunk_version,
  and drops superseded versions in one transaction, so retrieval never sees a
  half-update. Verified on real Postgres, including the live-migration incr and
  the two-versions-coexist unique key; the versioning migration is applied to
  `vxturebiz_karda_prod` (db-init run `30086025097`).
- **Production wiring - now partly built** (2026-07-24): `processing/runtime.ts`
  assembles the pure core into a runnable system - a process-wide singleton
  **queue**, a **DocumentSink** over ContentService (indexed / failed, swallowing
  the deleted-mid-flight race), a per-task **resolver** (raw text over object
  storage + the A1 stub embedder + the Prisma commit target), **enqueue-on-upload**
  (the documents POST route enqueues on a successful create), and an
  internal-token-gated **tick endpoint** (`POST /api/kb/processing/tick`, same
  posture as `/api/usage/flush`) that drains one bounded pass. 8 tests over the
  pure pieces; the impure singleton is the one untested edge, by design.
- **What is still deferred**: (1) IR persistence so a resume skips re-parsing;
  (2) an external scheduler (host cron / platform) actually calling `tick` on an
  interval - the endpoint exists but nothing drives it yet (it now also accepts
  `{"resume": true}` to wake the parked fleet). (3) is partly resolved
  2026-08-18: the resolver now sources `embedding_model` from the KB row with an
  `ATLAS_EMBED_MODEL` fallback; `processing_params` still defaults, and the
  config fingerprint at enqueue time still passes `embeddingModel: null` (a
  model change does not yet re-fingerprint - acceptable while the model is
  workspace-uniform, revisit when per-KB models diverge).
- **What is Atlas-blocked, separately (TD-004)**: the embed stage's real client
  (A1) and deep-path parsing (A2). The orchestrator already handles their absence
  correctly - deep parse parks as permanent-for-now, embed suspends and resumes -
  so wiring the real clients later changes nothing about the control flow.
- **Recovery condition**: a task-runner increment builds the worker + storage +
  state wiring; independently, Atlas A1/A2 replace the stubs. Neither blocks the
  other, and both plug into seams that already exist and are tested.


## TD-008 - retrieval recall backends not yet built

- **Status**: closed 2026-08-27 - backends built; ACTIVATION still waits on TD-004
- **CLOSED 2026-08-27** (register audit). The recall backends exist:
  `retrieval/bm25.ts`, `corpus.ts`, `vector-corpus.ts`, wired into the tool surface
  through `buildToolBackends()`.
- **What is NOT closed by this, and is tracked elsewhere**: vector recall produces
  nothing until chunks have embeddings, and embeddings wait on the Atlas endpoint
  grant - see TD-004 and `docs/60-operations/40-run-atlas-endpoint-grants.md`.
  "Backend built" and "backend serving results" are different claims; this entry
  only ever made the first one.

- **What exists (6a)**: the full evaluation chain as pure logic over injected
  ports - scope resolution with the whitelist floor, the visible-set cache
  (event-invalidation + TTL), RRF fusion, the unified-rerank step with its
  degrade contract, and `karda.ask` grounding a single-turn cited answer over
  the LIVE Atlas A4. 37 tests, including the security-critical ones: the
  whitelist is enforced at the recall boundary AND holds through both degrade
  paths (rerank-unavailable and namespace-partial).
- **BM25 recaller is now built (2026-07-27)**: `bm25.ts` is a pure Okapi BM25
  (BM25+ IDF, k1=1.5/b=0.75, tokenize + IDF + TF-saturation + length-norm),
  `corpus.ts` is the `RecallCorpus` port (in-memory + Prisma over the `indexed`
  chunks of a document's active version + `indexed` entries - the hard recall
  filter lives in the query), and `bm25-recaller.ts` implements the `Recaller`
  port, applying the verification quality tier on top. 12 tests. Until Atlas A1
  commits chunks the chunk side is empty by construction, but the engine + path
  are live, not stubbed.
- **`karda.search` is now wired end-to-end (2026-07-27)**: `visible-set.ts` feeds
  the ORG-namespace visible set from karda's own publish-state/ownership (local +
  cached, TTL + invalidation - authoritative for own libraries, self-contained),
  `search-tool.ts` composes scope (visible INTERSECT attachment, kb_ids narrows) +
  the BM25 recaller + the degrading rerank and meters `karda.search` per call, and
  the tools route injects it - so dispatch returns a real search (empty until
  content indexes / a library is attached, which is correct, not a leak).
- **`karda.ask` is now wired (2026-07-27)**: `generation.ts` is the Atlas A4
  client (POST over the internal platform base + `x-vxture-internal-auth`, the same
  transport as C2/C3; egress-guarded), `corpus.ts` gained a `RecallTextResolver`
  (id -> grounding text), and `ask-tool.ts` composes scope + BM25 + the A4 client
  via `runAsk`, metering `karda.ask` only when a grounded answer is generated. The
  route injects it **only when the client is configured**, so ask is honestly
  `not_implemented` until the owner sets `ATLAS_CHAT_PATH` + `ATLAS_ASK_MODEL` (the
  endpoint path and model code live in the platform's `40-model-platform.md`, not
  in karda's repo). With those set, ask runs against the live A4.
- **Vector recall + real rerank are now built (2026-08-18, TD-004 closure)**:
  `vector-corpus.ts` (the `VectorCorpus` port over `karda_kb.chunk_embedding`,
  active-version indexed chunks only) + `vector-recaller.ts` (cosine ranking
  under the KD-107 model lock, self-degrading to [] so an Atlas outage yields
  lexical-only search, never a namespace failure) join the chain as the second
  recaller; `atlas/rerank.ts` implements the real `Reranker` (A3, candidate cap
  100, order-only scores). Both wire per-request in search-tool/ask-tool when
  `ATLAS_EMBED_MODEL` / `ATLAS_RERANK_*` are configured.
- **What is still deferred**: the PLATFORM-namespace (P-tier) visible set needs
  the C2 fetch (the org namespace is local and done).
- **Recovery condition**: the C2 visible-set fill lands for the platform
  namespace; everything else in this entry is done.


## TD-009 - tool surface backends partially wired

- **Status**: closed 2026-08-27 - all twelve tools have backends
- **CLOSED 2026-08-27** (register audit). Every tool has a backend:
  `buildToolBackends()` supplies all twelve, and `dispatch.ts` has a case for each.
  The entry still said "the seven descriptors" - the surface has grown to twelve
  (`get_evidence` / `find_entity` / `get_context` / `browse` landed in batch 15),
  which is how far the text had drifted from the code.
- The authoritative list is now `docs/30-design/260-external-interfaces.md` section 3,
  with `check-interface-register.mjs` failing CI if it disagrees with the catalog.

- **What exists**: the full `karda.*` contract face - the seven descriptors,
  `/.well-known/vxture-tools` (S2S-authenticated, tailnet only), the S2S gateway
  (RS256 + aud=karda + the act.sub / OBO-only / no-internal-auth refusals), and
  dispatch with the mode gate. `karda.list_kbs` is fully wired to KbService.
  32 tests.
- **`write_document` is now wired (2026-07-24, track 9a)**: an OBO call captures
  a document into a library and enqueues it on the shared runtime queue (the same
  path as the HTTP upload, reusing `uploadDocument` + `enqueueForDocument`), so a
  tool-written and a Console-uploaded document are indistinguishable downstream.
  Inline `content` only for now; `file_ref` ingestion returns not_implemented.
- **`create_entry` is now wired (2026-07-26, track 9b)**: an OBO call resolves the
  template CODE it is given (faq / glossary / sop) to the seeded `content_template`
  row via a `TemplateResolver` (preset-only offline, Prisma over the seeded row
  when a DB is attached - no DDL, the table already exists), validates the field
  map against the template contract, and writes the entry in `draft`. Submitting a
  draft into the index is a separate, not-yet-built entry-processing path (parallel
  to the document pipeline, A1-blocked either way), so v1 stops at the durable
  draft.
- **Per-doc metering is now emitted (2026-07-26)**: both `write_document` and
  `create_entry` record a `karda.ingest` counter into the local usage buffer on a
  successful capture, attributed to the library's owning workspace (110-processing
  5) and idempotent on the new row id (a 409 duplicate never reaches the emit, and
  a re-emit cannot double-count). Best-effort - a buffer hiccup never fails the
  write, since the row is already durable.
- **`create_kb` / `attach_kb` / `detach_kb` are now wired (2026-07-27, track 9b)**:
  a new `kb_attachment` table (`(workspace, user, product, kb)`, insert/delete
  only) backs a user's per-product attachment list. `create_kb` makes a user-owned
  library and auto-attaches it; `attach_kb` adds a VISIBLE library (owned, or
  published to ws/org - a private library owned by another reads not_found);
  `detach_kb` is idempotent. **Pending: the production db-init.** The DDL is staged
  (`00_baseline.sql` + `incr/0002_kb_attachment.sql` with the service-role grant
  travelling in the increment per TD-010; guardrail at 21 tables), but until
  `db-init.yml` applies `0002` to the prod DB (gated: `confirm=yes` + `expected_sha`
  + approval), the Prisma path has no table - so these three tools 500 against a
  live DB until that apply runs. Offline/in-memory is green.
- **What is deferred**: `search` / `ask` need a recall backend (TD-008) to return
  anything real, so dispatch returns not_implemented rather than an
  empty-but-successful result. All still pass the mode gate (a service call is
  correctly refused).
- **Why the gate ships before the backend, deliberately**: the OBO-only refusal
  is an authorization guarantee, not plumbing. A service-mode call to a write
  tool is denied today, so the security contract is complete even though the
  write path is not - and a test asserts the 403 holds regardless of backend
  presence. Wiring each backend later is a one-line addition at a seam dispatch
  already routes through.
- **Recovery condition**: search/ask unblock when TD-008's BM25 + C2 fill land
  (ask already works end-to-end for grounding+A4, it just needs recall to feed
  it); `write_document` / `create_entry` are wired; `create_kb` / `attach_kb` /
  `detach_kb` are wired and unblock in production once the `kb_attachment` db-init
  (`incr/0002`) is applied.


## TD-010 - db-init applies increments after 97/98, so live-added columns break

- **Status**: **closed 2026-08-30** - the ordering itself is fixed:
  `baseline -> 97 -> incr/* -> 98` (previously 98 ran before the increments).
  Increments run after 97 because they GRANT to the service role 97 creates;
  98 runs LAST because it grants on the FULL column set, which on a live DB only
  exists once the increments have run. Changed in `db-init.yml` and
  `deploy/database/apply.sh` (apply-local-dev.sh untouched - it is baseline-only
  for fresh DBs by design). Verified against real Postgres 18 by replaying the
  exact v0.10.0 production trajectory: v0.9.0-shaped DB -> old order dies in 98
  on `source_mode` (and leaves knowledge_base with ZERO UPDATE column-grants,
  i.e. the degraded state production sat in until the re-run) -> new order
  repairs (column added, 16 UPDATE grants restored) -> fresh-DB path clean ->
  UPDATE grant sets byte-identical live-vs-fresh.
- **The third bite forced the closure** (2026-08-30, v0.10.0 db-init run
  33290491337): 98's `GRANT UPDATE (... source_mode ...)` ran before
  `incr/0009` added the column. #178 (baseline index) and #153 (grant only in
  the increment) were the first two bites; each got a tactical patch while the
  ordering stayed. Three failures of the same predicted class is the register
  saying the tactical fixes were interest payments on an unpaid principal.
- (superseded by the closure above - kept as history:)
- **Still open, and it bit us on 2026-08-26** (`vxture-karda#153`): the
  `active_chunk_version` UPDATE grant lived only in `incr/0001`, so every MIGRATED
  database had it and every FRESHLY INITIALISED one did not - the atomic chunk swap
  failed with `permission denied for table document` and no document could ever
  become retrievable. That is exactly the failure shape this entry predicts.
  Mitigated by mirroring the grant into `98_column_locks.sql` AND by extending
  `check-data-architecture.mjs` to fail when an increment carries a grant that 98
  does not - so the class is now caught even though the ordering is unchanged.

- **Clause strained**: `140-repo-governance-standard.md` section 6/7 - the DDL
  applier (`deploy/database/apply.sh`, mirrored in `db-init.yml`) is inherited
  from `vxture-template` and applies `00_baseline.sql -> 97_service_role.sql ->
  98_column_locks.sql -> incr/*.sql`. The increments run LAST.
- **What happened** (2026-07-24): the chunk-versioning migration (#38) added
  `document.active_chunk_version` and `chunk.version`. On a fresh DB the baseline
  creates those columns, so everything downstream sees them. But on the LIVE
  production DB the tables predate versioning, so `CREATE TABLE IF NOT EXISTS`
  no-ops and the columns do not exist until `incr/0001` runs - which is AFTER
  baseline and after `98`. Two statements referencing the not-yet-existing
  columns therefore failed in sequence across two apply runs: first baseline's
  standalone `CREATE INDEX idx_chunk_active ... (version)` (run 30079362140),
  then `98`'s `GRANT UPDATE (... active_chunk_version ...)` (run 30082017288).
- **Root cause, generalized**: any statement that db-init runs *before* the
  increments (baseline standalone statements, and every GRANT in `98`) must not
  reference a column that an increment adds, because on a live DB that column is
  not there yet. The class is structural, not a one-off typo.
- **Tactical fix (in this repo, in-zone)**: guard baseline's index on column
  existence, and move the increment-added column's GRANT out of `98` and into
  the increment that adds it (`incr/0001`), leaving a pointer comment in `98`.
  Verified against real Postgres 18 across the full `baseline -> 97 -> 98 ->
  incr` sequence on both a live (pre-versioning) and a fresh DB. See
  `deploy/database/ddl/incr/README.md`.
- **Systemic fix (belongs upstream, NOT diverged here)**: reorder the inherited
  applier to `baseline -> incr/* -> 97 -> 98`, so role and column-locks always
  run against the final structure and the whole class disappears. The applier is
  template-inherited/rigid (`apply.sh` + `db-init.yml`), so per the working
  agreement this ordering must be fixed in the platform/template repo first, then
  mirrored - reported to the platform line, not changed unilaterally in a product
  repo.
- **Recovery condition**: closed when the platform reorders the applier and karda
  mirrors it; at that point the per-column guards/relocations added here become
  redundant belt-and-suspenders and MAY be simplified, but are harmless to keep.


## TD-011 - main ruleset let admins bypass all checks (bypass_actors always)

- **Status**: closed 2026-07-28 - `bypass_actors: []`, verified 2026-08-27
- **CLOSED 2026-08-27** (register audit; the fix itself landed 2026-07-28).
  `docs/50-deployment/rebuild/main-ruleset.json` carries `bypass_actors: []`,
  verified while auditing. CLAUDE.md states the rule as standing ("MUST stay empty";
  break-glass is an editable ruleset, not an invisible per-push exemption), so the
  guarantee survives this entry closing.

- **Clause strained**: this repo's own working agreement - "Direct `git push
  origin main` is BLOCKED by the ruleset (must go through a PR, and the required
  checks must pass)" - and the absolute secret-hygiene rule ("credentials never
  committed"), since `gitleaks` and `audit` are in the required set.
- **What was wrong**: `main-protection` (ruleset `19556856`) and the reference
  artifact `docs/50-deployment/rebuild/main-ruleset.json` both carried
  `"bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole",
  "bypass_mode": "always" }]` - `actor_id 5` = repo admin, `always` = bypass in
  every situation including a direct push. So for any admin, PR-required, the five
  required checks (incl. `gitleaks`/`audit`), linear history, no force-push, and
  no deletion were all advisory. "Merged via PR with green checks" and "pushed
  around the rules" were indistinguishable in history. Not a karda-specific
  mistake: the org bootstrap reference carried it, so every repo inherited it
  (surfaced org-wide by `vxture-atlas`, filed here as `vxture-karda`#82).
- **Fix applied (2026-07-28)**: set `bypass_actors: []` in both the live ruleset
  (`gh api -X PUT .../rulesets/19556856`) and the repo artifact, so the two do not
  drift. Verified: live `bypass_actors` is `[]`; all five required checks + PR /
  linear-history / no-deletion / no-force-push rules intact; enforcement active.
  `CLAUDE.md` now states `bypass_actors` must stay empty so it is not quietly
  reintroduced. Break-glass preserved: an admin can still edit/disable the ruleset,
  but that is a recorded config change with an actor + timestamp, not an invisible
  per-push exemption.
- **Upstream note**: the reference `main-ruleset.json` that all org repos bootstrap
  from is the real root cause - fixing repos without fixing the reference resets
  the clock. Tracked org-wide at `vxture-platform`#167; karda's local copy is now
  clean regardless.
- **Recovery condition**: closed - fixed in the live ruleset and the artifact;
  standing rule recorded in `CLAUDE.md`.

## TD-013 - DS DialogTitle ships `leading-none`, so every dialog title is zero-height

- **Status**: OPEN (worked around locally; filed upstream as `vxture-design`#8)
- **Scope**: `@vxture/design-system` 6.5.1 -> every consumer, not just karda.
- **Symptom**: a `DialogTitle` renders in the accessibility tree with the right
  text and the right colour, and is completely invisible on screen. Measured
  height is exactly 0.
- **Cause**: DS's `DialogTitle` carries `text-lg font-semibold leading-none
  tracking-tight`. Under Tailwind v4 a `leading-*` utility with no matching
  `--leading-*` token falls back to the `--spacing-*` scale, and DS registers
  `--spacing-none: 0px` - so `leading-none` compiles to `line-height: 0` rather
  than the Tailwind-default `1`. This is the same trap already recorded for
  product code; the new part is that it is inside a DS component, where a
  consumer cannot see it and will not think to look.
- **Why it survived**: nothing catches it. It type-checks, it renders in the DOM,
  it is present and readable to a screen reader, and it passes every test we
  have. Only a screenshot shows the title is missing - which is how it was found
  (batch 10 document preview, 2026-08-25).
- **Local workaround**: `<DialogTitle className="... leading-[1]">` in
  `(portal)/assets/[kbId]/DocumentPanel.tsx`, with a comment pointing here.
- **Fix upstream**: in DS, either drop `leading-none` from `DialogTitle` (and
  audit the other components using it) or register `--leading-none: 1` in
  `@vxture/design-tokens` so the utility resolves to what its name means. The
  second is the better fix: it repairs every current and future use at once, and
  `leading-none` meaning `line-height: 0` is a trap no consumer will expect.
- **Recovery condition**: DS ships a build where `DialogTitle` has a non-zero
  line-height; then remove the `leading-[1]` override and this entry.

## TD-014 - page titles cannot follow the locale (server metadata, client locale)

- **Status**: **closed 2026-08-30** - implemented exactly as the Fix section below
  specified: `LocaleProvider` mirrors the preference into a `karda-locale` cookie
  (on every switch AND once on mount, so existing users migrate without
  re-toggling); `_i18n/server-locale.ts` reads it in `generateMetadata`
  (`pageTitle()`, all 16 pages converted) and in the root layout, so
  `<html lang>` is correct from the first byte. The guard name and cookie name
  live in one shared module (`locale-cookie.ts`) because server and client must
  agree on both.
- **Symptom**: with the language set to `en-US`, every page renders correctly
  except its browser-tab title, which stays Chinese (`资产详情 - Karda`).
- **Cause**: the locale is a client preference. `LocaleProvider` reads it from
  `localStorage` and stamps `<html lang>`; nothing about it exists on the server.
  Next's `export const metadata` is evaluated server-side, so it has no locale to
  read and the title is authored as a literal.
- **Why it is not simply swept**: there is nowhere to sweep it *to*. A catalog
  lookup needs a locale, and the request does not carry one. This is a shell
  change, not a translation change.
- **Fix**: persist the preference in a cookie alongside `localStorage`, read it
  in `generateMetadata` (and eventually in the root layout, so `<html lang>` is
  correct on first paint rather than after hydration). The cookie is also what
  would let the server render the correct language without a flash.
- **Contained by** (revised 2026-08-26): the titles no longer hold a product
  string at all. Each `page.tsx` reads its words from the catalog and resolves
  them at `BRAND.defaultLocale`, so the seam guard's `EXEMPT` list is **empty**
  and the debt is one locale argument in five files. It was two exempted files
  and about to become five, which is what showed the containment was wrong.
- **Recovery condition**: a server-readable locale exists and replaces
  `BRAND.defaultLocale` in those five `metadata` blocks. Nothing else moves.

## TD-015 - recall does not reach copies: the lineage column exists and nothing reads it

- **Status**: open. Raised the moment KD-212 was ruled (2026-08-27), not
  discovered later - which is the only reason it is a debt entry and not an
  incident.
- **Symptom**: a customer deletion request recalls the source library and leaves
  every INSTANCE and archived snapshot of it standing. Nothing reports this;
  the recall reports success, because from its own point of view it succeeded.
- **Cause**: `knowledge_base.origin_kb_id` and `origin_snapshot_at` are in the
  baseline and carry the comment *P-tier instantiation lineage*, so the handle
  for finding copies has been there all along - but **no application code reads
  either column**. Recall walks the library it was given and stops.
- **Why it is a debt and not a bug**: until KD-212 (owner 2026-08-27) it was an
  open question whether recall SHOULD penetrate copies. The behaviour matched an
  undecided spec. The ruling is what turned it into missing work.
- **Fix**: make recall lineage-aware - from the recalled library, follow
  `origin_kb_id` to every instance and snapshot and bring them into scope. No DDL
  is needed; the columns are already there and `check-data-architecture` keeps
  them in lockstep.
- **What must NOT be done in the meantime**: do not describe recall as
  penetrating copies. `140-assertion-model` §7.1 states plainly that until this
  lands, **recall does not reach copies** - the gap between "ruled" and
  "implemented" is exactly the difference a customer would ask about.
- **Interaction with KD-204**: none. KD-204 governs TIME (nothing is cleared just
  because it aged); KD-212 governs REQUESTS. The two only looked like they
  collided because both said "clear" without naming the trigger.
