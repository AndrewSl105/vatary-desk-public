/**
 * Micro-dollars (µ$): the unit of every AI cost on the wire and in the
 * database. A cost can arrive as a number, a decimal string or a bigint;
 * it is normalised here, once.
 */

const MICROS_PER_USD = 1_000_000;
const UNSIGNED_INTEGER = /^\d+$/;

export function microsFrom(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : 0n;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return BigInt(Math.round(value));
  }
  if (typeof value === 'string' && UNSIGNED_INTEGER.test(value)) {
    return BigInt(value);
  }
  return 0n;
}

/** Dollars for display. */
export function microsToUsd(micros: bigint): number {
  return Number(micros) / MICROS_PER_USD;
}

/** Dollars entered by an admin → micro-dollars; null stays null (unlimited). */
export function usdToMicros(usd: number | null): bigint | null {
  if (usd === null) {
    return null;
  }
  if (!Number.isFinite(usd) || usd < 0) {
    return 0n;
  }
  return BigInt(Math.round(usd * MICROS_PER_USD));
}
