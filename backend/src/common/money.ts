/**
 * Money handling for PayMe.
 *
 * INTEGRATION RULE #1: PayMe amounts are ALWAYS integers in the currency's
 * minor unit — agorot for ILS, cents for USD/EUR. There is no decimal form
 * anywhere in the API. `sale_price: 5075` means 50.75.
 *
 * This is the single most common source of a working-but-wrong integration:
 * sending `50.75` is accepted by the type system and charges the buyer 50
 * agorot. Keep money as integer minor units everywhere in your own code and
 * convert only at the display edge — that is what this file exists to enforce.
 *
 * PayMe also enforces a minimum of 500 minor units (5.00) on `sale_price` and
 * `sub_price`. Below that, generate-sale fails.
 *
 * Source: https://payme.stoplight.io/docs/payments/d7da26bb42da8-generate-payment?branch=V1.7#request-body
 */

/** PayMe's minimum chargeable amount, in minor units (5.00). */
export const PAYME_MIN_AMOUNT_MINOR = 500;

/** Currencies this demo offers. PayMe accepts any 3-letter ISO 4217 code the seller is enabled for. */
export const SUPPORTED_CURRENCIES = ['ILS', 'USD', 'EUR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Convert a human-entered decimal amount ("50.75") to PayMe minor units (5075).
 * Rounds to the nearest minor unit — never truncates, so 0.105 -> 11 not 10.
 */
export function toMinorUnits(amount: number | string): number {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert "${amount}" to minor units`);
  }
  return Math.round(value * 100);
}

/** Convert PayMe minor units (5075) back to a decimal number (50.75) for display. */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/** Format minor units for humans: 5075, 'ILS' -> "₪50.75". */
export function formatMinorUnits(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(fromMinorUnits(minor));
}
