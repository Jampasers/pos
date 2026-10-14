import { expect, it } from 'vitest';
import { parseEnvironment } from './index.js';

it('refuses wildcard or insecure production origins', () => {
  const source = { DATABASE_URL: 'postgres://user:pass@localhost/pos', ALLOWED_ORIGINS: '*' };
  expect(() => parseEnvironment(source)).toThrow();
  expect(() => parseEnvironment({ ...source, NODE_ENV: 'production', ALLOWED_ORIGINS: 'http://example.com' })).toThrow();
});
it('uses bounded session TTL and an explicit origin allowlist', () => {
  const env = parseEnvironment({ DATABASE_URL: 'postgres://user:pass@localhost/pos', ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:3000' });
  expect(env.SESSION_TTL_SECONDS).toBe(28800); expect(env.ALLOWED_ORIGINS).toHaveLength(2);
  expect(parseEnvironment({ DATABASE_URL: 'postgres://user:pass@localhost/pos', ALLOWED_ORIGINS: 'http://localhost:5173', API_PORT: '4001', PORT: '3000' }).API_PORT).toBe(4001);
});
