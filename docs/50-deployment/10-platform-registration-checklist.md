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

- [ ] Register the OIDC client pair: `karda` (prod) and `karda-beta` (beta) -
      double client is canonical (back-channel logout is a single-URI hard
      constraint). Realm = customer.
- [ ] Set each client's `redirect_uri`, `post_logout_redirect_uri`, and
      `back_channel_logout_uri` (prod host `karda.ruyin.work`).
- [ ] Set allowed scopes to `openid profile email phone` (retired product-code and
      commercial scopes are not registered).

## Edge

- [ ] Configure the product edge domain in Opera: `karda.ruyin.work` -> `vx-worker-02:3240`
      (reallocated 2026-07-24, was 3233; letters `80-liaison/40-2607230909` +
      the port-change note). Production only for now; the beta vhost (port 3241)
      belongs with the future beta server (TD-001).

## Provisioning webhook (C3)

- [ ] Configure the signed lifecycle webhook in Opera:
      `https://karda.ruyin.work/api/webhooks/vxture`. Verify actual delivery and ACK;
      a saved URL does not prove reachability.
- [ ] Configure the webhook signing secret through Opera key management; the
      product runtime receives its own secret through normal secure deployment.
      Do not modify platform server variables.

## Secrets transport

- [ ] All secret values are owner-transported (never committed, never sent over
      insecure channels). Org-level shared credentials (ACR / tailscale / npm
      token) are configured once at the org and shared to this repo - not
      duplicated per repo.

## Atlas capability grants (separate product, separate line)

- [ ] Grant product `karda` the four Atlas endpoints - `chat/default`,
      `embedding/default`, `rerank/default`, `chat/extract`. **Procedure and
      impact: `docs/60-operations/40-run-atlas-endpoint-grants.md`**; tracked on
      `vxture-platform#55`.

Listed here only as a pointer. It is NOT a platform-side action in this
checklist's sense - Atlas is a separate product with its own repo, deployment and
management plane - but whoever works this checklist is the person who will
otherwise discover, at first upload, that karda indexes nothing.

## Sequencing

Karda inherits the platform-integration layer already built, so these rows are
what stands between the inherited code and a live production stack. Nothing here blocks the
GitHub bootstrap checklist (`20-github-bootstrap-checklist.md`), which can and
should run first - the repo needs to exist before any secret can be placed in it.

## 2026-11-22 cutover state

Owner target: karda.ruyin.work only. Production profile overrides persistent old
public origins after loading secrets. Opera must save home/edge domain, callback
/auth/callback, post-logout /, backchannel /auth/backchannel-logout, standard
webhook /api/webhooks/vxture and the /entry/karda-mark.svg logo. No legacy redirect
is requested. Saving currently returned500 and subsequent Opera page returned500;
read-back and actual signed delivery remain pending.


Follow-up read-back: owner completed second-factor verification. At04:16:52 CST
Opera records all seven new-domain fields above. Save is confirmed; routing is
not: browser health04:17:37 still returns Cloudflare520 (issue727). Use candidate
v0.11.1/cba6e16, deploy44945579438, after required production approval.
