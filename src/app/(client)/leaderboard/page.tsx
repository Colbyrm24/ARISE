import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor, dayIn, zoneOf } from '@/lib/day';
import { dayKey } from '@/lib/month-grid';
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
      // timezone, because a workout is an instant and the day it counts for
      // is that person's own day — see the note on `mark` below.
      select: { id: true, profile: { select: { fullName: true, timezone: true } } },
    }),
  ]);

  const zoneFor = new Map<string, string>(
    people.map((p) => [p.id, zoneOf(p.profile)] as const)
  );

  /*
    One set of day-keys per client, so two things logged on the same day count
    once. Consistency is days shown up, not events recorded.

    Which means all four sources have to agree on what a day IS. Three of them
    are @db.Date labels written with todayFor — the client's real local day.
    The fourth, WorkoutLog.startedAt, is a raw instant, and slicing its ISO
    string gave the UTC day: a client in Los Angeles who trained at 7pm Monday
    and logged their steps on Monday scored TWO active days for one day of
    showing up, and got credited for a Tuesday they might have rested. Over a
    30-day window that systematically ranked evening-training clients in the
    west above identically consistent ones in the east. consistencyPercent
    clamps at 100, which is why it never looked broken.
  */
  const days = new Map<string, Set<string>>();
  const markKey = (clientId: string, key: string) => {
    if (!days.has(clientId)) days.set(clientId, new Set());
    days.get(clientId)!.add(key);
  };
  /** A stored @db.Date label — already the right calendar day, read in UTC. */
  const markLabel = (clientId: string, d: Date) => markKey(clientId, dayKey(d));
  /** An instant — the day it belongs to is that client's own day. */
  const markInstant = (clientId: string, at: Date) =>
    markKey(clientId, dayKey(dayIn(at, zoneFor.get(clientId))));

  for (const w of workouts) markInstant(w.clientId, w.startedAt);
  for (const c of cardio) markLabel(c.clientId, c.date);
  for (const s of steps) markLabel(s.clientId, s.date);
  for (const g of goals) markLabel(g.clientId, g.date);

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
