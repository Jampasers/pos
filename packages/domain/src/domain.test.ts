import { describe, expect, it } from 'vitest';
import { assertOrderTransition, assertPaymentTransition, MAX_MONEY, money, priceLine, roundBasisPoints } from './index.js';

const line = { unitPrice: '25000', modifierPrices: ['5000'], quantity: 2, discount: '10000', serviceBasisPoints: 500, taxBasisPoints: 1000 };
describe('financial rules', () => {
  it('calculates modifiers, discounts, service and tax in the documented order', () => {
    expect(priceLine(line)).toEqual({ subtotal: '60000', discount: '10000', service: '2500', tax: '5250', total: '57750' });
  });
  it('preserves amounts above Number safe precision', () => {
    expect(priceLine({ ...line, unitPrice: '9007199254740993', modifierPrices: [], quantity: 1, discount: '0', serviceBasisPoints: 0, taxBasisPoints: 0 }).total).toBe('9007199254740993');
  });
  it('rejects numeric money at runtime rather than converting rounded numbers', () => {
    expect(() => money(9_007_199_254_740_992 as unknown as string)).toThrow();
  });
  it('rounds half-up at a minor unit boundary', () => { expect(roundBasisPoints(5n, 1000)).toBe(1n); expect(roundBasisPoints(4n, 1000)).toBe(0n); });
  it.each(['-1', '1.2', '01', '1e3', 'NaN', (MAX_MONEY + 1n).toString()])('rejects unsafe monetary input %s', value => { expect(() => money(value)).toThrow(); });
  it('rejects discount beyond subtotal', () => { expect(() => priceLine({ ...line, discount: '60001' })).toThrow('Discount exceeds'); });
  it('rejects fractional quantities and invalid tax rates', () => { expect(() => priceLine({ ...line, quantity: 1.5 })).toThrow(); expect(() => priceLine({ ...line, taxBasisPoints: 10001 })).toThrow(); });
  it('rejects overflow in intermediate amounts', () => { expect(() => priceLine({ ...line, unitPrice: MAX_MONEY.toString(), quantity: 2 })).toThrow(); });
});
describe('state transitions', () => {
  const context = { fullyPaid: true, approvedVoid: false, hasSettledPayment: true };
  it('permits submitting and completing a paid order', () => { expect(() => assertOrderTransition('draft', 'submitted', context)).not.toThrow(); expect(() => assertOrderTransition('submitted', 'completed', context)).not.toThrow(); });
  it('rejects finalizing unpaid orders and editing terminal states', () => { expect(() => assertOrderTransition('submitted', 'completed', { ...context, fullyPaid: false })).toThrow(); expect(() => assertOrderTransition('completed', 'draft', context)).toThrow(); });
  it('requires manager approval and no settled payments for submitted cancellation', () => { expect(() => assertOrderTransition('submitted', 'cancelled', context)).toThrow(); expect(() => assertOrderTransition('submitted', 'cancelled', { fullyPaid: false, approvedVoid: true, hasSettledPayment: false })).not.toThrow(); });
  it('cannot regress succeeded payments to failed', () => { expect(() => assertPaymentTransition('succeeded', 'failed')).toThrow(); expect(() => assertPaymentTransition('succeeded', 'partially_refunded')).not.toThrow(); expect(() => assertPaymentTransition('refunded', 'succeeded')).toThrow(); });
});
