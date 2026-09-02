import { useState } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import type { CallbackEvent, PayMeSettings } from '../lib/types';
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
import { SignatureBadge } from '../components/StatusBadge';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Callbacks</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">
          PayMe's server-to-server notifications, and the signature verdict on
          each. The rule is verify first, act second — the endpoint is public and
          the signature is the whole of its authentication.
        </p>
      </div>

      <ErrorBanner error={error} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Signature formula" className="md:col-span-2">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Sale callbacks</p>
              <p className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">
                md5(client_key + client_secret + payme_transaction_id + payme_sale_id)
              </p>
            </div>
            <div>
              <p className="font-medium">Subscription callbacks</p>
              <p className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">
                md5(client_key + client_secret + transaction_id + sub_payme_id)
              </p>
            </div>
            <Note tone="warning" title="The trap">
              <p>
                On a <strong>subscription</strong> callback,{' '}
                <Code>transaction_id</Code> is PayMe's transaction guid. On a{' '}
                <strong>sale</strong> callback the identically-named field is
                YOUR order id, and the hash uses{' '}
                <Code>payme_transaction_id</Code> instead. Same name, different
                meaning — mixing them up looks exactly like a wrong secret.
              </p>
            </Note>
            <p className="text-slate-600 dark:text-slate-400">
              Seller callbacks (<Code>seller-create</Code>,{' '}
              <Code>seller-approve</Code>) carry no signature at all. Treat them
              as a hint to re-read state with <Code>get-sellers</Code>, never as
              fact.
            </p>
          </div>
        </Card>

        <Card title="Delivery">
          {settings && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Client secret</dt>
                <dd className="mt-0.5">
                  <Badge tone={settings.clientSecretConfigured ? 'success' : 'danger'}>
                    {settings.clientSecretConfigured ? 'configured' : 'missing'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Reachable by PayMe</dt>
                <dd className="mt-0.5">
                  <Badge tone={settings.callbacksReachable ? 'success' : 'warning'}>
                    {settings.callbacksReachable ? 'yes' : 'localhost — no'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Public base URL</dt>
                <dd className="mt-0.5 break-all font-mono text-xs">
                  {settings.publicBaseUrl || '—'}
                </dd>
              </div>
            </dl>
          )}
          {settings && !settings.callbacksReachable && (
            <Note tone="warning" title="No callbacks will arrive">
              <p>
                PayMe refuses localhost callback URLs, so the backend omits{' '}
                <Code>sale_callback_url</Code> entirely rather than have{' '}
                <Code>generate-sale</Code> fail. Run{' '}
                <Code>cloudflared tunnel --url http://localhost:3000</Code> and
                point <Code>PUBLIC_BASE_URL</Code> at it, or use the simulator
                below.
              </p>
            </Note>
          )}
        </Card>
      </div>

      <Card
        title="Simulate a callback"
        description="Builds a correctly signed payload and feeds it through the real handler — the signature check is exercised, not bypassed."
      >
        <div className="grid gap-4 sm:grid-cols-4">
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
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={simulate} loading={busy} disabled={!sim.entityId}>
            Send simulated callback
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Send a wrong signature at least once — watching it be rejected is the
            only way to know the check is live.
          </p>
        </div>
      </Card>

      <Card title="Received callbacks" actions={<Button variant="secondary" onClick={reload}>Reload</Button>}>
        {!events && <Spinner />}
        {events && events.length === 0 && (
          <EmptyState title="Nothing received yet">
            Either PayMe cannot reach this app, or nothing has happened yet. Try
            the simulator above.
          </EmptyState>
        )}
        {events && events.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((event) => (
              <li key={event.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                  className="flex w-full flex-wrap items-center gap-3 text-left"
                >
                  <Badge>{event.kind}</Badge>
                  <span className="font-mono text-sm">{event.notifyType ?? '—'}</span>
                  <SignatureBadge status={event.signatureStatus} />
                  <Badge tone={event.applied ? 'success' : 'neutral'}>
                    {event.applied ? 'applied' : 'not applied'}
                  </Badge>
                  <span className="break-all font-mono text-[11px] text-slate-400">
                    {event.entityId}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(event.receivedAt).toLocaleString()}
                  </span>
                </button>

                {(event.signatureStatus !== 'valid' || event.skippedReason) && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {event.skippedReason ?? event.signatureReason}
                  </p>
                )}

                {expanded === event.id && (
                  <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
