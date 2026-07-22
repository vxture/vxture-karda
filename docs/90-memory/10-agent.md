# Agent entry point

Start here if you are an AI agent working in this repo.

## What this repo is

`vxture-karda` - Karda, the Vxture enterprise intelligent knowledge service
platform. Instantiated from `vxture-template` on 2026-07-22 with product code
`karda`, so it carries the org governance base, the platform integration contract
surface (C1/C2/C3), and the engineering shell as inherited, rigid material. The
karda product domain - knowledge model, ingestion/processing, retrieval tooling,
arda channel - is the blank zone and is designed here.

The product code is already resolved everywhere; there is no placeholder left to
substitute. Derived names (`@karda/*`, `karda-app`, `vxturebiz_karda_<env>`,
`karda_svc`, `KARDA_*` secrets, `karda.vxture.com`) are contracts - do not rename.

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
- Docs: numbered = formal, unnumbered = temporary. `lint:docs-numbering --strict`
  blocks unnumbered `.md`. Domain docs use `{kind}_{domain}_{NNN}_{slug}`.
- Keep source, config, and root meta files ASCII-only.
- See `CLAUDE.md` (repo root) for the full working agreement, and
  `docs/70-workplan/00-index.md` for the batch tracker.
