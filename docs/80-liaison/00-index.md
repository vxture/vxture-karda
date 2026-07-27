# 80-liaison - Cross-org liaison

Cross-organization liaison for this repo: reply letters, integration agreements,
and sync notes with other product lines or the platform line. Artifacts are named
`NN-{YYMMDDHHMM}-{slug}.md` - the stamp follows the `NN-` index so the docs
numbering guardrail still passes (`docs/00-meta/10-docs-convention.md` section 3).

The template's own correspondence was dropped at instantiation; it is not karda's
history.

A settled letter carries a **`-DONE`** suffix in its filename (visible in any
listing) - its request has been fulfilled, superseded, or answered, with any
residual formally tracked in a later still-open letter (noted in its Status).
Letters without the suffix are still in flight (awaiting the platform or arda).

| File | Stamp | To | Subject | Status |
|------|-------|----|---------|--------|
| `10-2607221756-karda-taxonomy-findings-DONE.md` | 2607221756 | platform line | `070-docs-taxonomy` audit: 8 standing standard/implementation gaps found while exercising the section-3 delegation, plus 4 decisions requested (kind set, subdirectory numbering, product number `220`, whether the delegation should mandate an in-repo convention) | **DONE** 2026-07-22 (closed) - D1-D4 and F1/F4/F5/F7/F8 all landed in 070 batch 5 |
| `20-2607222338-karda-platform-registration-a-DONE.md` | 2607222338 | platform line | product registration segment A - the items that depend only on the product code: directory row, tier seeding, the `karda` production OIDC client, C2 credentials, C3 signing secret. Also reports two org hygiene items (`PROMOTION_TOKEN` dead value, stale SonarCloud project key) | **DONE** 2026-07-23 - segment A landed in production; residual follow-ups tracked in `120` |
| `30-2607222338-karda-arda-content-channel-alignment.md` | 2607222338 | arda line | five Arda-side obligations in the content channel contract: stable-ID guarantee, `fetch_ref` form, reconciliation interface, incremental-latency SLO tiers, dead-letter surface | open - **urgency corrected by `80-2607240013`**: no longer blocks karda's mainline |
| `40-2607230909-karda-platform-registration-b-DONE.md` | 2607230909 | platform line | registration segment B now the production target is set: edge vhost `karda.vxture.com` -> `vx-worker-02:3233`, `product_webhooks` delivery address, and the secret material only the owner can transport. Restates that the `karda-beta` client stays deferred (not withdrawn) until the beta server exists. Flags two mismatches against arda's live setup (ACR fallback endpoint, `DEPLOY_DIR` key name) | **DONE** - edge vhost live on 3240 + production secrets transported; port superseded by `110`, webhook-address residual tracked in `120` |
| `50-2607230957-karda-registration-a-ack-DONE.md` | 2607230957 | platform line | acknowledges segment A landing, and reports what checking it turned up: the delivered `OIDC_CLIENT_SECRET` is inert as a repo secret (nothing in the deploy chain reads it, and a GitHub secret cannot be read back), `PLATFORM_INTERNAL_AUTH_TOKEN` has no shared value karda can find, and both suggested self-tests need a deployed app. Three questions back | **DONE** - R1 (host `.env`) + R3 (values delivered out of band) resolved; R2 (delete the inert repo secret) tracked in `120` |
| `60-2607231722-karda-integration-probe-results-DONE.md` | 2607231722 | platform line | karda v0.1.1 live on worker-02; the two self-tests the platform asked for. C2 closed-loop, probed three ways | **DONE** - superseded by the full integration-closure state below (C1 has since closed too) |
| `70-2607232158-karda-atlas-contract-request-DONE.md` | 2607232158 | platform line (Atlas not independent) | model-call interface contract (embedding / parsing models / rerank / generation). karda hosts no model runtime by design, so this gates the processing and retrieval domains entirely - the longest external dependency on the plan. Also asks whether Atlas can distinguish throttling from quota exhaustion, and whether a 100-candidate rerank in 400ms is realistic | **DONE** - answered 2026-07-24 by `90` (only A4 exists; A1-A3 unbuilt) |
| `90-2607240921-karda-atlas-reply-received-DONE.md` | 2607240921 | (record) | platform's reply to `70`: Atlas is not yet independent and only A4 (generation) exists - A1 embedding / A2 parsing / A3 rerank are unbuilt, a capability gap not a doc gap. Reshapes batches 5-6; A4 unblocks `karda.ask`, A1 remains the hard block. KD-101/102 split, KD-107/108 added | **DONE** - received, plan adjusted |
| `100-2607240931-karda-atlas-capability-requirements.md` | 2607240931 | atlas line | field-level requirements for A1 embedding / A2 parsing models / A3 rerank, as design input while Atlas builds them. Flags the hard constraints karda cannot yield (version-locked embedding, 100-candidate rerank under 400ms, 429 that distinguishes throttle from quota) and the unlock order A1 > A3 > A2 | open (design input) |
| `80-2607240013-karda-arda-channel-repriority.md` | 2607240013 | arda line | corrects the urgency stated in `30`: karda now self-hosts storage and treats Arda as one connector among many, so the five open items affect only the arda connector rather than blocking karda's mainline. Reframes them as "confirm Arda's values on the connector capability matrix" | open |
| `110-2607241749-karda-port-reallocation-DONE.md` | 2607241749 | platform line | production publish port reallocated by product number: prod `3233` -> `3240`, beta `3241` reserved (still deferred with the beta server). Amends every `3233` in letter `40`. Lists the karda-side repo changes and the owner/platform sync actions (repo variable, host `.env`, edge upstream, firewall, webhook base URL) | **DONE** - port cutover complete end to end (repo/host/edge on 3240, `karda.vxture.com` 200); webhook-base residual tracked in `120` |
| `130-2607271030-karda-atlas-a4-access-request.md` | 2607271030 | platform line | A4 access request: `karda.ask`'s Atlas A4 generation client is built + wired (activates on `ATLAS_CHAT_PATH`/`ATLAS_ASK_MODEL`), but a live probe found the chat endpoint on none of 9 candidate paths / 7 discovery paths on `:8080` and no other model port open. Asks for 3 things - the A4 chat endpoint (URL/path), a valid model code + enumeration, the auth posture - plus confirmation of the ChatRequest/Response schema + metering/throttle semantics. Continues the Atlas thread (`70`/`90`/`100`) | **redirected** (reply `vxture/.../60-2607271430`): Atlas is an independent repo since 2026-07-24; platform does NOT proxy the A4 S2S link (the `:8080` 404 was expected). Re-sent direct to atlas as `140`; live A4 connect blocked on the platform's token-exchange issuance + Atlas host allocation |
| `120-2607261820-karda-platform-registration-c-DONE.md` | 2607261820 | platform line | registration segment C - post-launch (`v0.2.0` live). Four platform-side actions: (1) register the `product_webhooks` delivery address `http://vx-worker-02:3240` (C3 inbound is built + verified but nothing is sent until registered); (2) register the metric-registry keys karda now emits - `karda.ingest` (live), `karda.search` / `karda.ask` (declared); (3) delete the inert `OIDC_CLIENT_SECRET` repo secret (closes `50` R2); (4) sync-only: the five DRAFT plans wait on karda's tier->entitlement mapping (KD-202/203 + product-def v1), a later dedicated letter | **DONE** 2026-07-27 - all three asks fulfilled in production: `product_webhooks` address set to `http://100.76.219.48:3240` (= vx-worker-02, IP form), the three metric keys written (`db-init action=seed` succeeded: `✓ [all] Seed completed`), and karda deleted its own inert repo secret. (The seed run's `30-verify` flagged `[B0] DDL baseline hash mismatch` - a pre-existing platform-wide DDL-drift signal, unrelated to karda's rows, which were written; the platform line owns that separately.) **C3 loop confirmed end to end 2026-07-27**: the platform's test delivery `3421924b-1b1a-4916-9876-e92b4f459472` (`subscription_changed`) returned 2xx AND karda recorded it `result=processed` in `vx_provision.webhook_delivery` at 06:09:43Z - i.e. signature + replay-window + seq all passed and the event was handled (the `processed` ledger row only exists after those gates), with `provision_seq` updated the same instant. No `app_instance` row, correct for a cache-invalidation event |
| `140-2607271500-karda-atlas-a4-direct-request.md` | 2607271500 | atlas line (vxture-atlas) | first direct request to the now-independent Atlas repo (per the `130` redirect): formally confirm the A4 endpoint (Atlas draft says `POST /model-platform/chat`, host `待分配`/worker-02:3100 unconfirmed), the S2S token-exchange auth (the platform's issuance endpoint is not built - is there an interim path, or must karda wait?), and the `modelCode` + a read-only model enumeration; confirm the ChatRequest/Response + metering/429 semantics (and formally send the two still-draft Atlas letters); reconfirms the `100` A1/A3/A2 capability needs (unlock order A1 > A3 > A2) | open - **two premises now superseded by `141`**: (a) the platform's token-exchange issuance IS implemented (control-plane T1/T2 in production), so karda's "interim path?" question is void; (b) the host is a registry-confirmed fact (`13-infra-allocation-registry`: atlas = `worker-02:3100`, in production, co-located with karda). karda's A4 client corrected accordingly: base `http://100.76.219.48:3100` (separate from `PLATFORM_API_URL`) + path `/model-platform/chat` + **Bearer** auth (not the C2/C3 internal-auth). See `141` for the corrected asks |
| `141-2607271730-karda-atlas-a4-followup-premises.md` | 2607271730 | atlas line (vxture-atlas) | follow-up to `140`: corrects the two now-stale premises (platform token-exchange issuance IS built; Atlas host IS allocated in production), reports karda has BUILT the S2S token-exchange caller (aud=atlas, service mode, per-`(org,ws)` cached bearer) and wired it dynamically into the A4 client - so karda is now fully code-ready and a live call turns on `ATLAS_BASE_URL` alone. Re-pings the still-open atlas-side items: formal endpoint confirm, the verify-side JWKS/aud posture, `modelCode` + read-only enumeration, ChatRequest/Response + 429/quota, and the `100` A1/A3/A2 schedule | open - awaiting atlas's FORMAL confirmation of items 1-3 (endpoint / verify-side auth / model); karda's blockers are now entirely cleared |

## Received

Inbound letters live in the sending repo; we record receipt and the local
follow-up here rather than copying them (one subject, one master copy).

| Letter | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture/docs/80-liaison/20-2607221900-taxonomy-070-revision-reply.md` | 2607221900 | platform line | closes `10-2607221756`: D1-D4 landed as 070 batch 5, plus the F-item text calibrations | done 2026-07-22 - re-checked `docs/00-meta/10-docs-convention.md` against batch 5, moved the TD register to the newly pinned `60-operations/10-tech-debt.md`, switched `DIR_EXEMPTIONS` to path keys, adopted the sequence/keyed subdirectory model. Deviations vs org: zero |
| `vxture/docs/80-liaison/30-2607230000-karda-platform-registration-a-reply.md` | 2607230000 | platform line | segment A non-secret parts landed in code; secrets awaiting owner approval | superseded by the completion notice below |
| `vxture/docs/80-liaison/40-2607230130-karda-platform-registration-a-completion.md` | 2607230130 | platform line | segment A live in the production DB: `karda` product row, OIDC client (`secret=set`), five DRAFT plan skeletons; `OIDC_CLIENT_SECRET` transported | replied 2026-07-23 in `50-2607230957` - one blocker and two gaps found while verifying |
| `vxture/docs/80-liaison/50-2607271400-karda-platform-registration-c-reply.md` | 2607271400 | platform line | reply to `120`: webhook mechanism already in the karda seed block (needs `KARDA_WEBHOOK_BASE_URL` + a gated `db-init` seed); the `karda.ingest`/`search`/`ask` keys were wholly unregistered - now added to seed-catalog (`KARDA_METRICS`, code only); the inert repo secret confirmed inert but is karda's own object | recorded - drives `120` residual; owner db-init pending |
| `vxture/docs/80-liaison/60-2607271430-karda-atlas-a4-redirect-reply.md` | 2607271430 | platform line | reply to `130`: wrong recipient - Atlas split to an independent repo 2026-07-24; platform does NOT proxy the karda<->Atlas S2S link (so the `:8080` 404 was expected). Relays, explicitly as an UNSENT Atlas draft (not a commitment): endpoint `POST /model-platform/chat` on Atlas's own host (`待分配`), auth = S2S token-exchange (platform issuance NOT built), 429=`RATE_LIMITED`/403=`QUOTA_EXHAUSTED`. Redirects karda to write to `vxture-atlas` directly | recorded - `130` redirected; re-sent direct as `140` |

## Integration state (2026-07-23)

All three platform channels are closed and verified against the live platform,
not against mocks:

| Channel | Evidence |
|---------|----------|
| C1 OIDC | edge vhost live; a real login completed end to end - a session in Redis carries an id/access/refresh token set, which only exists after the code-for-token exchange succeeded, so `OIDC_CLIENT_SECRET` is confirmed correct. Negative control: a forged `redirect_uri` gets `400 invalid_redirect_uri` |
| C2 entitlement | probed three ways - no token 401, correct token 200 with the unsubscribed envelope, wrong token 401 |
| C3 provisioning | signature probed four ways (correct / tampered / stale timestamp / absent), delivery semantics four ways (first / replay / stale seq / subscription_changed), each cross-checked against what actually landed in the DB. Probe rows removed afterwards. **Live closed-loop confirmed 2026-07-27** (after the `120` webhook-address registration): a real platform-scheduled delivery (`3421924b-…`, `subscription_changed`) went 2xx AND landed `result=processed` in `vx_provision.webhook_delivery` - HTTP + application layer both proven, not a probe |

Segment C (`120`) is **DONE** (2026-07-27): the platform set the webhook address
to `http://100.76.219.48:3240` and the `db-init action=seed` wrote the webhook row
plus the three metric keys (`karda.ingest` / `karda.search` / `karda.ask`) to
production (`✓ [all] Seed completed`); karda deleted its own inert
`OIDC_CLIENT_SECRET` repo secret. So C3 inbound is now truly live and
`karda.ingest` usage will land rather than accumulate. The seed run's read-only
`30-verify` flagged `[B0] DDL baseline hash mismatch` - a pre-existing,
karda-unrelated platform-wide DDL-drift signal (same hash predates this PR); it
does not affect karda's written rows and is the platform line's own hygiene item
(a non-destructive `migrate-seed` is the safer fix than a `reset`; karda is not
blocked either way).

A4 for `karda.ask` is **not a platform item** (`130` redirected by `60`): Atlas is
an independent repo, so the endpoint / model / S2S details are requested direct
from the atlas line in `140`, corrected in `141`. Two blockers named in `140` are
now cleared: Atlas's **host is a registry-confirmed fact** (platform
`13-infra-allocation-registry`: `worker-02:3100`, in production, co-located with
karda), and the platform's **token-exchange issuance IS implemented** (control-plane
T1/T2 in production) - so karda has built the S2S token-exchange caller (aud=atlas,
service mode) and wired it dynamically into the A4 client. karda is now fully
code-ready; a live call waits only on Atlas's formal contract confirmation (`141`
items 1-3: endpoint, verify-side JWKS/aud posture, model code) and then setting
`ATLAS_BASE_URL` on the host.

**Governance adopted (platform 2026-07-27 updates):** per `product_210 §11` (v1.1)
karda self-checks its `karda.*` provider surface on every contract change - the
seven items (auth path / error semantics / metering attribution / workspace
attribution / consumer broadcast / capability discovery / cross-repo fact
backfill), self-audit not gate. Capability discovery stays the existing
`/.well-known/vxture-tools` (per `41-atlas-integration-topology §7`, no new
registry). Cross-repo fact-sync discipline: a steady-state fact's authority is the
registry table, not a draft letter - which is why the Atlas host above is now
actionable while the S2S auth (still draft) is not.

The tier-to-entitlement mapping - which the platform needs before it can publish
the five DRAFT plans, and which waits on KD-202/203 and
`20-specs/10-product-definition.md` reaching v1 - stays a later, dedicated letter;
`120` only records the dependency so the metric keys line up in advance.
