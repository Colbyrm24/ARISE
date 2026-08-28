import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { cn } from '@/lib/utils';
import {
  WEEKDAYS,
  dayKey,
  inMonth,
  monthGrid,
  monthKey,
  monthLabel,
  parseMonth,
  shiftMonth,
} from '@/lib/month-grid';

/*
  The client's own month.

  Today answers "what do I do right now", and it is deliberately the only
  thing that screen answers. This is the other question — "what does the rest
  of this look like, and what have I actually done" — and until now the only
  person who could see it was the coach.

  It pages forward as well as back, which is the point rather than a
  nicety: a program is deployed months ahead, so the squares in September and
  October already have sessions on them. Somebody deciding whether they can
  take a weekend away should be able to look.

  Read-only. A client moving their own sessions around would desync them from
  the program the coach deployed, and "I moved it" is a conversation to have
  in Messages, not a drag that silently rewrites the plan.
*/

export const dynamic = 'force-dynamic';

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams?: { m?: string };
}) {
  const user = await requireClient();

  const { year, month } = parseMonth(searchParams?.m);
  const { gridStart, gridEnd, days } = monthGrid(year, month);

  const [scheduled, nutrition, weights] = await Promise.all([
    prisma.scheduledItem.findMany({
      where: { clientId: user.id, date: { gte: gridStart, lte: gridEnd } },
      orderBy: [{ date: 'asc' }, { kind: 'asc' }],
      select: { id: true, date: true, kind: true, label: true, completedAt: true },
    }),
    prisma.nutritionLog.findMany({
      where: { clientId: user.id, date: { gte: gridStart, lte: gridEnd } },
      select: { date: true, calories: true },
    }),
    prisma.weightLog.findMany({
      where: { clientId: user.id, date: { gte: gridStart, lte: gridEnd } },
      select: { date: true, weight: true },
    }),
  ]);

  type DaySession = { id: string; kind: string; label: string; done: boolean };
  const sessionsByDay = new Map<string, DaySession[]>();
  for (const item of scheduled) {
    const k = dayKey(item.date);
    const list = sessionsByDay.get(k) ?? [];
    list.push({ id: item.id, kind: item.kind, label: item.label, done: Boolean(item.completedAt) });
    sessionsByDay.set(k, list);
  }

  const foodByDay = new Map<string, number>();
  for (const log of nutrition) {
    const k = dayKey(log.date);
    foodByDay.set(k, (foodByDay.get(k) ?? 0) + log.calories);
  }

  const weightByDay = new Map<string, number>();
  for (const w of weights) weightByDay.set(dayKey(w.date), Number(w.weight));

  /*
    This month only. The grid's leading and trailing squares belong to the
    neighbouring months, and counting them would tell somebody they trained
    more days in August than August has.
  */
  const mine = scheduled.filter((s) => inMonth(s.date, year, month));
  const doneWorkouts = mine.filter((s) => s.kind === 'workout' && s.completedAt).length;
  const allWorkouts = mine.filter((s) => s.kind === 'workout').length;
  const summary = [
    { label: 'Workouts', value: `${doneWorkouts}/${allWorkouts}` },
    { label: 'Cardio', value: String(mine.filter((s) => s.kind === 'cardio' && s.completedAt).length) },
    {
      label: 'Days logged',
      value: String(
        new Set(nutrition.filter((n) => inMonth(n.date, year, month)).map((n) => dayKey(n.date))).size
      ),
    },
    {
      label: 'Weigh-ins',
      value: String(weights.filter((w) => inMonth(w.date, year, month)).length),
    },
  ];

  const todayKey = dayKey(new Date());
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything that&apos;s planned, and everything you&apos;ve done.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Link
            href={`/calendar?m=${monthKey(prev.year, prev.month)}`}
            aria-label="Previous month"
            className="border border-border/70 p-2 text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            <ChevronLeft size={15} />
          </Link>
          <Link
            href={`/calendar?m=${monthKey(next.year, next.month)}`}
            aria-label="Next month"
            className="border border-border/70 p-2 text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            <ChevronRight size={15} />
          </Link>
          <h2 className="ml-2 text-lg font-semibold">{monthLabel(year, month)}</h2>
        </div>

        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {summary.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-2">
              <dt className="readout text-[10px] uppercase text-muted-foreground">{stat.label}</dt>
              <dd className="readout text-sm text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <SystemWindow plain>
        <SystemWindowContent className="p-0">
          <div className="grid grid-cols-7 border-b border-border/60">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="readout px-1 py-2 text-center text-[10px] uppercase text-muted-foreground"
              >
                {/* One letter on a phone — "Wed" in a 50px column wraps. */}
                <span className="sm:hidden">{d[0]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const k = dayKey(day);
              const outside = !inMonth(day, year, month);
              const sessions = sessionsByDay.get(k) ?? [];
              const calories = foodByDay.get(k);
              const weight = weightByDay.get(k);

              return (
                <div
                  key={k}
                  className={cn(
                    'min-h-[64px] border-b border-r border-border/40 p-1 sm:min-h-[104px] sm:p-1.5',
                    outside && 'opacity-35',
                    k === todayKey && 'bg-accent/[0.07]'
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        'readout text-[11px] tabular-nums',
                        k === todayKey ? 'text-accent' : 'text-muted-foreground'
                      )}
                    >
                      {day.getUTCDate()}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    {sessions.map((s) => (
                      <span key={s.id} title={s.label}>
                        {/*
                          A phone column is about 48px wide, which fits no
                          words at all. Below sm each session is a dot that
                          keeps the one distinction worth keeping — done, or
                          not — and the full labels come back the moment
                          there is room for them.
                        */}
                        <span
                          aria-hidden
                          className={cn(
                            'mr-0.5 inline-block h-1.5 w-1.5 rounded-full sm:hidden',
                            s.kind === 'rest'
                              ? 'bg-muted-foreground/40'
                              : s.done
                                ? 'bg-accent shadow-[0_0_6px_1px_hsl(var(--accent)/0.7)]'
                                : 'bg-transparent ring-1 ring-inset ring-border'
                          )}
                        />
                        <span
                          className={cn(
                            'hidden truncate border px-1.5 py-0.5 text-[10px] leading-tight sm:block',
                            s.kind === 'rest'
                              ? 'border-border/50 text-muted-foreground'
                              : s.done
                                ? 'border-accent/60 bg-accent/15 text-foreground'
                                : 'border-border/60 text-muted-foreground'
                          )}
                        >
                          {s.label}
                        </span>
                        <span className="sr-only">
                          {s.label}
                          {s.kind === 'rest' ? '' : s.done ? ', done' : ', not done'}
                        </span>
                      </span>
                    ))}

                    {calories !== undefined && (
                      <span className="readout hidden truncate text-[10px] text-muted-foreground sm:block">
                        {calories.toLocaleString('en-US')} cal
                      </span>
                    )}

                    {weight !== undefined && (
                      <span className="readout hidden text-[10px] text-accent/80 sm:block">
                        {weight} lbs
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SystemWindowContent>
      </SystemWindow>

      <p className="text-xs text-muted-foreground">
        Planned sessions are outlined; the ones you&apos;ve finished are filled in. Need a day
        moved? Message your coach.
      </p>
    </div>
  );
}
