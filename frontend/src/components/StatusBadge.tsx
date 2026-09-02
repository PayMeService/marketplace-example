import { Badge } from './ui';
import type { SaleStatus } from '../lib/types';

/**
 * PayMe sale statuses, with the tone that matches what they mean for the money.
 * https://payme.stoplight.io/docs/guides/ort17682q5o8a-sale-statuses?branch=main
 */
const SALE_TONES: Record<SaleStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
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

const SALE_LABELS: Record<SaleStatus, string> = {
  initial: 'Awaiting payment',
  completed: 'Paid',
  authorized: 'Authorized',
  failed: 'Failed',
  refunded: 'Refunded',
  'partial-refund': 'Partly refunded',
  voided: 'Voided',
  chargeback: 'Chargeback',
  canceled: 'Cancelled',
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return <Badge tone={SALE_TONES[status] ?? 'neutral'}>{SALE_LABELS[status] ?? status}</Badge>;
}

/** Subscription statuses. 76 is "failed, PayMe will retry automatically". */
const SUB_TONES: Record<number, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
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
  return <Badge tone={SUB_TONES[status] ?? 'neutral'}>{label}</Badge>;
}

/** Signature verdict on a stored callback. */
export function SignatureBadge({ status }: { status: string }) {
  const tone =
    status === 'valid'
      ? 'success'
      : status === 'invalid'
        ? 'danger'
        : status === 'unverifiable'
          ? 'warning'
          : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
