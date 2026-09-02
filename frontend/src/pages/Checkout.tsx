import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { CURRENCIES, formatMoney, fromMinorUnits, toMinorUnits } from '../lib/money';
import {
  createPayMeInstance,
  FIELDS,
  FIELD_STYLES,
  type FieldEvent,
  type PayMeInstance,
  type TokenizationError,
} from '../lib/payme-hosted-fields';
import type { Product, Sale, SavedToken, Seller } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Note,
  Select,
  Spinner,
} from '../components/ui';
import { SaleStatusBadge } from '../components/StatusBadge';

type Flow = 'iframe' | 'hosted-fields' | 'token';

const FLOWS: Array<{ id: Flow; title: string; sub: string; body: string }> = [
  {
    id: 'iframe',
    title: 'Hosted payment page',
    sub: 'generate-sale → sale_url',
    body: 'PayMe renders the whole form. You embed the returned URL in an iframe or redirect to it. Least work, no PCI scope, least control over the look.',
  },
  {
    id: 'hosted-fields',
    title: 'Hosted Fields (JSAPI)',
    sub: 'generate-sale → tokenize in browser → pay-sale',
    body: 'PayMe serves just the card inputs as iframes inside your own checkout. Card data goes browser → PayMe; your server only ever handles the token.',
  },
  {
    id: 'token',
    title: 'Direct API with a saved token',
    sub: 'generate-sale + pay-sale, server-side',
    body: 'No UI at all. Charge a buyer_key captured on an earlier sale — one-click repeat purchases, and how you bill a returning customer.',
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

  if (loading) return <Spinner />;

  if (!seller) {
    return (
      <EmptyState title="You need a PayMe seller before you can take a payment">
        <Link to="/sell" className="text-indigo-600 hover:underline">
          Open one first
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Take a payment</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">
          Three ways to charge a buyer, all landing in the same place. Every one
          of them starts with <Code>generate-sale</Code> against{' '}
          <Code>{seller.paymeId}</Code>; what differs is where the card is
          entered.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {FLOWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFlow(item.id)}
            className={`rounded-xl border p-4 text-left transition ${
              flow === item.id
                ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:bg-indigo-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-0.5 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
              {item.sub}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.body}</p>
          </button>
        ))}
      </div>

      {flow === 'iframe' && <IframeCheckout products={products} />}
      {flow === 'hosted-fields' && (
        <HostedFieldsCheckout products={products} seller={seller} />
      )}
      {flow === 'token' && <TokenCheckout products={products} />}
    </div>
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
          <option value="">— one-off charge —</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {formatMoney(product.priceMinor, product.currency)}
            </option>
          ))}
        </Select>
      </Field>

      {!usingProduct && (
        <div className="grid gap-4 sm:grid-cols-[1fr_140px_110px]">
          <Field label="Description" hint="Sent as product_name; shown to the buyer.">
            <Input
              value={line.productName}
              onChange={(e) => setLine({ ...line, productName: e.target.value })}
            />
          </Field>
          <Field label="Amount" hint={`= ${priceMinor} minor units`}>
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
      )}

      {usingProduct && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Charging <strong>{formatMoney(priceMinor, currency)}</strong> —{' '}
          <Code>sale_price: {priceMinor}</Code>. The price comes from the listing,
          never from this form: a price in the request body is a price the buyer
          can edit.
        </p>
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

      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600"
            checked={line.captureBuyer}
            onChange={(e) => setLine({ ...line, captureBuyer: e.target.checked })}
          />
          <span className="text-sm">
            <span className="font-medium">Save the card for later</span>
            <span className="mt-0.5 block text-slate-500 dark:text-slate-400">
              Sends <Code>capture_buyer: "1"</Code>. PayMe returns a{' '}
              <Code>buyer_key</Code> on the callback that can be charged again
              without the buyer re-entering anything. Mutually exclusive with
              paying by token.
            </span>
          </span>
        </label>
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
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card title="Create the sale" description="POST /generate-sale">
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
      </Card>

      <Card
        title="PayMe's payment page"
        description={sale ? sale.saleUrl ?? '' : 'The iframe appears once the sale exists.'}
        actions={sale && <SaleStatusBadge status={sale.status} />}
      >
        {!sale && (
          <EmptyState title="No sale yet">
            <p>
              <Code>generate-sale</Code> answers with <Code>payme_sale_id</Code>{' '}
              and <Code>sale_url</Code>. The URL is what goes in the iframe.
            </p>
          </EmptyState>
        )}
        {sale?.saleUrl && (
          <div className="space-y-3">
            <Note>
              <p>
                Sandbox card: <Code>5326105300985846</Code>, exp{' '}
                <Code>12/30</Code>, CVV <Code>658</Code>, social ID{' '}
                <Code>008336174</Code>. Local ILS card, supports installments.
              </p>
            </Note>
            <iframe
              title="PayMe payment page"
              src={sale.saleUrl}
              className="h-[640px] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              After paying, the buyer is redirected to <Code>sale_return_url</Code>{' '}
              with the result in the query string — useful for UX, but not proof
              of payment. The signed server-to-server callback to{' '}
              <Code>sale_callback_url</Code> is the authoritative one.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow 2 — Hosted Fields                                              */
/* ------------------------------------------------------------------ */

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
      const options = { styles: FIELD_STYLES };

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
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card title="Create the sale" description="POST /generate-sale, then tokenize in the browser">
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
      </Card>

      <Card
        title="Your checkout, PayMe's inputs"
        description="Each field below is an iframe served by cdn.payme.io. The card number never enters this page's DOM."
        actions={sale && <SaleStatusBadge status={sale.status} />}
      >
        {stage === 'idle' && (
          <EmptyState title="Not started">
            <p>
              Create the sale first — Hosted Fields needs a{' '}
              <Code>payme_sale_id</Code> to charge against.
            </p>
          </EmptyState>
        )}

        {stage !== 'idle' && (
          <div className="space-y-4">
            <Note>
              <p>
                Initialised with the seller's <strong>public</strong> key{' '}
                <Code>{(sale?.publicKey ?? seller.publicKey ?? '').slice(0, 8)}…</Code>{' '}
                — never the partner key, which is a server-side credential.
              </p>
            </Note>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Card number</span>
                  {cardType !== 'unknown' && <Badge tone="info">{cardType}</Badge>}
                </div>
                <div
                  id="pm-card-number"
                  className="mt-1 h-10 rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-300 dark:bg-slate-950 dark:ring-slate-700"
                />
                <FieldMessage state={fieldState[FIELDS.NUMBER]} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm font-medium">Expiry</span>
                  <div
                    id="pm-card-expiry"
                    className="mt-1 h-10 rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-300 dark:bg-slate-950 dark:ring-slate-700"
                  />
                  <FieldMessage state={fieldState[FIELDS.EXPIRATION]} />
                </div>
                <div>
                  <span className="text-sm font-medium">CVV</span>
                  <div
                    id="pm-card-cvv"
                    className="mt-1 h-10 rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-300 dark:bg-slate-950 dark:ring-slate-700"
                  />
                  <FieldMessage state={fieldState[FIELDS.CVV]} />
                </div>
              </div>
            </div>

            {stage === 'ready' && (
              <>
                <Note>
                  <p>
                    Sandbox card <Code>5326105300985846</Code> · <Code>12/30</Code>{' '}
                    · <Code>658</Code>. Or try{' '}
                    <Code>4000000000000002</Code> to watch a decline come back.
                  </p>
                </Note>
                <Button onClick={payNow} loading={busy} className="w-full">
                  Pay {sale ? formatMoney(sale.priceMinor, sale.currency) : ''}
                </Button>
                {!allFieldsReportValid && (
                  <p className="text-center text-xs text-slate-500">
                    Not every field has reported itself valid yet — PayMe will
                    check again when you pay.
                  </p>
                )}
              </>
            )}

            {stage === 'paid' && sale && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="font-medium text-emerald-900 dark:text-emerald-200">
                  {sale.status === 'authorized'
                    ? 'Authorized — capture it from the Sales page within 168 hours.'
                    : 'Paid.'}
                </p>
                <dl className="mt-2 space-y-1 font-mono text-xs text-emerald-800 dark:text-emerald-300">
                  <div>payme_sale_id: {sale.paymeSaleId}</div>
                  {sale.paymeTransactionId && (
                    <div>payme_transaction_id: {sale.paymeTransactionId}</div>
                  )}
                  {sale.buyerCardMask && <div>card: {sale.buyerCardMask}</div>}
                </dl>
                <Link
                  to="/sales"
                  className="mt-3 inline-block text-sm font-medium text-emerald-800 underline dark:text-emerald-300"
                >
                  See it on the Sales page →
                </Link>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/** The three containers PayMe's field iframes are mounted into. */
const FIELD_CONTAINERS = ['pm-card-number', 'pm-card-expiry', 'pm-card-cvv'];

function FieldMessage({ state }: { state?: FieldEvent }) {
  if (!state || state.isValid) return null;
  return <p className="mt-1 text-xs text-red-600">{state.message}</p>;
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
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card title="Charge a saved card" description="generate-sale + pay-sale, both server-side">
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner error={error} />

          {tokens && tokens.length === 0 ? (
            <EmptyState title="No saved cards yet">
              <p>
                Run a sale with <strong>Save the card for later</strong> ticked —
                that sends <Code>capture_buyer: "1"</Code> and PayMe returns a{' '}
                <Code>buyer_key</Code> on the callback.
              </p>
            </EmptyState>
          ) : (
            <Field label="Saved card" hint="Each of these is a buyer_key from an earlier sale.">
              <Select value={buyerKey} onChange={(e) => setBuyerKey(e.target.value)}>
                {tokens?.map((token) => (
                  <option key={token.buyerKey} value={token.buyerKey}>
                    {token.cardMask ?? 'card'} · {token.buyerName ?? token.buyerEmail ?? '—'}
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

          <Note>
            <p>
              No buyer interaction and no 3-D Secure prompt: the card was already
              verified when the token was captured. That is what makes this the
              flow for subscriptions, one-click repeat orders and back-office
              charges.
            </p>
          </Note>

          <Button type="submit" loading={busy} disabled={!buyerKey} className="w-full">
            Charge {formatMoney(priceMinor, currency)}
          </Button>
        </form>
      </Card>

      <Card title="Result" actions={sale && <SaleStatusBadge status={sale.status} />}>
        {!sale && (
          <EmptyState title="Nothing charged yet">
            The response from <Code>pay-sale</Code> is synchronous — the sale
            details come straight back rather than arriving by callback.
          </EmptyState>
        )}
        {sale && (
          <dl className="space-y-2 font-mono text-xs">
            {[
              ['payme_sale_id', sale.paymeSaleId],
              ['payme_sale_code', sale.paymeSaleCode],
              ['payme_transaction_id', sale.paymeTransactionId],
              ['sale_status', sale.status],
              ['price', `${sale.priceMinor} ${sale.currency}`],
              ['buyer_card_mask', sale.buyerCardMask],
            ].map(([key, value]) => (
              <div key={key as string} className="flex gap-3">
                <dt className="w-44 shrink-0 text-slate-500 dark:text-slate-400">{key}</dt>
                <dd className="break-all">{value ?? '—'}</dd>
              </div>
            ))}
            {sale.lastError && (
              <div className="flex gap-3 text-red-600">
                <dt className="w-44 shrink-0">error</dt>
                <dd>{sale.lastError}</dd>
              </div>
            )}
          </dl>
        )}
      </Card>
    </div>
  );
}
