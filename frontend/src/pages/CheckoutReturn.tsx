import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { Sale } from '../lib/types';
import {
  Button,
  Code,
  DataList,
  Entry,
  Money,
  Note,
  Sheet,
  Spinner,
} from '../components/ui';
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
    <div className="mx-auto max-w-[42rem] space-y-8 py-4">
      <header className="border-b border-rule-strong pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[2rem] leading-tight tracking-[-0.015em] text-ink">
            {paymeStatus === 'success' ? 'Payment completed' : 'Back from PayMe'}
          </h1>
          {sale && <SaleStatusBadge status={sale.status} />}
        </div>
      </header>

      {loading && <Spinner label="Reading the sale back" />}

      {sale && (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-6 border-b border-rule pb-4">
            <div>
              <p className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[1.25rem] leading-snug text-ink">
                {sale.productName}
              </p>
              {sale.buyerCardMask && (
                <p className="mt-1 font-mono text-[11px] text-ink-faint">
                  paid with {sale.buyerCardMask}
                </p>
              )}
            </div>
            <Money minor={sale.priceMinor} currency={sale.currency} size="lg" minorUnits />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/sales">
              <Button>See it on the Sales page</Button>
            </Link>
            <Link to="/checkout">
              <Button variant="secondary">Take another payment</Button>
            </Link>
          </div>
        </div>
      )}

      <Sheet title="What PayMe put in the URL">
        <DataList>
          {[...params.entries()].map(([key, value]) => (
            <Entry key={key} term={key} wide>
              {value}
            </Entry>
          ))}
        </DataList>
        {params.get('payme_signature') && (
          <p className="mt-4 border-t border-rule pt-3 text-[12px] leading-relaxed text-ink-soft">
            The redirect carries a{' '}
            <Code>payme_signature</Code> too, computed the same way as the
            callback&#8217;s. It can be verified — but the redirect can also be
            skipped entirely by a buyer who closes the tab, so it is never the
            thing that fulfils an order.
          </p>
        )}
      </Sheet>

      <Note tone="warning" title="The status above did not come from this URL">
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
