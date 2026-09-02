import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Verification of PayMe's `payme_signature`.
 *
 * WHY THIS MATTERS: your callback endpoint is a public, unauthenticated URL
 * that PayMe POSTs "this sale was paid" to. Without verification anyone who
 * learns the URL can POST the same shape and mark orders paid. The signature is
 * the only thing standing between your fulfilment logic and free merchandise.
 *
 * The signature is an md5 of four values concatenated with no separator:
 *
 *   SALE:         md5(client_key + client_secret + payme_transaction_id + payme_sale_id)
 *   SUBSCRIPTION: md5(client_key + client_secret + transaction_id       + sub_payme_id)
 *
 * where
 *   client_key    = your PayMe partner key (the same value you send as
 *                   `payme_client_key`; PayMe stores it as merchant_key)
 *   client_secret = your partner secret (merchant_password). NEVER transmitted
 *                   to PayMe on any request — it exists only to compute this hash.
 *
 * Two subtleties that cost people hours:
 *
 *  1. The subscription variant uses the callback's `transaction_id` field,
 *     which for subscriptions carries PayMe's TRANSACTION guid. On sale
 *     callbacks the identically-named `transaction_id` is YOUR order id and is
 *     NOT part of the hash — the sale hash uses `payme_transaction_id`. Same
 *     field name, different meaning, different flow. Mixing them up produces a
 *     mismatch that looks like a wrong secret.
 *
 *  2. `payme_signature` is null when a callback has no completed transaction
 *     attached (e.g. a `sub-create` notification for a subscription nobody has
 *     paid yet, or a failed sale). A null signature is not a forgery; it is a
 *     payload with nothing to sign. Treat it as UNSIGNED and do not let it move
 *     money or fulfil an order on its own.
 *
 * md5 is PayMe's choice, not ours. It is used here only to compare against a
 * value PayMe generated with the same algorithm; we still compare in constant
 * time so the endpoint does not leak the expected digest byte by byte.
 */

export type SignatureStatus =
  /** Signature present and correct. */
  | 'valid'
  /** Signature present and wrong — reject the payload. */
  | 'invalid'
  /** Payload carries no signature (nothing to sign, or PayMe sent null). */
  | 'unsigned'
  /** No client secret configured, so verification could not be attempted. */
  | 'unverifiable';

export interface SignatureCheck {
  status: SignatureStatus;
  /** True only for 'valid'. Convenience for guard clauses. */
  ok: boolean;
  /** Human-readable reason, for the callback log in the UI. */
  reason: string;
}

/** md5 of the four concatenated values, lowercase hex — PayMe's own format. */
export function computePayMeSignature(
  clientKey: string,
  clientSecret: string,
  paymeTransactionId: string,
  entityId: string,
): string {
  return createHash('md5')
    .update(`${clientKey}${clientSecret}${paymeTransactionId}${entityId}`)
    .digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

interface VerifyArgs {
  clientKey: string;
  /** Empty string / undefined => 'unverifiable'. */
  clientSecret?: string | null;
  /** The signature as received on the callback. */
  received?: string | null;
  /** PayMe's transaction guid (sale: payme_transaction_id, subscription: transaction_id). */
  paymeTransactionId?: string | null;
  /** The sale id (payme_sale_id) or subscription id (sub_payme_id). */
  entityId?: string | null;
}

function verify({
  clientKey,
  clientSecret,
  received,
  paymeTransactionId,
  entityId,
}: VerifyArgs): SignatureCheck {
  if (!received) {
    return {
      status: 'unsigned',
      ok: false,
      reason:
        'Callback carried no payme_signature. PayMe sends null when the notification has no completed transaction behind it (e.g. sub-create, or a failed sale). Do not treat this payload as proof of payment.',
    };
  }

  if (!clientSecret) {
    return {
      status: 'unverifiable',
      ok: false,
      reason:
        'No PayMe client secret configured, so the signature could not be checked. Set it on the Settings page (or PAYME_CLIENT_SECRET) — a production deployment must never accept an unverified callback.',
    };
  }

  if (!paymeTransactionId || !entityId) {
    return {
      status: 'invalid',
      ok: false,
      reason: `Signature present but the payload is missing the ids it is computed from (transaction=${paymeTransactionId ?? 'null'}, entity=${entityId ?? 'null'}).`,
    };
  }

  const expected = computePayMeSignature(
    clientKey,
    clientSecret,
    paymeTransactionId,
    entityId,
  );

  return digestsMatch(expected, received)
    ? { status: 'valid', ok: true, reason: 'Signature verified.' }
    : {
        status: 'invalid',
        ok: false,
        reason:
          'Signature mismatch. Either the payload was not sent by PayMe, or the configured client key/secret pair does not match the partner account that owns this sale.',
      };
}

/**
 * Verify a sale callback (sale-complete, sale-authorized, refund, ...).
 * Hash input: client_key + client_secret + payme_transaction_id + payme_sale_id.
 */
export function verifySaleSignature(
  body: Record<string, unknown>,
  clientKey: string,
  clientSecret?: string | null,
): SignatureCheck {
  return verify({
    clientKey,
    clientSecret,
    received: asString(body.payme_signature),
    paymeTransactionId: asString(body.payme_transaction_id),
    entityId: asString(body.payme_sale_id),
  });
}

/**
 * Verify a subscription callback (sub-active, sub-iteration-success, ...).
 * Hash input: client_key + client_secret + transaction_id + sub_payme_id.
 *
 * Careful: `transaction_id` here is PayMe's transaction guid, unlike on sale
 * callbacks where the same key holds YOUR order id.
 */
export function verifySubscriptionSignature(
  body: Record<string, unknown>,
  clientKey: string,
  clientSecret?: string | null,
): SignatureCheck {
  return verify({
    clientKey,
    clientSecret,
    received: asString(body.payme_signature),
    paymeTransactionId:
      asString(body.transaction_id) ?? asString(body.payme_transaction_id),
    entityId: asString(body.sub_payme_id),
  });
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return null;
}
