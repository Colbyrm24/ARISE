import Link from 'next/link';
import { ChevronRight, Dumbbell } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function WorkoutsPage() {
  const user = await requireClient();
  const today = todayDateOnly();

  const activeProgram = await prisma.clientProgram.findFirst({
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
  });

  const completedToday = activeProgram
    ? await prisma.workoutLog.findMany({
        where: { clientId: user.id, startedAt: { gte: today }, completedAt: { not: null } },
        select: { workoutId: true },
      })
    : [];
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
