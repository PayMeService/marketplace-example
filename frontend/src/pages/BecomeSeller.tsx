import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { useAuth } from '../lib/auth-context';
import type { Seller, SellerPlan } from '../lib/types';
import {
  Button,
  Code,
  DataList,
  Entry,
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

/**
 * Seller onboarding.
 *
 * Two steps for the user, one call to PayMe:
 *   1. pick a plan — that is what sets `market_fee`, the marketplace's cut
 *   2. fill in the details create-seller requires
 * PayMe answers with the MPL, a one-time secret and a public key; all three are
 * stored server-side before anything else happens.
 */

/** Sandbox values from PayMe's create-seller docs, so the form can be filled in one click. */
const SANDBOX_DEFAULTS = {
  socialId: '9999999999',
  email: 'random@paymeservice.com',
  bankCode: 54,
  bankBranch: 123,
  bankAccountNumber: '123456',
  businessType: 10114,
};

const INCORPORATION_TYPES = [
  { value: 1, label: '1 — Individual (פרטי)' },
  { value: 2, label: '2 — Sole Proprietorship (עוסק מורשה)' },
  { value: 3, label: '3 — Incorporated Company (חברה בע"מ)' },
  { value: 5, label: '5 — Exempt Dealer (עוסק פטור)' },
  { value: 6, label: '6 — Non-profit (עמותה)' },
];

export function BecomeSeller() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const { data, loading } = useLoader(async () => {
    const [plans, existing] = await Promise.all([
      get<SellerPlan[]>('/sellers/plans'),
      get<Seller | null>('/sellers/me').catch(() => null),
    ]);
    return { plans, existing };
  });
  const plans = data?.plans ?? null;

  // The seller returned by the loader, or the one we just created.
  const [created, setCreated] = useState<Seller | null>(null);
  const seller = created ?? data?.existing ?? null;

  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null);
  const planId =
    chosenPlanId ??
    plans?.find((plan) => plan.recommended)?.id ??
    plans?.[0]?.id ??
    null;

  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Seeded once, lazily. This page renders behind <Protected>, which shows a
  // spinner until the session is loaded, so `user` is already populated on the
  // first render — no effect needed to backfill it, and no cascading render.
  const [form, setForm] = useState(() => ({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    socialId: SANDBOX_DEFAULTS.socialId,
    birthdate: '01/01/1990',
    socialIdIssued: '01/01/2015',
    gender: 0,
    email: SANDBOX_DEFAULTS.email,
    phone: '+972501112233',
    incorporationType: 2,
    businessCode: SANDBOX_DEFAULTS.socialId,
    businessType: SANDBOX_DEFAULTS.businessType,
    siteUrl: 'https://example.com',
    bankCode: SANDBOX_DEFAULTS.bankCode,
    bankBranch: SANDBOX_DEFAULTS.bankBranch,
    bankAccountNumber: SANDBOX_DEFAULTS.bankAccountNumber,
    addressCity: 'Tel Aviv',
    addressStreet: 'Rothschild',
    addressStreetNumber: '1',
    addressCountry: 'IL',
    businessName: user ? `${user.firstName}'s shop` : '',
    description: user
      ? `Handmade goods sold by ${user.firstName} on the marketplace`
      : '',
  }));

  /**
   * PayMe requires the business number to equal the owner's social ID for sole
   * proprietors (2) and exempt dealers (5).
   *
   * DERIVED, not synced into state by an effect. Copying one field into another
   * on every change is the classic case of state that should have been a
   * computed value: it costs an extra render, and it goes wrong the moment the
   * two get out of order.
   */
  const soleTrader = form.incorporationType === 2 || form.incorporationType === 5;
  const businessCode = soleTrader ? form.socialId : form.businessCode;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!planId) return;
    setError(null);
    setBusy(true);
    try {
      const seller = await post<Seller>('/sellers', {
        planId,
        ...form,
        businessCode,
      });
      setCreated(seller);
      // The user's role just changed to "seller"; re-read the session so the
      // nav and the route guards pick it up.
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading plans" />;

  if (seller) {
    return (
      <div className="mx-auto max-w-[36rem] space-y-6 py-4">
        <header className="border-b border-rule-strong pb-5">
          <h1 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[2rem] leading-tight tracking-[-0.015em] text-ink">
            You already sell here
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            PayMe issued this seller against your account. There is one MPL per
            user, so there is nothing more to create.
          </p>
        </header>

        <Sheet>
          <DataList>
            <Entry term="seller_payme_id" wide>
              {seller.paymeId}
            </Entry>
            <Entry term="public_key" wide>
              {seller.publicKey ?? '—'}
            </Entry>
            <Entry term="market_fee">{seller.marketFee}% of every sale</Entry>
            <Entry term="approval">
              <Stamp tone={seller.approved ? 'success' : 'warning'}>
                {seller.approved ? 'approved' : 'pending document verification'}
              </Stamp>
            </Entry>
          </DataList>
        </Sheet>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/seller')}>Go to your dashboard</Button>
          <Button variant="secondary" onClick={() => navigate('/checkout')}>
            Take a payment
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Page
      title="Sell on the marketplace"
      lede={
        <>
          Picking a plan sets your <Code>market_fee</Code> — the slice of each
          sale the marketplace keeps, on top of PayMe&#8217;s own processing
          fees. Everything below feeds a single <Code>create-seller</Code> call.
        </>
      }
      rail
    >
      <Spread aside={null}>
        <Rule step={1} label="Choose a plan" hint="sets market_fee" />

        <div className="grid gap-5 md:grid-cols-3">
          {plans?.map((plan) => {
            const selected = plan.id === planId;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setChosenPlanId(plan.id)}
                className={`flex flex-col items-stretch justify-start rounded-[3px] border bg-paper p-5 text-left transition-colors ${
                  selected
                    ? 'border-pen border-t-[3px] border-t-pen'
                    : 'border-rule border-t-[3px] border-t-rule-strong hover:border-t-ink-faint'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[17px] text-ink">{plan.name}</h3>
                  {plan.recommended && <Stamp tone="info">suggested</Stamp>}
                </div>

                <p className="mt-3 flex items-baseline gap-1">
                  <span className="tabular font-mono text-[2.25rem] leading-none text-ink">
                    {plan.marketFee}
                  </span>
                  <span className="font-mono text-[1rem] text-ink-soft">%</span>
                </p>
                <p className="mt-1 text-[12px] text-ink-faint">
                  kept by the marketplace on every sale
                </p>

                <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
                  {plan.blurb}
                </p>
                <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
                  {plan.features.map((feature) => (
                    <li key={feature} className="border-t border-rule pt-1.5">
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </Spread>

      <Spread
        aside={
          <>
            <Note title="Sandbox values are pre-filled">
              <p>
                PayMe publishes test values that always pass validation: social
                ID <Code>9999999999</Code>, email{' '}
                <Code>random@paymeservice.com</Code> (which suppresses automated
                mail), bank <Code>54</Code>, any 3-digit branch and any 6-digit
                account.
              </p>
            </Note>
            <Note tone="warning" title="The secret arrives once">
              <p>
                <Code>seller_payme_secret</Code> comes back exactly once and can
                never be retrieved again. The server writes the MPL, the secret
                and the public key to the database before doing anything else — a
                failure after that point is recoverable, a lost secret is not.
              </p>
            </Note>
          </>
        }
      >
        <Rule step={2} label="Your details" hint="create-seller" />

        <Sheet>
          <form onSubmit={submit} className="space-y-8">
            <ErrorBanner error={error} />

            <fieldset className="space-y-4">
              <legend className="mb-3 w-full border-b border-rule pb-1.5 font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] text-ink">
                The person
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name">
                  <Input required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
                </Field>
                <Field label="Last name">
                  <Input required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
                </Field>
                <Field label="Social ID (ת.ז)">
                  <Input required value={form.socialId} onChange={(e) => set('socialId', e.target.value)} />
                </Field>
                <Field label="Gender" hint="PayMe’s enum: 0 male, 1 female.">
                  <Select
                    value={form.gender}
                    onChange={(e) => set('gender', Number(e.target.value))}
                  >
                    <option value={0}>0 — Male</option>
                    <option value={1}>1 — Female</option>
                  </Select>
                </Field>
                <Field label="Date of birth" hint="dd/mm/yyyy — PayMe rejects ISO dates.">
                  <Input
                    required
                    placeholder="01/01/1990"
                    value={form.birthdate}
                    onChange={(e) => set('birthdate', e.target.value)}
                  />
                </Field>
                <Field label="ID issue date" hint="dd/mm/yyyy">
                  <Input
                    required
                    placeholder="01/01/2015"
                    value={form.socialIdIssued}
                    onChange={(e) => set('socialIdIssued', e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <Input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
                </Field>
                <Field label="Phone">
                  <Input required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 w-full border-b border-rule pb-1.5 font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] text-ink">
                The business
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name">
                  <Input required value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
                </Field>
                <Field label="Incorporation type">
                  <Select
                    value={form.incorporationType}
                    onChange={(e) => set('incorporationType', Number(e.target.value))}
                  >
                    {INCORPORATION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Business number (ח.פ / ע.מ)"
                  hint={
                    soleTrader
                      ? 'For a sole proprietor or exempt dealer PayMe requires this to equal the social ID, so it follows that field.'
                      : 'Required for anything other than an individual.'
                  }
                >
                  <Input
                    value={businessCode}
                    disabled={soleTrader}
                    onChange={(e) => set('businessCode', e.target.value)}
                  />
                </Field>
                <Field label="MCC" hint="PayMe’s merchant category code. 10114 is generic retail.">
                  <Input
                    type="number"
                    required
                    value={form.businessType}
                    onChange={(e) => set('businessType', Number(e.target.value))}
                  />
                </Field>
                <Field label="Website">
                  <Input required value={form.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} />
                </Field>
                <Field label="Description" hint="Max 255 characters.">
                  <Input required maxLength={255} value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 flex w-full items-baseline justify-between gap-3 border-b border-rule pb-1.5">
                <span className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] text-ink">Bank account</span>
                <span className="text-[12px] text-ink-faint">payouts land here</span>
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Bank code">
                  <Input type="number" required value={form.bankCode} onChange={(e) => set('bankCode', Number(e.target.value))} />
                </Field>
                <Field label="Branch">
                  <Input type="number" required value={form.bankBranch} onChange={(e) => set('bankBranch', Number(e.target.value))} />
                </Field>
                <Field label="Account number">
                  <Input required value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 w-full border-b border-rule pb-1.5 font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] text-ink">
                Business address
              </legend>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="City">
                  <Input required value={form.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
                </Field>
                <Field label="Street">
                  <Input required value={form.addressStreet} onChange={(e) => set('addressStreet', e.target.value)} />
                </Field>
                <Field label="Number">
                  <Input required value={form.addressStreetNumber} onChange={(e) => set('addressStreetNumber', e.target.value)} />
                </Field>
                <Field label="Country" hint="ISO 3166 alpha-2">
                  <Input required maxLength={2} value={form.addressCountry} onChange={(e) => set('addressCountry', e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <Button type="submit" loading={busy} disabled={!planId}>
              Create my PayMe seller
            </Button>
          </form>
        </Sheet>
      </Spread>
    </Page>
  );
}
