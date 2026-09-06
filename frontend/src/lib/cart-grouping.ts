import type { Product } from './types';
import type { CartLine } from './cart-context';

export interface CartGroup {
  storeId: string;
  storeName: string;
  currency: string;
  totalMinor: number;
  lines: Array<{ product: Product; quantity: number }>;
}

/**
 * Group a cart exactly the way the server will charge it.
 *
 * The key is (store, currency), not store alone, because a PayMe sale carries
 * one `seller_payme_id` AND one `currency`. This mirrors SalesService.buyCart
 * deliberately: if the two ever disagree, the buyer is shown a total they are
 * not charged. Lines whose product is no longer in the catalogue are dropped —
 * the server refuses them too.
 */
export function groupByStore(lines: CartLine[], catalogue: Product[]): CartGroup[] {
  const byId = new Map(catalogue.map((product) => [product.id, product]));
  const groups = new Map<string, CartGroup>();

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;

    const storeId = product.storeId ?? 'unknown';
    const key = `${storeId}:${product.currency}`;
    const existing = groups.get(key);

    if (existing) {
      existing.lines.push({ product, quantity: line.quantity });
      existing.totalMinor += product.priceMinor * line.quantity;
    } else {
      groups.set(key, {
        storeId,
        storeName: product.seller ?? 'Unknown shop',
        currency: product.currency,
        totalMinor: product.priceMinor * line.quantity,
        lines: [{ product, quantity: line.quantity }],
      });
    }
  }

  return [...groups.values()];
}
