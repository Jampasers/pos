# Delivery roadmap

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0 | PRD, architecture/ADRs, full target ERD, contracts, states, sync/security, navigation | Specifications committed and tradeoffs explicit |
| 1 | Monorepo, three running apps, database, auth/tenant/outlet/device, audit, CI | Type/build/unit/integration/E2E checks; known limitations recorded |
| 2 | Catalog/variants/modifiers, cart/order/table, cash/shift, connected KDS and receipt jobs | Real cashier cash sale atomicity, stock/payment snapshots, duplicate retry tests |
| 3 | Dexie/SQLite adapters, local atomic outbox, server idempotent commands/pull, device leases | Crash/restart, reconnect, conflict, revoked/expired auth, local migration tests |
| 4 | Basic confirmed-sales reports, admin workflows, E2E/security/performance, Android/Windows pilot | Complete MVP acceptance including physical printer; documented failures/recovery |
| 5 | Onboarding/entitlement billing, platform console, real QRIS, inventory recipes/ledger | Provider sandbox+real validation, approval/refund/reconciliation tests |
| 6 | Store Hub, LAN kitchen/printers, terminal coordination | Partition/fencing/hub restore and multi-device conflict tests |

Phase 1 intentionally has no operational sale endpoints, offline checkout, fake charts, native packages, provider integrations or printer claims. Plan/subscription tables are a schema foundation, not paid SaaS enforcement. Phase 2 first slice should implement catalog/modifier validation and an atomic cash order/shift path before expanding UI.

## UI navigation map

POS Phase 1: login -> authorized merchant -> authorized outlet -> outlet workspace/device status; logout and session-expiry path. Phase 2: workspace -> category/search/products -> modifier selection -> cart/type/table -> submit/hold -> payment/receipt; shift and previous orders in secondary navigation. Persistent cart and large checkout action are introduced only with real durable business processing.

Dashboard Phase 1: login -> merchant selector -> authorized outlet list/create -> device list/register/revoke. Phase 4: menu, staff, tables, shifts and reports. Platform superadmin is separate in Phase 5 with explicit audited support access. KDS Phase 2: station selector -> pending/preparing/ready -> acknowledge; timers use server timestamp anchor.
