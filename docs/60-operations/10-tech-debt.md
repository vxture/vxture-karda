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
| TD-001 | Beta tier not yet wired: development phase deploys straight to production, so the standard's second tag->env tier is dormant | 2026-07-22 | open - awaiting the beta server |

## TD-001 - beta tier not yet wired

- **Clause not yet met**: `140-repo-governance-standard.md` section 4 - product
  repos run two tag->env tiers, `beta-*` -> beta and `v*.*.*` -> production.
- **Standing org plan, unchanged**: beta + production is the standard deployment
  model for **all** vxture products. Karda is not opting out of it. What defers
  the beta half is phase and hardware, not design.
- **Reason**: during the development phase every product deploys **straight to
  production**. Karda's production stack targets **worker-02**; beta is a
  reserved release channel that will get **its own separate server**, not yet
  prepared. Until that server exists a `beta-*` tag would route to nothing, so
  the trigger stays out - a tag prefix with no environment behind it deploys
  nothing and fails confusingly.
- **Do not infer beta's target from arda.** Arda currently runs its beta on
  worker-02 (`/srv/md1/arda-beta`, port 3231), but that stack is slated for
  teardown; karda's beta belongs on the future dedicated server.
- **Annotated at**: `.github/workflows/deploy.yml` header comment.
- **Recovery condition**: the beta server is prepared and allocated to karda.
  Then add the `beta-*` tag trigger, the beta branch of
  `detect-target-environment`, an env-aware `stack_root`/`deploy_dir` (both
  currently hardcoded to the production `/srv/md0/karda`), the `beta` GitHub
  Environment (no reviewer gate) with its own `DEPLOY_*`, and the `karda-beta`
  OIDC client (deferred in liaison letter `20-2607222338` section 3.2); close
  this entry. `vxture-arda`'s `deploy.yml` is the reference two-tier routing.
- **Interim risk accepted**: with no pre-production tier live, a `v*.*.*` tag is
  the first time code meets a real host. The required-reviewer gate on the
  `production` environment therefore carries the full weight of pre-deploy
  scrutiny, and `rollback.yml` (pulls an immutable `sha-<short>` tag) is the only
  recovery path.
- **Report to platform line**: carried by
  `docs/80-liaison/40-2607230909-karda-platform-registration-b.md`.
