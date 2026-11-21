# Karda remediation delivery record - 2026-11-22

## Scope and actual release state

Karda-only implementation, following the Arda integration lessons and frozen
CoSpace v1.3.1 presentation. No platform sources, worktrees, server variables or
edge configuration were modified. Platform gaps are issues, not local patches.

Baseline live production: v0.10.3 / 2f7b142a. Source merges do not deploy. No new
application deployment, paid inference, customer-data mutation or plan publication
has occurred. Owner-approved production db-init44941098583 applied the additive
0010/0011/0012 increments successfully; baseline assertion found all37 tables. All Redis/PostgreSQL test
writes target explicitly isolated local containers.

Actual release route is production only. TD-001 explicitly reserves beta until
its dedicated server is allocated; deploy.yml accepts only v*.*.* and GitHub has
only the production environment. No beta tag or beta acceptance is claimed.

## Ordered deliveries

| Batch | Delivered change | Merge evidence | Local tests |
| --- | --- | --- | --- |
| P0 | Evidence-based inventory, logout boundary and dependency vulnerability fixes | PR207 / ecc382d | 805 |
| P1 | Accounts refresh serialization, owner fencing, no resurrection/TTL extension, unknown vs revoked | PR208 / 6984f47 | 815 |
| P2 | Verified RFC8693 tickets, scoped assignment/C2 admission, pool aggregation and fail-closed configuration | PR209 / d342a2a | 822 |
| P3 | Signed lifecycle receipts, immutable tenant anchors, post-commit ACK and bounded reconciliation | PR210 / 0e4f643 | 837 |
| P4 | Same-transaction content usage, receipt validation and durable retry worker | PR211 / bf948da | 841 |
| P5 | Current Atlas 59-code contract, refusal parking, scoped calls and rerank validation | PR212 / 35d33ae | 845 |
| P6 | Independent Karda logo/motif/background and CoSpace entry/actions | PR213 / 43004f1 | 847 |
| P7 | Transactional invalidation outbox, replica cache versions and scoped browser SSE | PR214 / d216861 | 851 |
| P4.1 | Durable query usage before success, sanitized shared direct/MCP errors | PR215 / 4e115e1 | 854 |

Merged P0-P7 and P4.1 passed every required gate. All local full runs
above passed without skips and include actual isolated Redis/PostgreSQL where
applicable. Linux CI verifies the full standalone build; local Windows packaging
has a known EPERM symlink limitation, not a waived build check.

## Entry and event behavior

Ruyin mark, copyright/legal links and portal shell geometry are preserved.
WELCOME TO KARDA and divided explanations remain present. Shared internal
minimum heights are 480px desktop and 440px mobile, with natural content growth.
Decorations stay behind content, sharing centers 169/149/139.5px. Playwright
checked five entry states at 1440/390/320px without horizontal overflow.

Pricing conversion uses the Karda website product page. Management eligibility
controls its visibility; missing product assignment/unknown status never offers
a guessed purchase recovery. Retry executes a bounded/coalesced real check.

Normal focus/tab changes query no access. Browser connection initialization
checks once; only real generation/context changes recheck thereafter. Unchanged
reconnect has no access query. Explicit revoke clears business content. Keepalive
never reads authority or reports activity. Identity notification coverage remains
upstream-dependent and is not represented as fully live-accepted.

## Platform issues and external acceptance

- #720 (existing): ACK lifecycle version binding race.
- #724 (created): production/beta isolation of lifecycle read/webhook/ACK.
- #726 (created): customer logout and identity-context invalidation/recovery contract.
- Existing product subscription renewal issue715 remains relevant to the website
  flow; changing Karda's URL alone cannot implement the website renewal journey.

P5 follows published source contract fingerprint c1-ccd1b2cb48f8, not a claimed
live fingerprint. Actual Atlas endpoint grants, S2S audiences, complete knowledge
processing/retrieval/answering and token/C3 attribution require platform access
and a specifically authorized test workspace. Do not infer Karda subscription
from the earlier Arda Business subscription.

## P8 configuration and commercial work

Read current management registration and published plan versions before any
change. The August tier document contains obsolete status/cost/409 statements;
its 50GiB/500GiB/5TiB draft quantities are not confirmed published offers. Retain
owner decisions: broad agent functions, personal vs team form, enterprise private
sales. Do not copy Arda prices or quotas. A replacement offer must include seats,
storage, AI, library/documents/connectors and call metrics, show a whole-package
cost/contribution calculation, and remain a draft until confirmed. Management login was completed and the live baseline was inspected.

## P9 rollout checklist

1. Pin final green main SHA; record source and live versions separately.
2. Use the existing db-init workflow, expected_sha pin and production approval
   to apply 0010/0011/0012 with baseline and column locks. No startup migrations.
3. Build immutable candidate through the normal workflow. Deploy only through
   v*.*.* and the required human production reviewer. Preserve rollback SHA.
4. Verify health/readiness, schema/grants and worker delivery, real Accounts
   login/logout isolation, assignment/subscription, public button routes and SSE
   proxy behavior. Ordinary tab focus must produce no access request.
5. On an authorized test workspace, run a small import/parse/index/search/cited
   answer; compare local outbox and platform/Atlas consumption, then clean up
   only the explicitly authorized temporary artifacts.
6. Resolve remaining platform issues through their owners and record any
   unverified path explicitly. Update release ledger and this report with exact
   workflow URLs, deployed SHA and acceptance evidence.


## P8.1 management evidence and corrections

On 2026-11-22, Opera product catalog showed Karda stable confidential client,
PKCE and backend logout enabled. Callback and post-logout addresses match the
production host. Ten Atlas endpoint grants and 879 capability grants are
reported by the platform; these counts are registration evidence, not proof of
successful real calls or a reason to broaden access.

Saved through Opera (visible reload confirmed): web terminal enabled, other
terminals remain disabled; webhook changed from the invalid internal-IP HTTPS
address to `https://karda.vxture.com/api/webhooks/vxture`; logo changed from the
missing `/logo.svg` to `/entry/karda-mark.svg` (asset lands with candidate).
The webhook still requires signed delivery acceptance; saving is not proof of
delivery. Domain and edge upstream were not changed. No credentials rotated.

Public website plans GET returned only `karda-free`, invite access, CNY0 monthly
and yearly, quota `seat.max=1`. Product release metadata is 0.9.0, older than live
0.10.3. No paid plan was assumed or published. Local limit declarations now use
the registered `seat.max` key with no undocumented member.max alias.

Launch checks contradict their top-level completed banner: no observed product
login or C1 ticket exchange, C2 latest legacy/shared credentials (442 monthly),
no C3 usage in 90 days; an active test subscription is reported since Nov11.
This does not identify the authorized acceptance workspace. Existing platform
issue719 already covers the misleading summary and evidence attribution; no
duplicate issue was created. No manual completion boxes were checked.

Capacity review found the local helper is not called by business mutations.
Library/document/binding/storage limits must not be sold as enforced until
transactional reservation/counting and recovery are implemented and verified.
Seats are platform-owned; do not introduce a second local membership registry.
P8 capacity/commercial work remains open and is not hidden by the technical
release. The August matrix has been corrected to mark historical proposals,
implemented capabilities, current seat key and non-successful 409 receipts.


## Release preflight follow-up P7.1

PR216 merged at 5c4a97f with all required gates green. Preflight found readiness still treated Redis as browser-only and degraded, despite shared service admission now requiring Redis versions. P7.1 makes Redis failure and missing deployed DB/Redis fail readiness (503), preserving offline omission and zero-dependency liveness. No deployment or live DDL has occurred yet.

Deployment verification also now requires both /api/health and /api/ready, each with a bounded request timeout. Liveness alone cannot pass the rollout gate.


## Owner-directed domain cutover and deployment configuration

Owner confirmed `karda.ruyin.work` on 2026-11-22. The prior retained origin was
not the desired final configuration. Arda delivery80 and alignment30 were
re-read: platform registration is configuration-owned; product runtime origin
updates ship through the normal product deployment, preserving operator secrets.

PR217 merged at b31ebf9, main CI44941088456 passed. Approved db-init44941098583
succeeded (0010/0011/0012, all37 declared tables present). Tag v0.11.0 was pushed,
but deploy44941363441 was cancelled during build before deployment to incorporate
the domain configuration correction. Production remains v0.10.3/2f7b142a; the
cancelled tag will not be moved or represented as a successful release.

The new reviewed non-secret production profile supplies the Karda public origin,
client ID, real /auth/callback and post-logout URL. Compose loads it AFTER the
persistent operator secret file, with the deployed absolute path selected by
deploy.sh. Persistent credentials/internal transport are not copied from Arda or
rewritten. No beta server/profile is invented. Historical edge installation
instructions are retired; Opera owns domain routing and certificate coverage.

Opera save of edge/home/callback/logout/webhook/logo targets returned500; reload
and a separate public root request also returned500. Actual save/partial-save
state remains unknown until read-back. Platform issue727 includes exact desired
configuration, timestamp, impact and acceptance. No platform source, server
variable or manual edge edits were made. DNS returns Cloudflare proxies, while
ordinary new-domain health returned403; this is not route/TLS acceptance. Legacy
health still identifies Karda v0.10.3. Target is the new domain only, with no
legacy redirect. Current source plans are distinct from completed live changes.

Domain-profile validation: all858 tests passed, zero skips; TypeScript passed. Actual docker compose config verified repository and delivered layouts both override old origins while retaining dummy operator secret/DB values. Bash syntax passed; platform config save remains unverified due issue727.
