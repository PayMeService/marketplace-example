import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { useAuth } from '../lib/auth-context';
import { useCart } from '../lib/cart-context';
import { groupByStore } from '../lib/cart-grouping';
import type { Product, Sale } from '../lib/types';
import { storeAvatarUrl } from '../lib/dicebear';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Money,
  Note,
  Page,
  Sheet,
  Spinner,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

/**
 * The buyer's checkout, and the most instructive screen in the app.
 *
 * One panel per shop, each with its own PayMe payment page, because each sale
 * pays one seller's wallet. Nothing else in the marketplace makes that visible;
 * a single-merchant integration has no equivalent screen at all.
 */
export function BuyerCheckout() {
  const { user } = useAuth();
  const { lines, clear } = useCart();
  const navigate = useNavigate();

  const { data: catalogue, loading } = useLoader(() => get<Product[]>('/products'));
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const groups = groupByStore(lines, catalogue ?? []);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const created = await post<Sale[]>('/sales/cart', {
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        buyerName: user ? `${user.firstName} ${user.lastName}` : undefined,
        buyerEmail: user?.email,
      });
      setSales(created);
      // The sales exist now; leaving the cart filled would let a reload create
      // a second set of them.
      clear();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading your cart" />;

  if (!sales && groups.length === 0) {
    return (
      <EmptyState title="Nothing to check out">
        <Link to="/stores" className="underline underline-offset-2">
          Browse the shops
        </Link>{' '}
        and add something to your cart.
      </EmptyState>
    );
  }

  return (
    <Page
      title="Checkout"
      lede={
        sales
          ? sales.length > 1
            ? `${sales.length} payment pages, one per shop. Each is a separate PayMe sale against a different seller_payme_id.`
            : 'Your payment page, served by PayMe.'
          : groups.length > 1
            ? `Paying ${groups.length} shops. That is ${groups.length} sales, because a PayMe sale settles into exactly one wallet.`
            : 'One shop, one sale.'
      }
      actions={
        !sales && (
          <Button loading={busy} onClick={pay}>
            {groups.length > 1 ? `Create ${groups.length} payments` : 'Continue to payment'}
          </Button>
        )
      }
    >
      <ErrorBanner error={error} />

      {!sales && (
        <>
          <Note title="What the server is about to do">
            <p>
              It groups your cart by <Code>(seller, currency)</Code>, sums each
              group in minor units, and calls <Code>generate-sale</Code> once per
              group against that seller&#8217;s own MPL. Prices come from the
              listings, never from this page.
            </p>
          </Note>

          <div className="grid gap-5 sm:grid-cols-2">
            {groups.map((group) => (
              <Sheet
                key={group.storeId}
                title={
                  <span className="flex items-center gap-2.5">
                    <img
                      src={storeAvatarUrl(group.storeId)}
                      alt=""
                      className="size-8 rounded-full bg-ledger-alt"
                    />
                    {group.storeName}
                  </span>
                }
                description={`${group.lines.length} item${group.lines.length > 1 ? 's' : ''} · one sale`}
              >
                <ul className="space-y-1.5 text-[13px] text-ink-soft">
                  {group.lines.map(({ product, quantity }) => (
                    <li key={product.id} className="flex justify-between gap-4">
                      <span className="truncate">
                        {quantity > 1 && `${quantity} × `}
                        {product.name}
                      </span>
                      <span className="tabular shrink-0 font-mono">
                        {(product.priceMinor * quantity) / 100}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-rule pt-3">
                  <Money
                    minor={group.totalMinor}
                    currency={group.currency}
                    size="lg"
                    minorUnits
                  />
                </div>
              </Sheet>
            ))}
          </div>
        </>
      )}

      {sales?.map((sale, index) => (
        <Sheet
          key={sale.id}
          title={`Payment ${index + 1} of ${sales.length} — ${sale.productName}`}
          description={sale.saleUrl ?? undefined}
          actions={<SaleStatusBadge status={sale.status} />}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Money minor={sale.priceMinor} currency={sale.currency} size="lg" minorUnits />
            <span className="break-all font-mono text-[11px] text-ink-faint">
              {sale.paymeSaleId}
            </span>
          </div>
          {sale.saleUrl && (
            <iframe
              title={`PayMe payment page ${index + 1}`}
              src={sale.saleUrl}
              className="h-[620px] w-full rounded-xl border border-rule bg-white"
            />
          )}
        </Sheet>
      ))}

      {sales && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/stores')}>
            Keep shopping
          </Button>
        </div>
      )}
    </Page>
  );
}
