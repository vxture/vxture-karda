# Karda remediation delivery record - 2026-11-22

## Scope and actual release state

Karda-only implementation, following the Arda integration lessons and frozen
CoSpace v1.3.1 presentation. No platform sources, worktrees, server variables or manually installed edge
files were modified. Product registration changes use Opera configuration.
Platform gaps are issues, not local patches.

Current production: v0.11.1 / cba6e16a, deployed by owner-approved run44945579438
at 2026-11-22 04:29:59 CST. Baseline before this rollout was v0.10.3 / 2f7b142a.
No new paid inference, customer-data mutation or plan publication has occurred. Owner-approved production db-init44941098583 applied the additive
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


## Verified domain registration and candidate - 2026-11-22

Owner completed Opera second-factor verification. Read-back shows updated time
04:16:52 CST and all seven target values saved: edge domain, home, real
/auth/callback, post-logout /, /auth/backchannel-logout, /api/webhooks/vxture and
/entry/karda-mark.svg use karda.ruyin.work. Client karda remains confidential,
PKCE and backend logout enabled; only web terminal enabled. Upstream unchanged
100.76.219.48:3240. This supersedes the earlier pending-save state, without
rewriting the prior500 evidence.

Browser health04:17:37 CST still shows Cloudflare520 (Ray a5e260fedf0b8a6c).
Issue727 was updated with saved registration and remaining route failure. No
manual platform variables/nginx edits or certificate bypass were performed.
Legacy route retirement and signed delivery are not accepted merely from the
saved fields.

PR218 merged cba6e16; main CI44942740610 passed all gates. Production candidate
v0.11.1 / cba6e16 includes reviewed origin profile and858 passing tests. Deploy
run44945579438 builds through the normal pipeline and requires production human
approval. No application rollout success is yet claimed. Cancelled v0.11.0 is
retained as cancelled and its tag is not moved.


## Production rollout and acceptance - 2026-11-22 04:35 CST

Owner approved production run [44945579438](https://github.com/vxture/vxture-karda/actions/runs/44945579438);
all build/deploy jobs completed successfully. The deployed image is v0.11.1 /
cba6e16a, not the later documentation-only main commit. Additive DDL was applied
by the separately approved db-init run. Cancelled v0.11.0 remains cancelled.

Read-only public checks through the still-active legacy host returned health200
with the expected version/SHA and ready200 with DB/Redis both ok. The new logo
asset returns200. Login redirects to Accounts with client karda and the exact new
https://karda.ruyin.work/auth/callback. This confirms deployed runtime origin,
not completion of the browser login flow. No state/token/secret was recorded.

The target new-domain health still returns Cloudflare520. Legacy host retirement,
new-domain TLS/routing, real login/callback/logout isolation, signed webhook/ACK,
C2 business access and Atlas/C3 receipts remain unaccepted. Platform issue727
tracks managed edge synchronization and retirement; product deployment success
does not close it. No manual platform routing changes were made.

Runtime reconciliation reported pages1/scanned3/failed0. Read-only SQL found
three tenant-bound instances and three immutable anchors. One pending karda.ask
usage record dates to 2026-07-28 15:36:51 UTC; its provisioned legacy instance
has no tenant_id or anchor. It fails locally with workspace_platform_anchor_required,
before any scoped billing request. It remains retained with bounded retries;
no guessed tenant, manual anchor insertion, deletion, fake receipt or forced
billing replay was used. Trusted platform attribution or an explicit historical
recovery decision is required before replay. This is not evidence of successful
current C3 acceptance.

P8 capacity enforcement/cost and package design remain open. No Karda paid plan
has been inferred from Arda or published. The integration-status diagnostic is
currently public and includes internal host/db/role metadata; production access
restriction is a separate product configuration follow-up, not a leaked secret.


## P8.3a library capacity implementation (not deployed)

The shared browser/Agent library creation store now performs a workspace-scoped
transaction lock, actual nondeleted-row count and insertion in one transaction.
Capacity comes from anchored scoped C2, with no production fallback quota.
Missing/invalid limits or upstream failures return503; exhausted capacity403.
Browser messages and Agent codes match; failure cannot auto-attach a library.
Production/beta demo fixture seeding is disabled, including internal-token use.

Real isolated PostgreSQL verified eight competing requests with two slots,
workspace isolation, rollback, deletion/reuse, zero/unlimited/missing limits and
sanitized upstream failures. This source increment is not live. Documents,
entries, bindings and stored bytes remain separate pending increments; public
Free configuration must not be assumed to contain kb.max. Package publication
and rollout require actual C2 grants and the reviewed complete capacity scope.
See 30-design/300-capacity-enforcement and the updated ordered sub-batch table.

P8.3a validation: all863 local tests passed with zero skips; TypeScript and
strict docs numbering passed. Required Linux build/security gates run on its PR.


## P9.4 durable raw storage finding (candidate, not deployed)

P8.3a merged as PR221 / f8b3788; all required gates passed (CI44948963453,
secret scan44948963404). It remains undeployed pending full capacity configuration.

Read-only product-container checks found all four OSS required settings and
KARDA_OBJECT_ROOT absent. Only presence booleans were printed. Production currently
selects an ephemeral in-memory object store; existing health/ready success only
proved DB/Redis, not durable uploads. No real upload or customer mutation was
used to discover this. Upload acceptance remains blocked.

The August cloud migration runbook is explicitly HELD, so this does not start an
OSS/RDS migration. Candidate adds a persistent Compose objects volume at the
existing image-owned /var/lib/karda/objects directory and sets the same runtime
root in the reviewed non-secret production profile. No existing object tree is
moved, overwritten or deleted; no manual production settings were changed.
The runtime refuses memory fallback on deployed stages and rejects partial OSS
configuration instead of silently selecting another backend. Readiness includes
storageConfig: filesystem directory must be readable/writable, OSS configuration
must be complete (no remote object request is claimed). Liveness stays independent.

Targeted tests cover persistence across new store instances, missing/file paths,
production/beta fallback rejection, partial OSS and DB/Redis-only false readiness.
Compose rendering confirms named volume and runtime root agree. Cloud migration
hold is retained; future backup and rollback must preserve the objects volume.

P9.4 local validation: all867 tests passed with zero skips; TypeScript, Compose
rendering and strict docs numbering passed. Required CI gates run on this PR.


## P8.3b content/binding capacity (not deployed)

P9.4 merged PR222 / db2c9c8 with all required gates passing (CI44949816060,
secret scan44949816128). Production remains v0.11.1; no upload acceptance claimed.

P8.3b counts documents + entries under document.max and active + paused bindings
under binding.max, with shared workspace transaction locks. All actual content
creation paths share the guarded store and atomic usage insertion. Archive and
pause retain capacity; delete/revoke release it. Terminal revoke predicates
prevent stale resume from reviving a binding. Connector supersede validates
same-library/source/binding and replaces atomically, with rollback preserving
old content when insertion fails, including at the limit.

Capacity failures preserve403/503 across browser/Agent/connector. Local869 tests
pass with zero skips, real isolated PostgreSQL/Redis included; TypeScript passes.
The new tests cover mixed concurrency, usage atomicity, deletion/reuse, paused
slots, revoke/resume race, net-zero replace and foreign replacement rejection.
No platform sources/config changes, prices, quantities, DDL or release were added.
P8.3c byte reservations/orphan recovery remain required before release, because
bytes are still put before row creation; rejection may leave a stored orphan.

P8.3b final merge: PR223 / b57426a, all required CI gates passed in44951664609
and secret scan44951664551. No deployment/tag/production data changes occurred.
P8.3c remains next; current target-domain health still520 (issue727).


## P8.3c durable byte reservation (candidate, not deployed)

Implemented durable stored_object reservations before raw PUT, scoped storage.bytes
capacity counting and same-content reuse. Physical generations never reuse a key
after cleanup. Content metadata/usage commits verify a ready correctly-scoped
reservation under the same storage lock used by orphan cleanup. Retained legacy
references consume capacity; unknown size refuses new bytes pending inventory.

Recovery checks interrupted PUT hash/length, retains absent/uncertain reservations,
and only releases confirmed-deleted unreferenced objects. Soft-deleted references
retain originals; no unresolved retention/purge policy was silently decided.
Bounded retry and immutable service grants protect attribution/amounts. Filesystem
I/O errors now propagate; OSS has30-second timeout/no redirects. All actual upload
paths use the DB wrapper; future remote-fetch implementation must do likewise.

Local870 tests pass, zero skips, with real isolated Redis/PostgreSQL. Targeted
concurrency, interrupted PUT, shared refs, unknown legacy, deletion/retry and
immutable grants pass. DDL0013/baseline/Prisma/column locks align at38 tables;
TypeScript passes. No production DDL/application release or paid call occurred.
Next: required PR gates, owner-reviewed db-init, capacity grants and package plan,
then approved application release/real business acceptance. New-domain issue727
remains external platform routing scope; no platform source/server edits.


## P8.3c merge and P8.4 whole-package proposal

PR225 merged f4d239d; CI44979585820 and secret scan44979585821 passed all gates.
No production DDL/application release yet. P8.4 draft50-commercial-package-proposal
now includes seats, stored bytes, AI credits, libraries/content/bindings and
separate expansion proposals. Starter129/Pro399/Business1499 are independent
Karda proposals, not approved prices. Free remains invitation-only draft; existing
subscriptions remain pinned; Enterprise private deployment requires a contract.

Whole-package budget contribution is65-68% under explicit assumptions and54-58%
with AI cost doubled. This is not realized/net profit. Platform ADR-014 supplies
credit pricing policy; actual configured rates and costs remain unverified.
Aliyun storage-fees documentation's0.12/GB-month is explicitly an example, not
an obtained regional quote;3.50/GiB-month is an internal all-in cost allowance.
No new plan, add-on, model fee, operator variable or platform source was changed.
Capacity grants, actual cost calibration, owner pricing approval and domain/
C1/C2/C3/Atlas acceptance remain prerequisites to publishing the draft offer.


## P8.3d scoped C2 correction / approved0013 / status hardening

PR226/a3345e0 and main CI passed; commercial quantities remain proposals.
Readonly Opera confirms seven new-domain fields and web-only settings unchanged;
Karda has10 model routes and879 capability grants. These are product-level
upstream rights, not tenant capacity grants. Actual scoped service checks found
two C2 HTTP200 envelopes with bundled=true/tier=null, only seat.max in limits,
and storage.bytes in quota_pools; one historical anchor exchange returns400.
No secrets/tickets/tenant IDs are disclosed or changed. Platform issue728 tracks
managed max-cap registration/grants and authoritative historical recovery.

Owner-approved db-init44980689156 applied0013 at pinned a3345e0, asserted38 tables
and passed. Initial44980617256 was cancelled before execution after a malformed
pin argument was noticed. No application release or commercial publication.

P8.3d corrects the PRODUCT storage seam: shared pool headroom instead of a max
limit, fresh scoped C2 after baseline reconciliation, absolute gauge snapshots
with exact acknowledgements, committed watermark outbox and restart-safe retry.
Same storage lock serializes local reservations, snapshot publication and cleanup.
Unknown upload/report outcomes stay reserved; confirmed removal queues lower
watermarks. DDL0014 adds storage_watermark with immutable workspace attribution;
39-table/grant checks align. Status profile stages login-required/infra-hidden.
Full873 tests pass,0 skipped; TypeScript passes. CI and reviewed0014 are pending.

Remaining: confirmed commercial configuration with actual grants/cost calibration,
issue727 routing/legacy-host retirement, issue728 reconciliation,0014/application
approvals, then real Accounts/knowledge/Atlas/C3 acceptance. Cross-product atomic
reservations are not implemented by a gauge-only contract; this bound is explicit.


## P8.3d merge verification

PR227 merged as acc8de65f0a8c38ae26ba250289e0b03478718da. Linux CI44981846064
passed build/test-coverage/audit/quality-gate/static checks; secret scan44981846041
passed. Final local873 tests passed,0 skipped, including legacy initialization
without another upload. Source and CI are complete; production0014/application
remain unshipped. Production is v0.11.1 with0013 applied. Target-domain health
recheck still520; legacy health still200 at cba6e16a. Commercial plans unchanged.
Detailed shared-allocation contract bound was appended to platform issue728.


## Approved0014 and managed max-metric registration

Owner confirmed approval. db-init44982274412 at90b715b completed successfully on
2026-11-22; logs show0014 applied, column grants applied,39 declared tables all
exist. Earlier0013 remains applied. No startup migration/manual SQL was used.
Application staysv0.11.1; no release tag or price publication was performed.

Via Opera's existing Register metric dialog, saved Karda-only definitions:
kb.max/libraries, document.max/items, binding.max/connections. All use max and
never reset. Readback shows seven total product-specific metrics including the
four existing ones. Shared storage.bytes/ai.credit were not re-registered.
Proof: output/acceptance-20261122/karda-capacity-metrics.jpg (local ignored
acceptance artifact). No broader access, client/secret change or tenant quantity
was introduced. Seven domain/auth fields, web-only settings remain unchanged.

A new actual scoped service C2 read after registration still shows only seat.max
in limits for two bundled scopes; the historical third anchor still returns400.
No quantity is inferred from public plans. Managed definitions are now complete;
actual grants/commercial approval and historical reconciliation remain open in
platform issue728. The supported registration path is reported there. New-domain
health remains520 and issue727 open. No platform source/variable/edge mutation.

Next release gates: reviewed commercial quantities and actual C2 grants; platform
origin repair and old-host retirement; then required human application deployment
approval and real C1/knowledge/Atlas/C3 acceptance. Additional DB approval for0014
is no longer pending. Pricing/cost proposal remains explicitly unapproved.


## P8.4 public storage cost calibration

Readonly official Aliyun OSS price page now verified: mainland standard LRS/ZRS
list0.12/0.15 CNY perGiB-month, long-term public discount0.09/0.12; busy/idle
Internet egress0.50/0.25 perGiB; same-region ECS internal egress free. Units are
explicitly2^30 bytes. These are public prices, not this account's purchased rate.
The3.50 all-in budget remains an explicit assumption for backup/index/traffic.
Proposal now exposes2x/5x download scenarios and does not promise unlimited
traffic or actual net margin. Cloud migration remainsHELD; no purchase occurred.


## P8.4 owner approval for draft preparation only

On2026-11-22 owner explicitly confirmed preparing package drafts without
publication. Approved monthly base packages: Starter129/Pro399/Business1499,
Free invitation draft and Enterprise private/contact-sales; exact agreed quantities
and byte/minor-currency conversions are in deploy/config/commercial-package-draft.json.
The file is a review checklist, NOT a platform API body or runtime config.
Expansion SKUs/annual pricing/publication/existing grant migration remain excluded.

Browser control could inventory existing Opera tab21 but subsequent page reads
and rebinds timed out (service_info). No package form was opened or saved; do not
claim platform drafts exist. Local input manifest, draft runbook and authorization
status are prepared. Resume the existing authorized save after browser recovery.
Keep platform_saved=false until actual saved-version readback and screenshots.

Publication contract gap: existing karda.ingest/search/ask are hard-cost pools
with observed0 quotas, while approved package intent adds no monthly call cap.
Do not invent unlimited sentinel or large quotas. Platform issue728 receives
this explicit configuration question; drafts do not resolve actual C2 grants.

## P8.4 crash recovery and platform draft delivery

App restart recovered the logged-in Admin session; no repeated owner login was
needed. PR231 merged as a19cdec after all five required gates passed.
Saved existing Starter v1 (129/month) and Pro v1 (399/month), created Business v1
(1499/month), Enterprise v1 (unpriced) and Free v2 (0/month, copied from currentv1).
Readback confirms approved seat/storage/AI/library/content/connection quantities
for Free/Starter/Pro/Business. Enterprise description records private deployment,
contact sales and contract capacities with human/ticket support.

All five versions are drafts. Current Free v1 remains unchanged/invitation-only;
there are no new grants, migrations, addon SKUs, commercial or application releases.
Screenshot output/acceptance-20261122/karda-package-drafts.jpg shows draft rows
and monthly prices; excluded from Git as operational evidence.

Observed platform limits: clearing inherited Free annual0 restored0 after save;
do not interpret this as annual-price authorization. Enterprise contact-sales
description alone does not prove purchase-button semantics. Quota preview keys
reorder after save, so display order needs separate client acceptance. See draft
checklist and platformissue728 follow-up. Domainissue727 and hard-pool/max-grant
issue728 remain open without platform replies at this check. P9 is not complete.

## Joint commercial re-review requested by owner

Owner requested a joint Arda/Karda review, allowing proposals to revise Arda.
No new prices, package versions, addons, discounts or existing subscriptions were
changed. Authoritative review:20-specs/60-joint-commercial-review-20261122.md.
Offline Decimal model and auditable inputs:scripts/commercial/joint-pricing-*.
The previous per-product budgets are not comparable: old Arda model predates its
final price, uses different storage/fee/stress assumptions, and does not prove
the cost of published calls/checks. Admin readback verified0.20 anchor/70% target
and some calibrated rates, but also missing-cost fallback models and ambiguous
rounded rerank rates. No cost configuration or provider balance was changed.

Proposal only: same199/599/2199 tier prices and common grants, same resource-pack
prices, separately bounded public egress, optional95% joint base-subscription
price with no assumed infrastructure savings. Existing Karda drafts stay as saved.
AI/storage/egress full-grant scenarios plus explicit non-AI budgets are NOT proof
of maximum arbitrary workload cost. Both product benchmarks, bill calibration,
egress/discount platform contracts and owner commercial approval remain required.

## Knowledge library quota review follow-up

Owner directed removal of the customer-facing content-item count and increased
library counts to200/1000/5000. Updated joint proposal and model metadata only.
Storage and AI remain consumption boundaries; no per-library resident compute
is implied. Existing saved drafts and runtime document.max remain unchanged and
need alignment before publication. Other r1 prices/resources await remeasurement
after owner feedback on Arda AI, dataset counts and tier value.

## Workload-driven AI review (W1)

Owner authorized reevaluating work content and volumes before credit quantities.
Added20-specs/70 and offline ai-workload inputs/model. Arda Curator registry is
empty; its operation profiles are prospective. Karda token scenarios explicitly
compare100-candidate reference and unimplemented20-candidate optimization,
including import/extraction, query embedding, rerank and generation. Candidate
grants150/600/2000 vs300/1200/4000 fit optimized mixed workloads plus20% reserve,
not the current100-candidate workload scenario. Full-grant package costs and9
mixed pairs are checked; lower-price and severe-stress failures are disclosed.
No inference calls, raw-rate changes, platform edits, saved draft updates or
deployments. W2-W5 remain pending; no business publication approval is implied.

## Owner-confirmed base-price revision (r3)

Owner confirmed199/499/1499 monthly prices for both products. Updated the latest
review and workload calculator to use explicit approved prices, retaining r1
cost assumptions and candidate resources. Added20% coupon and95%-then80% joint
scenarios. Old65%/50% targets are comparisons, not assertions guaranteed by the
new prices. Decimal recomputation corrects two small prior chat percentage
errors. Resource-pack prices remain candidates, coupons apply to designated
base-subscription cycles, not permanent/addon discounts. No saved drafts,
published plan versions, subscriptions or deployment settings changed.

## Final commercial design v1 (P8.8)

Owner confirmed the final scheme after connection and published-service caps
were aligned to20/100/500. Added20-specs/80 and sole final-package-spec.json
input covering199/499/1499 prices, seats/storage/AI, per-product quotas, addons,
discounts and Enterprise/Free policy. Workload calculator reads final prices,
storage and AI directly from the catalog, with source hashes. Existing saved
draft JSON is explicitly historical, not rewritten as if saved on platform.
No platform edits, publication, subscription migration or deployment. Code
alignment, workload/cost and platform configuration acceptance remain pending.


## 商业发布与年付补充

用户已授权Starter/Pro/Business/Enterprise四档公开，Free不发布。年付按10个月月价：1990/4990/14990元。
Arda Starter/Pro/Business v3已在Admin发布、冻结并逐项回读；Enterprise保留已公开未定价v2，官网实际显示联系销售。
原Arda订阅留在各自旧版本，本轮没有迁移、改额或续订。Karda三档v1新草稿已保存最终配额与年价，Enterprise未定价，尚未发布。
Karda新套餐内容上限兼容修正及年度12个月成本模型见PR238；18项针对测试、TypeScript和必需CI已通过。
可消耗份额α未显式填写，沿用平台默认0.5，影响升级折抵/折算退款，不影响套餐价或AI配额。
本轮重新检查Opera，karda.ask/ingest/search仍为有成本硬池；已补充平台issue728，等待受支持的纯计量配置契约，不修改平台源代码/变量。
年付叠双订与全年20%券的Business压力贡献率仅3.15%，未扣税及获客，已向用户说明。


## P8.9 四档商业发布完成 / P9.6 应用候选

2026-11-22用户明确先发布套餐、再修正Karda。Arda三档v3已发布，Enterprise保留公开未定价v2；
Karda Starter/Pro/Business/Enterprise v1全部已发布、公开，Free已退役（保留未发布v2草稿）。
官网实际回读两产品均4档，年价1990/4990/14990；Karda为1/3/10GiB、300/1200/4000AI、
200/1000/5000知识库、20/100/500连接，席位1/1/5，内容数量不再展示。Enterprise实际为联系销售。
没有迁移旧订阅，没有购买测试单，没有发布扩展包、创建优惠活动或更改平台源代码/变量。
可消耗份额α留空，平台默认0.5；源码核查升级折抵与退款的同一默认值，非扣点或套餐定价倍率。

发布证据截图本地output/acceptance-20261122/four-public-plans.jpg；平台issue717仍处理Arda官网旧指标名、
排序和能力限制，Karda官网仍显示binding.max/kb.max而非客户名称，需按配置修正。
issue728原先的未发布说明已被本节后续事实取代；业务硬池问题继续单独跟踪，不回撤套餐发布。

PR238已以1a59f0e合入，主干CI44996423309成功。本轮18项针对回归、TypeScript与全部PR门禁通过。
v0.11.2固定1a59f0e，生产候选run44997013773构建中；包含P8.3容量执行、持久原件存储、
共享存储水位与新套餐可选内容数量上限。数据库0013/0014已获人工批准应用，本次不重复运行DDL。
Karda没有可用beta部署workflow，不创建无效beta标签；生产应用仍为v0.11.1，待所需人工生产审核。


### P9.6 report/reserve纠正与入口实测

继续追到平台权威代码后，纠正此前“零硬池会阻止Karda业务”的过度判断：Karda flush显式intent=report，
平台仅对reserve的有成本不足执行事前拒绝。report仍落完整用量，返回200+gated；Karda接受并标记已上报，
只失效权益缓存，不拒绝业务、不对有效gated回执重试。故零硬池不是已证实的业务阻断，不据此更改成本档或造额度。
issue728已附代码路径更正；仍须实测C3落账、AI不重复收费、历史exchange400和bundled容量授权。

15:14:40 Opera接入检查展开读到C1 15:09:55成功、C2 12:02:35成功；C3最近90天无事件。
摘要称四阶段完成/正式版，但展开仍有登录未实测和C3未通过，不将摘要作为端到端验收。
15:15:39浏览器实际访问karda.ruyin.work仍Cloudflare520（Ray a5e624e6eaa2ec0b），旧域名health/ready仍200。
独立HTTP探测新域名为403，仅记录不同入口观测，不冒充应用返回；issue727已更新正常浏览器证据。
v0.11.2镜像已构建，run44997013773停production人工审核，已请求用户审批。


## P9.6 production v0.11.2 deployed / P9.1 still blocked

2026-11-22 15:23 CST: owner approved production run44997013773; deployment
completed successfully at fixed1a59f0e23bc4c0aaa779bee874a23da4faf16711.
Deploy log confirms persistent volume karda_objects created and both readiness
checks passed. Independent legacy-host probes return200/versionv0.11.2/gitSha1a59f0e2;
ready reports db=ok, redis=ok, storageConfig=ok. This proves deployment/configuration,
not uploaded-object persistence across restart or real business acceptance.
No new DDL, subscription migration or platform server changes occurred.

P9.1 remains open: normal browser at15:22:11 shows Cloudflare520 for
https://karda.ruyin.work/ (Ray a5e62e783d8aec0b, Tokyo). Independent new-host
health/ready probes return403, recorded separately without attributing them to
the application. New callback remains configured; do not regress to the legacy
host to claim C1 acceptance. P9.2/P9.3 remain pending usable target-domain login.

Opera naming configuration saved/read back kb.max=知识库数量 and
binding.max=数据连接数量. Public pricing fresh load still exposes both raw keys,
so managed definitions are correct but website consumption remains a platform
display gap (issue717). Four public tiers, final annual prices and retired Free
remain verified. Screenshot: output/acceptance-20261122/metric-names-configured.jpg;
public readback: output/acceptance-20261122/pricing-after-metric-naming.jpg.
PR239 merged asfc7f1c3 after all required checks passed. Release tag stays on1a59f0e.


## P9.1/P9.2 configuration-path acceptance update (16:04 CST)

New normal-browser visit to https://karda.ruyin.work/ now reaches /gate instead
of Cloudflare520. Clicking Continue Login reused the Accounts customer session,
completed the registered new-domain callback and returned to the product.
Authenticated GET /api/access then successfully resolves C2. GET /api/ready on
the new domain returns ready, v0.11.2 /1a59f0e2, db/redis/storageConfig all ok.
No server variables, platform source, workflows or manual edge files changed by
this product task. The platform-side cause/timing of recovery is not established.
CLI requests still receive403 while browser requests work; this is not an app outage.

Current signed workspace suffix0210 returns status=null, tier=null, bundled=true,
seat.max=1; gates.productAccess=false, dataAccess=true, cta=subscribe. Login works;
the resulting 尚未开通 gate is not a failed callback or C2 transport failure.
Admin actual subscription list has16 rows/7active and no Karda subscriptions
(search Karda returns0). No subscription, grant, order or payment was created.
Asked owner to open the intended test workspace through normal subscription or
voucher, or identify an existing subscribed workspace. Business/C3 acceptance
requires that legitimate authorization; do not fabricate UI entitlement from bundled.

P9.1 target-domain reachability verified; old-domain retirement remains open.
P9.2 login/callback verified, global logout/isolation and message acceptance pending.
P9.3 business processing/C3 and P9.4 real upload/restart acceptance remain pending.
Proof: output/acceptance-20261122/new-domain-accounts-gate.jpg and
output/acceptance-20261122/no-karda-subscription.jpg.


## P9.7 subscribed production acceptance / processing dispatch remediation

Owner confirmed subscription. Browser C2 now returns active/business, productAccess
and dataAccess true, seat.max5/kb.max5000/binding.max500. New ai.credit4000 pool
is present; other same-workspace pools remain distinct, not silently reallocated.
Created private Integration acceptance20261122 library
117c7b9a-6c5d-4f2d-bddb-f7b77a8476f0. Uploaded355-byte synthetic-acceptance.md,
SHA2561351aa4d950d5699e4ae2c65484788e241f91a31ae6148d3bf197ae897cda97f.
File selection initially failed in the browser tool; supported concurrent chooser
wait+AX click succeeded. This was not established as a product upload defect.
Document accepted and queued. Retain isolated fixture pending acceptance; no public
sharing, external credential or deletion performed.

Scoped empty-library search returns complete/zero hits. Empty-library answer
returns no evidence/no generated answer. These do not prove Atlas generation or
embedding. First-party console search is intentionally not karda.search-metered;
Opera missing C3 after this call is not evidence of a broken usage worker.

Two actual Karda gaps: instrumentation never starts processing dispatch (only the
protected internal tick could drain); task detail returns DEMO_TASK_DETAIL for
arbitrary ids. Observed task list links to bd5f01ff, then detail falsely shows a
14.2MB legal PDF while uploaded fixture is355B. No false processing acceptance.

Remediation candidate: automatic bounded processing passes using existing DB
configuration; advisory session lock shared with protected HTTP tick; 200-document
keyset recovery per pass; at most20 tasks per pass;5s work cadence/5min parked
resume. Recovered retries retain ledger attempts/backoff; already indexed/deleted
work is skipped. No new variables, schema or manual server changes. Task links
retain full UUID; production detail scopes query by workspace and returns real
ledger/doc/stages only,404 for missing/malformed ids. Remove authored progress,
repair claims, cost estimates and unwired action buttons from live detail.

50 targeted tests and TypeScript/data-architecture checks pass. PostgreSQL lease
exclusion/failure-release test added to existing isolated CI DB suite. Full CI,
release and real upload/index/answer/C3/restart acceptance remain pending.
Proofs: private-library-created.jpg, empty-library-search.jpg,
empty-library-answer-guard.jpg, task-detail-demo-mismatch.jpg under
output/acceptance-20261122. No platform source or server variable changes.


### P9.7 release candidate

PR242 merged as5b37bd8371de877c9a1d1e52b5e2f25ef80cd3fa. Required PR gates and
main CI45003704897 succeeded;877 tests pass,0skipped, including real isolated
PostgreSQL lease exclusion/failure release. Main secret scan45003704883 passes.
v0.11.3 is pinned to that exact checked commit; production run45003892024.
Application release awaits image build and owner production approval; do not
claim queued fixture has indexed. No newDDL, environment variable or platform
source/edge edit. Synthetic fixture remains private for post-release acceptance.

### P9.7 production confirmation (2026-11-23)

Approved production run45003892024 succeeded at2026-11-23 01:15:49 CST,
fixed5b37bd8371de877c9a1d1e52b5e2f25ef80cd3fa. New-domain browser
/api/ready reports v0.11.3 /5b37bd83, production, db/redis/storageConfig ok.
Automatic processing and real workspace-scoped task detail are now deployed.
No newDDL or platform/server configuration change was performed by this task.

The next customer acceptance session has expired and Accounts requires login;
owner login requested. Existing private fixture is retained without duplicate
upload. Real indexing, original-byte persistence across release, grounded answer,
AI/C3 receipts, logout isolation and permission messages remain unverified.
The ordered next checks are recorded under P9.7 in the batch tracker. Deployment
success does not close those business acceptance items.

### P9.7 live processing / P9.8 stage receipts (2026-11-23)

Both logins restored. Existing355-byte private fixture is automatically processed
after release without re-upload; real task title matches and embed parks with
upstream_account_refused. Reaching embed requires reading stored bytes, proving
cross-release readability; download hash and indexing remain unverified.

Opera verifies10 active Karda product endpoint grants; embedding/default resolves
to Zhipu embedding-3/no fallback. Atlas metering shows11 Karda requests/11 errors,
0 tokens this month. Route serving status contradicts model service health's
embedding/rerank-unavailable summary, which also flags request_log. Evidence added:
https://github.com/vxture-foundation/vxture-atlas/issues/147#issuecomment-7083310298.
No provider credentials, shared routes, server variables or platform sources changed.

Opera onboarding details confirm C3 karda.ingest at2026-11-22 16:22:42 after upload.
This proves ingest observation only, not search/ask, exact receipts/dedup or AI
billing. Its C2 shared-credential label/history remains inconsistent with this
client implementation and stays under platform issue728.

P9.8 finds worker never calls the stage ledger. Connect real stage outcomes and
timestamps; isolate observation failures from processing; retain immutable stage
openings and hide durations spanning resumed runs. No newDDL/grants.26 targeted
tests, TypeScript and data architecture pass; added isolated PostgreSQL service-role
receipt/upsert test for CI. Not yet deployed.

### P9.8 merged / P9.9 logout entry correction

PR245/c882fa5 merged after CI45053612576 and secret scan passed;881 tests,
zero skips, including isolated PostgreSQL service-role stage upsert coverage.
Release still pending.

Actual logout acceptance established authenticated customer API + workforce page
baseline. Karda logout then failed to load; customer API still authenticated.
This is not successful logout isolation. Browser error-page URL policy was not
bypassed. Source confirms both menu actions navigate GET to POST-only auth/logout;
its default307 would also replay POST to Accounts. P9.9 uses native same-origin
POST form and303 after confirmed local deletion. Failure keeps503/no-store with
no cookie clearing/redirect; success expires host cookie and disables caching.
Five targeted logout tests pass; production revalidation remains pending release.

### v0.11.4 checked release candidate

PR246 merged23602404c7c213aff9ffeb0aca964cb165a37c9e. PR CI45054103432,
main CI45054356916 and main secret scan45054356820 pass;883 tests/zero skips.
v0.11.4 tag pins this exact commit; production run45054602507 includes P9.8/P9.9.
Human production review still required; not yet deployed. No newDDL or variables.
Platform issue728 updated with actual ingest observation and contradictory C2
credential label: https://github.com/vxture-platform/vxture-platform/issues/728#issuecomment-7083477995.


### v0.11.4生产验收 / P9.10（2026-11-23）

生产run45054602507已成功，deploy完成2026-11-22T19:01:02Z（北京时间03:01:02），
固定23602404c7c213aff9ffeb0aca964cb165a37c9e。新域名/api/ready回读
v0.11.4、gitSha23602404、production；db/redis/storageConfig均ok。

原有私有原件未重复上传，任务bd5f01ff-3b67-4a51-8119-215f8c6f870b在新版本
自动运行：started_at=2026-11-22T19:00:59.225Z，finished_at=19:01:00.234Z。
真实API及页面显示fetch0.001s、parse0.002s、chunk0s完成；embed0.778s后
upstream_account_refused并暂停，commit未到达。P9.8回执验收通过，不代表索引成功。
Atlas issue147仍OPEN且未收到恢复证据；不反复触发失败模型调用。

用户恢复运维登录后重新读取Opera总览及Karda受保护任务API，两边均已登录。
点击Karda账户菜单“退出登录”，Karda回到gate并显示继续登录；重新加载任务API返回
{"error":"unauthenticated"}；同时重新加载Opera仍显示superadmin及运维导航。
P9.9客户退出与运维会话隔离通过。未抓取网络重定向链，不把最终页面当作303抓包证据；
跨产品全局通知/后端退出及权限消息仍需独立验收。客户会话按验收预期退出。
截图：output/acceptance-20261122/v0114-customer-logged-out.jpg及v0114-workforce-retained.jpg。

发现本仓展示缺陷并进入P9.10：任务详情将已暂停embed标为todo，且Agent侧栏仍混入
演示冲突、预验、活动和无实现委托按钮。补丁区分暂停/失败/未执行，不从任务完成状态
虚构缺失阶段回执；生产Agent只保留实际待裁决计数，未接通的数据源显示空态，离线
演示保留。隐藏没有真实状态来源的在岗灯和生产委托按钮。尚未发布，不冒充已修线上。
本轮未新增DDL/变量、修改平台仓/边缘/路由/供应商凭据，也未删除或公开验收原件。

### P9.10 checked release candidate

PR248 merged43fffd91f4f798a4eb0ffe5e00b39bfdf8bd8f5a. PR CI45059290921,
main CI45059533565 and secret scan45059533442 pass. Both CI test runs report
883 tests,883 passed,0 failed,0 skipped. Local TypeScript/catalog/targeted checks
also pass. v0.11.5 pins this exact code commit; production run45059723049.
Image build/human required-reviewer approval and deployment remain pending.
Current production stays v0.11.4; do not claim the hub patch has shipped.
No newDDL, environment variables or platform configuration changes.

### v0.11.5 production confirmation - 2026-11-23

Owner-approved run45059723049 succeeded; deploy completed2026-11-23T01:15:12Z
(09:15:12 Asia/Shanghai). Exact SHA43fffd91f4f798a4eb0ffe5e00b39bfdf8bd8f5a.
Target-domain browser /api/ready reports v0.11.5,43fffd91,production;
db/redis/storageConfig all ok. P9.10 is deployed, not yet visually accepted in
the authenticated workspace. Prior logout acceptance cleared the customer
session; existing task entry now opens Accounts customer login. Owner login
requested; do not bypass it or manufacture live shell/task acceptance.
Atlas issue147 remains OPEN with no new recovery evidence at this check.
Existing private fixture retained; no duplicate upload or manual AI replay.
No DDL, server variables, platform source or routing changes in this delivery.

### P9.10 authenticated acceptance / P9.11 - 2026-11-23

Customer login restored. Production task page and API agree: fetch/parse/chunk
are done, embed is suspended/upstream_account_refused, commit remains todo.
Latest observed run starts2026-11-23T01:20:12.133Z and ends01:20:13.203Z.
Resumed stage openings precede this run, so durations are correctly omitted.
Agent API: pending0,proposals[],alert=null,activity[],demo=false. Page shows
empty review/activity states; authored conflict/verification/activity/delegation
and unverified duty indicator are absent. P9.10 accepted in production.
Screenshot: output/acceptance-20261122/v0115-task-paused-clean-hub.jpg.
Atlas recovery, indexing, grounded answers and AI/C3 success remain unproven.

Shell API exposes an additional local defect: one real library but attention4,
traffic1204 today/48392 total and evaluation gaps10, all authored fallback.
P9.11 switches production shell/overview traffic unconditionally to existing
workspace-scoped supply readers: empty rows are real zeros, read failures do
not fall back to examples. Unmeasured shell health/degraded/evaluation-gap
counts become null and their badges are omitted, not presented as healthy zero.
Offline demos remain. Existing authored per-asset ops on overview retain demoOps
provenance and are outside this focused summary fix. No AI/provider call, new
DDL, auth change, platform configuration or server variable change.

### P9.11 checked release candidate

PR251 merged3ffb891cdd28043dbc726928f127a232c1cb266a. PR CI45094482028,
main CI45094710951 and secret scan45094710966 all pass;883 tests/zero skips.
Local TypeScript and22 targeted existing checks also pass. v0.11.6 pins this
exact checked commit; production run45094898500 is building/awaiting required
human review. Current production remains accepted v0.11.5; P9.11 online
shell/overview API and UI validation must wait for deployment. No newDDL,
variables, auth or platform configuration change. P9.10 screenshot retained.

### P9.11 production acceptance - 2026-11-23

Owner-approved run45094898500 succeeded; deploy completed2026-11-23T01:36:42Z
(09:36:42 Asia/Shanghai), exact3ffb891cdd28043dbc726928f127a232c1cb266a.
Browser target-domain /api/ready reports v0.11.6/3ffb891c/production, with
db,redis,storageConfig all ok. Existing customer session remains usable.

Authenticated /api/shell: assetCount1, entryCount0, needsAttention=null;
channels direct/runos/today/total/directTotal/runosTotal/delta all0,
degraded=null; evaluation unverified1,coverage0,gaps=null; Agent pending0,
proposals[],alert=null,activity[],demo=false; shell demoOps=false.
/api/overview totals today/direct/runos/delta all0,topAgents[],assetCount1,
entryCount1 (document-inclusive governed count, not shell entry-table count).
Its existing per-asset authored operations retain demoOps=true, explicitly
outside this focused summary acceptance. Do not declare all demo cleanup done.
Home renders today0/total0 and unverified1, with no authored attention/degraded/
gap warning. Agent remains empty. Actual unavailable banner still reports the
upstream account refusal and one parked task; no indexed document claimed.
Screenshot: output/acceptance-20261122/v0116-home-real-zero.jpg.

P9.11 accepted. Still open: Atlas147 recovery and indexing/grounded answer,
AI and search/ask C3 receipts/dedup, cross-product/back-channel logout and
permission messages, original download hash, platform old-host retirement727
and contract/display issues717/726/728. Private fixture retained; no new keys,
public exposure, DDL, server variables or platform configuration changes.
