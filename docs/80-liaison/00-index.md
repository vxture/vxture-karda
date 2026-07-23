# 80-liaison - Cross-org liaison

Cross-organization liaison for this repo: reply letters, integration agreements,
and sync notes with other product lines or the platform line. Artifacts are named
`NN-{YYMMDDHHMM}-{slug}.md` - the stamp follows the `NN-` index so the docs
numbering guardrail still passes (`docs/00-meta/10-docs-convention.md` section 3).

The template's own correspondence was dropped at instantiation; it is not karda's
history.

| File | Stamp | To | Subject | Status |
|------|-------|----|---------|--------|
| `10-2607221756-karda-taxonomy-findings.md` | 2607221756 | platform line | `070-docs-taxonomy` audit: 8 standing standard/implementation gaps found while exercising the section-3 delegation, plus 4 decisions requested (kind set, subdirectory numbering, product number `220`, whether the delegation should mandate an in-repo convention) | **closed** 2026-07-22 - D1-D4 and F1/F4/F5/F7/F8 all landed in 070 batch 5 |
| `20-2607222338-karda-platform-registration-a.md` | 2607222338 | platform line | product registration segment A - the items that depend only on the product code: directory row, tier seeding, the `karda` production OIDC client, C2 credentials, C3 signing secret. Also reports two org hygiene items (`PROMOTION_TOKEN` dead value, stale SonarCloud project key) | **answered** 2026-07-23 - landed in production; follow-ups in `50-2607230957` |
| `30-2607222338-karda-arda-content-channel-alignment.md` | 2607222338 | arda line | five Arda-side obligations in the content channel contract: stable-ID guarantee, `fetch_ref` form, reconciliation interface, incremental-latency SLO tiers, dead-letter surface. `200-arda-channel` stays v0.1 until answered | open |
| `40-2607230909-karda-platform-registration-b.md` | 2607230909 | platform line | registration segment B now the production target is set: edge vhost `karda.vxture.com` -> `vx-worker-02:3233`, `product_webhooks` delivery address, and the secret material only the owner can transport. Restates that the `karda-beta` client stays deferred (not withdrawn) until the beta server exists. Flags two mismatches against arda's live setup (ACR fallback endpoint, `DEPLOY_DIR` key name) | open |
| `50-2607230957-karda-registration-a-ack.md` | 2607230957 | platform line | acknowledges segment A landing, and reports what checking it turned up: the delivered `OIDC_CLIENT_SECRET` is inert as a repo secret (nothing in the deploy chain reads it, and a GitHub secret cannot be read back), `PLATFORM_INTERNAL_AUTH_TOKEN` has no shared value karda can find, and both suggested self-tests need a deployed app. Three questions back | R3 answered (values delivered out of band); R1 resolved by writing the host `.env` directly; **R2 still open** - the inert repo secret should be deleted |
| `60-2607231722-karda-integration-probe-results.md` | 2607231722 | platform line | karda v0.1.1 live on worker-02; the two self-tests the platform asked for. C2 closed-loop, probed three ways | **superseded** by the full-closure state below - C1 has since closed too |
| `70-2607232158-karda-atlas-contract-request.md` | 2607232158 | atlas line | model-call interface contract (embedding / parsing models / rerank / generation). karda hosts no model runtime by design, so this gates the processing and retrieval domains entirely - the longest external dependency on the plan. Also asks whether Atlas can distinguish throttling from quota exhaustion, and whether a 100-candidate rerank in 400ms is realistic | open |

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

Still open on the platform side: `product_webhooks` delivery-address
registration (karda can process webhooks correctly, but nothing will be sent
until the address is registered), and the inert repo secret in `50`'s R2.

Next outbound letter will most likely be karda's tier-to-entitlement mapping,
which the platform needs before it can publish the five DRAFT plans - and which
waits on `20-specs/10-product-definition.md` reaching v1.
