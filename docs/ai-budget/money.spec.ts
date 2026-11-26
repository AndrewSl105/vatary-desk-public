import { microsFrom, microsToUsd, usdToMicros } from './money';
import { periodEndOf, periodStartOf } from './period';

describe('micro-dollars', () => {
  it('reads every wire form of a cost', () => {
    expect(microsFrom(1234)).toBe(1234n);
    expect(microsFrom('9007199254740993')).toBe(9007199254740993n);
    expect(microsFrom(7n)).toBe(7n);

    for (const invalid of [undefined, null, -5, NaN, 'x', '-3', {}]) {
      expect(microsFrom(invalid)).toBe(0n);
    }
  });

  it('converts dollars for display and admin input', () => {
    expect(usdToMicros(3)).toBe(3_000_000n);
    expect(usdToMicros(1.23)).toBe(1_230_000n);
    expect(usdToMicros(null)).toBeNull();
    expect(microsToUsd(1_500_000n)).toBe(1.5);
  });
});

describe('billing period', () => {
  it('is the calendar month in UTC', () => {
    const lastMoment = new Date('2026-09-30T23:59:59.999Z');
    expect(periodStartOf(lastMoment).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(periodEndOf(lastMoment).toISOString()).toBe('2026-10-01T00:00:00.000Z');

    const december = new Date('2026-12-15T10:00:00Z');
    expect(periodStartOf(december).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(periodEndOf(december).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
