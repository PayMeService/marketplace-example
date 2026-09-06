import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartContext, type CartLine } from './cart-context';

/**
 * The buyer's cart.
 *
 * IT HOLDS PRODUCT IDS AND QUANTITIES, AND NOTHING ELSE. No prices, no seller,
 * no currency. Everything else is looked up from the listing at the moment it
 * is needed, which mirrors the rule the server already enforces: a price in the
 * request body is a price the buyer can edit. Keeping a price here would also
 * let a cart left open overnight pay yesterday's price.
 *
 * Persisted to localStorage so a refresh mid-shop does not empty it. A cart
 * that cannot be persisted still works for the session.
 */

const KEY = 'marketplace.cart';

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything could be in storage — another tab, an older build, a person with
    // devtools open. Only keep entries that still have the shape we expect.
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' &&
        line !== null &&
        typeof (line as CartLine).productId === 'string' &&
        Number.isInteger((line as CartLine).quantity) &&
        (line as CartLine).quantity > 0,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      // Private browsing; the cart still works for this session.
    }
  }, [lines]);

  const add = useCallback((productId: string, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (!existing) return [...current, { productId, quantity }];
      return current.map((line) =>
        line.productId === productId
          ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
          : line,
      );
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.min(99, quantity) }
              : line,
          ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      count: lines.reduce((total, line) => total + line.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
