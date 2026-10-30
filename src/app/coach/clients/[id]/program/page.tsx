import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Dumbbell, Link2, Link2Off } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { todayIn, zoneOf } from '@/lib/day';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { estimateMinutes } from '@/lib/workout-builder';
import { implicitPhase, phaseRanges, programWeeks } from '@/lib/program-calendar';
import { phaseDates, subscriptionProgress } from '@/lib/program-sync';

/*
  The client's Training program, as Trainerize's Training Program tab shows
  it: the program they are on, its phases with the real dates they cover for
  THIS client and a "current" tag on the one they are in, and the workouts in
  each phase.

  Read-only on purpose. A linked client's program is the master — changing
  it here would either fork them silently or change everyone — so the page
  says it is linked and sends the coach to the master to edit it, or to the
  calendar to change one day for this client alone (a moved day is pinned,
  and the master leaves it there).

  Ownership is checked by the layout that wraps every client tab.
*/

const labelClass = 'readout text-[10px] uppercase tracking-wider text-muted-foreground';

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtYear = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function ClientProgramPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    select: {
      userId: true,
      user: { select: { profile: { select: { timezone: true } } } },
      clientPrograms: {
        orderBy: { assignedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          active: true,
          linked: true,
          startDate: true,
          templateId: true,
          template: { select: { id: true, name: true, description: true } },
        },
      },
    },
  });
  if (!client) notFound();

  const today = todayIn(zoneOf(client.user?.profile));
  const active = client.clientPrograms.find((p) => p.active) ?? null;
  const past = client.clientPrograms.filter((p) => !p.active);

  if (!active) {
    return (
      <div className="flex flex-col gap-4">
        <SystemWindow title="Training program">
          <SystemWindowContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Not on a program right now.</p>
            <Link href={`/coach/clients/${client.userId}`} className="text-sm text-accent hover:underline">
              Start one from Overview
            </Link>
          </SystemWindowContent>
        </SystemWindow>
        <PastPrograms past={past} />
      </div>
    );
  }

  const templateId = active.templateId;
  const [phaseRows, items, workouts, rows] = await Promise.all([
    prisma.programPhase.findMany({
      where: { templateId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, weeks: true, summary: true },
    }),
    prisma.programCalendarItem.findMany({ where: { templateId }, select: { dayIndex: true } }),
    prisma.workout.findMany({
      where: { templateId },
      orderBy: { dayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        phaseId: true,
        estMinutes: true,
        workoutExercises: {
          select: {
            id: true,
            supersetGroup: true,
            restAfterSeconds: true,
            sets: { select: { type: true, targetReps: true, restSeconds: true, tempo: true } },
          },
        },
      },
    }),
    // This client's lifts from this program, to say how each phase is going.
    prisma.scheduledItem.findMany({
      where: { clientId: client.userId, templateId, kind: 'workout' },
      select: { date: true, completedAt: true },
    }),
  ]);

  const phases = phaseRows.length > 0 ? phaseRows : [implicitPhase(items)];
  const ranges = phaseRanges(phases);
  const totalWeeks = programWeeks(phases, items);
  const onCalendar = items.length > 0;
  const progress = subscriptionProgress(active.startDate, today, ranges, totalWeeks * 7);
  const dated = active.startDate ? phaseDates(ranges, active.startDate, today) : null;

  // A workout with no phase, or a phase that no longer exists, reads as the
  // first phase's — same rule as the program page.
  const phaseIds = new Set(phases.map((p) => p.id));
  const phaseOf = (w: { phaseId: string | null }) => (w.phaseId && phaseIds.has(w.phaseId) ? w.phaseId : phases[0].id);

  const dayMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  return (
    <div className="flex flex-col gap-4">
      <SystemWindow title="Training program" meta={`[${totalWeeks} wk]`}>
        <SystemWindowContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{active.template.name}</h2>
              {progress.state === 'running' && <Badge variant="accent">Week {progress.week}</Badge>}
              {progress.state === 'upcoming' && <Badge>Starts in {progress.startsInDays}d</Badge>}
              {progress.state === 'finished' && <Badge variant="success">Finished</Badge>}
            </div>
            <p className="readout text-[11px] uppercase text-muted-foreground">
              {active.startDate ? `Started ${fmtYear(active.startDate)}` : 'Start date not recorded'} ·{' '}
              {phases.length} phase{phases.length === 1 ? '' : 's'} · {workouts.length} workout
              {workouts.length === 1 ? '' : 's'}
            </p>
            {active.template.description && (
              <p className="mt-1 text-sm text-muted-foreground">{active.template.description}</p>
            )}
          </div>

          {/* What editing means for this client, said where the coach will look. */}
          <div className="flex items-start gap-2 border border-border/70 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            {active.linked && onCalendar ? (
              <>
                <Link2 size={14} className="mt-0.5 shrink-0 text-accent" />
                <p>
                  Linked to a master program. Edits to{' '}
                  <Link href={`/coach/programs/${templateId}`} className="text-accent hover:underline">
                    {active.template.name}
                  </Link>{' '}
                  update their upcoming days; past, finished and days you moved on their calendar stay as they are.
                </p>
              </>
            ) : active.linked ? (
              <>
                <Link2 size={14} className="mt-0.5 shrink-0" />
                <p>
                  From{' '}
                  <Link href={`/coach/programs/${templateId}`} className="text-accent hover:underline">
                    {active.template.name}
                  </Link>
                  &apos;s weekly pattern. Changes reach them when you start them on it again.
                </p>
              </>
            ) : (
              <>
                <Link2Off size={14} className="mt-0.5 shrink-0" />
                <p>
                  Unlinked from{' '}
                  <Link href={`/coach/programs/${templateId}`} className="text-accent hover:underline">
                    {active.template.name}
                  </Link>
                  : their calendar keeps what it has and no longer follows edits to the master.
                </p>
              </>
            )}
          </div>

          <Link
            href={`/coach/clients/${client.userId}/calendar`}
            className="inline-flex w-fit items-center gap-2 border border-border px-3 py-2 text-xs transition-colors hover:border-accent/50 hover:text-accent"
          >
            <CalendarDays size={14} />
            Change a day for them only
          </Link>
        </SystemWindowContent>
      </SystemWindow>

      <ol className="flex flex-col gap-3">
        {phases.map((p, i) => {
          const r = ranges[i];
          const d = dated?.[i] ?? null;
          const list = workouts.filter((w) => phaseOf(w) === p.id);
          const inPhase = d ? rows.filter((x) => dayMs(x.date) >= dayMs(d.from) && dayMs(x.date) <= dayMs(d.to)) : [];
          const done = inPhase.filter((x) => x.completedAt).length;
          return (
            <li key={p.id}>
              <SystemWindow plain className={cn(d?.current && 'border-accent/60')}>
                <SystemWindowContent className="flex flex-col gap-3 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                        {d?.current && <Badge variant="accent">Current</Badge>}
                        {d?.past && <Badge>Done</Badge>}
                      </div>
                      <p className="readout mt-0.5 text-[11px] uppercase text-muted-foreground">
                        {d ? `${fmt(d.from)} – ${fmtYear(d.to)}` : `Weeks ${r.startWeek}–${r.endWeek}`} · {p.weeks} wk
                      </p>
                    </div>
                    {inPhase.length > 0 && (
                      <span className="readout text-[11px] uppercase text-muted-foreground">
                        {done}/{inPhase.length} sessions done
                      </span>
                    )}
                  </div>
                  {p.summary && <p className="text-xs text-muted-foreground">{p.summary}</p>}
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No workouts in this phase.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border/50 border-t border-border/50">
                      {list.map((w) => {
                        const minutes =
                          w.estMinutes ??
                          (estimateMinutes(
                            w.workoutExercises.map((we) => ({
                              id: we.id,
                              supersetGroup: we.supersetGroup,
                              restAfterSeconds: we.restAfterSeconds,
                              sets: we.sets,
                            }))
                          ) ||
                            null);
                        const count = w.workoutExercises.length;
                        return (
                          <li key={w.id} className="flex items-center gap-3 py-2">
                            <Dumbbell size={14} className="shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
                            <span className="readout shrink-0 text-[10px] uppercase text-muted-foreground">
                              {minutes ? `${minutes} min · ` : ''}
                              {count} ex
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SystemWindowContent>
              </SystemWindow>
            </li>
          );
        })}
      </ol>

      <PastPrograms past={past} />
    </div>
  );
}

function PastPrograms({
  past,
}: {
  past: { id: string; startDate: Date | null; template: { id: string; name: string } }[];
}) {
  if (past.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={labelClass}>Earlier programs</span>
      <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
        {past.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link href={`/coach/programs/${p.template.id}`} className="truncate hover:text-accent">
              {p.template.name}
            </Link>
            <span className="readout shrink-0 text-[10px] uppercase text-muted-foreground">
              {p.startDate ? `from ${fmtYear(p.startDate)}` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
