import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { Seller } from '../lib/types';
import { storeAvatarUrl } from '../lib/dicebear';
import {
  Button,
  Code,
  DataList,
  EmptyState,
  Entry,
  ErrorBanner,
  Money,
  Note,
  Page,
  Rule,
  Sheet,
  Slip,
  Spinner,
  Spread,
  Stamp,
} from '../components/ui';

/**
 * The seller's own view: identity, approval, and money.
 *
 * BALANCES: there is no "get balance" endpoint. A seller's wallet arrives as
 * `seller_wallets` on get-sellers, keyed by currency, with two numbers that
 * mean different things:
 *   wallet_total       everything PayMe holds for this seller
 *   wallet_releasable  the part past its release date, i.e. withdrawable now
 * The difference is money from recent sales still inside the clearing window,
 * which is why the two are shown as one figure split rather than as two totals.
 */
/** 0.700000000000000000 -> 0.7, leaving anything non-numeric alone. */
function formatFee(value: unknown): string {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? String(asNumber) : String(value);
}

export function SellerDashboard() {
  const {
    data: seller,
    error,
    loading,
    reload,
  } = useLoader(() => get<Seller | null>('/sellers/me'));
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner label="Reading your seller from PayMe" />;

  if (!seller) {
    return (
      <EmptyState title="You do not have a PayMe seller yet">
        <Link to="/sell" className="text-pen underline underline-offset-2">
          Open one
        </Link>{' '}
        — it takes a single create-seller call, and you can keep listing products
        in the meantime.
      </EmptyState>
    );
  }

  return (
    <Page
      title={
        <span className="flex items-center gap-4">
          <img
            src={storeAvatarUrl(seller.id)}
            alt=""
            className="size-14 rounded-full bg-ledger-alt"
          />
          {seller.businessName}
        </span>
      }
      lede={
        <p className="break-all font-mono text-[12px] text-ink-faint">{seller.paymeId}</p>
      }
      actions={
        <>
          <Stamp tone={seller.approved ? 'success' : 'warning'}>
            {seller.approved ? 'approved' : 'awaiting documents'}
          </Stamp>
          <Stamp tone={seller.active ? 'success' : 'danger'}>
            {seller.active ? 'active' : 'inactive'}
          </Stamp>
          <Button variant="secondary" loading={busy} onClick={reload}>
            Refresh from PayMe
          </Button>
        </>
      }
    >
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
            PayMe pays out only once three documents are verified — social ID,
            bank account and corporate certificate. Sales work in the meantime,
            and <Code>wallet_releasable</Code> keeps growing as each sale passes
            its release date, but <Code>withdraw-balance</Code> is refused
            however large that balance gets.
          </p>
          {seller.signupLink && (
            <p>
              <a
                href={seller.signupLink}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-pen underline underline-offset-2"
              >
                Finish onboarding on PayMe
              </a>
            </p>
          )}
        </Note>
      )}

      <Spread
        aside={
          <Note title="Two numbers, not one">
            <p>
              <Code>wallet_total</Code> is everything PayMe holds for you.{' '}
              <Code>wallet_releasable</Code> is the part past its release date.
              The gap is money from recent sales still inside the clearing
              window — it is yours, it just is not payable yet.
            </p>
          </Note>
        }
      >
        <Rule label="Balance" hint="seller_wallets" />

        {seller.balances.length === 0 ? (
          <EmptyState title="No wallet activity yet">
            A wallet appears in <Code>get-sellers</Code> once this seller&#8217;s
            first sale settles.
          </EmptyState>
        ) : (
          <div
            className={`grid gap-5 ${seller.balances.length > 1 ? 'sm:grid-cols-2' : ''}`}
          >
            {seller.balances.map((balance) => {
              const share = balance.total
                ? Math.round((balance.releasable / balance.total) * 100)
                : 0;
              return (
                <div
                  key={balance.currency}
                  className="rounded-2xl border border-rule bg-paper p-6 shadow-[0_2px_10px_rgba(16,22,25,0.05)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Stamp>{balance.currency.toLowerCase()}</Stamp>
                    <span className="tabular font-mono text-[11px] text-ink-faint">
                      {balance.total} minor
                    </span>
                  </div>

                  <div className="mt-4">
                    <Money
                      minor={balance.total}
                      currency={balance.currency}
                      size="xxl"
                    />
                  </div>

                  {/* The split IS the information here, so it is drawn rather
                      than written twice: the filled part is withdrawable now. */}
                  <div
                    className="mt-5 flex h-2 overflow-hidden rounded-full bg-ledger-alt"
                    role="presentation"
                  >
                    <span className="bg-seal" style={{ width: `${share}%` }} />
                  </div>

                  <dl className="mt-4 space-y-2 text-[13.5px]">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-ink-soft">Available to withdraw</dt>
                      <dd>
                        <Money
                          minor={balance.releasable}
                          currency={balance.currency}
                          size="sm"
                          tone="seal"
                        />
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt
                        className="text-ink-soft"
                        title="Paid, but still inside PayMe's clearing window"
                      >
                        Still clearing
                      </dt>
                      <dd>
                        <Money
                          minor={balance.pending}
                          currency={balance.currency}
                          size="sm"
                        />
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </Spread>

      <Spread
        aside={
          <Note title="Why the secret is not here">
            <p>
              <Code>seller_payme_secret</Code> comes back once from
              create-seller and can act as the seller. It is stored{' '}
              <code className="font-mono">select: false</code> and never enters a
              view model, so no amount of poking at this page will reveal it.
            </p>
          </Note>
        }
      >
        <Rule label="Integration keys" hint="what the browser may see" />

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Sheet title="Identity and keys">
            <div className="space-y-5 text-[13px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-ink">seller_payme_id</span>
                  <Stamp>server and client</Stamp>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-ink-soft">
                  {seller.paymeId}
                </p>
                <p className="mt-1 leading-relaxed text-ink-soft">
                  Identifies the seller on every PayMe call. Not a secret, but it
                  is always sent from the server.
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-ink">public key</span>
                  <Stamp tone="success">safe in the browser</Stamp>
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-ink-soft">
                  {seller.publicKey ?? 'not fetched'}
                </p>
                <p className="mt-1 leading-relaxed text-ink-soft">
                  Hosted Fields is initialised with this. Its only power is to
                  open a tokenization session against PayMe&#8217;s vault.
                </p>
                <Button
                  variant="secondary"
                  className="mt-2.5"
                  loading={busy}
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-ink">
                    seller_payme_secret
                  </span>
                  <Stamp tone="danger">server only</Stamp>
                </div>
                <p className="mt-1 leading-relaxed text-ink-soft">
                  Returned once by create-seller and never sent to this page.
                </p>
              </div>
            </div>
          </Sheet>

          <Sheet title="Fees" description="PayMe’s rates for this seller, plus the marketplace’s cut.">
            <Slip tone="amber" className="mb-4">
              <p className="text-[13px] leading-relaxed text-ink">
                The marketplace keeps{' '}
                <span className="font-mono font-semibold">{seller.marketFee}%</span> of
                every sale as <Code>market_fee</Code>, set by the{' '}
                <Code>{seller.planId}</Code> plan. It is charged on top of
                PayMe&#8217;s own fees and paid out to the marketplace monthly.
              </p>
            </Slip>

            {seller.fees ? (
              <DataList>
                {Object.entries(seller.fees)
                  .filter(([, value]) => value !== null)
                  .map(([key, value]) => (
                    <Entry key={key} term={key}>
                      <span className="tabular font-mono text-[12px]">
                        {formatFee(value)}
                      </span>
                    </Entry>
                  ))}
              </DataList>
            ) : (
              <p className="text-[13px] text-ink-soft">
                PayMe did not return a fee schedule for this seller.
              </p>
            )}
          </Sheet>
        </div>
      </Spread>
    </Page>
  );
}
