/**
 * Typed shapes for the PayMe API surface this marketplace uses.
 *
 * Field names are PayMe's, verbatim and in snake_case, on purpose: when you
 * compare this file against https://payme.stoplight.io the names line up
 * one-for-one. Renaming them to camelCase inside the transport layer is how
 * typos like `sellerPaymeId` silently become an omitted required field.
 * The mapping to friendlier names happens in the service layer, not here.
 */

/** Every PayMe response carries this envelope. `status_code: 0` means success. */
export interface PayMeEnvelope {
  status_code: number;
  status_error_code?: number;
  status_error_details?: string;
  status_additional_info?: unknown;
  /** Request correlation id — quote it to PayMe support. Sandbox only. */
  session?: string;
  payme_status?: string;
}

// ---------------------------------------------------------------------------
// Sellers (merchants-management)
// ---------------------------------------------------------------------------

/** POST /create-seller — https://payme.stoplight.io/docs/payments/4239571881646-create-seller?branch=V1.7 */
export interface CreateSellerRequest {
  payme_client_key: string;
  seller_first_name: string;
  seller_last_name: string;
  seller_social_id: string;
  /** dd/mm/yyyy — NOT ISO. PayMe rejects 1990-01-01. */
  seller_birthdate: string;
  /** dd/mm/yyyy — issuing date of the social ID document. */
  seller_social_id_issued: string;
  /** 0 = male, 1 = female. */
  seller_gender: number;
  seller_email: string;
  seller_phone: string;
  seller_contact_email?: string;
  seller_contact_phone?: string;
  /** Israeli bank code — see guides/lists-statuses/list-of-banks. 54 works in sandbox. */
  seller_bank_code: number;
  seller_bank_branch: number;
  seller_bank_account_number: string;
  /** Max 255 chars. */
  seller_description: string;
  seller_site_url: string;
  /** PayMe MCC, e.g. 10114. See guides/lists-statuses/israeli-mcc-list. */
  seller_person_business_type: number;
  /** Incorporation type: 1 Individual, 2 Sole Proprietorship, 3 Ltd, 5 Exempt, 6 Non-profit... */
  seller_inc: number;
  /** Business ID (ח.פ / ע.מ). Required when seller_inc !== 1. */
  seller_inc_code?: string;
  /** 1 = card-not-present (online), 2 = card-present. */
  seller_retail_type?: number;
  /** Required when seller_inc !== 1. */
  seller_merchant_name?: string;
  seller_merchant_name_en?: string;
  seller_address_city: string;
  seller_address_street: string;
  seller_address_street_number: string;
  /** ISO 3166 alpha-2, e.g. "IL". */
  seller_address_country: string;
  /** 0.00–60.00 — the marketplace's cut, in percent, VAT included. */
  market_fee?: number;
  /** "en" or "he". Controls the language of PayMe's error messages. */
  language?: string;
  /** A named settings preset. The valid values are issued by your PayMe account manager. */
  seller_plan?: string;
  /** Your own id for this seller. Not accepted on every partner plan — see docs/02. */
  seller_id?: string;
}

export interface CreateSellerResponse extends PayMeEnvelope {
  /** The seller's MPL. This is the id you store and send on every later call. */
  seller_payme_id: string;
  /** The seller's own secret. Store encrypted; it is shown exactly once. */
  seller_payme_secret: string;
  seller_public_key?: {
    /** The public key the browser needs for Hosted Fields / JSAPI tokenization. */
    uuid: string;
    description: string;
    is_active: boolean;
  };
  seller_id: string | null;
  /** Link that walks the seller through completing their onboarding details. */
  seller_dashboard_signup_link?: string;
}

/** GET /sellers/{seller_payme_id}/public-keys — auth via the `PayMe-Partner-Key` header. */
export interface SellerPublicKeysResponse extends PayMeEnvelope {
  seller_payme_id: string;
  items_total: number;
  items: Array<{ uuid: string; description: string }>;
}

/** One seller as returned by POST /get-sellers. Trimmed to what this demo reads. */
export interface PayMeSellerSummary {
  seller_payme_id: string;
  seller_id: string | null;
  seller_created: string;
  seller_active: boolean;
  seller_approved: boolean;
  seller_approved_date: string | null;
  seller_personal_details?: Record<string, unknown>;
  seller_business_details?: Record<string, unknown>;
  seller_address?: Record<string, unknown>;
  seller_fees?: Record<string, string>;
  seller_currencies?: string[];
  /**
   * The seller's balance, keyed by currency. `wallet_total` is everything held;
   * `wallet_releasable` is the part already past its release date and therefore
   * withdrawable. Both are in minor units.
   */
  seller_wallets?: Record<
    string,
    { wallet_currency: string; wallet_total: number; wallet_releasable: number }
  >;
}

export interface GetSellersResponse extends PayMeEnvelope {
  items_count: number;
  items: PayMeSellerSummary[];
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/** POST /generate-sale — https://payme.stoplight.io/docs/payments/d7da26bb42da8-generate-payment?branch=V1.7 */
export interface GenerateSaleRequest {
  /** The SELLER's MPL — not the marketplace's. The money lands in this seller's wallet. */
  seller_payme_id: string;
  /** Minor units (agorot/cents). Minimum 500. */
  sale_price: number;
  currency: string;
  /** Shown to the buyer and on the invoice. Max 500 chars. */
  product_name: string;
  /** Your own order id, for correlation. Never part of a signature. */
  transaction_id?: string;
  /**
   * "1".."12" fixes the count; "103"/"106"/"109"/"112" lets the buyer pick up
   * to 3/6/9/12. Note it is a STRING.
   */
  installments?: string;
  /** Override the seller's default marketplace cut for this one sale. */
  market_fee?: number;
  /** "sale" (J4, default) | "authorize" (J5 — reserve now, capture later) | "template". */
  sale_type?: string;
  /** "credit-card" (default), "bit", "paypal", "google-pay", "apple-pay", "multi", ... */
  sale_payment_method?: string;
  /** "1" also captures a reusable buyer token on this payment. Mutually exclusive with buyer_key. */
  capture_buyer?: string;
  /** Charge a previously captured token. Mutually exclusive with capture_buyer. */
  buyer_key?: string;
  /** Where PayMe POSTs the server-to-server notification. Must not be localhost. */
  sale_callback_url?: string;
  /** Where the buyer's browser is redirected after paying. */
  sale_return_url?: string;
  sale_send_notification?: boolean;
  sale_email?: string;
  sale_mobile?: string;
  sale_name?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  /** "he" (default) or "en" — sets the language of the payment page itself. */
  language?: string;
  /** Layout for the bit payment method: "dynamic" | "qr-sms" | "dynamic-loose". */
  layout?: string;
}

export interface GenerateSaleResponse extends PayMeEnvelope {
  /** The hosted payment page. Put it in an iframe, or redirect the buyer to it. */
  sale_url: string;
  /** PayMe's sale id (SALE...-...-...-...). Store it; every later action needs it. */
  payme_sale_id: string;
  /** Short numeric code, for display and support only. */
  payme_sale_code: number;
  price: number;
  transaction_id: string | null;
  currency: string;
  sale_payment_method?: string;
}

/**
 * POST /pay-sale — charges a sale created by generate-sale.
 *
 * Two very different callers use this endpoint:
 *  - PCI-compliant merchants sending raw PAN (credit_card_number/exp/cvv).
 *  - Everyone else sending `buyer_key`: a token from Hosted Fields or from an
 *    earlier capture_buyer sale. No card data touches your server.
 * This marketplace only ever does the second. See docs/03-payment-flows.md.
 */
export interface PaySaleRequest {
  seller_payme_id: string;
  payme_sale_id: string;
  sale_price: string;
  currency: string;
  installments: string;
  buyer_key?: string;
  credit_card_number?: string;
  credit_card_exp?: string;
  credit_card_cvv?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  sale_return_url?: string;
  sale_callback_url?: string;
  capture_buyer?: number;
  language?: string;
}

/** The "sale details" payload — returned by pay-sale/capture-sale and POSTed as a callback. */
export interface PayMeSaleDetails extends PayMeEnvelope {
  payme_sale_id: string;
  payme_sale_code: number;
  sale_created: string;
  sale_status: string;
  payme_sale_status?: string;
  currency: string;
  /** On a callback, PayMe's transaction guid; on an API response, the id you sent. */
  transaction_id: string | null;
  is_token_sale: boolean;
  price: number;
  /** md5 signature — always verify before trusting this payload. See payme-signature.ts. */
  payme_signature: string | null;
  sale_description?: string;
  sale_type?: string;
  /** PayMe's transaction id. Half of the signature input. */
  payme_transaction_id?: string;
  payme_transaction_total?: string;
  payme_transaction_card_brand?: string;
  payme_transaction_auth_number?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  buyer_card_mask?: string;
  buyer_card_exp?: string;
  buyer_social_id?: string;
  /** Reusable token — present only when capture_buyer was requested. */
  buyer_key?: string;
  installments?: number;
  sale_paid_date?: string;
  sale_release_date?: string | null;
  sale_invoice_url?: string;
  /** The callback's event type: sale-complete, sale-authorized, refund, ... */
  notify_type?: string;
}

/** POST /capture-sale — settle an authorization (J5). */
export interface CaptureSaleRequest {
  payme_client_key: string;
  seller_payme_id: string;
  payme_sale_id: string;
  /**
   * Undocumented on this endpoint, but honoured: without it PayMe returns
   * `status_error_details` in Hebrew, which is a poor thing to surface to an
   * English-speaking operator or to put in a log.
   */
  language?: string;
}

/** POST /refund-sale — full refund, or partial when sale_refund_amount is set. */
export interface RefundSaleRequest {
  payme_client_key: string;
  seller_payme_id: string;
  payme_sale_id: string;
  /** Minor units. Omit for a full refund. */
  sale_refund_amount?: number;
  language?: string;
}

export interface RefundSaleResponse extends PayMeEnvelope {
  sale_status: string;
  payme_transaction_id?: string;
  payme_transaction_total?: number;
  sale_invoice_url?: string | null;
  refunded_from_creditcard?: boolean;
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * POST /sellers/{mpl}/tokens — the partner-scoped tokenization endpoint.
 *
 * Takes the payment instrument for a given payment method and returns a buyer
 * token bound to the marketplace, so the token can be charged later on behalf
 * of any of your sellers. `{mpl}` is YOUR marketplace MPL, not a seller's.
 */
export interface SellerTokenRequest {
  payment: {
    /** "credit-card", "bit", "il-direct-debit", ... */
    method: string;
    [key: string]: unknown;
  };
  /** Optional: bind the resulting token to an already-generated sale. */
  sale_orig?: string;
  [key: string]: unknown;
}

export interface SellerTokenResponse {
  /** The buyer token, usable as `buyer_key`. */
  uuid?: string;
  redirect_url?: string;
  [key: string]: unknown;
}

/** POST /get-buyer-key — recover the token captured during a paid sale. */
export interface GetBuyerKeyRequest {
  payme_sale_id: string;
  seller_payme_id: string;
}

export interface GetBuyerKeyResponse extends PayMeEnvelope {
  payme_sale_id: string;
  buyer_key: string;
  buyer_card_mask: string;
  buyer_card_expiry: string;
  buyer_card_brand: string;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** POST /generate-subscription */
export interface GenerateSubscriptionRequest {
  seller_payme_id: string;
  /** Price of ONE iteration, in minor units. Minimum 500. */
  sub_price: number;
  sub_currency: string;
  sub_description: string;
  /** "1" daily | "2" weekly | "3" monthly | "4" annually. */
  sub_iteration_type: string;
  /** How many iterations to run. -1 means "until cancelled". */
  sub_iterations: number;
  /** dd/mm/yyyy. */
  sub_start_date?: string;
  sub_callback_url?: string;
  sub_return_url?: string;
  /** Activate immediately against an existing token instead of showing a page. */
  buyer_key?: string;
  language?: string;
}

export interface GenerateSubscriptionResponse extends PayMeEnvelope {
  /** Hosted page where the buyer enters payment details to activate the subscription. */
  sub_url?: string;
  seller_payme_id: string;
  /** PayMe's subscription id (SUB...). Store it; every later action needs it. */
  sub_payme_id: string;
  sub_payme_code: string | number;
  sub_created: string;
  sub_start_date: string | null;
  sub_next_date: string | null;
  /** 1 initial | 2 active | 3 paused | 4 failed | 5 cancelled | 6 completed | 76 retrying. */
  sub_status: number | string;
  sub_iteration_type: number | string;
  sub_currency: string;
  sub_price: number | string;
  sub_description: string;
  sub_iterations: number | string;
  sub_iterations_completed?: number;
  sub_iterations_left?: number | string;
  sub_paid?: boolean;
  sub_error_text?: string | null;
}

/** The subscription payload as POSTed to your callback URL. */
export interface PayMeSubscriptionDetails extends PayMeEnvelope {
  seller_payme_id: string;
  sub_payme_id: string;
  sub_payme_code: number;
  sub_created: string;
  sub_start_date: string | null;
  sub_prev_date: string | null;
  sub_next_date: string | null;
  sub_status: number;
  sub_iteration_type: number;
  sub_currency: string;
  sub_price: number;
  sub_description: string;
  sub_iterations: number;
  sub_iterations_completed: number;
  sub_iterations_skipped?: number;
  sub_iterations_left: number;
  sub_paid: boolean;
  sub_error_text?: string | null;
  buyer_card_mask?: string;
  buyer_card_exp?: string;
  buyer_name?: string;
  buyer_email?: string;
  /** Half of the subscription signature input — see payme-signature.ts. */
  transaction_id?: string;
  payme_signature?: string;
  /** sub-create | sub-active | sub-iteration-success | sub-failure | ... */
  notify_type?: string;
}

/** The seller payload as POSTed to your callback URL. Note: NO payme_signature. */
export interface PayMeSellerCallback extends PayMeEnvelope {
  seller_payme_id: string;
  seller_id: string | null;
  seller_created: string;
  seller_active: boolean;
  seller_approved: boolean;
  seller_email?: string;
  seller_merchant_name?: string;
  seller_market_fee?: string | number;
  /** seller-create | seller-update | seller-approve. */
  notify_type?: string;
  [key: string]: unknown;
}
