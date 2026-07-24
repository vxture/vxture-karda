# Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused). Path pinned by the org taxonomy section 4
(`60-operations/10-tech-debt.md`, calibrated 2026-07-22).

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
| TD-009 | Tool surface: write/create/attach tools gate correctly but their backends are not wired; search/ask not injected | 2026-07-24 | open - depends on TD-007/008 backends |
| TD-008 | Retrieval has no real BM25 engine or vector recall yet; chain runs over injected recallers | 2026-07-24 | open - 6a is the eval chain; recall backends deferred / Atlas-blocked |
| TD-007 | Processing pipeline has no real queue worker or raw object storage yet | 2026-07-24 | open - 5a is the pure pipeline; the runtime around it is deferred |
| TD-006 | Preset seed (`seedPresets`) has no invocation point wired yet | 2026-07-24 | open - seed mechanism undecided |
| TD-005 | Ownership transfer has no runtime write path (owner_sub is column-locked) | 2026-07-24 | open - needs a privileged path |
| TD-004 | Batches 5b/6b parked: vectorization and rerank depend on Atlas A1/A3, not yet built | 2026-07-24 | open - awaiting Atlas capability |
| TD-003 | A broken workflow YAML passed all five required checks; nothing in CI reads a workflow file | 2026-07-24 | **closed** 2026-07-24 (same day) |
| TD-002 | `db-init` applied the host's deployed DDL, not the pinned one - the version pin did nothing | 2026-07-24 | **closed** 2026-07-24 (same day) |
| TD-001 | Beta tier not yet wired: development phase deploys straight to production, so the standard's second tag->env tier is dormant | 2026-07-22 | open - awaiting the beta server |

## TD-001 - beta tier not yet wired

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
  `docs/80-liaison/40-2607230909-karda-platform-registration-b.md`.


## TD-002 - db-init applied the wrong DDL and reported success

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

## TD-005 - ownership transfer has no runtime write path

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


## TD-006 - preset seed has no invocation point

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


## TD-007 - processing pipeline runtime not yet built

- **What exists (5a)**: the pure pipeline - the five-stage model, idempotency
  key, failure taxonomy, queue-tier routing, the fast-path parser to element-tree
  IR, `general` chunking, and an orchestrator that runs a document through
  fetch/parse/chunk/embed/commit against injected ports. Fully tested (28 tests).
- **What is deferred**: (1) a real queue worker driving the three tiers with the
  org-level concurrency cap and per-KB serial window; (2) persisting stage
  products (the IR) so a resume skips re-parsing; (3) wiring the orchestrator's
  result onto the document content-state via ContentService. **Object storage is
  now built** (2026-07-24, the document-upload path): `document.storage_ref`
  points at karda's own filesystem-backed object store, so an uploaded document
  persists and is downloadable today - what remains is triggering the pipeline on
  it, which is the queue worker above. These are runtime scaffolding
  around a tested core, deferred so the core could be verified in isolation
  first.
- **What is Atlas-blocked, separately (TD-004)**: the embed stage's real client
  (A1) and deep-path parsing (A2). The orchestrator already handles their absence
  correctly - deep parse parks as permanent-for-now, embed suspends and resumes -
  so wiring the real clients later changes nothing about the control flow.
- **Recovery condition**: a task-runner increment builds the worker + storage +
  state wiring; independently, Atlas A1/A2 replace the stubs. Neither blocks the
  other, and both plug into seams that already exist and are tested.


## TD-008 - retrieval recall backends not yet built

- **What exists (6a)**: the full evaluation chain as pure logic over injected
  ports - scope resolution with the whitelist floor, the visible-set cache
  (event-invalidation + TTL), RRF fusion, the unified-rerank step with its
  degrade contract, and `karda.ask` grounding a single-turn cited answer over
  the LIVE Atlas A4. 37 tests, including the security-critical ones: the
  whitelist is enforced at the recall boundary AND holds through both degrade
  paths (rerank-unavailable and namespace-partial).
- **What is deferred**: a real BM25 engine behind the `Recaller` port (the text
  index over indexed chunks/entries), and the C2 visible-set fetch that fills the
  cache. These are backends behind seams the chain already drives and tests.
- **What is Atlas-blocked, separately (TD-004)**: vector recall (a second
  `Recaller`, needs A1 embeddings) and the real reranker (A3). The chain already
  fuses whatever recallers it is given and already degrades correctly when the
  reranker is absent, so both plug in without changing the chain.
- **Recovery condition**: a search-backend increment builds BM25 + the C2 cache
  fill; independently, Atlas A1/A3 add vector recall and rerank. `karda.ask` is
  the one retrieval surface that works end-to-end today, because A4 is live -
  only its recall quality improves as the backends land.


## TD-009 - tool surface backends partially wired

- **What exists**: the full `karda.*` contract face - the seven descriptors,
  `/.well-known/vxture-tools` (S2S-authenticated, tailnet only), the S2S gateway
  (RS256 + aud=karda + the act.sub / OBO-only / no-internal-auth refusals), and
  dispatch with the mode gate. `karda.list_kbs` is fully wired to KbService.
  32 tests.
- **What is deferred**: `search` / `ask` are not injected into the route's
  backends yet - they need a recall backend (TD-008) to return anything real, so
  dispatch returns not_implemented rather than an empty-but-successful result.
  `create_kb` / `attach` / `detach` / `write_document` / `create_entry` pass the
  mode gate (a service call is correctly refused) but return not_implemented,
  because attachment storage (TD-008) and the ingest/task runtime (TD-007) are
  not built.
- **Why the gate ships before the backend, deliberately**: the OBO-only refusal
  is an authorization guarantee, not plumbing. A service-mode call to a write
  tool is denied today, so the security contract is complete even though the
  write path is not - and a test asserts the 403 holds regardless of backend
  presence. Wiring each backend later is a one-line addition at a seam dispatch
  already routes through.
- **Recovery condition**: search/ask unblock when TD-008's BM25 + C2 fill land
  (ask already works end-to-end for grounding+A4, it just needs recall to feed
  it); the write tools unblock when TD-007's ingest runtime and TD-008's
  attachment storage land.
