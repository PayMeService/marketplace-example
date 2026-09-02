import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAYME_MIN_AMOUNT_MINOR,
  SUPPORTED_CURRENCIES,
} from '../../common/money';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /**
   * Price in MINOR UNITS (agorot/cents), not shekels. 5075 = 50.75.
   * PayMe refuses to create a sale below 500.
   */
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR, {
    message: `Price must be at least ${PAYME_MIN_AMOUNT_MINOR} minor units (5.00) — PayMe rejects smaller sales`,
  })
  priceMinor: number;

  @IsIn([...SUPPORTED_CURRENCIES])
  currency: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(PAYME_MIN_AMOUNT_MINOR)
  priceMinor?: number;

  @IsOptional()
  @IsIn([...SUPPORTED_CURRENCIES])
  currency?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
