import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayMeEnvironment } from '../payme/payme.client';
import { PayMeSettings } from './payme-settings.entity';
import { UpdatePayMeSettingsDto } from './dto/update-payme-settings.dto';

export interface ResolvedPayMeSettings {
  environment: PayMeEnvironment;
  clientKey: string;
  clientSecret: string;
  marketplaceMpl: string;
  /** API origin — callbacks are built from this. */
  publicBaseUrl: string;
  /** Browser origin — buyer return urls are built from this. */
  publicAppUrl: string;
}

@Injectable()
export class PayMeSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PayMeSettingsService.name);

  constructor(
    @InjectRepository(PayMeSettings)
    private readonly repo: Repository<PayMeSettings>,
    private readonly config: ConfigService,
  ) {}

  /** Seed the singleton row from the environment on first boot. */
  async onModuleInit(): Promise<void> {
    const existing = await this.repo.findOneBy({ id: 1 });
    if (existing) return;

    await this.repo.save(
      this.repo.create({
        id: 1,
        environment: this.config.get<string>('PAYME_ENV', 'sandbox'),
        clientKey: this.config.get<string>('PAYME_CLIENT_KEY', ''),
        clientSecret: this.config.get<string>('PAYME_CLIENT_SECRET', ''),
        marketplaceMpl: this.config.get<string>('PAYME_MARKETPLACE_MPL', ''),
        publicBaseUrl: this.config.get<string>(
          'PUBLIC_BASE_URL',
          'http://localhost:3000',
        ),
        publicAppUrl: this.config.get<string>(
          'PUBLIC_APP_URL',
          this.config.get<string>('PUBLIC_BASE_URL', 'http://localhost:5173'),
        ),
      }),
    );
    this.logger.log('Seeded PayMe settings from environment');
  }

  async get(): Promise<ResolvedPayMeSettings> {
    const row = await this.repo.findOneBy({ id: 1 });
    return {
      environment: row?.environment === 'production' ? 'production' : 'sandbox',
      clientKey: row?.clientKey ?? '',
      clientSecret: row?.clientSecret ?? '',
      marketplaceMpl: row?.marketplaceMpl ?? '',
      publicBaseUrl: row?.publicBaseUrl ?? '',
      // Fall back to the API origin: in production they are the same host.
      publicAppUrl: row?.publicAppUrl || (row?.publicBaseUrl ?? ''),
    };
  }

  async update(dto: UpdatePayMeSettingsDto): Promise<ResolvedPayMeSettings> {
    const row =
      (await this.repo.findOneBy({ id: 1 })) ?? this.repo.create({ id: 1 });
    Object.assign(row, dto);
    await this.repo.save(row);
    this.logger.log(
      `PayMe settings updated (environment=${row.environment}, clientKey set=${Boolean(row.clientKey)}, clientSecret set=${Boolean(row.clientSecret)})`,
    );
    return this.get();
  }

  /**
   * Build a callback URL for PayMe to POST to (`sale_callback_url`,
   * `sub_callback_url`).
   *
   * Returns undefined when the API base URL is a localhost address — see the
   * note on returnUrl() below for why that matters so much.
   */
  async callbackUrl(path: string): Promise<string | undefined> {
    const { publicBaseUrl } = await this.get();
    if (!publicBaseUrl || isLocal(publicBaseUrl)) return undefined;
    const prefix = this.config.get<string>('API_PREFIX', 'api');
    return `${publicBaseUrl.replace(/\/+$/, '')}/${prefix}/${path.replace(/^\/+/, '')}`;
  }

  /**
   * Build a buyer-facing return URL (`sale_return_url`, `sub_return_url`) —
   * where PayMe's hosted page sends the browser after payment.
   *
   * ALSO omitted for localhost, and this is the non-obvious part: you might
   * reason that a return URL is only ever followed by the buyer's own browser,
   * so localhost should be fine. It is not. PayMe validates BOTH url fields at
   * request time and rejects the whole call:
   *
   *   status_error_code 21 — "Please verify URL validity"
   *   status_additional_info: "http://localhost:5173/checkout/return?saleId=…"
   *
   * So a localhost return URL does not merely break the redirect, it stops
   * generate-sale from creating the sale at all. Omitting it makes PayMe fall
   * back to the return URL configured on the merchant's account, which is the
   * degradation you want in development.
   */
  async returnUrl(path: string): Promise<string | undefined> {
    const { publicAppUrl } = await this.get();
    if (!publicAppUrl || isLocal(publicAppUrl)) return undefined;
    return `${publicAppUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  /** True when PayMe can POST callbacks to this app (i.e. not localhost). */
  async callbacksReachable(): Promise<boolean> {
    const { publicBaseUrl } = await this.get();
    return Boolean(publicBaseUrl) && !isLocal(publicBaseUrl);
  }

  /** True when PayMe will accept our return URL (i.e. not localhost). */
  async returnUrlsAccepted(): Promise<boolean> {
    const { publicAppUrl } = await this.get();
    return Boolean(publicAppUrl) && !isLocal(publicAppUrl);
  }
}

function isLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return true;
  }
}
