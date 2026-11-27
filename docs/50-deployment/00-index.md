# 50-deployment - Infra, CI/CD, environments, bootstrap

Deployment and bootstrap material for this repo.

| File / dir | Purpose |
|------------|---------|
| `10-platform-registration-checklist.md` | platform-side registration actions (owner / platform line) when instantiating a product repo |
| `20-github-bootstrap-checklist.md` | one-time GitHub bootstrap: create public repo, enable scanning, first-push main, run CI once, apply the ruleset (in that order) |
| `30-pg18-adr007-migration.md` | host-side migration window runbook: pg16 -> 18 + `vxturebiz_karda_prod` -> `vx_karda_db` (prod only; beta dormant per TD-001) |
| `rebuild/` | rebuild artifacts; holds `main-ruleset.json` (the branch-protection ruleset) |
| `40-commercial-draft-preparation.md` | approved Karda package draft input and readback checklist; publication excluded |
| `50-knowledge-platform-release-20261125.md` | knowledge platform v0.12.0 migration, release evidence and remaining acceptance gates |
| `60-knowledge-exploration-release-20261125.md` | v0.12.1 grouped graph, evidence exploration, complete bounded overview and batch acceptance |
| `70-sources-audit-release-20261125.md` | v0.12.2 exact source search, publication replay audit and SOP revision lifecycle evidence |
| `80-topic-dossiers-release-20261125.md` | v0.12.3 immutable evidence-bound topic drafts, 0019 migration and rollout evidence |
| `90-cross-library-community-release-20261125.md` | v0.12.4 explicit cross-library knowledge packages and structural-community navigation |
| `100-model-graph-source-release-20261125.md` | cited model summaries, keyboard graph navigation, DOCX tables and production release evidence |
| `110-directory-contract-release-20261125.md` | v0.12.9 authority-bound directory paging, DOCX database contract repair and rollout evidence |
| `120-graph-xlsx-release-20261125.md` | v0.12.10 graph page navigation, XLSX literal-cell source chain and migration/rollout evidence |
| `130-operations-history-release-20261125.md` | v0.12.11 consolidated topic/summary history operations and stage-level verification |
| `140-compile-operations-release-20261125.md` | v0.12.12 compile task history, current-source details and recovery stage |
| `150-impact-operations-release-20261125.md` | v0.12.13 source impact inspection, human action suggestions and authorized diagnostics export |

| `160-office-source-release-20261125.md` | v0.12.14 PPTX source chain, unified format contract and migration/rollout evidence |

| `170-graph-navigation-release-20261125.md` | v0.12.15 viewport drawing, label density, minimap navigation and production evidence |

| `180-knowledge-sync-release-20261125.md` | v0.12.16 revalidated RP/OBO knowledge window synchronization and production evidence |

| `190-structural-layout-release-20261125.md` | v0.12.17 structural layout, dedicated Worker lifecycle and production evidence |

| `200-knowledge-consumer-release-20261125.md` | v0.12.18 knowledge/graph revalidation consumers, entity navigation and production evidence |

| `210-maintenance-audit-release-20261125.md` | v0.12.19 maintenance audit delivery, offline integrity/comparison and production evidence |

| `220-docx-stories-release-20261125.md` | v0.12.20 referenced DOCX stories, migration0024 and production evidence |

| `230-published-search-release-20261126.md` | v0.12.21 authorized published fact search and production evidence |

The tag-to-env CD pipeline (deploy/build/rollback/db-init workflows and the
`tailnet-ssh-connect` composite action) is inherited from the template and lives
in `.github/`. Both checklists above are done and the production chain is
exercised (live since v0.1.0); the beta tier stays a reserved channel (TD-001).

| `240-topic-delivery-release-20261126.md` | v0.12.22 current topic evidence and accepted summary delivery |

| `250-docx-grid-release-20261126.md` | v0.12.23 merged/nested DOCX cell grids, migration0025 and production evidence |

| `260-xlsx-ranges-release-20261126.md` | v0.12.24 explicit XLSX merged ranges, migration0026 and production evidence |

| `270-pptx-grid-release-20261126.md` | v0.12.25 merged PPTX cell grids, migration0027 and production evidence |

| `280-pptx-stories-release-20261126.md` | v0.12.26 authored PPTX groups/notes, migration0028 and production evidence |

| `290-source-readiness-release-20261126.md` | v0.12.27 current source diagnostics and production evidence |

| `300-source-window-release-20261126.md` | v0.12.28 current source-batch navigation and production evidence |

| `310-scoped-compile-release-20261126.md` | v0.12.29 explicit compilation source scopes and production evidence |

| `320-publication-impact-release-20261126.md` | v0.12.30 publication replacement impacts and production evidence |

| `330-fact-pages-release-20261126.md` | v0.12.31 bound published fact search pages and production evidence |

| `340-rollout-control-release-20261126.md` | v0.12.32 workspace rollout controls, migration0029 and production evidence |

| `350-service-capacity-release-20261126.md` | v0.12.33 indexed formal reads, capacity measurements and production evidence |

| `360-read-phases-release-20261126.md` | v0.12.34 phase diagnostics, canonical normalization and batched authority reads |

| `370-topic-knowledge-release-20261126.md` | v0.12.35 agent/user topic discovery, accepted summaries and exact evidence |

| `380-docx-numbering-release-20261126.md` | v0.12.36 DOCX authored numbering, migration0030 and production evidence |

| `470-library-sharing-release-20261127.md` | v0.12.45 sharing governance and production evidence |

| `480-source-management-release-20261127.md` | v0.12.46 complete source management and production evidence |

| `490-knowledge-service-center-release-20261127.md` | v0.12.47 complete agent knowledge service center, six-item acceptance and production evidence |

| `500-knowledge-production-center-release-20261127.md` | v0.12.49 complete production orchestration/release center and six-part acceptance |
