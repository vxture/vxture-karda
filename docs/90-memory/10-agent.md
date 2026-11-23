# Agent entry point

Start here if you are an AI agent working in this repo.

Current work (2026-11-22): see [platform alignment kickoff](../70-workplan/10-platform-alignment-20261122.md).
Production is v0.11.6 / 3ffb891c (approved run45094898500 succeeded November23
at09:36:42 CST). Target-domain readiness confirms db/redis/storageConfig ok.
Real fetch/parse/chunk receipts pass; embed parks at upstream_account_refused
(Atlas issue147), commit not reached. Existing private fixture retained.
Customer logout now returns task API unauthenticated and Karda login gate;
refreshed Opera remains workforce-authenticated. Cross-product/back-channel and
permission-message acceptance remain open. Cross-release object read and ingest
C3 observation pass; indexing, grounded answers, AI, search/ask C3 and hash remain
open. P9.10 removes authored hub activity and corrects parked/failed stage states;
PR248 merged43fffd91,883 tests/zero skips, PR CI45059290921 passes; main
CI45059533565 and secret scan pass. v0.11.5 pins43fffd91; run45059723049
succeeded. P9.10 authenticated hub/stage acceptance passes. P9.11 corrects
shell/overview fake traffic fallback and unknown health/gap counts; PR251 merged3ffb891c, deployed and accepted.
No platform configuration changed.
P9.11 main CI45094710951 and secret scan45094710966 pass;883 tests/zero skips.
v0.11.6 pins3ffb891c; run45094898500 succeeded. Authenticated shell/overview
and home pass: real zero traffic, unknown metrics null, no fabricated warnings.
Overview per-asset authored ops retain demoOps provenance; wider demo cleanup
and remaining business acceptance are not covered by P9.11.

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

## P9.12/P9.13 acceptance update - 2026-11-23

Arda logout revoked idle Karda: it moved to the login gate without a reload;
its protected task API then returned unauthenticated. This is observed
Arda-to-Karda propagation, not independent backchannel HTTP capture or proof
of role/workspace/account-change events. Prior P9.9 workforce isolation is
separate. Original download passes:355 bytes and SHA256 matches upload.
Owner restored both logins; Atlas embedding remains upstream_account_refused.
Index/retrieval/grounded answers, AI/search/ask C3 receipts/dedup and identity
context notifications remain open. Current details override historical pending
logout/hash wording above; see the authoritative batch tracker P9.12/P9.13.
No release, platform source/configuration, credentials or server variables changed.

## Explicit roles implementation checkpoint - 2026-11-23

Owner/administrator/member/readonly/guest implementation is under verification.
New authorized members receive a persisted readonly assignment once; existing
roleless/inactive members stay denied. Owner transfer/bootstrap is explicit and
audited. Platform authorization revocation overrides all retained local roles.
See [R1-R5 delivery tracker](../70-workplan/60-explicit-product-roles-20261123.md).
Production migration and application deployment succeeded. Do not rerun the
cancelled implicit-member candidates or modify platform sources/variables.

Implementation merged: Arda PR241/19b9865 and Karda PR259/f37a421; both full main
CI runs pass. DB jobs45115384853 (Arda) and45115340531 (Karda) succeeded.
Continue from60-explicit-product-roles-20261123.md for remaining live acceptance.

Both production DB jobs now SUCCEEDED after owner approval: Arda45115384853
(30tables/3enums),Karda45115340531(41tables). Application deployments succeeded:
Arda v0.13.5/e3b9802/run45119134449 and Karda v0.11.8/01e7065a/run45119134160.
Canonical-domain readiness confirms the releases and healthy dependencies.
Anonymous members APIs and supported business APIs reject unauthenticated access.
Owner login restored; both members pages show the authorized product owner and
disable ordinary role editing of that owner. No manual bootstrap submitted.
Tab-switch inputs preserved Arda's page; full visibility trace is still open.
Synthetic-member/roleless/revocation/notification/OBO acceptance remains pending.
No real member/owner/seat changes. Platform731/726 remain active integration gaps.

## Current owner scope - 2026-11-23 integration closure

Use [I0-I6 tracker](../70-workplan/70-integration-closure-20261123.md) as current
authority. Legacy product features will be rebuilt: stop Curator/source/quality
and Karda index/retrieval/answer optimization or acceptance. Mark them
reconstruction-replaced, never accepted. Atlas147 is external history, not a
blocker for this closure; generic AI attribution/credit contracts stay in I5.
Keep identity/session,explicit roles,platform authorization/messages,managed
domain/configuration,commercial/C2/C3/gauge/lifecycle/OBO and handoff.
Both old domains still serve200; managed retirement stays platform721/727.
Browser access unavailable in this chat; do not confuse that with login failure.
Dedicated non-owner test member requested; no real privileges/subscriptions changed.
