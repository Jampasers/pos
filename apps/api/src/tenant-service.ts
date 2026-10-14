import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema, withIdentity, type TenantScope, type Transaction } from '@pos/db';
import type { Membership } from '@pos/contracts';
import { DatabaseService, Problem } from './common.js';

@Injectable()
export class TenantService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  async list(userId: string): Promise<Membership[]> {
    return withIdentity(this.database.db, userId, async tx => {
      const memberships = await tx.select({ id: schema.memberships.id, roleId: schema.memberships.roleId, tenantId: schema.tenants.id, tenantName: schema.tenants.name, tenantSlug: schema.tenants.slug, role: schema.roles.name, allOutlets: schema.memberships.allOutlets })
        .from(schema.memberships).innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id)).innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.active, true), eq(schema.tenants.status, 'active'))).orderBy(asc(schema.tenants.name));
      const result: Membership[] = [];
      for (const membership of memberships) {
        const grants = await tx.select({ id: schema.membershipOutlets.outletId }).from(schema.membershipOutlets).where(eq(schema.membershipOutlets.membershipId, membership.id));
        const permissions = await tx.select({ name: schema.permissions.name }).from(schema.rolePermissions).innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id)).where(eq(schema.rolePermissions.roleId, membership.roleId));
        result.push({ tenantId: membership.tenantId, tenantName: membership.tenantName, tenantSlug: membership.tenantSlug, role: membership.role, allOutlets: membership.allOutlets, outletIds: grants.map(item => item.id), permissions: permissions.map(item => item.name) });
      }
      return result;
    });
  }
}

export async function requirePermission(tx: Transaction, scope: TenantScope, permission: string) {
  const [grant] = await tx.select({ id: schema.rolePermissions.id }).from(schema.rolePermissions).innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id)).where(and(eq(schema.rolePermissions.roleId, scope.roleId), eq(schema.permissions.name, permission)));
  if (!grant) throw new Problem('PERMISSION_FORBIDDEN', 'Operation is not permitted', 403);
}

export async function requireOutlet(tx: Transaction, scope: TenantScope, outletId: string) {
  if (!scope.allOutlets) {
    const [grant] = await tx.select({ id: schema.membershipOutlets.id }).from(schema.membershipOutlets).where(and(eq(schema.membershipOutlets.membershipId, scope.membershipId), eq(schema.membershipOutlets.outletId, outletId)));
    if (!grant) throw new Problem('NOT_FOUND', 'Outlet not found', 404);
  }
  const [outlet] = await tx.select().from(schema.outlets).where(and(eq(schema.outlets.tenantId, scope.tenantId), eq(schema.outlets.id, outletId), eq(schema.outlets.active, true)));
  if (!outlet) throw new Problem('NOT_FOUND', 'Outlet not found', 404);
  return outlet;
}
