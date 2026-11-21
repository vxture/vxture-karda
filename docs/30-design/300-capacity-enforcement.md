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
| P8.3c | Stored bytes, upload reservation, failure recovery and deletion lifecycle | Pending |

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
