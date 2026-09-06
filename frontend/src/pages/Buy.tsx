import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { useAuth } from '../lib/auth-context';
import type { Product, Sale } from '../lib/types';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Money,
  Note,
  Sheet,
  Spinner,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

/**
 * A buyer purchasing a listing.
 *
 * This is the flow a real marketplace shopper takes, and it is the mirror image
 * of the seller-initiated checkouts: the buyer picks an item and never sees an
 * MPL. The server derives the seller from the listing, so the money lands in
 * that seller's wallet and THEIR `market_fee` applies.
 */
export function Buy() {
  const { productId } = useParams<{ productId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    data: product,
    error: loadError,
    loading,
  } = useLoader(
    async () =>
      (await get<Product[]>('/products')).find((item) => item.id === productId) ?? null,
    productId,
  );

  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function startCheckout() {
    if (!productId) return;
    setError(null);
    setBusy(true);
    try {
      setSale(
        await post<Sale>(`/sales/buy/${productId}`, {
          buyerName: user ? `${user.firstName} ${user.lastName}` : undefined,
          buyerEmail: user?.email,
        }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <EmptyState title="Sign in to buy">
        You need an account to complete a purchase.
        <div className="mt-4">
          <Button onClick={() => navigate('/login')}>Sign in</Button>
        </div>
      </EmptyState>
    );
  }

  if (loading) return <Spinner label="Loading listing" />;

  return (
    <div className="mx-auto max-w-[64rem] space-y-6">
      <Link to="/" className="text-[13px] text-pen underline underline-offset-2">
        Back to the storefront
      </Link>

      <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <ErrorBanner error={loadError ?? error} />

          {product && (
            <div>
              <h1 className="font-serif text-[1.75rem] leading-tight tracking-[-0.015em] text-ink">
                {product.name}
              </h1>
              <div className="mt-3">
                <Money
                  minor={product.priceMinor}
                  currency={product.currency}
                  size="xl"
                  minorUnits
                />
              </div>
              {product.description && (
                <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
                  {product.description}
                </p>
              )}
              {product.seller && (
                <p className="mt-4 border-t border-rule pt-3 text-[13px] text-ink-soft">
                  Sold by <span className="text-ink">{product.seller}</span>
                </p>
              )}

              {!sale && (
                <Button
                  className="mt-5 w-full"
                  loading={busy}
                  onClick={startCheckout}
                  disabled={!product}
                >
                  Buy now
                </Button>
              )}
            </div>
          )}

          <Note title="What happens when you press Buy">
            <p>
              The server looks up who listed this item, finds their PayMe seller,
              and calls <Code>generate-sale</Code> against <em>their</em> MPL
              with <Code>sale_payment_method: &quot;multi&quot;</Code>. The money
              goes to that seller&#8217;s wallet, less the marketplace&#8217;s{' '}
              <Code>market_fee</Code>.
            </p>
            <p>
              You never see or choose an MPL. That routing is the
              marketplace&#8217;s job, and it is the part of a marketplace
              integration that has no equivalent in a single-merchant one.
            </p>
          </Note>
        </div>

        <Sheet
          title="Payment"
          description={sale?.saleUrl ?? 'PayMe’s payment page appears here once the sale exists.'}
          actions={sale && <SaleStatusBadge status={sale.status} />}
        >
          {!sale && (
            <EmptyState title="No sale yet">
              Press Buy now to create it. Nothing is charged until you complete
              PayMe&#8217;s form.
            </EmptyState>
          )}
          {sale?.saleUrl && (
            <div className="space-y-3">
              <Note>
                <p>
                  Sandbox card <Code>5326105300985846</Code>, expiry{' '}
                  <Code>12/30</Code>, CVV <Code>658</Code>, social ID{' '}
                  <Code>008336174</Code>.
                </p>
              </Note>
              <iframe
                title="PayMe payment page"
                src={sale.saleUrl}
                className="h-[640px] w-full rounded-[3px] border border-rule bg-white"
              />
            </div>
          )}
        </Sheet>
      </div>
    </div>
  );
}
