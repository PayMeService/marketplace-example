import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { StoresService } from './stores.service';

/**
 * Public. "Public" in this codebase means simply not declaring
 * `@UseGuards(JwtAuthGuard)` — there is no global guard to opt out of.
 *
 * A shopper must be able to browse shops before signing up, so nothing here
 * requires a token. Everything it returns is already visible on the storefront.
 */
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list() {
    return this.stores.list();
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const store = await this.stores.get(id);
    return {
      ...store,
      products: store.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceMinor: product.priceMinor,
        currency: product.currency,
        storeId: product.ownerId,
        seller: store.name,
        createdAt: product.createdAt,
      })),
    };
  }
}
