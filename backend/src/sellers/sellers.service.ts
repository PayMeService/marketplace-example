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
  CreateSellerRequest,
  CreateSellerResponse,
  GetSellersResponse,
  PayMeSellerSummary,
  SellerPublicKeysResponse,
  SellerTokenRequest,
  SellerTokenResponse,
} from '../payme/payme.types';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { AuthService } from '../auth/auth.service';
import { Seller } from './seller.entity';
import { CreateSellerDto } from './dto/create-seller.dto';
import { findSellerPlan, SELLER_PLANS } from './seller-plans';

@Injectable()
export class SellersService {
  private readonly logger = new Logger(SellersService.name);

  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly payme: PayMeClient,
    private readonly settings: PayMeSettingsService,
    private readonly auth: AuthService,
  ) {}

  listPlans() {
    return SELLER_PLANS;
  }

  /**
   * Onboard a user as a PayMe seller.
   *
   * FLOW: POST /create-seller with the partner key -> PayMe returns the MPL,
   * the seller secret and a public key -> we persist them and promote the user.
   *
   * Ordering matters. `seller_payme_secret` and `seller_public_key` are returned
   * exactly once and are not retrievable later (the public key is, via
   * /sellers/{mpl}/public-keys; the secret is not). So the row is written
   * before anything else can throw — including the role promotion below.
   */
  async createSeller(userId: string, dto: CreateSellerDto): Promise<Seller> {
    const plan = findSellerPlan(dto.planId);
    if (!plan) {
      throw new BadRequestException(`Unknown plan "${dto.planId}"`);
    }

    const existing = await this.sellers.findOneBy({ userId });
    if (existing) {
      throw new BadRequestException(
        `You already have a PayMe seller (${existing.paymeId})`,
      );
    }

    const { clientKey, environment } = await this.settings.get();
    if (!clientKey) {
      throw new BadRequestException(
        'No PayMe client key configured. Set it on the Settings page first.',
      );
    }

    // PayMe requires the business number to equal the owner's social ID for
    // sole proprietors and exempt dealers. Its own error message is clear, but
    // failing here means one fewer round trip and a message tied to our field
    // names rather than PayMe's.
    const soleTrader =
      dto.incorporationType === 2 || dto.incorporationType === 5;
    if (soleTrader && dto.businessCode && dto.businessCode !== dto.socialId) {
      throw new BadRequestException(
        'For a sole proprietorship or exempt dealer, PayMe requires the business number to be identical to the owner’s ID number.',
      );
    }

    const request: CreateSellerRequest = {
      payme_client_key: clientKey,
      seller_first_name: dto.firstName,
      seller_last_name: dto.lastName,
      seller_social_id: dto.socialId,
      seller_birthdate: dto.birthdate,
      seller_social_id_issued: dto.socialIdIssued,
      seller_gender: dto.gender,
      seller_email: dto.email,
      seller_phone: dto.phone,
      seller_bank_code: dto.bankCode,
      seller_bank_branch: dto.bankBranch,
      seller_bank_account_number: dto.bankAccountNumber,
      seller_description: dto.description,
      seller_site_url: dto.siteUrl,
      seller_person_business_type: dto.businessType,
      seller_inc: dto.incorporationType,
      seller_merchant_name: dto.businessName,
      seller_address_city: dto.addressCity,
      seller_address_street: dto.addressStreet,
      seller_address_street_number: dto.addressStreetNumber,
      seller_address_country: dto.addressCountry ?? 'IL',
      // The marketplace's commission on this seller's sales.
      market_fee: plan.marketFee,
      // Card-not-present: this is an online marketplace.
      seller_retail_type: 1,
      // English error messages. Default is Hebrew.
      language: 'en',
    };

    if (dto.incorporationType !== 1) {
      request.seller_inc_code = dto.businessCode;
    }

    // Only send `seller_plan` when the plan actually declares one — an unknown
    // value is rejected outright, and the field is optional.
    if (plan.paymeSellerPlan) {
      request.seller_plan = plan.paymeSellerPlan;
    }

    // NOTE: `seller_id` (your own correlation id) is deliberately not sent.
    // It is documented as optional, but some partner plans reject it with
    // error 790 "A parameter is missing or cannot be set on this plan". We
    // correlate on `seller_payme_id` instead, which always works. If your
    // account allows it, adding seller_id here makes reconciliation easier.

    const response = await this.payme.request<CreateSellerResponse>(
      environment,
      'create-seller',
      request,
    );

    const seller = await this.sellers.save(
      this.sellers.create({
        userId,
        paymeId: response.seller_payme_id,
        paymeSecret: response.seller_payme_secret ?? null,
        paymePublicKey: response.seller_public_key?.uuid ?? null,
        signupLink: response.seller_dashboard_signup_link ?? null,
        planId: plan.id,
        marketFee: plan.marketFee.toFixed(2),
        businessName: dto.businessName,
        approved: false,
        active: true,
      }),
    );

    await this.auth.promoteToSeller(userId);
    this.logger.log(
      `Created PayMe seller ${response.seller_payme_id} for user ${userId} on plan ${plan.id}`,
    );

    return seller;
  }

  async findByUser(userId: string): Promise<Seller | null> {
    return this.sellers.findOneBy({ userId });
  }

  async findByPaymeId(paymeId: string): Promise<Seller | null> {
    return this.sellers.findOneBy({ paymeId });
  }

  async listAll(): Promise<Seller[]> {
    return this.sellers.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** The caller's own seller, or 403/404 — used by every seller-scoped route. */
  async requireOwnSeller(userId: string): Promise<Seller> {
    const seller = await this.findByUser(userId);
    if (!seller) {
      throw new NotFoundException(
        'You do not have a PayMe seller yet. Create one from the "Sell on the marketplace" page.',
      );
    }
    return seller;
  }

  async requireSellerOwnedBy(
    sellerId: string,
    userId: string,
  ): Promise<Seller> {
    const seller = await this.sellers.findOneBy({ id: sellerId });
    if (!seller) throw new NotFoundException('Seller not found');
    if (seller.userId !== userId) {
      throw new ForbiddenException('That seller belongs to another user');
    }
    return seller;
  }

  /**
   * Re-fetch a seller's public key from PayMe.
   *
   * GET /sellers/{mpl}/public-keys, authenticated with the `PayMe-Partner-Key`
   * HEADER rather than a `payme_client_key` body field — one of a handful of
   * REST-shaped endpoints in an otherwise RPC-shaped API. Useful when the key
   * from create-seller was lost, or after it was rotated.
   */
  async fetchPublicKey(seller: Seller): Promise<string | null> {
    const { clientKey, environment } = await this.settings.get();

    const response = await this.payme.request<SellerPublicKeysResponse>(
      environment,
      `sellers/${seller.paymeId}/public-keys`,
      undefined,
      { method: 'GET', headers: { 'PayMe-Partner-Key': clientKey } },
    );

    const uuid = response.items?.[0]?.uuid ?? null;
    if (uuid && uuid !== seller.paymePublicKey) {
      seller.paymePublicKey = uuid;
      await this.sellers.save(seller);
    }
    return uuid;
  }

  /**
   * Create a buyer token through the partner-scoped endpoint.
   *
   *   POST /api/sellers/{marketplace_mpl}/tokens
   *
   * The `{mpl}` in the path is YOUR MARKETPLACE's MPL, not the seller's. That
   * is the point of this endpoint: the resulting token belongs to the
   * marketplace, so it can be charged later on behalf of any of your sellers,
   * instead of being locked to the one seller who happened to capture it.
   *
   * The body is the JSAPI-shaped `{ payment: { method, ... } }` rather than the
   * flat snake_case of the older endpoints. Pass `sale_orig` with a
   * `payme_sale_id` to bind the token to an already-generated sale, and the
   * response carries a `redirect_url` to complete it.
   *
   * The response is a resource, not PayMe's usual envelope — hence rawEnvelope.
   */
  async createBuyerToken(
    payload: SellerTokenRequest,
  ): Promise<SellerTokenResponse> {
    const { environment, marketplaceMpl, clientKey } =
      await this.settings.get();
    if (!marketplaceMpl) {
      throw new BadRequestException(
        'No marketplace MPL configured. Set it on the Settings page — this endpoint is scoped to your own MPL, not a seller’s.',
      );
    }

    return this.payme.request<SellerTokenResponse>(
      environment,
      `sellers/${marketplaceMpl}/tokens`,
      payload,
      { rawEnvelope: true, headers: { 'PayMe-Partner-Key': clientKey } },
    );
  }

  /**
   * Fetch live seller state — approval, fees and wallet balances — from PayMe.
   *
   * There is no dedicated "get balance" endpoint for a seller's wallet: the
   * balance arrives as `seller_wallets` on get-sellers, keyed by currency.
   *   wallet_total      everything in the wallet, in minor units
   *   wallet_releasable the part past its release date, i.e. withdrawable now
   * The gap between them is money from sales still inside PayMe's clearing
   * window. Approval does not enter into this figure: `wallet_releasable`
   * recalculates as sales clear whether or not the seller's documents have
   * been verified. It is `withdraw-balance` that PayMe refuses until then.
   */
  async fetchFromPayMe(paymeIds: string[]): Promise<PayMeSellerSummary[]> {
    if (!paymeIds.length) return [];
    const { clientKey, environment } = await this.settings.get();

    const response = await this.payme.request<GetSellersResponse>(
      environment,
      'get-sellers',
      {
        payme_client_key: clientKey,
        // A partner may pass several ids to fetch a specific set of sellers.
        seller_payme_id: paymeIds.length === 1 ? paymeIds[0] : paymeIds,
        page_size: 500,
        page: 1,
      },
    );

    return response.items ?? [];
  }

  /** Seller detail plus the live PayMe view, with balances broken out. */
  async describe(seller: Seller) {
    let remote: PayMeSellerSummary | undefined;
    let remoteError: string | undefined;

    try {
      [remote] = await this.fetchFromPayMe([seller.paymeId]);
    } catch (error) {
      // A stale approval flag is a much better outcome than a page that will
      // not render because PayMe is briefly unreachable.
      remoteError = (error as Error).message;
      this.logger.warn(
        `Could not refresh seller ${seller.paymeId} from PayMe: ${remoteError}`,
      );
    }

    if (remote) {
      const approved = Boolean(remote.seller_approved);
      const active = Boolean(remote.seller_active);
      if (approved !== seller.approved || active !== seller.active) {
        seller.approved = approved;
        seller.active = active;
        await this.sellers.save(seller);
      }
    }

    return {
      id: seller.id,
      paymeId: seller.paymeId,
      publicKey: seller.paymePublicKey,
      signupLink: seller.signupLink,
      planId: seller.planId,
      marketFee: Number(seller.marketFee),
      businessName: seller.businessName,
      approved: seller.approved,
      active: seller.active,
      createdAt: seller.createdAt,
      balances: toBalances(remote),
      fees: remote?.seller_fees ?? null,
      currencies: remote?.seller_currencies ?? [],
      remoteError,
    };
  }
}

/** Flatten `seller_wallets` into a list the UI can render directly. */
function toBalances(remote?: PayMeSellerSummary) {
  if (!remote?.seller_wallets) return [];
  return Object.values(remote.seller_wallets).map((wallet) => ({
    currency: wallet.wallet_currency,
    /** Everything held for this seller, in minor units. */
    total: Number(wallet.wallet_total) || 0,
    /** The portion already released and withdrawable, in minor units. */
    releasable: Number(wallet.wallet_releasable) || 0,
    /** Still inside PayMe's clearing window. */
    pending:
      (Number(wallet.wallet_total) || 0) -
      (Number(wallet.wallet_releasable) || 0),
  }));
}
