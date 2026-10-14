import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
}
export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try { return await verify(hashValue, password); } catch { return false; }
}
export function newSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function hashSessionToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function csrfTokenForSession(token: string): string { return createHash('sha256').update('csrf:').update(token).digest('hex'); }
export function verifyCsrf(token: string, supplied: string): boolean {
  const expected = Buffer.from(csrfTokenForSession(token));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
