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
| `20-2607222338-karda-platform-registration-a.md` | 2607222338 | platform line | product registration segment A - the items that depend only on the product code: directory row, tier seeding, the `karda` production OIDC client, C2 credentials, C3 signing secret. Also reports two org hygiene items (`PROMOTION_TOKEN` dead value, stale SonarCloud project key) | open |
| `30-2607222338-karda-arda-content-channel-alignment.md` | 2607222338 | arda line | five Arda-side obligations in the content channel contract: stable-ID guarantee, `fetch_ref` form, reconciliation interface, incremental-latency SLO tiers, dead-letter surface. `200-arda-channel` stays v0.1 until answered | open |

## Received

Inbound letters live in the sending repo; we record receipt and the local
follow-up here rather than copying them (one subject, one master copy).

| Letter | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture/docs/80-liaison/20-2607221900-taxonomy-070-revision-reply.md` | 2607221900 | platform line | closes `10-2607221756`: D1-D4 landed as 070 batch 5, plus the F-item text calibrations | done 2026-07-22 - re-checked `docs/00-meta/10-docs-convention.md` against batch 5, moved the TD register to the newly pinned `60-operations/10-tech-debt.md`, switched `DIR_EXEMPTIONS` to path keys, adopted the sequence/keyed subdirectory model. Deviations vs org: zero |

Expected next entry: **registration segment B** - the `product_webhooks` tailnet
delivery address, the edge vhost target for `karda.vxture.com`, and the
`karda-beta` OIDC client (which closes TD-001). All three are held because karda
has no deploy host and port assigned yet; that is an owner/infra decision, not a
platform-line one, so the letter cannot be written until it lands.
