/** Shapes returned by this app's API. Mirrors the backend view models. */

export type Role = 'user' | 'seller' | 'admin';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface SellerPlan {
  id: string;
  name: string;
  blurb: string;
  /** Marketplace commission percent, sent to PayMe as `market_fee`. */
  marketFee: number;
  paymeSellerPlan?: string;
  features: string[];
  recommended?: boolean;
}

export interface Balance {
  currency: string;
  /** Everything held for the seller, in minor units. */
  total: number;
  /** Past its release date, i.e. withdrawable now. */
  releasable: number;
  /** Still inside PayMe's clearing window. */
  pending: number;
}

export interface Seller {
  id: string;
  paymeId: string;
  /** Safe to expose — Hosted Fields needs it in the browser. */
  publicKey: string | null;
  signupLink: string | null;
  planId: string;
  marketFee: number;
  businessName: string;
  approved: boolean;
  active: boolean;
  createdAt: string;
  balances: Balance[];
  fees: Record<string, string> | null;
  currencies: string[];
  remoteError?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Minor units. */
  priceMinor: number;
  currency: string;
  active?: boolean;
  /** The owning user's id — the same value a Store is keyed by. */
  storeId?: string;
  seller?: string | null;
  createdAt: string;
}

/** A shop: a user who has opened a PayMe seller account, plus their listings. */
export interface Store {
  id: string;
  name: string;
  owner: string | null;
  approved: boolean;
  currencies: string[];
  productCount: number;
}

export type SaleFlow = 'iframe' | 'hosted-fields' | 'pay-sale';

export type SaleStatus =
  | 'initial'
  | 'completed'
  | 'authorized'
  | 'failed'
  | 'refunded'
  | 'partial-refund'
  | 'voided'
  | 'chargeback'
  | 'canceled';

export interface Sale {
  id: string;
  paymeSaleId: string | null;
  paymeSaleCode: number | null;
  paymeTransactionId: string | null;
  /** The hosted payment page. Present for iframe sales. */
  saleUrl: string | null;
  flow: SaleFlow;
  /** "sale" (J4) or "authorize" (J5). */
  saleType: string;
  status: SaleStatus;
  priceMinor: number;
  refundedMinor: number;
  currency: string;
  productName: string;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerCardMask: string | null;
  captureBuyerRequested: boolean;
  capturedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only on the hosted-fields creation response. */
  publicKey?: string | null;
}

export interface SavedToken {
  id: string;
  buyerKey: string;
  cardMask: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  paymeSubId: string | null;
  paymeSubCode: number | null;
  /** Hosted page for the buyer to activate. Null when created with a token. */
  subUrl: string | null;
  /** Price of ONE iteration, minor units. */
  priceMinor: number;
  currency: string;
  description: string;
  iterationType: number;
  iterationTypeLabel: string;
  iterations: number;
  iterationsCompleted: number;
  /** 1 initial, 2 active, 3 paused, 4 failed, 5 cancelled, 6 completed, 76 retrying. */
  status: number;
  statusLabel: string;
  startDate: string | null;
  nextDate: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerCardMask: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface CallbackEvent {
  id: string;
  kind: 'sale' | 'subscription' | 'seller';
  notifyType: string | null;
  entityId: string | null;
  paymeTransactionId: string | null;
  signatureStatus: 'valid' | 'invalid' | 'unsigned' | 'unverifiable';
  signatureReason: string;
  applied: boolean;
  skippedReason: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export interface PayMeSettings {
  environment: 'sandbox' | 'production';
  clientKey: string;
  marketplaceMpl: string;
  publicBaseUrl: string;
  /** The secret itself is never sent to the browser. */
  clientSecretConfigured: boolean;
  callbacksReachable: boolean;
  apiBaseUrl: string;
}

export interface AdminSeller {
  id: string;
  paymeId: string;
  businessName: string;
  planId: string;
  marketFee: number;
  publicKey: string | null;
  signupLink: string | null;
  createdAt: string;
  owner: { id: string; email: string; name: string } | null;
  approved: boolean;
  active: boolean;
  balances: Array<{ currency: string; total: number; releasable: number }>;
  fees: Record<string, string> | null;
  stale: boolean;
  remoteError?: string;
}
