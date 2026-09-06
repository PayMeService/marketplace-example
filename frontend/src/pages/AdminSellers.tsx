import { useState, type ReactNode } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import type { AdminSeller } from '../lib/types';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Flash,
  Input,
  Ledger,
  Money,
  Note,
  Page,
  Sheet,
  Spinner,
  Spread,
  Stamp,
  Td,
  TdPrimary,
  Th,
} from '../components/ui';

/** PayMe's permitted range for market_fee, in percent. */
const FEE_MIN = 0;
const FEE_MAX = 60;

/**
 * A quiet action. Refreshing state or re-fetching a key is maintenance — it
 * should not carry the same weight as the button that moves someone's money.
 */
function RowAction({
  onClick,
  busy = false,
  title,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      className="inline-flex items-center gap-1.5 text-[12px] text-pen underline-offset-2 hover:underline disabled:opacity-50"
    >
      {busy && (
        <span className="size-2.5 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/**
 * The marketplace operator's view of every seller.
 *
 * All of these actions use the partner key and act across sellers, which is why
 * this page is admin-only. The list is refreshed with ONE get-sellers call
 * carrying every MPL, not one call per row.
 */
export function AdminSellers() {
  const {
    data: sellers,
    error,
    loading,
    reload,
    setError,
  } = useLoader(() => get<AdminSeller[]>('/admin/sellers'));

  /**
   * Which control is running, not merely which row.
   *
   * Keyed by row alone, pressing Refresh put every button in that row into a
   * loading state, so the page claimed to be doing four things at once.
   */
  const [running, setRunning] = useState<{ id: string; action: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [fee, setFee] = useState<{ id: string; value: string } | null>(null);

  const isRunning = (id: string, action: string) =>
    running?.id === id && running.action === action;

  async function act(
    id: string,
    action: string,
    run: () => Promise<unknown>,
    message?: string,
  ) {
    setError(null);
    setResult(null);
    setRunning({ id, action });
    try {
      await run();
      if (message) setResult(message);
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setRunning(null);
    }
  }

  const feeValue = fee ? Number(fee.value) : NaN;
  const feeValid =
    fee !== null &&
    fee.value.trim() !== '' &&
    Number.isFinite(feeValue) &&
    feeValue >= FEE_MIN &&
    feeValue <= FEE_MAX;

  function saveFee(seller: AdminSeller) {
    if (!feeValid) return;
    void act(
      seller.id,
      'fee',
      () => post(`/admin/sellers/${seller.id}/market-fee`, { marketFee: feeValue }),
      `${seller.businessName} now pays ${feeValue}% on sales created from here on. Sales already generated keep the fee they were created with.`,
    ).then(() => setFee(null));
  }

  if (loading) return <Spinner label="Reading sellers from PayMe" />;

  return (
    <Page
      title="Sellers"
      lede={
        <>
          Local records joined with live PayMe state from a single{' '}
          <Code>get-sellers</Code> call — approval, fees and wallet balances all
          come from there, for every seller at once.
        </>
      }
      rail
    >
      <ErrorBanner error={error} />
      {result && <Flash>{result}</Flash>}

      <Spread
        aside={
          <Note title="Approval gates payouts, not payments">
            <p>
              A seller can take money the moment their MPL exists, and{' '}
              <Code>wallet_releasable</Code> keeps tracking what has cleared
              regardless of approval. Until three documents are verified — social
              ID, bank account and corporate certificate —{' '}
              <Code>withdraw-balance</Code> is refused however large the balance
              is.
            </p>
            <p>
              So do not gate checkout on approval. Do tell the seller why they
              cannot withdraw.
            </p>
          </Note>
        }
      >
        {sellers && sellers.length === 0 ? (
          <EmptyState title="No sellers yet">
            A user creates one from the Sell with us page. Until then there is
            nothing for the partner key to act on.
          </EmptyState>
        ) : (
          <Sheet flush>
            <Ledger>
              <thead>
                <tr>
                  <Th>Seller</Th>
                  <Th align="right">Marketplace fee</Th>
                  <Th>State</Th>
                  <Th align="right">Balance</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {sellers?.map((seller) => {
                  const editing = fee?.id === seller.id;

                  // Summing across currencies would be meaningless, so the test
                  // is whether ANY wallet has something past its release date.
                  const releasable = seller.balances.filter((b) => b.releasable > 0);
                  const canWithdraw = seller.approved && releasable.length > 0;
                  const blockedBecause = !seller.approved
                    ? 'Documents not verified'
                    : 'Nothing releasable yet';

                  return (
                    <tr key={seller.id}>
                      <TdPrimary name={seller.businessName} id={seller.paymeId}>
                        {seller.owner && (
                          <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                            {seller.owner.name}
                            <br />
                            {seller.owner.email}
                          </p>
                        )}
                      </TdPrimary>

                      {/* The fee is edited where it is displayed rather than
                          through a window.prompt, which could not show PayMe's
                          permitted range and treated an entered 0 — a legal
                          value — as a cancelled dialog. */}
                      <Td align="right" className="w-[9.5rem]">
                        {editing ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1">
                              <Input
                                autoFocus
                                type="number"
                                step="0.01"
                                min={FEE_MIN}
                                max={FEE_MAX}
                                aria-label={`Marketplace fee for ${seller.businessName}, in percent`}
                                className="w-20 text-right"
                                value={fee.value}
                                onChange={(e) =>
                                  setFee({ id: seller.id, value: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveFee(seller);
                                  }
                                  if (e.key === 'Escape') setFee(null);
                                }}
                              />
                              <span className="font-mono text-[13px] text-ink-soft">%</span>
                            </div>
                            {!feeValid && fee.value.trim() !== '' && (
                              <p className="text-right text-[11px] leading-snug text-stamp">
                                PayMe allows {FEE_MIN}–{FEE_MAX}
                              </p>
                            )}
                            <div className="flex gap-1.5">
                              <Button
                                loading={isRunning(seller.id, 'fee')}
                                disabled={!feeValid}
                                onClick={() => saveFee(seller)}
                              >
                                Save
                              </Button>
                              <Button variant="ghost" onClick={() => setFee(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setFee({ id: seller.id, value: String(seller.marketFee) })
                            }
                            title={`Change ${seller.businessName}'s market_fee`}
                            className="group text-right"
                          >
                            <span className="tabular border-b border-dashed border-rule-strong font-mono text-[14px] text-ink group-hover:border-pen group-hover:text-pen">
                              {seller.marketFee}%
                            </span>
                            <span className="mt-1 block font-mono text-[10px] text-ink-faint">
                              {seller.planId}
                            </span>
                          </button>
                        )}
                      </Td>

                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <Stamp tone={seller.approved ? 'success' : 'warning'}>
                            {seller.approved ? 'approved' : 'pending docs'}
                          </Stamp>
                          <Stamp tone={seller.active ? 'success' : 'danger'}>
                            {seller.active ? 'active' : 'inactive'}
                          </Stamp>
                          {seller.stale && <Stamp tone="warning">stale</Stamp>}
                        </div>
                      </Td>

                      <Td align="right">
                        {seller.balances.length === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          seller.balances.map((balance) => (
                            <div key={balance.currency} className="mb-3 last:mb-0">
                              <Money minor={balance.total} currency={balance.currency} />
                              <span className="mt-0.5 block text-[10px] text-ink-faint">
                                <span className="tabular font-mono text-seal">
                                  {formatMoney(balance.releasable, balance.currency)}
                                </span>{' '}
                                releasable
                              </span>
                            </div>
                          ))
                        )}
                      </Td>

                      {/* One action moves real money; the rest are maintenance.
                          They should not look alike, and the reason a payout is
                          refused belongs on the page rather than in a title
                          attribute nobody hovers. */}
                      <Td className="w-[15rem]">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Button
                          variant="secondary"
                          loading={isRunning(seller.id, 'withdraw')}
                          disabled={!canWithdraw}
                          onClick={() => {
                            const amounts = releasable
                              .map((b) => formatMoney(b.releasable, b.currency))
                              .join(' and ');
                            if (
                              window.confirm(
                                `Pay out ${amounts} to ${seller.businessName}'s bank account?\n\n` +
                                  'PayMe completes the transfer asynchronously and reports it as a withdrawal-complete callback.',
                              )
                            ) {
                              void act(
                                seller.id,
                                'withdraw',
                                () => post(`/admin/sellers/${seller.id}/withdraw`, {}),
                                `Withdrawal of ${amounts} requested for ${seller.businessName}. Completion arrives as a withdrawal-complete callback.`,
                              );
                            }
                          }}
                        >
                          Withdraw
                        </Button>
                        {!canWithdraw && (
                          <p className="max-w-[18ch] text-[11px] leading-snug text-ink-faint">
                            {blockedBecause}
                          </p>
                        )}
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule pt-2.5">
                          <RowAction
                            busy={isRunning(seller.id, 'refresh')}
                            title="get-sellers — re-read approval, fees and wallets"
                            onClick={() =>
                              act(
                                seller.id,
                                'refresh',
                                () => post(`/admin/sellers/${seller.id}/refresh`),
                                `${seller.businessName} re-read from PayMe.`,
                              )
                            }
                          >
                            Refresh
                          </RowAction>

                          <RowAction
                            busy={isRunning(seller.id, 'public-key')}
                            title="GET /sellers/{mpl}/public-keys — the key Hosted Fields needs"
                            onClick={() =>
                              act(
                                seller.id,
                                'public-key',
                                () => post(`/admin/sellers/${seller.id}/public-key/refresh`),
                                `Public key refreshed for ${seller.businessName}.`,
                              )
                            }
                          >
                            Public key
                          </RowAction>

                          {seller.signupLink && (
                            <a
                              href={seller.signupLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] text-pen underline-offset-2 hover:underline"
                            >
                              Onboarding
                            </a>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Ledger>
          </Sheet>
        )}
      </Spread>
    </Page>
  );
}
