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
  CaptureSaleRequest,
  GenerateSaleRequest,
  GenerateSaleResponse,
  GetBuyerKeyResponse,
  PaySaleRequest,
  PayMeSaleDetails,
  RefundSaleRequest,
  RefundSaleResponse,
} from '../payme/payme.types';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { SellersService } from '../sellers/sellers.service';
import { ProductsService } from '../products/products.service';
import { Seller } from '../sellers/seller.entity';
import { Sale, SaleFlow, SaleStatus, toSaleStatus } from './sale.entity';
import {
  CreateHostedFieldsSaleDto,
  CreateIframeSaleDto,
  CreateSaleBaseDto,
  DirectTokenSaleDto,
  PaySaleDto,
  RefundSaleDto,
} from './dto/sale.dto';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly payme: PayMeClient,
    private readonly settings: PayMeSettingsService,
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
  ) {}

  // -------------------------------------------------------------------------
  // Flow 1 — Hosted payment page (iframe / redirect)
  // -------------------------------------------------------------------------

  /**
   * Create a sale to be paid on PayMe's own page.
   *
   * The simplest integration and the one with the smallest compliance
   * footprint: PayMe renders the form, handles 3-D Secure, and you never see a
   * card number. generate-sale returns `sale_url`; put it in an iframe or send
   * the buyer to it.
   *
   * The buyer's browser then goes to `sale_return_url` with the result in the
   * query string — but that redirect is a UX signal, not proof of payment: the
   * buyer controls their browser and can forge or never follow it. The
   * server-to-server callback to `sale_callback_url` is the authoritative one.
   * Both carry `payme_signature`; verify it before acting either way.
   */
  async createIframeSale(
    userId: string,
    dto: CreateIframeSaleDto,
  ): Promise<Sale> {
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();
    const line = await this.resolveLine(dto);

    const sale = await this.sales.save(
      this.sales.create({
        sellerId: seller.id,
        productId: dto.productId ?? null,
        flow: SaleFlow.Iframe,
        saleType: dto.saleType ?? 'sale',
        status: SaleStatus.Initial,
        priceMinor: line.priceMinor,
        currency: line.currency,
        productName: line.productName,
        buyerName: dto.buyerName ?? null,
        buyerEmail: dto.buyerEmail ?? null,
        captureBuyerRequested: Boolean(dto.captureBuyer),
      }),
    );

    const request = await this.buildGenerateSaleRequest(seller, sale, dto);
    request.sale_payment_method = dto.paymentMethod ?? 'credit-card';
    if (dto.layout) request.layout = dto.layout;

    // Where the buyer's browser lands after paying. The frontend route reads
    // the query parameters PayMe appends and shows a receipt.
    request.sale_return_url = await this.returnUrl(sale.id);

    const response = await this.payme.request<GenerateSaleResponse>(
      environment,
      'generate-sale',
      request,
    );

    return this.applyGenerateSaleResponse(sale, response);
  }

  /**
   * A BUYER buys a listed product.
   *
   * The seller-initiated flows above all start from "which of my sellers is
   * charging?". This one starts from the product, and the seller is derived:
   * the money must land in the wallet of whoever listed the item, and their
   * `market_fee` — not the buyer's, not the caller's — is what applies.
   *
   * That inversion is the whole point of a marketplace integration. The buyer
   * never chooses an MPL and never sees one; they pick an item, and the
   * platform routes the payment to the right seller.
   */
  async buyProduct(
    buyerUserId: string,
    productId: string,
    options: { buyerName?: string; buyerEmail?: string } = {},
  ): Promise<Sale> {
    const product = await this.products.findById(productId);

    if (!product.active) {
      throw new BadRequestException('That product is no longer for sale.');
    }
    if (product.ownerId === buyerUserId) {
      throw new BadRequestException(
        'You cannot buy your own listing. Use “Take a payment” to charge someone else for it.',
      );
    }

    // The SELLER is the product's owner, not the caller.
    const seller = await this.sellers.findByUser(product.ownerId);
    if (!seller) {
      throw new BadRequestException(
        'The person who listed this item has not opened a PayMe seller account yet, so there is nowhere to send the money.',
      );
    }

    const { environment } = await this.settings.get();

    const sale = await this.sales.save(
      this.sales.create({
        sellerId: seller.id,
        productId: product.id,
        buyerUserId: buyerUserId,
        flow: SaleFlow.Iframe,
        saleType: 'sale',
        status: SaleStatus.Initial,
        // Price comes from the listing. A price in the request body is a price
        // the buyer can edit.
        priceMinor: product.priceMinor,
        currency: product.currency,
        productName: product.name,
        buyerName: options.buyerName ?? null,
        buyerEmail: options.buyerEmail ?? null,
      }),
    );

    const request = await this.buildGenerateSaleRequest(seller, sale, {
      buyerName: options.buyerName,
      buyerEmail: options.buyerEmail,
    });
    // Let the buyer pick from whatever the seller has enabled.
    request.sale_payment_method = 'multi';
    request.sale_return_url = await this.returnUrl(sale.id);

    const response = await this.payme.request<GenerateSaleResponse>(
      environment,
      'generate-sale',
      request,
    );

    return this.applyGenerateSaleResponse(sale, response);
  }

  // -------------------------------------------------------------------------
  // Flow 2 — Hosted Fields (JSAPI)
  // -------------------------------------------------------------------------

  /**
   * Reserve a sale that the browser will pay with a Hosted Fields token.
   *
   * Step 1 of two. The card inputs on your checkout are iframes served by
   * PayMe (cdn.payme.io/hf/v1/hostedfields.js), initialised with the SELLER's
   * public key. The browser calls `instance.tokenize(...)`, PayMe's vault
   * returns a `token`, and step 2 (payExistingSale) charges it server-side.
   *
   * The result is a checkout that looks entirely like yours while the card data
   * goes browser -> PayMe, never browser -> you. That is what keeps this
   * server out of PCI DSS scope, and it is the reason to prefer this over
   * collecting the PAN yourself.
   */
  async createHostedFieldsSale(
    userId: string,
    dto: CreateHostedFieldsSaleDto,
  ): Promise<{ sale: Sale; publicKey: string | null; seller: Seller }> {
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();
    const line = await this.resolveLine(dto);

    const sale = await this.sales.save(
      this.sales.create({
        sellerId: seller.id,
        productId: dto.productId ?? null,
        flow: SaleFlow.HostedFields,
        saleType: dto.saleType ?? 'sale',
        status: SaleStatus.Initial,
        priceMinor: line.priceMinor,
        currency: line.currency,
        productName: line.productName,
        buyerName: dto.buyerName ?? null,
        buyerEmail: dto.buyerEmail ?? null,
        captureBuyerRequested: Boolean(dto.captureBuyer),
      }),
    );

    const request = await this.buildGenerateSaleRequest(seller, sale, dto);
    const response = await this.payme.request<GenerateSaleResponse>(
      environment,
      'generate-sale',
      request,
    );
    const saved = await this.applyGenerateSaleResponse(sale, response);

    // The browser needs the seller's public key to open a tokenization session.
    // It is public by design; the private half never leaves PayMe.
    const publicKey =
      seller.paymePublicKey ?? (await this.sellers.fetchPublicKey(seller));

    return { sale: saved, publicKey, seller };
  }

  // -------------------------------------------------------------------------
  // Flow 3 — Direct API (pay-sale with a token)
  // -------------------------------------------------------------------------

  /**
   * Charge an existing sale with a buyer token.
   *
   * Step 2 of Hosted Fields, and also the whole of the "charge a saved card"
   * flow. pay-sale is the endpoint PCI-compliant merchants use to send a raw
   * PAN; we only ever send `buyer_key`, which is the same endpoint without the
   * compliance burden.
   *
   * Unlike the hosted page, the answer is synchronous: pay-sale's response IS
   * the sale-details payload, signature and all. The callback still arrives
   * afterwards; treat it as idempotent reinforcement, not new information.
   */
  async payExistingSale(
    userId: string,
    saleId: string,
    dto: PaySaleDto,
  ): Promise<Sale> {
    const sale = await this.requireOwnedSale(saleId, userId);
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();

    if (!sale.paymeSaleId) {
      throw new BadRequestException(
        'This sale was never registered with PayMe — generate-sale did not complete.',
      );
    }
    if (
      sale.status !== SaleStatus.Initial &&
      sale.status !== SaleStatus.Failed
    ) {
      throw new BadRequestException(
        `Sale is "${sale.status}" and cannot be paid again. PayMe only accepts pay-sale on sales in initial or failed state.`,
      );
    }

    const request: PaySaleRequest = {
      seller_payme_id: seller.paymeId,
      payme_sale_id: sale.paymeSaleId,
      // pay-sale wants these as strings, unlike generate-sale's numbers.
      sale_price: String(sale.priceMinor),
      currency: sale.currency,
      installments: dto.installments ?? '1',
      buyer_key: dto.buyerKey,
      buyer_name: dto.buyerName ?? sale.buyerName ?? undefined,
      buyer_email: dto.buyerEmail ?? sale.buyerEmail ?? undefined,
      buyer_phone: dto.buyerPhone,
      sale_return_url: await this.returnUrl(sale.id),
      language: 'en',
    };

    const callbackUrl = await this.settings.callbackUrl('callbacks/payme/sale');
    if (callbackUrl) request.sale_callback_url = callbackUrl;

    try {
      const details = await this.payme.request<PayMeSaleDetails>(
        environment,
        'pay-sale',
        request,
      );
      return this.applySaleDetails(sale, details);
    } catch (error) {
      sale.status = SaleStatus.Failed;
      sale.lastError = (error as Error).message;
      await this.sales.save(sale);
      throw error;
    }
  }

  /** Create and immediately charge a sale against a saved token, in one step. */
  async chargeToken(userId: string, dto: DirectTokenSaleDto): Promise<Sale> {
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();
    const line = await this.resolveLine(dto);

    const sale = await this.sales.save(
      this.sales.create({
        sellerId: seller.id,
        productId: dto.productId ?? null,
        flow: SaleFlow.PaySale,
        saleType: dto.saleType ?? 'sale',
        status: SaleStatus.Initial,
        priceMinor: line.priceMinor,
        currency: line.currency,
        productName: line.productName,
        buyerName: dto.buyerName ?? null,
        buyerEmail: dto.buyerEmail ?? null,
      }),
    );

    const generate = await this.buildGenerateSaleRequest(seller, sale, dto);
    // capture_buyer and buyer_key are mutually exclusive: you either tokenize a
    // new card on this sale or charge an existing token, never both. PayMe
    // rejects a request carrying the two together.
    delete generate.capture_buyer;

    const created = await this.payme.request<GenerateSaleResponse>(
      environment,
      'generate-sale',
      generate,
    );
    const withSaleId = await this.applyGenerateSaleResponse(sale, created);

    return this.payExistingSale(userId, withSaleId.id, {
      buyerKey: dto.buyerKey,
      buyerName: dto.buyerName,
      buyerEmail: dto.buyerEmail,
      buyerPhone: dto.buyerPhone,
      installments: dto.installments,
    });
  }

  // -------------------------------------------------------------------------
  // Post-sale actions
  // -------------------------------------------------------------------------

  /**
   * Settle an authorization (J5 -> capture).
   *
   * Rules PayMe enforces, all of which produce confusing errors if broken:
   *  - the sale must have been created with `sale_type: "authorize"`;
   *  - it must actually be in `authorized` status, i.e. the buyer has paid;
   *  - capture happens within 168 hours (7 days) of the authorization, after
   *    which the reservation lapses and the request fails;
   *  - it can be done ONCE, fully or partially. There is no second capture.
   *
   * To release an authorization instead of settling it, refund it — that is
   * what "void" means for an uncaptured J5.
   */
  async capture(userId: string, saleId: string): Promise<Sale> {
    const sale = await this.requireOwnedSale(saleId, userId);
    const seller = await this.sellers.requireOwnSeller(userId);
    const { clientKey, environment } = await this.settings.get();

    if (sale.saleType !== 'authorize') {
      throw new BadRequestException(
        'Only a sale created with sale_type="authorize" can be captured.',
      );
    }
    if (sale.status !== SaleStatus.Authorized) {
      throw new BadRequestException(
        `Sale is "${sale.status}". Capture requires an authorized sale — the buyer must have completed the authorization first.`,
      );
    }
    if (!sale.paymeSaleId) {
      throw new BadRequestException('Sale has no payme_sale_id');
    }

    const request: CaptureSaleRequest = {
      payme_client_key: clientKey,
      seller_payme_id: seller.paymeId,
      payme_sale_id: sale.paymeSaleId,
      // Not in capture-sale's documented body, but accepted — and without it
      // errors come back in Hebrew.
      language: 'en',
    };

    const details = await this.payme.request<PayMeSaleDetails>(
      environment,
      'capture-sale',
      request,
    );

    const updated = await this.applySaleDetails(sale, details);
    updated.capturedAt = new Date();
    return this.sales.save(updated);
  }

  /**
   * Refund a completed sale, or void an uncaptured authorization.
   *
   * Both are the same endpoint. refund-sale can be called repeatedly as long as
   * the total refunded stays within the original amount; omitting
   * `sale_refund_amount` refunds the remainder in full.
   *
   * On an authorized-but-uncaptured sale this releases the hold — PayMe reports
   * the result as `voided` rather than `refunded`.
   */
  async refund(
    userId: string,
    saleId: string,
    dto: RefundSaleDto,
  ): Promise<Sale> {
    const sale = await this.requireOwnedSale(saleId, userId);
    const seller = await this.sellers.requireOwnSeller(userId);
    const { clientKey, environment } = await this.settings.get();

    if (!sale.paymeSaleId) {
      throw new BadRequestException('Sale has no payme_sale_id');
    }

    const refundable = sale.priceMinor - sale.refundedMinor;
    if (refundable <= 0) {
      throw new BadRequestException(
        'This sale has already been fully refunded.',
      );
    }
    if (dto.amountMinor && dto.amountMinor > refundable) {
      throw new BadRequestException(
        `Cannot refund ${dto.amountMinor}: only ${refundable} minor units remain on this sale.`,
      );
    }

    const request: RefundSaleRequest = {
      payme_client_key: clientKey,
      seller_payme_id: seller.paymeId,
      payme_sale_id: sale.paymeSaleId,
      language: 'en',
    };
    // Omitted => full refund of whatever is left.
    if (dto.amountMinor) request.sale_refund_amount = dto.amountMinor;

    const response = await this.payme.request<RefundSaleResponse>(
      environment,
      'refund-sale',
      request,
    );

    sale.refundedMinor += dto.amountMinor ?? refundable;
    sale.status = toSaleStatus(response.sale_status) ?? sale.status;
    sale.lastPayload = response as unknown as Record<string, unknown>;
    sale.lastError = null;
    return this.sales.save(sale);
  }

  /**
   * Recover the reusable token from a paid sale.
   *
   * When a sale was created with `capture_buyer: "1"`, PayMe returns the token
   * on the callback as `buyer_key`. If you missed the callback — or want the
   * token for a sale someone else's process created — get-buyer-key looks it up
   * from the sale id.
   */
  async fetchBuyerKey(userId: string, saleId: string): Promise<string> {
    const sale = await this.requireOwnedSale(saleId, userId);
    const seller = await this.sellers.requireOwnSeller(userId);
    const { environment } = await this.settings.get();

    if (!sale.paymeSaleId)
      throw new BadRequestException('Sale has no payme_sale_id');

    const response = await this.payme.request<GetBuyerKeyResponse>(
      environment,
      'get-buyer-key',
      { payme_sale_id: sale.paymeSaleId, seller_payme_id: seller.paymeId },
    );

    await this.sales.update(sale.id, {
      buyerKey: response.buyer_key,
      buyerCardMask: response.buyer_card_mask ?? sale.buyerCardMask,
    });
    return response.buyer_key;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async listForUser(userId: string): Promise<Sale[]> {
    const seller = await this.sellers.findByUser(userId);
    if (!seller) return [];
    return this.sales.find({
      where: { sellerId: seller.id },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findById(id: string): Promise<Sale> {
    const sale = await this.sales.findOneBy({ id });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  /**
   * Read a sale, scoped to the people entitled to see it.
   *
   * A sale carries the buyer's name, email and card mask, so it is visible to
   * the seller who owns it and to the buyer who created it — not to any
   * authenticated user who can guess a uuid.
   */
  async findVisibleTo(id: string, userId: string): Promise<Sale> {
    const sale = await this.sales.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.buyerUserId !== userId && sale.seller?.userId !== userId) {
      throw new ForbiddenException('That sale is not yours');
    }
    return sale;
  }

  async findByPaymeSaleId(paymeSaleId: string): Promise<Sale | null> {
    return this.sales.findOneBy({ paymeSaleId });
  }

  /** Saved tokens the seller can charge again, one row per distinct card. */
  async listSavedTokens(userId: string) {
    const seller = await this.sellers.findByUser(userId);
    if (!seller) return [];

    const rows = await this.sales
      .createQueryBuilder('sale')
      .select([
        'sale.id AS id',
        'sale.buyerKey AS "buyerKey"',
        'sale.buyerCardMask AS "cardMask"',
        'sale.buyerName AS "buyerName"',
        'sale.buyerEmail AS "buyerEmail"',
        'sale.createdAt AS "createdAt"',
      ])
      .where('sale.sellerId = :sellerId', { sellerId: seller.id })
      .andWhere('sale.buyerKey IS NOT NULL')
      .orderBy('sale.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        buyerKey: string;
        cardMask: string | null;
        buyerName: string | null;
        buyerEmail: string | null;
        createdAt: Date;
      }>();

    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.buyerKey)) return false;
      seen.add(row.buyerKey);
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Callback ingestion (called by CallbacksService once the signature checks out)
  // -------------------------------------------------------------------------

  /** Apply a verified sale callback to the local row. */
  async applyCallback(details: PayMeSaleDetails): Promise<Sale | null> {
    if (!details.payme_sale_id) return null;
    const sale = await this.findByPaymeSaleId(details.payme_sale_id);
    if (!sale) {
      this.logger.warn(
        `Callback for unknown sale ${details.payme_sale_id} — ignoring. ` +
          `This is normal if the sale belongs to another environment or another instance of this app.`,
      );
      return null;
    }
    return this.applySaleDetails(sale, details);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Resolve what is being sold: a listed product, or an ad-hoc line. */
  private async resolveLine(dto: CreateSaleBaseDto) {
    if (dto.productId) {
      const product = await this.products.findById(dto.productId);
      // Price comes from the product, never from the client: a price in the
      // request body is a price the buyer can edit.
      return {
        priceMinor: product.priceMinor,
        currency: product.currency,
        productName: product.name,
      };
    }

    if (!dto.priceMinor || !dto.productName) {
      throw new BadRequestException(
        'Provide either productId, or both productName and priceMinor.',
      );
    }
    return {
      priceMinor: dto.priceMinor,
      currency: dto.currency ?? 'ILS',
      productName: dto.productName,
    };
  }

  /** The common generate-sale body for every flow. */
  private async buildGenerateSaleRequest(
    seller: Seller,
    sale: Sale,
    dto: CreateSaleBaseDto,
  ): Promise<GenerateSaleRequest> {
    const request: GenerateSaleRequest = {
      // The SELLER's MPL. This is what routes the money to their wallet and
      // applies their market_fee — sending the marketplace's own MPL here is a
      // classic mistake, and PayMe rejects it with "Feature is not supported
      // for this seller type".
      seller_payme_id: seller.paymeId,
      sale_price: sale.priceMinor,
      currency: sale.currency,
      product_name: sale.productName,
      // Our own id, echoed back on every callback so we can correlate without
      // depending on PayMe's ids.
      transaction_id: sale.id,
      installments: dto.installments ?? '1',
      sale_type: dto.saleType ?? 'sale',
      language: dto.language ?? 'en',
    };

    if (dto.captureBuyer) {
      // A string flag, not a boolean: "1" capture, "0" don't.
      request.capture_buyer = '1';
    }
    if (dto.buyerName) request.buyer_name = dto.buyerName;
    if (dto.buyerEmail) request.buyer_email = dto.buyerEmail;
    if (dto.buyerPhone) request.buyer_phone = dto.buyerPhone;

    // Omitted entirely when the app is only reachable on localhost: PayMe
    // validates this URL and rejects the whole generate-sale call, rather than
    // quietly skipping the notification.
    const callbackUrl = await this.settings.callbackUrl('callbacks/payme/sale');
    if (callbackUrl) request.sale_callback_url = callbackUrl;

    return request;
  }

  /**
   * Where PayMe sends the buyer's browser after payment.
   *
   * Built from the APP origin, not the API origin: this is a frontend route,
   * and PayMe appends its result parameters to it. Unlike a callback URL it may
   * point at localhost, because the buyer's own browser follows it rather than
   * PayMe's servers.
   */
  private async returnUrl(saleId: string): Promise<string | undefined> {
    return this.settings.returnUrl(`checkout/return?saleId=${saleId}`);
  }

  private async applyGenerateSaleResponse(
    sale: Sale,
    response: GenerateSaleResponse,
  ): Promise<Sale> {
    sale.paymeSaleId = response.payme_sale_id;
    sale.paymeSaleCode = response.payme_sale_code;
    sale.saleUrl = response.sale_url;
    sale.lastError = null;
    return this.sales.save(sale);
  }

  /**
   * Fold a PayMe sale-details payload into the local row.
   *
   * Used for pay-sale and capture-sale responses AND for verified callbacks —
   * they are the same payload, which is what makes the write idempotent: a
   * callback arriving after a synchronous response simply re-applies the same
   * values.
   */
  private async applySaleDetails(
    sale: Sale,
    details: PayMeSaleDetails,
  ): Promise<Sale> {
    const status = toSaleStatus(
      details.sale_status ?? details.payme_sale_status,
    );
    if (status) sale.status = status;

    if (details.payme_sale_id) sale.paymeSaleId = details.payme_sale_id;
    if (details.payme_sale_code) sale.paymeSaleCode = details.payme_sale_code;
    if (details.payme_transaction_id) {
      sale.paymeTransactionId = details.payme_transaction_id;
    }
    if (details.buyer_name) sale.buyerName = details.buyer_name;
    if (details.buyer_email) sale.buyerEmail = details.buyer_email;
    if (details.buyer_card_mask) sale.buyerCardMask = details.buyer_card_mask;
    // Only present when capture_buyer was requested.
    if (details.buyer_key) sale.buyerKey = details.buyer_key;

    sale.lastPayload = details as unknown as Record<string, unknown>;
    sale.lastError =
      details.status_code === 0 ? null : (details.status_error_details ?? null);

    return this.sales.save(sale);
  }

  private async requireOwnedSale(
    saleId: string,
    userId: string,
  ): Promise<Sale> {
    const sale = await this.sales.findOne({
      where: { id: saleId },
      relations: { seller: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.seller?.userId !== userId) {
      throw new ForbiddenException('That sale belongs to another seller');
    }
    return sale;
  }
}
