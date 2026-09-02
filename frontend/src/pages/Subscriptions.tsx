import { useState, type FormEvent } from 'react';
import { get, patch, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { CURRENCIES, formatMoney, toMinorUnits } from '../lib/money';
import type { SavedToken, Subscription } from '../lib/types';
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
  TableWrap,
  Td,
  Th,
} from '../components/ui';
import { SubscriptionStatusBadge } from '../components/StatusBadge';

const ITERATION_TYPES = [
  { value: 1, label: 'Daily' },
  { value: 2, label: 'Weekly' },
  { value: 3, label: 'Monthly' },
  { value: 4, label: 'Annually' },
];

/**
 * Recurring billing.
 *
 * PayMe drives the schedule, not you. Once a subscription is active, each
 * iteration is charged on PayMe's side and you find out through a
 * `sub-iteration-success` or `sub-failure` callback. There is no "charge the
 * next iteration" call, and polling is the wrong shape — wire up the callback.
 */
export function Subscriptions() {
  const { data, error, reload, setError } = useLoader(async () => {
    const [subs, savedTokens] = await Promise.all([
      get<Subscription[]>('/subscriptions'),
      get<SavedToken[]>('/sales/tokens').catch(() => [] as SavedToken[]),
    ]);
    return { subs, savedTokens };
  });
  const subscriptions = data?.subs ?? null;
  const tokens = data?.savedTokens ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    description: 'Marketplace Pro — monthly',
    price: '49.90',
    currency: 'ILS',
    iterationType: 3,
    iterations: -1,
    startDate: '',
    buyerKey: '',
  });

  async function act(id: string, run: () => Promise<unknown>) {
    setError(null);
    setBusyId(id);
    try {
      await run();
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await post<Subscription>('/subscriptions', {
        description: form.description,
        priceMinor: toMinorUnits(form.price),
        currency: form.currency,
        iterationType: Number(form.iterationType),
        iterations: Number(form.iterations),
        startDate: form.startDate || undefined,
        buyerKey: form.buyerKey || undefined,
      });
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  }

  function changePrice(subscription: Subscription) {
    const answer = window.prompt(
      `New per-iteration price for "${subscription.description}" (${subscription.currency}).\n\n` +
        'Takes effect from the next iteration; iterations already charged are untouched.',
      (subscription.priceMinor / 100).toFixed(2),
    );
    if (!answer) return;
    void act(subscription.id, () =>
      patch(`/subscriptions/${subscription.id}/price`, {
        priceMinor: toMinorUnits(answer),
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">
          <Code>generate-subscription</Code> creates the schedule; PayMe charges
          each iteration and tells you about it by callback.
        </p>
      </div>

      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card title="Active and past subscriptions">
          {!subscriptions && <Spinner />}
          {subscriptions && subscriptions.length === 0 && (
            <EmptyState title="No subscriptions yet">
              Create one on the right.
            </EmptyState>
          )}
          {subscriptions && subscriptions.length > 0 && (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th>Price</Th>
                  <Th>Cycle</Th>
                  <Th>Status</Th>
                  <Th>Next charge</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => {
                  const busy = busyId === subscription.id;
                  return (
                    <tr key={subscription.id}>
                      <Td>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {subscription.description}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">
                          {subscription.paymeSubId ?? 'not registered'}
                        </p>
                        {subscription.buyerCardMask && (
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {subscription.buyerCardMask}
                          </p>
                        )}
                      </Td>
                      <Td>
                        <span className="tabular-nums">
                          {formatMoney(subscription.priceMinor, subscription.currency)}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          per iteration
                        </span>
                      </Td>
                      <Td>
                        {subscription.iterationTypeLabel}
                        <span className="block text-[11px] text-slate-400">
                          {subscription.iterations === -1
                            ? 'until cancelled'
                            : `${subscription.iterationsCompleted}/${subscription.iterations} done`}
                        </span>
                      </Td>
                      <Td>
                        <SubscriptionStatusBadge
                          status={subscription.status}
                          label={subscription.statusLabel}
                        />
                        {subscription.lastError && (
                          <p className="mt-1 max-w-[200px] text-[11px] text-red-600">
                            {subscription.lastError}
                          </p>
                        )}
                      </Td>
                      <Td>
                        {subscription.nextDate
                          ? new Date(subscription.nextDate).toLocaleDateString()
                          : '—'}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {subscription.status === 1 && subscription.subUrl && (
                            <a
                              href={subscription.subUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                            >
                              Activation page
                            </a>
                          )}
                          {subscription.status === 2 && (
                            <Button
                              variant="secondary"
                              loading={busy}
                              onClick={() =>
                                act(subscription.id, () =>
                                  post(`/subscriptions/${subscription.id}/pause`),
                                )
                              }
                            >
                              Pause
                            </Button>
                          )}
                          {subscription.status === 3 && (
                            <Button
                              loading={busy}
                              onClick={() =>
                                act(subscription.id, () =>
                                  post(`/subscriptions/${subscription.id}/resume`),
                                )
                              }
                            >
                              Resume
                            </Button>
                          )}
                          {(subscription.status === 1 || subscription.status === 2) && (
                            <Button
                              variant="ghost"
                              loading={busy}
                              onClick={() => changePrice(subscription)}
                            >
                              Change price
                            </Button>
                          )}
                          {subscription.status !== 5 && subscription.status !== 6 && (
                            <Button
                              variant="danger"
                              loading={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancelling is permanent — a cancelled subscription cannot be resumed. Pause it instead if you might want it back.',
                                  )
                                ) {
                                  void act(subscription.id, () =>
                                    post(`/subscriptions/${subscription.id}/cancel`),
                                  );
                                }
                              }}
                            >
                              Cancel
                            </Button>
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

        <div className="space-y-6">
          <Card title="New subscription" description="POST /generate-subscription">
            <form onSubmit={create} className="space-y-4">
              <Field label="Description" hint="Shown to the buyer and on the invoice.">
                <Input
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field
                  label="Price per iteration"
                  hint={`= ${toMinorUnits(form.price || '0')} minor units`}
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
                    {CURRENCIES.map((code) => (
                      <option key={code}>{code}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cycle">
                  <Select
                    value={form.iterationType}
                    onChange={(e) =>
                      setForm({ ...form, iterationType: Number(e.target.value) })
                    }
                  >
                    {ITERATION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.value} — {type.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Iterations" hint="-1 runs until cancelled.">
                  <Input
                    type="number"
                    min={-1}
                    required
                    value={form.iterations}
                    onChange={(e) =>
                      setForm({ ...form, iterations: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>

              <Field label="Start date" hint="dd/mm/yyyy. Blank starts today.">
                <Input
                  placeholder="24/08/2026"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </Field>

              <Field
                label="Activate with a saved card"
                hint="With a token the subscription activates immediately. Without one, PayMe returns a page for the buyer to fill in."
              >
                <Select
                  value={form.buyerKey}
                  onChange={(e) => setForm({ ...form, buyerKey: e.target.value })}
                >
                  <option value="">— no token: return an activation page —</option>
                  {tokens.map((token) => (
                    <option key={token.buyerKey} value={token.buyerKey}>
                      {token.cardMask ?? 'card'} · {token.buyerName ?? '—'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" loading={creating} className="w-full">
                Create subscription
              </Button>
            </form>
          </Card>

          <Card title="Lifecycle">
            <ol className="space-y-3 text-sm">
              {[
                ['1 initial', 'Created. Nothing charged — the buyer has not paid yet.'],
                ['2 active', 'First iteration succeeded. PayMe charges the rest on schedule.'],
                ['3 paused', 'Stopped, reversibly. Resume with PATCH /subscriptions/{id}/resume.'],
                ['4 / 76 failed', '76 means PayMe will retry automatically; 4 means it gave up.'],
                ['5 cancelled', 'Terminal. Cannot be resumed.'],
                ['6 completed', 'All iterations ran.'],
              ].map(([status, body]) => (
                <li key={status}>
                  <p className="font-mono text-xs font-medium">{status}</p>
                  <p className="text-slate-600 dark:text-slate-400">{body}</p>
                </li>
              ))}
            </ol>
            <Note>
              <p>
                Each charge arrives as a <Code>sub-iteration-success</Code> or{' '}
                <Code>sub-failure</Code> callback. There is no endpoint to charge
                the next iteration yourself.
              </p>
            </Note>
          </Card>
        </div>
      </div>
    </div>
  );
}
