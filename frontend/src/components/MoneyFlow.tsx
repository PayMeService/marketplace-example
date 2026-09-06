import type { CSSProperties } from 'react';

/**
 * What makes this a MARKETPLACE integration: the split.
 *
 * A single-merchant integration is a straight line from a buyer to one wallet.
 * Everything that is different here — the seller's own MPL, `market_fee`, the
 * clearing window before a balance is releasable — hangs off the moment the
 * band divides. Nothing else in the app showed that, so it is the first thing
 * on the page.
 *
 * The one piece of unprompted motion in the app is here: the bands draw once on
 * arrival, in payment order, and then nothing moves again. `prefers-reduced-
 * motion` collapses it to the finished state (see index.css).
 */

/* Path lengths, measured off the geometry below, so the dash animation starts
   fully retracted. They only need to be >= the true length. */
const MAIN = 185;
const SELLER = 260;
const FEE = 300;

function drawn(length: number, delay: string, colour: string, width: number): CSSProperties {
  return {
    stroke: colour,
    strokeWidth: width,
    strokeDasharray: length,
    animation: `draw-flow .85s cubic-bezier(.22,.61,.36,1) ${delay} both`,
    ['--flow-length' as string]: `${length}px`,
  };
}

export function MoneyFlow() {
  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 1000 210"
          role="img"
          aria-label="A buyer's payment of 100.00 enters PayMe as sale_price 10000 in minor units, then splits: the marketplace keeps market_fee of 500, and the remainder lands in the seller's own PayMe wallet."
          className="h-auto w-full min-w-[720px]"
        >
          {/* The seller's share and the marketplace's cut leave the same gate,
              which is the only honest way to draw a fee: it is not an extra
              charge to the buyer, it is a division of what they already paid. */}
          <path d="M 250 129 L 430 129" fill="none" style={drawn(MAIN, '.1s', 'var(--pen)', 42)} />
          <path d="M 444 133 L 700 133" fill="none" style={drawn(SELLER, '.75s', 'var(--pen)', 34)} />
          <path
            d="M 444 111 C 540 111, 570 62, 700 62"
            fill="none"
            style={drawn(FEE, '.75s', 'var(--amber)', 6)}
          />

          <rect x="430" y="98" width="14" height="62" fill="var(--ink)" />

          <g fill="var(--ink)" style={{ animation: 'fade-in .5s ease-out .1s both' }}>
            <text x="16" y="124" className="font-serif" fontSize="19">
              Buyer
            </text>
            <text x="16" y="145" className="font-mono" fontSize="10.5" fill="var(--ink-faint)">
              card, bit, Apple Pay
            </text>
          </g>

          <text
            x="340"
            y="134"
            className="font-mono"
            fontSize="11.5"
            fill="var(--paper)"
            textAnchor="middle"
            style={{ animation: 'fade-in .4s ease-out .55s both' }}
          >
            sale_price 10000
          </text>

          <g style={{ animation: 'fade-in .4s ease-out .5s both' }}>
            <text x="437" y="88" className="font-serif" fontSize="15" fill="var(--ink)" textAnchor="middle">
              PayMe
            </text>
            <text x="437" y="176" className="font-mono" fontSize="10.5" fill="var(--ink-faint)" textAnchor="middle">
              generate-sale
            </text>
          </g>

          <text
            x="572"
            y="138"
            className="font-mono"
            fontSize="11.5"
            fill="var(--paper)"
            textAnchor="middle"
            style={{ animation: 'fade-in .4s ease-out 1.2s both' }}
          >
            10000 &#8722; 500
          </text>

          <g style={{ animation: 'fade-in .5s ease-out 1.25s both' }}>
            <text x="716" y="130" className="font-serif" fontSize="18" fill="var(--ink)">
              The seller&#8217;s wallet
            </text>
            <text x="716" y="150" className="font-mono" fontSize="10.5" fill="var(--ink-faint)">
              seller_payme_id
            </text>

            <text x="716" y="58" className="font-serif" fontSize="16" fill="var(--ink)">
              Marketplace
            </text>
            <text x="716" y="77" className="font-mono" fontSize="10.5" fill="var(--amber)">
              market_fee 500
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-faint">
        Amounts are integers in the currency&#8217;s minor unit, so 10000 is
        100.00 and 500 is the marketplace&#8217;s 5%. PayMe deducts its own
        processing fees from the seller&#8217;s side before the balance becomes
        releasable.
      </figcaption>
    </figure>
  );
}
