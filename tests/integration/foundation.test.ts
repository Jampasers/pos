import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '../../apps/api/dist/app.js';
import { parseEnvironment } from '../../packages/config/dist/index.js';
import { hashPassword, hashSessionToken } from '../../packages/auth/dist/index.js';
import { assertSafeRuntimeRole, connectDatabase, schema, withTenant } from '../../packages/db/dist/index.js';
import { runMigrations } from '../../packages/db/dist/migrate.js';
import { seedDatabase } from '../../packages/db/dist/seed.js';
import { dataSchema, deviceSchema, errorSchema, listSchema, membershipSchema, outletSchema, sessionSchema } from '../../packages/contracts/dist/index.js';

config({ path: '.env', quiet: true });
if (process.env.INTEGRATION_TEST_ENABLED !== 'true') throw new Error('Set INTEGRATION_TEST_ENABLED=true for an isolated test database');
if (!process.env.DATABASE_ADMIN_URL || !process.env.DATABASE_URL) throw new Error('Admin and nonowner runtime PostgreSQL URLs are required');
const adminUrl = process.env.DATABASE_ADMIN_URL;
const runtimeUrl = process.env.DATABASE_URL;
const admin = connectDatabase(adminUrl);
const runtime = connectDatabase(runtimeUrl);
const ids = Object.fromEntries(['userA', 'userB', 'cashier', 'multiUser', 'a', 'b', 'a1', 'a2', 'b1', 'ownerMembership', 'cashierMembership', 'multiA', 'multiB'].map(key => [key, randomUUID()])) as Record<'userA'|'userB'|'cashier'|'multiUser'|'a'|'b'|'a1'|'a2'|'b1'|'ownerMembership'|'cashierMembership'|'multiA'|'multiB', string>;
const password = 'Integration-' + randomUUID();
const emailA = `owner-${ids.userA}@example.test`, emailB = `owner-${ids.userB}@example.test`, emailCashier = `cashier-${ids.cashier}@example.test`, emailMulti = `multi-${ids.multiUser}@example.test`;
let app: Awaited<ReturnType<typeof createApplication>>;
let owner: { cookie: string; csrf: string }, cashier: { cookie: string; csrf: string };

async function login(email: string) {
  const response = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: 'http://localhost:5173' }, payload: { email, password } });
  expect(response.statusCode).toBe(201);
  const session = dataSchema(sessionSchema).parse(response.json()).data;
  const cookieHeader = response.headers['set-cookie'];
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (!rawCookie) throw new Error('Login did not set a cookie');
  return { cookie: rawCookie.split(';')[0] ?? '', csrf: session.csrfToken };
}
function headers(auth: { cookie: string; csrf: string }, tenant = ids.a) { return { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'x-tenant-id': tenant, origin: 'http://localhost:5173' }; }

beforeAll(async () => {
  await runMigrations(adminUrl);
  await runMigrations(adminUrl); // Applying a migration twice must be harmless.
  await seedDatabase(adminUrl, password);
  const passwordHash = await hashPassword(password);
  const roles = await admin.pool.query<{ id: string; name: string }>('select id,name from roles');
  const ownerRole = roles.rows.find(role => role.name === 'merchant_owner')?.id;
  const cashierRole = roles.rows.find(role => role.name === 'cashier')?.id;
  if (!ownerRole || !cashierRole) throw new Error('System role seed is missing');
  await admin.db.transaction(async tx => {
    await tx.insert(schema.users).values([{ id: ids.userA, email: emailA, name: 'A', passwordHash }, { id: ids.userB, email: emailB, name: 'B', passwordHash }, { id: ids.cashier, email: emailCashier, name: 'Cashier', passwordHash }, { id: ids.multiUser, email: emailMulti, name: 'Multi', passwordHash }]);
    await tx.insert(schema.tenants).values([{ id: ids.a, name: 'Fixture A', slug: `fixture-${ids.a}` }, { id: ids.b, name: 'Fixture B', slug: `fixture-${ids.b}` }]);
    await tx.insert(schema.outlets).values([{ id: ids.a1, tenantId: ids.a, code: 'A1', name: 'A1', timezone: 'Asia/Jakarta' }, { id: ids.a2, tenantId: ids.a, code: 'A2', name: 'A2', timezone: 'Asia/Jakarta' }, { id: ids.b1, tenantId: ids.b, code: 'B1', name: 'B1', timezone: 'Asia/Jakarta' }]);
    await tx.insert(schema.memberships).values([
      { id: ids.ownerMembership, tenantId: ids.a, userId: ids.userA, roleId: ownerRole, allOutlets: true },
      { tenantId: ids.b, userId: ids.userB, roleId: ownerRole, allOutlets: true },
      { id: ids.cashierMembership, tenantId: ids.a, userId: ids.cashier, roleId: cashierRole },
      { id: ids.multiA, tenantId: ids.a, userId: ids.multiUser, roleId: ownerRole, allOutlets: true },
      { id: ids.multiB, tenantId: ids.b, userId: ids.multiUser, roleId: cashierRole },
    ]);
    await tx.insert(schema.membershipOutlets).values([{ tenantId: ids.a, membershipId: ids.cashierMembership, outletId: ids.a1 }, { tenantId: ids.b, membershipId: ids.multiB, outletId: ids.b1 }]);
  });
  await assertSafeRuntimeRole(runtime.db);
  app = await createApplication(parseEnvironment({ ...process.env, DATABASE_URL: runtimeUrl, ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:3000', NODE_ENV: 'test' }));
  owner = await login(emailA); cashier = await login(emailCashier);
});

afterAll(async () => {
  if (app) await app.close();
  // Only fixture IDs are removed; no seeded or unrelated merchant records are deleted.
  const tenants = [ids.a, ids.b], users = [ids.userA, ids.userB, ids.cashier, ids.multiUser];
  for (const table of ['audit_logs', 'devices', 'membership_outlets', 'memberships', 'outlets', 'subscriptions', 'tenants']) {
    const column = table === 'tenants' ? 'id' : 'tenant_id';
    await admin.pool.query(`delete from ${table} where ${column}=any($1::uuid[])`, [tenants]);
  }
  await admin.pool.query('delete from auth_events where user_id=any($1::uuid[])', [users]);
  await admin.pool.query('delete from sessions where user_id=any($1::uuid[])', [users]);
  await admin.pool.query('delete from users where id=any($1::uuid[])', [users]);
  await runtime.pool.end(); await admin.pool.end();
});

describe('real PostgreSQL foundation', () => {
  it('rejects a privileged runtime role', async () => { await expect(assertSafeRuntimeRole(admin.db)).rejects.toThrow('nonowner'); });
  it('serves health and denies anonymous tenant resources', async () => {
    expect((await app.inject('/v1/health/ready')).statusCode).toBe(200);
    expect((await app.inject('/v1/outlets')).statusCode).toBe(401);
  });
  it('rejects login CSRF and generic wrong/unknown credentials', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: emailA, password } })).statusCode).toBe(403);
    for (const email of [emailA, 'absent@example.test']) {
      const result = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: 'http://localhost:5173' }, payload: { email, password: 'wrong' } });
      expect(result.statusCode).toBe(401); expect(errorSchema.parse(result.json()).error.code).toBe('INVALID_CREDENTIALS');
    }
  });
  it('discovers only authenticated memberships and supports multiple merchants', async () => {
    const result = await app.inject({ url: '/v1/tenants', headers: { cookie: owner.cookie } });
    expect(dataSchema(membershipSchema.array()).parse(result.json()).data.map(item => item.tenantId)).toEqual([ids.a]);
    const multi = await login(emailMulti);
    const both = await app.inject({ url: '/v1/tenants', headers: { cookie: multi.cookie } });
    expect(dataSchema(membershipSchema.array()).parse(both.json()).data.map(item => item.tenantId).sort()).toEqual([ids.a, ids.b].sort());
  });
  it('denies a tampered tenant header and another tenant resource ID', async () => {
    expect((await app.inject({ url: '/v1/outlets', headers: headers(owner, ids.b) })).statusCode).toBe(403);
    expect((await app.inject({ url: `/v1/outlets/${ids.b1}`, headers: headers(owner) })).statusCode).toBe(404);
  });
  it('enforces outlet-scoped visibility and role privileges', async () => {
    const result = await app.inject({ url: '/v1/outlets', headers: headers(cashier) });
    expect(listSchema(outletSchema).parse(result.json()).data.map(item => item.id)).toEqual([ids.a1]);
    expect((await app.inject({ url: `/v1/outlets/${ids.a2}`, headers: headers(cashier) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/v1/outlets', headers: headers(cashier), payload: { code: 'DENY', name: 'Denied', timezone: 'Asia/Jakarta' } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/v1/outlets/${ids.a1}/devices`, headers: headers(cashier) })).statusCode).toBe(403);
  });
  it('requires CSRF for authenticated mutations and refuses unknown tenant body fields', async () => {
    const input = { code: 'SAFE', name: 'Safe', timezone: 'Asia/Jakarta' };
    expect((await app.inject({ method: 'POST', url: '/v1/outlets', headers: { cookie: owner.cookie, origin: 'http://localhost:5173', 'x-tenant-id': ids.a }, payload: input })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/outlets', headers: headers(owner), payload: { ...input, tenantId: ids.b } })).statusCode).toBe(400);
  });
  it('creates an outlet and its audit atomically and returns unique conflicts', async () => {
    const input = { code: 'NEW', name: 'New Outlet', timezone: 'Asia/Jakarta' };
    const result = await app.inject({ method: 'POST', url: '/v1/outlets', headers: headers(owner), payload: input });
    expect(result.statusCode).toBe(201);
    const outlet = dataSchema(outletSchema).parse(result.json()).data;
    const audit = await admin.pool.query('select * from audit_logs where tenant_id=$1 and resource_id=$2', [ids.a, outlet.id]);
    expect(audit.rows).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: '/v1/outlets', headers: headers(owner), payload: input })).statusCode).toBe(409);
  });
  it('supports bounded pagination with no repeated outlet IDs', async () => {
    const first = await app.inject({ url: '/v1/outlets?limit=1', headers: headers(owner) });
    const page = listSchema(outletSchema).parse(first.json());
    expect(page.page.nextCursor).not.toBeNull();
    const second = await app.inject({ url: `/v1/outlets?limit=1&after=${page.page.nextCursor}`, headers: headers(owner) });
    expect(listSchema(outletSchema).parse(second.json()).data[0]?.id).not.toBe(page.data[0]?.id);
    expect((await app.inject({ url: '/v1/outlets?limit=9999', headers: headers(owner) })).statusCode).toBe(400);
  });
  it('deduplicates concurrent device registrations and their audit entries', async () => {
    const input = { id: randomUUID(), name: 'Retry Device', platform: 'web' };
    const request = { method: 'POST' as const, url: `/v1/outlets/${ids.a1}/devices`, headers: headers(owner), payload: input };
    const responses = await Promise.all([app.inject(request), app.inject(request)]);
    responses.forEach(result => { expect(result.statusCode).toBe(201); expect(dataSchema(deviceSchema).parse(result.json()).data.id).toBe(input.id); });
    expect((await admin.pool.query('select * from audit_logs where resource_id=$1', [input.id])).rows).toHaveLength(1);
    expect((await app.inject({ ...request, payload: { ...input, name: 'Changed' } })).statusCode).toBe(409);
    const revoked = await app.inject({ method: 'POST', url: `${request.url}/${input.id}/revoke`, headers: headers(owner) });
    expect(dataSchema(deviceSchema).parse(revoked.json()).data.revokedAt).not.toBeNull();
    expect((await app.inject(request)).statusCode).toBe(409);
  });
  it('enforces raw RLS and scoped foreign keys even below the API', async () => {
    expect((await runtime.pool.query('select * from outlets')).rows).toHaveLength(0);
    await expect(withTenant(runtime.db, ids.userA, ids.a, tx => tx.insert(schema.devices).values({ tenantId: ids.a, outletId: ids.b1, name: 'Cross Tenant', platform: 'web', registeredBy: ids.userA }))).rejects.toThrow();
    await expect(runtime.pool.query('delete from audit_logs')).rejects.toThrow('permission denied');
    expect((await runtime.pool.query('select * from outlets')).rows).toHaveLength(0);
  });
  it('blocks suspended merchants and inactive memberships', async () => {
    await admin.pool.query("update tenants set status='suspended' where id=$1", [ids.a]);
    expect((await app.inject({ url: '/v1/outlets', headers: headers(owner) })).statusCode).toBe(403);
    await admin.pool.query("update tenants set status='active' where id=$1", [ids.a]);
    await admin.pool.query('update memberships set active=false where id=$1', [ids.ownerMembership]);
    expect((await app.inject({ url: '/v1/outlets', headers: headers(owner) })).statusCode).toBe(403);
    await admin.pool.query('update memberships set active=true where id=$1', [ids.ownerMembership]);
  });
  it('revokes sessions on logout and checks session expiry/disabled users', async () => {
    const separate = await login(emailB);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: headers(separate, ids.b) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/v1/auth/session', headers: { cookie: separate.cookie } })).statusCode).toBe(401);
    const expires = await login(emailB);
    const token = expires.cookie.split('=')[1];
    if (!token) throw new Error('Missing token');
    await admin.pool.query("update sessions set expires_at=created_at + interval '1 millisecond' where token_hash=$1", [hashSessionToken(token)]);
    expect((await app.inject({ url: '/v1/auth/session', headers: { cookie: expires.cookie } })).statusCode).toBe(401);
    const disabled = await login(emailB);
    await admin.pool.query('update users set active=false where id=$1', [ids.userB]);
    expect((await app.inject({ url: '/v1/auth/session', headers: { cookie: disabled.cookie } })).statusCode).toBe(401);
    await admin.pool.query('update users set active=true where id=$1', [ids.userB]);
  });
});
