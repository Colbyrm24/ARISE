import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Dumbbell, Apple, CalendarDays } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { todayIn, zoneOf } from '@/lib/day';
import { dayKey } from '@/lib/month-grid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StartProgramForm } from '@/components/coach/start-program';
import { NutritionTargetForm } from '@/components/coach/nutrition-target-form';
import { startProgram, unassignProgram } from './program-actions';
import { setNutritionTarget } from './nutrition-actions';

/*
  Overview — the two things a coach changes most: what they are training
  and what they are eating. Everything else moved to its own tab.

  Ownership is checked once in the layout that wraps every tab, so this and
  its five siblings don't each carry their own guard.
*/
export default async function ClientOverviewPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    include: {
      clientPrograms: {
        where: { active: true },
        take: 1,
        include: { template: { include: { _count: { select: { workouts: true } } } } },
      },
      workoutLogs: {
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { workout: true },
      },
      nutritionTargets: { orderBy: { effectiveDate: 'desc' }, take: 1 },
      // For the dates below. startedAt is an instant, and the day it belongs
      // to is the client's day, not the server's.
      user: { select: { profile: { select: { timezone: true } } } },
    },
  });

  if (!client) notFound();

  /*
    Their zone, not the host's.

    startedAt is a DateTime instant and this rendered with no timeZone, which
    on Vercel means UTC. A client in Los Angeles who trained at 6pm Monday
    (01:00Z Tuesday) had that session listed under Tue here — so the coach
    asked how Tuesday's session went about a workout done on Monday, and this
    list disagreed with the client's own calendar and Today screen, both of
    which use the client's zone.
  */
  const clientZone = zoneOf(client.user?.profile);

  /*
    Scoped to this coach. This feeds the assign-program dropdown, and
    unfiltered it offered every coach's templates for assignment to a client
    who isn't theirs.
  */
  const coach = await requireCoach();
  const programTemplates = await prisma.workoutTemplate.findMany({
    where: { coachId: coach.id },
    orderBy: { name: 'asc' },
    // A dropdown. Two hundred is far past the point where a coach would
    // scroll one, and it stops this growing into a full table read.
    take: 200,
  });

  const activeProgram = client.clientPrograms[0] ?? null;

  // Their today, so a program started from here begins on the client's day.
  const defaultStart = dayKey(todayIn(clientZone));

  // How far their calendar runs, so "is anything actually scheduled?" has an
  // answer on this card instead of a trip to the Calendar tab.
  const lastScheduled = activeProgram
    ? await prisma.scheduledItem.findFirst({
        where: { clientId: client.userId },
        orderBy: { date: 'desc' },
        select: { date: true },
      })
    : null;
  const runsThrough = lastScheduled
    ? lastScheduled.date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;
  const programOptions = programTemplates.map((t) => ({ id: t.id, name: t.name }));
  const currentTarget = client.nutritionTargets[0] ?? null;

  return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Training</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {programTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No programs built yet —{' '}
                <Link href="/coach/programs" className="text-accent hover:underline">
                  create one
                </Link>{' '}
                to start them on it.
              </p>
            ) : activeProgram ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} className="text-accent" />
                    <p className="text-sm font-medium">{activeProgram.template.name}</p>
                  </div>
                  <form action={unassignProgram}>
                    <input type="hidden" name="clientProgramId" value={activeProgram.id} />
                    <input type="hidden" name="clientId" value={client.userId} />
                    <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                      Unassign
                    </button>
                  </form>
                </div>
                <p className="text-xs text-muted-foreground">
                  {runsThrough ? (
                    <>Calendar runs through {runsThrough}</>
                  ) : (
                    <span className="text-destructive">Nothing on their calendar yet — start it below</span>
                  )}{' '}
                  ·{' '}
                  <Link href={`/coach/clients/${client.userId}/program`} className="text-accent hover:underline">
                    Phases &amp; dates
                  </Link>{' '}
                  ·{' '}
                  <Link href={`/coach/programs/${activeProgram.templateId}`} className="text-accent hover:underline">
                    Edit program
                  </Link>
                </p>
                <Link
                  href={`/coach/clients/${client.userId}/calendar`}
                  className="inline-flex w-fit items-center gap-2 border border-border px-3 py-2 text-xs text-foreground transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <CalendarDays size={14} />
                  Move sessions on their calendar
                </Link>
                <details className="group border-t border-border pt-3" open={!runsThrough}>
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Switch program or restart from a date
                  </summary>
                  <div className="pt-3">
                    <StartProgramForm
                      clientId={client.userId}
                      programs={programOptions}
                      defaultStart={defaultStart}
                      currentTemplateId={activeProgram.templateId}
                      action={startProgram}
                    />
                  </div>
                </details>
              </div>
            ) : (
              <StartProgramForm
                clientId={client.userId}
                programs={programOptions}
                defaultStart={defaultStart}
                action={startProgram}
              />
            )}

            {client.workoutLogs.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent Activity
                </p>
                <ul className="flex flex-col gap-1.5">
                  {client.workoutLogs.map((log) => (
                    <li key={log.id} className="flex items-center justify-between text-xs">
                      <span>{log.workout.name}</span>
                      <span className="text-muted-foreground">
                        {log.startedAt.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          timeZone: clientZone,
                        })}
                        {log.completedAt ? ' · completed' : ' · in progress'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
<CardHeader>
  <CardTitle>Nutrition</CardTitle>
</CardHeader>
<CardContent className="flex flex-col gap-4">
  {currentTarget && (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/20 px-4 py-3">
      <Apple size={16} className="text-accent" />
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{currentTarget.calories} cal</span> ·{' '}
        {Number(currentTarget.protein)}g protein · {Number(currentTarget.carbs)}g carbs ·{' '}
        {Number(currentTarget.fat)}g fat
      </div>
    </div>
  )}
  {/*
    A client component now, because the calorie box drives the other three
    and that has to happen as he types. The Prisma Decimal columns are
    turned into plain numbers here — they do not survive the trip to the
    browser as Decimals.
  */}
  <NutritionTargetForm
    action={setNutritionTarget}
    clientId={client.userId}
    current={
      currentTarget
        ? {
            calories: currentTarget.calories,
            protein: Number(currentTarget.protein),
            carbs: Number(currentTarget.carbs),
            fat: Number(currentTarget.fat),
          }
        : null
    }
  />
</CardContent>
</Card>
      </div>
  );
}
