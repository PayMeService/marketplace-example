import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { Button } from './ui';
import { avatarUrl } from '../lib/dicebear';
import { useCart } from '../lib/cart-context';

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
  { to: '/stores', label: 'Shops', roles: null },

  { to: '/products', label: 'My products', roles: ['user', 'seller', 'admin'] },
  { to: '/sell', label: 'Sell with us', roles: ['user', 'seller', 'admin'] },

  { to: '/seller', label: 'Dashboard', roles: ['seller', 'admin'] },
  { to: '/take-payment', label: 'Take a payment', roles: ['seller', 'admin'] },
  { to: '/sales', label: 'Sales', roles: ['seller', 'admin'] },
  { to: '/subscriptions', label: 'Subscriptions', roles: ['seller', 'admin'] },

  { to: '/admin/sellers', label: 'Sellers', roles: ['admin'] },
  { to: '/admin/callbacks', label: 'Callbacks', roles: ['admin'] },
  { to: '/admin/settings', label: 'PayMe settings', roles: ['admin'] },
];

/** Indexes in NAV where one audience ends and the next begins. */
const GROUP_STARTS = new Set(['/products', '/seller', '/admin/sellers']);

const THEME_LABEL = { auto: 'auto', light: 'light', dark: 'dark' } as const;

export function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, cycle } = useTheme();
  const { count } = useCart();

  const visible = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="min-h-screen bg-ledger text-ink">
      {/* One floating bar rather than a header band: it belongs to the page it
          sits on rather than framing it, which is what lets the storefront and
          the app read as the same product. */}
      <header className="sticky top-4 z-40 mx-auto mt-4 flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-5 gap-y-2 rounded-3xl border border-rule bg-paper px-5 py-3 shadow-[0_8px_30px_rgba(16,22,25,0.08)]">
        <NavLink
          to="/"
          className="text-[1.05rem] text-ink"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          marketplace
        </NavLink>

        <nav>
          <ul className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {visible.map((item) => (
              <li key={item.to} className="flex items-center gap-1">
                {GROUP_STARTS.has(item.to) && (
                  <span className="mx-1.5 h-4 w-px bg-rule" aria-hidden="true" />
                )}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${
                      isActive
                        ? 'bg-ledger-alt font-semibold text-ink'
                        : 'text-ink-soft hover:bg-ledger-alt hover:text-ink'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <span className="mx-1 hidden h-5 w-px bg-rule sm:block" aria-hidden="true" />

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={cycle}
            aria-label={`Colour theme: ${THEME_LABEL[theme]}. Change it.`}
            className="rounded-full px-2.5 py-1 font-mono text-[11px] text-ink-faint hover:bg-ledger-alt hover:text-ink"
          >
            {THEME_LABEL[theme]}
          </button>

          <NavLink
            to="/cart"
            className="relative rounded-full px-3 py-1.5 text-[13.5px] text-ink-soft hover:bg-ledger-alt hover:text-ink"
          >
            Cart
            {count > 0 && (
              <span className="tabular ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-pen px-1.5 py-px font-mono text-[11px] text-paper">
                {count}
              </span>
            )}
          </NavLink>

          {user ? (
            <>
              <span
                className="flex items-center gap-2"
                title={`${user.firstName} ${user.lastName} — ${user.role}`}
              >
                <img
                  src={avatarUrl(user.id)}
                  alt=""
                  className="size-8 rounded-full bg-ledger-alt"
                />
                <span className="hidden text-[13px] font-medium sm:inline">
                  {user.firstName}
                </span>
              </span>
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
            <>
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Sign in
              </Button>
              <Button onClick={() => navigate('/register')}>Create account</Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[78rem] px-6 py-12">
        {children ?? <Outlet />}
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
