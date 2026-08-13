import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logSet, completeWorkout } from './actions';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function WorkoutSessionPage({ params }: { params: { workoutId: string } }) {
  const user = await requireClient();

  const workout = await prisma.workout.findUnique({
    where: { id: params.workoutId },
    include: {
      workoutExercises: {
        orderBy: { order: 'asc' },
        include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
      },
    },
  });
  if (!workout) notFound();

  // A client may only train a workout that belongs to the program
  // currently assigned to them — never trust the URL alone.
  const activeProgram = await prisma.clientProgram.findFirst({
    where: { clientId: user.id, active: true },
  });
  if (!activeProgram || activeProgram.templateId !== workout.templateId) notFound();

  const today = todayDateOnly();
  const todayLog = await prisma.workoutLog.findFirst({
    where: { clientId: user.id, workoutId: workout.id, startedAt: { gte: today } },
    orderBy: { startedAt: 'desc' },
    include: { sets: true },
  });

  const loggedBySetId = new Map(todayLog?.sets.map((s) => [s.workoutSetId, s]) ?? []);
  const isComplete = Boolean(todayLog?.completedAt);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/workouts"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Workouts
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Day {workout.dayOrder}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{workout.name}</h1>
        </div>
        {isComplete && <Badge variant="success">Completed</Badge>}
      </header>

      <div className="flex flex-col gap-4">
        {workout.workoutExercises.map((we) => (
          <Card key={we.id}>
            <CardContent className="flex flex-col gap-3 pt-6">
              <p className="text-sm font-medium">{we.exercise.name}</p>
              <ul className="flex flex-col gap-2">
                {we.sets.map((set, i) => {
                  const logged = loggedBySetId.get(set.id);
                  return (
                    <li key={set.id} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-muted-foreground">Set {i + 1}</span>
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        Target: {set.targetReps ?? '—'}
                        {set.targetWeight ? ` @ ${Number(set.targetWeight)}lb` : ''}
                      </span>
                      <form action={logSet} className="flex flex-1 items-center gap-2">
                        <input type="hidden" name="workoutId" value={workout.id} />
                        <input type="hidden" name="workoutSetId" value={set.id} />
                        <input
                          type="number"
                          step="0.5"
                          name="actualWeight"
                          placeholder="lb"
                          disabled={isComplete}
                          defaultValue={logged?.actualWeight ? Number(logged.actualWeight) : undefined}
                          className="h-9 w-20 rounded-lg border border-input bg-secondary/40 px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        />
                        <input
                          type="number"
                          name="actualReps"
                          placeholder="reps"
                          disabled={isComplete}
                          defaultValue={logged?.actualReps ?? undefined}
                          className="h-9 w-20 rounded-lg border border-input bg-secondary/40 px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        />
                        {!isComplete && (
                          <button
                            type="submit"
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Log
                          </button>
                        )}
                        {logged && (
                          <CheckCircle2 size={15} className="text-success" />
                        )}
                      </form>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isComplete && todayLog && (
        <form action={completeWorkout}>
          <input type="hidden" name="workoutLogId" value={todayLog.id} />
          <input type="hidden" name="workoutId" value={workout.id} />
          <Button type="submit" className="w-full">
            Finish Workout
          </Button>
        </form>
      )}
    </div>
  );
}
