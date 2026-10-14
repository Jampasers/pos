# Verification evidence

Date: 2026-10-15. Scope: Phase 0 and Phase 1 foundation, not a finished POS MVP.

| Check | Result / evidence |
| --- | --- |
| Repository inspection | Initial repository contained only README.md and one main commit; no existing implementation was overwritten |
| Compatible install | Exact direct versions and peer constraints checked against official docs/npm metadata; frozen offline reinstallation passed |
| Strict types | Applications, packages, test files and tool scripts passed |
| Unit/database-WASM tests | 32 tests passed across five files; Argon2id, money/state rules, strict contracts, config, forced RLS, scoped FK and rollback checks |
| Production builds | API + seven shared packages + React/Vite POS + Next dashboard built successfully |
| Migrations/seed | Applied real Drizzle migrations to a local PostgreSQL-WASM engine using the normal pg wire client; second migration application was harmless; explicit seed succeeded |
| Running API/HTTP flow | NestJS/Fastify ran with a nonowner pos_app role on PGlite. Readiness, password login, two-merchant discovery, tenant/outlet denial, CSRF, strict input, outlet creation, device retry/revocation and logout passed real HTTP assertions |
| Native PostgreSQL/API suite | 13 integration cases passed against native PostgreSQL 17.10 in GitHub Actions, including concurrent device retry, role/outlet isolation, suspension, logout/expiry and raw RLS |
| Browser suite | Three real Chromium journeys passed: restricted cashier/login-reload-logout; merchant outlet/device creation-revocation; tenant switching, touch viewport and dark mode |
| Hardware/native/offline sales | Not implemented or verified; future phase gates |

## Commands executed

`pnpm install`, `pnpm install --frozen-lockfile --offline`, `pnpm db:generate` (including reviewed custom security migration), `pnpm api:export`, `pnpm check`, migration/seed commands, and an isolated real-HTTP API assertion runner. CI additionally ran `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm test:integration`, `pnpm exec playwright install --with-deps chromium`, and `pnpm test:e2e`. The local HTTP runner uses PostgreSQL-WASM only for local validation; the production driver/config and CI use native PostgreSQL.

## Environment limitations

Docker/native PostgreSQL execution is unavailable in this managed workspace (no Docker daemon; native Postgres cannot switch to a mapped nonroot UID). TCP services started in separate tool calls also use separate network namespaces, so the successful API checks ran database and API together in one isolated runner. Browser binary download returned an invalid ZIP locally. These do not justify weakening the runtime role check, bypassing RLS, replacing auth with mocks or claiming native/browser certification.

The GitHub Actions workflow provisions a disposable native PostgreSQL container with randomly generated credentials, runs the real backend integration suite and Playwright against built apps, and retains failure evidence. The successful run resolved the local Docker/browser limitations for foundation verification. No Android/iOS/Windows/macOS device or thermal printer is provided; no native-platform or receipt qualification is claimed. Optional Redis/VersityGW services have not been exercised; they are not used by Phase 1.

## CI result

Passing run: https://github.com/Jampasers/pos/actions/runs/38616630558 for code commit `3288a23a994da07335c64f1dca35dc5edafdc0b1`.

All steps succeeded: pinned installation, strict application/package/test/tool types, 32 unit/SQL-WASM tests, all 10 workspace production builds, native PostgreSQL migrations/seed, 13 backend integration tests and three Chromium journeys. Total: 48 automated cases. Foundation acceptance is verified; the sales MVP acceptance criteria are not yet met.

The first run exposed a shared PORT environment collision during browser startup. API_PORT/API_HOST now scope API configuration, and the runner explicitly starts Next on port 3000 with production mode. No failing test was removed or mocked to make the workflow pass. This final documentation-only update does not alter the verified code.
