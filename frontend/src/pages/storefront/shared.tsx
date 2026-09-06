import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../lib/types';
import { formatMoney } from '../../lib/money';
import { avatarUrl, productImageUrl } from '../../lib/dicebear';
import { useReveal } from '../../lib/reveal';
import { useCart } from '../../lib/cart-context';
import { ENTRY_POINTS } from './content';

/* The furniture every studio variant shares, so those files stay about
   composition rather than about markup. */

/** Objects scattered behind the hero. Positions are hand-placed, not random. */
const OBJECTS = [
  { seed: 'ledger', top: '12%', left: '5%', size: 84, rot: -12, delay: '0s' },
  { seed: 'wallet', top: '24%', left: '87%', size: 100, rot: 9, delay: '1.1s' },
  { seed: 'agorot', top: '62%', left: '2%', size: 66, rot: 16, delay: '2s' },
  { seed: 'capture', top: '6%', left: '73%', size: 56, rot: 20, delay: '1.6s' },
];

export function FloatingObjects() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      {OBJECTS.map((object) => (
        <img
          key={object.seed}
          src={productImageUrl(object.seed)}
          alt=""
          loading="lazy"
          className="absolute opacity-70"
          style={{
            top: object.top,
            left: object.left,
            width: object.size,
            height: object.size,
            ['--drift-rot' as string]: `${object.rot}deg`,
            animation: `drift 7s ease-in-out ${object.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function StudioNav() {
  return (
    <header className="sticky top-4 z-40 mx-auto flex w-fit items-center gap-6 rounded-full bg-[var(--v-card)] py-2.5 pl-6 pr-2.5 shadow-[0_8px_30px_rgba(16,22,25,0.08)]">
      <span
        className="text-[var(--v-display)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.1rem',
          fontStretch: '100%',
          fontWeight: 700,
          letterSpacing: '-0.03em',
        }}
      >
        marketplace
      </span>
      <nav className="hidden gap-5 text-[14px] sm:flex">
        <Link to="/stores">Shops</Link>
        <Link to="/cart">Cart</Link>
        <Link to="/sell">Sell</Link>
      </nav>
      <Link
        to="/register"
        className="rounded-full bg-[var(--v-deep)] px-5 py-2 text-[14px] font-semibold text-[var(--v-deep-ink)]"
      >
        Sign up
      </Link>
    </header>
  );
}

/** A section that fades and lifts into place the first time it is reached. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(22px)',
        transition: `opacity .6s ease ${delay}ms, transform .6s cubic-bezier(.22,.61,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function DisplayHeading({
  children,
  size = 'clamp(1.7rem, 3.6vw, 2.6rem)',
  className = '',
}: {
  children: ReactNode;
  size?: string;
  className?: string;
}) {
  return (
    <h2
      className={`text-[var(--v-display)] ${className}`}
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: '-0.035em',
        fontStretch: '100%',
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  );
}

export function EntryPoints() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {ENTRY_POINTS.map((entry, index) => (
        <Reveal key={entry.to} delay={index * 70}>
          <Link
            to={entry.to}
            className="group flex h-full flex-col rounded-2xl bg-[var(--v-card)] p-5 shadow-[0_2px_10px_rgba(16,22,25,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(16,22,25,0.10)]"
          >
            <p className="text-[16px] font-semibold text-[var(--v-display)]">{entry.title}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed">{entry.body}</p>
            <p className="mt-4 font-mono text-[11px] text-[var(--v-body)]/70 transition-colors group-hover:text-[var(--v-display)]">
              {entry.call}
            </p>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

export function StartHere() {
  return (
    <Reveal>
      <div className="rounded-2xl bg-[var(--v-card)] p-6 shadow-[0_2px_10px_rgba(16,22,25,0.05)]">
        <p className="text-[16px] font-semibold text-[var(--v-display)]">Start here</p>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed">
          Create an account, list a product, then open a seller from{' '}
          <Link to="/sell" className="underline underline-offset-2">
            Sell with us
          </Link>
          . PayMe&#8217;s sandbox accepts social ID{' '}
          <code className="font-mono text-[0.9em]">9999999999</code>, bank{' '}
          <code className="font-mono text-[0.9em]">54</code>, branch{' '}
          <code className="font-mono text-[0.9em]">123</code>, account{' '}
          <code className="font-mono text-[0.9em]">123456</code>.
        </p>
      </div>
    </Reveal>
  );
}

export function ProductGrid({ products }: { products: Product[] | null }) {
  const { add, lines } = useCart();

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products?.map((product, index) => {
        const inCart = lines.find((line) => line.productId === product.id);
        return (
          <li key={product.id}>
            <Reveal delay={(index % 3) * 70}>
              {/* The card is not one big link: it holds an action of its own,
                  and a button nested inside an anchor is neither valid markup
                  nor navigable by keyboard in the way either element promises. */}
              <div className="flex h-full flex-col rounded-2xl bg-[var(--v-card)] p-5 shadow-[0_2px_10px_rgba(16,22,25,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(16,22,25,0.10)]">
                <Link to={`/buy/${product.id}`} className="block">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--v-page)]">
                    <img
                      src={productImageUrl(product.id)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold text-[var(--v-display)]">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed">
                      {product.description}
                    </p>
                  )}
                </Link>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  {product.storeId ? (
                    <Link
                      to={`/store/${product.storeId}`}
                      className="flex min-w-0 items-center gap-2 text-[12px] hover:underline"
                    >
                      <img
                        src={avatarUrl(product.seller ?? product.storeId)}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded-full bg-[var(--v-page)]"
                      />
                      <span className="truncate">{product.seller}</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="tabular shrink-0 font-mono text-[14px] font-medium text-[var(--v-display)]">
                    {formatMoney(product.priceMinor, product.currency)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => add(product.id)}
                  className="mt-4 w-full rounded-full bg-[var(--v-deep)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--v-deep-ink)] transition-transform hover:scale-[1.02]"
                >
                  {inCart ? `In cart · ${inCart.quantity}` : 'Add to cart'}
                </button>
              </div>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The hero.
 *
 * The avatar cluster is set inline in the headline and the faces are the
 * marketplace's actual sellers, so the sentence is literally true rather than
 * decorative. Capped at three: past that a cluster stops reading as a group and
 * starts reading as a crowd.
 */
export function StudioHero({ sellers, lede }: { sellers: string[]; lede: ReactNode }) {
  return (
    <>
      <h1
        className="mx-auto mt-20 max-w-[20ch] text-center text-[var(--v-display)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6.4vw, 5.2rem)',
          lineHeight: 1.06,
          letterSpacing: '-0.035em',
          fontStretch: '100%',
          fontWeight: 560,
        }}
      >
        Sellers{' '}
        {sellers.length > 0 && (
          <span className="mx-1 inline-flex -space-x-3 align-middle">
            {sellers.map((seller) => (
              <img
                key={seller}
                src={avatarUrl(seller)}
                alt=""
                loading="lazy"
                title={seller}
                className="inline-block size-[0.95em] rounded-full bg-[var(--v-accent)] ring-4 ring-[var(--v-page)]"
              />
            ))}
          </span>
        )}{' '}
        keep their own wallet
      </h1>

      <p className="mx-auto mt-6 max-w-[48ch] text-center text-[16px] leading-relaxed">
        {lede}
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link
          to="/stores"
          className="rounded-full bg-[var(--v-deep)] px-7 py-3.5 text-[15px] font-semibold text-[var(--v-deep-ink)] transition-transform hover:scale-[1.03]"
        >
          Browse the shops
        </Link>
        <a
          href="#flow"
          className="rounded-full bg-[var(--v-card)] px-7 py-3.5 text-[15px] font-semibold text-[var(--v-display)] shadow-[0_2px_10px_rgba(16,22,25,0.06)] transition-transform hover:scale-[1.03]"
        >
          See the split
        </a>
      </div>
    </>
  );
}
