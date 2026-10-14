import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { deviceInputSchema, loginSchema, outletInputSchema, paginationSchema, syncCommandSchema } from './index.js';

it('does not accept client-supplied tenant authority in outlet bodies', () => {
  expect(outletInputSchema.safeParse({ code: 'BKS', name: 'Bekasi', timezone: 'Asia/Jakarta', tenantId: randomUUID() }).success).toBe(false);
});
it('validates timezone and bounded pagination', () => {
  expect(outletInputSchema.safeParse({ code: 'BKS', name: 'Bekasi', timezone: 'invalid-zone' }).success).toBe(false);
  expect(paginationSchema.parse({ limit: '10' }).limit).toBe(10);
  expect(paginationSchema.safeParse({ limit: 1000 }).success).toBe(false);
  expect(paginationSchema.safeParse({ after: 'not-an-id' }).success).toBe(false);
});
it('normalizes email and rejects unknown login/device properties', () => {
  expect(loginSchema.parse({ email: 'OWNER@example.test', password: 'password' }).email).toBe('owner@example.test');
  expect(deviceInputSchema.safeParse({ id: randomUUID(), name: 'Counter', platform: 'unknown' }).success).toBe(false);
});
it('validates command-specific payloads rather than accepting arbitrary JSON', () => {
  const command = { protocolVersion: 1, operationId: randomUUID(), deviceId: randomUUID(), outletId: randomUUID(), sequence: '1', occurredAt: new Date().toISOString(), type: 'SHIFT_OPENED', payload: { shiftId: randomUUID(), registerId: randomUUID(), openingCash: '100000' } };
  expect(syncCommandSchema.safeParse(command).success).toBe(true);
  expect(syncCommandSchema.safeParse({ ...command, payload: { ...command.payload, openingCash: 0.1 } }).success).toBe(false);
  expect(syncCommandSchema.safeParse({ ...command, tenantId: randomUUID() }).success).toBe(false);
  const submission = { ...command, type: 'ORDER_SUBMITTED', payload: { orderId: randomUUID() } };
  expect(syncCommandSchema.safeParse(submission).success).toBe(false);
  expect(syncCommandSchema.safeParse({ ...submission, expectedVersion: 1 }).success).toBe(true);
});
