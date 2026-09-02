import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesModule } from '../sales/sales.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SellersModule } from '../sellers/sellers.module';
import { CallbackEvent } from './callback-event.entity';
import { CallbacksService } from './callbacks.service';
import { CallbacksController } from './callbacks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallbackEvent]),
    SalesModule,
    SubscriptionsModule,
    SellersModule,
  ],
  controllers: [CallbacksController],
  providers: [CallbacksService],
  exports: [CallbacksService],
})
export class CallbacksModule {}
