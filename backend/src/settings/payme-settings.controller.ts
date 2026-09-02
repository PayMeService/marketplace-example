import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/user.entity';
import { PayMeSettingsService } from './payme-settings.service';
import { UpdatePayMeSettingsDto } from './dto/update-payme-settings.dto';

/**
 * Where the marketplace operator configures its PayMe credentials.
 *
 * Admin-only, and the client secret is never sent back to the browser — the
 * response reports only whether one is set. A secret that round-trips through a
 * settings form ends up in browser history, devtools and error reports.
 */
@Controller('settings/payme')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class PayMeSettingsController {
  constructor(private readonly settings: PayMeSettingsService) {}

  @Get()
  async get() {
    const s = await this.settings.get();
    return {
      environment: s.environment,
      clientKey: s.clientKey,
      marketplaceMpl: s.marketplaceMpl,
      publicBaseUrl: s.publicBaseUrl,
      publicAppUrl: s.publicAppUrl,
      // Write-only. The UI shows a "configured / not configured" badge.
      clientSecretConfigured: Boolean(s.clientSecret),
      callbacksReachable: await this.settings.callbacksReachable(),
      returnUrlsAccepted: await this.settings.returnUrlsAccepted(),
      apiBaseUrl:
        s.environment === 'production'
          ? 'https://live.payme.io/api/'
          : 'https://sandbox.payme.io/api/',
    };
  }

  @Put()
  async update(@Body() dto: UpdatePayMeSettingsDto) {
    await this.settings.update(dto);
    return this.get();
  }
}
