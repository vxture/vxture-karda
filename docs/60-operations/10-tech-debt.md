# Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused). Path pinned by the org taxonomy section 4
(`60-operations/10-tech-debt.md`, calibrated 2026-07-22).

Per the platform's deviation discipline (`140-repo-governance-standard.md`,
execution model): a standard clause that cannot yet be met because an upstream
dependency is not ready must be (1) annotated at the implementation site, (2)
registered here by name (clause / reason / recovery condition), and (3) reported
to the platform line. Silent deviation fails self-rectify acceptance.

Karda was instantiated from `vxture-template` after the template closed its own
two debts (the `@vxture/shared` value-domain dependency, and a vendored
health-identity implementation that deviated from standard 025), so the inherited
code is already compliant: the liveness route and the entitlement value domains
import `@vxture/shared` directly rather than re-implementing anything locally.
Those closed entries are the template's history, not karda's, and are
deliberately not carried over.

| ID | Title | Opened | Status |
|----|-------|--------|--------|
| TD-001 | Production-only deploy tier; the standard's two-tier default (beta + production) is deliberately not adopted | 2026-07-22 | **accepted** 2026-07-23 - standing deviation, not a backlog item |

## TD-001 - production-only deploy pipeline

- **Clause deviated from**: `140-repo-governance-standard.md` section 4 - product
  repos **default** to two tag->env tiers, `beta-*` -> beta and `v*.*.*` ->
  production.
- **Reason**: owner decision 2026-07-23 - karda ships **production only** on
  worker-02. No beta tier is provisioned, and arda's own beta stack (`/srv/md1`,
  port 3231, `beta-arda.vxture.com`) is slated for teardown, so karda would be
  building a tier the org is actively retiring.
- **Status change**: this entry opened 2026-07-22 as an *unfinished* item
  ("inherited prod-only, no beta target assigned yet"). It is now an *accepted
  standing deviation* - the clause says "default", and the owner has chosen
  otherwise with the tradeoff in view. It stays registered rather than closed
  because a registered deviation is exactly what the discipline asks for; closing
  it would erase the record that the default was consciously not taken.
- **Tradeoff accepted**: no pre-production tier. A `v*.*.*` tag is the first time
  code runs on a real host, so the required-reviewer gate on the `production`
  environment carries the full weight of pre-deploy scrutiny, and rollback
  (`rollback.yml`, pulls an immutable `sha-` tag) is the only recovery path.
- **Annotated at**: `.github/workflows/deploy.yml` header comment - including a
  warning not to add a `beta-*` trigger without reopening this decision, since a
  tag prefix with no environment behind it fails confusingly.
- **Reopen condition**: the owner decides karda needs a pre-production tier. That
  requires a beta host/port allocation, the `beta-*` trigger and routing branch,
  a `beta` GitHub Environment (no reviewer gate) with its own `DEPLOY_*`, and an
  env-aware `stack_root`/`deploy_dir` (currently hardcoded to the production
  `/srv/md0/karda`). `vxture-arda`'s `deploy.yml` is the reference implementation.
- **Report to platform line**: carried by
  `docs/80-liaison/40-2607230036-karda-platform-registration-b.md`.
