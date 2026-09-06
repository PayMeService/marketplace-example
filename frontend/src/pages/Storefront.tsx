import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { useAuth } from '../lib/auth-context';
import type { Product } from '../lib/types';
import { MoneyFlow } from '../components/MoneyFlow';
import {
  Code,
  EmptyState,
  ErrorBanner,
  Money,
  Note,
  Rule,
  Spinner,
} from '../components/ui';

/** Four ways into the integration, each named by the call it starts from. */
const ENTRY_POINTS = [
  {
    to: '/sell',
    title: 'Onboard a seller',
    body: 'One call opens a PayMe account and returns an MPL, a one-time secret and a public key. Approval and balances are read back from get-sellers.',
    call: 'create-seller',
  },
  {
    to: '/checkout',
    title: 'Three checkouts',
    body: 'PayMe’s hosted page in an iframe, Hosted Fields on your own domain, or a server-to-server charge against a saved token.',
    call: 'generate-sale',
  },
  {
    to: '/sales',
    title: 'Authorize, then capture',
    body: 'Reserve the funds now and settle when you ship. The hold lasts 168 hours and capture happens once, fully or partially.',
    call: 'capture-sale',
  },
  {
    to: '/admin/callbacks',
    title: 'Signed callbacks',
    body: 'Every notification is checked against an md5 of key, secret, transaction and entity before it is allowed to change anything.',
    call: 'payme_signature',
  },
];

export function Storefront() {
  const { user } = useAuth();
  const { data: products, error, loading } = useLoader(() => get<Product[]>('/products'));

  return (
    <div className="space-y-14">
      <section>
        <h1 className="max-w-[18ch] font-serif text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.02] tracking-[-0.02em] text-ink">
          One payment, two destinations
        </h1>
        <p className="mt-5 max-w-[64ch] text-[16px] leading-[1.6] text-ink-soft">
          Anyone can list a product here. Anyone who wants to be paid for one
          opens a PayMe seller account and gets an <Code>seller_payme_id</Code>{' '}
          of their own — an MPL. From then on every charge is routed to that
          seller&#8217;s wallet, with the marketplace keeping a{' '}
          <Code>market_fee</Code> off the top. This app is that integration, and
          it names every call it makes as it makes it.
        </p>

        <div className="mt-10">
          <MoneyFlow />
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {ENTRY_POINTS.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="group border-t-2 border-rule-strong pt-3 transition-colors hover:border-pen"
            >
              <p className="font-serif text-[16px] leading-snug text-ink">{entry.title}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                {entry.body}
              </p>
              <p className="mt-2.5 font-mono text-[10.5px] text-ink-faint transition-colors group-hover:text-pen">
                {entry.call}
              </p>
            </Link>
          ))}
        </div>

        {!user && (
          <div className="mt-10 max-w-[62ch]">
            <Note title="Start here">
              <p>
                Create an account, list a product, then open a seller from{' '}
                <Link to="/sell" className="text-pen underline underline-offset-2">
                  Sell with us
                </Link>
                . PayMe&#8217;s sandbox accepts social ID <Code>9999999999</Code>,
                bank <Code>54</Code>, branch <Code>123</Code>, account{' '}
                <Code>123456</Code>.
              </p>
            </Note>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <Rule
          label="On the marketplace"
          hint={products ? `${products.length} listed` : undefined}
        />
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-ink-soft">
          Every product listed by every user. Open one to buy it — the payment is
          routed to whoever listed it, never to the marketplace.
        </p>

        <ErrorBanner error={error} />
        {loading && <Spinner label="Loading listings" />}

        {products && products.length === 0 && (
          <EmptyState title="Nothing listed yet">
            <Link to="/products" className="text-pen underline underline-offset-2">
              List the first product
            </Link>{' '}
            and it appears here for every visitor.
          </EmptyState>
        )}

        {products && products.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  to={`/buy/${product.id}`}
                  className="flex h-full flex-col rounded-[3px] border border-rule bg-paper p-4 transition-colors hover:border-pen"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-serif text-[17px] leading-snug text-ink">
                      {product.name}
                    </h3>
                    <Money minor={product.priceMinor} currency={product.currency} />
                  </div>
                  {product.description && (
                    <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-soft">
                      {product.description}
                    </p>
                  )}
                  {product.seller && (
                    <p className="mt-auto pt-4 text-[12px] text-ink-faint">
                      Sold by {product.seller}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
