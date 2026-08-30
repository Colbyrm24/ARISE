import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Play } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { startOfDayInstantFor } from '@/lib/day';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SystemWindow,
  SystemWindowContent,
  Count,
  Cell,
} from '@/components/ui/system-window';
import { demoLinkFor } from '@/lib/exercise-video';
import { describeSet, summarise, setTypeLabel, type SetType } from '@/lib/set-prescription';
import { LogSetButton } from '@/components/client/log-set-button';
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

  /*
    Personal bests, finally said out loud.

    `detectPr` has run on every logged set since the beginning and writes
    `isPr` to the row. Every single read of that flag was on the coach's side
    — the dashboard, the activity feed, the segments. So a client would put
    more weight on the bar than they ever had before, log it, and the app
    said nothing at all. The one moment in the whole product that is purely
    theirs was being collected and shown to somebody else.
  */
  const prCount = todayLog?.sets.filter((s) => s.isPr).length ?? 0;

  // Session-level progress, so the client can see how much is left without
  // counting rows themselves.
  const totalSets = workout.workoutExercises.reduce((n, we) => n + we.sets.length, 0);
  const doneSets = workout.workoutExercises.reduce(
    (n, we) => n + we.sets.filter((s) => loggedBySetId.has(s.id)).length,
    0
  );

  /*
    Bigger than it was, and it says what it wants.

    These were 56px boxes with placeholder-only hints, thumbed at one-handed
    between efforts. 64 wide and 44 tall is the smallest a tap target should
    be on a phone, and `inputMode` gets the number pad rather than the
    alphabet. The row stacks below sm so the extra width comes out of empty
    space rather than out of the prescription text.
  */
  const field =
    'readout h-11 w-16 shrink-0 rounded-none border border-input bg-secondary/40 px-2 text-center text-sm ' +
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isComplete ? (
            <Badge variant="success">Complete</Badge>
          ) : (
            <Count value={doneSets} total={totalSets} className="text-base" />
          )}
          {prCount > 0 && (
            <span className="readout border border-success/60 bg-success/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-success">
              {prCount === 1 ? 'New PR' : `${prCount} new PRs`}
            </span>
          )}
        </div>
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
          const demo = demoLinkFor(we.exercise);
          /*
            How many sets of how many reps — the question anyone actually asks
            about a movement, which until now could only be answered by
            reading and comparing every row.
          */
          const plan = summarise(
            we.sets.map((s) => ({
              type: s.type as SetType,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight === null ? null : Number(s.targetWeight),
              restSeconds: s.restSeconds,
            }))
          );
          return (
            <SystemWindow
              key={we.id}
              plain
              title={we.exercise.name}
              meta={<Count value={done} total={we.sets.length} />}
            >
              <SystemWindowContent className="pt-4">
                {/*
                  The prescription, said once, in words.

                  This line did not exist. The set count was a small `3`
                  beside the name and the rep target was repeated on every
                  row in 11px mono, so the shape of the movement — three sets
                  of six to eight — was something you assembled yourself.
                */}
                {plan.headline && (
                  <p className="mb-3 border-l-2 border-accent/60 py-1 pl-3 text-base font-semibold leading-snug text-foreground">
                    {plan.headline}
                  </p>
                )}
                {/* Sits above the sets on purpose — if you don't know the
                    movement, you need it before the first rep, not after. */}
                {demo && (
                  <a
                    href={demo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="readout mb-2 inline-flex items-center gap-1.5 border border-accent/40 bg-accent/[0.07] px-2 py-1 text-[10px] uppercase text-accent transition-colors hover:bg-accent/15"
                  >
                    <Play size={11} />
                    {demo.exact ? 'Watch demo' : 'Find a demo'}
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
                      /*
                        Two lines on a phone, one from sm up.

                        The inputs and the tick are 200px of fixed width. On a
                        375px screen that left about 80px for the prescription,
                        so "12 × 95 · 90s rest" truncated to "12 × 95 ·…" — the
                        rest interval, which is the one number you read between
                        efforts, was the first thing cut. Giving the
                        prescription its own line costs nothing vertically that
                        a 44px tap target had not already spent.
                      */
                      <li
                        key={set.id}
                        className="flex flex-col gap-2 border-b border-border/50 py-2.5 last:border-b-0 sm:flex-row sm:items-center"
                      >
                        {/*
                          Outstanding sets read red, logged ones green.

                          A set is either done or it is not, and that is the
                          only thing you need off this screen between efforts.
                          Everything was the same muted grey before, so telling
                          finished from remaining meant reading every row.

                          Colour is not carrying it alone: the number goes
                          semibold and a tick appears when a set is logged, so
                          it still reads for anyone who cannot separate the two
                          hues.
                        */}
                        <div className="flex min-w-0 items-start gap-2.5 sm:flex-1">
                          {/*
                            Status lives on the marker; the instruction stays
                            readable.

                            Done-or-not was previously carried by colouring
                            the prescription text itself, so a session opened
                            as a column of red numbers — which reads as a list
                            of errors, and put the one thing you have to read
                            mid-effort in the least legible colour on the
                            screen. The marker keeps the red/green, and the
                            words it labels go back to plain high contrast.
                          */}
                          <span
                            className={cn(
                              'readout mt-0.5 flex h-5 w-7 shrink-0 items-center justify-center gap-0.5 border text-[10px] uppercase',
                              logged
                                ? 'border-success/50 bg-success/10 text-success'
                                : 'border-destructive/40 text-destructive'
                            )}
                          >
                            {logged ? (
                              <Check size={11} />
                            ) : (
                              String(i + 1).padStart(2, '0')
                            )}
                          </span>

                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            {/*
                              A drop set looked exactly like a working set.

                              `WorkoutSet.type` — warmup, working, drop — was
                              stored and rendered nowhere, and every movement
                              in Colby's own programming ends on a drop set.
                              The one distinction that changes what you do was
                              the one thing the screen did not say.
                            */}
                            <span className="flex flex-wrap items-center gap-1.5">
                              {setTypeLabel(set.type as SetType) && (
                                <span className="readout w-fit border border-accent/40 bg-accent/[0.07] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
                                  {setTypeLabel(set.type as SetType)}
                                </span>
                              )}
                              {/* The moment worth having. Sits on the row it
                                  happened on, not summarised somewhere else. */}
                              {logged?.isPr && (
                                <span className="readout w-fit border border-success/60 bg-success/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-success">
                                  PR
                                </span>
                              )}
                            </span>
                            {/*
                              Every number says what it counts. `12 × 95` has
                              been on the screen a client trains from for
                              months and could as easily have meant twelve
                              sets. Prescribed rest was visible only on the
                              coach's builder, so the person actually resting
                              never saw the number they were resting for.
                            */}
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              {describeSet({
                                type: set.type as SetType,
                                targetReps: set.targetReps,
                                targetWeight:
                                  set.targetWeight === null ? null : Number(set.targetWeight),
                                restSeconds: set.restSeconds,
                              }).map((part, n) => (
                                <span
                                  key={part}
                                  className={cn(
                                    n === 0
                                      ? 'text-[15px] font-semibold leading-tight text-foreground'
                                      : 'readout text-[11px] uppercase text-muted-foreground'
                                  )}
                                >
                                  {part}
                                </span>
                              ))}
                            </span>
                          </div>
                        </div>
                        {/*
                          The tick IS the button.

                          It used to be a decorative `Cell` sitting next to a
                          small "LOG" caption that was the real submit. The
                          square has a border, a fill and a glow when it is on
                          — it looks exactly like a checkbox, so that is what
                          gets tapped, and tapping it did nothing at all. The
                          one control on this screen that has to work between
                          efforts was the one piece of furniture on the row.

                          Now there is a single target: a 44px square that
                          submits, shows a tick when the set is logged, and
                          says so to a screen reader.
                        */}
                        <form
                          action={logSet}
                          className="flex shrink-0 items-end gap-1.5 self-end pl-9 sm:self-auto sm:pl-0"
                        >
                          <input type="hidden" name="workoutId" value={workout.id} />
                          <input type="hidden" name="workoutSetId" value={set.id} />
                          {/*
                            The unit sits above its own box rather than inside
                            it as a placeholder. A placeholder disappears the
                            moment you type, which is exactly when you are
                            least sure which box you are in.
                          */}
                          <label className="flex flex-col items-center gap-0.5">
                            <span className="readout text-[9px] uppercase text-muted-foreground">
                              lb
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              inputMode="decimal"
                              name="actualWeight"
                              aria-label={`Weight in pounds for set ${i + 1}`}
                              disabled={isComplete}
                              defaultValue={
                                logged?.actualWeight ? Number(logged.actualWeight) : undefined
                              }
                              className={field}
                            />
                          </label>
                          <label className="flex flex-col items-center gap-0.5">
                            <span className="readout text-[9px] uppercase text-muted-foreground">
                              reps
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              name="actualReps"
                              aria-label={`Reps for set ${i + 1}`}
                              disabled={isComplete}
                              defaultValue={logged?.actualReps ?? undefined}
                              className={field}
                            />
                          </label>
                          {isComplete ? (
                            <span className="flex h-11 w-11 items-center justify-center">
                              <Cell on={Boolean(logged)} />
                            </span>
                          ) : (
                            <LogSetButton logged={Boolean(logged)} setNumber={i + 1} />
                          )}
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
