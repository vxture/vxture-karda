# 20-specs - Product and business specifications

Karda's specification: what the product is, its surfaces, and its business rules.

| Doc | Scope | State |
|-----|-------|-------|
| `10-product-definition.md` | positioning, structure, settled decisions, v1 scope, open product-level decisions; carries the design-document family index | Draft v0.4 |
| `20-decisions.md` | decision register (`KD-NNN`): the rulings that were scattered across the design docs' section-11 tables, collected in one place. On conflict this table wins; the design docs keep the context | v1 |

Two-digit `NN-slug.md` numbering with ten-step gaps (`docs/00-meta/10-docs-convention.md`
section 3). This repo holds one product, so there is no per-product subdirectory
and no product-number prefix - the taxonomy's product numbering (karda = `220`)
applies to product directories in the PLATFORM repo, not here.

The product definition is the authority over `docs/30-design/`: conflict order is
platform constraints (`product_110` / `product_210`, platform repo) > this
definition > the design documents.
