import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui';

/**
 * App shell. The nav is grouped by who the reader is at that moment — buyer,
 * seller, marketplace operator — because the PayMe integration looks different
 * from each side.
 */
const NAV = [
  { to: '/', label: 'Storefront', end: true, roles: null },
  { to: '/products', label: 'My products', roles: ['user', 'seller', 'admin'] },
  { to: '/sell', label: 'Sell with us', roles: ['user', 'seller', 'admin'] },
  { to: '/seller', label: 'Seller dashboard', roles: ['seller', 'admin'] },
  { to: '/checkout', label: 'Take a payment', roles: ['seller', 'admin'] },
  { to: '/sales', label: 'Sales', roles: ['seller', 'admin'] },
  { to: '/subscriptions', label: 'Subscriptions', roles: ['seller', 'admin'] },
  { to: '/admin/sellers', label: 'Sellers', roles: ['admin'] },
  { to: '/admin/callbacks', label: 'Callbacks', roles: ['admin'] },
  { to: '/admin/settings', label: 'PayMe settings', roles: ['admin'] },
] as const;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visible = NAV.filter(
    (item) => !item.roles || (user && (item.roles as readonly string[]).includes(user.role)),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-indigo-600 text-sm font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight">
              marketplace<span className="text-slate-400">-example</span>
            </span>
          </NavLink>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
                  {user.role}
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
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Sign in
              </Button>
              <Button onClick={() => navigate('/register')}>Create account</Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-slate-400">
        A worked PayMe integration — seller onboarding, iframe / hosted fields /
        direct API checkout, authorize &amp; capture, subscriptions, balances and
        signed callbacks. The prose walkthrough lives in{' '}
        <code className="font-mono">docs/</code>.
      </footer>
    </div>
  );
}
