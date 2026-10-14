# ADR 0001: Foundation, identity and tenant scope

Status: accepted for Phase 1.

Use a modular monolith and activate only code with real functionality. Use the same React UI components in POS and Next dashboard. Separate browser/client code from server credentials and native drivers. Use cookie sessions for browser clients: revocation is immediate online and no permanent bearer credential enters localStorage. Use server-verified membership context, non-owner runtime role, forced RLS and scoped foreign keys as independent tenant barriers.

Tradeoffs: every tenant request needs a database transaction and membership lookup. Session authentication needs PostgreSQL availability. Offline identity is a future signed, expiring authorization lease; this foundation does not allow offline login or checkout. No universal "platform_admin" tenant bypass is included.

## ADR 0002: Financial representation

Use integer minor units serialized as decimal strings. PostgreSQL `bigint` and JavaScript `bigint` avoid Number precision and decimal rounding problems. IDR initially has exponent zero. Basis points and deterministic half-up rounding are domain rules. Checkout snapshots are immutable, refunds are new records. Decimal quantities for ingredient measurements use PostgreSQL numeric and explicit conversion rules, not money's rounding policy.

## ADR 0003: Command synchronization

Use at-least-once command delivery, atomic outbox writes and deduplication keyed by `(tenant_id, device_id, operation_id)`. Store payload hash with the result so the same ID cannot authorize different content. Device-local sequences preserve causality but are not a global conflict-resolution clock. Financial commands are serialized with locks/unique constraints and expected versions; never last-write-wins.

## ADR 0004: Toolchain

Node 24 LTS, pnpm 10.34.7, TypeScript 5.9.3, Nest 11.2.7/Fastify 5.12.7/Swagger 11.4.7, React 19.3.1, Vite 8.3.4/plugin-react 6.1.2, Next 16.4.0, Tailwind 4.3.3, Drizzle 0.45.4/Kit 0.31.11, Zod 4.6.7, Vitest 4.1.11. Pin compatible maintained major lines rather than adopting Nest 12's ESM migration, TS 7, router 8 and pnpm 12 simultaneously. Exact direct versions plus pnpm-lock.yaml make installation repeatable. Review advisories and patch updates before deployment.

Compatibility checked against official documentation and npm publisher metadata on 2026-10-15 (Asia/Jakarta):

- https://docs.nestjs.com/v11/migration-guide (Nest 11 with Fastify 5)
- https://vite.dev/guide/ (Node engine requirements)
- https://nextjs.org/docs/app/getting-started/installation (React and Node requirements)
- https://ui.shadcn.com/docs/installation/vite (Tailwind Vite integration)
- https://tailwindcss.com/docs/installation/using-vite
- https://tanstack.com/query/latest/docs/framework/react/installation
- https://vitest.dev/guide/
- https://orm.drizzle.team/docs/get-started/postgresql-new
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://pnpm.io/10.x/installation
- https://registry.npmjs.org/ (versions and engine/peer constraints)
