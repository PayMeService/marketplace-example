import { useEffect, useState, type FormEvent } from 'react';
import { get, put } from '../lib/api';
import type { PayMeSettings } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Code,
  ErrorBanner,
  Field,
  Input,
  Note,
  Select,
  Spinner,
} from '../components/ui';

/**
 * Where the PayMe credentials are configured.
 *
 * Two credentials with very different jobs, and conflating them is a common
 * source of confusion:
 *
 *   client key    the Partner Key. Sent to PayMe on partner-scoped calls
 *                 (create-seller, get-sellers, refund-sale, capture-sale).
 *   client secret NEVER sent to PayMe. Its only job is to recompute the md5
 *                 `payme_signature` on incoming callbacks.
 *
 * The secret is write-only from this page: the API reports whether one is set
 * but never returns it. A secret that round-trips through a form ends up in
 * browser history, devtools and error reports.
 */
export function AdminSettings() {
  const [settings, setSettings] = useState<PayMeSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    environment: 'sandbox',
    clientKey: '',
    clientSecret: '',
    marketplaceMpl: '',
    publicBaseUrl: '',
  });

  useEffect(() => {
    get<PayMeSettings>('/settings/payme')
      .then((fetched) => {
        setSettings(fetched);
        setForm({
          environment: fetched.environment,
          clientKey: fetched.clientKey,
          clientSecret: '',
          marketplaceMpl: fetched.marketplaceMpl,
          publicBaseUrl: fetched.publicBaseUrl,
        });
      })
      .catch(setError);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const payload: Record<string, string> = {
        environment: form.environment,
        clientKey: form.clientKey,
        marketplaceMpl: form.marketplaceMpl,
        publicBaseUrl: form.publicBaseUrl,
      };
      // Only send the secret when one was typed — an empty field means
      // "leave it alone", not "clear it".
      if (form.clientSecret) payload.clientSecret = form.clientSecret;

      const updated = await put<PayMeSettings>('/settings/payme', payload);
      setSettings(updated);
      setForm((prev) => ({ ...prev, clientSecret: '' }));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (!settings && !error) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PayMe settings</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Credentials for the partner account this marketplace runs on. Seeded
          from the environment on first boot; changes here take effect
          immediately, without a redeploy.
        </p>
      </div>

      <Card title="Credentials">
        <form onSubmit={submit} className="space-y-5">
          <ErrorBanner error={error} />
          {saved && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Saved. Subsequent PayMe calls use these values.
            </div>
          )}

          <Field
            label="Environment"
            hint={`API base: ${settings?.apiBaseUrl ?? ''}`}
          >
            <Select
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value })}
            >
              <option value="sandbox">sandbox — https://sandbox.payme.io/api/</option>
              <option value="production">production — https://live.payme.io/api/</option>
            </Select>
          </Field>

          <Field
            label="Client key (Partner Key)"
            hint="Sent to PayMe as payme_client_key, and as the PayMe-Partner-Key header on the REST-shaped endpoints."
          >
            <Input
              value={form.clientKey}
              onChange={(e) => setForm({ ...form, clientKey: e.target.value })}
              placeholder="newpartners_xxxxxxxx"
            />
          </Field>

          <Field
            label="Client secret"
            hint="Never transmitted to PayMe. Used only to verify the md5 signature on incoming callbacks."
          >
            <div className="flex items-center gap-3">
              <Input
                type="password"
                autoComplete="off"
                value={form.clientSecret}
                onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                placeholder={
                  settings?.clientSecretConfigured
                    ? 'configured — leave blank to keep it'
                    : 'not set'
                }
              />
              <Badge tone={settings?.clientSecretConfigured ? 'success' : 'danger'}>
                {settings?.clientSecretConfigured ? 'set' : 'missing'}
              </Badge>
            </div>
          </Field>

          <Field
            label="Marketplace MPL"
            hint="Your own API identifier. Used by partner-scoped calls such as POST /sellers/{mpl}/tokens — not the same thing as a seller's MPL."
          >
            <Input
              value={form.marketplaceMpl}
              onChange={(e) => setForm({ ...form, marketplaceMpl: e.target.value })}
              placeholder="MPL17838-…"
            />
          </Field>

          <Field
            label="Public base URL"
            hint="How PayMe's servers reach this app. Callback and return URLs are built from it."
          >
            <Input
              value={form.publicBaseUrl}
              onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
              placeholder="https://your-tunnel.trycloudflare.com"
            />
          </Field>

          <Button type="submit" loading={busy}>
            Save
          </Button>
        </form>
      </Card>

      {!settings?.clientSecretConfigured && (
        <Note tone="warning" title="Callbacks cannot be verified without the secret">
          <p>
            With no secret configured, every signature check returns{' '}
            <Code>unverifiable</Code> and the callback is recorded but{' '}
            <strong>not applied</strong> — refusing to act is the safe failure
            mode. Ask your PayMe account manager for the partner secret
            (<Code>merchant_password</Code> on their side).
          </p>
        </Note>
      )}

      {form.environment === 'production' && (
        <Note tone="warning" title="Production checklist">
          <ul className="ml-4 list-disc space-y-1">
            <li>Client secret set, and stored in a secrets manager rather than a database column.</li>
            <li><Code>PUBLIC_BASE_URL</Code> on real HTTPS, not a tunnel.</li>
            <li>The callback simulator disabled — it refuses to run in production, but delete the route.</li>
            <li><Code>DB_SYNCHRONIZE=false</Code>, with TypeORM migrations instead.</li>
            <li><Code>testMode: false</Code> in the Hosted Fields initialisation.</li>
          </ul>
        </Note>
      )}
    </div>
  );
}
