import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The system window.
 *
 * This is the one component the whole identity rests on: a bordered panel
 * with light breaking across its top edge, 1px corner ticks instead of a
 * radius, and a centred title bar. Everything in ARISE that needs to feel
 * "opened in front of you" — a session, a check-in, a payment notice — is
 * a variation of this.
 *
 * It's built to drop in wherever a Card is used today: same padding rhythm,
 * same children. The difference is that the lit edge *is* the title bar, so
 * a SystemWindow never gets a coloured header block on top of it.
 */

/** Corner ticks. Purely decorative, so they're hidden from assistive tech. */
function Ticks() {
  const base = 'pointer-events-none absolute h-2 w-2 border-accent/70';
  return (
    <span aria-hidden className="contents">
      <span className={cn(base, 'left-1.5 top-1.5 border-l border-t')} />
      <span className={cn(base, 'right-1.5 top-1.5 border-r border-t')} />
      <span className={cn(base, 'bottom-1.5 left-1.5 border-b border-l')} />
      <span className={cn(base, 'bottom-1.5 right-1.5 border-b border-r')} />
    </span>
  );
}

/* `title` is omitted from the div attributes on purpose — here it's the
   window's title bar, not the browser's tooltip attribute, and it accepts
   nodes rather than a bare string. */
export interface SystemWindowProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Centred title bar text. Rendered uppercase and letter-spaced. */
  title?: React.ReactNode;
  /** Sits at the right of the title row — a count, a date, a link. */
  meta?: React.ReactNode;
  /**
   * Swaps the blue light for red. For overdue payments and dropped clients
   * only — red is spent maybe twice in the entire product, and it stops
   * meaning anything the moment it's used for merely-important things.
   */
  alert?: boolean;
  /** Drop the corner ticks. Use inside dense lists where they'd pile up. */
  plain?: boolean;
  /** Lifts on hover. For windows that sit inside a Link or button. */
  interactive?: boolean;
}

const SystemWindow = React.forwardRef<HTMLDivElement, SystemWindowProps>(
  (
    { className, title, meta, alert, plain, interactive, children, ...props },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        'relative border bg-card text-card-foreground transition-all duration-200',
        alert
          ? 'border-destructive/60 shadow-[inset_0_0_40px_hsl(var(--destructive)/0.08)]'
          : 'surface-sheen lit-edge border-border',
        interactive &&
          'hover:border-accent/40 hover:shadow-[0_0_0_1px_hsl(var(--accent)/0.1),0_16px_36px_-18px_hsl(var(--system)/0.55)]',
        className
      )}
      {...props}
    >
      {!plain && !alert && <Ticks />}

      {/* The red variant gets a flat top rule rather than the bloom — an
          alert shouldn't look like it's glowing invitingly. */}
      {alert && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-px -right-px -top-px h-0.5 bg-destructive"
        />
      )}

      {title && (
        <div className="flex items-center gap-3 px-5 pb-0 pt-5">
          <div
            className={cn(
              'flex flex-1 items-center justify-center border px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.3em]',
              alert
                ? 'border-destructive/50 bg-destructive/[0.07] text-destructive'
                : 'glow border-accent/35 bg-accent/[0.07] text-foreground'
            )}
          >
            {title}
          </div>
          {meta && (
            <span className="readout shrink-0 text-[10px] uppercase text-muted-foreground">
              {meta}
            </span>
          )}
        </div>
      )}

      {children}
    </div>
  )
);
SystemWindow.displayName = 'SystemWindow';

/**
 * Body of a window. Matches CardContent's rhythm so the two are
 * interchangeable during the migration.
 */
const SystemWindowContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5', className)} {...props} />
));
SystemWindowContent.displayName = 'SystemWindowContent';

/**
 * Bracket notation: [3/5], [112/185g], [8.2/10k].
 *
 * A percentage tells someone how they're doing; a bracket tells them what's
 * left. Use it for anything a client is working through — sets, reps,
 * protein, steps, sessions — and don't use it for things that aren't a
 * progression (weight, dates, money).
 */
export function Count({
  value,
  total,
  unit,
  className,
}: {
  value: number | string;
  total?: number | string;
  unit?: string;
  className?: string;
}) {
  const done = total !== undefined && Number(value) >= Number(total);
  return (
    <span
      className={cn(
        'readout text-sm',
        // Green means complete, and complete is the only thing it means.
        done ? 'text-success' : 'text-accent glow-soft',
        className
      )}
    >
      [{value}
      {total !== undefined ? `/${total}` : ''}
      {unit ?? ''}]
    </span>
  );
}

/**
 * The small square that fills in when something is finished. Deliberately
 * not a checkmark — a filled cell reads as a slot being occupied, which is
 * what a completed set actually is.
 */
export function Cell({ on, className }: { on?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-block h-4 w-4 shrink-0 border',
        on
          ? 'border-success bg-success/10 after:absolute after:inset-[3px] after:bg-success after:shadow-[0_0_10px_hsl(var(--success)/0.8)]'
          : 'border-border',
        className
      )}
    />
  );
}

export { SystemWindow, SystemWindowContent };
