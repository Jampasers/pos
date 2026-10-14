import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '@pos/auth';
import { permissionNames, roleNames, rolePermissions } from '@pos/domain';
import { connectDatabase, schema } from './index.js';

export const seedIds = {
  owner: '10000000-0000-4000-8000-000000000001', cashier: '10000000-0000-4000-8000-000000000002', kitchen: '10000000-0000-4000-8000-000000000003',
  tenantA: '20000000-0000-4000-8000-000000000001', tenantB: '20000000-0000-4000-8000-000000000002',
  outletA: '30000000-0000-4000-8000-000000000001', outletA2: '30000000-0000-4000-8000-000000000002', outletB: '30000000-0000-4000-8000-000000000003',
  ownerA: '40000000-0000-4000-8000-000000000001', ownerB: '40000000-0000-4000-8000-000000000002', cashierA: '40000000-0000-4000-8000-000000000003', kitchenA: '40000000-0000-4000-8000-000000000004',
};

export async function seedDatabase(url: string, password: string): Promise<void> {
  if (password.length < 12 || password.length > 256) throw new Error('Explicit seed password must be between 12 and 256 characters');
  const { pool, db } = connectDatabase(url);
  try {
    const passwordHash = await hashPassword(password);
    await db.transaction(async tx => {
      const roles = await tx.insert(schema.roles).values(roleNames.map(name => ({ name }))).onConflictDoUpdate({ target: schema.roles.name, set: { name: schema.roles.name } }).returning();
      const permissions = await tx.insert(schema.permissions).values(permissionNames.map(name => ({ name }))).onConflictDoUpdate({ target: schema.permissions.name, set: { name: schema.permissions.name } }).returning();
      for (const role of roles) {
        const allowed = rolePermissions[role.name as typeof roleNames[number]];
        await tx.insert(schema.rolePermissions).values(permissions.filter(permission => allowed.includes(permission.name as typeof permissionNames[number])).map(permission => ({ roleId: role.id, permissionId: permission.id }))).onConflictDoNothing();
      }
      const roleId = (name: string) => { const role = roles.find(item => item.name === name); if (!role) throw new Error('Missing seed role'); return role.id; };
      await tx.insert(schema.users).values([
        { id: seedIds.owner, email: 'owner@example.test', name: 'Merchant Owner', passwordHash },
        { id: seedIds.cashier, email: 'cashier@example.test', name: 'Cashier', passwordHash },
        { id: seedIds.kitchen, email: 'kitchen@example.test', name: 'Kitchen Staff', passwordHash },
      ]).onConflictDoNothing();
      await tx.insert(schema.tenants).values([{ id: seedIds.tenantA, name: 'Danka Coffee', slug: 'danka-coffee' }, { id: seedIds.tenantB, name: 'Second Merchant', slug: 'second-merchant' }]).onConflictDoNothing();
      const [plan] = await tx.insert(schema.plans).values({ name: 'Pilot', outletLimit: 3, deviceLimit: 10 }).onConflictDoUpdate({ target: schema.plans.name, set: { name: schema.plans.name } }).returning();
      if (!plan) throw new Error('Missing seed plan');
      await tx.insert(schema.subscriptions).values([seedIds.tenantA, seedIds.tenantB].map(tenantId => ({ tenantId, planId: plan.id, status: 'trialing' as const }))).onConflictDoNothing();
      await tx.insert(schema.outlets).values([
        { id: seedIds.outletA, tenantId: seedIds.tenantA, name: 'Bekasi', code: 'BKS', timezone: 'Asia/Jakarta' },
        { id: seedIds.outletA2, tenantId: seedIds.tenantA, name: 'Depok', code: 'DPK', timezone: 'Asia/Jakarta' },
        { id: seedIds.outletB, tenantId: seedIds.tenantB, name: 'Central', code: 'CTR', timezone: 'Asia/Jakarta' },
      ]).onConflictDoNothing();
      await tx.insert(schema.memberships).values([
        { id: seedIds.ownerA, tenantId: seedIds.tenantA, userId: seedIds.owner, roleId: roleId('merchant_owner'), allOutlets: true },
        { id: seedIds.ownerB, tenantId: seedIds.tenantB, userId: seedIds.owner, roleId: roleId('merchant_owner'), allOutlets: true },
        { id: seedIds.cashierA, tenantId: seedIds.tenantA, userId: seedIds.cashier, roleId: roleId('cashier') },
        { id: seedIds.kitchenA, tenantId: seedIds.tenantA, userId: seedIds.kitchen, roleId: roleId('kitchen_staff') },
      ]).onConflictDoNothing();
      await tx.insert(schema.membershipOutlets).values([seedIds.cashierA, seedIds.kitchenA].map(membershipId => ({ tenantId: seedIds.tenantA, membershipId, outletId: seedIds.outletA }))).onConflictDoNothing();
    });
  } finally { await pool.end(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  if (process.env.NODE_ENV === 'production' || process.env.SEED_ENABLED !== 'true') throw new Error('Seed is opt-in and refused in production');
  if (!process.env.DATABASE_ADMIN_URL || !process.env.SEED_PASSWORD) throw new Error('DATABASE_ADMIN_URL and explicit SEED_PASSWORD are required');
  await seedDatabase(process.env.DATABASE_ADMIN_URL, process.env.SEED_PASSWORD);
  console.info('Development seed applied; credentials were not logged');
}
