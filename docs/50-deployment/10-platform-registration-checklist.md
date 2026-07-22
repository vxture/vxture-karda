# Platform-side registration checklist

Owner / platform-line actions taken on the PLATFORM side to bring karda online.
These are code-external and are performed in the platform repo and platform
consoles, not here. Authority: `product_240_repo-template.md` section 2.8.

Product code `karda`; names below are the concrete derived values.

## Directory and plan

- [ ] Add the karda row to the platform product directory: `code=karda` / `layer`
      (L1/L2/L3) / `type`.
- [ ] Seed the plan structure (subscription tiers) for karda.

## OIDC (customer realm)

- [ ] Register the production OIDC client `karda`. Realm = customer.
      **A single client, not the canonical pair**: the double client exists
      because back-channel logout is a single-URI hard constraint per tier, and
      karda has one tier (production only, TD-001). Do NOT register
      `karda-beta` - withdrawn in liaison letter `40-2607230036`.
- [ ] Set each client's `redirect_uri`, `post_logout_redirect_uri`, and
      `back_channel_logout_uri` (prod host `karda.vxture.com`).
- [ ] Set allowed scopes to `openid profile email phone` (retired product-code and
      commercial scopes are not registered).

## Edge

- [ ] Request the edge vhost `karda.vxture.com` -> the assigned deploy host and
      published port. Track the request as a `docs/80-liaison/` letter.

## Provisioning webhook (C3)

- [ ] Register karda in `product_webhooks` with its tailnet delivery address
      (`KARDA_WEBHOOK_BASE_URL`).
- [ ] Add `KARDA_PROVISION_WEBHOOK_SECRET` to the platform env; the owner
      hand-transports the secret value to this repo's GitHub secrets.

## Secrets transport

- [ ] All secret values are owner-transported (never committed, never sent over
      insecure channels). Org-level shared credentials (ACR / tailscale / npm
      token) are configured once at the org and shared to this repo - not
      duplicated per repo.

## Sequencing

Karda inherits the platform-integration layer already built, so these rows are
what stands between the inherited code and a live production stack. Nothing here blocks the
GitHub bootstrap checklist (`20-github-bootstrap-checklist.md`), which can and
should run first - the repo needs to exist before any secret can be placed in it.
