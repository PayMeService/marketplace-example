import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayMeClient } from '../payme/payme.client';
import {
  GenerateSubscriptionRequest,
  GenerateSubscriptionResponse,
  PayMeEnvelope,
  PayMeSubscriptionDetails,
} from '../payme/payme.types';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { SellersService } from '../sellers/sellers.service';
import { Subscription, SubscriptionStatus } from './subscription.entity';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionPriceDto,
} from './dto/subscription.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    private readonly payme: PayMeClient,
    private readonly settings: PayMeSettingsService,
    private readonly sellers: SellersService,
  ) {}

  /**
   * Create a recurring charge.
   *
   * Two shapes, chosen by whether `buyerKey` is supplied:
   *
   *  - WITHOUT a token: PayMe returns `sub_url`, a hosted page where the buyer
   *    enters their card. The subscription sits in status `initial` until they
   *    do, then flips to `active` and the first iteration is charged.
   *
   *  - WITH a token (from a `capture_buyer` sale or Hosted Fields): the
   *    subscription activates immediately with no buyer interaction at all.
   *    This is the upgrade path — a buyer who already paid you once never has
   *    to re-enter a card.
   *
   * After that, PayMe drives the schedule. You do not charge iterations
   * yourself; you learn about each one from a `sub-iteration-success` or
   * `sub-failure` callback.
   */
  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<Subscription> {
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();

    const subscription = await this.subscriptions.save(
      this.subscriptions.create({
        sellerId: seller.id,
        priceMinor: dto.priceMinor,
        currency: dto.currency,
        description: dto.description,
        iterationType: dto.iterationType,
        iterations: dto.iterations,
        status: SubscriptionStatus.Initial,
      }),
    );

    const request: GenerateSubscriptionRequest = {
      seller_payme_id: seller.paymeId,
      sub_price: dto.priceMinor,
      sub_currency: dto.currency,
      sub_description: dto.description,
      // A string on the wire, even though it is an enum of small integers.
      sub_iteration_type: String(dto.iterationType),
      sub_iterations: dto.iterations,
      language: dto.language ?? 'en',
    };

    if (dto.startDate) request.sub_start_date = dto.startDate;
    // Present => activate now; absent => PayMe returns a page for the buyer.
    if (dto.buyerKey) request.buyer_key = dto.buyerKey;

    const callbackUrl = await this.settings.callbackUrl(
      'callbacks/payme/subscription',
    );
    if (callbackUrl) request.sub_callback_url = callbackUrl;

    // Buyer-facing, so built from the app origin rather than the API origin.
    const returnUrl = await this.settings.returnUrl(
      `subscriptions?activated=${subscription.id}`,
    );
    if (returnUrl) request.sub_return_url = returnUrl;

    try {
      const response = await this.payme.request<GenerateSubscriptionResponse>(
        environment,
        'generate-subscription',
        request,
      );
      return this.applyResponse(subscription, response);
    } catch (error) {
      // Keep the local row so the failure is visible in the UI with PayMe's
      // own message, instead of vanishing.
      subscription.status = SubscriptionStatus.Failed;
      subscription.lastError = (error as Error).message;
      await this.subscriptions.save(subscription);
      throw error;
    }
  }

  /**
   * Cancel — terminal. A cancelled subscription cannot be resumed; the buyer
   * has to start a new one. Use pause for a reversible stop.
   */
  async cancel(userId: string, id: string): Promise<Subscription> {
    const { subscription, seller } = await this.requireOwned(id, userId);
    const { environment } = await this.settings.get();

    await this.payme.request<PayMeEnvelope>(
      environment,
      'cancel-subscription',
      {
        seller_payme_id: seller.paymeId,
        sub_payme_id: this.requirePaymeId(subscription),
        language: 'en',
      },
    );

    subscription.status = SubscriptionStatus.Cancelled;
    return this.subscriptions.save(subscription);
  }

  /** Pause — stops future iterations but keeps the subscription resumable. */
  async pause(userId: string, id: string): Promise<Subscription> {
    const { subscription, seller } = await this.requireOwned(id, userId);
    const { environment } = await this.settings.get();

    const response = await this.payme.request<PayMeSubscriptionDetails>(
      environment,
      'pause-subscription',
      {
        seller_payme_id: seller.paymeId,
        sub_payme_id: this.requirePaymeId(subscription),
      },
    );

    return this.applyDetails(subscription, response);
  }

  /**
   * Resume a paused subscription.
   *
   * A REST-shaped endpoint in an otherwise RPC-shaped API:
   *   PATCH /subscriptions/{sub_payme_id}/resume
   * The seller is identified by the `PayMe-Merchant-Key` HEADER rather than a
   * body field. Sending `seller_payme_id` in a body here does nothing.
   */
  async resume(userId: string, id: string): Promise<Subscription> {
    const { subscription, seller } = await this.requireOwned(id, userId);
    const { environment } = await this.settings.get();

    if (subscription.status !== SubscriptionStatus.Paused) {
      throw new BadRequestException(
        `Only a paused subscription can be resumed (this one is "${subscription.status}").`,
      );
    }

    const response = await this.payme.request<PayMeSubscriptionDetails>(
      environment,
      `subscriptions/${this.requirePaymeId(subscription)}/resume`,
      {},
      { method: 'PATCH', headers: { 'PayMe-Merchant-Key': seller.paymeId } },
    );

    return this.applyDetails(subscription, response);
  }

  /**
   * Change the per-iteration price.
   *
   *   PATCH /subscriptions/{sub_id}/set-price
   *
   * Applies to subscriptions in `active` status (and to templates still in
   * `initial`). The new price takes effect from the next iteration — iterations
   * already charged are untouched.
   */
  async updatePrice(
    userId: string,
    id: string,
    dto: UpdateSubscriptionPriceDto,
  ): Promise<Subscription> {
    const { subscription, seller } = await this.requireOwned(id, userId);
    const { environment } = await this.settings.get();

    await this.payme.request<PayMeEnvelope>(
      environment,
      `subscriptions/${this.requirePaymeId(subscription)}/set-price`,
      {
        seller_payme_id: seller.paymeId,
        // A string on this endpoint, a number on generate-subscription.
        sub_price: String(dto.priceMinor),
      },
      { method: 'PATCH' },
    );

    subscription.priceMinor = dto.priceMinor;
    return this.subscriptions.save(subscription);
  }

  async listForUser(userId: string): Promise<Subscription[]> {
    const seller = await this.sellers.findByUser(userId);
    if (!seller) return [];
    return this.subscriptions.find({
      where: { sellerId: seller.id },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findByPaymeSubId(paymeSubId: string): Promise<Subscription | null> {
    return this.subscriptions.findOneBy({ paymeSubId });
  }

  /** Apply a verified subscription callback. */
  async applyCallback(
    details: PayMeSubscriptionDetails,
  ): Promise<Subscription | null> {
    if (!details.sub_payme_id) return null;
    const subscription = await this.findByPaymeSubId(details.sub_payme_id);
    if (!subscription) {
      this.logger.warn(
        `Callback for unknown subscription ${details.sub_payme_id} — ignoring.`,
      );
      return null;
    }
    return this.applyDetails(subscription, details);
  }

  // -------------------------------------------------------------------------

  private async applyResponse(
    subscription: Subscription,
    response: GenerateSubscriptionResponse,
  ): Promise<Subscription> {
    subscription.paymeSubId = response.sub_payme_id;
    subscription.paymeSubCode = Number(response.sub_payme_code) || null;
    subscription.subUrl = response.sub_url ?? null;
    subscription.status =
      Number(response.sub_status) || SubscriptionStatus.Initial;
    subscription.startDate = parseDate(response.sub_start_date);
    subscription.nextDate = parseDate(response.sub_next_date);
    subscription.lastPayload = response as unknown as Record<string, unknown>;
    subscription.lastError = response.sub_error_text ?? null;
    return this.subscriptions.save(subscription);
  }

  private async applyDetails(
    subscription: Subscription,
    details: PayMeSubscriptionDetails,
  ): Promise<Subscription> {
    // Every write here is guarded on the field being PRESENT, not merely
    // falsy-checked. PayMe does not send the full subscription on every
    // notification — a sub-cancel carries far less than a
    // sub-iteration-success — and blindly assigning absent fields overwrites
    // good local values with zeroes. Absent means "no news", not "now zero".
    if (details.sub_payme_id) subscription.paymeSubId = details.sub_payme_id;
    if (typeof details.sub_status === 'number') {
      // Widening cast: PayMe can send a status this enum does not know about
      // yet, and storing it verbatim is better than mapping it to something we
      // do recognise and acting on the wrong thing.
      subscription.status = details.sub_status;
    }
    if (typeof details.sub_price === 'number') {
      subscription.priceMinor = details.sub_price;
    }
    if (typeof details.sub_iteration_type === 'number') {
      subscription.iterationType = details.sub_iteration_type;
    }
    if (typeof details.sub_iterations === 'number') {
      subscription.iterations = details.sub_iterations;
    }
    if (typeof details.sub_iterations_completed === 'number') {
      subscription.iterationsCompleted = details.sub_iterations_completed;
    }
    if (details.sub_description)
      subscription.description = details.sub_description;
    subscription.startDate =
      parseDate(details.sub_start_date) ?? subscription.startDate;
    subscription.nextDate =
      parseDate(details.sub_next_date) ?? subscription.nextDate;
    if (details.buyer_name) subscription.buyerName = details.buyer_name;
    if (details.buyer_email) subscription.buyerEmail = details.buyer_email;
    if (details.buyer_card_mask)
      subscription.buyerCardMask = details.buyer_card_mask;
    // Only clear a stored error when the payload actually reports the field.
    if ('sub_error_text' in details) {
      subscription.lastError = details.sub_error_text ?? null;
    }
    subscription.lastPayload = details as unknown as Record<string, unknown>;
    return this.subscriptions.save(subscription);
  }

  private async requireOwned(id: string, userId: string) {
    const subscription = await this.subscriptions.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.seller?.userId !== userId) {
      throw new ForbiddenException(
        'That subscription belongs to another seller',
      );
    }
    return { subscription, seller: subscription.seller };
  }

  private requirePaymeId(subscription: Subscription): string {
    if (!subscription.paymeSubId) {
      throw new BadRequestException(
        'This subscription was never registered with PayMe — generate-subscription did not complete.',
      );
    }
    return subscription.paymeSubId;
  }
}

/** PayMe returns "2023-07-05 17:45:36" — space-separated, not ISO-T. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
