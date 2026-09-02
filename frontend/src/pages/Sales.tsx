import { useState } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney, fromMinorUnits, toMinorUnits } from '../lib/money';
import type { Sale } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  ErrorBanner,
  Note,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

const FLOW_LABELS: Record<string, string> = {
  iframe: 'Hosted page',
  'hosted-fields': 'Hosted Fields',
  'pay-sale': 'Direct API',
};

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

  if (loading) return <Spinner />;

  const authorizedCount = sales?.filter((sale) => sale.status === 'authorized').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">
          Every sale created through any of the three flows, with the post-sale
          actions PayMe allows in each state.
        </p>
      </div>

      <ErrorBanner error={error} />

      {authorizedCount > 0 && (
        <Note tone="warning" title={`${authorizedCount} authorization${authorizedCount > 1 ? 's' : ''} awaiting capture`}>
          <p>
            An authorization holds the funds on the buyer's card for{' '}
            <strong>168 hours</strong>. Capture within that window or the
            reservation lapses and the money is never taken. Capture happens{' '}
            <strong>once</strong> — fully or partially, with no second attempt.
          </p>
        </Note>
      )}

      <Card>
        {sales && sales.length === 0 ? (
          <EmptyState title="No sales yet">
            Take one from the <Code>Take a payment</Code> page.
          </EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Sale</Th>
                <Th>Flow</Th>
                <Th>Amount</Th>
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
                    <Td>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {sale.productName}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">
                        {sale.paymeSaleId ?? 'not registered'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(sale.createdAt).toLocaleString()}
                      </p>
                    </Td>
                    <Td>
                      <Badge>{FLOW_LABELS[sale.flow] ?? sale.flow}</Badge>
                      {sale.saleType === 'authorize' && (
                        <span className="mt-1 block text-[11px] text-slate-400">J5 authorize</span>
                      )}
                    </Td>
                    <Td>
                      <span className="tabular-nums">
                        {formatMoney(sale.priceMinor, sale.currency)}
                      </span>
                      {sale.refundedMinor > 0 && (
                        <span className="mt-0.5 block text-[11px] text-amber-600">
                          −{formatMoney(sale.refundedMinor, sale.currency)} refunded
                        </span>
                      )}
                    </Td>
                    <Td>
                      <SaleStatusBadge status={sale.status} />
                      {sale.lastError && (
                        <p className="mt-1 max-w-[220px] text-[11px] text-red-600">
                          {sale.lastError}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <p>{sale.buyerName ?? '—'}</p>
                      {sale.buyerCardMask && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {sale.buyerCardMask}
                        </p>
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
                            <Button variant="secondary" loading={busy} onClick={() => refund(sale)}>
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
                            className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                          >
                            Open page
                          </a>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="What each action maps to">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {[
            [
              'Capture',
              'POST /capture-sale',
              'Settles an authorization. Requires sale_type="authorize" and status authorized, within 168 hours of the authorization. Once only — there is no second capture.',
            ],
            [
              'Void',
              'POST /refund-sale',
              'The same endpoint as a refund. On an authorization that was never captured it releases the hold; PayMe reports the result as voided rather than refunded.',
            ],
            [
              'Refund',
              'POST /refund-sale',
              'Full when sale_refund_amount is omitted, partial when it is set. Can run repeatedly as long as the total stays within the original amount.',
            ],
            [
              'Fetch token',
              'POST /get-buyer-key',
              'Recovers the reusable buyer_key from a sale that was created with capture_buyer="1" — useful when the callback was missed.',
            ],
          ].map(([label, endpoint, body]) => (
            <div key={label}>
              <dt className="font-medium">
                {label} <Code>{endpoint}</Code>
              </dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-400">{body}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
