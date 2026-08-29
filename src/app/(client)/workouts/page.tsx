import Link from 'next/link';
import { ChevronRight, Dumbbell } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { startOfDayInstantFor } from '@/lib/day';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';


export default async function WorkoutsPage() {
  const user = await requireEntitledClient();
    /*
    A DateTime bound needs the INSTANT local midnight happened, not the
    `@db.Date` label for the day. `todayFor` returns the latter — UTC midnight
    of the local calendar date — which in New York is 8pm the previous
    evening, so `startedAt >= it` swept up last night's unfinished session as
    today's and appended this morning's sets to it.
  */
  const since = startOfDayInstantFor(user);

  /*
    Both at once. Today's finished sessions were fetched only after the
    program came back, but the query never used anything from it — the
    program was a presence check, not a dependency — so the page waited out
    two round trips to do the work of one.
  */
  const [activeProgram, completedToday] = await Promise.all([
    prisma.clientProgram.findFirst({
      where: { clientId: user.id, active: true },
      include: {
        template: {
          include: {
            workouts: {
              orderBy: { dayOrder: 'asc' },
              include: { _count: { select: { workoutExercises: true } } },
            },
          },
        },
      },
    }),
    prisma.workoutLog.findMany({
      where: { clientId: user.id, startedAt: { gte: since }, completedAt: { not: null } },
      select: { workoutId: true },
      take: 50,
    }),
  ]);
  const completedIds = new Set(completedToday.map((l) => l.workoutId));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Workouts</h1>
        {activeProgram && <p className="mt-1 text-sm text-muted-foreground">{activeProgram.template.name}</p>}
      </header>

      {!activeProgram || activeProgram.template.workouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Your coach hasn&apos;t assigned a program yet.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {activeProgram.template.workouts.map((workout) => (
            <li key={workout.id}>
              <Link href={`/workouts/${workout.id}`}>
                <Card interactive>
                  <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Day {workout.dayOrder}
                      </p>
                      <p className="mt-1 text-base font-medium">{workout.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {workout._count.workoutExercises} exercise
                        {workout._count.workoutExercises === 1 ? '' : 's'}
                        {completedIds.has(workout.id) ? ' · done today' : ''}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
