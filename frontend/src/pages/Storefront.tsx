import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { Product } from '../lib/types';
import { Stepped } from './storefront/Stepped';

/**
 * The storefront.
 *
 * Supplies its own navigation rather than sitting inside the app shell, which
 * is why its route is declared outside <Layout> in App.tsx.
 */
export function Storefront() {
  const { data: products } = useLoader(() => get<Product[]>('/products'));
  return <Stepped products={products} />;
}
