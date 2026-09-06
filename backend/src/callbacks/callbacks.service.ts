import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SignatureCheck,
  verifySaleSignature,
  verifySubscriptionSignature,
} from '../payme/payme-signature';
import {
  PayMeSaleDetails,
  PayMeSubscriptionDetails,
} from '../payme/payme.types';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { SalesService } from '../sales/sales.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { SellersService } from '../sellers/sellers.service';
import { CallbackEvent, CallbackKind } from './callback-event.entity';

export interface CallbackResult {
  received: true;
  signature: SignatureCheck['status'];
  applied: boolean;
  reason: string;
}

/**
 * Handling PayMe's server-to-server notifications.
 *
 * THE RULE: verify the signature, then act. Never the other way round.
 *
 * The callback endpoint is public and unauthenticated — it has to be, PayMe's
 * servers cannot hold your session. `payme_signature` is the whole of the
 * authentication, and a handler that fulfils an order before checking it is a
 * handler anyone on the internet can trigger. See payme/payme-signature.ts for
 * how the hash is built.
 *
 * PayMe POSTs `application/x-www-form-urlencoded`, so every value arrives as a
 * STRING — "0", "false" and "1" included. Comparing `body.status_code === 0`
 * is always false. Coerce before you compare.
 */
@Injectable()
export class CallbacksService {
  private readonly logger = new Logger(CallbacksService.name);

  constructor(
    @InjectRepository(CallbackEvent)
    private readonly events: Repository<CallbackEvent>,
    private readonly settings: PayMeSettingsService,
    private readonly sales: SalesService,
    private readonly subscriptions: SubscriptionsService,
    private readonly sellers: SellersService,
  ) {}

  /**
   * Sale lifecycle: sale-complete, sale-authorized, refund, sale-failure,
   * sale-chargeback, sale-chargeback-refund.
   *
   * Signature input: client_key + client_secret + payme_transaction_id + payme_sale_id
   */
  async handleSaleCallback(
    body: Record<string, unknown>,
  ): Promise<CallbackResult> {
    const { clientKey, clientSecret } = await this.settings.get();
    const signature = verifySaleSignature(body, clientKey, clientSecret);

    const event = this.events.create({
      kind: CallbackKind.Sale,
      notifyType: str(body.notify_type),
      entityId: str(body.payme_sale_id),
      paymeTransactionId: str(body.payme_transaction_id),
      signatureStatus: signature.status,
      signatureReason: signature.reason,
      payload: body,
      applied: false,
    });

    if (!signature.ok) {
      return this.reject(event, signature);
    }

    // Signature verified — safe to act on.
    const details = coerceSaleDetails(body);
    const sale = await this.sales.applyCallback(details);

    event.applied = Boolean(sale);
    event.skippedReason = sale
      ? null
      : 'No local sale matches this payme_sale_id.';
    await this.events.save(event);

    this.logger.log(
      `Sale callback ${event.notifyType ?? 'unknown'} for ${event.entityId} — ` +
        `signature valid, ${sale ? `applied to sale ${sale.id} (${sale.status})` : 'no matching local sale'}`,
    );

    return {
      received: true,
      signature: signature.status,
      applied: event.applied,
      reason: event.skippedReason ?? signature.reason,
    };
  }

  /**
   * Subscription lifecycle: sub-create, sub-active, sub-iteration-success,
   * sub-iteration-skipped, sub-failure, sub-pause, sub-cancel, sub-complete.
   *
   * Signature input: client_key + client_secret + transaction_id + sub_payme_id
   *
   * `transaction_id` here is PayMe's transaction guid — the same value a sale
   * callback delivers under the key `payme_transaction_id`.
   *
   * `sub-create` legitimately arrives unsigned: nothing has been charged yet,
   * so there is no transaction to sign. It is recorded and, because it carries
   * no payment claim, applied — but it can never mark anything as paid.
   */
  async handleSubscriptionCallback(
    body: Record<string, unknown>,
  ): Promise<CallbackResult> {
    const { clientKey, clientSecret } = await this.settings.get();
    const signature = verifySubscriptionSignature(
      body,
      clientKey,
      clientSecret,
    );
    const notifyType = str(body.notify_type);

    const event = this.events.create({
      kind: CallbackKind.Subscription,
      notifyType,
      entityId: str(body.sub_payme_id),
      paymeTransactionId: str(body.transaction_id),
      signatureStatus: signature.status,
      signatureReason: signature.reason,
      payload: body,
      applied: false,
    });

    // A lifecycle notification with no transaction behind it makes no claim
    // about money, so an absent signature is expected rather than suspicious.
    const isUnsignedLifecycle =
      signature.status === 'unsigned' &&
      (notifyType === 'sub-create' ||
        notifyType === 'sub-cancel' ||
        notifyType === 'sub-pause');

    if (!signature.ok && !isUnsignedLifecycle) {
      return this.reject(event, signature);
    }

    const details = coerceSubscriptionDetails(body);
    const subscription = await this.subscriptions.applyCallback(details);

    event.applied = Boolean(subscription);
    event.skippedReason = subscription
      ? null
      : 'No local subscription matches this sub_payme_id.';
    await this.events.save(event);

    this.logger.log(
      `Subscription callback ${notifyType ?? 'unknown'} for ${event.entityId} — ` +
        `signature ${signature.status}, ${subscription ? `applied (status ${subscription.status})` : 'no matching local subscription'}`,
    );

    return {
      received: true,
      signature: signature.status,
      applied: event.applied,
      reason: event.skippedReason ?? signature.reason,
    };
  }

  /**
   * Seller lifecycle: seller-create, seller-update, seller-approve.
   *
   * These carry NO `payme_signature` — PayMe does not sign them, because they
   * assert nothing about money. Treat them as hints to re-read state, never as
   * facts: on receipt, call get-sellers and trust that instead. That is exactly
   * what this does.
   */
  async handleSellerCallback(
    body: Record<string, unknown>,
  ): Promise<CallbackResult> {
    const paymeId = str(body.seller_payme_id);

    const event = this.events.create({
      kind: CallbackKind.Seller,
      notifyType: str(body.notify_type),
      entityId: paymeId,
      paymeTransactionId: null,
      // Not a failure: PayMe never signs seller notifications.
      signatureStatus: 'unsigned',
      signatureReason:
        'Seller callbacks are not signed by PayMe. Approval state is re-read from get-sellers rather than trusted from the payload.',
      payload: body,
      applied: false,
    });

    const seller = paymeId ? await this.sellers.findByPaymeId(paymeId) : null;

    if (seller) {
      try {
        // Deliberately ignore the payload's own seller_approved/seller_active
        // and ask PayMe. An unsigned body is not evidence.
        await this.sellers.describe(seller);
        event.applied = true;
      } catch (error) {
        event.skippedReason = `Could not refresh seller from PayMe: ${(error as Error).message}`;
      }
    } else {
      event.skippedReason = 'No local seller matches this seller_payme_id.';
    }

    await this.events.save(event);
    this.logger.log(
      `Seller callback ${event.notifyType ?? 'unknown'} for ${paymeId} — ${event.applied ? 'refreshed from PayMe' : event.skippedReason}`,
    );

    return {
      received: true,
      signature: 'unsigned',
      applied: event.applied,
      reason: event.skippedReason ?? event.signatureReason,
    };
  }

  async list(limit = 100): Promise<CallbackEvent[]> {
    return this.events.find({ order: { receivedAt: 'DESC' }, take: limit });
  }

  private async reject(
    event: CallbackEvent,
    signature: SignatureCheck,
  ): Promise<CallbackResult> {
    event.applied = false;
    event.skippedReason = signature.reason;
    await this.events.save(event);

    this.logger.warn(
      `REJECTED ${event.kind} callback for ${event.entityId ?? 'unknown entity'}: ${signature.reason}`,
    );

    // Answer 200 even on rejection. A non-2xx makes PayMe retry, and retrying
    // will not fix a bad signature — it just buries the real event in noise.
    // The rejection is recorded; that is where you look for it.
    return {
      received: true,
      signature: signature.status,
      applied: false,
      reason: signature.reason,
    };
  }
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.length) return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** urlencoded bodies are all strings — "0"/"false" are truthy until coerced. */
function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

/**
 * Numeric coercion that preserves absence.
 *
 * Every value in a urlencoded callback is a string, so the numbers have to be
 * coerced before they are usable. The trap is defaulting a MISSING field to 0:
 * PayMe does not send every field on every notification, and a `?? 0` turns
 * "this notification says nothing about the price" into "the price is zero",
 * which the applier then writes over a perfectly good value.
 *
 * So this returns undefined for an absent key, and the appliers below skip
 * anything undefined. Only fields the callback actually carried get written.
 */
function coerceNumericFields<T extends object>(
  body: Record<string, unknown>,
  keys: readonly string[],
): T {
  const result: Record<string, unknown> = { ...body };
  for (const key of keys) {
    if (key in body) {
      const parsed = num(body[key]);
      if (parsed === undefined) delete result[key];
      else result[key] = parsed;
    }
  }
  return result as T;
}

const SALE_NUMERIC_FIELDS = [
  'status_code',
  'status_error_code',
  'price',
  'payme_sale_code',
  'installments',
] as const;

function coerceSaleDetails(body: Record<string, unknown>): PayMeSaleDetails {
  return {
    ...coerceNumericFields<PayMeSaleDetails>(body, SALE_NUMERIC_FIELDS),
    status_code: num(body.status_code) ?? 0,
    is_token_sale: bool(body.is_token_sale),
  };
}

const SUBSCRIPTION_NUMERIC_FIELDS = [
  'status_code',
  'status_error_code',
  'sub_status',
  'sub_price',
  'sub_iteration_type',
  'sub_iterations',
  'sub_iterations_completed',
  'sub_iterations_skipped',
  'sub_iterations_left',
  'sub_payme_code',
] as const;

function coerceSubscriptionDetails(
  body: Record<string, unknown>,
): PayMeSubscriptionDetails {
  return {
    ...coerceNumericFields<PayMeSubscriptionDetails>(
      body,
      SUBSCRIPTION_NUMERIC_FIELDS,
    ),
    status_code: num(body.status_code) ?? 0,
    sub_paid: bool(body.sub_paid),
  };
}
