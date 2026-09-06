import { stage } from '../../lib/reveal';

/**
 * The split, drawn as a function of progress rather than of time.
 *
 * The caller decides what drives `progress` — a scroll position, an
 * intersection, or nothing at all — so the same diagram serves a scrubbed
 * scrollytelling section and a static tile without forking.
 *
 * Three stages, in payment order:
 *   0.00 – 0.45  the buyer's money reaches PayMe
 *   0.45 – 0.80  the marketplace's cut peels off the top
 *   0.80 – 1.00  the remainder lands in the seller's wallet
 */

const MAIN_LENGTH = 250;
const FEE_LENGTH = 300;
const REST_LENGTH = 260;

export function Flow({ progress }: { progress: number }) {
  const paid = stage(progress, 0, 0.45);
  const split = stage(progress, 0.45, 0.8);
  const landed = stage(progress, 0.8, 1);

  return (
    <svg
      viewBox="0 0 1000 260"
      role="img"
      aria-label="A buyer pays 10000 in minor units. PayMe splits it: 500 is the marketplace's market_fee, and the remaining 9500 lands in the seller's own wallet."
      className="h-auto w-full"
    >
      {/* Buyer's money reaching the gate. */}
      <path
        d="M 250 150 L 430 150"
        fill="none"
        stroke="var(--v-accent)"
        strokeWidth={44}
        strokeDasharray={MAIN_LENGTH}
        strokeDashoffset={MAIN_LENGTH * (1 - paid)}
      />

      {/* The cut, peeling off the top edge. Drawn before the remainder so the
          thicker band sits over its origin and the two read as one division. */}
      <path
        d="M 446 130 C 560 130, 590 66, 720 66"
        fill="none"
        stroke="var(--v-deep)"
        strokeWidth={9}
        strokeDasharray={FEE_LENGTH}
        strokeDashoffset={FEE_LENGTH * (1 - split)}
      />

      <path
        d="M 446 154 L 720 154"
        fill="none"
        stroke="var(--v-accent)"
        strokeWidth={36}
        strokeDasharray={REST_LENGTH}
        strokeDashoffset={REST_LENGTH * (1 - split)}
      />

      <rect x="430" y="118" width="16" height="64" rx="3" fill="var(--v-deep)" />

      <g fill="var(--v-display)" fontSize="29" style={{ fontWeight: 600 }}>
        <text x="16" y="146">Buyer</text>
        <text x="740" y="160" opacity={landed}>
          Seller&#8217;s wallet
        </text>
        <text x="740" y="60" opacity={split}>
          Marketplace
        </text>
      </g>

      <g className="font-mono" fontSize="17" fill="var(--v-body)">
        <text x="16" y="172">pays once</text>
        <text x="438" y="100" textAnchor="middle">
          generate-sale
        </text>
        <text x="740" y="184" opacity={landed}>
          9500 to their MPL
        </text>
        <text x="740" y="84" opacity={split}>
          market_fee 500
        </text>
      </g>

      <text
        x="340"
        y="156"
        textAnchor="middle"
        fontSize="18"
        className="font-mono"
        fill="var(--v-deep)"
        opacity={paid}
      >
        sale_price 10000
      </text>
    </svg>
  );
}
