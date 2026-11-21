# Karda independent public entry

Status: implemented candidate, not deployed. Date: 2026-11-22.

## Design boundary

CoSpace v1.3.1 supplies the shared presentation rules. The frozen standard is
read-only. Karda owns only its K monogram, open-book knowledge motif, network
background and agent-knowledge copy. Ruyin identification, copyright and legal
links retain the confirmed shared presentation. Portal ShellViewport/navigation
are unchanged.

The product gate always shows WELCOME TO KARDA and a divided footer with an
explanation or the secure-account default. Every state shares a 480px internal
minimum height (440px below 700px), with natural growth rather than fixed height.
Core actions align to the bottom. The decorative layer never reserves content
space; its center is 169px from the internal top, 149px on mobile and 139.5px at
340px or below. Reduced-motion disables background drift.

## Actions and state semantics

- Sign-in uses the product /auth/login and server-validated returnTo.
- Subscribe/renew opens https://vxture.com/zh-CN/pricing?product=karda
  (en-US when English is selected). No workspace, cycle, tier or checkout intent
  is passed. Only an authoritative user.canManage exposes this action; the
  platform performs final purchase authorization. Ordinary members contact an
  administrator and recheck.
- Missing product assignment does not mean missing local business role. It says
  product access has not been assigned and never offers purchase. Local role
  enforcement remains in the business authorization boundary.
- Suspended/unknown subscription status offers administrator help and recheck,
  not a guessed commercial recovery action.
- Workspace selection goes to the console. Product mark goes to product root;
  website and legal links keep their separate destinations.
- Recheck runs a real, coalesced, abortable /api/access request with a 15s timeout.
  Controls are disabled while connecting; errors do not expose HTTP internals.
- No focus, visibility or interval handler requests access. Business requests
  remain the server authorization boundary.

## Evidence

Local Playwright checked sign-in, missing assignment, inactive account,
no-workspace and unconfigured states at 1440/390/320px: internal height 480/440,
shared motif centers 169/149/139.5, no horizontal overflow. Synthetic focus and
visibility events produced zero access requests. Desktop and mobile screenshots
are local output/playwright artifacts, intentionally not repository history.
Subscription/member/suspended action decisions have targeted unit coverage.
This is presentation and local behavior evidence, not real Accounts or production
acceptance. CI and deployment are tracked separately in workplan/20.
