# GitHub bootstrap checklist

One-time GitHub setup for `vxture-karda`. Code-external, owner action. Authority:
`140-repo-governance-standard.md` section 1 / section 6 and
`product_240_repo-template.md` section 2.8.

## Repo and branch protection - do these first

- [ ] Create the repo PUBLIC (dev-phase repos are public; 140 section 2). A
      public repo defaults to all-rights-reserved - ship no LICENSE file and no
      `license` field (public != open source); clean any stray open-source marker.
- [ ] Enable GitHub secret scanning + push protection (repo Settings) - free and
      fully available on a public repo, and the primary defense now that there is
      no private fallback.
- [ ] ORDER MATTERS (empty repo): first-push `main` and let CI run once so the
      required checks are produced, THEN apply the ruleset. Applying a restrictive
      ruleset before the first import blocks that import.
  - [ ] `git push -u origin main` (establishes `main`, triggers first CI run).
  - [ ] Confirm the five checks appear and go green: `quality-gate` / `build` /
        `test-coverage` / `audit` / `gitleaks`.
  - [ ] Apply the ruleset:
        `gh api repos/vxture/vxture-karda/rulesets --method POST --input docs/50-deployment/rebuild/main-ruleset.json`
  - [ ] Verify: `gh api repos/vxture/vxture-karda/rulesets` shows a branch ruleset
        whose required checks include the five contexts.
- [ ] Share the org-level `NODE_AUTH_TOKEN` to this repo. Unlike the template's
      empty batch 1, karda's inherited code has a real `@vxture/shared`
      dependency, so `build` and `test-coverage` FAIL on the first CI run without
      it. Same for the other org-shared credentials/vars used by build:
      `ALIYUN_ACR_USERNAME/PASSWORD`, `TAILSCALE_OAUTH_*`,
      `ALIYUN_ACR_REGISTRY/NAMESPACE`, `VXTURE_NPM_REGISTRY`,
      `TAILSCALE_OAUTH_CLIENT_TAG`.
- [ ] Leave the `PRODUCT_CODE` repo variable UNSET. It is the template's demo
      escape hatch; `karda` is already baked into the source, and setting the
      variable would repoint the image, stack root, containers, and DB names.

## Deployment (Environments + `DEPLOY_*`) - after the repo exists

Nothing is inherited here: repo-level and environment-level secrets do NOT carry
over from the template. Allocation decided 2026-07-23 (owner):

| Item | Value |
|------|-------|
| host | worker-02 (`vx-worker-02`, tailnet, IP `100.76.219.48`) |
| profile | non-VPC -> **GHCR primary + ACR fallback** |
| stack root | `/srv/md0/karda` |
| `DEPLOY_DIR` | `/srv/md0/karda/deploy` |
| `APP_PUBLISH_PORT` | **3233** (arda holds 3230/3231, vxtpl demo 3232) |
| tiers | **production only** - see TD-001 |

- [x] `APP_PUBLISH_PORT` repo variable = `3233`.
- [x] `production` GitHub Environment **with a Required reviewer**. Zero
      protection means a pushed tag deploys immediately with no pause - that is
      the varda lesson, do not skip it. No `beta` environment is created:
      karda is production-only, and a `beta-*` tag has nothing to route to.
- [x] Non-secret environment values: `DEPLOY_HOST` = `vx-worker-02`,
      `DEPLOY_USER` = `stone`, `DEPLOY_PORT` = `22`, `DEPLOY_DIR` =
      `/srv/md0/karda/deploy`. `DEPLOY_DIR` must be the EXACT directory holding
      the compose file and `.env` - one level off (`/srv/md0/karda`) and the
      image pulls but compose cannot find its env_file.
- [ ] `DEPLOY_SSH_KEY` (+ optional `DEPLOY_SSH_KEY_PASSPHRASE`) - a private key
      authorized for `stone` on worker-02. **Owner transport.**
- [ ] `DEPLOY_KNOWN_HOSTS` (required, not optional): `ssh-keyscan -p 22
      vx-worker-02` from a trusted network. The `tailnet-ssh-connect` action is
      fail-closed on an empty known_hosts and will not fall back to TOFU, so a
      missing value fails the deploy rather than silently degrading it.
      **Owner transport.**
- [ ] `ENV_FILE_BASE64` - base64 of karda's `.env`, built from `.env.example`
      (host `karda.vxture.com`, DB `vxturebiz_karda_prod` / role `karda_svc`,
      `APP_PUBLISH_PORT=3233`, plus the OIDC / webhook / internal-job secrets).
      Bootstrap only writes it when the host has no `.env`; an existing one is
      never overwritten. **Owner transport.**
- [ ] `KARDA_DB_SVC_PASSWORD` - service-role password. **Owner transport.**
- [ ] SSH worker-02 once: `mkdir -p /srv/md0/karda`, confirm GHCR/ACR login works
      from there.
- [ ] Edge vhost + DNS + firewall - requested in
      `docs/80-liaison/40-2607230036-karda-platform-registration-b.md`.

## Release

- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z`, then approve the pending
      `production` deployment. There is no beta tier - a `v*.*.*` tag is the
      first time code runs on a real host, so that approval gate carries the
      full weight of pre-deploy scrutiny (TD-001 records the accepted tradeoff).
- [ ] Recovery is `rollback.yml`, which pulls an immutable `sha-<short>` tag.
- [ ] DB structure changes go through `db-init.yml` (`confirm=yes` +
      `expected_sha` + the approval gate), never the deploy chain.
