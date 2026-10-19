import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { ScheduleBoard, type BoardDay, type BoardItem } from '@/components/coach/schedule-board';
import { todayIn, zoneOf } from '@/lib/day';
import { moveSession, pushBack, removeSession, setDaySession } from './actions';
import {
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

  It is also where a coach rearranges a client's month, Trainerize-style:
  drag a session to another day (the two days swap), or tap a day to change
  it, remove it, or push everything after it back. That used to be refused
  here on the grounds that it would desync from the program — but the deploy
  COPIES rows on purpose so one client's Tuesday can change without touching
  anyone else's, and an edited row keeps its deploy's ownership, so
  re-deploying the program still replaces it cleanly.

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
    select: {
      userId: true,
      user: { select: { profile: { select: { timezone: true } } } },
      // Which workouts can be placed on a day: only ones from the program
      // they are on. The client's workout screen refuses anything else.
      clientPrograms: {
        where: { active: true },
        take: 1,
        select: {
          template: {
            select: { workouts: { orderBy: { dayOrder: 'asc' }, select: { id: true, name: true } } },
          },
        },
      },
    },
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

  /*
    Plain values only from here on — the board is a client component and a
    Date or a Prisma Decimal does not survive the trip to the browser intact.
  */
  const boardItems: BoardItem[] = scheduled.map((item) => ({
    id: item.id,
    date: key(item.date),
    kind: item.kind,
    label: item.label,
    done: Boolean(item.completedAt),
  }));

  const boardDays: BoardDay[] = days.map((day) => {
    const k = key(day);
    const food = foodByDay.get(k);
    const weight = weightByDay.get(k);
    return {
      key: k,
      dayOfMonth: day.getUTCDate(),
      // Days either side of the month stay visible but recede, so the
      // month's own shape is what you read first.
      outside: !inMonth(day),
      today: k === todayKey,
      food: food ? `${food.calories.toLocaleString('en-US')} cal · ${food.meals}` : undefined,
      weight: weight !== undefined ? `${weight} lbs` : undefined,
    };
  });

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

      <ScheduleBoard
        clientId={client.userId}
        days={boardDays}
        items={boardItems}
        workouts={client.clientPrograms[0]?.template.workouts ?? []}
        moveSession={moveSession}
        removeSession={removeSession}
        setDaySession={setDaySession}
        pushBack={pushBack}
      />
    </div>
  );
}
