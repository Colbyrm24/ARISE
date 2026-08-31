import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AchievementState } from '@/lib/achievements';

/*
  The badges.

  Earned ones are lit and locked ones are not, and the locked ones nearest to
  being earned float to the top — that ordering is done in the lib, and it is
  the thing that makes this screen change behaviour rather than just decorate
  it. Somebody two days off a seven-day streak should see that first.

  Locked badges show what earns them rather than hiding behind a question
  mark. A mystery badge is a puzzle; a named one is a plan.
*/
export function AchievementBoard({ states }: { states: AchievementState[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {states.map((a) => (
        <li
          key={a.id}
          className={cn(
            'flex flex-col gap-1.5 border p-3',
            a.earned ? 'border-accent/40 bg-accent/[0.06]' : 'border-border/60'
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'text-[15px] font-medium',
                a.earned ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              {a.title}
            </span>
            {a.earned ? (
              <span className="readout shrink-0 text-[10px] uppercase tracking-wider text-accent">
                Earned
              </span>
            ) : (
              <Lock size={12} className="shrink-0 text-muted-foreground" aria-label="Locked" />
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{a.detail}</p>

          {/*
            Only on the ones that are a climb. A bar under "Finish your first
            workout" would be measuring a thing with no middle.
          */}
          {a.progress !== null && (
            <div
              className="mt-0.5 h-1 w-full overflow-hidden bg-secondary"
              role="progressbar"
              aria-label={a.title}
              aria-valuenow={Math.round(a.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-accent/70"
                style={{ width: `${Math.round(a.progress * 100)}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
