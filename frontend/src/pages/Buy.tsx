import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api';
import { formatMoney } from '../lib/money';
import { useAuth } from '../lib/auth-context';
import type { Product, Sale } from '../lib/types';
import {
  Button,
  Card,
  Code,
  ErrorBanner,
  Note,
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

  const [product, setProduct] = useState<Product | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<Product[]>('/products')
      .then((products) => {
        setProduct(products.find((item) => item.id === productId) ?? null);
      })
      .catch(setError);
  }, [productId]);

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
      <Card title="Sign in to buy">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You need an account to complete a purchase.
        </p>
        <Button className="mt-4" onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </Card>
    );
  }

  if (!product && !error) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to the storefront
      </Link>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card title={product?.name ?? 'Product'}>
            {product && (
              <>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatMoney(product.priceMinor, product.currency)}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">
                  sale_price: {product.priceMinor} {product.currency}
                </p>
                {product.description && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    {product.description}
                  </p>
                )}
                {product.seller && (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Sold by <strong>{product.seller}</strong>
                  </p>
                )}
              </>
            )}

            <ErrorBanner error={error} />

            {!sale && (
              <Button
                className="mt-4 w-full"
                loading={busy}
                onClick={startCheckout}
                disabled={!product}
              >
                Buy now
              </Button>
            )}
          </Card>

          <Note title="What happens when you click">
            <p>
              The server looks up who listed this item, finds their PayMe seller,
              and calls <Code>generate-sale</Code> against{' '}
              <em>their</em> MPL with <Code>sale_payment_method: "multi"</Code>.
              The money goes to that seller's wallet, less the marketplace's{' '}
              <Code>market_fee</Code>.
            </p>
            <p>
              You never see or choose an MPL — that routing is the marketplace's
              job, and it is the part of a marketplace integration that has no
              equivalent in a single-merchant one.
            </p>
          </Note>
        </div>

        <Card
          title="Payment"
          description={sale ? sale.saleUrl ?? '' : 'PayMe’s payment page appears here.'}
          actions={sale && <SaleStatusBadge status={sale.status} />}
        >
          {!sale && (
            <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Click “Buy now” to create the sale.
            </div>
          )}
          {sale?.saleUrl && (
            <div className="space-y-3">
              <Note>
                <p>
                  Sandbox card <Code>5326105300985846</Code> · exp{' '}
                  <Code>12/30</Code> · CVV <Code>658</Code> · social ID{' '}
                  <Code>008336174</Code>.
                </p>
              </Note>
              <iframe
                title="PayMe payment page"
                src={sale.saleUrl}
                className="h-[640px] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
