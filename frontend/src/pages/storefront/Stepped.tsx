import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../lib/types';
import { useReveal } from '../../lib/reveal';
import { Flow } from './Flow';
import {
  DisplayHeading,
  FloatingObjects,
  ProductGrid,
  Reveal,
  StartHere,
  StudioHero,
  StudioNav,
} from './shared';
import { sellerNames } from './content';

/**
 * B3 — stepped narrative.
 *
 * The same four calls the other variants list as tiles, told instead as the
 * order you actually make them in. Numbered markers are honest here and only
 * here: onboarding really does precede charging, which really does precede
 * capture, which really does precede the callback that settles it.
 *
 * Each row alternates side and slides in from the edge it belongs to, so the
 * page has a rhythm to scroll through rather than a single fade repeated four
 * times.
 */

const STEPS: Array<{
  call: string;
  title: string;
  body: string;
  to: string;
  figure: ReactNode | 'flow';
}> = [
  {
    call: 'create-seller',
    title: 'A seller opens their own account',
    body: 'One call returns an MPL, a one-time secret and a public key. The secret arrives exactly once and can act as the seller, so it is written to the database before anything else happens.',
    to: '/sell',
    figure: null,
  },
  {
    call: 'generate-sale',
    title: 'A buyer pays, and the money divides',
    body: 'The sale is created against that seller’s MPL, never the marketplace’s. PayMe takes market_fee off the top and the remainder is already the seller’s — the marketplace never holds it.',
    to: '/checkout',
    figure: 'flow',
  },
  {
    call: 'capture-sale',
    title: 'Reserve now, settle when you ship',
    body: 'An authorization holds the funds for 168 hours. Capture within that window or the reservation lapses and the money is never taken. Capture happens once, fully or partially.',
    to: '/sales',
    figure: null,
  },
  {
    call: 'payme_signature',
    title: 'Only a signed callback settles it',
    body: 'The buyer’s redirect proves nothing — they control their browser. Every notification is checked against an md5 of key, secret, transaction and entity before it changes a single row.',
    to: '/admin/callbacks',
    figure: null,
  },
];

function Step({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>(0.2);
  const fromLeft = index % 2 === 0;

  // The diagram needs the full measure to stay legible, so the step that owns it
  // stacks instead of sitting in a half-width column.
  const wide = step.figure === 'flow';

  return (
    <div
      ref={ref}
      className={`grid items-center gap-10 py-14 ${
        wide ? '' : `lg:grid-cols-2 ${fromLeft ? '' : 'lg:[&>*:first-child]:order-2'}`
      }`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateX(${fromLeft ? -28 : 28}px)`,
        transition: 'opacity .65s ease, transform .65s cubic-bezier(.22,.61,.36,1)',
      }}
    >
      <div>
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--v-deep)] text-[var(--v-deep-ink)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontStretch: '100%',
              fontWeight: 640,
            }}
          >
            {index + 1}
          </span>
          <span className="font-mono text-[12px]">{step.call}</span>
        </div>

        <DisplayHeading className="mt-5">{step.title}</DisplayHeading>
        <p className="mt-4 max-w-[48ch] text-[15.5px] leading-relaxed">{step.body}</p>

        <Link
          to={step.to}
          className="mt-6 inline-block rounded-full bg-[var(--v-card)] px-6 py-3 text-[14px] font-semibold text-[var(--v-display)] shadow-[0_2px_10px_rgba(16,22,25,0.06)] transition-transform hover:scale-[1.03]"
        >
          Try it
        </Link>
      </div>

      <div className="rounded-3xl bg-[var(--v-card)] p-6 shadow-[0_2px_10px_rgba(16,22,25,0.05)]">
        {step.figure === 'flow' ? (
          <Flow progress={shown ? 1 : 0} />
        ) : (
          <div className="grid min-h-[13rem] place-items-center">
            <span
              className="text-[var(--v-page)]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(5rem, 14vw, 9rem)',
                lineHeight: 0.8,
                letterSpacing: '-0.05em',
                fontStretch: '100%',
                fontWeight: 700,
                WebkitTextStroke: '3px var(--v-accent)',
              }}
            >
              0{index + 1}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Stepped({ products }: { products: Product[] | null }) {
  return (
    <div
      data-design="b"
      className="relative min-h-screen bg-[var(--v-page)] text-[var(--v-body)]"
    >
      <FloatingObjects />

      <div className="relative mx-auto max-w-[72rem] px-6 pb-28 pt-4">
        <StudioNav />

        <StudioHero
          sellers={sellerNames(products)}
          lede="List something, open a PayMe seller account, and every sale lands with you directly — the marketplace only takes its cut."
        />

        <section id="flow" className="mt-28">
          <Reveal>
            <DisplayHeading>Four calls, in the order you make them</DisplayHeading>
          </Reveal>

          <div className="mt-6 divide-y divide-[var(--v-line)]">
            {STEPS.map((step, index) => (
              <Step key={step.call} step={step} index={index} />
            ))}
          </div>
        </section>

        <section className="mt-16">
          <StartHere />
        </section>

        <section className="mt-20">
          <Reveal>
            <DisplayHeading>On the marketplace</DisplayHeading>
          </Reveal>
          <div className="mt-8">
            <ProductGrid products={products} />
          </div>
        </section>
      </div>
    </div>
  );
}
