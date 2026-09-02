/**
 * Money helpers, mirroring backend/src/common/money.ts.
 *
 * PayMe amounts are integers in the currency's minor unit — agorot for ILS,
 * cents for USD/EUR. 5075 means 50.75. The UI is the only place a decimal is
 * allowed to exist, and even here it exists only to be shown to a human.
 */

export const PAYME_MIN_AMOUNT_MINOR = 500;

export const CURRENCIES = ['ILS', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** "50.75" -> 5075. Rounds, so 0.105 becomes 11 rather than 10. */
export function toMinorUnits(amount: string | number): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** 5075 -> 50.75 */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/** 5075, "ILS" -> "₪50.75" */
export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(fromMinorUnits(minor));
  } catch {
    return `${fromMinorUnits(minor).toFixed(2)} ${currency}`;
  }
}
