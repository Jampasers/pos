# Development and deployment

## Local setup

Requires Node 24.15+ (24.x), Corepack/pnpm 10.34.7 and Docker Compose v2.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env: choose an explicit seed password and set SEED_ENABLED=true.
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

API http://localhost:4000/v1; Swagger http://localhost:4000/docs; POS http://localhost:5173; dashboard http://localhost:3000. Login emails are owner@example.test, cashier@example.test and kitchen@example.test. Password is the value explicitly supplied in .env. Owner belongs to two merchants; cashier is limited to one outlet. No default seed password exists.

For cross-origin API override, set apps/pos/.env.local `VITE_API_URL` and apps/admin/.env.local `NEXT_PUBLIC_API_URL`, and configure matching ALLOWED_ORIGINS. Rebuild frontends when these values change. Client bundles contain no database secrets. API/db scripts load the repository root .env; production uses real process environment. Production seed is refused.

Compose runs PostgreSQL as core infrastructure. Optional `--profile extended` adds authenticated Redis and S3-compatible VersityGW. They are reserved for later operational modules, not required by Phase 1 API. Ports bind loopback, volumes persist, health checks are present. `infra:down` keeps volumes; never use `down -v` against data you need. Docker application images and monitoring exporters are added with deployment hardening, not fake running services.

## Runtime database role

Docker bootstrap provisions non-superuser `pos_app` from APP_DB_PASSWORD. Migrations grant explicit privileges/RLS policies. The API refuses the migration owner/superuser role at startup. Existing non-Docker clusters must provision the same role before migration. DATABASE_ADMIN_URL is for migration and seed only; DATABASE_URL is runtime. Database credential examples are for loopback development only.

## Production preparation

Build with `pnpm build`; API runs `node apps/api/dist/main.js`, POS publishes apps/pos/dist, and dashboard runs `pnpm --filter @pos/admin start`. Install workspace production dependencies and retain shared package dist files. Set NODE_ENV=production, secure credentials, ALLOWED_ORIGINS, HTTPS same-site deployment, session TTL, host and port. Migrations run as a release job before traffic; backwards-compatible changes for rolling deployments. Readiness must pass before ingress routes traffic. SIGTERM stops accepting requests and closes the pool. Do not deploy with seed enabled or migration credentials available to runtime.

Deploying, obtaining TLS/domains, native app signing, cloud provider access, physical printers, external payments and backup objectives are not authorized/configured by this initial repository implementation. Complete the Phase 4 operational qualification before handling real sales.
