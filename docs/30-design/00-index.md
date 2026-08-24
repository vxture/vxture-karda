# 30-design - Architecture, ADRs, domain design, DB schema

Design documents for this repo: architecture, architecture decision records
(`decisions/`), karda's domain design, and database schema docs.

Numbering: three digits throughout this directory (uniform digit count keeps the
lexical sort correct), bands per `docs/00-meta/10-docs-convention.md` section 3 -
`1xx` architecture and in-depth domain design, `2xx` external contracts and
schema refinement, `3xx` implementation. Ten-step gaps inside a band. The
platform repo's `{kind}_{domain}_{NNN}_{slug}` family is not used here.

| Doc | Scope | State |
|-----|-------|-------|
| `100-kb-model.md` | knowledge-base object model, dual templates, hierarchy, metadata, lifecycle state machines, library-level config surface | Draft v0.1, 4 open decisions |
| `110-processing.md` | offline processing pipeline: multi-stage parsing, templated chunking, vectorization and atomic commit, incremental update, controlled rebuild, retry | Draft v0.1, 4 open decisions |
| `120-retrieval-tools.md` | retrieval evaluation chain, cross-namespace union recall, visible-set cache, association manifest, v1 tool surface | Draft v0.1, 5 open decisions |
| `130-portal-shell.md` | portal shell vocabulary (工作区 / 导航栏 / 内容区 / 值班台), spacing constants, container-query column rule, DS typography baseline | v1.0, matches `portals/app/app/_shell/` |
| `200-arda-channel.md` | Karda x Arda content channel contract (binding, delivery, incremental, tombstone delete, revoke cascade) | Draft v0.1, needs Arda-side alignment |
| `210-data-model.md` | karda_kb schema refinement (DDL <-> Prisma lockstep) | in repo |
| `220-connector-framework.md` | connector capability registry, binding lifecycle, ingest envelope | in repo |
| `230-runos-channel.md` | karda as a Runos capability supplier: kb-read/kb-write capabilities, the MCP endpoint, channel rules | v1.0 implemented 2026-08-18; Runos-side registration pending |

Product-level authority over these is `docs/20-specs/10-product-definition.md`,
itself under the positioning authority `docs/20-specs/30-agent-knowledge-blueprint.md`
(KD-017); conflict order is platform constraints (`product_110` / `product_210`,
platform repo) > the blueprint (positioning and direction) > the product
definition > these design docs.

Not yet present: karda's DB schema documents (`2xx` band) and the implementation
band (`3xx`). The schema docs must land together with `deploy/database/ddl/` and
the Prisma schema - `lint:data-design` is a hard gate on their lockstep.

## Subdirectories

- `decisions/` - architecture decision records (`ADR-NNN`, append-only, stable
  IDs). Unnumbered by org mandate (taxonomy section 4 pins this path); it is one
  of the two named exceptions in the docs convention section 4.
