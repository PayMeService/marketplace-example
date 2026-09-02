import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayMeSettings } from './payme-settings.entity';
import { PayMeSettingsService } from './payme-settings.service';
import { PayMeSettingsController } from './payme-settings.controller';

/**
 * Global so every feature module can inject PayMeSettingsService without
 * re-importing — credentials are cross-cutting to the whole integration.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PayMeSettings])],
  controllers: [PayMeSettingsController],
  providers: [PayMeSettingsService],
  exports: [PayMeSettingsService],
})
export class SettingsModule {}
