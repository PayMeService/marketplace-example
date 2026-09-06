import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { CURRENCIES, formatMoney, fromMinorUnits, toMinorUnits } from '../lib/money';
import {
  createPayMeInstance,
  FIELDS,
  fieldStyles,
  type FieldEvent,
  type PayMeInstance,
  type TokenizationError,
} from '../lib/payme-hosted-fields';
import type { Product, Sale, SavedToken, Seller } from '../lib/types';
import {
  Button,
  Check,
  Code,
  DataList,
  EmptyState,
  Entry,
  ErrorBanner,
  Field,
  Input,
  Money,
  Note,
  Page,
  Rule,
  Select,
  Sheet,
  Slip,
  Spinner,
  Stamp,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

type Flow = 'iframe' | 'hosted-fields' | 'token';

/** The three ways to charge, described by the calls each one actually makes. */
const FLOWS: Array<{ id: Flow; title: string; calls: string; body: string }> = [
  {
    id: 'iframe',
    title: 'Hosted payment page',
    calls: 'generate-sale → sale_url',
    body: 'PayMe renders the whole form. You embed the returned URL or redirect to it. Least work, no PCI scope, least control over the look.',
  },
  {
    id: 'hosted-fields',
    title: 'Hosted Fields',
    calls: 'generate-sale → tokenize → pay-sale',
    body: 'PayMe serves just the card inputs as iframes inside your own checkout. Card data goes browser to PayMe; your server only ever handles the token.',
  },
  {
    id: 'token',
    title: 'Direct API',
    calls: 'generate-sale + pay-sale',
    body: 'No buyer interaction at all. Charge a buyer_key captured on an earlier sale — one-click repeat purchases, and how you bill a returning customer.',
  },
];

export function Checkout() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow>('iframe');

  useEffect(() => {
    Promise.all([
      get<Seller | null>('/sellers/me').catch(() => null),
      get<Product[]>('/products/mine').catch(() => []),
    ])
      .then(([fetchedSeller, fetchedProducts]) => {
        setSeller(fetchedSeller);
        setProducts(fetchedProducts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading your seller" />;

  if (!seller) {
    return (
      <EmptyState title="You need a PayMe seller before you can take a payment">
        <Link to="/sell" className="text-pen underline underline-offset-2">
          Open one first
        </Link>{' '}
        — every call on this page is made against a seller&#8217;s own MPL.
      </EmptyState>
    );
  }

  return (
    <Page
      title="Take a payment"
      lede={
        <>
          Three ways to charge a buyer, all landing in the same place. Every one
          starts with <Code>generate-sale</Code> against{' '}
          <Code>{seller.paymeId}</Code>; what differs is where the card is
          entered and who sees it.
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-3">
        {FLOWS.map((item) => {
          const selected = flow === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFlow(item.id)}
              className={`flex flex-col items-stretch justify-start rounded-2xl border bg-paper p-5 text-left shadow-[0_2px_10px_rgba(16,22,25,0.05)] transition-all duration-200 ${
                selected
                  ? 'border-transparent ring-2 ring-ink'
                  : 'border-rule hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(16,22,25,0.10)]'
              }`}
            >
              <h3 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[16px] text-ink">{item.title}</h3>
              <p className="mt-1 font-mono text-[10.5px] text-ink-faint">{item.calls}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{item.body}</p>
            </button>
          );
        })}
      </div>

      {flow === 'iframe' && <IframeCheckout products={products} />}
      {flow === 'hosted-fields' && (
        <HostedFieldsCheckout products={products} seller={seller} />
      )}
      {flow === 'token' && <TokenCheckout products={products} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Shared line-item picker                                             */
/* ------------------------------------------------------------------ */

interface LineState {
  productId: string;
  productName: string;
  price: string;
  currency: string;
  saleType: 'sale' | 'authorize';
  installments: string;
  captureBuyer: boolean;
  buyerName: string;
  buyerEmail: string;
}

const INITIAL_LINE: LineState = {
  productId: '',
  productName: 'Demo charge',
  price: '50.00',
  currency: 'ILS',
  saleType: 'sale',
  installments: '1',
  captureBuyer: false,
  buyerName: 'Test Buyer',
  buyerEmail: 'buyer@example.com',
};

function useLine(products: Product[]) {
  const [line, setLine] = useState<LineState>(INITIAL_LINE);
  const selected = products.find((product) => product.id === line.productId);

  const priceMinor = selected ? selected.priceMinor : toMinorUnits(line.price || '0');
  const currency = selected ? selected.currency : line.currency;

  /** Only the fields the API accepts, with the product taking precedence. */
  const payload = useMemo(
    () => ({
      ...(line.productId
        ? { productId: line.productId }
        : { productName: line.productName, priceMinor, currency }),
      saleType: line.saleType,
      installments: line.installments,
      captureBuyer: line.captureBuyer,
      buyerName: line.buyerName || undefined,
      buyerEmail: line.buyerEmail || undefined,
    }),
    [line, priceMinor, currency],
  );

  return { line, setLine, selected, priceMinor, currency, payload };
}

function LineFields({
  line,
  setLine,
  products,
  priceMinor,
  currency,
  showCaptureBuyer = true,
  showSaleType = true,
}: {
  line: LineState;
  setLine: (line: LineState) => void;
  products: Product[];
  priceMinor: number;
  currency: string;
  showCaptureBuyer?: boolean;
  showSaleType?: boolean;
}) {
  const usingProduct = Boolean(line.productId);

  return (
    <div className="space-y-4">
      <Field label="What is being sold" hint="Pick a listing, or describe a one-off charge.">
        <Select
          value={line.productId}
          onChange={(e) => setLine({ ...line, productId: e.target.value })}
        >
          <option value="">a one-off charge</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} — {formatMoney(product.priceMinor, product.currency)}
            </option>
          ))}
        </Select>
      </Field>

      {!usingProduct && (
        <div className="space-y-4">
          <Field label="Description" hint="Sent as product_name; the buyer sees it.">
            <Input
              value={line.productName}
              onChange={(e) => setLine({ ...line, productName: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Amount" hint={`Sent as ${priceMinor}`}>
              <Input
                type="number"
                step="0.01"
                min="5"
                value={line.price}
                onChange={(e) => setLine({ ...line, price: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={line.currency}
                onChange={(e) => setLine({ ...line, currency: e.target.value })}
              >
                {CURRENCIES.map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}

      {usingProduct && (
        <Slip tone="pen">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-ink-soft">Charging</span>
            <Money minor={priceMinor} currency={currency} size="lg" minorUnits />
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
            The price comes from the listing, never from this form. A price in
            the request body is a price the buyer can edit.
          </p>
        </Slip>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Buyer name">
          <Input
            value={line.buyerName}
            onChange={(e) => setLine({ ...line, buyerName: e.target.value })}
          />
        </Field>
        <Field label="Buyer email">
          <Input
            type="email"
            value={line.buyerEmail}
            onChange={(e) => setLine({ ...line, buyerEmail: e.target.value })}
          />
        </Field>
      </div>

      <div className="space-y-4">
        {showSaleType && (
          <Field
            label="Sale type"
            hint={
              line.saleType === 'authorize'
                ? 'J5 — reserves the amount for up to 168 hours; you settle it with capture-sale.'
                : 'J4 — charged immediately.'
            }
          >
            <Select
              value={line.saleType}
              onChange={(e) =>
                setLine({ ...line, saleType: e.target.value as 'sale' | 'authorize' })
              }
            >
              <option value="sale">sale — charge now (J4)</option>
              <option value="authorize">authorize — reserve now, capture later (J5)</option>
            </Select>
          </Field>
        )}
        <Field
          label="Installments"
          hint="A fixed count 1–12, or 103/106/109/112 to let the buyer choose up to 3/6/9/12."
        >
          <Input
            value={line.installments}
            onChange={(e) => setLine({ ...line, installments: e.target.value })}
          />
        </Field>
      </div>

      {showCaptureBuyer && (
        <Check
          checked={line.captureBuyer}
          onChange={(captureBuyer) => setLine({ ...line, captureBuyer })}
          label="Save the card for later"
        >
          Sends <Code>capture_buyer: &quot;1&quot;</Code>. PayMe returns a{' '}
          <Code>buyer_key</Code> on the callback that can be charged again
          without the buyer re-entering anything. Mutually exclusive with paying
          by token.
        </Check>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow 1 — hosted payment page                                        */
/* ------------------------------------------------------------------ */

function IframeCheckout({ products }: { products: Product[] }) {
  const { line, setLine, priceMinor, currency, payload } = useLine(products);
  const [paymentMethod, setPaymentMethod] = useState('credit-card');
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setSale(await post<Sale>('/sales/iframe', { ...payload, paymentMethod }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[30rem_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Rule step={1} label="Create the sale" hint="generate-sale" />
        <Sheet>
          <form onSubmit={submit} className="space-y-4">
            <ErrorBanner error={error} />
            <LineFields
              line={line}
              setLine={setLine}
              products={products}
              priceMinor={priceMinor}
              currency={currency}
            />
            <Field
              label="Payment method"
              hint="multi shows every method the seller has enabled and lets the buyer pick."
            >
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="credit-card">credit-card</option>
                <option value="multi">multi — buyer chooses</option>
                <option value="bit">bit</option>
                <option value="google-pay">google-pay</option>
                <option value="apple-pay">apple-pay</option>
                <option value="paypal">paypal</option>
              </Select>
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Generate payment page
            </Button>
          </form>
        </Sheet>
      </div>

      <div className="space-y-4">
        <Rule step={2} label="The buyer pays" hint="sale_url" />
        <Sheet
          title="PayMe’s payment page"
          description={sale?.saleUrl ?? 'The iframe appears once the sale exists.'}
          actions={sale && <SaleStatusBadge status={sale.status} />}
        >
          {!sale && (
            <EmptyState title="No sale yet">
              <Code>generate-sale</Code> answers with a{' '}
              <Code>payme_sale_id</Code> and a <Code>sale_url</Code>. The URL is
              what goes in the iframe.
            </EmptyState>
          )}
          {sale?.saleUrl && (
            <div className="space-y-3">
              <Note>
                <p>
                  Sandbox card <Code>5326105300985846</Code>, expiry{' '}
                  <Code>12/30</Code>, CVV <Code>658</Code>, social ID{' '}
                  <Code>008336174</Code>. A local ILS card, so installments work.
                </p>
              </Note>
              <iframe
                title="PayMe payment page"
                src={sale.saleUrl}
                className="h-[640px] w-full rounded-[3px] border border-rule bg-white"
              />
              <p className="text-[12px] leading-relaxed text-ink-soft">
                After paying, the buyer lands on <Code>sale_return_url</Code>{' '}
                with the result in the query string. Useful for the receipt, but
                not proof of payment — the signed callback to{' '}
                <Code>sale_callback_url</Code> is the authoritative one.
              </p>
            </div>
          )}
        </Sheet>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow 2 — Hosted Fields                                              */
/* ------------------------------------------------------------------ */

/** The three containers PayMe's field iframes are mounted into. */
const FIELD_CONTAINERS = ['pm-card-number', 'pm-card-expiry', 'pm-card-cvv'];

/* Matches Input's metrics exactly, so PayMe's iframes sit at the same height as
   the fields on the other side of the page. The height has to be explicit: an
   iframe with no intrinsic content height collapses to nothing. */
const FIELD_BOX =
  'mt-1.5 h-[34px] rounded-[3px] border border-rule-strong bg-paper px-2.5 py-1.5';

function HostedFieldsCheckout({
  products,
  seller,
}: {
  products: Product[];
  seller: Seller;
}) {
  const { line, setLine, priceMinor, currency, payload } = useLine(products);
  const [sale, setSale] = useState<Sale | null>(null);
  const [instance, setInstance] = useState<PayMeInstance | null>(null);
  const [fieldState, setFieldState] = useState<Record<string, FieldEvent>>({});
  const [cardType, setCardType] = useState<string>('unknown');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'mounting' | 'ready' | 'paid'>('idle');

  /**
   * Step 1 — reserve the sale server-side, then mount PayMe's field iframes.
   *
   * A PayMe instance can be tokenized exactly once. Every attempt therefore
   * starts from a fresh sale AND a fresh instance; retrying against a used one
   * fails with "Bad session".
   */
  async function startCheckout(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    setStage('mounting');
    setFieldState({});
    setCardType('unknown');

    // Tear down any previously mounted iframes FIRST.
    //
    // `mount()` appends into the container; it does not replace what is there.
    // Because a PayMe instance can only be tokenized once, "start over" always
    // builds a fresh instance — and without this the new card/expiry/CVV
    // iframes stack up underneath the dead ones from the previous attempt. The
    // buyer sees duplicated fields, and the ones they type into belong to a
    // spent session.
    for (const id of FIELD_CONTAINERS) {
      document.getElementById(id)?.replaceChildren();
    }

    try {
      const created = await post<Sale>('/sales/hosted-fields', payload);
      setSale(created);

      const publicKey = created.publicKey ?? seller.publicKey;
      if (!publicKey) {
        throw new Error(
          'This seller has no PayMe public key. Re-fetch it from the seller dashboard.',
        );
      }

      const payme = await createPayMeInstance(publicKey, {
        // Must match the environment the sale was created in — a sandbox token
        // cannot be charged against a live sale.
        testMode: true,
        language: 'en',
        tokenIsPermanent: line.captureBuyer,
      });

      const fields = payme.hostedFields();
      const options = { styles: fieldStyles() };

      const cardNumber = fields.create(FIELDS.NUMBER, {
        ...options,
        placeholder: '4580 4580 4580 4580',
      });
      const expiration = fields.create(FIELDS.EXPIRATION, {
        ...options,
        placeholder: 'MM / YY',
      });
      const cvv = fields.create(FIELDS.CVV, { ...options, placeholder: 'CVV' });

      const track = (event: FieldEvent) =>
        setFieldState((prev) => ({ ...prev, [event.field]: event }));

      for (const field of [cardNumber, expiration, cvv]) {
        field.on('validity-changed', track);
        field.on('blur', track);
      }
      cardNumber.on('card-type-changed', (event) => {
        track(event);
        setCardType(event.cardType ?? 'unknown');
      });

      await Promise.all([
        cardNumber.mount('#pm-card-number'),
        expiration.mount('#pm-card-expiry'),
        cvv.mount('#pm-card-cvv'),
      ]);

      setInstance(payme);
      setStage('ready');
    } catch (caught) {
      setError(caught);
      setStage('idle');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Step 2 — tokenize in the browser, step 3 — charge the token on the server.
   *
   * `total.amount.value` is a decimal string here, unlike everywhere else in
   * PayMe. It only drives what the buyer sees inside PayMe's iframe; the amount
   * actually charged is the one on the sale created in step 1, so the two must
   * agree.
   */
  async function payNow() {
    if (!instance || !sale) return;
    setError(null);
    setBusy(true);
    try {
      const result = await instance.tokenize({
        payerFirstName: line.buyerName.split(' ')[0] || 'Test',
        payerLastName: line.buyerName.split(' ').slice(1).join(' ') || 'Buyer',
        payerEmail: line.buyerEmail || 'buyer@example.com',
        payerPhone: '0501112233',
        payerSocialId: '008336174',
        total: {
          label: sale.productName,
          amount: {
            currency: sale.currency,
            value: fromMinorUnits(sale.priceMinor).toFixed(2),
          },
        },
      });

      // The token — and only the token — goes to our server.
      const paid = await post<Sale>(`/sales/${sale.id}/pay`, {
        buyerKey: result.token,
        buyerName: result.payerName,
        buyerEmail: result.payerEmail,
        installments: line.installments,
      });

      setSale(paid);
      setStage('paid');
      setInstance(null);
    } catch (caught) {
      const tokenError = caught as TokenizationError;
      if (tokenError?.type === 'tokenize-error') {
        setError(
          new Error(
            tokenError.validationError
              ? `Card details rejected: ${Object.entries(tokenError.errors ?? {})
                  .map(([field, message]) => `${field} — ${message}`)
                  .join('; ')}`
              : `${tokenError.error ?? 'Tokenization failed'}: ${tokenError.message ?? ''}. A PayMe instance can only be tokenized once — start the checkout again.`,
          ),
        );
        // The session is spent either way; force a fresh instance.
        setInstance(null);
        setStage('idle');
      } else {
        setError(caught);
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Whether every field has reported itself valid.
   *
   * Used to HINT, not to block. `validity-changed` is a convenience event from
   * inside a cross-origin iframe; if one is missed — a browser quirk, an
   * autofill path, a field that was never focused — a buyer with a perfectly
   * good card ends up staring at a disabled button with no way forward.
   *
   * `tokenize()` is the authority: it validates server-side and returns
   * `validationError` with a message per field, which is the same information
   * delivered by something that cannot silently not-fire. So let the buyer
   * press Pay and let PayMe answer.
   */
  const allFieldsReportValid =
    Boolean(fieldState[FIELDS.NUMBER]?.isValid) &&
    Boolean(fieldState[FIELDS.EXPIRATION]?.isValid) &&
    Boolean(fieldState[FIELDS.CVV]?.isValid);

  return (
    <div className="grid gap-8 lg:grid-cols-[30rem_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Rule step={1} label="Reserve the sale" hint="generate-sale" />
        <Sheet>
          <form onSubmit={startCheckout} className="space-y-4">
            <ErrorBanner error={error} />
            <LineFields
              line={line}
              setLine={setLine}
              products={products}
              priceMinor={priceMinor}
              currency={currency}
            />
            <Button type="submit" loading={busy && stage === 'mounting'} className="w-full">
              {stage === 'idle' ? 'Start checkout' : 'Start over with a new sale'}
            </Button>
          </form>
        </Sheet>

        <Note title="One session, one tokenization">
          <p>
            A PayMe instance can be tokenized exactly once. Every retry starts
            from a fresh sale and a fresh instance, and the field containers are
            emptied first — <Code>mount()</Code> appends rather than replaces,
            so without that the dead iframes stack up under the live ones.
          </p>
        </Note>
      </div>

      <div className="space-y-4">
        <Rule step={2} label="The buyer types their card" hint="cdn.payme.io iframes" />

        <Sheet
          title="Your checkout, PayMe’s inputs"
          description="Each field below is an iframe served by PayMe. The card number never enters this page’s DOM."
          actions={sale && <SaleStatusBadge status={sale.status} />}
        >
          {stage === 'idle' && (
            <EmptyState title="Not started">
              Reserve the sale first — Hosted Fields needs a{' '}
              <Code>payme_sale_id</Code> to charge against.
            </EmptyState>
          )}

          {stage !== 'idle' && (
            <div className="space-y-4">
              <Note>
                <p>
                  Initialised with the seller&#8217;s{' '}
                  <strong className="font-semibold text-ink">public</strong> key{' '}
                  <Code>{(sale?.publicKey ?? seller.publicKey ?? '').slice(0, 8)}…</Code>{' '}
                  — never the partner key, which is a server-side credential.
                </p>
              </Note>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-ink">Card number</span>
                    {cardType !== 'unknown' && <Stamp tone="info">{cardType}</Stamp>}
                  </div>
                  <div id="pm-card-number" className={FIELD_BOX} />
                  <FieldMessage state={fieldState[FIELDS.NUMBER]} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[13px] font-medium text-ink">Expiry</span>
                    <div id="pm-card-expiry" className={FIELD_BOX} />
                    <FieldMessage state={fieldState[FIELDS.EXPIRATION]} />
                  </div>
                  <div>
                    <span className="text-[13px] font-medium text-ink">CVV</span>
                    <div id="pm-card-cvv" className={FIELD_BOX} />
                    <FieldMessage state={fieldState[FIELDS.CVV]} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Sheet>

        {stage === 'ready' && (
          <>
            <Rule step={3} label="Charge the token" hint="pay-sale" />
            <Sheet>
              <Note>
                <p>
                  Sandbox card <Code>5326105300985846</Code>, <Code>12/30</Code>,{' '}
                  <Code>658</Code>. Or try <Code>4000000000000002</Code> to watch
                  a decline come back.
                </p>
              </Note>
              <Button onClick={payNow} loading={busy} className="mt-4 w-full">
                Pay {sale ? formatMoney(sale.priceMinor, sale.currency) : ''}
              </Button>
              {!allFieldsReportValid && (
                <p className="mt-2 text-center text-[12px] text-ink-faint">
                  Not every field has reported itself valid yet. PayMe checks
                  again when you pay, so this is a hint rather than a block.
                </p>
              )}
            </Sheet>
          </>
        )}

        {stage === 'paid' && sale && (
          <>
            <Rule step={3} label="Charged" hint="pay-sale" />
            <Slip tone="seal">
              <p className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[16px] text-seal">
                {sale.status === 'authorized'
                  ? 'Authorized. Capture it from the Sales page within 168 hours.'
                  : 'Paid.'}
              </p>
              <div className="mt-3">
                <DataList>
                  <Entry term="payme_sale_id" wide>
                    {sale.paymeSaleId}
                  </Entry>
                  {sale.paymeTransactionId && (
                    <Entry term="payme_transaction_id" wide>
                      {sale.paymeTransactionId}
                    </Entry>
                  )}
                  {sale.buyerCardMask && (
                    <Entry term="card" wide>
                      {sale.buyerCardMask}
                    </Entry>
                  )}
                </DataList>
              </div>
              <Link
                to="/sales"
                className="mt-3 inline-block text-[13px] font-medium text-pen underline underline-offset-2"
              >
                See it on the Sales page
              </Link>
            </Slip>
          </>
        )}
      </div>
    </div>
  );
}

function FieldMessage({ state }: { state?: FieldEvent }) {
  if (!state || state.isValid) return null;
  return <p className="mt-1 text-[12px] text-stamp">{state.message}</p>;
}

/* ------------------------------------------------------------------ */
/* Flow 3 — charge a saved token                                       */
/* ------------------------------------------------------------------ */

function TokenCheckout({ products }: { products: Product[] }) {
  const { line, setLine, priceMinor, currency, payload } = useLine(products);
  const [tokens, setTokens] = useState<SavedToken[] | null>(null);
  const [buyerKey, setBuyerKey] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<SavedToken[]>('/sales/tokens')
      .then((fetched) => {
        setTokens(fetched);
        if (fetched[0]) setBuyerKey(fetched[0].buyerKey);
      })
      .catch(setError);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setSale(
        await post<Sale>('/sales/charge-token', {
          ...payload,
          // capture_buyer and buyer_key cannot co-exist — we are charging an
          // existing token, not creating a new one.
          captureBuyer: false,
          buyerKey,
        }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[30rem_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <Rule step={1} label="Charge a saved card" hint="generate-sale + pay-sale" />
        <Sheet>
          <form onSubmit={submit} className="space-y-4">
            <ErrorBanner error={error} />

            {tokens && tokens.length === 0 ? (
              <EmptyState title="No saved cards yet">
                Run a sale with <strong>Save the card for later</strong> ticked.
                That sends <Code>capture_buyer: &quot;1&quot;</Code> and PayMe
                returns a <Code>buyer_key</Code> on the callback.
              </EmptyState>
            ) : (
              <Field label="Saved card" hint="Each of these is a buyer_key from an earlier sale.">
                <Select value={buyerKey} onChange={(e) => setBuyerKey(e.target.value)}>
                  {tokens?.map((token) => (
                    <option key={token.buyerKey} value={token.buyerKey}>
                      {token.cardMask ?? 'card'} —{' '}
                      {token.buyerName ?? token.buyerEmail ?? 'unnamed buyer'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <LineFields
              line={line}
              setLine={setLine}
              products={products}
              priceMinor={priceMinor}
              currency={currency}
              showCaptureBuyer={false}
            />

            <Button type="submit" loading={busy} disabled={!buyerKey} className="w-full">
              Charge {formatMoney(priceMinor, currency)}
            </Button>
          </form>
        </Sheet>

        <Note title="No buyer, no 3-D Secure">
          <p>
            The card was already verified when the token was captured, so there
            is no prompt and nothing for anyone to type. That is what makes this
            the flow for subscriptions, one-click repeat orders and back-office
            charges.
          </p>
        </Note>
      </div>

      <div className="space-y-4">
        <Rule step={2} label="The response" hint="synchronous" />
        <Sheet
          title="What pay-sale returned"
          actions={sale && <SaleStatusBadge status={sale.status} />}
        >
          {!sale && (
            <EmptyState title="Nothing charged yet">
              <Code>pay-sale</Code> answers synchronously — the sale details come
              straight back rather than arriving by callback.
            </EmptyState>
          )}
          {sale && (
            <DataList>
              <Entry term="payme_sale_id" wide>
                {sale.paymeSaleId ?? '—'}
              </Entry>
              <Entry term="payme_sale_code" wide>
                {sale.paymeSaleCode ?? '—'}
              </Entry>
              <Entry term="payme_transaction_id" wide>
                {sale.paymeTransactionId ?? '—'}
              </Entry>
              <Entry term="sale_status">{sale.status}</Entry>
              <Entry term="price">
                <Money minor={sale.priceMinor} currency={sale.currency} size="sm" minorUnits />
              </Entry>
              <Entry term="buyer_card_mask" wide>
                {sale.buyerCardMask ?? '—'}
              </Entry>
              {sale.lastError && (
                <Entry term="error">
                  <span className="text-stamp">{sale.lastError}</span>
                </Entry>
              )}
            </DataList>
          )}
        </Sheet>
      </div>
    </div>
  );
}
