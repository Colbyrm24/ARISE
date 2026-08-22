import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Play } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SystemWindow,
  SystemWindowContent,
  Count,
  Cell,
} from '@/components/ui/system-window';
import { watchUrlFor } from '@/lib/exercise-video';
import { logSet, completeWorkout } from './actions';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function WorkoutSessionPage({ params }: { params: { workoutId: string } }) {
  const user = await requireEntitledClient();

  const workout = await prisma.workout.findUnique({
    where: { id: params.workoutId },
    include: {
      workoutExercises: {
        orderBy: { order: 'asc' },
        include: {
          exercise: { include: { video: true } },
          sets: { orderBy: { setNumber: 'asc' } },
        },
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

  // Session-level progress, so the client can see how much is left without
  // counting rows themselves.
  const totalSets = workout.workoutExercises.reduce((n, we) => n + we.sets.length, 0);
  const doneSets = workout.workoutExercises.reduce(
    (n, we) => n + we.sets.filter((s) => loggedBySetId.has(s.id)).length,
    0
  );

  /*
    Narrow on purpose. This row has to fit a set number, the target, two
    inputs, the log button and the completion cell inside a phone's width —
    at w-20 the cell was pushed outside the panel border.
  */
  const field =
    'readout h-9 w-14 shrink-0 rounded-none border border-input bg-secondary/40 px-2 text-sm ' +
    'transition-colors focus-visible:border-accent/60 focus-visible:outline-none ' +
    'focus-visible:ring-1 focus-visible:ring-accent/50 disabled:opacity-50';

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/workouts"
        className="readout inline-flex w-fit items-center gap-1.5 text-[11px] uppercase text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} />
        Workouts
      </Link>

      <header className="flex items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="readout text-[11px] uppercase text-muted-foreground">
            Session {String(workout.dayOrder).padStart(2, '0')}
          </p>
          <h1 className="display mt-1.5 text-2xl">{workout.name}</h1>
        </div>
        {isComplete ? (
          <Badge variant="success">Complete</Badge>
        ) : (
          <Count value={doneSets} total={totalSets} className="text-base" />
        )}
      </header>

      {/*
        One window per exercise. Stacking the lit edges is deliberate — a
        session reads as a column of panels, each one closing out as its sets
        fill in.
      */}
      <div className="flex flex-col gap-4">
        {workout.workoutExercises.map((we) => {
          const done = we.sets.filter((s) => loggedBySetId.has(s.id)).length;
          const demo = we.exercise.video
            ? watchUrlFor(we.exercise.video.storageProvider, we.exercise.video.externalId)
            : null;
          return (
            <SystemWindow
              key={we.id}
              plain
              title={we.exercise.name}
              meta={<Count value={done} total={we.sets.length} />}
            >
              <SystemWindowContent className="pt-4">
                {/* Sits above the sets on purpose — if you don't know the
                    movement, you need it before the first rep, not after. */}
                {demo && (
                  <a
                    href={demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="readout mb-2 inline-flex items-center gap-1.5 border border-accent/40 bg-accent/[0.07] px-2 py-1 text-[10px] uppercase text-accent transition-colors hover:bg-accent/15"
                  >
                    <Play size={11} />
                    Watch demo
                  </a>
                )}
                <ul className="flex flex-col">
                  {we.sets.map((set, i) => {
                    const logged = loggedBySetId.get(set.id);
                    return (
                      <li
                        key={set.id}
                        className="flex items-center gap-2 border-b border-border/50 py-2.5 last:border-b-0"
                      >
                        <span className="readout w-7 shrink-0 text-[11px] uppercase text-muted-foreground">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="readout min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                          {set.targetReps ?? '—'}
                          {set.targetWeight ? ` × ${Number(set.targetWeight)}` : ''}
                        </span>
                        <form action={logSet} className="flex shrink-0 items-center gap-1.5">
                          <input type="hidden" name="workoutId" value={workout.id} />
                          <input type="hidden" name="workoutSetId" value={set.id} />
                          <input
                            type="number"
                            step="0.5"
                            name="actualWeight"
                            placeholder="lb"
                            disabled={isComplete}
                            defaultValue={
                              logged?.actualWeight ? Number(logged.actualWeight) : undefined
                            }
                            className={field}
                          />
                          <input
                            type="number"
                            name="actualReps"
                            placeholder="reps"
                            disabled={isComplete}
                            defaultValue={logged?.actualReps ?? undefined}
                            className={field}
                          />
                          {!isComplete && (
                            <button
                              type="submit"
                              className="readout shrink-0 px-0.5 text-[11px] uppercase text-accent transition-opacity hover:opacity-70"
                            >
                              Log
                            </button>
                          )}
                          <Cell on={Boolean(logged)} />
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </SystemWindowContent>
            </SystemWindow>
          );
        })}
      </div>

      {!isComplete && (
        <form action={completeWorkout}>
          <input type="hidden" name="workoutLogId" value={todayLog?.id ?? ''} />
          <input type="hidden" name="workoutId" value={workout.id} />
          <Button type="submit" className="w-full">
            Finish workout
          </Button>
        </form>
      )}
    </div>
  );
}
