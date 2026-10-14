# Offline sync protocol (Phase 3 specification)

## Local storage and atomicity

Dexie/IndexedDB is the browser transactional store; SQLite is the native/mobile/Electron store. `platform-ports` defines the common contract. Each namespace is bound to verified tenant, outlet, device and schema version. Never reuse a database across contexts. Business rows, operation sequence increment, immutable command and outbox insertion are in one local transaction. A write failure blocks checkout and offers recovery/export; it never displays success. Money is decimal strings, IDs are random UUIDs generated before writing.

At startup run forward-only local schema migrations transactionally, then check pending-command compatibility. Back up/export before destructive upgrades; never delete a store to "fix" migrations. PWA startup/cache, native SQLite, local encryption and command execution are not implemented in Phase 1.

## Envelope

`protocolVersion: 1`, `operationId`, `deviceId`, `outletId`, `sequence` (positive decimal string), `occurredAt`, `expectedVersion` when mutating an existing aggregate, `type` and strictly validated `payload`. Tenant comes from verified authorization, never from the payload. Examples: ORDER_CREATED, ORDER_ITEM_ADDED, ORDER_ITEM_REMOVED, ORDER_SUBMITTED, SALE_FINALIZED, CASH_PAYMENT_RECORDED, SHIFT_OPENED, SHIFT_CLOSED. Cash tender, finalization and sale creation should be one composite financial command where atomicity requires it, not three independently acknowledged messages.

Price/menu version and signed offline authorization lease reference accompany finalized snapshot payloads. Maximum proposed batch is 100 commands/1 MiB; per-device dependencies are processed in sequence, invalid commands block dependent ones with an explicit status. Server recomputes payload hash and enforces a unique sequence as well as operation ID. Same ID/hash returns the saved result; same ID with changed content is an idempotency conflict.

## Push transaction

1. Authenticate principal and registered device; check revocation, membership, outlet, lease/entitlement policy and schema.
2. Lock operation identity/aggregate. Existing matching receipt returns the prior result.
3. Validate business transition, amount bounds, price policy and expected version.
4. Commit mutation, immutable ledger, dedup receipt and change-log entry in one transaction.
5. Return per-command `accepted`, `duplicate`, `conflict` or `rejected` with stable code and authoritative version.

Connection loss after commit is safe: client retains outbox until a durable response, then resends the same envelope. Client atomically stores acknowledgment and clears only acknowledged entries. HTTP network delivery is at least once; business effects are effectively once.

## Pull/cursor protocol

Pull by authorized outlet and opaque server cursor, stable ordered batch with tombstones and next cursor. Apply records and advance the cursor in the same local transaction. Global PostgreSQL identity sequences alone are unsafe cursors because commits can reorder: allocate a tenant sequence under a locked tenant change-counter row held through commit. Scope cursors to tenant/outlet/schema and reject scope mismatch. Cursor expiry returns `RESNAPSHOT_REQUIRED`; preserve all unacknowledged local operations while rebuilding the authoritative cache, then rebase or explicitly resolve them. Retention must exceed the agreed maximum offline period; initially target seven days and test before pilot.

## Conflicts and backoff

| Resource | Resolution |
| --- | --- |
| Device-owned new sale | Immutable insert + operation/order uniqueness; verify snapshot |
| Shared open order/table | Expected-version conflict; manager/operator review, no silent overwrite |
| Menu edits | Server authoritative version; honor explicit offline price policy |
| Cash payments/refunds | Locked aggregates, bounded allocations, no last-write-wins |
| Inventory | Append ledger; reconcile negative/overdrawn stock under merchant policy |
| Shift close | Wait for pending device watermark and settle explicitly |

Exponential retry with full jitter, e.g. base 1 s/cap 60 s. Retry transport/5xx only; 401 requires online renewal, 403 blocks device, 409 requests conflict resolution, validation failure quarantines payload and dependent commands. Quarantine preserves data and permits audited export. Retry count alone must not discard a financial command.

## Authorization and failures

Future offline leases contain principal, tenant/outlet/device, permissions, issuance/expiry, policy version and server signature; private signing keys never reach clients. Proposed offline validity is 24 h, configurable to a shorter bound. Prevent clock rollback with a persisted server-time anchor and monotonic elapsed time where available; after ambiguous restart require conservative expiry handling. Local device compromise remains a risk; native keys belong in OS secure storage. Revocation is immediate online but cannot reach a disconnected device until reconnect; after expiry stop new privileged commands. Decide how authorized pre-revocation durable cash records are quarantined/reconciled without losing actual sales.

Without Store Hub, two offline devices cannot coordinate shared orders/tables/KDS. Use device-owned new orders, surface disconnected kitchen delivery, and avoid moving shared ownership offline. Hub protocol later uses a fenced local authority, encrypted LAN identity, durable local distribution and cloud receipts; hub loss must not elect multiple writable authorities implicitly.

## Required tests before enabling sales offline

Crash after local commit, crash after server commit before response, repeated batches, payload mutation under same ID, stale aggregate version, cursor commit reordering, seven-day reconnect, lease expiry, revoked device, pending commands during migration, storage failure/quarantine, and native restart across SQLite upgrades. None is claimed complete by Phase 1.
