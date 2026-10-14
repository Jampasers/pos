export const MAX_MONEY = 9_223_372_036_854_775_807n;

export function money(value: string): bigint {
  if (typeof value !== 'string' || value.length > 19 || !/^(0|[1-9]\d*)$/.test(value)) throw new RangeError('Money must be a nonnegative decimal integer within database range');
  const amount = BigInt(value);
  if (amount > MAX_MONEY) throw new RangeError('Money exceeds database range');
  return amount;
}

function bounded(value: bigint): bigint {
  if (value < 0n || value > MAX_MONEY) throw new RangeError('Amount exceeds database range');
  return value;
}

function rate(value: number): bigint {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new RangeError('Invalid basis-point rate');
  return BigInt(value);
}

export function roundBasisPoints(amount: bigint, basisPoints: number): bigint {
  bounded(amount);
  return bounded((amount * rate(basisPoints) + 5_000n) / 10_000n);
}

export interface LinePriceInput {
  unitPrice: string;
  modifierPrices: readonly string[];
  quantity: number;
  discount: string;
  serviceBasisPoints: number;
  taxBasisPoints: number;
}

export function priceLine(input: LinePriceInput) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000) {
    throw new RangeError('Invalid quantity');
  }
  const unit = bounded(input.modifierPrices.reduce((sum, item) => bounded(sum + money(item)), money(input.unitPrice)));
  const subtotal = bounded(unit * BigInt(input.quantity));
  const discount = money(input.discount);
  if (discount > subtotal) throw new RangeError('Discount exceeds subtotal');
  const net = subtotal - discount;
  const service = roundBasisPoints(net, input.serviceBasisPoints);
  const tax = roundBasisPoints(bounded(net + service), input.taxBasisPoints);
  return { subtotal: subtotal.toString(), discount: discount.toString(), service: service.toString(), tax: tax.toString(), total: bounded(net + service + tax).toString() };
}

export type OrderState = 'draft' | 'held' | 'submitted' | 'completed' | 'cancelled';
export type PaymentState = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'partially_refunded' | 'refunded';

const orderTransitions: Record<OrderState, readonly OrderState[]> = {
  draft: ['held', 'submitted', 'cancelled'], held: ['draft', 'cancelled'],
  submitted: ['completed', 'cancelled'], completed: [], cancelled: [],
};
const paymentTransitions: Record<PaymentState, readonly PaymentState[]> = {
  pending: ['succeeded', 'failed', 'cancelled'], succeeded: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'], refunded: [], failed: [], cancelled: [],
};

export function assertOrderTransition(from: OrderState, to: OrderState, context: { fullyPaid: boolean; approvedVoid: boolean; hasSettledPayment: boolean }): void {
  if (!orderTransitions[from].includes(to)) throw new Error('Invalid order transition');
  if (to === 'completed' && !context.fullyPaid) throw new Error('Order is not fully paid');
  if (from === 'submitted' && to === 'cancelled' && (!context.approvedVoid || context.hasSettledPayment)) {
    throw new Error('Submitted order void requires approval and unsettled payments');
  }
}

export function assertPaymentTransition(from: PaymentState, to: PaymentState): void {
  if (!paymentTransitions[from].includes(to)) throw new Error('Invalid payment transition');
}

export const roleNames = ['merchant_owner', 'outlet_manager', 'cashier', 'waiter', 'kitchen_staff'] as const;
export const permissionNames = ['outlet:read', 'outlet:manage', 'device:manage', 'audit:read', 'order:write', 'shift:write', 'kitchen:write'] as const;
export type Permission = typeof permissionNames[number];
export const rolePermissions: Record<typeof roleNames[number], readonly Permission[]> = {
  merchant_owner: permissionNames,
  outlet_manager: ['outlet:read', 'device:manage', 'audit:read', 'order:write', 'shift:write', 'kitchen:write'],
  cashier: ['outlet:read', 'order:write', 'shift:write'],
  waiter: ['outlet:read', 'order:write'],
  kitchen_staff: ['outlet:read', 'kitchen:write'],
};
