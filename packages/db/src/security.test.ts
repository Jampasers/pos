import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const user = randomUUID(), a = randomUUID(), b = randomUUID(), outletA = randomUUID(), outletB = randomUUID();
beforeAll(async () => {
  await db.waitReady;
  await db.exec('create role pos_app login nosuperuser nobypassrls');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query("insert into users(id,email,name,password_hash) values($1,'test@example.test','Test','not-a-login-hash')", [user]);
  await db.query("insert into tenants(id,name,slug) values($1,'A','a'),($2,'B','b')", [a,b]);
  const role = randomUUID();
  await db.query("insert into roles(id,name) values($1,'merchant_owner')", [role]);
  await db.query('insert into memberships(tenant_id,user_id,role_id,all_outlets) values($1,$2,$3,true)', [a,user,role]);
  await db.query("insert into outlets(id,tenant_id,code,name,timezone) values($1,$2,'A','A','Asia/Jakarta'),($3,$4,'B','B','Asia/Jakarta')", [outletA,a,outletB,b]);
  await db.exec('set role pos_app');
}, 30000);
afterAll(async () => { await db.close(); });

it('is using the actual nonowner runtime role', async () => { expect((await db.query<{ current_user: string }>('select current_user')).rows[0]?.current_user).toBe('pos_app'); });
it('returns no tenant rows and denies writes without a tenant context', async () => {
  expect((await db.query('select * from outlets')).rows).toHaveLength(0);
  await expect(db.query("insert into outlets(tenant_id,code,name,timezone) values($1,'X','X','Asia/Jakarta')", [a])).rejects.toThrow();
});
it('supports identity discovery and membership row locking without granting updates', async () => {
  await db.transaction(async tx => {
    await tx.query("select set_config('app.user_id',$1,true)", [user]);
    expect((await tx.query('select * from memberships for share')).rows).toHaveLength(1);
  });
  await expect(db.transaction(async tx => {
    await tx.query("select set_config('app.user_id',$1,true)", [user]);
    await tx.query('update memberships set active=false returning id');
  })).rejects.toThrow(/row-level security/);
});
it('filters other tenants and rolls back transaction-local context', async () => {
  await db.transaction(async tx => {
    await tx.query("select set_config('app.tenant_id',$1,true)", [a]);
    expect((await tx.query<{ id: string }>('select id from outlets')).rows.map(row => row.id)).toEqual([outletA]);
    expect((await tx.query('select * from outlets where id=$1', [outletB])).rows).toHaveLength(0);
  });
  expect((await db.query('select * from outlets')).rows).toHaveLength(0);
});
it('rejects cross-tenant foreign keys at the database boundary', async () => {
  await expect(db.transaction(async tx => {
    await tx.query("select set_config('app.tenant_id',$1,true)", [a]);
    await tx.query("insert into devices(tenant_id,outlet_id,name,platform,registered_by) values($1,$2,'Cross','web',$3)", [a,outletB,user]);
  })).rejects.toThrow(/foreign key/);
});
it('keeps audit append-only and rolls back a write when its audit fails', async () => {
  await expect(db.transaction(async tx => {
    await tx.query("select set_config('app.tenant_id',$1,true)", [a]);
    await tx.query("insert into outlets(tenant_id,code,name,timezone) values($1,'ROLLBACK','Rollback','Asia/Jakarta')", [a]);
    await tx.query("insert into audit_logs(tenant_id,actor_id,action,resource_id,details) values($1,$2,'TEST',$3,'{}')", [a,user,outletA]);
  })).rejects.toThrow();
  await db.transaction(async tx => {
    await tx.query("select set_config('app.tenant_id',$1,true)", [a]);
    expect((await tx.query("select * from outlets where code='ROLLBACK'")).rows).toHaveLength(0);
  });
  await expect(db.query('delete from audit_logs')).rejects.toThrow(/permission denied/);
});
