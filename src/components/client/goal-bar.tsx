import { progressOf } from '@/lib/metrics';
import { countState, type CountMode } from '@/components/ui/system-window';

/*
  The fill under a daily goal.

  Deliberately not ProgressBar from progress-ring.tsx: that one is keyed to a
  Metric — it owns the label, the colour dot and the unit, because it exists
  to let several different series be compared in one column. A goal row has
  already said its name and its number on the line above, so all that is
  wanted here is the shape, full width, carrying no text of its own.

  Colour follows state rather than series. There is only one thing a goal can
  be: not there yet, landed, or — for a budget like calories — spilled past.
*/
export function GoalBar({
  label,
  value,
  total,
  mode,
  done,
}: {
  /** Names the bar for a screen reader; the row's own text carries it visually. */
  label: string;
  value?: number;
  total?: number;
  mode: CountMode;
  done: boolean;
}) {
  const p = progressOf(value ?? 0, total);

  /*
    A manual habit has no number to be a fraction of. Showing it an empty
    track would say "none of this done" on a row the client has just ticked,
    so an untargeted goal reads as its own binary: full when done, an empty
    track when not.
  */
  const pct = p.untargeted ? (done ? 100 : 0) : p.pct;

  /*
    Spilled is countState's call, not progressOf's.

    progressOf.over is `ratio > 1`; the Count sitting directly above this bar
    uses countState, which only calls a budget over at 1.05 — "a 5% overshoot
    on a 2,000 target is 100 calories, inside the error bars". Re-deriving it
    here from the stricter threshold meant 2,050 against 2,000 rendered a
    green number and a ticked box above a full-width red bar: one row
    disagreeing with itself on the most-looked-at card in the app.
  */
  const spilled = value !== undefined && countState(value, total, mode) === 'over';

  return (
    <div
      className="h-1.5 w-full overflow-hidden bg-secondary"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* No transition: the width is set inline on the server, so the first
          paint is the final width and there is nothing to animate from. */}
      <div
        className={
          'h-full ' +
          (spilled
            ? 'bg-destructive'
            : done || p.hit
              ? 'bg-success shadow-[0_0_12px_-1px_hsl(var(--success)/0.8)]'
              : 'bg-accent shadow-[0_0_12px_-1px_hsl(var(--accent)/0.7)]')
        }
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
