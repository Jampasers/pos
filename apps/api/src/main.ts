import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { parseEnvironment } from '@pos/config';
import { createApplication } from './app.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const env = parseEnvironment(process.env);
const app = await createApplication(env, true);
await app.listen(env.PORT, env.HOST);
