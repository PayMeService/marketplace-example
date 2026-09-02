import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { formatMoney } from '../lib/money';
import { useAuth } from '../lib/auth-context';
import type { Product } from '../lib/types';
import { Card, EmptyState, ErrorBanner, Note, Spinner, Code } from '../components/ui';

/** The landing page: what is for sale, and a map of the integration. */
export function Storefront() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    get<Product[]>('/products').then(setProducts).catch(setError);
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-3xl font-semibold tracking-tight">
          A marketplace, wired end to end to PayMe
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-400">
          Users register and list products. A user who wants to get paid opens a
          PayMe seller account through <Code>create-seller</Code> and gets a{' '}
          <Code>seller_payme_id</Code> (an MPL). From then on every payment is
          routed to that seller's wallet, with the marketplace taking a{' '}
          <Code>market_fee</Code> off the top.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: 'Onboard sellers',
              body: 'create-seller with a plan, store the MPL, secret and public key. Approval state and balances come from get-sellers.',
              to: '/sell',
            },
            {
              title: 'Three checkouts',
              body: 'PayMe’s hosted page in an iframe, Hosted Fields on your own domain, or pay-sale server-to-server against a saved token.',
              to: '/checkout',
            },
            {
              title: 'Authorize, then capture',
              body: 'Reserve funds with sale_type=authorize, settle with capture-sale when you ship. 168 hours to decide.',
              to: '/sales',
            },
            {
              title: 'Signed callbacks',
              body: 'Every notification is checked against an md5 of key + secret + transaction + entity before it changes anything.',
              to: '/admin/callbacks',
            },
          ].map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className="rounded-lg border border-slate-200 p-4 transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {item.body}
              </p>
            </Link>
          ))}
        </div>

        {!user && (
          <Note title="Start here">
            <p>
              Create an account, list a product, then open a seller on the{' '}
              <Link to="/sell" className="underline">
                Sell with us
              </Link>{' '}
              page. In sandbox you can use social ID <Code>9999999999</Code>,
              bank <Code>54</Code>, branch <Code>123</Code>, account{' '}
              <Code>123456</Code>.
            </p>
          </Note>
        )}
      </section>

      <Card
        title="On the marketplace"
        description="Every product listed by every user. Click one to buy it — the payment is routed to whoever listed it."
      >
        <ErrorBanner error={error} />
        {!products && !error && <Spinner />}
        {products && products.length === 0 && (
          <EmptyState title="Nothing listed yet">
            <Link to="/products" className="text-indigo-600 hover:underline">
              List the first product
            </Link>
          </EmptyState>
        )}
        {products && products.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  to={`/buy/${product.id}`}
                  className="flex h-full flex-col rounded-lg border border-slate-200 p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-slate-800 dark:hover:border-indigo-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{product.name}</h3>
                    <span className="whitespace-nowrap font-mono text-sm">
                      {formatMoney(product.priceMinor, product.currency)}
                    </span>
                  </div>
                  {product.description && (
                    <p className="mt-1 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">
                      {product.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    {product.seller && (
                      <span className="text-xs text-slate-400">by {product.seller}</span>
                    )}
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      Buy →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
