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
| TD-001 | Deploy pipeline is prod-only; the standard's two-tier default (beta + production) is unmet | 2026-07-22 | open |

## TD-001 - prod-only deploy pipeline

- **Clause deviated from**: `140-repo-governance-standard.md` section 4 - product
  repos default to two tag->env tiers, `beta-*` -> beta and `v*.*.*` ->
  production.
- **Reason**: `deploy.yml` is inherited verbatim from `vxture-template`, which was
  deliberately prod-only for its single demo instantiation. Karda has **no deploy
  target at all** yet - no host, no port, no GitHub Environment, for either tier -
  so there is nothing for a `beta-*` tag to route to. Authoring a beta branch of
  the routing against an undecided target would be invention, not inheritance.
- **Two tiers remain the target** (owner confirmed 2026-07-23). This is an
  unfinished item, not an accepted deviation: karda will adopt the section 4
  default once a host exists. Karda is simply **not deployed for now**.
- **worker-02 is ruled out** (owner 2026-07-23) - do not infer karda's target
  from arda's, and do not copy its host/port/array layout. Arda's own beta stack
  is slated for teardown, which is a fact about arda, not a precedent for karda.
- **Annotated at**: `.github/workflows/deploy.yml` header comment.
- **Recovery condition**: the owner assigns karda deploy hosts/ports. Then add the
  `beta-*` tag trigger, the beta branch of the `detect-target-environment`
  routing, an env-aware `stack_root`/`deploy_dir` (both currently hardcoded to
  `/srv/md0/<code>`), the `beta` GitHub Environment (no reviewer gate) and the
  `production` one (required reviewer), and their `DEPLOY_*` secrets; close this
  entry. `vxture-arda`'s `deploy.yml` is the reference two-tier implementation.
- **Report to platform line**: pending - goes out with the next liaison letter
  (`docs/80-liaison/`). The taxonomy letter was docs-only and did not carry it.
