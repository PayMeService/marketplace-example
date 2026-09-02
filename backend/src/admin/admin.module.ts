import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayMeModule } from '../payme/payme.module';
import { SellersModule } from '../sellers/sellers.module';
import { Seller } from '../sellers/seller.entity';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Seller]), PayMeModule, SellersModule],
  controllers: [AdminController],
})
export class AdminModule {}
