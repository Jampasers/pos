import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (process.env.CI !== 'true') throw new Error('This script is only for a disposable CI runner');
if (existsSync('.env')) throw new Error('Refusing to overwrite an existing environment file');
const secret = () => randomBytes(24).toString('hex');
const admin = secret(), app = secret(), seed = secret();
const source = readFileSync('.env.example', 'utf8')
  .replaceAll('local-admin-change-me', admin).replaceAll('local-app-change-me', app)
  .replaceAll('local-redis-change-me', secret()).replaceAll('local-storage-change-me', secret())
  .replace('SEED_PASSWORD=', `SEED_PASSWORD=${seed}`).replace('SEED_ENABLED=false', 'SEED_ENABLED=true');
writeFileSync('.env', `${source}\nINTEGRATION_TEST_ENABLED=true\n`, { mode: 0o600 });
// Ephemeral credentials are never emitted to logs or workflow outputs.
