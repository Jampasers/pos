import { Body, Controller, Get, Global, HttpCode, Inject, Module, Param, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { deviceInputSchema, idSchema, outletInputSchema, paginationSchema } from '@pos/contracts';
import { schema, withTenant } from '@pos/db';
import { AuditService, DatabaseService, identityOf, Problem, type AuthRequest } from './common.js';
import { requireOutlet, requirePermission, TenantService } from './tenant-service.js';

function requestedTenant(request: AuthRequest): string { return idSchema.parse(request.headers['x-tenant-id']); }
function nextPage<T extends { id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit);
  return { data, page: { nextCursor: rows.length > limit ? data.at(-1)?.id ?? null : null } };
}

@Controller('tenants')
@ApiTags('Merchants')
@ApiCookieAuth()
export class TenantController {
  constructor(@Inject(TenantService) private readonly tenants: TenantService) {}
  @Get()
  async list(@Req() request: AuthRequest) { return { data: await this.tenants.list(identityOf(request).user.id) }; }
}

@Global()
@Module({ controllers: [TenantController], providers: [TenantService], exports: [TenantService] })
export class TenantModule {}

@Controller('outlets')
@ApiTags('Outlets')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
export class OutletController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  async list(@Req() request: AuthRequest, @Query() query: unknown) {
    const page = paginationSchema.parse(query);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'outlet:read');
      const grants = scope.allOutlets ? [] : await tx.select({ id: schema.membershipOutlets.outletId }).from(schema.membershipOutlets).where(eq(schema.membershipOutlets.membershipId, scope.membershipId));
      if (!scope.allOutlets && !grants.length) return { data: [], page: { nextCursor: null } };
      const rows = await tx.select().from(schema.outlets).where(and(eq(schema.outlets.tenantId, scope.tenantId), eq(schema.outlets.active, true),
        scope.allOutlets ? undefined : inArray(schema.outlets.id, grants.map(item => item.id)), page.after ? gt(schema.outlets.id, page.after) : undefined))
        .orderBy(asc(schema.outlets.id)).limit(page.limit + 1);
      return nextPage(rows, page.limit);
    });
  }

  @Get(':outletId')
  async get(@Req() request: AuthRequest, @Param('outletId') outletId: string) {
    idSchema.parse(outletId);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'outlet:read');
      return { data: await requireOutlet(tx, scope, outletId) };
    });
  }

  @Post()
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = outletInputSchema.parse(body);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'outlet:manage');
      if (!scope.allOutlets) throw new Problem('PERMISSION_FORBIDDEN', 'Merchant-wide outlet access required', 403);
      const [outlet] = await tx.insert(schema.outlets).values({ ...input, tenantId: scope.tenantId }).returning();
      if (!outlet) throw new Error('Outlet insert returned no row');
      await this.audit.append(tx, scope.tenantId, scope.userId, 'OUTLET_CREATED', outlet.id, { code: input.code }, outlet.id);
      return { data: outlet };
    });
  }
}

@Module({ controllers: [OutletController] })
export class OutletModule {}

@Controller('outlets/:outletId/devices')
@ApiTags('Devices')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
export class DeviceController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  async list(@Req() request: AuthRequest, @Param('outletId') outletId: string, @Query() query: unknown) {
    idSchema.parse(outletId);
    const page = paginationSchema.parse(query);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'device:manage'); await requireOutlet(tx, scope, outletId);
      const rows = await tx.select().from(schema.devices).where(and(eq(schema.devices.tenantId, scope.tenantId), eq(schema.devices.outletId, outletId), page.after ? gt(schema.devices.id, page.after) : undefined)).orderBy(asc(schema.devices.id)).limit(page.limit + 1);
      return nextPage(rows, page.limit);
    });
  }

  @Post()
  async register(@Req() request: AuthRequest, @Param('outletId') outletId: string, @Body() body: unknown) {
    idSchema.parse(outletId);
    const input = deviceInputSchema.parse(body);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'device:manage'); await requireOutlet(tx, scope, outletId);
      const [device] = await tx.insert(schema.devices).values({ ...input, tenantId: scope.tenantId, outletId, registeredBy: scope.userId }).onConflictDoNothing().returning();
      if (device) {
        await this.audit.append(tx, scope.tenantId, scope.userId, 'DEVICE_REGISTERED', device.id, { outletId, platform: device.platform }, outletId);
        return { data: device };
      }
      const [existing] = await tx.select().from(schema.devices).where(and(eq(schema.devices.tenantId, scope.tenantId), eq(schema.devices.id, input.id)));
      if (!existing || existing.outletId !== outletId || existing.name !== input.name || existing.platform !== input.platform || existing.revokedAt) {
        throw new Problem('DEVICE_CONFLICT', 'Device identifier is already used or revoked', 409);
      }
      return { data: existing };
    });
  }

  @Post(':deviceId/revoke')
  @HttpCode(200)
  async revoke(@Req() request: AuthRequest, @Param('outletId') outletId: string, @Param('deviceId') deviceId: string) {
    idSchema.parse(outletId); idSchema.parse(deviceId);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'device:manage'); await requireOutlet(tx, scope, outletId);
      const where = and(eq(schema.devices.tenantId, scope.tenantId), eq(schema.devices.outletId, outletId), eq(schema.devices.id, deviceId));
      const [revoked] = await tx.update(schema.devices).set({ revokedAt: new Date(), updatedAt: new Date(), version: sql`${schema.devices.version} + 1` }).where(and(where, isNull(schema.devices.revokedAt))).returning();
      if (revoked) {
        await this.audit.append(tx, scope.tenantId, scope.userId, 'DEVICE_REVOKED', deviceId, { outletId }, outletId);
        return { data: revoked };
      }
      const [existing] = await tx.select().from(schema.devices).where(where);
      if (!existing) throw new Problem('NOT_FOUND', 'Device not found', 404);
      return { data: existing };
    });
  }
}

@Module({ controllers: [DeviceController] })
export class DeviceModule {}

@Controller('audit')
@ApiTags('Audit')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
export class AuditController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get()
  async list(@Req() request: AuthRequest, @Query() query: unknown) {
    const page = paginationSchema.parse(query);
    return withTenant(this.database.db, identityOf(request).user.id, requestedTenant(request), async (tx, scope) => {
      await requirePermission(tx, scope, 'audit:read');
      const grants = scope.allOutlets ? [] : await tx.select({ id: schema.membershipOutlets.outletId }).from(schema.membershipOutlets).where(eq(schema.membershipOutlets.membershipId, scope.membershipId));
      if (!scope.allOutlets && !grants.length) return { data: [], page: { nextCursor: null } };
      const rows = await tx.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.tenantId, scope.tenantId),
        scope.allOutlets ? undefined : inArray(schema.auditLogs.outletId, grants.map(item => item.id)), page.after ? gt(schema.auditLogs.id, page.after) : undefined)).orderBy(asc(schema.auditLogs.id)).limit(page.limit + 1);
      return nextPage(rows, page.limit);
    });
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}
