/**
 * Onboarding plans offered to sellers at signup.
 *
 * Two different things are bundled here, and it matters which is which:
 *
 *  - `marketFee` is a real PayMe parameter. It is the marketplace's commission,
 *    a percentage of every sale (VAT included), charged on top of PayMe's own
 *    fees and paid out to the marketplace monthly. It is set per seller at
 *    creation (`market_fee` on create-seller), and can be overridden per sale
 *    (`market_fee` on generate-sale). Valid range 0.00–60.00.
 *
 *  - `paymeSellerPlan` maps to PayMe's `seller_plan`: a named bundle of account
 *    settings (limits, enabled services, withdrawal cadence) that PayMe
 *    configures for your partner account. THE VALID VALUES ARE ISSUED BY YOUR
 *    PAYME ACCOUNT MANAGER — there is no public list, and sending an unknown
 *    one fails the request. Left undefined here, so the demo works on any
 *    partner account; fill it in once you have your own plan names.
 *
 * Everything else on a plan (`badge`, `blurb`, `features`) is this
 * marketplace's own product packaging, not PayMe's.
 */
export interface SellerPlan {
  id: string;
  name: string;
  blurb: string;
  /** Marketplace commission percent, sent as `market_fee`. */
  marketFee: number;
  /** PayMe `seller_plan`, when your account manager has issued one. */
  paymeSellerPlan?: string;
  features: string[];
  recommended?: boolean;
}

export const SELLER_PLANS: SellerPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'For a first shop. No monthly fee, we take a slightly larger cut.',
    marketFee: 4.5,
    features: [
      'Hosted payment page (iframe)',
      'Credit card and bit',
      'Payouts on PayMe’s standard schedule',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    blurb: 'For an established shop that wants its own checkout.',
    marketFee: 2.5,
    recommended: true,
    features: [
      'Everything in Starter',
      'Hosted Fields — checkout on your own domain',
      'Saved cards (buyer tokens)',
      'Authorize now, capture on shipment',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    blurb: 'For high volume. Lowest commission, full API surface.',
    marketFee: 1.0,
    features: [
      'Everything in Growth',
      'Subscriptions and recurring billing',
      'Direct API (pay-sale) with tokens',
      'Priority support',
    ],
  },
];

export function findSellerPlan(id: string): SellerPlan | undefined {
  return SELLER_PLANS.find((plan) => plan.id === id);
}
