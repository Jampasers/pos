# Security model

## Implemented foundation

- Argon2id password hashing: 64 MiB memory, three iterations, parallelism one. Login failures use the same message and run a dummy hash verification when identity is absent.
- 256-bit opaque browser session cookie. Only SHA-256 token hashes are in PostgreSQL. Absolute expiry, logout revocation, disabled-user rejection, HttpOnly, SameSite=Lax, Secure in production. No privileged token in localStorage.
- Unsafe requests require an allowlisted Origin. Authenticated mutations additionally require a session-bound CSRF header checked in constant time. Login also requires Origin, preventing login CSRF. No wildcard credentialed CORS.
- Input schemas reject unknown body fields, validate UUIDs, enforce lengths/limits and IANA timezones. Parameterized Drizzle queries; safe error envelopes.
- Fastify security headers, body size limit and bounded rates (stricter login). Logs redact cookie, auth and CSRF headers. Runtime database role must be nonowner, non-superuser, non-BYPASSRLS.
- Tenant derived from current active membership; current tenant suspension and membership activity checked in transaction. Membership discovery is self-only. Outlet grant and database-backed permission checks precede resource access.
- Composite foreign keys prevent cross-tenant linking. Forced RLS is tested using the real runtime role, including missing-context writes.
- Device registrations can be revoked and cannot be revived by idempotent registration retry. Device registration is not yet offline/device authentication. Audit entries commit with privileged outlet/device mutations; outlet-restricted managers see only granted-outlet events. Runtime cannot modify/delete audits. Global auth_events records successful/failed login and logout without tokens/passwords.

## Operational responsibilities

Serve API/frontend through TLS on the same site (e.g. pos.example.com/admin.example.com/api.example.com) with explicit origins. Cross-site cookie deployments require an explicit SameSite strategy and CSRF review; do not weaken the default by wildcarding origins. API binds loopback locally; container deployment must explicitly set API_HOST=0.0.0.0 behind a trusted proxy. Trust-proxy remains off by default; enable only for known ingress CIDRs after deployment design to protect rate limits/IP attribution.

Do not pass DATABASE_ADMIN_URL or seed credentials into API containers. Rotate example database/Redis/storage passwords. Grant runtime only required operations; never make it migration owner. Use managed secret storage in deployment. Production migrations run as a separate job with backup and forward-fix plan. Log request IDs and action identifiers, not customer receipt contents/session/passwords. Send sanitized errors to Sentry in Phase 4, with OpenTelemetry exporter and access controls.

## Planned security work before pilot

Staff invitations/password reset, manager reauthentication/action-bound approvals, offline signed leases/clock protection, tenant data export/deletion, per-outlet tax policy, device/session binding, native OS key storage and local encryption, configurable session idle timeout, distributed rate limits, infrastructure vulnerability scanning, backup restore rehearsal, penetration testing and retention policy. Password-based seed login is not a public self-service onboarding flow.

Electron must use sandbox/contextIsolation, no renderer nodeIntegration, a narrow preload capability allowlist, schema-validated IPC payloads, no arbitrary SQL/file/network IPC, blocked untrusted navigation and authenticated printer routing. Capacitor adapters must store keys in OS-protected storage. Browser local data cannot be made safe from a fully compromised same-origin script by IndexedDB alone; CSP and minimizing dependencies remain essential.

## Payments and hardware

Payment adapter development requires official provider API documentation and credentials. Verify raw webhook signature and timestamp, deduplicate event IDs, record immutable events and reconcile before settlement. Thermal print acknowledgment is not necessarily physical-paper success. A timeout after sending bytes enters ambiguous status, requiring operator confirmation; never silently retry and print twice. Manual reprint has a new job ID, parent reference, reason and audit event. No hardware support is production-verified yet.

## Backups

Proposed pilot: automated encrypted daily database backup plus continuous WAL/PITR where supported, separate credentials/location, 30-day retention, restoration rehearsal before launch and monthly thereafter. RPO/RTO must be agreed and measured; targets are not guarantees. Redis is expendable job infrastructure; sale/outbox facts remain in PostgreSQL. Store Hub/local sales need a separate durable backup/export policy without copying unprotected credentials.
