import { createContext, useContext } from 'react';

/** One line of the cart. Quantities only — never a price. */
export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** Total units, for the badge in the header. */
  count: number;
  add(productId: string, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
}

/**
 * Split from cart.tsx so that file exports only the provider component — see
 * the same note in auth-context.ts.
 */
export const CartContext = createContext<CartState | null>(null);

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
