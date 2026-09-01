import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Dumbbell, Apple } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { zoneOf } from '@/lib/day';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { assignProgram, unassignProgram } from './program-actions';
import { setNutritionTarget } from './nutrition-actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  const currentTarget = client.nutritionTargets[0] ?? null;

  return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Training</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activeProgram ? (
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
                  {activeProgram.template._count.workouts} day
                  {activeProgram.template._count.workouts === 1 ? '' : 's'} ·{' '}
                  <Link href={`/coach/programs/${activeProgram.templateId}`} className="text-accent hover:underline">
                    View / edit program
                  </Link>
                </p>
              </div>
            ) : programTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No programs built yet —{' '}
                <Link href="/coach/programs" className="text-accent hover:underline">
                  create one
                </Link>{' '}
                to assign here.
              </p>
            ) : (
              <form action={assignProgram} className="flex flex-col gap-3">
                <input type="hidden" name="clientId" value={client.userId} />
                <select name="templateId" className={selectClass} required defaultValue="">
                  <option value="" disabled>
                    Assign a program…
                  </option>
                  {programTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-fit">
                  Assign
                </Button>
              </form>
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
  <form action={setNutritionTarget} className="flex flex-col gap-2">
    <input type="hidden" name="clientId" value={client.userId} />
    <div className="grid grid-cols-2 gap-2">
      <Input name="calories" type="number" min="0" placeholder="Calories" required defaultValue={currentTarget?.calories ?? undefined} />
      <Input name="protein" type="number" step="0.1" min="0" placeholder="Protein (g)" required defaultValue={currentTarget ? Number(currentTarget.protein) : undefined} />
      <Input name="carbs" type="number" step="0.1" min="0" placeholder="Carbs (g)" required defaultValue={currentTarget ? Number(currentTarget.carbs) : undefined} />
      <Input name="fat" type="number" step="0.1" min="0" placeholder="Fat (g)" required defaultValue={currentTarget ? Number(currentTarget.fat) : undefined} />
    </div>
    <Button type="submit" size="sm" variant="secondary" className="w-fit">
      {currentTarget ? 'Update Target' : 'Set Target'}
    </Button>
  </form>
</CardContent>
</Card>
      </div>
  );
}
