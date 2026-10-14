import { expect, it } from 'vitest';
import { csrfTokenForSession, hashPassword, hashSessionToken, newSessionToken, verifyCsrf, verifyPassword } from './index.js';

it('uses Argon2id and rejects incorrect or malformed password hashes', async () => {
  const hash = await hashPassword('test-password-unique');
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(hash, 'test-password-unique')).toBe(true);
  expect(await verifyPassword(hash, 'wrong')).toBe(false);
  expect(await verifyPassword('invalid', 'test-password-unique')).toBe(false);
});
it('generates unique high-entropy tokens and stores a different fixed-size digest', () => {
  const a = newSessionToken(), b = newSessionToken();
  expect(a).not.toBe(b); expect(a).toHaveLength(43); expect(hashSessionToken(a)).toHaveLength(64); expect(hashSessionToken(a)).not.toContain(a);
});
it('binds CSRF tokens to the current session', () => {
  const a = newSessionToken(), b = newSessionToken();
  expect(verifyCsrf(a, csrfTokenForSession(a))).toBe(true);
  expect(verifyCsrf(b, csrfTokenForSession(a))).toBe(false);
  expect(verifyCsrf(a, '')).toBe(false);
});
