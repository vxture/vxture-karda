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
| `130-2607271030-karda-atlas-a4-access-request.md` | 2607271030 | platform line | A4 access request: `karda.ask`'s Atlas A4 generation client is built + wired (activates on `ATLAS_CHAT_PATH`/`ATLAS_ASK_MODEL`), but a live probe found the chat endpoint on none of 9 candidate paths / 7 discovery paths on `:8080` and no other model port open. Asks for 3 things - the A4 chat endpoint (URL/path), a valid model code + enumeration, the auth posture - plus confirmation of the ChatRequest/Response schema + metering/throttle semantics. Continues the Atlas thread (`70`/`90`/`100`) | open - awaiting platform |
| `120-2607261820-karda-platform-registration-c.md` | 2607261820 | platform line | registration segment C - post-launch (`v0.2.0` live). Four platform-side actions: (1) register the `product_webhooks` delivery address `http://vx-worker-02:3240` (C3 inbound is built + verified but nothing is sent until registered); (2) register the metric-registry keys karda now emits - `karda.ingest` (live), `karda.search` / `karda.ask` (declared); (3) delete the inert `OIDC_CLIENT_SECRET` repo secret (closes `50` R2); (4) sync-only: the five DRAFT plans wait on karda's tier->entitlement mapping (KD-202/203 + product-def v1), a later dedicated letter | open - awaiting platform |

## Received

Inbound letters live in the sending repo; we record receipt and the local
follow-up here rather than copying them (one subject, one master copy).

| Letter | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture/docs/80-liaison/20-2607221900-taxonomy-070-revision-reply.md` | 2607221900 | platform line | closes `10-2607221756`: D1-D4 landed as 070 batch 5, plus the F-item text calibrations | done 2026-07-22 - re-checked `docs/00-meta/10-docs-convention.md` against batch 5, moved the TD register to the newly pinned `60-operations/10-tech-debt.md`, switched `DIR_EXEMPTIONS` to path keys, adopted the sequence/keyed subdirectory model. Deviations vs org: zero |
| `vxture/docs/80-liaison/30-2607230000-karda-platform-registration-a-reply.md` | 2607230000 | platform line | segment A non-secret parts landed in code; secrets awaiting owner approval | superseded by the completion notice below |
| `vxture/docs/80-liaison/40-2607230130-karda-platform-registration-a-completion.md` | 2607230130 | platform line | segment A live in the production DB: `karda` product row, OIDC client (`secret=set`), five DRAFT plan skeletons; `OIDC_CLIENT_SECRET` transported | replied 2026-07-23 in `50-2607230957` - one blocker and two gaps found while verifying |

## Integration state (2026-07-23)

All three platform channels are closed and verified against the live platform,
not against mocks:

| Channel | Evidence |
|---------|----------|
| C1 OIDC | edge vhost live; a real login completed end to end - a session in Redis carries an id/access/refresh token set, which only exists after the code-for-token exchange succeeded, so `OIDC_CLIENT_SECRET` is confirmed correct. Negative control: a forged `redirect_uri` gets `400 invalid_redirect_uri` |
| C2 entitlement | probed three ways - no token 401, correct token 200 with the unsubscribed envelope, wrong token 401 |
| C3 provisioning | signature probed four ways (correct / tampered / stale timestamp / absent), delivery semantics four ways (first / replay / stale seq / subscription_changed), each cross-checked against what actually landed in the DB. Probe rows removed afterwards |

Still open on the platform side, now consolidated into segment C (`120`):
`product_webhooks` delivery-address registration at `http://vx-worker-02:3240`
(karda processes webhooks correctly, but nothing is sent until the address is
registered); registration of the metric-registry keys karda now emits
(`karda.ingest` live, `karda.search` / `karda.ask` declared); and deletion of the
inert `OIDC_CLIENT_SECRET` repo secret (`50` R2).

The tier-to-entitlement mapping - which the platform needs before it can publish
the five DRAFT plans, and which waits on KD-202/203 and
`20-specs/10-product-definition.md` reaching v1 - stays a later, dedicated letter;
`120` only records the dependency so the metric keys line up in advance.
