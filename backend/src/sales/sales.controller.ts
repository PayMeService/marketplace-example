import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { SalesService } from './sales.service';
import { Sale } from './sale.entity';
import {
  BuyProductDto,
  CreateHostedFieldsSaleDto,
  CreateIframeSaleDto,
  DirectTokenSaleDto,
  PaySaleDto,
  RefundSaleDto,
} from './dto/sale.dto';

/**
 * One route per payment flow, so the three integrations stay legible side by
 * side rather than hiding behind a single polymorphic endpoint.
 */
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const sales = await this.sales.listForUser(user.sub);
    return sales.map(toView);
  }

  /** Cards previously tokenized on this seller's sales, ready to charge again. */
  @Get('tokens')
  listTokens(@CurrentUser() user: JwtPayload) {
    return this.sales.listSavedTokens(user.sub);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toView(await this.sales.findVisibleTo(id, user.sub));
  }

  /**
   * A buyer purchases a listed product.
   *
   * Open to any signed-in user, not just sellers: the seller is derived from
   * the listing. This is the flow an actual marketplace shopper takes.
   */
  @Post('buy/:productId')
  async buy(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: BuyProductDto,
  ) {
    return toView(
      await this.sales.buyProduct(user.sub, productId, {
        buyerName: dto.buyerName,
        buyerEmail: dto.buyerEmail,
      }),
    );
  }

  /** Flow 1 — hosted page. Response carries `saleUrl` for the iframe. */
  @Post('iframe')
  async createIframe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateIframeSaleDto,
  ) {
    return toView(await this.sales.createIframeSale(user.sub, dto));
  }

  /**
   * Flow 2, step 1 — reserve a sale for Hosted Fields.
   * Returns the seller's public key so the browser can open a tokenization
   * session against PayMe's vault.
   */
  @Post('hosted-fields')
  async createHostedFields(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateHostedFieldsSaleDto,
  ) {
    const { sale, publicKey } = await this.sales.createHostedFieldsSale(
      user.sub,
      dto,
    );
    return { ...toView(sale), publicKey };
  }

  /** Flow 2, step 2 — charge the token the browser produced. */
  @Post(':id/pay')
  async pay(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaySaleDto,
  ) {
    return toView(await this.sales.payExistingSale(user.sub, id, dto));
  }

  /** Flow 3 — create and charge in one call against a saved token. */
  @Post('charge-token')
  async chargeToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DirectTokenSaleDto,
  ) {
    return toView(await this.sales.chargeToken(user.sub, dto));
  }

  /** Settle an authorization (J5). */
  @Post(':id/capture')
  async capture(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toView(await this.sales.capture(user.sub, id));
  }

  /** Refund a completed sale, or release an uncaptured authorization. */
  @Post(':id/refund')
  async refund(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundSaleDto,
  ) {
    return toView(await this.sales.refund(user.sub, id, dto));
  }

  /** Look up the reusable token captured on a paid sale. */
  @Post(':id/buyer-key')
  async buyerKey(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { buyerKey: await this.sales.fetchBuyerKey(user.sub, id) };
  }
}

/**
 * The wire shape for a sale.
 *
 * `buyerKey` is deliberately absent: it is a bearer credential for the buyer's
 * card, and the entity marks it `select: false` so it does not appear here even
 * by accident. The dedicated token endpoints return it when it is genuinely
 * needed.
 */
function toView(sale: Sale) {
  return {
    id: sale.id,
    paymeSaleId: sale.paymeSaleId,
    paymeSaleCode: sale.paymeSaleCode,
    paymeTransactionId: sale.paymeTransactionId,
    saleUrl: sale.saleUrl,
    flow: sale.flow,
    saleType: sale.saleType,
    status: sale.status,
    priceMinor: sale.priceMinor,
    refundedMinor: sale.refundedMinor,
    currency: sale.currency,
    productName: sale.productName,
    buyerName: sale.buyerName,
    buyerEmail: sale.buyerEmail,
    buyerCardMask: sale.buyerCardMask,
    captureBuyerRequested: sale.captureBuyerRequested,
    capturedAt: sale.capturedAt,
    lastError: sale.lastError,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
}
