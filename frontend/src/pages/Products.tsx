import { useState, type FormEvent } from 'react';
import { del, get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { CURRENCIES, PAYME_MIN_AMOUNT_MINOR, toMinorUnits } from '../lib/money';
import type { Product } from '../lib/types';
import {
  Button,
  Code,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Ledger,
  Money,
  Note,
  Page,
  Select,
  Sheet,
  Spinner,
  Td,
  TdPrimary,
  Textarea,
  Th,
} from '../components/ui';

/**
 * A user's own listings.
 *
 * The price input is the one place in the app where a decimal is entered; it is
 * converted to minor units immediately and stays an integer everywhere after
 * that. See lib/money.ts.
 */
export function Products() {
  const {
    data: products,
    error,
    loading,
    reload,
    setError,
  } = useLoader(() => get<Product[]>('/products/mine'));
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'ILS',
  });

  const priceMinor = toMinorUnits(form.price || '0');
  const belowMinimum = form.price !== '' && priceMinor < PAYME_MIN_AMOUNT_MINOR;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post<Product>('/products', {
        name: form.name,
        description: form.description,
        priceMinor,
        currency: form.currency,
      });
      setForm({ name: '', description: '', price: '', currency: form.currency });
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Delete “${product.name}”? It disappears from the storefront.`)) {
      return;
    }
    setError(null);
    try {
      await del(`/products/${product.id}`);
      reload();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Page
      title="My products"
      lede="Anything listed here can be sold through any of the three checkout flows, or bought directly from the storefront by another user."
    >
      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {loading && <Spinner label="Loading your listings" />}

        {products && products.length === 0 && (
          <EmptyState title="No products yet">
            Add one alongside to have something to charge for.
          </EmptyState>
        )}

        {products && products.length > 0 && (
          <Sheet flush>
            <Ledger>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">Price</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <TdPrimary name={product.name}>
                      {product.description && (
                        <p className="mt-1 max-w-[46ch] text-[12px] leading-relaxed text-ink-soft">
                          {product.description}
                        </p>
                      )}
                    </TdPrimary>
                    <Td align="right">
                      <Money
                        minor={product.priceMinor}
                        currency={product.currency}
                        minorUnits
                      />
                    </Td>
                    <Td align="right">
                      <Button variant="ghost" onClick={() => remove(product)}>
                        Delete
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Ledger>
          </Sheet>
        )}

        <Sheet title="List a product">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field
                label="Price"
                hint={
                  form.price
                    ? `Sent to PayMe as ${priceMinor}`
                    : 'Enter it the way a buyer reads it, e.g. 50.75'
                }
                error={
                  belowMinimum
                    ? `PayMe’s minimum is ${PAYME_MIN_AMOUNT_MINOR} minor units, i.e. 5.00`
                    : undefined
                }
              >
                <Input
                  type="number"
                  step="0.01"
                  min="5"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Note title="Why the second number">
              <p>
                PayMe amounts are always integers in the currency&#8217;s
                smallest unit. <Code>sale_price: 5075</Code> is 50.75 — sending{' '}
                <Code>50.75</Code> charges 50 agorot and is accepted without
                complaint, so the integer is printed everywhere the price is.
              </p>
            </Note>

            <Button type="submit" loading={busy} disabled={belowMinimum} className="w-full">
              Add product
            </Button>
          </form>
        </Sheet>
      </div>
    </Page>
  );
}
