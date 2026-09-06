import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button, ErrorBanner, Field, Input } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    /* No sheet around this one. A four-field form on the ledger needs a rule to
       sit on, not a box to sit in. */
    <div className="mx-auto max-w-[22rem] py-6">
      <h1 className="font-serif text-[2rem] leading-tight tracking-[-0.015em] text-ink">
        Sign in
      </h1>
      <hr className="mt-4 mb-6 border-0 border-t border-rule-strong" />

      <form onSubmit={submit} className="space-y-5">
        <ErrorBanner error={error} />
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-center text-[13px] text-ink-soft">
          No account?{' '}
          <Link to="/register" className="text-pen underline underline-offset-2">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
