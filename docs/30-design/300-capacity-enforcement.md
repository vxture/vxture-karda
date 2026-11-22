# Product capacity enforcement

## Authority and scope

P8.3 is split into independently reviewable increments. Platform C2 is the
authority for granted limits; Karda owns counting its actual product objects.
No paid price or quota quantity is defined here. Seats remain platform-owned.
AI credits remain centrally judged; this work adds no local AI balance gate.

| Increment | Mutation scope | State |
| --- | --- | --- |
| P8.3a | Knowledge library creation, browser and Agent | Merged PR221 / f8b3788; all gates passed; not deployed |
| P8.3b | Documents/entries and connector bindings, including reactivation | Merged PR223 / b57426a; all gates passed; not deployed |
| P8.3c | Stored bytes, upload reservation, failure recovery and deletion lifecycle | PR225 merged; local870 tests and CI pass; DDL0013 applied; application blocked by P8.3d |
| P8.3d | Correct shared storage gauge admission/reporting | Implemented; local873 tests pass; DDL0014 and application not deployed |

## P8.3a: library count

`PrismaKbStore.createKb` is the common browser/Agent persistence path. It obtains
`kb.max` using the immutable platform tenant anchor and the existing scoped C2
resolver. No organization/workspace is accepted from a request-body override.
Missing/invalid limits and platform failures refuse creation with503. An exhausted
limit refuses with403. A safe nonnegative integer is a concrete limit; only -1
means unlimited. Offline development without a platform client keeps its
existing unrestricted database path; deployed stages never use this exemption.

The product counts all non-soft-deleted libraries within the workspace,
regardless of owner or visibility. Archiving alone retains the slot; soft
deletion releases it. Existing above-limit data is retained and remains readable;
new creation is refused until count falls below the granted limit.

Each creation transaction obtains a PostgreSQL transaction advisory lock keyed
by product, metric and workspace, then counts and inserts under READ COMMITTED.
The count uses a fresh snapshot after the previous lock owner commits. The same
workspace serializes across replicas; distinct workspaces use different keys.
Hash collision may serialize unrelated requests but cannot grant extra slots.
Rollback releases the lock and the inserted row together. Counts are derived
from rows, so no counter repair job or new DDL is required.

C2 reads happen before the transaction and follow existing cache invalidation
semantics; this is not a distributed atomic transaction with subscription changes.
No browser focus refresh or periodic capacity polling was added. Existing
transactions have bounded queue/lock time; infrastructure timeout cannot grant
creation. Concurrent deletions can temporarily cause a conservative refusal.

Browser and Agent preserve capacity error codes. Browser wording distinguishes
exhausted capacity from unavailable configuration without exposing infrastructure
details. Deployed stages return404 for demo seeding even with an internal job
token; fixture writes cannot form a production bypass around the common store.

## Verification and remaining release gates

Use isolated PostgreSQL with the service role to test competing creates,
workspace isolation, zero/unlimited/missing limits, failed C2 lookup, transaction
rollback and slot reuse after deletion. The browser and Agent must both refuse
without claiming success or attaching a nonexistent object.

Do not deploy the count guard alone against the currently observed Free plan:
the public plan only declares seat.max. Confirm the actual scoped C2 kb.max
grant and agree the complete package configuration before release. Missing
configuration intentionally yields503, rather than an invented product allowance.
No manual production quota, anchor or data changes are part of this increment.

P8.3b/c must first cover every API/Agent/connector write path and define retained
storage accounting. Raw upload must reserve bytes before object-store writes;
failure and orphan cleanup must return capacity safely. A read-then-write check
in a route alone is insufficient. These paths are not enforced by P8.3a.


## Storage prerequisite found during P8.3b/c inventory

Live deployment has neither OSS configuration nor a filesystem root, so current
uploads select the in-memory adapter. P9.4 tracks restoring the intended durable
filesystem interim deployment and extending readiness before real upload
acceptance. KD-019 migration is still HELD; no cloud migration was started.
A persistent object volume does not itself enforce storage.bytes. Reservations,
retained bytes, orphan recovery and deletion remain P8.3c, not completed here.


## P8.3b: content and connector counts

The shared Prisma content store now gates all document and entry creation with
one workspace document.max lock/count. Documents and structured entries each
count as one content item. Draft, processing, indexed, failed and archived items
retain slots; deleted content and content under a soft-deleted library are
excluded. Browser, Agent and connector ingest all use this store; successful
insert and the existing karda.ingest outbox remain in the same transaction.
Rejected creates do not create usage receipts or enqueue processing.

A connector update is a net-zero replacement. The internal store input can
reference the previous document; the transaction validates the same library,
connector, stable source_doc_id and binding_id, tombstones that live row before
counting, then inserts the replacement and usage atomically. Failure rolls the
old tombstone back. A stale or mismatched supersede refuses; it cannot reclaim
another document's slot. The field is never copied from browser/Agent bodies.
No unchanged-hash connector event creates a new row or consumes a new slot.

Binding creation similarly uses workspace binding.max under a transaction lock.
Active AND paused nonrevoked bindings count; resume therefore retains its
already-owned slot. Revocation releases the slot and is terminal at the database
update predicate, so a late resume cannot resurrect a revoked binding after the
service read. Existing bindings/content are never removed to satisfy a downgrade.

Capacity HTTP responses are403 exhausted and503 missing/unavailable; browser,
Agent and connector responses retain actionable codes rather than bad_content
or invalid_request. UI wording now applies to the item limit across these paths.
The scoped C2 envelope remains authoritative and prior cache/version semantics
still apply. No default production quantities, new billing writes or DDL are added.

Real PostgreSQL verification mixes ten document/entry creates for three slots,
checks usage-row count, archive retention/deletion reuse and workspace isolation.
Seven competing binding creates for two slots yield two successes; pause/resume
retains slots, revoke/resume race stays revoked and released capacity is reused.
Connector replacement works at the limit, failed insertion restores the original,
and mismatched source identity cannot reclaim capacity. Service tests verify
capacity failures propagate through content/upload/binding without enqueue.
Local full suite:869 pass, zero skips; TypeScript passes. Formal CI follows PR.

Remaining P8.3c boundary: upload and direct connector bytes are currently stored
BEFORE document insertion; capacity rejection may leave an unreferenced object.
This increment enforces row counts only. Byte reservations and reference-aware
cleanup must be completed before release/real upload acceptance; never blindly
delete a content-addressed object on rejection, since a live record may share it.

P8.3b merge evidence: PR223 / b57426a; CI44951664609 and secret scan44951664551
passed all required gates. Runtime release remains v0.11.1.


## P8.3c: physical bytes and recovery

The production ObjectStore factory wraps filesystem/OSS with ReservedObjectStore
when a DB is configured. Browser upload, inline Agent write and direct connector
bytes all use it. Scoped storage.bytes is checked against retained ledger bytes
PLUS untracked legacy stored-reference metadata before any PUT. Actual Buffer
length is authoritative; source-declared remote size does not authorize bytes.
Legacy null/negative sizes refuse new storage pending inventory, even on an
unlimited grant. The existing remote fetchRef path parks without fetching bytes;
any future fetch implementation must use this same factory before raw storage.
Entries without a raw object count toward content capacity, not physical bytes.

A storage workspace transaction lock serializes sum+reservation. Pending, ready
and deleting all retain byte capacity. Same-library/hash ready content reuses the
same key and amount, with a one-hour metadata grace; pending same-content PUTs
are refused for retry rather than launching competing writes. This in-progress
refusal is503, not a claim that the subscription has no remaining capacity.
New generations include the immutable reservation ID in their physical namespace.
Existing stored keys remain readable; no bulk key rewrite or migration occurs.

After raw PUT, the ledger becomes ready. Document insertion takes the storage
lock and verifies ready state and exact scope/length inside the same metadata/
usage transaction. Cleanup uses that same lock to recheck every document reference,
including soft-deleted content/libraries. Refusal/crash after PUT leaves a tracked
unreferenced object for recovery; callers never blindly delete shared objects.

A bounded server worker scans expired pending/ready/deleting rows every five
minutes, with a one-hour retry backoff and ten-attempt automatic ceiling. This is
storage recovery work, not browser authorization polling. Pending data is read
and hash/length checked: confirmed bytes recover to ready; absent/unknown bytes
remain reserved for operator investigation. Elapsed time alone never permits an
uncertain writer's reservation to be reused. The one-hour grace exceeds the
bounded30-second OSS request; filesystem operations remain OS-bound. No lease
takeover issues another PUT on an uncertain key. Old sender completion cannot
commit document metadata after the generation entered deleting/deleted.

Ready orphans transition to deleting under lock before physical deletion. New
metadata cannot attach to a deleting key; new PUTs always use another generation.
Only successful deletion or confirmed absence marks deleted and releases bytes.
Failure retains state/amount and retries. Duplicate cleanup safely targets an
unreused key. Filesystem permission/I/O errors now propagate; they cannot be
misread as absence and release capacity. OSS requests have timeout/no redirects.

Referenced originals, including archived/deleted versions, remain retained and
charged. This batch deliberately does not invent the unresolved archived/purge
retention policy (KD-203/204); reclaiming that space requires a separately reviewed
reference purge, not a false zero at UI deletion. Operator recovery must preserve
immutable attribution/amounts and must not insert guessed success receipts.
This trades temporary conservative capacity for avoiding data loss/undercount.

Validation: real isolated service-role PostgreSQL tests cover distinct-object
concurrency before physical write, same-content dedup, shared/deleted references,
cross-workspace and stale-generation refusal, lost PUT response and recovery,
unknown PUT retention, delete failure/retry, unique later generation, immutable
column grants, missing/unavailable C2 and unknown-size legacy data. Full local
suite870 passes, zero skips; TypeScript and38-table DDL/Prisma/grant checks pass.
Production remains v0.11.1. Reviewed db-init44980689156 applied0013 and verified
38 tables. Application rollout is blocked by the contract correction below.

## P8.3d: actual C2 contract correction and release hold

Read-only production service-ticket checks on2026-11-22 found two scoped C2
envelopes with bundled=true, tier=null and only seat.max in limits. Both expose
storage.bytes in quota_pools. A third historical anchor receives exchange400.
No guessed tenant or grant was inserted. Platform issue728 requests managed
registration/grant and historical reconciliation guidance; issue727 still blocks
the target origin. Product-owned max metrics remain kb.max/document.max/binding.max.

P8.3c's default platformLimit(storage.bytes) is incorrect and MUST NOT ship:
storage is a gauge pool, not a limits entry. The prior local tests inject a max
allowance and prove ledger concurrency/recovery only; they do not prove this
platform seam. LIMIT_KEYS now excludes storage.bytes. Neither a fabricated
limits entry nor summing pool.limit into a product-local allowance fixes shared
headroom: other products can consume the same workspace pool.

The implementation preserves the durable object ledger and follows these requirements:

1. Snapshot all retained Karda bytes (including pending/deleting and known-size
   legacy references) under the same workspace storage lock. Unknown inventory
   refuses growth; a missing grant is not zero or unlimited by default.
2. Report ABSOLUTE storage.bytes via PUT /usage/gauge with a durable monotonically
   ordered observation, scoped Karda identity and validated acknowledgement.
   Never send storage through counter consume or an AI-credit conversion.
3. Obtain fresh scoped C2 shared remaining after baseline reconciliation, compare
   only additional bytes, and preserve local serialization for reservations.
   Cross-product atomic allocation is not promised by a read-then-report gauge
   contract; document this bound and request platform support if a strict global
   reservation guarantee is required.
4. Persist failed/pending snapshot work and retry after restarts, including when
   no subsequent upload occurs. A lost response cannot justify erasing a byte
   reservation or reporting success. Physical deletion reduces the gauge only
   after confirmed deletion; legacy retained references remain counted.
5. Test pool-only C2 (no storage limit), applicable multi-pool and negative shared
   headroom, concurrent local writers, report failure/lost response, delayed
   snapshots and restart recovery, dedup, deletion and cross-workspace isolation.

Until P8.3d passes and real max grants exist, no application release tag is cut.
DDL preparation does not lift this release hold. Pricing approval, actual cost
calibration and target-domain/business acceptance remain separate open gates.


### P8.3d implementation and validation

storage_watermark (increment0014) persists each workspace's latest absolute
value, observation, pending flag and bounded retry state. Snapshot creation commits
with reservations or confirmed deletions. Observations use database time and at
least the last durable observation plus1ms; same observations are never reused
for changed amounts. Failed/unknown reports remain pending across restarts.

Before growth, baseline inventory is durably queued. Under the shared storage
lock, pending baseline is acknowledged and fresh scoped C2 remaining is read
without the resolver cache. Admission compares incremental bytes to shared
remaining, never pool.limit or limits.storage.bytes. A successful reservation
queues the higher snapshot in the same commit; its acknowledgement precedes raw
PUT. Uncertain delivery therefore retains charged reservations and refuses PUT.
Dedup adds no bytes and can reuse ready data when shared headroom is exhausted.
Physical cleanup queues the lower snapshot only after confirmed removal.

The server recovery worker retries20 due snapshots per cycle, one-minute backoff,
ten-attempt ceiling, including after restart without a later upload. Unknown
inventory or newer/mismatched platform receipts fail closed and require recovery;
retrying an exact snapshot is allowed. Anchors are resolved before transaction
connections to avoid pool starvation under competing writers. Per-scope locks,
network timeouts and transaction deadlines bound normal work. No browser polling
or cloud migration was added. Cross-product concurrent admission remains bounded
by the platform gauge contract, not a promised global atomic reservation.

Local873 tests pass,0 skipped, TypeScript passes,39-table schema/grants check
passes. Tests cover shared pool-only C2 semantics, negative/multiple pools,
receipt scope/value/time mismatch and replay,8 concurrent puts sharing6 bytes,
dedup at full capacity, lost response before physical PUT, restart retry of the
same durable observation, confirmed deletion snapshots and tenant isolation.
Production remains v0.11.1 with0013 applied;0014 and this application are pending.
