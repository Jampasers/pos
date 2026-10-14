# F&B POS product requirements

## Scope and release gates

The product serves restaurants, cafes and coffee shops with a merchant as tenant, one or more outlets, and staff belonging to multiple merchants. Currency initially is IDR. Merchant timezone is initially Asia/Jakarta; persist timestamps in UTC and group reports in outlet timezone. Currency, tax and service-charge settings become versioned outlet configuration before selling.

Phase 1 is the foundation release, not a usable sales MVP. It delivers real authentication, merchant discovery, scoped outlets, owner outlet creation, device registration/revocation, an audit trail, runnable POS/admin applications, reproducible database migrations and automated isolation tests. Future screens must not report invented sales or pretend checkout works.

## Operational journeys

1. Owner logs in, selects a merchant, creates an outlet, and registers a cashier device.
2. Cashier logs in to an authorized outlet, opens a shift, picks products and required modifiers, assigns an order type/table, submits to kitchen, receives cash, finalizes and prints a receipt.
3. Kitchen staff receives one ticket per order revision/station, marks preparing/ready; waiter delivers.
4. Manager approves excessive discounts, voids/refunds and cash adjustments with a separately authenticated approval and reason.
5. Cashier closes a shift; reports compare immutable ledger-derived expected cash and actual cash.
6. Level 1 cashier continues on the same device during an outage; pending commands survive restart, synchronize and surface explicit conflicts.

## Permissions

| Role | Outlet visibility | Capabilities |
| --- | --- | --- |
| Platform admin | No automatic merchant access | Audited support access in Phase 5 |
| Merchant owner | All merchant outlets | Outlet and device administration, reporting, staff and plan management |
| Outlet manager | Assigned outlets | Outlet operations, device administration and approval |
| Cashier | Assigned outlets | Orders, cash, own shift and receipts |
| Waiter | Assigned outlets | Tables and order submission |
| Kitchen staff | Assigned outlets | Kitchen tickets |

Database role-permission mappings are authoritative. Platform administration is a separate authority, not a tenant role that bypasses RLS. Phase 1 seeds system roles; a staff invitation/role editor is Phase 2/4 work.

## Functional roadmap

| Domain | First delivery | Acceptance evidence |
| --- | --- | --- |
| Identity, tenant, outlet, device | 1 | Login/logout, suspended tenant denial, cross-tenant/outlet/role tests |
| Menu, variants/modifiers, tables, orders | 2 | Required modifier and order-transition tests |
| Cash, split/partial payments, shifts | 2 | Atomic accounting and duplicate-command tests |
| Connected KDS, receipts | 2 | Authenticated delivery; supported printer qualification |
| Durable local sales and sync | 3 | Crash/restart, retry, migration and concurrent-command tests |
| Reports, security, Android/Windows pilot | 4 | Ledger reconciliation and physical-device evidence |
| Subscription enforcement, QRIS, inventory | 5 | Entitlements, signed provider events, stock ledger |
| Store Hub/LAN coordination | 6 | Hub/LAN failure and recovery tests |

## Nonfunctional requirements and proposed targets

Integrity takes precedence over availability when a device cannot durably write, authorization expires, or finance conflicts. No floating-point monetary arithmetic, client-selected prices at finalization, silent offline edits, or success based on an HTTP timeout. Performance targets to measure in Phase 4: cached product selection under 100 ms, durable local cash checkout under 500 ms, cloud command p95 under 500 ms excluding providers. These are targets, not measured results.

The MVP gate requires the complete cashier-to-kitchen-to-receipt journey, authorized roles, tenant isolation, durable offline restart/reconnect without duplicate sales, confirmed-sales reports, and tested Android/Windows/printer support. Provider payments, LAN offline collaboration, and native support must remain explicitly unavailable until verified.

## Assumptions requiring later decisions

No payment provider credentials or printer devices are provided. Do not create fake provider endpoints. Tax rounding policy initially is per line, half-up, integer minor units with basis-point rates; legal/tax applicability is merchant configuration requiring validation before pilot. Refunds append reversal entries, never alter the original sale. Native signing/store distribution, hosting, retention and backup objectives are determined before pilot.
