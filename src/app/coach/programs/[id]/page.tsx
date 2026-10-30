import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, CalendarPlus, Copy, Dumbbell, LayoutList, Pencil, Plus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { DeleteProgramButton } from '@/components/coach/delete-program-button';
import { requireCoach, isEntitled } from '@/lib/auth';
import { todayIn, zoneOf } from '@/lib/day';
import { dayKey } from '@/lib/month-grid';
import { STATUS_LABELS } from '@/lib/client-status';
import { cn } from '@/lib/utils';
import { estimateMinutes, thumbnailFor } from '@/lib/workout-builder';
import {
  implicitPhase,
  IMPLICIT_PHASE_ID,
  itemLabel,
  patternFromWeek,
  phaseRanges,
  programWeeks,
} from '@/lib/program-calendar';
import { ProgramWeek, ProgramDeploy } from '@/components/coach/program-week';
import { ProgramCalendar, type CalItem } from '@/components/coach/program-calendar';
import {
  newWorkout,
  duplicateWorkout,
  deleteWorkout,
  setProgramDay,
  setWeekSteps,
  deployToClient,
  addPhase,
  updatePhase,
  deletePhase,
  moveWorkoutToPhase,
} from './actions';
import {
  addCalendarItems,
  updateCalendarItem,
  deleteCalendarItem,
  moveCalendarItem,
  copyCalendarWeek,
  fillFromPattern,
} from './calendar-actions';

const inputClass =
  'flex h-10 w-full border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'readout text-[10px] uppercase tracking-wider text-muted-foreground';

/*
  The program, laid out the way Trainerize lays one out: a rail on the left
  with Summary, Calendar and the training phases ("Week 1 - 4", "Week 5 - 8",
  "+ Add next phase"), and whichever one is open on the right. On a phone the
  rail wraps into a row of tabs above the content.

  Which one is open lives in the URL (?view=summary | calendar | <phase id>),
  so the page stays a server component, the back button works, and a phase
  can be linked to directly.

  A template from before phases existed has no phase rows. It is shown as one
  implicit phase holding every workout, and the row is only written the first
  time the coach edits that phase or adds the next — see program-phases.ts.
*/

export default async function ProgramBuilderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; add?: string; workout?: string };
}) {
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

  // Everything the week editor, the calendar and the deploy form need.
  const [programDays, cardioTypes, clientRows, phaseRows, calendarRows] = await Promise.all([
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
    prisma.programPhase.findMany({
      where: { templateId: template.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, weeks: true, summary: true },
    }),
    prisma.programCalendarItem.findMany({
      where: { templateId: template.id },
      orderBy: [{ dayIndex: 'asc' }, { position: 'asc' }],
      include: {
        workout: { select: { name: true } },
        cardioType: { select: { name: true } },
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

  const phases = phaseRows.length > 0 ? phaseRows : [implicitPhase(calendarRows)];
  const ranges = phaseRanges(phases);
  const totalWeeks = programWeeks(phases, calendarRows);
  const onCalendar = calendarRows.length > 0;

  /*
    Which phase each workout is listed under. A null phase — every workout
    built before phases — and a phase id that no longer resolves both read as
    the first phase, so nothing can fall off the page.
  */
  const phaseIds = new Set(phases.map((p) => p.id));
  const phaseOf = (w: { phaseId: string | null }) =>
    w.phaseId && phaseIds.has(w.phaseId) ? w.phaseId : phases[0].id;

  const view = searchParams?.view ?? 'summary';
  // "implicit" keeps meaning the first phase after its row has been written,
  // so a link or form that still carries it lands in the right place.
  const activePhase = phases.find((p) => p.id === view) ?? (view === IMPLICIT_PHASE_ID ? phases[0] : null);
  const current = activePhase ? activePhase.id : view === 'calendar' ? 'calendar' : 'summary';
  const base = `/coach/programs/${template.id}`;

  const workoutOptions = template.workouts.map((w) => ({ id: w.id, name: w.name }));

  const calItems: CalItem[] = calendarRows.map((i) => ({
    id: i.id,
    dayIndex: i.dayIndex,
    kind: i.kind,
    title: itemLabel(i),
    workoutId: i.workoutId,
    cardioTypeId: i.cardioTypeId,
    cardioMinutes: i.cardioMinutes,
    cardioTarget: i.cardioTarget,
    stepTarget: i.stepTarget,
    label: i.label,
    note: i.note,
    position: i.position,
  }));

  const railLink = (key: string, href: string, label: string, sub?: string) => (
    <Link
      key={key}
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={cn(
        'flex min-w-0 flex-col border px-3 py-2 text-sm transition-colors lg:border-0 lg:border-l-2',
        current === key
          ? 'border-accent bg-accent/[0.08] text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground lg:border-transparent'
      )}
    >
      <span className="truncate">{label}</span>
      {sub && <span className="readout truncate text-[10px] uppercase text-muted-foreground">{sub}</span>}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/coach/programs"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Programs
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <p className="readout mt-1 text-[11px] uppercase text-muted-foreground">
          {totalWeeks} week{totalWeeks === 1 ? '' : 's'} · {phases.length} phase{phases.length === 1 ? '' : 's'} ·{' '}
          {template.workouts.length} workout{template.workouts.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Program" className="flex flex-col gap-3 lg:sticky lg:top-4">
          <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
            {railLink('summary', `${base}?view=summary`, 'Summary')}
            {railLink('calendar', `${base}?view=calendar`, 'Calendar', onCalendar ? `${calItems.length} items` : 'empty')}
          </div>
          <span className={cn(labelClass, 'lg:mt-3 lg:px-3')}>Training phases</span>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
            {phases.map((p, i) =>
              railLink(
                p.id,
                `${base}?view=${p.id}`,
                p.name,
                `Weeks ${ranges[i].startWeek}–${ranges[i].endWeek}`
              )
            )}
          </div>
          <form action={addPhase} className="lg:px-3">
            <input type="hidden" name="templateId" value={template.id} />
            <button
              type="submit"
              className="readout inline-flex items-center gap-1 text-[11px] uppercase text-accent hover:underline"
            >
              <Plus size={12} />
              Add next phase
            </button>
          </form>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {current === 'summary' && (
            <>
              <SystemWindow title="Summary">
                <SystemWindowContent className="flex flex-col gap-4">
                  {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Length', value: `${totalWeeks} wk` },
                      { label: 'Phases', value: String(phases.length) },
                      { label: 'Workouts', value: String(template.workouts.length) },
                      { label: 'Deploys from', value: onCalendar ? 'Calendar' : 'Weekly pattern' },
                    ].map((s) => (
                      <div key={s.label} className="flex flex-col gap-1">
                        <dt className={labelClass}>{s.label}</dt>
                        <dd className="text-sm">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
                    {phases.map((p, i) => {
                      const count = template.workouts.filter((w) => phaseOf(w) === p.id).length;
                      return (
                        <li key={p.id}>
                          <Link href={`${base}?view=${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{p.name}</span>
                              {p.summary && <span className="line-clamp-1 text-xs text-muted-foreground">{p.summary}</span>}
                            </span>
                            <span className="readout shrink-0 text-[10px] uppercase text-muted-foreground">
                              W{ranges[i].startWeek}–{ranges[i].endWeek} · {count} workout{count === 1 ? '' : 's'}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </SystemWindowContent>
              </SystemWindow>

              {/* Stays here until subscribers replace it: one client, one start date. */}
              <ProgramDeploy
                templateId={template.id}
                clients={clients}
                deployToClient={deployToClient}
                defaultStart={defaultStart}
                calendarWeeks={onCalendar ? totalWeeks : null}
              />

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
                workouts={workoutOptions}
                cardioTypes={cardioTypes}
                setProgramDay={setProgramDay}
                setWeekSteps={setWeekSteps}
                onCalendar={onCalendar}
              />
            </>
          )}

          {current === 'calendar' && (
            <ProgramCalendar
              templateId={template.id}
              items={calItems}
              phases={phases.map((p, i) => ({
                id: p.id,
                name: p.name,
                startDay: ranges[i].startDay,
                endDay: ranges[i].endDay,
              }))}
              totalWeeks={totalWeeks}
              workouts={workoutOptions}
              cardioTypes={cardioTypes}
              weekPattern={patternFromWeek(programDays)}
              initial={searchParams?.add ? { kind: searchParams.add, workoutId: searchParams.workout } : null}
              addItems={addCalendarItems}
              updateItem={updateCalendarItem}
              deleteItem={deleteCalendarItem}
              moveItem={moveCalendarItem}
              copyWeek={copyCalendarWeek}
              fillPattern={fillFromPattern}
            />
          )}

          {activePhase && (
            <PhaseView
              templateId={template.id}
              phase={activePhase}
              range={ranges[phases.indexOf(activePhase)]}
              canDelete={phases.length > 1 && activePhase.id !== IMPLICIT_PHASE_ID}
              otherPhases={phases.filter((p) => p.id !== activePhase.id).map((p) => ({ id: p.id, name: p.name }))}
              workouts={template.workouts.filter((w) => phaseOf(w) === activePhase.id)}
            />
          )}

          {!activePhase && current === 'summary' && view !== 'summary' && (
            <p className="text-sm text-muted-foreground">That phase is gone — showing the summary.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type PhaseWorkout = {
  id: string;
  name: string;
  estMinutes: number | null;
  instructions: string | null;
  workoutExercises: {
    id: string;
    supersetGroup: string | null;
    restAfterSeconds: number | null;
    sets: { type: string; targetReps: string | null; restSeconds: number | null; tempo: string | null }[];
    exercise: { videoUrl: string | null; video: { thumbnailUrl: string | null } | null };
  }[];
};

/*
  One training phase: its name, length and summary, and its own list of
  workouts laid out the way Trainerize's phase list is — a picture, the name,
  "est. 41 min | 7 exercises", the first line of the instructions, and Edit /
  Schedule / Duplicate / Delete. Everything about what is IN a workout is
  edited in the builder.
*/
function PhaseView({
  templateId,
  phase,
  range,
  canDelete,
  otherPhases,
  workouts,
}: {
  templateId: string;
  phase: { id: string; name: string; weeks: number; summary: string | null };
  range: { startWeek: number; endWeek: number; startDay: number; endDay: number };
  canDelete: boolean;
  otherPhases: { id: string; name: string }[];
  workouts: PhaseWorkout[];
}) {
  return (
    <>
      <SystemWindow title="Training phase" meta={`[W${range.startWeek}–${range.endWeek}]`}>
        <SystemWindowContent>
          <form action={updatePhase} className="flex flex-col gap-3">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="phaseId" value={phase.id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Name</span>
                <input name="name" defaultValue={phase.name} maxLength={80} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Weeks</span>
                <input name="weeks" type="number" min={1} max={52} defaultValue={phase.weeks} className={inputClass} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Summary</span>
              <textarea
                name="summary"
                rows={3}
                defaultValue={phase.summary ?? ''}
                placeholder="What this phase is for — shown to you here, and later to subscribers."
                className="w-full border border-input bg-secondary/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Days {range.startDay}–{range.endDay} of the calendar. Shortening a phase removes what is
              scheduled in the weeks it loses; later phases move with it either way.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" size="sm" variant="outline">
                Save phase
              </Button>
              {canDelete && <DeleteProgramButton action={deletePhase} id={phase.id} name={phase.name} />}
            </div>
          </form>
        </SystemWindowContent>
      </SystemWindow>

      <SystemWindow title="Workouts" meta={`[${workouts.length}]`}>
        <SystemWindowContent className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href={`/coach/programs/${templateId}?view=calendar`}
              className="inline-flex h-9 items-center gap-2 border border-border px-4 text-xs font-bold uppercase tracking-[0.14em] hover:border-accent/50 hover:text-accent"
            >
              <CalendarDays size={14} />
              Calendar
            </Link>
            <form action={newWorkout}>
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="phaseId" value={phase.id} />
              <Button type="submit" size="sm">
                <Plus size={14} />
                New workout
              </Button>
            </form>
          </div>

          {workouts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 border border-dashed border-border py-10 text-center">
              <Dumbbell size={22} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No workouts in this phase yet. Press New workout to build the first one.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
              {workouts.map((workout) => {
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
                const href = `/coach/programs/${templateId}/workouts/${workout.id}`;
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
                        {/* Trainerize's Schedule: straight into Add Activity with this workout picked. */}
                        <Link
                          href={`/coach/programs/${templateId}?view=calendar&add=workout&workout=${workout.id}`}
                          className="readout inline-flex items-center gap-1 text-[11px] uppercase text-muted-foreground hover:text-foreground"
                        >
                          <CalendarPlus size={12} />
                          Schedule
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
                      {otherPhases.length > 0 && (
                        <form action={moveWorkoutToPhase} className="mt-1 flex items-center gap-2">
                          <input type="hidden" name="workoutId" value={workout.id} />
                          <LayoutList size={12} className="shrink-0 text-muted-foreground" />
                          <select
                            name="phaseId"
                            defaultValue=""
                            aria-label={`Move ${workout.name} to another phase`}
                            className="h-8 min-w-0 max-w-[180px] border border-input bg-secondary/40 px-2 text-xs"
                          >
                            <option value="" disabled>
                              Move to phase…
                            </option>
                            {otherPhases.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="readout text-[10px] uppercase text-accent hover:underline">
                            Move
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </>
  );
}
