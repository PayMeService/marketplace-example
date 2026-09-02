import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * What the marketplace asks a user in order to open a PayMe seller for them.
 *
 * These map onto create-seller's required fields. PayMe validates them
 * server-side and its messages are good, but catching format problems here
 * saves a round trip — particularly the date format, which is dd/mm/yyyy and
 * not ISO, and is the single most common create-seller rejection.
 */
export class CreateSellerDto {
  /** One of SELLER_PLANS. Determines the market_fee sent to PayMe. */
  @IsString()
  @IsNotEmpty()
  planId: string;

  // --- The person behind the business ---

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;

  /** Israeli teudat zehut. Use 9999999999 in sandbox. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  socialId: string;

  /** dd/mm/yyyy — PayMe rejects ISO dates. */
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'birthdate must be dd/mm/yyyy' })
  birthdate: string;

  /** dd/mm/yyyy — when the social ID document was issued. */
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'socialIdIssued must be dd/mm/yyyy',
  })
  socialIdIssued: string;

  /** 0 = male, 1 = female. PayMe's enum, not ours. */
  @IsInt()
  @IsIn([0, 1])
  gender: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  phone: string;

  // --- The business ---

  /**
   * Incorporation type. 1 Individual, 2 Sole Proprietorship (עוסק מורשה),
   * 3 Incorporated Company, 5 Exempt (עוסק פטור), 6 Non-profit.
   */
  @IsInt()
  incorporationType: number;

  /**
   * Business number (ח.פ / ע.מ). Required unless incorporationType is 1.
   *
   * For Sole Proprietorship and Exempt dealers PayMe enforces that this equals
   * the owner's social ID, and rejects the request otherwise.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  businessCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  businessName: string;

  /** PayMe MCC. See the Israeli MCC list in PayMe's guides. 10114 is generic retail. */
  @IsInt()
  @Min(1)
  businessType: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  siteUrl: string;

  // --- Bank account (payouts land here) ---

  /** Israeli bank code. 54 works in sandbox. */
  @IsInt()
  bankCode: number;

  @IsInt()
  bankBranch: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  bankAccountNumber: string;

  // --- Address ---

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  addressCity: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressStreet: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  addressStreetNumber: string;

  /** ISO 3166 alpha-2. */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  addressCountry?: string;
}
