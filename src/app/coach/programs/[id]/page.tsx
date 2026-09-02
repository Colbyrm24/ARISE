import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2, GripVertical } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireCoach, isEntitled } from '@/lib/auth';
import { todayIn, zoneOf } from '@/lib/day';
import { dayKey } from '@/lib/month-grid';
import { STATUS_LABELS } from '@/lib/client-status';
import { ProgramWeek } from '@/components/coach/program-week';
import {
  addWorkout,
  deleteWorkout,
  addWorkoutExercise,
  deleteWorkoutExercise,
  setProgramDay,
  setWeekSteps,
  deployToClient,
} from './actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default async function ProgramBuilderPage({ params }: { params: { id: string } }) {
  const coach = await requireCoach();

  /*
    Owned, not merely existing.

    This was a bare findUnique on the id in the URL. Every write on this
    screen goes through coachOwnsTemplate — six actions were fixed to do that
    — but the READ was never guarded, so pasting another coach's template id
    into the address bar rendered their whole program: every session, every
    movement, sets, rest, their coaching notes on each one, the repeating week
    and the step targets. The buttons would all have refused, and by then the
    thing worth protecting was already on screen.

    notFound() rather than a redirect, and the same answer for "does not
    exist" as for "not yours", so the URL cannot be used to find out which
    template ids are real.
  */
  const template = await prisma.workoutTemplate.findFirst({
    where: coach.role === 'admin' ? { id: params.id } : { id: params.id, coachId: coach.id },
    include: {
      workouts: {
        orderBy: { dayOrder: 'asc' },
        include: {
          workoutExercises: {
            orderBy: { order: 'asc' },
            include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
          },
        },
      },
    },
  });

  if (!template) notFound();

  const exercises = await prisma.exercise.findMany({
    orderBy: [{ musclePrimary: 'asc' }, { name: 'asc' }],
  });

  // Everything the week editor and the deploy form need to fill their menus.
  const [programDays, cardioTypes, clientRows] = await Promise.all([
    prisma.programDay.findMany({ where: { templateId: template.id }, orderBy: { weekday: 'asc' } }),
    prisma.cardioType.findMany({
      where: { coachId: coach.id, active: true },
      orderBy: { position: 'asc' },
      select: { id: true, name: true },
    }),
    /*
      Who this program can be deployed to.

      Every client on the roster was in this menu, cancelled and completed
      ones included — sorted alphabetically, so a former client sat between
      two current ones with nothing to tell them apart. Picking one writes
      half a year of sessions into somebody's calendar and fires the
      notification, and the client screen still renders for a cancelled
      account, so the first sign would be them asking why they had been given
      a new program.

      Status comes back with the row so the ones who have not started yet are
      labelled rather than hidden — building a program for somebody in
      onboarding, before their first day, is the normal way round.
    */
    prisma.client.findMany({
      where: { coachId: coach.id, status: { notIn: ['cancelled', 'completed'] } },
      select: {
        userId: true,
        status: true,
        user: { select: { email: true, profile: { select: { fullName: true } } } },
      },
    }),
  ]);

  const clients = clientRows
    .map((c) => {
      const name = c.user.profile?.fullName || c.user.email;
      return {
        id: c.userId,
        // Started clients read as their plain name; the rest carry the reason
        // they might not be the right person to deploy to yet.
        name: isEntitled(c.status) ? name : `${name} — ${STATUS_LABELS[c.status] ?? c.status}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  /*
    The date input wants YYYY-MM-DD. Defaulting to today rather than to the
    next Monday, because a coach signing someone up on a Wednesday means
    "start Wednesday", not "wait five days".

    His today, not the server's. This was `new Date().toISOString()`, and
    toISOString is UTC — so from 8pm Eastern onward the box pre-filled with
    TOMORROW. Deploy parses that string literally as midnight UTC, so the
    whole block landed a day late: the client's first day was blank, every
    session sat on the wrong weekday, and the confirmation ("182 days written
    through …") read perfectly correct. The evening is exactly when a coach
    sits down to do this.
  */
  const defaultStart = dayKey(todayIn(zoneOf(coach.profile)));

  // A few hundred exercises in one flat dropdown is unusable, so they're
  // grouped by muscle — the browser renders these as labelled sections.
  const grouped = new Map<string, typeof exercises>();
  for (const ex of exercises) {
    if (!grouped.has(ex.musclePrimary)) grouped.set(ex.musclePrimary, []);
    grouped.get(ex.musclePrimary)!.push(ex);
  }
  const exercisesByMuscle = [...grouped.entries()];

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/coach/programs"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Programs
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
      </header>

      <ProgramWeek
        templateId={template.id}
        days={programDays.map((d) => ({
          weekday: d.weekday,
          kind: d.kind,
          workoutId: d.workoutId,
          label: d.label,
          cardioTypeId: d.cardioTypeId,
          cardioMinutes: d.cardioMinutes,
          stepTarget: d.stepTarget,
        }))}
        workouts={template.workouts.map((w) => ({ id: w.id, name: w.name }))}
        cardioTypes={cardioTypes}
        clients={clients}
        setProgramDay={setProgramDay}
        setWeekSteps={setWeekSteps}
        deployToClient={deployToClient}
        defaultStart={defaultStart}
      />

      <Card>
        <CardHeader>
          <CardTitle>Add Day</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addWorkout} className="flex gap-3">
            <input type="hidden" name="templateId" value={template.id} />
            <Input name="name" placeholder="Day name (e.g. Push Day, Leg Day)" required className="flex-1" />
            <Button type="submit" size="sm" className="w-fit shrink-0">
              Add Day
            </Button>
          </form>
        </CardContent>
      </Card>

      {template.workouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <GripVertical size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Add a day above to start building this program.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {template.workouts.map((workout) => (
            <Card key={workout.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-foreground">
                    Day {workout.dayOrder} · {workout.name}
                  </CardTitle>
                  <form action={deleteWorkout}>
                    <input type="hidden" name="workoutId" value={workout.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <button
                      type="submit"
                      title="Delete day"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {workout.workoutExercises.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No exercises yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {workout.workoutExercises.map((we) => (
                      <li
                        key={we.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{we.exercise.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {we.sets.length} set{we.sets.length === 1 ? '' : 's'}
                            {we.sets[0]?.targetReps ? ` × ${we.sets[0].targetReps} reps` : ''}
                            {we.sets[0]?.targetWeight ? ` @ ${Number(we.sets[0].targetWeight)} lb` : ''}
                            {we.sets[0]?.restSeconds ? ` · ${we.sets[0].restSeconds}s rest` : ''}
                          </p>
                        </div>
                        <form action={deleteWorkoutExercise}>
                          <input type="hidden" name="workoutExerciseId" value={we.id} />
                          <input type="hidden" name="templateId" value={template.id} />
                          <button
                            type="submit"
                            title="Remove exercise"
                            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {exercises.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add exercises to your{' '}
                    <Link href="/coach/exercises" className="text-accent hover:underline">
                      exercise library
                    </Link>{' '}
                    first.
                  </p>
                ) : (
                  <form action={addWorkoutExercise} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <input type="hidden" name="workoutId" value={workout.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <select name="exerciseId" className={`${selectClass} col-span-2 sm:col-span-1`} required defaultValue="">
                      <option value="" disabled>
                        Exercise…
                      </option>
                      {exercisesByMuscle.map(([muscleGroup, list]) => (
                        <optgroup key={muscleGroup} label={muscleGroup}>
                          {list.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.name} · {ex.equipment}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <Input name="numSets" type="number" min="1" placeholder="Sets" defaultValue={3} />
                    <Input name="targetReps" placeholder="Reps (e.g. 8-10)" />
                    <Input name="targetWeight" type="number" step="0.5" placeholder="Weight (lb)" />
                    <Input name="restSeconds" type="number" placeholder="Rest (sec)" />
                    <Button type="submit" size="sm" variant="secondary" className="col-span-2 w-fit sm:col-span-5">
                      Add Exercise
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
