# vxture-karda Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, on top
of the org governance base inherited unchanged from `vxture-template`.

This is Karda, the Vxture enterprise intelligent knowledge service platform. It
was instantiated from `vxture-template` with product code `karda`, so everything
below the product line - governance, CI/CD, the three platform integration
channels, the business-face DB baseline - is inherited and rigid. Karda's own
domain (knowledge model, ingestion/processing, retrieval tooling, arda channel)
occupies the template's blank zone.

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
`vxturebiz_karda_beta` / `vxturebiz_karda_prod` with service role `karda_svc`;
workspace package scope `@karda/*`; secrets `KARDA_DB_SVC_PASSWORD`,
`KARDA_PROVISION_WEBHOOK_SECRET`, `KARDA_WEBHOOK_BASE_URL`; public host
`karda.vxture.com`.

## Build status

Inherited from the template at instantiation (2026-07-22): the governance shell,
the platform integration layer (C1 OIDC RP / C2 entitlement / C3 provisioning +
usage), the business-face DB baseline, the offline verification pages, and the
tag-to-env deploy pipeline. All of that is offline Mock-green in the template and
carries over unchanged.

Not yet done for karda: GitHub bootstrap (repo creation, secret scanning, first
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
  pinned gitleaks binary, full-history `detect`, rules in `.gitleaks.toml`.

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

Shared credentials (ACR, tailscale, npm token) are org-level: configured once and
shared to selected repos, not duplicated per repo.

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
tech-debt register lives in `docs/60-operations/` (`TD-NNN`); runbooks are
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
