# vxture-karda

Karda - the Vxture enterprise intelligent knowledge service platform.

This repository is instantiated from `vxture-template` (product code `karda`), so
it inherits the org governance base unchanged: trunk-based branching, the
branch-protection ruleset, four-layer secret hygiene, the SCA hard gate, the docs
numbering system, and the platform integration surface (OIDC RP, entitlement,
provisioning/usage).

**Package manager:** pnpm (whole-stack, owner-decided 2026-07-20). Do not
reintroduce npm workspaces.

---

## Cascaded names (product code `karda`)

| Thing | Value |
|-------|-------|
| OIDC clients | `karda` / `karda-beta` |
| compose project / containers | `karda-app` / `karda-redis` / `karda-db` |
| image name | `karda-app` |
| database | `vxturebiz_karda_beta` / `vxturebiz_karda_prod` |
| service role | `karda_svc` |
| workspace package scope | `@karda/*` |
| secrets | `KARDA_DB_SVC_PASSWORD`, `KARDA_PROVISION_WEBHOOK_SECRET`, `KARDA_WEBHOOK_BASE_URL` |
| public host | `karda.vxture.com` |

`.env.example` is the authoritative reference for every supported variable.

---

## Authority

The governing standards are NOT copied here; they live in the platform repo
(`D:\MyWebSite\vxture`):

- Governance (WHAT): `docs/10-standards/140-repo-governance-standard.md`
- Docs numbering: `docs/10-standards/070-docs-taxonomy.md`
- Template design: `docs/30-design/product_240_repo-template.md`
- Self-rectify runbook (HOW + machine checks):
  `docs/50-deployment/rebuild/20-self-rectify-runbook.md`

`docs/10-standards/` here carries a thin index pointing at those, not their text.
When a gap is not covered by an existing standard, fix the standard in the
platform repo first, then mirror it here - do not invent a standard in a product
repo.

---

## Repository state

The governance shell, the platform integration layer (C1/C2/C3), and the
business-face DB baseline arrive inherited from the template and are Mock-green
offline. Karda's own product work - the knowledge model, ingestion/processing
pipeline, retrieval tooling, and the arda channel - has not started. See
`docs/70-workplan/00-index.md` for the live tracker, and `docs/20-specs/` for the
product definition once it is formalized.

---

## Local development

```bash
pnpm install
pnpm type-check:all
pnpm lint
pnpm lint:docs-numbering
```

A `NODE_AUTH_TOKEN` with read access to GitHub Packages must be set so
`pnpm install` can resolve the `@vxture` scope (see root `.npmrc`).

---

## Working agreement

See [CLAUDE.md](CLAUDE.md) for the full repository working agreement: branch
model, tag-triggered release flow, the five required CI checks, secret hygiene,
SCA policy, docs taxonomy, and the rigid-zone / blank-zone boundary.
