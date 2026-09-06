import { Link, useParams } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import { useCart } from '../lib/cart-context';
import type { Product, Store as StoreSummary } from '../lib/types';
import { productImageUrl, storeAvatarUrl } from '../lib/dicebear';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Note,
  Page,
  Spinner,
  Stamp,
} from '../components/ui';

type StoreDetail = StoreSummary & { products: Product[] };

/** One shop, and everything it has for sale. */
export function Store() {
  const { storeId } = useParams<{ storeId: string }>();
  const { add, lines } = useCart();

  const {
    data: store,
    error,
    loading,
  } = useLoader(() => get<StoreDetail>(`/stores/${storeId}`), storeId);

  if (loading) return <Spinner label="Loading shop" />;
  if (error) return <ErrorBanner error={error} />;
  if (!store) return null;

  return (
    <Page
      title={
        <span className="flex items-center gap-4">
          <img
            src={storeAvatarUrl(store.id)}
            alt=""
            className="size-14 rounded-full bg-ledger-alt"
          />
          {store.name}
        </span>
      }
      lede={
        <>
          {store.owner && <>Run by {store.owner}. </>}
          Everything here is charged against this seller&#8217;s own{' '}
          <Code>seller_payme_id</Code>, so the money lands with them rather than
          with the marketplace.
        </>
      }
      actions={!store.approved ? <Stamp tone="warning">payouts pending</Stamp> : undefined}
    >
      {!store.approved && (
        <Note title="This shop can sell, but not withdraw">
          <p>
            PayMe releases payouts once three documents are verified. Sales work
            throughout and the balance keeps accruing — so buying here is
            perfectly normal. Never gate checkout on approval.
          </p>
        </Note>
      )}

      {store.products.length === 0 ? (
        <EmptyState title="Nothing listed right now">
          This shop has no active listings.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {store.products.map((product) => {
            const inCart = lines.find((line) => line.productId === product.id);
            return (
              <li
                key={product.id}
                className="flex flex-col rounded-2xl border border-rule bg-paper p-5 shadow-[0_2px_10px_rgba(16,22,25,0.05)]"
              >
                <Link to={`/buy/${product.id}`} className="block">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-ledger-alt">
                    <img
                      src={productImageUrl(product.id)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold text-ink">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-soft">
                      {product.description}
                    </p>
                  )}
                </Link>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  <span className="tabular font-mono text-[15px] font-medium text-ink">
                    {formatMoney(product.priceMinor, product.currency)}
                  </span>
                  <Button onClick={() => add(product.id)}>
                    {inCart ? `In cart · ${inCart.quantity}` : 'Add to cart'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
