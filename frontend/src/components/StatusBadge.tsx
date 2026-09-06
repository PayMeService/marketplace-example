import { Stamp, type Tone } from './ui';
import type { SaleStatus } from '../lib/types';

/**
 * PayMe sale statuses, with the tone that matches what they mean for the money.
 * https://payme.stoplight.io/docs/guides/ort17682q5o8a-sale-statuses?branch=main
 *
 * The status is printed verbatim rather than translated into a friendlier
 * phrase. Everyone reading this app is looking at PayMe's own responses
 * alongside it, and a private vocabulary would be one more thing to map. The
 * plain-English meaning rides along as the title attribute.
 */
const SALE_TONES: Record<SaleStatus, Tone> = {
  initial: 'neutral',
  completed: 'success',
  // Money is reserved but not yours yet — capture within 168 hours or it lapses.
  authorized: 'info',
  failed: 'danger',
  refunded: 'warning',
  'partial-refund': 'warning',
  voided: 'neutral',
  chargeback: 'danger',
  canceled: 'neutral',
};

const SALE_MEANINGS: Record<SaleStatus, string> = {
  initial: 'Sale created, buyer has not paid yet',
  completed: 'Paid and settled',
  authorized: 'Funds held — capture within 168 hours or the hold lapses',
  failed: 'The charge was declined',
  refunded: 'Fully refunded',
  'partial-refund': 'Part of the amount has been refunded',
  voided: 'An authorization released before capture',
  chargeback: 'The buyer disputed the charge through their bank',
  canceled: 'Cancelled before payment',
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <span title={SALE_MEANINGS[status] ?? status}>
      <Stamp tone={SALE_TONES[status] ?? 'neutral'}>{status}</Stamp>
    </span>
  );
}

/** Subscription statuses. 76 is "failed, PayMe will retry automatically". */
const SUB_TONES: Record<number, Tone> = {
  1: 'neutral',
  2: 'success',
  3: 'warning',
  4: 'danger',
  5: 'neutral',
  6: 'info',
  76: 'warning',
};

export function SubscriptionStatusBadge({
  status,
  label,
}: {
  status: number;
  label: string;
}) {
  return <Stamp tone={SUB_TONES[status] ?? 'neutral'}>{label}</Stamp>;
}

/** Signature verdict on a stored callback. */
export function SignatureBadge({ status }: { status: string }) {
  const tone: Tone =
    status === 'valid'
      ? 'success'
      : status === 'invalid'
        ? 'danger'
        : status === 'unverifiable'
          ? 'warning'
          : 'neutral';
  return <Stamp tone={tone}>{status}</Stamp>;
}
