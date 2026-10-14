import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';

export async function runMigrations(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(742017001)');
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  } finally {
    await client.query('select pg_advisory_unlock(742017001)');
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required');
  await runMigrations(process.env.DATABASE_ADMIN_URL);
  console.info('Migrations applied');
}
