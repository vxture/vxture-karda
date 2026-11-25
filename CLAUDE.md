# vxture-karda Repository Standards

## Current owner scope - 2026-11-25

Owner explicitly authorized completing the reconstruction and production release
on 2026-11-25. Continue K batches autonomously, use the normal db-init and
tag-based release workflows and their existing environment review gates. This
authorizes additive product rollout, not fabricated business quality acceptance,
platform changes, customer privilege changes or automatic acceptance of drafts.
External Ontos/Agent contracts and owner quality review remain evidence gates.

## Owner delivery cadence - 2026-11-25

Owner requests larger functional stages and fewer repeated tests. Develop related
features together in one reviewable feature PR and one release per stage. During
implementation run only type checks and focused tests justified by the changed
behavior. At the stage boundary use required CI for the full regression,
PostgreSQL/migration checks and grouped end-to-end acceptance; do not duplicate
that full run locally without a failure or unresolved risk. Keep mandatory PR
and exact-main checks, production review and post-release health/auth probes.
Do not close business/external gates from implementation evidence.

## Reconstruction scope - 2026-11-24

Read docs/90-memory/20-platform-integration-handoff.md first for platform ownership, post-delivery verification and the user-paused I1 scope.

Owner authorized the Karda reconstruction on 2026-11-24: update product/design
documents, update batches, then execute them. Reconstruction authority:
docs/30-design/160-continuous-knowledge-architecture.md and
docs/70-workplan/80-knowledge-platform-rebuild-20261124.md.
This supersedes the earlier stop on product feature work for the new K batches;
old unfinished features are not retroactively accepted. I0-I6 integration closure
remains separate, and user-paused I1 stays paused. Atlas147 is external history.
Owner priority update (2026-11-24): complete functionality first; improve the
current evaluation results later. K0b human review/independent holdout and quality
optimization no longer block K1 data-layer work, isolated migrations or local
K2-K5 feature implementation. They remain acceptance gates before K6 pilot and
formal cutover. This does not accept draft answers or authorize production DDL,
customer migration, platform changes or privilege changes. Keep function delivery
separate from quality acceptance in the checklist.
Keep Accounts,authorization/roles/messages,managed configuration/domains,
subscriptions/C2/C3/gauge/lifecycle/OBO and handoff. No platform code/server
variables/manual routing or real customer privilege changes are allowed.

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, on top
of the org governance base inherited unchanged from `vxture-template`.

This is Karda, the Vxture Agent Knowledge Platform - the shared knowledge
infrastructure for AI agents (positioning authority:
`docs/20-specs/30-agent-knowledge-blueprint.md`, owner blueprint 2026-08-18,
KD-017; one of the five agent-infrastructure planes: Atlas thinks, Runos acts,
Karda knows, Arda holds data, Ontos holds semantics). It was instantiated from
`vxture-template` with product code `karda`, so everything below the product
line - governance, CI/CD, the three platform integration channels, the
business-face DB baseline - is inherited and rigid. Karda's own domain
(knowledge model, ingestion/processing, retrieval tooling, arda channel, the
runos supplier channel) occupies the template's blank zone.

**Package manager: pnpm** (whole-stack, owner-decided 2026-07-20). CI cache keys,
the Dockerfile deps stage, and the osv `--lockfile=pnpm-lock.yaml` path are all
pnpm. Do not reintroduce npm workspaces.

Authority for the design lives in the platform repo (`D:\MyWebSite\vxture`), not
here: `140-repo-governance-standard.md` (WHAT), `product_240_repo-template.md`
(template design), `20-self-rectify-runbook.md` (HOW + machine checks),
`070-docs-taxonomy.md` (docs numbering). When a gap is not covered by an existing
standard, fix the standard in the platform repo first, then mirror it here - do
not invent a standard inside a product repo.

## Name cascade (product code `karda`)

The product code was resolved at instantiation and is now literal throughout the
repo - there is no placeholder left to substitute. Derived names, all of which
are load-bearing contracts (renaming one breaks CD, DB access, or the platform
registration):

OIDC client pair `karda` / `karda-beta`; compose project and container prefix
`karda-app` / `karda-redis` / `karda-db`; image name `karda-app`; database
`vx_karda_db` (ADR-007: same name in every environment, env lives in the
stack/instance - migrated from `vxturebiz_karda_*` 2026-08-10) with service role
`karda_svc`;
workspace package scope `@karda/*`; secrets `KARDA_DB_SVC_PASSWORD`,
`KARDA_PROVISION_WEBHOOK_SECRET`, `KARDA_WEBHOOK_BASE_URL`; public host
`karda.ruyin.work` (owner-directed cutover 2026-11-22; legacy origin was
`karda.vxture.com`).

## Build status

Current production (2026-11-25): v0.12.20 / e4ffcda9, deploy45645219718
succeeded at2026-11-25T15:33:44Z through normal production review. PR344
consolidates referenced DOCX headers/footers/footnotes/endnotes, versioned
source normalization and persistence compatibility. Stage CI1077pass/zero skips;
main CI45644097375/scan45644097521pass. Migration0024 run45644527356 succeeded,
55tables. Health/ready and anonymous compile/package/source-search refusal pass.
No local full-suite repetition or automatic customer reprocessing. Fixed17items
remain7complete/10unfinished; real external/business/complex-source gates open.
See docs/50-deployment/220-docx-stories-release-20261125.md.

Historical production (2026-11-25): v0.12.19 / 1fbdf09c, deploy45633337049
succeeded at2026-11-25T14:30:13Z through normal production review. PR342
consolidates maintenance audit JSON/Markdown, summaries/human suggestions,
content digests and offline integrity/comparison tools. Stage CI1074pass/zero
skips; main CI45632809814/scan45632809829pass. No DDL,55tables. Health/ready
and anonymous audit/Markdown/legacy JSON refusal pass. No local full-suite
repetition. Fixed17items remain7complete/10unfinished; real business audit,
Agent/events and ontology gates remain open. See
 docs/50-deployment/210-maintenance-audit-release-20261125.md.

Historical production (2026-11-25): v0.12.18 / ebe5cae0, deploy45627063854
succeeded at2026-11-25T13:54:06Z through normal production review. PR340
consolidates revalidated knowledge/graph consumers, pending/error clearing,
late-response cancellation and entity deep links. Stage CI1071pass/zero skips;
main CI45626466725/scan45626466718pass. No DDL,55tables. Health/ready and
anonymous entity/directory sync plus Markdown export refusal pass. No local
full-suite repetition. Fixed17items remain7complete/10unfinished; real business,
Agent/ontology and scale gates remain open. See
 docs/50-deployment/200-knowledge-consumer-release-20261125.md.

Historical production (2026-11-25): v0.12.17 / e9232509, deploy45621971377
succeeded at2026-11-25T13:22:48Z through normal production review. PR338
consolidates structural/grouped/circular layouts, topology-only Worker,
validated output, cancellation, timeout and safe fallback. Stage CI1067pass/
zero skips; main CI45621438162/scan45621438138pass. No DDL,55tables.
Health/ready and anonymous graph package/sync refusal pass. No local full-suite
repetition. Fixed17items remain7complete/10unfinished; real business/scale and
external authority gates remain open. See
 docs/50-deployment/190-structural-layout-release-20261125.md.

Historical production (2026-11-25): v0.12.16 / 47e39dbc, deploy45614811554
succeeded at2026-11-25T12:40:14Z through normal production review. PR336
consolidates RP/OBO current-window synchronization, scope-bound revisions,
authority/source revalidation and explicit replace/unchanged/discard semantics.
Final stage CI1064pass/zero skips after interface-register correction; main
CI45614436808/scan45614436654pass. No DDL,55tables. Health/ready and anonymous
sync/package refusal pass. No local full-suite repetition. Fixed17items remain
7complete/10unfinished; real Agent/event/business gates remain open. See
 docs/50-deployment/180-knowledge-sync-release-20261125.md.

Historical production (2026-11-25): v0.12.15 / 8d2e992b, deploy45609671438
succeeded at2026-11-25T12:07:21Z through normal production review. PR334
consolidates isolated camera updates, viewport drawing, label density, minimap
navigation and correct rectangular pointer transforms. Final stage CI1060pass/
zero skips; main CI45609316906/scan45609317211pass. No DDL,55tables.
Health/ready and anonymous graph package/diagnostics refusal pass. No local
full-suite repetition. Fixed17items remain7complete/10unfinished; real business
scale and external acceptance gates remain open. See
 docs/50-deployment/170-graph-navigation-release-20261125.md.

Historical production (2026-11-25): v0.12.14 / 52d538ad, deploy45601558941
succeeded at2026-11-25T11:27:45Z through normal production review. PR332
consolidates PPTX authored text/tables and PDF/DOCX/XLSX/PPTX format contracts.
Stage CI1056pass/zero skips; main CI45600733220/scan45600733050pass.
Migration0023/db-init45601170149 succeeded,55tables. Health/ready and
anonymous compile-tasks/package/source-search refusal pass. No local full-suite
repetition. Fixed17items remain7complete/10unfinished; external/business gates
remain open. See docs/50-deployment/160-office-source-release-20261125.md.

Historical production (2026-11-25): v0.12.13 / a2fdf7cb, deploy45596889070
succeeded at2026-11-25T10:45:41Z through normal production review. PR330
consolidates source issue summary/filtering, bounded related inspection,
human action suggestions, paging and authorized diagnostic JSON export.
No local full-suite repetition; stage CI1053pass/zero skips on first run,
main CI45596466345/scan45596465959pass. No DDL,55tables. Health/ready and
anonymous diagnostics/export refusal pass. Fixed17items remain7complete/
10unfinished; external/business gates remain open. See
 docs/50-deployment/150-impact-operations-release-20261125.md.

Historical production (2026-11-25): v0.12.12 / 98e8e579, deploy45592086696
succeeded at2026-11-25T10:15:49Z through normal production review. PR328
consolidates compile task history/state/lookup, metadata lists, current-source
details and lease recovery. Bounded retry of rolled-back DB deadlocks keeps
existing evidence locks; model/business/permission errors are not retried.
Stage CI1051pass/zero skips; main CI45591922862 and scan45591922703pass.
No DDL,55tables. Health/ready and anonymous task queries pass. Fixed17items
remain7complete/10unfinished. See docs/50-deployment/140-compile-operations-release-20261125.md.

Historical production (2026-11-25): v0.12.11 / 4decdd6a, deploy45583316756
succeeded at2026-11-25T09:32:32Z through normal production review. PR326
consolidates topic/summary history paging, lookup and old-record review.
No local full-suite repetition: targeted implementation checks and grouped
browser acceptance, mandatory stage CI1049pass/zero skips; main CI45582817718
and scan45582817737pass. No DDL,55tables. Health/ready and anonymous history
refusal pass. Fixed17items remain7complete/10unfinished. Real external and
business gates stay open. See docs/50-deployment/130-operations-history-release-20261125.md.

Historical production (2026-11-25): v0.12.10 / fe0ec4be, deploy45571791463
succeeded at2026-11-25T08:01:14Z through normal production review. PR323 adds
graph page/neighborhood navigation; PR324 adds bounded XLSX literal-cell
sources with sheet/A1/type provenance and0022 migration45571486614 (55 tables).
PR1049 tests pass/zero skips, including real XLSX processing-to-publication/
search/withdrawal/rollback and full migration replay over an XLSX row. Main
CI45571127548 and scan45571127246 pass. Health/ready/dependencies and anonymous
API refusal pass. Fixed17 items remain7complete/10unfinished; external and
business gates remain open. See docs/50-deployment/120-graph-xlsx-release-20261125.md.

Historical production (2026-11-25): v0.12.9 / 3b3fb0da, deploy45561196377
succeeded at2026-11-25T06:37:39Z through normal production review. PR319 adds
current-authority directory paging; PR320 fixes DOCX v2 database CHECK with
0021/migration45559421934 (55 tables); PR321 bounds shared-proof fingerprint
work. PR1047 tests pass/zero skips; main CI45560881319 and scan45560881362
pass. Health/ready/dependencies and anonymous paging/export refusal pass.
v0.12.8 was cancelled before deployment, keep its tag fixed. Fixed17 items
remain7complete/10unfinished; real Agent/Atlas/authority, scale and business
gates remain open. See docs/50-deployment/110-directory-contract-release-20261125.md.

Historical production (2026-11-25): v0.12.7 / daa1a244, owner-authorized deploy
45553159505 succeeded at2026-11-25T05:29:58Z via normal production review.
PR315 adds cited Atlas topic summaries with immutable storage/review/source
invalidation; PR316 adds graph keyboard/list navigation and bounded synthetic
browser measurements; PR317 adds versioned rectangular DOCX table sources.
Main CI45552916335 and secret scan45552916496 pass; final PR1044 tests pass,
zero skips. Migration0020/run45550827446 verified55 tables. Health/ready and
anonymous protected API refusal pass. Fixed17 items remain7complete/10unfinished;
real Atlas billing, Agent/Ontos/platform and business/scale gates stay open.
See docs/50-deployment/100-model-graph-source-release-20261125.md.

Historical production (2026-11-25): v0.12.4 / 683b9c08, owner-authorized deploy
45546957842 succeeded at2026-11-25T04:34:57Z via normal production review.
PR311 adds explicit up-to20-library OBO knowledge packages under the same
authority/attachment snapshot; PR313 adds bounded structural-community graph
navigation. Main CI45546463062 and secret scan45546463075 pass; PR CI45545741776
ran1039 tests, all passed, zero skips. No DDL;54 tables retained. Canonical
health/ready confirm version/dependencies; anonymous package/topics/history
GET and source-search POST refuse401. Fixed17 items:7complete/6inprogress/
4pending,10unfinished. External and business gates remain open. See
docs/50-deployment/90-cross-library-community-release-20261125.md.

Historical production (2026-11-25): v0.12.3 / 3ae8bd79, owner-authorized deploy
45543274150 succeeded at2026-11-25T04:07:26Z via the existing production gate.
PR310 adds immutable extractive topic drafts, deduplication and live source/
review invalidation hiding. Main CI45542575859 and secret scan45542575866
passed; PR CI45542337991 ran1036 tests, all passed, zero skips. Reviewed
db-init45542856873 applied0019 and verified54 declared tables. Canonical
health/ready confirm the release and dependencies; anonymous topic GET/POST
refuse401. No model synthesis/approval or business cutover implied. Fixed
checklist remains7complete/10unfinished. See
docs/50-deployment/80-topic-dossiers-release-20261125.md.

Historical production (2026-11-25): v0.12.2 / 7cca363f, owner-authorized deploy
45540152162 succeeded at2026-11-25T03:34:02Z via the normal production gate.
PR306/307/308 deliver exact source-only RP/OBO search, immutable publication
audit/version comparison and real PostgreSQL SOP revision lifecycle coverage.
Main CI45539806154 and secret scan45539806140 pass; final PR CI45539531251
ran1034 tests, all passed, zero skips. Canonical health/ready confirm this
version and db/redis/storageConfig ok; anonymous source-search POST/history/
package reads refuse401. No DDL;53 tables retained. Fixed checklist remains
7complete/10unfinished; external and business acceptance are open. See
docs/50-deployment/70-sources-audit-release-20261125.md.

Historical production (2026-11-25): v0.12.1 / 9bfa2d3e, owner-authorized run
45532514296 succeeded at 2026-11-25T02:28:19Z through the normal production
review gate. PR303/304 provide grouped graph navigation, published relation
topics/evidence search and complete authorized overviews within existing
budgets. Main CI45532115482 and secret scan45532115547 passed; final PR CI
45531804106 ran1026 tests, all passed, zero skips. Canonical health/ready
confirm this version, db/redis/storageConfig ok; anonymous package/export/
maintenance/compile-task reads refuse401. No new DDL. K3a function delivery
complete; fixed checklist now7complete/10unfinished, K3b and business/external
acceptance remain open. See docs/50-deployment/60-knowledge-exploration-release-20261125.md.

Historical production (2026-11-25): v0.12.0 / c6ab3320, owner-authorized run
45483761795 succeeded at 2026-11-24T20:49:34Z through the existing production
review gate. Main CI45483291937 and secret scan45483291372 passed. PR301 ran
1019 tests, all passed, zero skips. Production db-init45474033618 applied
0016/0017; db-init45482679667 applied0018 and verified all53 declared tables.
Canonical health/ready confirm v0.12.0, db/redis/storageConfig ok; anonymous
knowledge-package/export/maintenance/compile-task reads refuse401. This is an
additive application release, not business cutover or external integration
acceptance. Fixed K checklist remains6complete/11unfinished. See
docs/50-deployment/50-knowledge-platform-release-20261125.md.

Historical production (2026-11-23): v0.11.8 / 01e7065a, owner-approved run
45119134160 succeeded at05:46:09Z. DDL0015/run45115340531 succeeded first;
41 tables. Canonical readiness confirms db/redis/storageConfig ok. Explicit
product roles are live; authenticated members page shows the authorized owner
and prevents ordinary owner-role edits. Synthetic-member/revocation/OBO
acceptance remains open. See60-explicit-product-roles-20261123.md.

Historical production checkpoint: v0.11.6 / 3ffb891c, owner-approved run
45094898500 succeeded at 09:36:42 CST. Target-domain /api/ready confirms production
version, db/redis/storageConfig ok. 883 tests/zero skips and all PR/main CI passed.
P9.8 real receipts pass: fetch/parse/chunk completed, embed parks with
upstream_account_refused; commit not reached. Atlas issue147 remains open.
Cross-release object read and platform-observed ingest C3 pass; download hash,
indexing, grounded answers, search/ask C3 and AI receipts remain open.
P9.9 browser logout now succeeds: protected task API becomes unauthenticated,
Karda returns to login gate, refreshed Opera retains workforce authentication.
Cross-product/back-channel logout and permission-message delivery still need real
acceptance. P9.10 corrects parked/failed detail states and removes authored Agent
activity/proposals from the production hub; PR248 merged as43fffd91. PR CI passes
883 tests/zero skips; main CI45059533565 and secret scan also pass. v0.11.5
pins43fffd91; run45059723049 succeeded. Readiness and authenticated P9.10 hub/stage acceptance pass: embed is paused,
Agent proposals/activity empty and demo=false. P9.11 fixes shell/overview demo
traffic fallback and unknown health/gap counts; PR251 merged3ffb891c, deployed and accepted.
P9.11 main CI45094710951 and secret scan45094710966 pass;883 tests/zero skips.
v0.11.6 pins3ffb891c; run45094898500 succeeded. Authenticated shell/overview
and home pass: real zero traffic, unknown metrics null, no fabricated warnings.
Overview per-asset authored ops retain demoOps provenance; wider demo cleanup
and remaining business acceptance are not covered by P9.11.

Legacy-host retirement remains platform issue727. See the batch tracker.

Owner scope: modify Karda only; report platform gaps as detailed issues. Do not
edit platform sources, create platform worktrees, change platform server variables
or manually install edge routing. Platform L2/L3 admission uses configuration;
Karda runtime settings use its normal deployment pipeline. This owner constraint
overrides historical instructions above to fix platform standards directly.

Inherited from the template at instantiation (2026-07-22): the governance shell,
the platform integration layer (C1 OIDC RP / C2 entitlement / C3 provisioning +
usage), the business-face DB baseline, the offline verification pages, and the
tag-to-env deploy pipeline. All of that is offline Mock-green in the template and
carries over unchanged.

At instantiation, not yet done for karda: GitHub bootstrap (repo creation, secret scanning, first
push, first CI run, ruleset apply - see `docs/50-deployment/20-github-bootstrap-
checklist.md`), platform-side registration (OIDC clients, secrets, edge vhost -
see `10-platform-registration-checklist.md`), and the entire karda product domain.
`docs/70-workplan/00-index.md` is the live tracker.

## Branch model

Single long-lived branch: `main` (trunk-based). Deploys are NOT tied to merges -
they are triggered only by pushing a release tag, which also selects the
environment (product repos default to two tiers):

- `main` - the only integration branch. All feature work merges here via PR.
  Merging to `main` does NOT deploy anything by itself.
- `beta-YYYYMMDD.N` tag - deploys the beta stack. No approval gate.
- `vX.Y.Z` tag - deploys the production stack. Gated by a required reviewer on
  the `production` GitHub Environment - the deploy job pauses until approved.

`dev-*` and `varda-*` tags are platform-repo-only; product repos do not build
develop/varda environments.

Always branch off `origin/main`, never off a stale local branch.

## How to make a change (the only path)

1. `git fetch origin && git switch -c <feature> origin/main`
2. Commit work on the feature branch.
3. Open a PR into `main`. Direct `git push origin main` is BLOCKED by the ruleset
   (must go through a PR, and the required checks must pass).
4. CI runs on the PR. Squash-merge once green; the branch is auto-deleted on
   merge. This does not deploy anything.
5. When ready to release, cut a tag from the commit you want deployed and push it.

Squash merge only (merge commits and rebase merges are disabled) to keep a linear
history.

### Bootstrap order (empty repo)

The branch-protection ruleset is applied LAST, not first: `git init` -> establish
`main` -> first-push `main` and let CI produce the required checks once -> THEN
apply `main-ruleset.json`. Applying a restrictive ruleset before the first code
import would block that import.

## Branch protection (GitHub Rulesets, not legacy protection)

Enforced via repo Rulesets (`gh api repos/vxture/<repo>/rulesets`). Legacy
`branches/*/protection` returns 404 - do not look there. The authoritative
ruleset is `docs/50-deployment/rebuild/main-ruleset.json`:

- `main` (single ruleset): require PR (0 approvals - checks gate merges, not human
  review), require the five status checks below (strict / up-to-date with base),
  block deletion, block non-fast-forward, require linear history, squash-only.
- `bypass_actors` MUST stay empty (`[]`). The bootstrap reference carried an admin
  `bypass_mode: always` entry that made every rule advisory for admins - a direct
  `main` push (bypassing `gitleaks`/`audit`) succeeded silently. Removed 2026-07-28
  (TD-011); do not reintroduce it. Break-glass is preserved: an admin can still edit
  or disable the ruleset, but that is a recorded config change, not an invisible
  per-push exemption.
- `production` GitHub Environment: required reviewer - every `v*.*.*` tag deploy
  pauses here until approved.
- `beta` GitHub Environment: no reviewer gate.

**Required checks (authoritative set of five):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`. CI job names must produce exactly these
five contexts - renaming a job breaks branch protection. A skeleton repo with no
unit tests still provides a permanently-green `test-coverage` job (it occupies the
context; zero tests passes). Never remove a check from the required set.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main` (the squash commit that
lands on main is a new SHA, so it gets its own gate run); it does NOT deploy.

- `changes` decides whether the diff contains anything but docs. It exists
  because this repo can NEVER put `paths-ignore` on `ci.yml`: a required context
  that never runs never reports, and branch protection then blocks a docs-only
  PR forever with nothing to click. So the jobs always run (the contexts always
  report) and only the expensive steps are skipped. It fails OPEN - anything
  unexpected runs the full gate. `check-workflows.mjs` now refuses a path filter
  on any workflow carrying a required check; `codeql.yml` may use one because
  `analyze` is not required.
- `check-atlas-contract.mjs` refuses two things: a branch on an Atlas error code
  Atlas does not publish, and any use of the LEGACY tenant authorization axis
  (`taskProfile`) in non-comment source. karda authorizes on the PRODUCT axis -
  it sends `endpointCode` (`chat/default` / `embedding/default` / `rerank/default`
  / `chat/extract`), per `vxture-atlas#47`. A `taskProfile` sent beside an
  `endpointCode` is silently ignored by the selector precedence, so that residue
  fails quietly and needs a machine check. It also refuses a branch on a code, checked against a vendored snapshot of their
  `/.well-known/vxture-contract` artifact (`kb/atlas/contract.snapshot.json`).
  This is the fix for `#100`, where karda branched on `QUOTA_EXHAUSTED` - a code
  that has never existed - and the dead branch type-checked and passed review.
  The vocabulary is Atlas's and the POLICY (which codes park) is ours; the check
  guards the seam between them. The snapshot fingerprint is provenance, NOT a
  pin, and is deliberately not compared against production: CI cannot reach the
  tailnet, and a check that silently cannot run is worse than none.
- `quality-gate` aggregates the static checks: `git diff --check`, the docs
  numbering guardrail (`node scripts/guardrails/check-docs-numbering.mjs --strict`),
  and the data-architecture guardrail (DDL <-> Prisma lockstep).
- `build`: `pnpm type-check:all` plus the Next.js standalone production build.
  Also its own required check.
- `test-coverage`: `pnpm --filter @karda/app test`.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml` for known dependency vulnerabilities, hard-blocking on any new
  finding, with `--config .osv-scanner.toml`. Exceptions are recorded per
  package-version in `.osv-scanner.toml` with a reason - never suppressed by
  removing the check.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`, rules in `.gitleaks.toml`. Its
  `push` trigger is scoped to `main`: a bare `push:` scanned every branch commit
  AND then scanned the identical SHA again on `pull_request`. Layers 1 and 3 of
  the secret-hygiene posture (push protection, the local pre-commit hook) cover
  the branch commits that now have no PR yet.

None of these run on a tag push - cutting a release tag ships whatever is already
at that commit on `main`, it does not re-verify the gates.

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action are inherited from
the template, where they were exercised end-to-end against a live demo
instantiation. For karda they are authored but unexercised until the GitHub and
platform bootstrap checklists are done.

## Secret hygiene (four layers)

Credentials never enter the repo - only environment/config injection. Leaks are
revoked at the source console, not scrubbed from history. Dev-phase repos are
PUBLIC (no private fallback), so "credentials never committed" is an absolute
rule, not a posture backed by a private boundary.

1. GitHub secret scanning + push protection (repo setting) - blocks on push. On a
   public repo these are free and fully enabled (a private repo would need GHAS),
   so this layer is actually stronger here.
2. `gitleaks` CI (`.github/workflows/secret-scan.yml`) - CI layer 2.
3. Local `.husky/pre-commit` - wire once per clone with
   `git config core.hooksPath .husky` (and install gitleaks locally, e.g.
   `scoop install gitleaks`). Missing binary warns and passes, never blocks.
4. Public posture, all-rights-reserved. A public repo defaults to
   all-rights-reserved; ship NO LICENSE file and NO `license` field / `@license`
   marker - a stray open-source marker would actually grant rights (public != open
   source). `package.json` keeps `"private": true` as an npm-publish guard, which
   is unrelated to GitHub repo visibility.

Shared credentials (ACR, tailscale, npm token, and the worker-02 deploy-target
secrets `DEPLOY_WORKER02_*` - HOST/USER/PORT/KNOWN_HOSTS/SSH_KEY/SSH_KEY_PASSPHRASE)
are org-level: configured once and shared to selected repos, not duplicated per
repo. `DEPLOY_DIR` and `ENV_FILE_BASE64` stay per-repo (they are per-product, not
host-pointing). The deploy workflows keep their local env-var names (`DEPLOY_HOST`
etc.) and only read from the renamed `secrets.DEPLOY_WORKER02_*`.

## Dependency security (SCA)

`audit` = osv-scanner hard gate over `pnpm-lock.yaml`. Fix (upgrade / pnpm
override / exact pin for peer-only deps) or record a named `[[PackageOverrides]]`
exception with a reason - never widen the gate (no `continue-on-error`, never
removed from required). Karda starts from the template's empty ignore baseline;
do not copy another repo's named ignores.

## Docs taxonomy

`docs/` follows the org docs taxonomy (`070-docs-taxonomy.md`) for the shared
skeleton: top-level decades `00-meta` / `10-standards` / `20-specs` / `30-design`
/ `40-implementation` / `50-deployment` / `60-operations` / `70-workplan` /
`80-liaison` / `90-memory`; map in `docs/00-meta/00-index.md`. Numbered = formal,
unnumbered = temporary (delete or number it).

**In-repo organization is delegated to this repo** (taxonomy section 3, owner
2026-07-22). The local authority is `docs/00-meta/10-docs-convention.md`; read it
before adding any document. The short version:

- Local documents are `NN(N)-slug.md`. The platform repo's
  `{kind}_{domain}_{NNN}_{slug}` domain family is **not legal here** - a
  single-domain repo separates by directory and number band, so a domain prefix
  is noise. A `product_*` / `data_*` / `design_*` reference in our docs always
  points at a PLATFORM-repo document.
- `30-design/` uses three digits with bands `1xx` design / `2xx` contracts and
  schema / `3xx` implementation; every other directory uses two digits. Digit
  count is uniform per directory or the lexical sort breaks.
- Directories are numbered too, with exactly two named exceptions pinned by org
  standards: `30-design/decisions/` and `50-deployment/rebuild/`.
- `check-docs-numbering.mjs` enforces all of it (file names, directory names,
  root-only README whitelist). It diverges from the platform implementation on
  purpose - see the convention section 7.

ADRs live in `docs/30-design/decisions/` with stable append-only IDs; the
tech-debt register lives in `docs/60-operations/` (`TD-NNN`, every entry carrying
one `- **Status**:` line and an index row - `check-tech-debt.mjs` enforces both,
after an audit found three entries still describing work that had shipped weeks
earlier); runbooks are
`NN-run-{slug}.md`.

## Rigid zone / blank zone

**Rigid (do not deviate):** the entire governance base; CI/CD key names, job
names, workflow semantics; the three-channel module endpoints/signing/idempotency/
gating formula/cache discipline; value-domain consumption; DB governance (DDL
three-part + column locks + db-init as the sole structure-change path); docs
numbering; the data-face hard constraints.

**Blank (karda decides; the template left an empty slot):** domain pages and
components; karda's domain schemas (naming/count product-decided; the
`vx_provision` / `local_authz` / `local_usage` names are reserved); role/permission
catalog values; the content of the capability matrix and billing model (format is
reference only); the `20-specs/` product definition; domain guardrails. Karda's
knowledge model, processing pipeline, retrieval tooling, and arda channel all live
in this zone - they are designed in this repo, not inherited.

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Squash merges make `git branch -d` report merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.

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
