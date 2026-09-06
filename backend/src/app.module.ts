import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { PayMeModule } from './payme/payme.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { SellersModule } from './sellers/sellers.module';
import { ProductsModule } from './products/products.module';
import { StoresModule } from './stores/stores.module';
import { SalesModule } from './sales/sales.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CallbacksModule } from './callbacks/callbacks.module';
import { AdminModule } from './admin/admin.module';

/**
 * marketplace-example — a worked PayMe integration.
 *
 * Reading order, if you are here to learn the integration:
 *   payme/payme.types.ts       the API surface, with PayMe's own field names
 *   payme/payme.client.ts      how a request is made and how failure is detected
 *   payme/payme-signature.ts   how callbacks are authenticated
 *   sellers/sellers.service.ts onboarding a seller (create-seller) and balances
 *   sales/sales.service.ts     the three payment flows, plus capture and refund
 *   callbacks/callbacks.service.ts  verify-then-act on inbound notifications
 *
 * The prose version of all of it is in docs/.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get<string>('DB_USERNAME', 'postgres'),
        password: cfg.get<string>('DB_PASSWORD', 'postgres'),
        database: cfg.get<string>('DB_NAME', 'marketplace-example'),
        autoLoadEntities: true,
        synchronize: cfg.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        logging: cfg.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),
    TerminusModule,

    // PayMe transport + credentials. Both @Global.
    PayMeModule,
    SettingsModule,

    AuthModule,
    SellersModule,
    ProductsModule,
    StoresModule,
    SalesModule,
    SubscriptionsModule,
    CallbacksModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
