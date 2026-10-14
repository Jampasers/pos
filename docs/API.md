# API contract

Base `/v1`. Running API exposes `/docs` Swagger and `/docs/json` in nonproduction. Production documentation is disabled by default. Authoritative request/response validation lives in `packages/contracts`; `scripts/export-openapi.ts` generates the static Phase 1 specification from these schemas.

| Method/path | Phase 1 behavior | Access |
| --- | --- | --- |
| GET /health/live | Process liveness | Public |
| GET /health/ready | PostgreSQL readiness, 503 on failure | Public |
| POST /auth/login | Verify password, issue HttpOnly session cookie | Allowed Origin; strict body; rate limit |
| GET /auth/session | User, CSRF token, permitted merchant memberships | Session |
| POST /auth/logout | Revoke current session and clear cookie | Session, CSRF |
| GET /tenants | Membership-filtered active merchant discovery | Session |
| GET /outlets?limit=&after= | Permitted active outlets, UUID keyset pagination | Verified tenant, outlet:read |
| POST /outlets | Create outlet with code/name/timezone | Verified tenant, outlet:manage |
| GET /outlets/:outletId | Scoped outlet detail | Tenant + outlet:read + outlet grant |
| GET /outlets/:outletId/devices | Paginated active/revoked registered devices | Tenant + device:manage + outlet grant |
| POST /outlets/:outletId/devices | Register device UUID/name/platform | Tenant + device:manage + outlet grant, CSRF |
| POST /outlets/:outletId/devices/:deviceId/revoke | Irreversibly revoke registration | Tenant + device:manage + outlet grant, CSRF |
| GET /audit?limit=&after= | Tenant audit events, stable UUID pagination | Verified tenant, audit:read |

Responses are `{ data: T }` or `{ data: T[], page: { nextCursor: string|null } }`. Errors are `{ error: { code, message, requestId } }`; validation errors are 400, unauthenticated 401, unauthorized 403, absent scoped resources 404, unique conflict 409, unavailable dependency 503. No stack traces/SQL or passwords reach clients. IDs and positive limits are validated. Lists have max 100 and stable ordering. No arbitrary user-selected SQL sort fields.

Browser requests set `credentials: 'include'`; mutations include `X-CSRF-Token`, `Origin` from an explicit allowlist and `X-Tenant-Id` for tenant resources. GET session returns the CSRF token. `X-Tenant-Id` is verified against current server membership on every request. Platform-admin cookies do not grant tenant access.

## Request examples

Login: `{ "email": "owner@example.test", "password": "<explicit seed password>" }`.

Outlet: `{ "code": "CBD", "name": "Central Cafe", "timezone": "Asia/Jakarta" }`.

Device: `{ "id": "<UUID>", "name": "Counter 1", "platform": "web" }`. Registration UUID makes identical retry safe; changed outlet/name/platform under the same UUID returns conflict. A revoked registration cannot be revived by retry. Registration does not issue offline credentials or bind browser sessions to a trusted native device. Those are Phase 3 work.

## Future commands and provider contracts

Phase 2 uses explicit order commands with operation IDs and expected versions, cash payment/finalization transactions, shift open/close and kitchen transitions. Phase 3 `/sync/push` and `/sync/pull` implement [the offline protocol](OFFLINE_SYNC.md). These endpoints are not currently served.

PaymentProvider requires `createIntent`, `queryStatus`, `verifyWebhook` and `requestRefund`, returning typed states/provider references. Phase 5 adapters must follow a chosen provider's official APIs, signature/replay rules and merchant credentials. Callback success is authoritative only after verified provider confirmation; unknown/replayed/out-of-order events cannot duplicate allocations.
