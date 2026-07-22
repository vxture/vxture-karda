# 30-design - Architecture, ADRs, domain design, DB schema

Design documents for this repo: architecture, architecture decision records
(`decisions/`), domain design, and database schema docs.

No domain documents yet. Domain documents use the strict org underscore family
`{kind}_{domain}_{NNN}_{slug}` (kind in data/design/ops), enabled once karda's
domain code is registered in the taxonomy domain-code table
(`070-docs-taxonomy.md` section 5) - register it in the platform repo before
authoring the first domain doc here. Karda's knowledge model, processing
pipeline, retrieval tooling, and arda channel all land under this decade;
schema names are karda's to choose apart from the reserved contract schemas
(`vx_provision` / `local_authz` / `local_usage`).

## Subdirectories

- `decisions/` - architecture decision records (`ADR-NNN`, append-only, stable IDs)
