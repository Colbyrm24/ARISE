import { METRIC_META, progressOf, fmt, type Metric } from '@/lib/metrics';

/*
  How close to the goal, as a shape rather than a sentence.

  Two forms, same data and same colour. The ring is for the two headline
  numbers, where the client wants "am I close" answered before they read
  anything. The bar is for the row of smaller ones, where the useful thing is
  comparing several at once and a row of circles wastes the width.

  Both always carry their label and their number. Colour separates them at a
  glance; the text is what actually tells you which is which, so nothing here
  depends on being able to tell two hues apart.
*/

type Props = {
  metric: Metric;
  value: number;
  target: number | null | undefined;
  /** Overrides the label, e.g. "Steps today". */
  label?: string;
};

/** Ring geometry. 36-unit box so the stroke maths stays legible. */
const R = 15.5;
const CIRC = 2 * Math.PI * R;

export function ProgressRing({ metric, value, target, label, size = 96 }: Props & { size?: number }) {
  const meta = METRIC_META[metric];
  const p = progressOf(value, target);
  const dash = p.untargeted ? 0 : (p.pct / 100) * CIRC;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
          {/* The track. Always a full circle, so an empty ring still reads as
              a ring rather than as a missing element. */}
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="3"
          />
          {dash > 0 && (
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              /* Over a budget is the one state that stops being the metric's
                 own colour — going past a calorie ceiling is the thing this
                 screen exists to catch, and it should not look like progress. */
              stroke={p.over && meta.mode === 'budget' ? 'hsl(var(--destructive))' : meta.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="readout text-lg leading-none tabular-nums">{fmt(value)}</span>
          {!p.untargeted && (
            <span className="readout mt-0.5 text-[10px] leading-none text-muted-foreground tabular-nums">
              /{fmt(Number(target))}
              {meta.unit}
            </span>
          )}
        </div>
      </div>

      <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
        {label ?? meta.label}
      </span>
    </div>
  );
}

export function ProgressBar({ metric, value, target, label, done }: Props & { done?: string }) {
  const meta = METRIC_META[metric];
  const p = progressOf(value, target);
  const spilled = p.over && meta.mode === 'budget';

  /*
    Nothing to do is not the same as nothing done.

    A rest day has no session and no step target from the calendar, so the bar
    for it rendered as an empty track next to a 0 — which is exactly what a
    missed workout looks like. On a screen whose whole job is showing what is
    behind, that is the worst possible false positive. When there is no goal to
    be a fraction of, the row says so in words and the track goes away.
  */
  if (p.untargeted && done) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="readout flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            {label ?? meta.label}
          </span>
        </div>
        <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">{done}</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="readout flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {/* A 6px dot of the series colour beside the label. This is what ties
              the bar to its name when several sit in a column. */}
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: spilled ? 'hsl(var(--destructive))' : meta.color }}
          />
          {label ?? meta.label}
        </span>
        <span className={`readout text-[10px] tabular-nums ${spilled ? 'text-destructive' : ''}`}>
          {fmt(value)}
          {meta.unit}
          {!p.untargeted && (
            <span className="text-muted-foreground">
              /{fmt(Number(target))}
              {meta.unit}
            </span>
          )}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden bg-secondary">
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${p.pct}%`,
            background: spilled ? 'hsl(var(--destructive))' : meta.color,
          }}
        />
      </div>
    </div>
  );
}
