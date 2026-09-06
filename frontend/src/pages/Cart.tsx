import { Link, useNavigate } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import { useCart } from '../lib/cart-context';
import type { Product } from '../lib/types';
import { productImageUrl, storeAvatarUrl } from '../lib/dicebear';
import {
  Button,
  Code,
  EmptyState,
  Money,
  Note,
  Page,
  Sheet,
  Spinner,
  Stamp,
} from '../components/ui';
import { groupByStore } from '../lib/cart-grouping';

/**
 * The cart, already grouped the way it will actually be charged.
 *
 * A cart holding two shops becomes two PayMe sales, so it is shown as two
 * baskets from the outset rather than as one list that surprises the buyer at
 * the payment step.
 */
export function Cart() {
  const { lines, setQuantity, remove, count } = useCart();
  const navigate = useNavigate();
  const { data: catalogue, loading } = useLoader(() => get<Product[]>('/products'));

  if (loading) return <Spinner label="Loading your cart" />;

  const groups = groupByStore(lines, catalogue ?? []);
  const missing = lines.length - groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <Page
      title="Cart"
      lede={
        groups.length > 1
          ? 'Your cart holds items from more than one shop, so it will be paid as one sale per shop — each landing in that seller’s own wallet.'
          : 'Everything here is charged against the seller’s own PayMe account.'
      }
    >
      {count === 0 && (
        <EmptyState title="Your cart is empty">
          <Link to="/stores" className="underline underline-offset-2">
            Browse the shops
          </Link>{' '}
          and add something.
        </EmptyState>
      )}

      {missing > 0 && (
        <Note tone="warning" title="Some items are no longer listed">
          <p>
            {missing} item{missing > 1 ? 's have' : ' has'} been delisted since
            you added {missing > 1 ? 'them' : 'it'}. They are ignored at
            checkout.
          </p>
        </Note>
      )}

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
          description={`One sale · ${group.currency}`}
          actions={<Money minor={group.totalMinor} currency={group.currency} />}
        >
          <ul className="divide-y divide-rule">
            {group.lines.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-4 py-4 first:pt-0">
                <img
                  src={productImageUrl(product.id)}
                  alt=""
                  loading="lazy"
                  className="size-16 shrink-0 rounded-xl bg-ledger-alt object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {product.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-ink-faint">
                    {formatMoney(product.priceMinor, product.currency)} each
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    aria-label={`One fewer ${product.name}`}
                    onClick={() => setQuantity(product.id, quantity - 1)}
                  >
                    −
                  </Button>
                  <span className="tabular w-7 text-center font-mono text-[14px]">
                    {quantity}
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`One more ${product.name}`}
                    onClick={() => setQuantity(product.id, quantity + 1)}
                  >
                    +
                  </Button>
                  <Button variant="ghost" onClick={() => remove(product.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>
      ))}

      {groups.length > 0 && (
        <>
          {groups.length > 1 && (
            <Note title={`${groups.length} shops, ${groups.length} payments`}>
              <p>
                <Code>generate-sale</Code> carries one{' '}
                <Code>seller_payme_id</Code>, so a sale can only ever pay one
                wallet. A cart spanning shops is not one payment split up
                afterwards — it is several payments created together.
              </p>
            </Note>
          )}

          <div className="flex flex-wrap items-center justify-end gap-4">
            <span className="text-[13px] text-ink-soft">
              {groups.map((group) => (
                <Stamp key={group.storeId}>
                  {group.storeName} {formatMoney(group.totalMinor, group.currency)}
                </Stamp>
              ))}
            </span>
            <Button onClick={() => navigate('/checkout')}>
              Checkout{groups.length > 1 ? ` · ${groups.length} payments` : ''}
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
