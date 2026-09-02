import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { computePayMeSignature } from '../payme/payme-signature';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { CallbacksService, type CallbackResult } from './callbacks.service';

/**
 * PayMe's inbound webhooks.
 *
 * Three things about these routes are deliberate and worth copying:
 *
 *  1. NO AUTH GUARD. PayMe's servers have no session with you. Authentication
 *     is the `payme_signature` on the body, checked inside the service.
 *
 *  2. `@Body() body: Record<string, unknown>` — no DTO. The global
 *     ValidationPipe runs with `forbidNonWhitelisted`, and PayMe's payloads
 *     carry dozens of fields that grow between API versions. A DTO here would
 *     reject real callbacks the day PayMe adds a field. Typing the body as a
 *     plain record makes the pipe skip it; the service coerces what it needs.
 *
 *  3. ALWAYS 200. PayMe retries a non-2xx, and retrying cannot fix a bad
 *     signature or an unknown sale id — it only floods the log. Failures are
 *     recorded in callback_events and answered with 200.
 *
 * PayMe POSTs `application/x-www-form-urlencoded`; Nest's default body parser
 * handles that already, so every value arrives as a string.
 */
@Controller('callbacks/payme')
export class CallbacksController {
  constructor(
    private readonly callbacks: CallbacksService,
    private readonly settings: PayMeSettingsService,
    private readonly config: ConfigService,
  ) {}

  /** sale-complete | sale-authorized | refund | sale-failure | sale-chargeback */
  @Post('sale')
  @HttpCode(200)
  sale(@Body() body: Record<string, unknown>) {
    return this.callbacks.handleSaleCallback(body ?? {});
  }

  /** sub-create | sub-active | sub-iteration-success | sub-failure | ... */
  @Post('subscription')
  @HttpCode(200)
  subscription(@Body() body: Record<string, unknown>) {
    return this.callbacks.handleSubscriptionCallback(body ?? {});
  }

  /** seller-create | seller-update | seller-approve */
  @Post('seller')
  @HttpCode(200)
  seller(@Body() body: Record<string, unknown>) {
    return this.callbacks.handleSellerCallback(body ?? {});
  }

  /**
   * The callback log — every notification received, verified or rejected.
   * Admin-only: the payloads contain buyer details.
   */
  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  events(@Query('limit') limit?: string) {
    return this.callbacks.list(Math.min(Number(limit) || 100, 500));
  }

  /**
   * Local callback simulator.
   *
   * PayMe will not deliver to a localhost URL, so without a tunnel
   * (cloudflared/ngrok) the callback path is unreachable in development —
   * which is exactly the path most worth testing. This builds a correctly
   * SIGNED payload from the configured client key and secret and feeds it
   * through the real handler, so the signature check is genuinely exercised
   * rather than bypassed.
   *
   * IMPORTANT LIMITATION: a simulated callback moves only YOUR side of the
   * world. PayMe's copy of the sale is untouched, so after simulating
   * `sale-authorized` your row says "authorized" while PayMe's still says
   * "initial", and a real capture-sale then fails with error 305, "Cannot
   * perform action due to an incorrect status". That divergence is not a bug in
   * the simulator — it is a faithful demonstration that PayMe, not your
   * database, is the source of truth for what a sale is.
   *
   * Admin-only, and refuses to run against a production PayMe environment.
   * Delete this route before shipping if you would rather not carry it.
   */
  @Post('simulate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin)
  async simulate(
    @Body()
    body: {
      kind?: 'sale' | 'subscription' | 'seller';
      /** payme_sale_id / sub_payme_id / seller_payme_id */
      entityId?: string;
      /** PayMe's transaction guid. Any value works — it just has to match the hash. */
      paymeTransactionId?: string;
      notifyType?: string;
      /** Set false to produce a deliberately wrong signature and watch it be rejected. */
      signed?: boolean;
      extra?: Record<string, unknown>;
    },
  ) {
    const { environment, clientKey, clientSecret } = await this.settings.get();

    if (environment === 'production') {
      throw new ForbiddenException(
        'The callback simulator is disabled while PayMe is set to production.',
      );
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException(
        'The callback simulator is disabled when NODE_ENV=production.',
      );
    }
    if (!body.entityId) {
      throw new BadRequestException(
        'entityId is required (payme_sale_id, sub_payme_id or seller_payme_id).',
      );
    }

    const kind = body.kind ?? 'sale';
    const transactionId = body.paymeTransactionId ?? `TRANSIM-${Date.now()}`;
    const signature =
      body.signed === false
        ? 'deadbeefdeadbeefdeadbeefdeadbeef'
        : computePayMeSignature(
            clientKey,
            clientSecret,
            transactionId,
            body.entityId,
          );

    const note =
      'Simulated locally: PayMe’s own copy of this entity is unchanged, so a subsequent real capture or refund may fail with a status mismatch (error 305).';

    if (kind === 'seller') {
      return this.callbacks.handleSellerCallback({
        status_code: '0',
        notify_type: body.notifyType ?? 'seller-approve',
        seller_payme_id: body.entityId,
        ...body.extra,
      });
    }

    if (kind === 'subscription') {
      return this.withNote(note, () =>
        this.callbacks.handleSubscriptionCallback({
          status_code: '0',
          notify_type: body.notifyType ?? 'sub-iteration-success',
          sub_payme_id: body.entityId,
          // On subscription callbacks this field carries PayMe's TRANSACTION
          // guid — see payme/payme-signature.ts.
          transaction_id: transactionId,
          payme_signature: signature,
          sub_status: '2',
          sub_paid: '1',
          ...body.extra,
        }),
      );
    }

    return this.withNote(note, () =>
      this.callbacks.handleSaleCallback({
        status_code: '0',
        notify_type: body.notifyType ?? 'sale-complete',
        payme_sale_id: body.entityId,
        payme_transaction_id: transactionId,
        payme_signature: signature,
        sale_status:
          body.notifyType === 'sale-authorized' ? 'authorized' : 'completed',
        ...body.extra,
      }),
    );
  }

  private async withNote(
    note: string,
    run: () => Promise<CallbackResult>,
  ): Promise<CallbackResult & { note: string }> {
    return { ...(await run()), note };
  }
}
