import { useState } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { CallbackEvent, PayMeSettings } from '../lib/types';
import {
  Button,
  Code,
  ErrorBanner,
  Field,
  Input,
  Note,
  Page,
  Rule,
  Select,
  Sheet,
  Spinner,
  Spread,
  Stamp,
} from '../components/ui';
import { SignatureBadge } from '../components/StatusBadge';

/** The two formulas, side by side, because the difference is the whole trap. */
const FORMULAS = [
  {
    kind: 'Sale callbacks',
    formula: 'md5(client_key + client_secret + payme_transaction_id + payme_sale_id)',
  },
  {
    kind: 'Subscription callbacks',
    formula: 'md5(client_key + client_secret + transaction_id + sub_payme_id)',
  },
];

/**
 * The callback log, plus a local simulator.
 *
 * Every notification PayMe sends is recorded here — accepted AND rejected. A
 * run of `invalid` rows is either a misconfigured secret or someone probing the
 * endpoint, and you can only see either if rejected callbacks are stored rather
 * than dropped at the door.
 */
export function AdminCallbacks() {
  const { data, error, reload, setError } = useLoader(async () => {
    const [fetchedEvents, fetchedSettings] = await Promise.all([
      get<CallbackEvent[]>('/callbacks/payme/events'),
      get<PayMeSettings>('/settings/payme').catch(() => null),
    ]);
    return { events: fetchedEvents, settings: fetchedSettings };
  });
  const events = data?.events ?? null;
  const settings = data?.settings ?? null;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sim, setSim] = useState({
    kind: 'sale' as 'sale' | 'subscription' | 'seller',
    entityId: '',
    notifyType: 'sale-complete',
    signed: true,
  });

  async function simulate() {
    setError(null);
    setBusy(true);
    try {
      await post('/callbacks/payme/simulate', sim);
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Callbacks"
      lede="PayMe’s server-to-server notifications, and the signature verdict on each. Verify first, act second — the endpoint is public and the signature is the whole of its authentication."
      rail
    >
      <ErrorBanner error={error} />

      <Spread
        aside={
          <Note tone="warning" title="The trap">
            <p>
              Both hashes take PayMe&#8217;s transaction guid. It just arrives
              under a different key: sale callbacks carry it as{' '}
              <Code>payme_transaction_id</Code>, subscription callbacks as{' '}
              <Code>transaction_id</Code>.
            </p>
            <p>
              The <Code>transaction_id</Code> you <em>send</em> on generate-sale
              is your own order id and is never hashed. Using it looks exactly
              like a wrong secret.
            </p>
          </Note>
        }
      >
        <Rule label="How a callback is verified" hint="payme_signature" />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
          <div className="space-y-4">
            {FORMULAS.map((item) => (
              <div key={item.kind}>
                <p className="text-[13px] font-medium text-ink">{item.kind}</p>
                <p className="mt-1.5 overflow-x-auto rounded-[3px] border border-rule bg-ledger-alt px-3 py-2 font-mono text-[11.5px] text-ink">
                  {item.formula}
                </p>
              </div>
            ))}
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-soft">
              Seller callbacks (<Code>seller-create</Code>,{' '}
              <Code>seller-approve</Code>) carry no signature at all. Treat them
              as a hint to re-read state with <Code>get-sellers</Code>, never as
              fact.
            </p>
          </div>

          <Sheet title="Delivery">
            {/* Terms sit above their values here rather than beside them: this
                column is a third the width of the page's, and a tunnel URL put
                in a side-by-side grid breaks into four lines. */}
            {settings && (
              <dl className="space-y-3">
                <div>
                  <dt className="font-mono text-[11px] text-ink-faint">secret</dt>
                  <dd className="mt-1">
                    <Stamp tone={settings.clientSecretConfigured ? 'success' : 'danger'}>
                      {settings.clientSecretConfigured ? 'configured' : 'missing'}
                    </Stamp>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] text-ink-faint">reachable</dt>
                  <dd className="mt-1">
                    <Stamp tone={settings.callbacksReachable ? 'success' : 'warning'}>
                      {settings.callbacksReachable ? 'yes' : 'localhost'}
                    </Stamp>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] text-ink-faint">base_url</dt>
                  <dd className="mt-1 font-mono text-[11px] leading-relaxed break-words text-ink">
                    {settings.publicBaseUrl || '—'}
                  </dd>
                </div>
              </dl>
            )}
            {settings && !settings.callbacksReachable && (
              <div className="mt-4">
                <Note tone="warning" title="No callbacks will arrive">
                  <p>
                    PayMe refuses localhost callback URLs, so the backend omits{' '}
                    <Code>sale_callback_url</Code> entirely rather than have
                    generate-sale fail. Run{' '}
                    <Code>cloudflared tunnel --url http://localhost:3000</Code>{' '}
                    and point <Code>PUBLIC_BASE_URL</Code> at it, or use the
                    simulator below.
                  </p>
                </Note>
              </div>
            )}
          </Sheet>
        </div>
      </Spread>

      <Spread
        aside={
          <Note title="Send a wrong signature at least once">
            <p>
              Watching a forged callback be rejected is the only way to know the
              check is live. The simulator builds a real payload and feeds it
              through the real handler — the signature check is exercised, not
              bypassed.
            </p>
          </Note>
        }
      >
        <Rule label="Simulate a callback" hint="local only" />

        <Sheet>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kind">
              <Select
                value={sim.kind}
                onChange={(e) => {
                  const kind = e.target.value as typeof sim.kind;
                  setSim({
                    ...sim,
                    kind,
                    notifyType:
                      kind === 'sale'
                        ? 'sale-complete'
                        : kind === 'subscription'
                          ? 'sub-iteration-success'
                          : 'seller-approve',
                  });
                }}
              >
                <option value="sale">sale</option>
                <option value="subscription">subscription</option>
                <option value="seller">seller</option>
              </Select>
            </Field>
            <Field
              label="Entity id"
              hint={
                sim.kind === 'sale'
                  ? 'payme_sale_id (SALE…)'
                  : sim.kind === 'subscription'
                    ? 'sub_payme_id (SUB…)'
                    : 'seller_payme_id (MPL…)'
              }
            >
              <Input
                placeholder="SALE1788-…"
                value={sim.entityId}
                onChange={(e) => setSim({ ...sim, entityId: e.target.value })}
              />
            </Field>
            <Field label="notify_type">
              <Input
                value={sim.notifyType}
                onChange={(e) => setSim({ ...sim, notifyType: e.target.value })}
              />
            </Field>
            <Field label="Signature">
              <Select
                value={sim.signed ? 'valid' : 'wrong'}
                onChange={(e) => setSim({ ...sim, signed: e.target.value === 'valid' })}
              >
                <option value="valid">correct — should be accepted</option>
                <option value="wrong">wrong — should be rejected</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Button onClick={simulate} loading={busy} disabled={!sim.entityId}>
              Send simulated callback
            </Button>
          </div>
        </Sheet>
      </Spread>

      <Spread aside={null}>
        <Rule
          label="Received"
          hint={events ? `${events.length} recorded` : undefined}
        />

        <Sheet
          flush
          actions={
            <Button variant="secondary" onClick={reload}>
              Reload
            </Button>
          }
          title="Every notification, accepted and rejected"
        >
          {!events && (
            <div className="px-5">
              <Spinner label="Loading callback log" />
            </div>
          )}
          {events && events.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-ink-soft">
              Nothing received yet. Either PayMe cannot reach this app, or
              nothing has happened — the simulator above produces a row either
              way.
            </p>
          )}
          {events && events.length > 0 && (
            <ul>
              {events.map((event) => (
                <li key={event.id} className="border-b border-rule last:border-0">
                  <button
                    type="button"
                    aria-expanded={expanded === event.id}
                    onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-left hover:bg-ledger-alt"
                  >
                    <span className="font-mono text-[12px] text-ink">
                      {event.notifyType ?? event.kind}
                    </span>
                    <SignatureBadge status={event.signatureStatus} />
                    <Stamp tone={event.applied ? 'success' : 'neutral'}>
                      {event.applied ? 'applied' : 'not applied'}
                    </Stamp>
                    <span className="break-all font-mono text-[10.5px] text-ink-faint">
                      {event.entityId}
                    </span>
                    <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
                      {new Date(event.receivedAt).toLocaleString()}
                    </span>
                  </button>

                  {(event.signatureStatus !== 'valid' || event.skippedReason) && (
                    <p className="px-5 pb-3 text-[12px] leading-snug text-ink-soft">
                      {event.skippedReason ?? event.signatureReason}
                    </p>
                  )}

                  {expanded === event.id && (
                    <pre className="mx-5 mb-4 max-h-80 overflow-auto rounded-[3px] border border-rule bg-ledger-alt p-3 font-mono text-[11px] leading-relaxed text-ink">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </Spread>
    </Page>
  );
}
