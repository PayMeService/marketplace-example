import { useState, type FormEvent } from 'react';
import { get, patch, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { CURRENCIES, toMinorUnits } from '../lib/money';
import type { SavedToken, Subscription } from '../lib/types';
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
  Rule,
  Select,
  Sheet,
  Spinner,
  Spread,
  Td,
  TdPrimary,
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
 * PayMe's subscription statuses. The numbers are PayMe's own codes, not an
 * ordering we invented — 76 sits out of sequence because it is a distinct
 * failure mode, not the seventy-sixth state.
 */
const LIFECYCLE = [
  ['1', 'initial', 'Created. Nothing charged — the buyer has not paid yet.'],
  ['2', 'active', 'First iteration succeeded. PayMe charges the rest on schedule.'],
  ['3', 'paused', 'Stopped, reversibly. Resume it whenever.'],
  ['4', 'failed', 'PayMe gave up on this subscription.'],
  ['76', 'retrying', 'A charge failed and PayMe will try again by itself.'],
  ['5', 'cancelled', 'Terminal. Cannot be resumed.'],
  ['6', 'completed', 'Every iteration ran.'],
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
    <Page
      title="Subscriptions"
      lede={
        <>
          <Code>generate-subscription</Code> creates the schedule. From then on
          PayMe charges each iteration itself and tells you about it by callback
          — there is no endpoint for charging the next one.
        </>
      }
      rail
    >
      <ErrorBanner error={error} />

      <Spread aside={null}>
        {!subscriptions && <Spinner label="Loading subscriptions" />}

        {subscriptions && subscriptions.length === 0 && (
          <EmptyState title="No subscriptions yet">
            Create one below. With a saved card it activates immediately;
            without one PayMe returns a page for the buyer to fill in.
          </EmptyState>
        )}

        {subscriptions && subscriptions.length > 0 && (
          <Sheet flush>
            <Ledger>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th align="right">Per iteration</Th>
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
                      <TdPrimary
                        name={subscription.description}
                        id={subscription.paymeSubId ?? 'not registered with PayMe'}
                      >
                        {subscription.buyerCardMask && (
                          <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                            {subscription.buyerCardMask}
                          </p>
                        )}
                      </TdPrimary>

                      <Td align="right">
                        <Money
                          minor={subscription.priceMinor}
                          currency={subscription.currency}
                        />
                      </Td>

                      <Td>
                        {subscription.iterationTypeLabel}
                        <span className="mt-0.5 block text-[11px] text-ink-faint">
                          {subscription.iterations === -1
                            ? 'until cancelled'
                            : `${subscription.iterationsCompleted} of ${subscription.iterations} charged`}
                        </span>
                      </Td>

                      <Td>
                        <SubscriptionStatusBadge
                          status={subscription.status}
                          label={subscription.statusLabel}
                        />
                        {subscription.lastError && (
                          <p className="mt-1.5 max-w-[24ch] text-[11px] leading-snug text-stamp">
                            {subscription.lastError}
                          </p>
                        )}
                      </Td>

                      <Td>
                        {subscription.nextDate ? (
                          <span className="tabular font-mono text-[12px]">
                            {new Date(subscription.nextDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </Td>

                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {subscription.status === 1 && subscription.subUrl && (
                            <a
                              href={subscription.subUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-[3px] px-3 py-1.5 text-[13px] font-medium text-pen hover:bg-pen-wash"
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
            </Ledger>
          </Sheet>
        )}
      </Spread>

      <Spread
        aside={
          <Note title="PayMe owns the schedule">
            <p>
              Each charge arrives as a <Code>sub-iteration-success</Code> or{' '}
              <Code>sub-failure</Code> callback. There is no endpoint to charge
              the next iteration yourself, and polling for one is the wrong
              shape — wire up the callback instead.
            </p>
          </Note>
        }
      >
        <Rule label="Start a new one" hint="generate-subscription" />

        <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
          <Sheet>
            <form onSubmit={create} className="space-y-4">
              <Field label="Description" hint="Shown to the buyer and on the invoice.">
                <Input
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field
                  label="Price per iteration"
                  hint={`Sent as ${toMinorUnits(form.price || '0')}`}
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
                  <option value="">no token — return an activation page</option>
                  {tokens.map((token) => (
                    <option key={token.buyerKey} value={token.buyerKey}>
                      {token.cardMask ?? 'card'} — {token.buyerName ?? 'unnamed buyer'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" loading={creating} className="w-full">
                Create subscription
              </Button>
            </form>
          </Sheet>

          <div>
            <h3 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] text-ink">
              Where a subscription can be
            </h3>
            <dl className="mt-3">
              {LIFECYCLE.map(([code, name, body]) => (
                <div
                  key={code + name}
                  className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-t border-rule py-2.5"
                >
                  <dt className="tabular font-mono text-[12px] text-ink-faint">{code}</dt>
                  <dd>
                    <p className="font-mono text-[12px] text-ink">{name}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                      {body}
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Spread>
    </Page>
  );
}
