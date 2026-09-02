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
import {
  PAYME_MIN_AMOUNT_MINOR,
  SUPPORTED_CURRENCIES,
} from '../../common/money';
import { IterationType } from '../subscription.entity';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  /** Price of ONE iteration, in minor units. PayMe's minimum of 500 applies. */
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR)
  priceMinor: number;

  @IsIn([...SUPPORTED_CURRENCIES])
  currency: string;

  /** 1 daily, 2 weekly, 3 monthly, 4 annually. */
  @IsIn([
    IterationType.Daily,
    IterationType.Weekly,
    IterationType.Monthly,
    IterationType.Annually,
  ])
  iterationType: number;

  /** How many iterations to run. -1 runs until cancelled. */
  @IsInt()
  @Min(-1)
  iterations: number;

  /** dd/mm/yyyy. Defaults to today on PayMe's side when omitted. */
  @IsOptional()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'startDate must be dd/mm/yyyy' })
  startDate?: string;

  /**
   * Activate immediately against an existing buyer token instead of returning
   * a page for the buyer to fill in. With this set, no `sub_url` comes back.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  buyerKey?: string;

  @IsOptional()
  @IsIn(['he', 'en'])
  language?: string;
}

export class UpdateSubscriptionPriceDto {
  /** New per-iteration price, in minor units. */
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR)
  priceMinor: number;
}
