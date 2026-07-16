import type { ComponentProps, ReactNode } from 'react';
import { humanize } from '@/lib/format';

/** Shared UI primitives — calm, bordered surfaces with tinted shadows. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover active:translate-y-px shadow-[0_1px_2px_rgba(47,79,125,0.25)]',
  secondary:
    'bg-surface text-ink border border-line-strong hover:border-primary hover:text-primary active:translate-y-px',
  danger: 'bg-danger-soft text-danger border border-danger/30 hover:bg-danger hover:text-white',
  ghost: 'text-ink-soft hover:text-primary hover:bg-primary-soft',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium',
        'transition-[background-color,color,border-color,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function Card({
  className,
  children,
  ...props
}: ComponentProps<'section'> & { children: ReactNode }) {
  return (
    <section
      {...props}
      className={cx(
        'rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  overline,
  action,
}: {
  title: ReactNode;
  overline?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        {overline ? <p className="overline mb-0.5">{overline}</p> : null}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {action}
    </header>
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'primary';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft border-line-strong',
  ok: 'bg-ok-soft text-ok border-ok/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  accent: 'bg-accent-soft text-accent-ink border-accent/25',
  primary: 'bg-primary-soft text-primary border-primary/25',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

const RUN_TONES: Record<string, Tone> = {
  completed: 'ok',
  export_ready: 'ok',
  partially_completed: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
  cancellation_requested: 'warn',
  draft: 'neutral',
  awaiting_confirmation: 'accent',
};

export function RunStatusBadge({ status }: { status: string }) {
  const tone = RUN_TONES[status] ?? 'primary';
  const active = ![
    'completed',
    'partially_completed',
    'failed',
    'cancelled',
    'draft',
    'awaiting_confirmation',
  ].includes(status);
  return (
    <Badge tone={tone}>
      {active ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
      ) : null}
      {humanize(status)}
    </Badge>
  );
}

const EMAIL_TONES: Record<string, Tone> = {
  verified: 'ok',
  found: 'accent',
  catch_all: 'warn',
  unverified: 'warn',
  inferred: 'warn',
  invalid: 'danger',
  provider_error: 'danger',
  unavailable: 'neutral',
  not_requested: 'neutral',
};

export function EmailStatusBadge({ status }: { status: string }) {
  return <Badge tone={EMAIL_TONES[status] ?? 'neutral'}>{humanize(status)}</Badge>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary disabled:bg-canvas disabled:text-ink-faint';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cx(inputClass, 'pr-8', props.className)} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div
        className="mb-1 size-10 rounded-full border border-dashed border-line-strong bg-canvas"
        aria-hidden
      />
      <p className="font-display text-base font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-sm text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Money({
  micro,
  className,
}: {
  micro: number | null | undefined;
  className?: string;
}) {
  if (micro === null || micro === undefined) return <span className="text-ink-faint">—</span>;
  const usd = micro / 1_000_000;
  return (
    <span className={cx('money', className)}>
      {usd.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: usd !== 0 && usd < 0.01 ? 4 : 2,
      })}
    </span>
  );
}

export function FixtureBadge() {
  return <Badge tone="warn">Test data</Badge>;
}

/** Accessible table shell with controlled horizontal scroll on mobile. */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-line px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-ink-faint uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx('border-b border-line px-4 py-3 align-middle', className)}>{children}</td>
  );
}
