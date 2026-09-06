import { Injectable, NotFoundException } from '@nestjs/common';
import { SellersService } from '../sellers/sellers.service';
import { ProductsService } from '../products/products.service';
import { Seller } from '../sellers/seller.entity';
import { Product } from '../products/product.entity';

/**
 * Shops, as a shopper sees them.
 *
 * A "store" is a user who has opened a PayMe seller account, and its id is that
 * USER's id — the same value `GET /products` returns as `storeId` — rather than
 * the seller row's id or the MPL. That keeps the join on the client trivial and
 * keeps PayMe identifiers off an unauthenticated page entirely.
 *
 * The projection here is written from scratch rather than reusing
 * SellersService.describe(): that one exposes `paymeId`, `publicKey` and
 * `signupLink`, none of which belong in a public response.
 */
export interface StoreView {
  id: string;
  name: string;
  owner: string | null;
  /** PayMe has verified this seller's documents. Never gate buying on it. */
  approved: boolean;
  currencies: string[];
  productCount: number;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
  ) {}

  async list(): Promise<StoreView[]> {
    const [sellers, products] = await Promise.all([
      this.sellers.listAll(),
      this.products.listActive(),
    ]);

    // One pass over the catalogue rather than a query per store.
    const byOwner = new Map<string, Product[]>();
    for (const product of products) {
      const existing = byOwner.get(product.ownerId);
      if (existing) existing.push(product);
      else byOwner.set(product.ownerId, [product]);
    }

    return (
      sellers
        .map((seller) =>
          this.describe(seller, byOwner.get(seller.userId) ?? []),
        )
        // A shop with nothing on its shelves is not worth a card in a directory.
        .filter((store) => store.productCount > 0)
    );
  }

  async get(storeId: string): Promise<StoreView & { products: Product[] }> {
    const seller = await this.sellers.findByUser(storeId);
    if (!seller) {
      throw new NotFoundException('No shop here.');
    }

    const products = await this.products.listActiveByOwner(storeId);
    return { ...this.describe(seller, products), products };
  }

  private describe(seller: Seller, products: Product[]): StoreView {
    return {
      id: seller.userId,
      name: seller.businessName,
      owner: seller.user
        ? `${seller.user.firstName} ${seller.user.lastName}`
        : null,
      approved: seller.approved,
      currencies: [...new Set(products.map((product) => product.currency))],
      productCount: products.length,
    };
  }
}
