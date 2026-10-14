# Verification strategy

```sh
pnpm typecheck
pnpm test
pnpm build
# Real PostgreSQL with the admin and runtime roles from .env:
pnpm test:integration
# Migrated/seeded PostgreSQL; test runners start API, POS and admin:
pnpm exec playwright install chromium
pnpm test:e2e
```

Unit tests exercise integer-money rounding/overflow bounds, invalid discounts, order/payment transitions, Argon2id/session hashing and strict contract validation. These are pure foundation tests; no checkout claim follows from them.

Integration tests require native PostgreSQL, INTEGRATION_TEST_ENABLED=true, and fail if configuration is missing; they are not silently skipped. Tests use separate tenant fixtures, a non-superuser runtime connection, real migrations and real API injection. Check session expiry/logout, origin/CSRF, disabled identity, merchant/outlet/role isolation, RLS missing-context behavior, scoped FK violations, device retry/revocation and append-only audit. Fixtures are isolated from seed/business data and deleted only by the administrative test connection. Never run this suite on production.

Playwright exercises actual browser login, merchant selection, outlet creation, device registration/revocation, reload session restoration, logout and cashier outlet restriction. Tests use the explicitly supplied seed password. No auth mocks replace real API/DB behavior.

GitHub Actions installs the frozen lockfile on Node 24, runs type/build/unit checks, PostgreSQL integration tests and browser tests. Native/physical hardware testing is a separate release gate. Dependency advisory review is required before public deployment; a successful CI job alone does not certify production readiness.

## Unimplemented operational test gates

Phase 2 financial transaction consistency and KDS duplication tests; Phase 3 crash-safe local outbox, repeated synchronization, concurrent edits, cursor ordering and schema upgrades; Phase 4 inventory/report reconciliation, device revocation of sync authority, Android/iOS/Windows/macOS qualification and explicitly named thermal printer/transport. Sentry/OTel exporter integration, restore drills and load/security tests belong to hardening. Record actual commands and results in VERIFICATION.md after execution.
