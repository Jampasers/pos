import { z } from 'zod';

export const idSchema = z.uuid();
export const loginSchema = z.strictObject({ email: z.email().max(254).transform(value => value.trim().toLowerCase()), password: z.string().min(1).max(256) });
export const outletInputSchema = z.strictObject({
  code: z.string().trim().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  timezone: z.string().max(64).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
});
export const deviceInputSchema = z.strictObject({ id: idSchema, name: z.string().trim().min(1).max(120), platform: z.enum(['web', 'android', 'ios', 'windows', 'macos']) });
export const paginationSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50), after: idSchema.optional() });
export const outletSchema = z.object({ id: idSchema, tenantId: idSchema, code: z.string(), name: z.string(), timezone: z.string(), active: z.boolean(), version: z.number().int() });
export const deviceSchema = z.object({ id: idSchema, tenantId: idSchema, outletId: idSchema, name: z.string(), platform: deviceInputSchema.shape.platform, revokedAt: z.iso.datetime().nullable(), version: z.number().int() });
export const membershipSchema = z.object({ tenantId: idSchema, tenantName: z.string(), tenantSlug: z.string(), role: z.string(), allOutlets: z.boolean(), outletIds: z.array(idSchema), permissions: z.array(z.string()) });
export const userSchema = z.object({ id: idSchema, email: z.email(), name: z.string() });
export const sessionSchema = z.object({ user: userSchema, csrfToken: z.string(), memberships: z.array(membershipSchema), expiresAt: z.iso.datetime() });
export const auditSchema = z.object({ id: idSchema, outletId: idSchema.nullable(), action: z.string(), actorId: idSchema, resourceId: idSchema, createdAt: z.iso.datetime(), details: z.record(z.string(), z.unknown()) });
export const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }) });
export const healthSchema = z.object({ status: z.literal('ok') });
export const pageSchema = z.object({ nextCursor: idSchema.nullable() });
export function dataSchema<T extends z.ZodType>(schema: T) { return z.object({ data: schema }); }
export function listSchema<T extends z.ZodType>(schema: T) { return z.object({ data: z.array(schema), page: pageSchema }); }

const moneySchema = z.string().max(19).regex(/^(0|[1-9]\d*)$/).refine(value => BigInt(value) <= 9_223_372_036_854_775_807n);
const quantitySchema = z.number().int().min(1).max(1_000_000);
const payloads = {
  ORDER_CREATED: z.strictObject({ orderId: idSchema, type: z.enum(['dine_in', 'takeaway']), tableId: idSchema.nullable(), shiftId: idSchema }),
  ORDER_ITEM_ADDED: z.strictObject({ orderId: idSchema, itemId: idSchema, productId: idSchema, variantId: idSchema.nullable(), quantity: quantitySchema, modifierOptionIds: z.array(idSchema).max(100), note: z.string().max(500) }),
  ORDER_ITEM_REMOVED: z.strictObject({ orderId: idSchema, itemId: idSchema }),
  ORDER_SUBMITTED: z.strictObject({ orderId: idSchema }),
  SALE_FINALIZED: z.strictObject({ orderId: idSchema, saleId: idSchema, paymentId: idSchema, shiftId: idSchema, appliedCash: moneySchema, cashReceived: moneySchema, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  CASH_PAYMENT_RECORDED: z.strictObject({ orderId: idSchema, paymentId: idSchema, shiftId: idSchema, appliedCash: moneySchema, cashReceived: moneySchema }),
  SHIFT_OPENED: z.strictObject({ shiftId: idSchema, registerId: idSchema, openingCash: moneySchema }),
  SHIFT_CLOSED: z.strictObject({ shiftId: idSchema, actualCash: moneySchema, lastDeviceSequence: z.string().regex(/^[1-9]\d*$/) }),
};
const envelope = {
  protocolVersion: z.literal(1), operationId: idSchema, deviceId: idSchema, outletId: idSchema,
  sequence: z.string().max(19).regex(/^[1-9]\d*$/), occurredAt: z.iso.datetime(), expectedVersion: z.number().int().min(1).optional(),
};
const expectedVersion = z.number().int().min(1);
export const syncCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('ORDER_CREATED'), payload: payloads.ORDER_CREATED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('ORDER_ITEM_ADDED'), payload: payloads.ORDER_ITEM_ADDED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('ORDER_ITEM_REMOVED'), payload: payloads.ORDER_ITEM_REMOVED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('ORDER_SUBMITTED'), payload: payloads.ORDER_SUBMITTED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('SALE_FINALIZED'), payload: payloads.SALE_FINALIZED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('CASH_PAYMENT_RECORDED'), payload: payloads.CASH_PAYMENT_RECORDED }),
  z.strictObject({ ...envelope, type: z.literal('SHIFT_OPENED'), payload: payloads.SHIFT_OPENED }),
  z.strictObject({ ...envelope, expectedVersion, type: z.literal('SHIFT_CLOSED'), payload: payloads.SHIFT_CLOSED }),
]);
export type SyncCommand = z.infer<typeof syncCommandSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Outlet = z.infer<typeof outletSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type OutletInput = z.infer<typeof outletInputSchema>;
export type DeviceInput = z.infer<typeof deviceInputSchema>;
