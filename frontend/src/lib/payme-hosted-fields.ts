/**
 * PayMe Hosted Fields (JSAPI) — the browser half of the tokenization flow.
 *
 * WHAT IT IS: PayMe serves the card-number, expiry and CVV inputs as iframes
 * that you mount into your own checkout. They inherit your styling, so the form
 * looks like yours, but the values live in PayMe's origin. When you call
 * `tokenize()` the data goes browser -> PayMe's vault and comes back as a
 * token. It never touches your server, which is what keeps your backend out of
 * PCI DSS scope while still letting you own the checkout UI.
 *
 * THE THREE-STEP DANCE:
 *   1. server: generate-sale                -> reserves the sale
 *   2. browser: PayMe.create(publicKey)
 *               .hostedFields() -> mount    -> buyer types their card
 *               .tokenize(saleData)         -> returns { token, card, ... }
 *   3. server: pay-sale with buyer_key=token -> charges it
 *
 * WHAT GOES IN `PayMe.create`: the SELLER's public key (a uuid from
 * create-seller, or GET /sellers/{mpl}/public-keys). Never the partner key —
 * that is a server-side credential and putting it in a bundle hands anyone the
 * ability to create sellers on your account.
 *
 * Library reference: https://github.com/PayMeService/payme-jsapi
 * Guide: https://payme.stoplight.io/docs/guides/gsok0tstibqmz-hosted-fields-jsapi-guide?branch=main
 */

const SCRIPT_URL = 'https://cdn.payme.io/hf/v1/hostedfields.js';

/** The field types PayMe can host. Each may be created at most once per instance. */
export const FIELDS = {
  NUMBER: 'cardNumber',
  EXPIRATION: 'cardExpiration',
  CVV: 'cvc',
  NAME_FIRST: 'payerFirstName',
  NAME_LAST: 'payerLastName',
  EMAIL: 'payerEmail',
  PHONE: 'payerPhone',
  SOCIAL_ID: 'payerSocialId',
  ZIP: 'payerZipCode',
} as const;

export interface FieldEvent {
  type: string;
  event: string;
  field: string;
  isValid: boolean;
  message?: string;
  /** Only on 'card-type-changed': visa | mastercard | amex | diners | jcb | discover | unknown. */
  cardType?: string;
}

export interface HostedField {
  mount(selector: string): Promise<void>;
  on(event: string, handler: (event: FieldEvent) => void): void;
}

export interface HostedFieldsManager {
  create(field: string, options?: Record<string, unknown>): HostedField;
}

/** What `tokenize()` resolves with. `token` is the buyer_key to charge. */
export interface TokenizationResult {
  type: 'tokenize-success';
  /** Pass this to the server as `buyerKey`. */
  token: string;
  testMode: boolean;
  card: { cardMask: string; cardholderName: string; expiry: string };
  payerEmail?: string;
  payerName?: string;
  payerPhone?: string;
  payerSocialId?: string;
  total: { label: string; amount: { currency: string; value: string } };
}

export interface TokenizationError {
  type: 'tokenize-error';
  /** Set when the form itself is invalid; `errors` then names the fields. */
  validationError?: boolean;
  errors?: Record<string, string>;
  /** Set when the session is spent — see the one-shot note below. */
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface PayMeInstance {
  hostedFields(): HostedFieldsManager;
  tokenize(saleData: TokenizeInput): Promise<TokenizationResult>;
}

/**
 * The payload for `tokenize()`.
 *
 * RULE OF THUMB: any payer detail whose field you did NOT create and mount, you
 * must supply here. Card number, expiry and CVV are the exception — those
 * fields must always be mounted and can never be passed as values.
 *
 * `total.amount.value` is a DECIMAL STRING here ("50.75"), unlike everywhere
 * else in PayMe where amounts are integer minor units. It is used for display
 * inside PayMe's iframe; the amount actually charged is the one on the sale you
 * created server-side, so the two must agree or the buyer sees one price and
 * pays another.
 */
export interface TokenizeInput {
  payerFirstName?: string;
  payerLastName?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerSocialId?: string;
  payerZipCode?: string;
  total: {
    label: string;
    amount: { currency: string; value: string };
  };
}

interface PayMeGlobal {
  create(
    publicKey: string,
    options?: {
      /** true => sandbox. Must match the environment the sale was created in. */
      testMode?: boolean;
      /** 'en' | 'he'. Also flips the fields to RTL. */
      language?: string;
      /** false issues a single-use token; true (default) a reusable one. */
      tokenIsPermanent?: boolean;
    },
  ): Promise<PayMeInstance>;
  fields: Record<string, string>;
  validators: Record<string, { test(value: string): null | Record<string, boolean> }>;
}

declare global {
  interface Window {
    PayMe?: PayMeGlobal;
  }
}

let loader: Promise<PayMeGlobal> | null = null;

/** Load hostedfields.js once and cache the promise across mounts. */
export function loadPayMeSdk(): Promise<PayMeGlobal> {
  if (window.PayMe) return Promise.resolve(window.PayMe);
  if (loader) return loader;

  loader = new Promise<PayMeGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => {
      if (window.PayMe) resolve(window.PayMe);
      else reject(new Error('hostedfields.js loaded but window.PayMe is undefined'));
    });
    script.addEventListener('error', () =>
      reject(
        new Error(
          `Could not load ${SCRIPT_URL}. Check the network tab — an ad blocker or a Content-Security-Policy without cdn.payme.io in script-src will block it.`,
        ),
      ),
    );

    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    // Let a later attempt retry rather than caching the failure forever.
    loader = null;
    throw error;
  });

  return loader;
}

/**
 * Create a tokenization session.
 *
 * ONE SESSION, ONE TOKENIZATION. A PayMe instance can be tokenized exactly
 * once; calling `tokenize()` again on the same instance fails with
 * "Bad session — Session expired or deleted". After a failed charge you must
 * tear the fields down and create a fresh instance, which is why the checkout
 * page remounts rather than retrying in place.
 */
export async function createPayMeInstance(
  publicKey: string,
  options: { testMode: boolean; language?: string; tokenIsPermanent?: boolean },
): Promise<PayMeInstance> {
  const sdk = await loadPayMeSdk();
  return sdk.create(publicKey, {
    // Must match the environment the sale was created in: a sandbox token
    // cannot be charged against a live sale, and vice versa.
    testMode: options.testMode,
    language: options.language ?? 'en',
    tokenIsPermanent: options.tokenIsPermanent ?? true,
  });
}

/**
 * Styling handed to each hosted field.
 *
 * SHAPE MATTERS, AND FAILURE IS SILENT. PayMe accepts exactly three state
 * groups — `base`, `invalid` and `valid` — with `::placeholder` nested inside
 * `base`. Anything else is dropped without an error or a console warning, so a
 * styles object keyed the way a CSS-in-JS library would key it (`input`, a
 * top-level `::placeholder`, `:focus`, `.invalid`) leaves the fields rendering
 * in PayMe's defaults and looks like the option was ignored rather than
 * malformed.
 * https://payme.stoplight.io/docs/guides/gsok0tstibqmz-hosted-fields-jsapi-guide?branch=main#field-styling
 *
 * ONLY SEVEN PROPERTIES ARE WHITELISTED: color, font-size, text-align,
 * letter-spacing, text-decoration, text-shadow and text-transform. `font-family`
 * is not among them, which is why the card digits keep PayMe's own face while
 * every other field on the page is set in ours — that difference is PayMe's
 * rule, not an oversight.
 *
 * Colours are read from the live custom properties rather than hard-coded,
 * because the fields are cross-origin: nothing inside them inherits the page's
 * theme, and a fixed dark ink leaves a dark-theme buyer typing invisible
 * digits. They resolve at mount time, which is the only moment PayMe accepts
 * them — a theme switched after mounting does not reach the iframes until the
 * checkout is started again.
 */
export function fieldStyles(): Record<string, unknown> {
  const token = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const ink = token('--ink', '#16261c');

  return {
    base: {
      color: ink,
      'font-size': '13px',
      '::placeholder': { color: token('--ink-faint', '#5f7a68') },
    },
    invalid: { color: token('--stamp', '#a62b2b') },
    valid: { color: ink },
  };
}
