import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { Store } from '../lib/types';
import { storeAvatarUrl } from '../lib/dicebear';
import { EmptyState, ErrorBanner, Page, Spinner, Stamp } from '../components/ui';

/** Every shop with something on its shelves. */
export function Stores() {
  const { data: stores, error, loading } = useLoader(() => get<Store[]>('/stores'));

  return (
    <Page
      title="Shops"
      lede="Each of these is a separate PayMe seller with their own account, their own MPL and their own wallet. Buying from two of them is two payments, not one."
    >
      <ErrorBanner error={error} />
      {loading && <Spinner label="Loading shops" />}

      {stores && stores.length === 0 && (
        <EmptyState title="No shops yet">
          A shop appears here once someone lists a product and opens a PayMe
          seller account.
        </EmptyState>
      )}

      {stores && stores.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                to={`/store/${store.id}`}
                className="flex h-full flex-col rounded-2xl border border-rule bg-paper p-5 shadow-[0_2px_10px_rgba(16,22,25,0.05)] transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={storeAvatarUrl(store.id)}
                    alt=""
                    loading="lazy"
                    className="size-14 rounded-full bg-ledger-alt"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-ink">
                      {store.name}
                    </p>
                    {store.owner && (
                      <p className="truncate text-[12.5px] text-ink-soft">
                        {store.owner}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Stamp>{store.productCount} listed</Stamp>
                  {store.currencies.map((currency) => (
                    <Stamp key={currency}>{currency.toLowerCase()}</Stamp>
                  ))}
                  {/* Surfaced, never used to gate buying — PayMe holds payouts
                      until documents are verified, but sales work throughout. */}
                  {!store.approved && <Stamp tone="warning">payouts pending</Stamp>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
