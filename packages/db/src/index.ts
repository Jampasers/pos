import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from './schema.js';

export { schema };
export function connectDatabase(url: string) {
  const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type TenantScope = { tenantId: string; userId: string; membershipId: string; roleId: string; allOutlets: boolean };

export class ScopeError extends Error {}

export function withIdentity<T>(db: Database, userId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

export function withTenant<T>(db: Database, userId: string, requestedTenantId: string, work: (tx: Transaction, scope: TenantScope) => Promise<T>): Promise<T> {
  return withIdentity(db, userId, async tx => {
    const [membership] = await tx.select({ id: schema.memberships.id, roleId: schema.memberships.roleId, allOutlets: schema.memberships.allOutlets })
      .from(schema.memberships).innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, requestedTenantId), eq(schema.memberships.active, true), eq(schema.tenants.status, 'active'))).for('share');
    if (!membership) throw new ScopeError('Merchant access is unavailable');
    await tx.execute(sql`select set_config('app.tenant_id', ${requestedTenantId}, true)`);
    return work(tx, { tenantId: requestedTenantId, userId, membershipId: membership.id, roleId: membership.roleId, allOutlets: membership.allOutlets });
  });
}

export async function assertSafeRuntimeRole(db: Database): Promise<void> {
  const result = await db.execute<{ unsafe: boolean }>(sql`
    select r.rolsuper or r.rolbypassrls or exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relowner = r.oid
    ) as unsafe from pg_roles r where r.rolname = current_user`);
  if (!result.rows[0] || result.rows[0].unsafe) throw new Error('Runtime database role must be nonowner, nonsuperuser and cannot bypass RLS');
}
