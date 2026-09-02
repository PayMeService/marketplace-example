import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAYME_MIN_AMOUNT_MINOR,
  SUPPORTED_CURRENCIES,
} from '../../common/money';

/** Fields shared by every "start a sale" request, whatever the flow. */
export class CreateSaleBaseDto {
  /** Sell an existing product, or describe an ad-hoc charge below. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  productName?: string;

  /** Minor units. Ignored when productId is given — the product's price wins. */
  @IsOptional()
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR)
  priceMinor?: number;

  @IsOptional()
  @IsIn([...SUPPORTED_CURRENCIES])
  currency?: string;

  /**
   * "sale" charges immediately (J4).
   * "authorize" reserves the amount on the card for up to 168 hours and
   * settles only when you call capture (J5).
   */
  @IsOptional()
  @IsIn(['sale', 'authorize'])
  saleType?: string;

  /**
   * Installments. "1".."12" fixes the count; "103"/"106"/"109"/"112" lets the
   * buyer choose up to 3/6/9/12. A string, per PayMe.
   */
  @IsOptional()
  @Matches(/^(1[0-2]|[1-9]|10[369]|112)$/, {
    message:
      'installments must be 1-12, or 103/106/109/112 for a buyer-selectable range',
  })
  installments?: string;

  /** Also capture a reusable buyer token on this payment. */
  @IsOptional()
  @IsBoolean()
  captureBuyer?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyerName?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buyerPhone?: string;

  /** Payment page language: "he" (PayMe's default) or "en". */
  @IsOptional()
  @IsIn(['he', 'en'])
  language?: string;
}

/**
 * Start a sale to be paid on PayMe's hosted page (iframe or redirect).
 * The response carries `sale_url`.
 */
export class CreateIframeSaleDto extends CreateSaleBaseDto {
  /**
   * Payment method shown on the page. "credit-card" is the default;
   * "multi" shows every method the seller has enabled and lets the buyer pick.
   */
  @IsOptional()
  @IsIn([
    'credit-card',
    'multi',
    'bit',
    'paypal',
    'google-pay',
    'apple-pay',
    'bank-transfer',
  ])
  paymentMethod?: string;

  /** bit only: "dynamic" | "qr-sms" | "dynamic-loose". */
  @IsOptional()
  @IsIn(['dynamic', 'qr-sms', 'dynamic-loose'])
  layout?: string;
}

/**
 * Start a sale that will be paid with Hosted Fields.
 *
 * generate-sale runs on the server to reserve the sale; the browser then
 * tokenizes the card against PayMe's vault and posts the token back to
 * /sales/:id/pay. No card data reaches this server at any point.
 */
export class CreateHostedFieldsSaleDto extends CreateSaleBaseDto {}

/** Pay an existing sale with a token. Used by both Hosted Fields and Direct API. */
export class PaySaleDto {
  /**
   * The buyer token. From Hosted Fields tokenization (`tokenizationResult.token`),
   * from an earlier `capture_buyer` sale, or from POST /sellers/{mpl}/tokens.
   *
   * Note there is no card-data alternative here on purpose: accepting a raw PAN
   * would pull this server into PCI DSS scope. See docs/03-payment-flows.md.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  buyerKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyerName?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  buyerPhone?: string;

  @IsOptional()
  @Matches(/^(1[0-2]|[1-9]|10[369]|112)$/)
  installments?: string;
}

/** Charge a saved token directly, creating and paying a sale in one call. */
export class DirectTokenSaleDto extends CreateSaleBaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  buyerKey: string;
}

/** A buyer purchasing a listing. Price and seller both come from the product. */
export class BuyProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  buyerName?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;
}

export class RefundSaleDto {
  /** Minor units. Omit for a full refund. */
  @IsOptional()
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR)
  amountMinor?: number;
}
