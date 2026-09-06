import type { Product } from '../../lib/types';

/* Data and helpers for the studio storefront variants. Kept out of the
   component files so React Fast Refresh can track those by component alone. */

/** Four ways into the integration, each named by the call it starts from. */
export const ENTRY_POINTS = [
  {
    to: '/sell',
    title: 'Onboard a seller',
    body: 'One call opens a PayMe account and returns an MPL, a one-time secret and a public key. Approval and balances are read back from get-sellers.',
    call: 'create-seller',
  },
  {
    to: '/checkout',
    title: 'Three checkouts',
    body: 'PayMe’s hosted page in an iframe, Hosted Fields on your own domain, or a server-to-server charge against a saved token.',
    call: 'generate-sale',
  },
  {
    to: '/sales',
    title: 'Authorize, then capture',
    body: 'Reserve the funds now and settle when you ship. The hold lasts 168 hours and capture happens once, fully or partially.',
    call: 'capture-sale',
  },
  {
    to: '/admin/callbacks',
    title: 'Signed callbacks',
    body: 'Every notification is checked against an md5 of key, secret, transaction and entity before it is allowed to change anything.',
    call: 'payme_signature',
  },
];

/** Distinct sellers in listing order, for the hero cluster. */
export function sellerNames(products: Product[] | null, limit = 3): string[] {
  return [...new Set((products ?? []).map((p) => p.seller).filter(Boolean))].slice(
    0,
    limit,
  ) as string[];
}
