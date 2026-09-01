import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { cn } from '@/lib/utils';
import { todayIn, zoneOf } from '@/lib/day';
import {
  WEEKDAYS,
  dayKey as key,
  inMonth as inGivenMonth,
  monthGrid,
  monthKey,
  parseMonth,
} from '@/lib/month-grid';

/*
  A month of a client, at a glance.

  Everything else in the console answers "what is this client doing" for
  right now. This is the only screen that answers "what have they actually
  been doing", and it answers it the way a coach actually asks it — by
  looking at a month and seeing where the gaps are.

  The whole thing is read-only on purpose. Editing a day belongs on the
  program screen, where a change ripples through the deploy; letting
  somebody drag a session around here would quietly desync the two.

  Every date in play is stored as a Postgres `date` at UTC midnight, so the
  grid is built in UTC too. Mixing local dates in here is how a session
  lands on the wrong square for anybody east of London.
*/

export default async function ClientCalendarPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { m?: string };
}) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    // timezone, because "today" on this grid is the CLIENT's today.
    select: { userId: true, user: { select: { profile: { select: { timezone: true } } } } },
  });

  if (!client) notFound();

  const { year, month } = parseMonth(searchParams?.m);
  // The grid itself lives in @/lib/month-grid, shared with the client's own
  // calendar so the two screens cannot disagree about which day is which.
  const { firstOfMonth, gridStart, gridEnd, days } = monthGrid(year, month);

  const [scheduled, nutrition, weights] = await Promise.all([
    prisma.scheduledItem.findMany({
      where: { clientId: client.userId, date: { gte: gridStart, lte: gridEnd } },
      orderBy: [{ date: 'asc' }, { kind: 'asc' }],
      select: { id: true, date: true, kind: true, label: true, completedAt: true },
    }),
    prisma.nutritionLog.findMany({
      where: { clientId: client.userId, date: { gte: gridStart, lte: gridEnd } },
      select: { date: true, calories: true },
    }),
    prisma.weightLog.findMany({
      where: { clientId: client.userId, date: { gte: gridStart, lte: gridEnd } },
      select: { date: true, weight: true },
    }),
  ]);

  /*
    Grouped in JS rather than with a groupBy per table. Six weeks is at most
    a few hundred rows and this is three round trips instead of six.

    The Map types are written out rather than inferred — `new Map(xs.map(...))`
    infers a value type of {} from an array that isn't a tuple, and the error
    surfaces somewhere else entirely.
  */
  type DaySession = { id: string; kind: string; label: string; done: boolean };
  const sessionsByDay = new Map<string, DaySession[]>();
  for (const item of scheduled) {
    const k = key(item.date);
    const list = sessionsByDay.get(k) ?? [];
    list.push({
      id: item.id,
      kind: item.kind,
      label: item.label,
      done: Boolean(item.completedAt),
    });
    sessionsByDay.set(k, list);
  }

  const foodByDay = new Map<string, { calories: number; meals: number }>();
  for (const log of nutrition) {
    const k = key(log.date);
    const row = foodByDay.get(k) ?? { calories: 0, meals: 0 };
    row.calories += log.calories;
    row.meals += 1;
    foodByDay.set(k, row);
  }

  const weightByDay = new Map<string, number>();
  for (const w of weights) weightByDay.set(key(w.date), Number(w.weight));

  // Counts for this month only — the grid's leading and trailing days belong
  // to the neighbouring months and would inflate every total.
  const inMonth = (d: Date) => inGivenMonth(d, year, month);
  const monthSessions = scheduled.filter((s) => inMonth(s.date));
  const summary = {
    workouts: monthSessions.filter((s) => s.kind === 'workout' && s.completedAt).length,
    scheduledWorkouts: monthSessions.filter((s) => s.kind === 'workout').length,
    cardio: monthSessions.filter((s) => s.kind === 'cardio' && s.completedAt).length,
    nutritionDays: new Set(
      nutrition.filter((n) => inMonth(n.date)).map((n) => key(n.date))
    ).size,
    weighIns: weights.filter((w) => inMonth(w.date)).length,
  };

  /*
    Their today, not the host's.

    Everything else on this grid is a @db.Date label at UTC midnight, so the
    squares are right; this was the one instant on the page, and its UTC day
    is not the client's. From 8pm Eastern the accent tint sat on tomorrow's
    square — and the evening is exactly when a coach opens this to ask "did
    they train today".
  */
  const todayKey = key(todayIn(zoneOf(client.user?.profile)));

  const prev = monthKey(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
  const next = monthKey(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
  const base = `/coach/clients/${client.userId}/calendar`;
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Link
            href={`${base}?m=${prev}`}
            aria-label="Previous month"
            className="border border-border/70 p-2 text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            <ChevronLeft size={15} />
          </Link>
          <Link
            href={`${base}?m=${next}`}
            aria-label="Next month"
            className="border border-border/70 p-2 text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            <ChevronRight size={15} />
          </Link>
          <h2 className="ml-2 text-lg font-semibold">{monthLabel}</h2>
        </div>

        {/*
          The month in five numbers. Workouts reads "done of scheduled"
          rather than a bare count — 12 means nothing without knowing
          whether you asked for 12 or 20.
        */}
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {[
            { label: 'Workouts', value: `${summary.workouts}/${summary.scheduledWorkouts}` },
            { label: 'Cardio', value: String(summary.cardio) },
            { label: 'Days logged', value: String(summary.nutritionDays) },
            { label: 'Weigh-ins', value: String(summary.weighIns) },
          ].map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-2">
              <dt className="readout text-[10px] uppercase text-muted-foreground">
                {stat.label}
              </dt>
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
                className="readout px-2 py-2 text-center text-[10px] uppercase text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const k = key(day);
              const outside = !inMonth(day);
              const sessions = sessionsByDay.get(k) ?? [];
              const food = foodByDay.get(k);
              const weight = weightByDay.get(k);

              return (
                <div
                  key={k}
                  className={cn(
                    'min-h-[104px] border-b border-r border-border/40 p-1.5',
                    // Days either side of the month stay visible but recede,
                    // so the month's own shape is what you read first.
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
                      <span
                        key={s.id}
                        title={s.label}
                        className={cn(
                          'block truncate border px-1.5 py-0.5 text-[10px] leading-tight',
                          s.kind === 'rest'
                            ? 'border-border/50 text-muted-foreground'
                            : s.done
                              ? // Done is the loud state. A month of hollow
                                // chips with a few filled ones is the whole
                                // point of looking at this screen.
                                'border-accent/60 bg-accent/15 text-foreground'
                              : 'border-border/60 text-muted-foreground'
                        )}
                      >
                        {s.label}
                      </span>
                    ))}

                    {food && (
                      <span className="readout block truncate text-[10px] text-muted-foreground">
                        {food.calories.toLocaleString('en-US')} cal · {food.meals}
                      </span>
                    )}

                    {weight !== undefined && (
                      <span className="readout block text-[10px] text-accent/80">
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
    </div>
  );
}
