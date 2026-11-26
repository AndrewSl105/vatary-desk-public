/**
 * The billing period of AI spend: a calendar month in UTC, for every plan,
 * so there is no jump when a plan changes mid-month.
 */

const FIRST_DAY_OF_MONTH = 1;

export function periodStartOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), FIRST_DAY_OF_MONTH));
}

/** When the period containing `at` ends: the next period's start. */
export function periodEndOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, FIRST_DAY_OF_MONTH));
}
