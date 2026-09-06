import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { useAuth } from '../lib/auth-context';
import { useCart } from '../lib/cart-context';
import type { Product, Sale } from '../lib/types';
import { productImageUrl, storeAvatarUrl } from '../lib/dicebear';
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
 * One listing, and the two ways to buy it.
 *
 * "Buy now" is the mirror image of the seller-initiated checkouts: the buyer
 * picks an item and never sees an MPL. The server derives the seller from the
 * listing, so the money lands in that seller's wallet and THEIR `market_fee`
 * applies. "Add to cart" defers the same decision until checkout, where several
 * of them may have to become several sales.
 */
export function Buy() {
  const { productId } = useParams<{ productId: string }>();
  const { user } = useAuth();
  const { add, lines } = useCart();
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

  const inCart = lines.find((line) => line.productId === productId);

  async function buyNow() {
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

  if (loading) return <Spinner label="Loading listing" />;
  if (!product) {
    return (
      <EmptyState title="No such listing">
        It may have been delisted.{' '}
        <Link to="/stores" className="underline underline-offset-2">
          Browse the shops
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-[68rem] space-y-10">
      <ErrorBanner error={loadError ?? error} />

      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div className="overflow-hidden rounded-3xl bg-ledger-alt">
          <img
            src={productImageUrl(product.id)}
            alt=""
            className="aspect-square w-full object-cover"
          />
        </div>

        <div>
          {product.storeId && (
            <Link
              to={`/store/${product.storeId}`}
              className="inline-flex items-center gap-2.5 rounded-full border border-rule bg-paper py-1.5 pl-1.5 pr-4 text-[13px] shadow-[0_2px_10px_rgba(16,22,25,0.05)] transition-transform hover:scale-[1.03]"
            >
              <img
                src={storeAvatarUrl(product.storeId)}
                alt=""
                className="size-8 rounded-full bg-ledger-alt"
              />
              {product.seller}
            </Link>
          )}

          <h1
            className="mt-5 text-ink"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.035em',
              fontWeight: 600,
            }}
          >
            {product.name}
          </h1>

          <div className="mt-5">
            <Money
              minor={product.priceMinor}
              currency={product.currency}
              size="xl"
              minorUnits
            />
          </div>

          {product.description && (
            <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
              {product.description}
            </p>
          )}

          {!user ? (
            <div className="mt-8">
              <Button onClick={() => navigate('/login')}>Sign in to buy</Button>
            </div>
          ) : (
            !sale && (
              <div className="mt-8 flex flex-wrap gap-3">
                <Button loading={busy} onClick={buyNow}>
                  Buy now
                </Button>
                <Button variant="secondary" onClick={() => add(product.id)}>
                  {inCart ? `In cart · ${inCart.quantity}` : 'Add to cart'}
                </Button>
              </div>
            )
          )}

          <div className="mt-8">
            <Note title="What happens when you press Buy now">
              <p>
                The server looks up who listed this item, finds their PayMe
                seller, and calls <Code>generate-sale</Code> against{' '}
                <em>their</em> MPL with{' '}
                <Code>sale_payment_method: &quot;multi&quot;</Code>. The money
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
        </div>
      </div>

      {sale && (
        <Sheet
          title="Payment"
          description={sale.saleUrl ?? undefined}
          actions={<SaleStatusBadge status={sale.status} />}
        >
          <div className="space-y-4">
            <Note>
              <p>
                Sandbox card <Code>5326105300985846</Code>, expiry{' '}
                <Code>12/30</Code>, CVV <Code>658</Code>, social ID{' '}
                <Code>008336174</Code>.
              </p>
            </Note>
            {sale.saleUrl && (
              <iframe
                title="PayMe payment page"
                src={sale.saleUrl}
                className="h-[640px] w-full rounded-xl border border-rule bg-white"
              />
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
