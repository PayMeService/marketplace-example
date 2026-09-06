import { Module } from '@nestjs/common';
import { SellersModule } from '../sellers/sellers.module';
import { ProductsModule } from '../products/products.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

/** Owns no tables of its own — a store is a seller plus that owner's listings. */
@Module({
  imports: [SellersModule, ProductsModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
