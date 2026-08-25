import Link from 'next/link';
import { cn } from '@/lib/utils';

/*
  The week, as seven taps.

  Today used to be the only day a client could see. The program existed —
  twenty-six weeks of it, stamped out day by day — but the app showed you a
  single slice of it and no way to look either side. "What am I doing
  tomorrow" and "what did I miss on Sunday" both meant asking the coach.

  Deliberately a week and not a month. The question this answers is "what do
  I have to do", which is a question about days you can still act on; a month
  grid is a different question and belongs on its own screen if it ever earns
  one.
*/

export type StripDay = {
  /** YYYY-MM-DD, and the value the day links to. */
  iso: string;
  /** Single letter, Mon-first. */
  letter: string;
  dayNumber: number;
  /** A session is scheduled. Rest days deliberately do not count. */
  hasSession: boolean;
  isRest: boolean;
  isToday: boolean;
  isSelected: boolean;
};

export function WeekStrip({ days }: { days: StripDay[] }) {
  return (
    <nav aria-label="This week" className="grid grid-cols-7 gap-1">
      {days.map((day) => (
        <Link
          key={day.iso}
          href={day.isToday ? '/today' : `/today?d=${day.iso}`}
          aria-current={day.isSelected ? 'date' : undefined}
          className={cn(
            'flex flex-col items-center gap-1.5 border py-2 transition-colors',
            day.isSelected
              ? 'border-accent/60 bg-accent/10'
              : 'border-border/50 hover:border-accent/40'
          )}
        >
          <span
            className={cn(
              'readout text-[10px] uppercase',
              day.isSelected ? 'text-accent' : 'text-muted-foreground'
            )}
          >
            {day.letter}
          </span>
          <span
            className={cn(
              'text-sm tabular-nums',
              day.isSelected
                ? 'glow-soft font-medium text-foreground'
                : day.isToday
                  ? 'text-foreground'
                  : 'text-muted-foreground'
            )}
          >
            {day.dayNumber}
          </span>
          {/*
            One dot per day, and only for days with a session on them. A rest
            day reads as an empty slot on purpose — the gaps in the row are
            how the shape of the week becomes visible at a glance.

            The element is always rendered so every cell is the same height;
            a row that changed height as you moved across it looked broken.
          */}
          <span
            aria-hidden
            className={cn(
              'h-1 w-1 rounded-full',
              day.hasSession
                ? day.isSelected
                  ? 'bg-accent shadow-[0_0_6px_hsl(var(--accent))]'
                  : 'bg-accent/50'
                : 'bg-transparent'
            )}
          />
        </Link>
      ))}
    </nav>
  );
}
