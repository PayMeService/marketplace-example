import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';

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
    <div className="mx-auto max-w-md">
      <Card
        title="Create an account"
        description="Registering makes you a marketplace user. Becoming a PayMe seller is a separate, opt-in step."
      >
        <form onSubmit={submit} className="space-y-4">
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
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already registered?{' '}
            <Link to="/login" className="text-indigo-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
