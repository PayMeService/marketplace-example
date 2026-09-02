import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import type { Sale } from '../lib/types';
import { Badge, Button, Card, Code, Note, Spinner } from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

/**
 * Where PayMe's hosted page sends the buyer after payment.
 *
 * PayMe appends the outcome to `sale_return_url` as query parameters:
 *   payme_status, payme_signature, payme_sale_id, payme_transaction_id,
 *   price, currency, transaction_id, is_token_sale
 *
 * THIS IS A UX SIGNAL, NOT PROOF OF PAYMENT. The buyer controls their browser:
 * the redirect can be forged, replayed, or simply never followed because they
 * closed the tab. It is fine to show a receipt from it — this page does — but
 * the thing that fulfils the order is the signed server-to-server callback.
 * Note that the sale status shown below is read back from our own API, which
 * only ever learns it from a verified callback or a synchronous PayMe response.
 */
export function CheckoutReturn() {
  const [params] = useSearchParams();
  const saleId = params.get('saleId');
  const paymeStatus = params.get('payme_status');

  // The status shown below comes from OUR api, not from the query string —
  // see the note at the top of this file. A failure here is not worth an error
  // banner: the buyer has paid either way, and the receipt degrades to the
  // parameters PayMe sent.
  const { data: sale, loading } = useLoader(
    async () => (saleId ? await get<Sale>(`/sales/${saleId}`) : null),
    saleId,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card
        title={paymeStatus === 'success' ? 'Payment completed' : 'Back from PayMe'}
        actions={sale && <SaleStatusBadge status={sale.status} />}
      >
        {loading && <Spinner />}

        {sale && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Item</dt>
              <dd className="font-medium">{sale.productName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Amount</dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(sale.priceMinor, sale.currency)}
              </dd>
            </div>
            {sale.buyerCardMask && (
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Card</dt>
                <dd className="font-mono text-xs">{sale.buyerCardMask}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-5 flex gap-2">
          <Link to="/sales">
            <Button>See it on the Sales page</Button>
          </Link>
          <Link to="/checkout">
            <Button variant="secondary">Take another payment</Button>
          </Link>
        </div>
      </Card>

      <Card title="What PayMe put in the URL">
        <dl className="space-y-1.5 font-mono text-xs">
          {[...params.entries()].map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <dt className="w-48 shrink-0 text-slate-500 dark:text-slate-400">{key}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
        {params.get('payme_signature') && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <Badge tone="info">note</Badge> The redirect carries a{' '}
            <Code>payme_signature</Code> too, computed the same way as the
            callback's. It can be verified — but the redirect can also be skipped
            entirely by a buyer who closes the tab, so it is never the thing that
            fulfils an order.
          </p>
        )}
      </Card>

      <Note title="The status above did not come from this URL">
        <p>
          It was read back from our own API, which only records a sale as paid
          from a signed callback or a synchronous <Code>pay-sale</Code> response.
          Treating the redirect as the source of truth is how a marketplace ships
          goods for a payment that never happened.
        </p>
      </Note>
    </div>
  );
}
