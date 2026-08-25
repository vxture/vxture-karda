# 20-specs - Product and business specifications

Karda's specification: what the product is, its surfaces, and its business rules.

| Doc | Scope | State |
|-----|-------|-------|
| `10-product-definition.md` | positioning applied, structure, settled decisions, v1 scope, open product-level decisions; carries the design-document family index | Draft v0.5 |
| `20-decisions.md` | decision register (`KD-NNN`): the rulings that were scattered across the design docs' section-11 tables, collected in one place. On conflict this table wins; the design docs keep the context | v1 |
| `30-agent-knowledge-blueprint.md` | the POSITIONING AUTHORITY (owner blueprint, 2026-08-18, KD-017): karda as the Vxture Agent Knowledge Platform - five-platform relations, six capability domains, the knowledge-asset model, boundary table, phase-1 scope | v1.0 |
| `40-tier-capability-matrix.md` | tier -> feature keys / limits / quota pools; the karda-side input the platform needs before it can publish the five plan tiers | Proposal v0.1, awaiting owner ruling |

Two-digit `NN-slug.md` numbering with ten-step gaps (`docs/00-meta/10-docs-convention.md`
section 3). This repo holds one product, so there is no per-product subdirectory
and no product-number prefix - the taxonomy's product numbering (karda = `220`)
applies to product directories in the PLATFORM repo, not here.

Conflict order: platform constraints (`product_110` / `product_210`, platform
repo) > `30-agent-knowledge-blueprint` (positioning and direction) >
`10-product-definition` (product rulings) > the design documents in
`docs/30-design/`. The positioning uplift (KD-017) does not silently override
settled KD rulings - structural conflicts are reconciled one by one in the
decision register.
