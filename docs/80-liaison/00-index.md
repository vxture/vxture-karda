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

## Received

Inbound letters live in the sending repo; we record receipt and the local
follow-up here rather than copying them (one subject, one master copy).

| Letter | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture/docs/80-liaison/20-2607221900-taxonomy-070-revision-reply.md` | 2607221900 | platform line | closes `10-2607221756`: D1-D4 landed as 070 batch 5, plus the F-item text calibrations | done 2026-07-22 - re-checked `docs/00-meta/10-docs-convention.md` against batch 5, moved the TD register to the newly pinned `60-operations/10-tech-debt.md`, switched `DIR_EXEMPTIONS` to path keys, adopted the sequence/keyed subdirectory model. Deviations vs org: zero |

Expected next entries: the platform-side registration request (OIDC clients,
C2/C3 secrets) and the edge vhost request for `karda.vxture.com`, both driven by
`docs/50-deployment/10-platform-registration-checklist.md`. An arda-line letter
follows once `docs/30-design/200-arda-channel.md` is settled - it is a
cross-product contract draft and needs Arda-side alignment before it can be
finalized.
