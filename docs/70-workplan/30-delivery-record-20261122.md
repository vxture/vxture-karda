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
