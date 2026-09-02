import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { PayMeClient } from '../payme/payme.client';
import { PayMeEnvelope } from '../payme/payme.types';
import { PayMeSettingsService } from '../settings/payme-settings.service';
import { SellersService } from '../sellers/sellers.service';
import { Seller } from '../sellers/seller.entity';

class UpdateMarketFeeDto {
  /** New marketplace commission percent. PayMe allows 0.00–60.00. */
  @IsNumber()
  @Min(0)
  @Max(60)
  marketFee: number;
}

class WithdrawDto {
  @IsOptional()
  @IsIn(['ILS', 'USD', 'EUR'])
  currency?: string;
}

/**
 * Marketplace operator tools.
 *
 * Everything here is partner-scoped: these calls act with the marketplace's own
 * partner key across all sellers, which is exactly why they are locked to the
 * admin role.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class AdminController {
  constructor(
    @InjectRepository(Seller) private readonly sellerRepo: Repository<Seller>,
    private readonly sellers: SellersService,
    private readonly payme: PayMeClient,
    private readonly settings: PayMeSettingsService,
  ) {}

  /**
   * Every seller, joined with their live PayMe state.
   *
   * One get-sellers call covers the whole list — a partner may pass an array of
   * `seller_payme_id`. Doing it per row would be N round trips for a page that
   * renders once.
   */
  @Get('sellers')
  async listSellers() {
    const local = await this.sellers.listAll();
    if (!local.length) return [];

    let remoteById = new Map<string, Record<string, unknown>>();
    let remoteError: string | undefined;

    try {
      const remote = await this.sellers.fetchFromPayMe(
        local.map((seller) => seller.paymeId),
      );
      remoteById = new Map(
        remote.map((item) => [
          item.seller_payme_id,
          item as unknown as Record<string, unknown>,
        ]),
      );
    } catch (error) {
      remoteError = (error as Error).message;
    }

    return local.map((seller) => {
      const remote = remoteById.get(seller.paymeId) as
        | {
            seller_approved?: boolean;
            seller_active?: boolean;
            seller_wallets?: Record<
              string,
              {
                wallet_currency: string;
                wallet_total: number;
                wallet_releasable: number;
              }
            >;
            seller_fees?: Record<string, string>;
          }
        | undefined;

      return {
        id: seller.id,
        paymeId: seller.paymeId,
        businessName: seller.businessName,
        planId: seller.planId,
        marketFee: Number(seller.marketFee),
        publicKey: seller.paymePublicKey,
        signupLink: seller.signupLink,
        createdAt: seller.createdAt,
        owner: seller.user
          ? {
              id: seller.user.id,
              email: seller.user.email,
              name: `${seller.user.firstName} ${seller.user.lastName}`,
            }
          : null,
        approved: remote?.seller_approved ?? seller.approved,
        active: remote?.seller_active ?? seller.active,
        balances: Object.values(remote?.seller_wallets ?? {}).map((wallet) => ({
          currency: wallet.wallet_currency,
          total: Number(wallet.wallet_total) || 0,
          releasable: Number(wallet.wallet_releasable) || 0,
        })),
        fees: remote?.seller_fees ?? null,
        /** True when this row could not be refreshed from PayMe. */
        stale: !remote,
        remoteError,
      };
    });
  }

  /** Pull one seller's current state from PayMe. */
  @Post('sellers/:id/refresh')
  async refresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.sellers.describe(await this.requireSeller(id));
  }

  /** Re-fetch a seller's public key (for Hosted Fields) from PayMe. */
  @Post('sellers/:id/public-key/refresh')
  async refreshPublicKey(@Param('id', ParseUUIDPipe) id: string) {
    const seller = await this.requireSeller(id);
    return { publicKey: await this.sellers.fetchPublicKey(seller) };
  }

  /**
   * Change the marketplace's commission on a seller.
   *
   * update-seller carries the same field names as create-seller; sending only
   * `market_fee` alongside the identifying fields leaves everything else alone.
   * The change applies to sales created from now on — sales already generated
   * keep the fee they were created with.
   */
  @Post('sellers/:id/market-fee')
  async updateMarketFee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarketFeeDto,
  ) {
    const seller = await this.requireSeller(id);
    const { clientKey, environment } = await this.settings.get();

    await this.payme.request<PayMeEnvelope>(environment, 'update-seller', {
      payme_client_key: clientKey,
      seller_payme_id: seller.paymeId,
      market_fee: dto.marketFee,
      language: 'en',
    });

    seller.marketFee = dto.marketFee.toFixed(2);
    await this.sellerRepo.save(seller);
    return this.sellers.describe(seller);
  }

  /**
   * Ask PayMe to pay out a seller's releasable balance to their bank account.
   *
   * Only `wallet_releasable` moves — funds still inside the clearing window
   * stay put. PayMe also holds everything until the seller's three mandatory
   * documents (social ID, bank, corporate certificate) are verified, so this
   * fails for an unapproved seller no matter what the wallet shows.
   *
   * Completion arrives later as a `withdrawal-complete` callback.
   */
  @Post('sellers/:id/withdraw')
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithdrawDto,
  ) {
    const seller = await this.requireSeller(id);
    const { clientKey, environment } = await this.settings.get();

    if (!seller.approved) {
      throw new BadRequestException(
        'PayMe holds funds until the seller’s documents are verified. This seller is not approved yet, so a withdrawal will be refused.',
      );
    }

    const response = await this.payme.request<PayMeEnvelope>(
      environment,
      'withdraw-balance',
      {
        payme_client_key: clientKey,
        seller_payme_id: seller.paymeId,
        withdrawal_currency: dto.currency ?? 'ILS',
        language: 'en',
        // Omitting `transaction_ids` withdraws everything releasable. Pass an
        // array of transaction guids for a partial withdrawal.
      },
    );

    return { ok: response.status_code === 0, payme: response };
  }

  private async requireSeller(id: string): Promise<Seller> {
    const seller = await this.sellerRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    return seller;
  }
}
