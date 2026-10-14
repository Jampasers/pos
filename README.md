# Danka POS

Production-oriented F&B POS SaaS, delivered incrementally. This repository implements **Phase 0 specifications and the Phase 1 foundation**. It does not yet process sales, cash shifts, kitchen tickets or offline transactions. Do not use it for real cashier sales yet.

## Implemented

- pnpm/Turborepo monorepo with strict TypeScript.
- NestJS/Fastify API, React/Vite POS workspace, Next.js merchant dashboard.
- Argon2id authentication, expiring/revocable HttpOnly sessions, CSRF and origin checks.
- Multi-merchant membership discovery, outlet permissions, forced PostgreSQL RLS and tenant-scoped foreign keys.
- Outlet creation, idempotent device registration, permanent registration revocation and transactional append-only audit.
- Drizzle schema, versioned migrations, explicit development seed, OpenAPI contracts and Docker development services.
- Tested pure money/state rules and database isolation, plus native PostgreSQL/API integration and browser test suites in CI.

## Quick start

Requires Node 24.15+ (24.x), pnpm 10.34.7 and Docker Compose v2.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit `.env`: choose a password of at least 12 characters for `SEED_PASSWORD`, set `SEED_ENABLED=true`, and keep admin/runtime database passwords distinct. The example database/service passwords are for loopback development only.

```sh
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Application | Local URL |
| --- | --- |
| POS workspace | http://localhost:5173 |
| Merchant dashboard | http://localhost:3000 |
| API readiness | http://localhost:4000/v1/health/ready |
| Swagger | http://localhost:4000/docs |

Seed emails: `owner@example.test`, `cashier@example.test`, `kitchen@example.test`. Password is the explicit value you supplied; no default password is provided. Owner belongs to two merchants. Cashier/kitchen staff can access only the Bekasi outlet. Public self-service onboarding is planned for Phase 5.

Redis and S3-compatible VersityGW can be started with the optional Compose `extended` profile. They are not required by the Phase 1 API. Application images, observability exporters and production hosting are later hardening work.

## Checks

```sh
pnpm check
pnpm api:export
# Use an isolated test database; set INTEGRATION_TEST_ENABLED=true in .env.
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs strict application/test/tool types, unit/PostgreSQL-WASM RLS tests and production builds. The separate integration suite requires a native PostgreSQL runtime role and fails without explicit test configuration. CI provisions a disposable PostgreSQL container with random credentials and runs the API and browser suites. See [actual verification evidence](docs/VERIFICATION.md); implemented test files alone do not mean a feature has been verified.

## Documentation

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Database and ERD](docs/DATABASE.md) · [State machines](docs/STATE_MACHINES.md) · [API](docs/API.md) · [OpenAPI](docs/openapi.json) · [Offline sync](docs/OFFLINE_SYNC.md) · [Security](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md) · [Decisions and compatibility sources](docs/adr/0001-foundation.md)

## Next delivery

Phase 2 starts with the catalog/variant/modifier model and the cashier order/shift/cash transaction path, then connected KDS and qualified receipts. Phase 3 adds durable Dexie/SQLite outbox synchronization. No QRIS provider, native shell, thermal printer or multi-device LAN offline operation is claimed implemented or production-verified by this foundation.
