import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Play } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { startOfDayInstantFor } from '@/lib/day';
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

    /*
    A DateTime bound needs the INSTANT local midnight happened, not the
    `@db.Date` label for the day. `todayFor` returns the latter — UTC midnight
    of the local calendar date — which in New York is 8pm the previous
    evening, so `startedAt >= it` swept up last night's unfinished session as
    today's and appended this morning's sets to it.
  */
  const since = startOfDayInstantFor(user);
  const todayLog = await prisma.workoutLog.findFirst({
    where: { clientId: user.id, workoutId: workout.id, startedAt: { gte: since } },
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
          {workout.estMinutes && (
            <p className="readout mt-1.5 text-[11px] uppercase text-muted-foreground">
              est. {workout.estMinutes} minutes
            </p>
          )}
        </div>
        {isComplete ? (
          <Badge variant="success">Complete</Badge>
        ) : (
          <Count value={doneSets} total={totalSets} className="text-base" />
        )}
      </header>

      {/*
        The header a client reads before they start: what they need around
        them, and what the coach wants out of the session. Without this the
        screen is a bare list of movements and every session looks the same.
      */}
      {(workout.equipment.length > 0 || workout.instructions) && (
        <SystemWindow title="Before you start" plain>
          <SystemWindowContent className="flex flex-col gap-4 pt-4">
            {workout.equipment.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  Equipment
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {workout.equipment.map((e) => (
                    <Badge key={e} variant="outline">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {workout.instructions && (
              <div className="flex flex-col gap-2">
                <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  From your coach
                </p>
                <p className="text-sm leading-relaxed text-foreground/90">{workout.instructions}</p>
              </div>
            )}
          </SystemWindowContent>
        </SystemWindow>
      )}

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
                {/*
                  The coach's own cues and note for this movement.

                  Both were written and read by nothing. `Exercise.cues` comes
                  off a real field on the coach's exercise form labelled
                  "Coaching cues", and `WorkoutExercise.notes` is set by the
                  program seed — and neither had ever appeared on any screen,
                  so every cue the coach typed went straight into the database
                  and stopped there. This is the one place they are useful:
                  next to the sets, before the first rep.
                */}
                {(we.notes || we.exercise.cues) && (
                  <div className="mb-3 flex flex-col gap-1.5 border-l-2 border-accent/40 bg-secondary/20 py-2 pl-3 pr-2 text-xs leading-relaxed text-muted-foreground">
                    {/* Two different things: the note is what the coach said
                        about this movement in this program, the cues are how
                        to perform it at all. Sharing one slot meant a seeded
                        note silently hid the cues. */}
                    {we.notes && <p>{we.notes}</p>}
                    {we.exercise.cues && <p>{we.exercise.cues}</p>}
                  </div>
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
                          {/* Prescribed rest was visible only on the coach's
                              builder, so the person actually resting never
                              saw the number they were meant to rest for. */}
                          {set.restSeconds ? ` · ${set.restSeconds}s rest` : ''}
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
