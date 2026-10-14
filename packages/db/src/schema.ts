import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgPolicy, pgRole, pgTable, timestamp, unique, uuid, varchar, type AnyPgColumn } from 'drizzle-orm/pg-core';

const appRole = pgRole('pos_app').existing();
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const tenantContext = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
const userContext = sql`nullif(current_setting('app.user_id', true), '')::uuid`;
const tenantPolicy = (name: string, column: AnyPgColumn) => pgPolicy(`${name}_tenant_scope`, { for: 'all', to: appRole, using: sql`${column} = ${tenantContext}`, withCheck: sql`${column} = ${tenantContext}` });

export const tenantStatus = pgEnum('tenant_status', ['active', 'suspended']);
export const subscriptionStatus = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'cancelled']);
export const devicePlatform = pgEnum('device_platform', ['web', 'android', 'ios', 'windows', 'macos']);

export const users = pgTable('users', {
  id: id(), email: varchar('email', { length: 254 }).notNull().unique(), name: varchar('name', { length: 120 }).notNull(),
  passwordHash: varchar('password_hash', { length: 256 }).notNull(), active: boolean('active').notNull().default(true), createdAt: createdAt(),
}, table => [check('users_lowercase_email', sql`${table.email} = lower(${table.email})`)]);

export const sessions = pgTable('sessions', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id), tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }), createdAt: createdAt(),
}, table => [index('sessions_user_expiry_idx').on(table.userId, table.expiresAt), check('sessions_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`)]);

export const authEvents = pgTable('auth_events', {
  id: id(), userId: uuid('user_id').references(() => users.id), action: varchar('action', { length: 40 }).notNull(), createdAt: createdAt(),
});

export const roles = pgTable('roles', { id: id(), name: varchar('name', { length: 40 }).notNull().unique(), createdAt: createdAt() });
export const permissions = pgTable('permissions', { id: id(), name: varchar('name', { length: 64 }).notNull().unique(), createdAt: createdAt() });
export const rolePermissions = pgTable('role_permissions', {
  id: id(), roleId: uuid('role_id').notNull().references(() => roles.id), permissionId: uuid('permission_id').notNull().references(() => permissions.id), createdAt: createdAt(),
}, table => [unique('role_permissions_pair_unique').on(table.roleId, table.permissionId)]);

export const tenants = pgTable('tenants', {
  id: id(), name: varchar('name', { length: 120 }).notNull(), slug: varchar('slug', { length: 80 }).notNull().unique(), status: tenantStatus('status').notNull().default('active'), createdAt: createdAt(),
}, table => [
  pgPolicy('tenants_membership_read', { for: 'select', to: appRole, using: sql`exists (select 1 from memberships m where m.tenant_id = ${table.id} and m.user_id = ${userContext} and m.active)` }),
  pgPolicy('tenants_lock_only', { for: 'update', to: appRole, using: sql`exists (select 1 from memberships m where m.tenant_id = ${table.id} and m.user_id = ${userContext} and m.active)`, withCheck: sql`false` }),
]).enableRLS();

export const plans = pgTable('plans', {
  id: id(), name: varchar('name', { length: 80 }).notNull().unique(), outletLimit: integer('outlet_limit').notNull(), deviceLimit: integer('device_limit').notNull(), createdAt: createdAt(),
}, table => [check('plans_positive_limits', sql`${table.outletLimit} > 0 and ${table.deviceLimit} > 0`)]);
export const subscriptions = pgTable('subscriptions', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(), planId: uuid('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatus('status').notNull(), validUntil: timestamp('valid_until', { withTimezone: true }), graceUntil: timestamp('grace_until', { withTimezone: true }), createdAt: createdAt(),
}, table => [tenantPolicy('subscriptions', table.tenantId)]).enableRLS();

export const outlets = pgTable('outlets', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), code: varchar('code', { length: 20 }).notNull(), name: varchar('name', { length: 120 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).notNull(), active: boolean('active').notNull().default(true), version: integer('version').notNull().default(1),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [unique('outlets_tenant_id_unique').on(table.tenantId, table.id), unique('outlets_tenant_code_unique').on(table.tenantId, table.code),
  check('outlets_positive_version', sql`${table.version} > 0`), tenantPolicy('outlets', table.tenantId)]).enableRLS();

export const memberships = pgTable('memberships', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), userId: uuid('user_id').notNull().references(() => users.id), roleId: uuid('role_id').notNull().references(() => roles.id),
  active: boolean('active').notNull().default(true), allOutlets: boolean('all_outlets').notNull().default(false), createdAt: createdAt(),
}, table => [unique('memberships_tenant_user_unique').on(table.tenantId, table.userId), unique('memberships_tenant_id_unique').on(table.tenantId, table.id),
  index('memberships_user_active_idx').on(table.userId, table.active),
  pgPolicy('memberships_self_read', { for: 'select', to: appRole, using: sql`${table.userId} = ${userContext}` }),
  pgPolicy('memberships_lock_only', { for: 'update', to: appRole, using: sql`${table.userId} = ${userContext}`, withCheck: sql`false` }),
]).enableRLS();

export const membershipOutlets = pgTable('membership_outlets', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), membershipId: uuid('membership_id').notNull(), outletId: uuid('outlet_id').notNull(), createdAt: createdAt(),
}, table => [
  unique('membership_outlets_pair_unique').on(table.membershipId, table.outletId),
  foreignKey({ name: 'membership_outlets_scoped_membership_fk', columns: [table.tenantId, table.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }),
  foreignKey({ name: 'membership_outlets_scoped_outlet_fk', columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  pgPolicy('membership_outlets_self_read', { for: 'select', to: appRole, using: sql`exists (select 1 from memberships m where m.id = ${table.membershipId} and m.tenant_id = ${table.tenantId} and m.user_id = ${userContext})` }),
]).enableRLS();

export const devices = pgTable('devices', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), outletId: uuid('outlet_id').notNull(), name: varchar('name', { length: 120 }).notNull(), platform: devicePlatform('platform').notNull(),
  registeredBy: uuid('registered_by').notNull().references(() => users.id), revokedAt: timestamp('revoked_at', { withTimezone: true }), version: integer('version').notNull().default(1),
  createdAt: createdAt(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [unique('devices_tenant_id_unique').on(table.tenantId, table.id), index('devices_tenant_outlet_id_idx').on(table.tenantId, table.outletId, table.id),
  foreignKey({ name: 'devices_scoped_outlet_fk', columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  check('devices_positive_version', sql`${table.version} > 0`), tenantPolicy('devices', table.tenantId)]).enableRLS();

export const auditLogs = pgTable('audit_logs', {
  id: id(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), actorId: uuid('actor_id').notNull().references(() => users.id),
  outletId: uuid('outlet_id'),
  action: varchar('action', { length: 80 }).notNull(), resourceId: uuid('resource_id').notNull(), details: jsonb('details').$type<Record<string, unknown>>().notNull(), createdAt: createdAt(),
}, table => [index('audit_tenant_time_id_idx').on(table.tenantId, table.createdAt, table.id),
  foreignKey({ name: 'audit_scoped_outlet_fk', columns: [table.tenantId, table.outletId], foreignColumns: [outlets.tenantId, outlets.id] }),
  pgPolicy('audit_tenant_read', { for: 'select', to: appRole, using: sql`${table.tenantId} = ${tenantContext}` }),
  pgPolicy('audit_tenant_append', { for: 'insert', to: appRole, withCheck: sql`${table.tenantId} = ${tenantContext} and ${table.actorId} = ${userContext}` }),
]).enableRLS();
