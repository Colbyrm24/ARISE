import Link from 'next/link';
import { ClipboardList, ChevronRight, Download } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { requireCoach } from '@/lib/auth';
import { DeleteProgramButton } from '@/components/coach/delete-program-button';
import { createTemplate, deleteTemplate, loadCoachProgram } from './actions';

export default async function CoachProgramsPage() {
  /*
    This coach's programs.

    The read had no coachId on it at all, so this list showed every template
    in the database — every other coach's program names and descriptions, with
    a delete button beside each one. The delete action does check ownership,
    so nothing could be destroyed across accounts; the names were simply on
    screen. createTemplate has always stamped coachId, so the column to filter
    on was there the whole time.

    Admins see everything, matching coachOwnsTemplate — an admin exists to
    clean up after coaches, and a list they cannot see is not much use for it.
  */
  const coach = await requireCoach();
  const templates = await prisma.workoutTemplate.findMany({
    where: coach.role === 'admin' ? {} : { coachId: coach.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { workouts: true } },
    },
  });

  /*
    How many clients are actually running each one.

    The badge read `_count.clientPrograms`, which counts every row ever
    written — and ClientProgram.active is how an assignment is retired, so
    nothing is ever deleted. A program run by two clients over a year of churn
    said "Assigned to 14", and the badge turned accent-coloured for a program
    nobody is on, which is the state where deleting it is safe.

    Counted in a second query and tallied here rather than as a filtered
    `_count`. Filtered relation counts are valid Prisma 5, but the offline
    client stub types `select` as `any`, so a typecheck here proves nothing
    about that syntax and only Vercel would find out. There are never many
    rows; this is exact and it cannot fail to build.
  */
  const ids = templates.map((t) => t.id);
  const [assignments, loggedTemplates] = await Promise.all([
    prisma.clientProgram.findMany({
      where: { templateId: { in: ids } },
      select: { templateId: true, active: true },
    }),
    /*
      Which templates a client has actually trained from.

      Matched on the Workout side rather than counting WorkoutLog rows, so
      this is one row per workout that has ever been logged rather than one
      per session — the question is only "any", and a client three months in
      has hundreds of logs.
    */
    prisma.workout.findMany({
      where: { templateId: { in: ids }, workoutLogs: { some: {} } },
      select: { templateId: true },
      distinct: ['templateId'],
    }),
  ]);

  const liveCount = new Map<string, number>();
  const everAssigned = new Set<string>();
  for (const a of assignments) {
    everAssigned.add(a.templateId);
    if (a.active) liveCount.set(a.templateId, (liveCount.get(a.templateId) ?? 0) + 1);
  }
  const trainedFrom = new Set(
    loggedTemplates.map((w) => w.templateId).filter((id): id is string => Boolean(id))
  );

  /*
    Whether the bin can do anything at all.

    deleteTemplate wraps its transaction in a bare `catch {}`, so a template
    that a client is assigned to — or has ever trained from — silently stayed
    put: the coach pressed delete, the page revalidated, the program was still
    there, and nothing said why. Both blocks are foreign keys and both are
    correct, because a client's logged sessions are their history and a
    retired assignment is the record that they ran it.

    So the answer is worked out here, before the button is drawn, and a
    program that cannot be deleted says so instead of offering an action that
    does nothing.
  */
  const canDelete = (id: string) => !everAssigned.has(id) && !trainedFrom.has(id);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Programs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a workout template once and reuse it across clients, or create a one-off for a single
          client — either way it starts here.
        </p>
      </header>

      {/* One press builds the real split — four sessions, every movement,
          rest, notes, the cardio types and the rest-day messages. It exists so
          a program that took an afternoon in another tool takes a click here.
          Safe to press twice: nothing is duplicated or overwritten. */}
      <Card>
        <CardHeader>
          <CardTitle>Start from your program</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Builds Transformation Program exactly as you run it — the four sessions with every
            movement, set and rest, your notes on each one, walking and the other cardio types, and
            the rest-day messages. Pressing it again repairs anything missing and changes nothing
            else.
          </p>
          <form action={loadCoachProgram}>
            <Button type="submit" size="sm" className="w-full shrink-0 sm:w-auto">
              <Download size={15} />
              Load my program
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Program</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTemplate} className="flex flex-col gap-3 sm:flex-row">
            <Input name="name" placeholder="Program name (e.g. Push Pull Legs, or Jane's Custom Plan)" required className="flex-1" />
            <Input name="description" placeholder="Description (optional)" className="flex-1" />
            <Button type="submit" size="sm" className="w-fit shrink-0">
              Create & Build
            </Button>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ClipboardList size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No programs yet — create your first one above.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((t) => {
            const running = liveCount.get(t.id) ?? 0;
            return (
              <li key={t.id}>
                <Card interactive>
                  <CardContent className="flex items-center justify-between gap-4 pt-6">
                    <Link href={`/coach/programs/${t.id}`} className="flex flex-1 flex-col gap-2">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">
                          {t._count.workouts} day{t._count.workouts === 1 ? '' : 's'}
                        </Badge>
                        <Badge variant={running > 0 ? 'accent' : 'outline'}>
                          {running > 0 ? `Running with ${running}` : 'Not assigned'}
                        </Badge>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3">
                      {/*
                        Two taps, and the second one names the program.

                        This was a bare submit button one flex gap away from
                        the chevron that opens the program — on a phone, two
                        targets a few millimetres apart, one of which opens a
                        screen and the other of which deletes every workout
                        under a template with no undo and no prompt. There is
                        no confirm() anywhere else in this app either; this is
                        the place it was most needed.
                      */}
                      {canDelete(t.id) ? (
                        <DeleteProgramButton action={deleteTemplate} id={t.id} name={t.name} />
                      ) : (
                        <span
                          title="In use — a client is assigned to this, or has trained from it"
                          className="readout text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          In use
                        </span>
                      )}
                      <Link href={`/coach/programs/${t.id}`} aria-label={`Open ${t.name}`}>
                        <ChevronRight size={18} className="text-muted-foreground" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
