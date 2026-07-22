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
over from the template. Everything below starts empty and must be created for
karda.

- [ ] Decide the deploy target with the owner: host profile (tailnet/VPC ->
      ACR primary, or non-VPC -> GHCR primary + ACR fallback), stack root
      `/srv/md0/karda`, and a published port that does not collide with the
      products already on that host.
- [ ] `APP_PUBLISH_PORT` repo variable = the assigned port.
- [ ] GitHub Environments: `production` with a Required reviewer (a `v*.*.*` tag
      deploy then pauses until the owner approves), and `beta` with no gate.
      Zero protection means a pushed tag deploys immediately - that is the varda
      lesson, do not skip it.
- [ ] Per environment: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`,
      `DEPLOY_SSH_KEY` (+ optional `DEPLOY_KEY_PASSPHRASE`), and `DEPLOY_DIR`
      pointing at the EXACT stack directory that holds the compose file and
      `.env` (`/srv/md0/karda/deploy`, not `/srv/md0/karda` - one level off and
      the image pulls but compose cannot find its env_file).
- [ ] `DEPLOY_KNOWN_HOSTS` (required, not optional): `ssh-keyscan -p <port>
      <host>` from a trusted network. The `tailnet-ssh-connect` action is
      fail-closed on an empty known_hosts and will not fall back to TOFU.
- [ ] `ENV_FILE_BASE64` - base64 of karda's `.env`, built from `.env.example`
      (host `karda.vxture.com`, DB `vxturebiz_karda_prod` / role `karda_svc`,
      plus the OIDC / webhook / internal-job secrets). Bootstrap only writes it
      when the host has no `.env`; an existing one is never overwritten.
- [ ] SSH the deploy host once: create `/srv/md0/karda`, confirm the registry
      login works from there.

## Release

- [ ] `git tag beta-YYYYMMDD.N && git push origin <tag>` for beta;
      `git tag vX.Y.Z && git push origin vX.Y.Z` for production, then approve the
      pending `production` deployment.
- [ ] DB structure changes go through `db-init.yml` (`confirm=yes` +
      `expected_sha` + the approval gate), never the deploy chain.
