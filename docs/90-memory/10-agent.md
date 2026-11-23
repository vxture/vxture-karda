# Agent entry point

Start here if you are an AI agent working in this repo.

Current work (2026-11-22): see [platform alignment kickoff](../70-workplan/10-platform-alignment-20261122.md).
Production is v0.11.5 / 43fffd91 (approved run45059723049 succeeded November23
at09:15:12 CST). Target-domain readiness confirms db/redis/storageConfig ok.
Real fetch/parse/chunk receipts pass; embed parks at upstream_account_refused
(Atlas issue147), commit not reached. Existing private fixture retained.
Customer logout now returns task API unauthenticated and Karda login gate;
refreshed Opera remains workforce-authenticated. Cross-product/back-channel and
permission-message acceptance remain open. Cross-release object read and ingest
C3 observation pass; indexing, grounded answers, AI, search/ask C3 and hash remain
open. P9.10 removes authored hub activity and corrects parked/failed stage states;
PR248 merged43fffd91,883 tests/zero skips, PR CI45059290921 passes; main
CI45059533565 and secret scan pass. v0.11.5 pins43fffd91; run45059723049
succeeded. Hub/stage UI acceptance awaits customer login after the logout test.
No platform configuration changed.
Legacy retirement, cross-product logout and real business acceptance remain open.
Original bootstrap statements are historical. Owner scope
is Karda-only fixes, platform issues instead of platform source/variable/edge
changes. Do not copy Arda credentials, commercial quotas or its unimplemented SSE
design as working code. No new release is implied by the kickoff.

## What this repo is

`vxture-karda` - Karda, the Vxture enterprise intelligent knowledge service
platform. Instantiated from `vxture-template` on 2026-07-22 with product code
`karda`, so it carries the org governance base, the platform integration contract
surface (C1/C2/C3), and the engineering shell as inherited, rigid material. The
karda product domain - knowledge model, ingestion/processing, retrieval tooling,
arda channel - is the blank zone and is designed here.

The product code is already resolved everywhere; there is no placeholder left to
substitute. Derived names (`@karda/*`, `karda-app`, `vx_karda_db` (ADR-007,
same name in every env), `karda_svc`, `KARDA_*` secrets, `karda.ruyin.work`)
are contracts; the public host follows the owner-directed November22 migration.

## Where authority lives

Not in this repo. The governing standards are in the platform repo
(`D:\MyWebSite\vxture`): `140-repo-governance-standard.md` (WHAT),
`product_240_repo-template.md` (template design), `20-self-rectify-runbook.md`
(HOW + machine checks), `070-docs-taxonomy.md` (docs numbering). When you hit a
gap not covered by an existing standard, fix the standard in the platform repo
first, then mirror it here - do not invent a standard inside a product repo.

## Working rules

- Trunk-based: feature branch -> PR -> squash-merge -> delete branch. Never push
  `main` directly.
- The five required CI checks are a stable contract: `quality-gate` / `build` /
  `test-coverage` / `audit` / `gitleaks`. Do not rename the jobs that produce them.
- Docs: numbered = formal, unnumbered = temporary. In-repo numbering is this
  repo's own (org taxonomy section 3 delegates it) - read
  `docs/00-meta/10-docs-convention.md` before adding a document. Local docs are
  `NN(N)-slug.md`; the platform `{kind}_{domain}_{NNN}_` family is NOT legal
  here, and such a reference in our text always means a platform-repo document.
  `lint:docs-numbering --strict` blocks unnumbered files AND directories.
- Draft design work is staged in the git-ignored `temp/`; it moves into `docs/`
  under a number once reviewed, and is deleted from `temp/` in the same change.
- Keep source, config, and root meta files ASCII-only.
- See `CLAUDE.md` (repo root) for the full working agreement, and
  `docs/70-workplan/00-index.md` for the batch tracker.
