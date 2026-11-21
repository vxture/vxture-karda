# Event-driven access synchronization

Status: implemented candidate; not deployed. Date: 2026-11-22.

## Authority and delivery

Accounts remains identity authority. C2 and product assignment remain admission
authorities. A message is only an invalidation; it cannot grant access. Business
requests retain their server checks. The browser has no focus/visibility handler
or scheduled permission query.

Supported C3 deliveries advance vx_provision.access_revision inside the same
PostgreSQL transaction as lifecycle/watermark/receipt. Duplicate, stale and
unchanged reconciliation do not advance it. This one-row-per-workspace outbox
coalesces obsolete invalidations; it is not an audit event log. Post-commit send
is awaited before webhook success/ACK. If publication fails, the signed original
delivery can retry even with an existing receipt. A bounded background outbox
worker recovers a crash before publication without querying upstream authority.
It scans up to 100 pending workspaces every 30s; this is delivery retry, not an
entitlement refresh schedule.

Redis stores the monotonic database generation and publishes in one Lua script.
Late older publishers cannot lower it. A conditional database acknowledgement
cannot clear a newer generation. Missing Redis versions restore from PostgreSQL;
there is no dependence on retaining every pub/sub message. Existing Redis AOF
configuration is preserved. Pub/sub disconnect closes affected streams so clients
reconnect and compare current durable versions. Namespace is RP client-specific;
workspace targets are hashed. Session removal and internal revocation wake-up
occur in the same Redis operation, including every RP session for a central sid.

## Browser transport

GET /api/events uses a verified same-origin RP cookie. Scope comes exclusively
from the server session. Query parameters cannot choose user/workspace. Messages
contain a generation and an opaque identity-context digest; no token, RP cookie,
central sid, user ID or workspace ID reaches the stream. One Redis subscriber per
Node process fans out only matching workspace/session targets. Listener cleanup,
bounded pending messages and slow-consumer shutdown prevent stale subscriptions.

The initial connection checks admission once. Reconnect with unchanged generation
and context does not call C2/access. A real change triggers a coalesced bounded
access check while preserving the current screen. Explicit denial/revocation
clears the business view and goes to the gate. Unknown/network failure keeps a
recovery message and retries the connection; it never claims logout. Context
changes remount scoped content and cancel old shell fetches; presentation pane
preferences remain intact. No authority verdict is persisted in browser storage.

SSE keepalive only emits a comment every 25s. It reads no session, C2 or Accounts
and reports no activity. A stream ends at token expiry or after ten minutes;
reconnection reauthenticates the transport but unchanged versions do not trigger
an entitlement query. Accounts status checks use active:false and its own
next_check_at, so keeping a page open does not renew user activity.

## Upstream limits

Current published C3 events cover commercial/lifecycle/sharing invalidation, not
all identity-context changes. Existing signed back-channel logout is consumed
when actually delivered. Platform #538 historically chose on-demand session
status instead of requiring logout push; no unimplemented event name is assumed.
[Platform issue726](https://github.com/vxture-platform/vxture-platform/issues/726)
requests the missing customer logout/context notification and recovery contract.
Therefore immediate cross-product logout/context delivery remains a live
acceptance item, not a claimed capability. Identity refresh/status still provides
the existing server-request fallback. Environment isolation remains issue724.

## Validation and rollout

851 local tests pass without skips, including real Redis/PostgreSQL: replica
fanout, namespace isolation, missed wake-up recovery, monotonic versions,
post-commit retry, same-transaction rollback, duplicate generation, immutable
workspace grants, and old publication acknowledgement racing a newer change.
Playwright verifies one initial check, one check for a changed revision, zero
checks for unchanged reconnect/focus, and immediate gate navigation on revoke.
Browser transports were mocked locally; real Accounts delivery remains P9.

DDL 0012 must follow 0010/0011 through db-init before deployment. Startup never
executes DDL. Baseline, incremental SQL, Prisma and service-role column grants
are synchronized. CI, deployment and production acceptance are separately tracked.
