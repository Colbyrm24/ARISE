import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Copy, Dumbbell, Pencil, Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { DeleteProgramButton } from '@/components/coach/delete-program-button';
import { requireCoach, isEntitled } from '@/lib/auth';
import { todayIn, zoneOf } from '@/lib/day';
import { dayKey } from '@/lib/month-grid';
import { STATUS_LABELS } from '@/lib/client-status';
import { estimateMinutes, thumbnailFor } from '@/lib/workout-builder';
import { ProgramWeek } from '@/components/coach/program-week';
import {
  newWorkout,
  duplicateWorkout,
  deleteWorkout,
  setProgramDay,
  setWeekSteps,
  deployToClient,
} from './actions';

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
            include: {
              exercise: { select: { videoUrl: true, video: { select: { thumbnailUrl: true } } } },
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
      },
    },
  });

  if (!template) notFound();

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
      where: { coachId: coach.id, tier: 'coaching', status: { notIn: ['cancelled', 'completed'] } },
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

      {/*
        The program's workouts, laid out the way Trainerize's phase list is:
        a picture, the name, "est. 41 min | 7 exercises", the first line of
        the coach's instructions, and Edit / Duplicate / Delete. Everything
        about what is IN a workout is edited in the builder — the list only
        says what each one is.
      */}
      <SystemWindow
        title="Workouts"
        meta={`[${template.workouts.length}]`}
      >
        <SystemWindowContent className="flex flex-col gap-4">
          <form action={newWorkout} className="flex justify-end">
            <input type="hidden" name="templateId" value={template.id} />
            <Button type="submit" size="sm">
              <Plus size={14} />
              New workout
            </Button>
          </form>

          {template.workouts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-border py-10 text-center">
              <Dumbbell size={22} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No workouts yet. Press New workout to build the first one.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
              {template.workouts.map((workout) => {
                const first = workout.workoutExercises[0];
                const thumb = first ? thumbnailFor(first.exercise) : null;
                /*
                  The stored minutes when there are some; otherwise worked out
                  here, so a workout built before the builder existed still
                  reads with a length instead of a gap.
                */
                const minutes =
                  workout.estMinutes ??
                  (estimateMinutes(
                    workout.workoutExercises.map((we) => ({
                      id: we.id,
                      supersetGroup: we.supersetGroup,
                      restAfterSeconds: we.restAfterSeconds,
                      sets: we.sets,
                    }))
                  ) ||
                    null);
                const count = workout.workoutExercises.length;
                const firstLine = workout.instructions?.split('\n').find((l) => l.trim())?.trim();
                const href = `/coach/programs/${template.id}/workouts/${workout.id}`;
                return (
                  <li key={workout.id} className="flex items-start gap-3 py-3">
                    <Link
                      href={href}
                      className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary/40"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Dumbbell size={18} className="text-muted-foreground" />
                      )}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link href={href} className="truncate text-sm font-semibold hover:text-accent">
                        {workout.name}
                      </Link>
                      <p className="readout text-[11px] uppercase text-muted-foreground">
                        {minutes ? `est. ${minutes} min` : 'est. — min'} | {count} exercise{count === 1 ? '' : 's'}
                      </p>
                      {firstLine && <p className="line-clamp-1 text-xs text-muted-foreground">{firstLine}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-4">
                        <Link
                          href={href}
                          className="readout inline-flex items-center gap-1 text-[11px] uppercase text-accent hover:underline"
                        >
                          <Pencil size={12} />
                          Edit
                        </Link>
                        <form action={duplicateWorkout}>
                          <input type="hidden" name="workoutId" value={workout.id} />
                          <button
                            type="submit"
                            className="readout inline-flex items-center gap-1 text-[11px] uppercase text-muted-foreground hover:text-foreground"
                          >
                            <Copy size={12} />
                            Duplicate
                          </button>
                        </form>
                        {/* Two taps, the second naming the workout — a
                            delete takes every movement and set with it. */}
                        <DeleteProgramButton action={deleteWorkout} id={workout.id} name={workout.name} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}
