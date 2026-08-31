import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { coachIdForClient } from '@/lib/notifications';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { boardView, rankBoard, type BoardRow } from '@/lib/leaderboard';
import { cn } from '@/lib/utils';

/*
  Where everybody with the same coach stands, on consistency alone.

  The rule that shapes this whole screen: it ranks showing up and nothing
  else. Not weight, not photos, not macros. A leaderboard between people who
  share a coach is motivating or humiliating depending entirely on what it
  measures, and "who has logged the most days" is a thing anybody can win
  starting tomorrow regardless of what they weigh.

  A day counts as active if anything happened on it — a finished workout,
  cardio, steps, or a habit ticked. Deliberately generous. The client on a
  deload week who still walks and logs their food is being consistent, and a
  board that only counted workouts would tell them otherwise.
*/

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

export default async function LeaderboardPage() {
  const user = await requireClient();
  const coachId = await coachIdForClient(user.id);

  if (!coachId) {
    return (
      <div className="flex flex-col gap-5">
        <Header />
        <SystemWindow title="Consistency">
          <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
            You&apos;re not assigned to a coach yet, so there&apos;s nobody to line up against.
          </SystemWindowContent>
        </SystemWindow>
      </div>
    );
  }

  const today = todayFor(user);
  const since = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (WINDOW_DAYS - 1))
  );

  /*
    Everyone this coach actively works with. The relationship table is the
    gate, not Client.coachId — a paused or ended client should not be sitting
    on a board being compared against people still training.
  */
  const relationships = await prisma.coachClientRelationship.findMany({
    where: { coachId, status: 'active' },
    select: { clientId: true },
  });
  const clientIds = relationships.map((r) => r.clientId);
  if (clientIds.length === 0) return null;

  /*
    Four grouped reads rather than a per-client loop. Thirty clients times
    four queries each is 120 round trips on a page nobody would wait for;
    this is four regardless of how many people the coach has.
  */
  const [workouts, cardio, steps, goals, people] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { clientId: { in: clientIds }, completedAt: { not: null }, startedAt: { gte: since } },
      select: { clientId: true, startedAt: true },
    }),
    prisma.cardioLog.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since } },
      select: { clientId: true, date: true },
    }),
    prisma.stepLog.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since } },
      select: { clientId: true, date: true },
    }),
    prisma.dailyGoalLog.findMany({
      where: { clientId: { in: clientIds }, completed: true, date: { gte: since } },
      select: { clientId: true, date: true },
    }),
    prisma.user.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, profile: { select: { fullName: true } } },
    }),
  ]);

  // One set of day-keys per client, so two things logged on the same day
  // count once. Consistency is days shown up, not events recorded.
  const days = new Map<string, Set<string>>();
  const mark = (clientId: string, d: Date) => {
    const key = d.toISOString().slice(0, 10);
    if (!days.has(clientId)) days.set(clientId, new Set());
    days.get(clientId)!.add(key);
  };
  for (const w of workouts) mark(w.clientId, w.startedAt);
  for (const c of cardio) mark(c.clientId, c.date);
  for (const s of steps) mark(s.clientId, s.date);
  for (const g of goals) mark(g.clientId, g.date);

  const rows: BoardRow[] = people.map((p) => ({
    clientId: p.id,
    fullName: p.profile?.fullName ?? null,
    activeDays: days.get(p.id)?.size ?? 0,
  }));

  const { head, trailing } = boardView(rankBoard(rows, WINDOW_DAYS, user.id));

  return (
    <div className="flex flex-col gap-5">
      <Header />

      <SystemWindow title="Consistency" meta={`Last ${WINDOW_DAYS} days`}>
        <SystemWindowContent className="flex flex-col pt-4">
          <p className="pb-3 text-sm leading-relaxed text-muted-foreground">
            Days you showed up, out of the last {WINDOW_DAYS}. Nothing else is counted here — not
            weight, not photos, not macros.
          </p>

          <ul className="flex flex-col">
            {head.map((e) => (
              <Row key={e.clientId} entry={e} />
            ))}
          </ul>

          {/*
            The viewer's own row, carried down when they placed outside the
            top. The question somebody opens this screen with is "where am I",
            and making them scroll a wall of names to find out is the version
            of this feature that gets closed and never opened again.
          */}
          {trailing && (
            <>
              <p className="readout py-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                · · ·
              </p>
              <ul className="flex flex-col">
                <Row entry={trailing} />
              </ul>
            </>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}

function Header() {
  return (
    <header>
      <p className="readout text-[11px] uppercase text-muted-foreground">Leaderboard</p>
      <h1 className="display mt-1.5 text-2xl">Consistency</h1>
    </header>
  );
}

function Row({ entry }: { entry: ReturnType<typeof rankBoard>[number] }) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-border/50 py-2.5 last:border-b-0',
        entry.isViewer && 'bg-accent/[0.06]'
      )}
    >
      <span
        className={cn(
          'readout w-7 shrink-0 text-[11px] tabular-nums',
          entry.rank <= 3 ? 'text-accent' : 'text-muted-foreground'
        )}
      >
        {entry.rank}
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-[15px]', entry.isViewer && 'text-accent')}>
        {entry.name}
        {entry.isViewer && <span className="pl-2 text-xs text-muted-foreground">you</span>}
      </span>
      <span className="readout shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {entry.activeDays}/{WINDOW_DAYS}
      </span>
      <span className="readout w-11 shrink-0 text-right text-[11px] tabular-nums text-foreground">
        {entry.percent}%
      </span>
    </li>
  );
}
