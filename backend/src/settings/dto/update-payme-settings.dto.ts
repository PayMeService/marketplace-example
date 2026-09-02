import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePayMeSettingsDto {
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: string;

  /** PayMe Partner Key. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientKey?: string;

  /** PayMe partner secret — used only to verify callback signatures. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientSecret?: string;

  /** Your marketplace's MPL (the "API identifier" PayMe issued you). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  marketplaceMpl?: string;

  /** Public base URL of the API, as PayMe's servers reach it. Callbacks use this. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicBaseUrl?: string;

  /** Public base URL of the browser app. Buyer return urls use this. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicAppUrl?: string;
}
