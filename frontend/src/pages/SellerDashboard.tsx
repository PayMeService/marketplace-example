import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import type { Seller } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  ErrorBanner,
  Note,
  Spinner,
} from '../components/ui';

/**
 * The seller's own view: identity, approval, and money.
 *
 * BALANCES: there is no "get balance" endpoint. A seller's wallet arrives as
 * `seller_wallets` on get-sellers, keyed by currency, with two numbers that
 * mean different things:
 *   wallet_total       everything PayMe holds for this seller
 *   wallet_releasable  the part past its release date, i.e. withdrawable now
 * The difference is money from recent sales still inside the clearing window.
 */
export function SellerDashboard() {
  const {
    data: seller,
    error,
    loading,
    reload,
  } = useLoader(() => get<Seller | null>('/sellers/me'));
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner label="Reading your seller from PayMe…" />;

  if (!seller) {
    return (
      <EmptyState title="You do not have a PayMe seller yet">
        <Link to="/sell" className="text-indigo-600 hover:underline">
          Open one — it takes one create-seller call
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{seller.businessName}</h1>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {seller.paymeId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={seller.approved ? 'success' : 'warning'}>
            {seller.approved ? 'Approved' : 'Awaiting document verification'}
          </Badge>
          <Badge tone={seller.active ? 'success' : 'danger'}>
            {seller.active ? 'Active' : 'Inactive'}
          </Badge>
          <Button variant="secondary" loading={busy} onClick={reload}>
            Refresh from PayMe
          </Button>
        </div>
      </div>

      <ErrorBanner error={error} />

      {seller.remoteError && (
        <Note tone="warning" title="Showing cached state">
          <p>
            PayMe could not be reached, so approval and balances below may be
            stale: {seller.remoteError}
          </p>
        </Note>
      )}

      {!seller.approved && (
        <Note tone="warning" title="You can take payments, but not withdraw yet">
          <p>
            PayMe holds funds until three documents are verified — social ID,
            bank account and corporate certificate. Sales work in the meantime;{' '}
            <Code>wallet_releasable</Code> stays at zero until approval.
          </p>
          {seller.signupLink && (
            <p className="mt-1">
              <a
                href={seller.signupLink}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                Complete onboarding on PayMe →
              </a>
            </p>
          )}
        </Note>
      )}

      <Card
        title="Balance"
        description="From seller_wallets on get-sellers. Amounts are in minor units on the wire."
      >
        {seller.balances.length === 0 ? (
          <EmptyState title="No wallet activity yet">
            A wallet appears once the seller's first sale settles.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seller.balances.map((balance) => (
              <div
                key={balance.currency}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {balance.currency}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {balance.total} minor
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatMoney(balance.total, balance.currency)}
                </p>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">
                      Available to withdraw
                    </dt>
                    <dd className="font-medium text-emerald-700 dark:text-emerald-400">
                      {formatMoney(balance.releasable, balance.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt
                      className="text-slate-500 dark:text-slate-400"
                      title="Paid, but still inside PayMe's clearing window"
                    >
                      Clearing
                    </dt>
                    <dd className="font-medium">
                      {formatMoney(balance.pending, balance.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Integration keys"
          description="What the browser is allowed to see, and what it is not."
        >
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium">
                seller_payme_id <Badge tone="neutral">server + client</Badge>
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                {seller.paymeId}
              </dd>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Identifies the seller on every PayMe call. Not a secret, but it
                is always sent from the server.
              </p>
            </div>
            <div>
              <dt className="font-medium">
                Public key <Badge tone="success">safe in the browser</Badge>
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                {seller.publicKey ?? 'not fetched'}
              </dd>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Hosted Fields is initialised with this. Its only power is to open
                a tokenization session against PayMe's vault.
              </p>
              <Button
                variant="secondary"
                className="mt-2"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await post('/sellers/me/public-key/refresh');
                    reload();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Re-fetch from PayMe
              </Button>
            </div>
            <div>
              <dt className="font-medium">
                seller_payme_secret <Badge tone="danger">server only</Badge>
              </dt>
              <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Returned once by create-seller and never sent to this page. It
                can act as the seller.
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Fees" description="PayMe's own rates for this seller, plus the marketplace's cut.">
          <div className="mb-4 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/30">
            <p className="text-sm">
              <span className="font-semibold">{seller.marketFee}%</span> marketplace
              fee (<Code>market_fee</Code>) on the <Code>{seller.planId}</Code>{' '}
              plan — charged on top of PayMe's fees and paid out to the
              marketplace monthly.
            </p>
          </div>
          {seller.fees ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 font-mono text-xs">
              {Object.entries(seller.fees)
                .filter(([, value]) => value !== null)
                .map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="truncate text-slate-500 dark:text-slate-400">{key}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Fees unavailable.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
