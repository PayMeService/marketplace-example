import { useState } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { fromMinorUnits, toMinorUnits } from '../lib/money';
import type { Sale } from '../lib/types';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Ledger,
  Money,
  Note,
  Page,
  Rule,
  Sheet,
  Spinner,
  Spread,
  Td,
  TdPrimary,
  Th,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

const FLOW_LABELS: Record<string, string> = {
  iframe: 'Hosted page',
  'hosted-fields': 'Hosted Fields',
  'pay-sale': 'Direct API',
};

/** Every post-sale action, and the single endpoint each one really is. */
const ACTIONS = [
  {
    label: 'Capture',
    endpoint: 'capture-sale',
    body: 'Settles an authorization. Needs sale_type="authorize" and status authorized, within 168 hours. Once only — there is no second capture.',
  },
  {
    label: 'Void',
    endpoint: 'refund-sale',
    body: 'The same endpoint as a refund. On an authorization that was never captured it releases the hold, and PayMe reports the result as voided rather than refunded.',
  },
  {
    label: 'Refund',
    endpoint: 'refund-sale',
    body: 'Full when sale_refund_amount is omitted, partial when it is set. Can run repeatedly as long as the total stays within the original amount.',
  },
  {
    label: 'Fetch token',
    endpoint: 'get-buyer-key',
    body: 'Recovers the reusable buyer_key from a sale created with capture_buyer="1" — useful when the callback was missed.',
  },
];

/**
 * The seller's sales, and the actions available on each.
 *
 * The action set is driven entirely by status, because PayMe's is too:
 *   authorized -> capture (settle) or refund (release the hold)
 *   completed  -> refund, full or partial
 *   initial    -> nothing yet; the buyer has not paid
 */
export function Sales() {
  const {
    data: sales,
    error,
    loading,
    reload,
    setError,
  } = useLoader(() => get<Sale[]>('/sales'));
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(saleId: string, run: () => Promise<unknown>) {
    setError(null);
    setBusyId(saleId);
    try {
      await run();
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  function refund(sale: Sale) {
    const remaining = sale.priceMinor - sale.refundedMinor;
    const answer = window.prompt(
      `Refund amount for "${sale.productName}".\n\n` +
        `Up to ${fromMinorUnits(remaining).toFixed(2)} ${sale.currency} remains.\n` +
        `Leave blank to refund the full remainder.`,
      '',
    );
    if (answer === null) return;
    const amountMinor = answer.trim() ? toMinorUnits(answer) : undefined;
    void act(sale.id, () => post(`/sales/${sale.id}/refund`, { amountMinor }));
  }

  if (loading) return <Spinner label="Loading sales" />;

  const authorizedCount = sales?.filter((sale) => sale.status === 'authorized').length ?? 0;

  return (
    <Page
      title="Sales"
      lede="Every sale created through any of the three flows, with the post-sale actions PayMe allows in each state."
      rail
    >
      <ErrorBanner error={error} />

      <Spread
        aside={
          authorizedCount > 0 ? (
            <Note
              tone="warning"
              title={`${authorizedCount} authorization${authorizedCount > 1 ? 's' : ''} still held`}
            >
              <p>
                An authorization holds funds on the buyer&#8217;s card for{' '}
                <strong className="font-semibold text-ink">168 hours</strong>.
                Capture within that window or the reservation lapses and the
                money is never taken. Capture happens once — fully or partially,
                with no second attempt.
              </p>
            </Note>
          ) : null
        }
      >
        {sales && sales.length === 0 ? (
          <EmptyState title="No sales yet">
            Take one from the Take a payment page, or buy something from the
            storefront as another user.
          </EmptyState>
        ) : (
          <Sheet flush>
            <Ledger>
              <thead>
                <tr>
                  <Th>Sale</Th>
                  <Th>Flow</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Buyer</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {sales?.map((sale) => {
                  const busy = busyId === sale.id;
                  const remaining = sale.priceMinor - sale.refundedMinor;

                  return (
                    <tr key={sale.id}>
                      <TdPrimary
                        name={sale.productName}
                        id={sale.paymeSaleId ?? 'not registered with PayMe'}
                      >
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {new Date(sale.createdAt).toLocaleString()}
                        </p>
                      </TdPrimary>

                      <Td>
                        {FLOW_LABELS[sale.flow] ?? sale.flow}
                        {sale.saleType === 'authorize' && (
                          <span className="mt-1 block font-mono text-[10px] text-ink-faint">
                            J5 authorize
                          </span>
                        )}
                      </Td>

                      <Td align="right">
                        <Money minor={sale.priceMinor} currency={sale.currency} />
                        {sale.refundedMinor > 0 && (
                          <span className="tabular mt-0.5 block font-mono text-[11px] text-stamp">
                            −{(sale.refundedMinor / 100).toFixed(2)} refunded
                          </span>
                        )}
                      </Td>

                      <Td>
                        <SaleStatusBadge status={sale.status} />
                        {sale.lastError && (
                          <p className="mt-1.5 max-w-[24ch] text-[11px] leading-snug text-stamp">
                            {sale.lastError}
                          </p>
                        )}
                      </Td>

                      <Td>
                        {sale.buyerName ?? <span className="text-ink-faint">—</span>}
                        {sale.buyerCardMask && (
                          <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                            {sale.buyerCardMask}
                          </span>
                        )}
                      </Td>

                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {sale.status === 'authorized' && (
                            <>
                              <Button
                                loading={busy}
                                onClick={() =>
                                  act(sale.id, () => post(`/sales/${sale.id}/capture`))
                                }
                                title="capture-sale — settle the reserved funds"
                              >
                                Capture
                              </Button>
                              <Button
                                variant="secondary"
                                loading={busy}
                                onClick={() => refund(sale)}
                                title="refund-sale on an uncaptured authorization releases the hold"
                              >
                                Void
                              </Button>
                            </>
                          )}
                          {(sale.status === 'completed' ||
                            sale.status === 'partial-refund') &&
                            remaining > 0 && (
                              <Button
                                variant="secondary"
                                loading={busy}
                                onClick={() => refund(sale)}
                              >
                                Refund
                              </Button>
                            )}
                          {sale.captureBuyerRequested && sale.status === 'completed' && (
                            <Button
                              variant="ghost"
                              loading={busy}
                              onClick={() =>
                                act(sale.id, () => post(`/sales/${sale.id}/buyer-key`))
                              }
                              title="get-buyer-key — recover the reusable token from this sale"
                            >
                              Fetch token
                            </Button>
                          )}
                          {sale.status === 'initial' && sale.saleUrl && (
                            <a
                              href={sale.saleUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-[3px] px-3 py-1.5 text-[13px] font-medium text-pen hover:bg-pen-wash"
                            >
                              Open payment page
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

      <Spread aside={null} className="pt-4">
        <Rule label="What each action really is" />
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {ACTIONS.map((action) => (
            <div key={action.label} className="border-t border-rule pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-serif text-[15px] text-ink">{action.label}</p>
                <Code>{action.endpoint}</Code>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                {action.body}
              </p>
            </div>
          ))}
        </div>
      </Spread>
    </Page>
  );
}
