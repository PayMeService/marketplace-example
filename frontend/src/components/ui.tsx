import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ApiError } from '../lib/api';
import { formatMoney } from '../lib/money';

/* ==========================================================================
   The vocabulary
   --------------------------------------------------------------------------
   Four surfaces, and each one means something. Reaching for the wrong one is
   how a UI ends up as an undifferentiated stack of boxes:

     Sheet   a work surface — a form, a table, a result. A raised white card.
             This is the only thing that gets a box.
     Slip    a small readout with no header: a balance, a receipt line.
     Rule    a labelled hairline that opens a section. Not a box at all, which
             is why sections can nest inside a Sheet without doubling borders.
     Note    a margin annotation. Also not a box — a hairline in the gutter.

   Depth comes from a single soft shadow, kept identical on every raised
   surface: varying it per component is what makes an interface look assembled
   from parts. The hairline border alongside it is there for dark mode, where a
   shadow on a dark ground is invisible.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Page scaffolding
   -------------------------------------------------------------------------- */

/**
 * The reading grid: a main column and a fixed margin for annotations.
 *
 * Every Spread on a page uses the same track sizes, so notes in separate
 * Spreads line up into one continuous margin down the page while each one
 * still sits beside the thing it is talking about. That alignment is the whole
 * reason the notes moved out of the content flow — inline, they interrupted
 * the task; in the margin, they annotate it.
 *
 * Pass `aside={null}` to hold the column open on a Spread that has no note of
 * its own — that is what keeps every Spread on the page measuring the same.
 * Omitting `aside` entirely gives a single full-width column instead.
 */
export function Spread({
  aside,
  children,
  className = '',
}: {
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (aside === undefined) {
    return <div className={`space-y-6 ${className}`}>{children}</div>;
  }

  return (
    <div
      className={`lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-x-10 ${className}`}
    >
      <div className="min-w-0 space-y-6">{children}</div>
      <aside className="mt-6 space-y-5 empty:mt-0 lg:mt-0">{aside}</aside>
    </div>
  );
}

/**
 * A page heading, and the decision about whether the page has a margin.
 *
 * `rail` only reserves the margin column beside the heading so the heading
 * measures the same as the content below it. The heading deliberately cannot
 * carry a note of its own: a tall note in the same grid row as a short heading
 * sets that row's height, and every section below gets pushed down by however
 * long the note happens to be. Notes belong to the Spread of the section they
 * annotate.
 */
export function Page({
  title,
  lede,
  actions,
  rail = false,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Reserve the margin column, for a page whose sections carry notes. */
  rail?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <Spread aside={rail ? null : undefined}>
        <header className="border-b border-rule-strong pb-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1
              className="text-[2.15rem] leading-[1.05] text-ink"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                letterSpacing: '-0.035em',
              }}
            >
              {title}
            </h1>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          {lede && (
            <div className="mt-3 max-w-[62ch] text-[15px] leading-[1.65] text-ink-soft">
              {lede}
            </div>
          )}
        </header>
      </Spread>
      {children}
    </div>
  );
}

/**
 * A labelled hairline that opens a section.
 *
 * `step` is only ever passed where the content really is a sequence — the
 * three-call Hosted Fields dance, the subscription lifecycle. A number beside
 * something that is not ordered is a lie about the content.
 *
 * `hint` carries the PayMe endpoint the section corresponds to, right-aligned
 * on the rule, so the wire call is legible without a paragraph explaining it.
 */
export function Rule({
  step,
  label,
  hint,
}: {
  step?: number;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {step !== undefined && (
        <span className="grid size-6 shrink-0 place-items-center rounded-[2px] border border-rule-strong font-mono text-[11px] text-ink-soft">
          {step}
        </span>
      )}
      <h2 className="font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[1.1rem] leading-none text-ink">{label}</h2>
      <span className="h-px flex-1 bg-rule" />
      {hint && (
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">{hint}</span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Surfaces
   -------------------------------------------------------------------------- */

export function Sheet({
  title,
  description,
  actions,
  children,
  className = '',
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Drop the body padding — for a Sheet that is nothing but a table. */
  flush?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_2px_10px_rgba(16,22,25,0.05)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[1.05rem] font-semibold leading-tight text-ink">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 break-words text-[13px] leading-snug text-ink-soft">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'px-5 py-4'}>{children}</div>
    </section>
  );
}

/** A small readout with no header — a balance, a receipt, a key. */
export function Slip({
  children,
  className = '',
  tone,
}: {
  children: ReactNode;
  className?: string;
  /** Marks the slip's left edge, for a value that carries a verdict. */
  tone?: 'pen' | 'seal' | 'stamp' | 'amber';
}) {
  const edge = tone
    ? { pen: 'border-l-[3px] border-l-pen', seal: 'border-l-[3px] border-l-seal', stamp: 'border-l-[3px] border-l-stamp', amber: 'border-l-[3px] border-l-amber' }[tone]
    : '';
  return (
    <div
      className={`rounded-xl border border-rule bg-paper p-4 shadow-[0_2px_10px_rgba(16,22,25,0.05)] ${edge} ${className}`}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-pen text-paper hover:scale-[1.03] disabled:hover:scale-100',
  secondary:
    'border border-rule bg-paper text-ink shadow-[0_2px_10px_rgba(16,22,25,0.05)] hover:scale-[1.03] disabled:hover:scale-100',
  ghost: 'text-ink hover:bg-pen-wash',
  danger: 'bg-stamp text-white hover:scale-[1.03] disabled:hover:scale-100',
};

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    >
      {loading && (
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Form controls
   -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <span className="mt-1 block text-[12px] leading-snug text-ink-faint">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[12px] leading-snug text-stamp">{error}</span>
      )}
    </label>
  );
}

const CONTROL =
  'block w-full rounded-xl border border-rule bg-paper px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink-faint disabled:bg-ledger-alt disabled:text-ink-faint';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

/** A checkbox with its explanation attached, for options that need one. */
export function Check({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-ledger-alt px-3.5 py-3">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-pen"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-[13px]">
        <span className="font-medium text-ink">{label}</span>
        {children && (
          <span className="mt-0.5 block leading-relaxed text-ink-soft">{children}</span>
        )}
      </span>
    </label>
  );
}

/* --------------------------------------------------------------------------
   Marks
   -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STAMP_STYLES: Record<Tone, string> = {
  neutral: 'bg-ink/8 text-ink-soft',
  success: 'bg-seal/12 text-seal',
  warning: 'bg-amber/14 text-amber',
  danger: 'bg-stamp/12 text-stamp',
  info: 'bg-accent/25 text-ink',
};

/**
 * A status mark: an outline stamped on one edge, not a filled pill.
 *
 * Filled pills would compete with the green ground, and every status in this
 * app is a verbatim PayMe value (`authorized`, `partial-refund`) — so they are
 * set in the mono face, lower case, exactly as they arrive on the wire.
 *
 * Each edge gets its own border property rather than a shorthand plus an
 * override, so the heavy left edge never loses to the faint outline whatever
 * order the utilities end up in.
 */
export function Stamp({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 align-middle font-mono text-[11px] leading-5 ${STAMP_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * An amount.
 *
 * `minorUnits` prints the integer PayMe actually receives underneath the human
 * figure. Money is integer minor units everywhere in this codebase and only
 * becomes a decimal at the display edge — showing both at that edge is the
 * cheapest way to keep the rule visible to whoever reads the app next.
 */
export function Money({
  minor,
  currency,
  size = 'md',
  minorUnits = false,
  tone,
}: {
  minor: number;
  currency: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  minorUnits?: boolean;
  tone?: 'stamp' | 'seal';
}) {
  const scale = {
    sm: 'text-[13px]',
    md: 'text-[15px]',
    lg: 'text-[22px] leading-tight',
    xl: 'text-[34px] leading-none tracking-[-0.02em]',
  }[size];
  const color = tone === 'stamp' ? 'text-stamp' : tone === 'seal' ? 'text-seal' : 'text-ink';

  return (
    <span className="inline-block">
      <span className={`tabular font-mono ${scale} ${color}`}>
        {formatMoney(minor, currency)}
      </span>
      {minorUnits && (
        <span className="tabular mt-0.5 block font-mono text-[10px] text-ink-faint">
          {minor} minor
        </span>
      )}
    </span>
  );
}

/** Monospace inline code, for PayMe field names and ids. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-ledger-alt px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

/* --------------------------------------------------------------------------
   Messages
   -------------------------------------------------------------------------- */

/**
 * A margin annotation explaining what is happening on the wire.
 *
 * The reason this app exists is to be read, so the UI narrates the PayMe calls
 * it is making rather than hiding them. It does that from the gutter: a
 * hairline and small type, with no box, so twenty of these across the app add
 * twenty rules rather than twenty more rectangles.
 */
export function Note({
  title,
  children,
  tone = 'info',
}: {
  title?: ReactNode;
  children: ReactNode;
  tone?: 'info' | 'warning';
}) {
  return (
    <aside
      className={`max-w-[68ch] border-l-2 pl-4 ${tone === 'warning' ? 'border-amber' : 'border-rule-strong'}`}
    >
      {title && (
        <p
          className={`font-[family-name:var(--font-display)] font-semibold tracking-[-0.03em] text-[15px] leading-snug ${tone === 'warning' ? 'text-amber' : 'text-ink'}`}
        >
          {title}
        </p>
      )}
      <div
        className={`space-y-2 text-[13px] leading-[1.6] text-ink-soft ${title ? 'mt-1.5' : ''}`}
      >
        {children}
      </div>
    </aside>
  );
}

/**
 * Error banner that surfaces PayMe's own message when there is one.
 *
 * PayMe's `status_error_details` is usually specific and actionable ("For
 * business type Sole Proprietorship the business number must be identical to
 * the owner's ID number") — far more useful than anything we could paraphrase.
 * The error code and session id are shown because they are what PayMe support
 * asks for.
 */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="rounded-xl border-l-[3px] border-l-stamp bg-stamp-wash px-4 py-3">
      <p className="text-[13px] font-medium text-stamp">{message}</p>
      {apiError?.payme && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] text-stamp">
          <dt className="opacity-70">endpoint</dt>
          <dd>{apiError.payme.endpoint}</dd>
          {apiError.payme.errorCode !== null && (
            <>
              <dt className="opacity-70">error code</dt>
              <dd>{apiError.payme.errorCode}</dd>
            </>
          )}
          {apiError.payme.additionalInfo != null && (
            <>
              <dt className="opacity-70">field</dt>
              <dd>{String(apiError.payme.additionalInfo)}</dd>
            </>
          )}
          {apiError.payme.session && (
            <>
              <dt className="opacity-70">session</dt>
              <dd title="Quote this to PayMe support — it is how they find the request in their logs">
                {apiError.payme.session}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/** Confirmation that something took effect. Was hand-rolled on three pages. */
export function Flash({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-[3px] border-l-seal bg-seal-wash px-4 py-3 text-[13px] text-seal">
      {children}
    </div>
  );
}

/** An empty screen is an invitation to act, so it always carries the next step. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-ledger-alt px-6 py-12 text-center">
      <p className="text-[1.05rem] font-semibold text-ink">{title}</p>
      {children && (
        <div className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-ink-soft">
          {children}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-8 font-mono text-[12px] text-ink-faint">
      <span className="size-3.5 animate-spin rounded-full border-2 border-rule-strong border-t-pen" />
      {label}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Data
   -------------------------------------------------------------------------- */

/**
 * Term/value pairs. Used everywhere PayMe's response is put on screen, which
 * before this was six near-identical hand-built <dl> grids.
 */
export function DataList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 gap-y-2">{children}</dl>;
}

export function Entry({
  term,
  children,
  wide = false,
}: {
  term: ReactNode;
  children: ReactNode;
  /** Values that are ids or hashes: mono, and allowed to break mid-string. */
  wide?: boolean;
}) {
  return (
    <div className="contents">
      <dt className="font-mono text-[11px] leading-5 text-ink-faint">{term}</dt>
      <dd
        className={`text-[13px] leading-5 text-ink ${wide ? 'break-all font-mono text-[11px]' : ''}`}
      >
        {children}
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Greenbar tables
   -------------------------------------------------------------------------- */

/**
 * A wide table must scroll inside itself, never scroll the page.
 *
 * Bands come from `.greenbar` in index.css and run to the sheet's edges, so a
 * Ledger belongs in a `flush` Sheet and the edge padding lives on the cells
 * (`first:pl-5 last:pr-5`) rather than on the sheet body. Pulling the wrapper
 * out with a negative margin instead would push that padding past the sheet's
 * own border, where `overflow-hidden` clips it and the first column ends up
 * sitting on the frame.
 *
 * Rows carry no rule between them: on ledger paper the band is the separator.
 */
export function Ledger({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="greenbar w-full min-w-[680px] border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-rule-strong px-3 pb-2 pt-4 text-[11px] font-semibold text-ink-soft first:pl-5 last:pr-5 ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-4 align-top text-ink-soft first:pl-5 last:pr-5 ${
        align === 'right' ? 'text-right' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** The first cell of a row: what the row is about. */
export function TdPrimary({
  name,
  id,
  children,
}: {
  name: ReactNode;
  id?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Td>
      <p className="font-medium text-ink">{name}</p>
      {id && (
        <p className="mt-0.5 break-all font-mono text-[10px] text-ink-faint">{id}</p>
      )}
      {children}
    </Td>
  );
}
