import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { Button, Stamp } from './ui';

/**
 * App shell.
 *
 * The nav is grouped by who the reader is at that moment — shopper, seller,
 * marketplace operator — because the PayMe integration looks different from
 * each side, and a flat row of ten links hides that entirely. The groups are
 * separated by a hairline rather than labelled, so the structure is visible
 * without three more words of chrome on every page.
 */
const NAV: Array<{ to: string; label: string; end?: boolean; roles: string[] | null }> = [
  { to: '/', label: 'Storefront', end: true, roles: null },

  { to: '/products', label: 'My products', roles: ['user', 'seller', 'admin'] },
  { to: '/sell', label: 'Sell with us', roles: ['user', 'seller', 'admin'] },

  { to: '/seller', label: 'Dashboard', roles: ['seller', 'admin'] },
  { to: '/checkout', label: 'Take a payment', roles: ['seller', 'admin'] },
  { to: '/sales', label: 'Sales', roles: ['seller', 'admin'] },
  { to: '/subscriptions', label: 'Subscriptions', roles: ['seller', 'admin'] },

  { to: '/admin/sellers', label: 'Sellers', roles: ['admin'] },
  { to: '/admin/callbacks', label: 'Callbacks', roles: ['admin'] },
  { to: '/admin/settings', label: 'PayMe settings', roles: ['admin'] },
];

/** Indexes in NAV where one audience ends and the next begins. */
const GROUP_STARTS = new Set(['/products', '/seller', '/admin/sellers']);

const THEME_LABEL = { auto: 'auto', light: 'light', dark: 'dark' } as const;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, cycle } = useTheme();

  const visible = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="min-h-screen bg-ledger text-ink">
      <header className="border-b border-rule-strong bg-paper">
        <div className="mx-auto flex max-w-[78rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <NavLink to="/" className="flex items-center gap-2.5">
            {/* Banded paper, ruled once in ink — the app's whole idea at 20px. */}
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <rect width="20" height="20" rx="2" fill="var(--ledger-alt)" />
              <rect y="4" width="20" height="3" fill="var(--rule-strong)" opacity=".55" />
              <rect y="11" width="20" height="3" fill="var(--rule-strong)" opacity=".55" />
              <rect x="14" width="2" height="20" fill="var(--pen)" />
            </svg>
            <span className="font-serif text-[15px] tracking-tight text-ink">
              marketplace<span className="text-ink-faint">-example</span>
            </span>
          </NavLink>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={cycle}
              aria-label={`Colour theme: ${THEME_LABEL[theme]}. Change it.`}
              className="w-14 rounded-[3px] border border-rule px-1.5 py-1 font-mono text-[11px] text-ink-faint hover:border-rule-strong hover:text-ink"
            >
              {THEME_LABEL[theme]}
            </button>

            {user ? (
              <>
                <div className="text-right leading-tight">
                  <p className="text-[13px] font-medium text-ink">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="mt-0.5">
                    <Stamp tone={user.role === 'admin' ? 'info' : 'neutral'}>
                      {user.role}
                    </Stamp>
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button onClick={() => navigate('/register')}>Create account</Button>
              </div>
            )}
          </div>
        </div>

        <nav className="mx-auto max-w-[78rem] px-6">
          <ul className="flex flex-wrap items-center gap-x-5 border-t border-rule">
            {visible.map((item) => (
              <li key={item.to} className="flex items-center gap-5">
                {GROUP_STARTS.has(item.to) && (
                  <span className="h-3.5 w-px bg-rule-strong" aria-hidden="true" />
                )}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `-mb-px block border-b-2 py-2.5 text-[13px] transition-colors ${
                      isActive
                        ? 'border-pen font-medium text-ink'
                        : 'border-transparent text-ink-soft hover:border-rule-strong hover:text-ink'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[78rem] px-6 py-10">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[78rem] px-6 pb-12">
        <div className="border-t border-rule pt-5">
          <p className="max-w-[68ch] text-[12px] leading-relaxed text-ink-faint">
            A worked PayMe integration — seller onboarding, iframe / hosted
            fields / direct API checkout, authorize and capture, subscriptions,
            balances and signed callbacks. The prose walkthrough lives in{' '}
            <code className="font-mono text-ink-soft">docs/</code>.
          </p>
        </div>
      </footer>
    </div>
  );
}
