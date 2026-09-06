import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button, ErrorBanner, Field, Input } from '../components/ui';

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(form);
      navigate('/');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[22rem] py-6">
      <h1 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[2rem] leading-tight tracking-[-0.015em] text-ink">
        Create an account
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
        This makes you a marketplace user. Becoming a PayMe seller is a separate
        step you can take whenever you want to get paid.
      </p>
      <hr className="mt-4 mb-6 border-0 border-t border-rule-strong" />

      <form onSubmit={submit} className="space-y-5">
        <ErrorBanner error={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input required value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Last name">
            <Input required value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            minLength={8}
            required
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
        <p className="text-center text-[13px] text-ink-soft">
          Already registered?{' '}
          <Link to="/login" className="text-pen underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
