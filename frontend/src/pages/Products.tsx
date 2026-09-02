import { useState, type FormEvent } from 'react';
import { del, get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { CURRENCIES, formatMoney, PAYME_MIN_AMOUNT_MINOR, toMinorUnits } from '../lib/money';
import type { Product } from '../lib/types';
import {
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
  Td,
  TableWrap,
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title="My products" description="Anything listed here can be sold through any of the three checkout flows.">
        <ErrorBanner error={error} />
        {loading && <Spinner />}
        {products && products.length === 0 && (
          <EmptyState title="No products yet">
            Add one on the right to have something to charge for.
          </EmptyState>
        )}
        {products && products.length > 0 && (
          <TableWrap>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Price</Th>
                <Th>Minor units</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <Td>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {product.name}
                    </p>
                    {product.description && (
                      <p className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                        {product.description}
                      </p>
                    )}
                  </Td>
                  <Td>{formatMoney(product.priceMinor, product.currency)}</Td>
                  <Td>
                    <span className="font-mono text-xs">{product.priceMinor}</span>
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await del(`/products/${product.id}`);
                        reload();
                      }}
                    >
                      Delete
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="List a product">
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
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field
              label="Price"
              hint={
                form.price
                  ? `Sent to PayMe as ${priceMinor} minor units`
                  : 'Enter it the way a buyer reads it, e.g. 50.75'
              }
              error={
                belowMinimum
                  ? `PayMe’s minimum is ${PAYME_MIN_AMOUNT_MINOR} minor units (5.00)`
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

          <Note title="Why minor units">
            <p>
              PayMe amounts are always integers in the currency's smallest unit.{' '}
              <Code>sale_price: 5075</Code> is 50.75 — sending{' '}
              <Code>50.75</Code> charges 50 agorot and is accepted without
              complaint.
            </p>
          </Note>

          <Button type="submit" loading={busy} disabled={belowMinimum} className="w-full">
            Add product
          </Button>
        </form>
      </Card>
    </div>
  );
}
