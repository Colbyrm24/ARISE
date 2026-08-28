import Link from 'next/link';
import { Check, ChevronRight, MessageCircle } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  SystemWindow,
  SystemWindowContent,
  Count,
  Cell,
  countState,
  type CountMode,
} from '@/components/ui/system-window';
import { habitLabel, isTracked } from '@/lib/habits';
import { upcomingForClient } from '@/lib/booking';
import { scheduledToday, scheduleBetween } from '@/lib/program-deploy';
import { LocalTime } from '@/components/local-time';
import { WeekStrip } from '@/components/client/week-strip';
import { todayFor, hourIn, zoneOf, startOfDay } from '@/lib/day';
import { ProgressRing, ProgressBar } from '@/components/client/progress-ring';
import { toggleHabit, logSteps, logCardio } from './actions';

/*
  Which day this screen is showing.

  The day lives in the URL (`/today?d=2026-08-27`) rather than in component
  state, which is what lets the whole page stay a server component: moving to
  Thursday is a navigation, and Thursday's session, meals and habits are
  fetched for Thursday rather than fetched for today and filtered in the
  browser. It also means a day can be linked to — a coach can send "look at
  Saturday" and have it open on Saturday.
*/
/*
  All four helpers below work in UTC, and that is deliberate rather than lazy.

  A calendar date has no time and no zone. Every date column here is
  `@db.Date`, which Postgres round-trips as UTC midnight, so UTC midnight is
  the canonical in-memory shape and these stay in it. The local-time versions
  (`new Date(y, m-1, d)`, `getDay()`, `setHours`) happened to agree only
  because Vercel runs the server in UTC — on any other host they would shift
  the whole week strip by a day.

  Which day it currently IS for the client is a different question, and that
  one does need their zone. It's `todayFor(user)`.
*/
function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Anything that isn't a real YYYY-MM-DD falls back to today rather than erroring. */
function parseDateKey(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const out = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(out.getTime())) return null;
  // Rejects 2026-02-31 and friends, which Date happily rolls into March.
  if (out.getUTCFullYear() !== y || out.getUTCMonth() !== m - 1 || out.getUTCDate() !== d) {
    return null;
  }
  return out;
}

function addLocalDays(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/** Monday. The training week starts where the program's week starts. */
function startOfWeek(d: Date) {
  const js = d.getUTCDay(); // 0 = Sunday
  return addLocalDays(d, -(js === 0 ? 6 : js - 1));
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/*
  A habit's target, as a number.

  The coach types these into a free-text box labelled "Target, or what to
  do", so what actually lands in the column is prose: "12,000 steps",
  "1 gallon", "180g protein". `Number("12,000 steps")` is NaN, which fell
  through to undefined and rendered the row as "[—]" — a client with a
  perfectly good 12,000 step goal saw a dash where their progress should be,
  on the same screen where the session card was already counting the same
  steps toward the same number.

  Pull the digits out instead of asking coaches to type bare integers.
*/
function targetNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/*
  Time-aware greeting, on the client's clock.

  This renders on the server, where `new Date().getHours()` is the server's
  hour — UTC on Vercel. So the bug this was written to fix was still live in a
  different form: a client in Los Angeles opening the app at 8pm was read as
  03:00 and greeted with "Good morning".
*/
function greeting(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams?: { d?: string };
}) {
  const user = await requireEntitledClient();
  const firstName = user?.profile?.fullName?.split(' ')[0] ?? 'there';
  const tz = zoneOf(user.profile);
  const today = todayFor(user);

  /*
    Every query below is scoped to `viewDate`, not to today. That is the
    whole calendar change: the page already knew how to render a day, it
    just always rendered the same one.

    `isToday` gates the things that write. You can look at Thursday, but you
    cannot tick Thursday's habits on Tuesday — a checkbox that silently
    logged against the wrong day would be worse than no checkbox.
  */
  const viewDate = parseDateKey(searchParams?.d) ?? today;
  const isToday = viewDate.getTime() === today.getTime();
  const isPast = viewDate.getTime() < today.getTime();

  // What the program says this day is. Null when nobody has deployed one
  // yet, in which case this whole block stays off the screen rather than
  // showing an empty shell.
  const scheduled = user ? await scheduledToday(user.id, viewDate) : null;

  // What they have already logged against a minutes-based cardio day, so the
  // row can show "done" instead of offering the form again.
  const cardioLog =
    user && scheduled?.cardioTypeId && scheduled.kind === 'cardio'
      ? await prisma.cardioLog.findFirst({
          where: { clientId: user.id, cardioTypeId: scheduled.cardioTypeId, date: viewDate },
          select: { minutes: true },
        })
      : null;

  // The seven days around whichever one is open, for the strip at the top.
  const weekStart = startOfWeek(viewDate);
  const weekItems = user ? await scheduleBetween(user.id, weekStart, addLocalDays(weekStart, 6)) : [];
  /*
    Scheduled rows are stored at UTC midnight; the dates on this page are
    local midnight. Keyed off the UTC calendar date on one side and the
    local one on the other, which agree for every timezone this app is used
    in. Worth knowing if that ever stops being true.
  */
  /*
    Only two fields off each row are needed to draw the strip, so the map is
    typed to exactly those. Being explicit here rather than leaning on
    inference keeps this compiling whether or not the Prisma client has been
    generated — `new Map(xs.map(x => [k, x]))` infers its value type as {}
    from an array that isn't a tuple, and the failure shows up as
    "Property 'kind' does not exist", three lines away from the cause.
  */
  const scheduledByDay = new Map<string, { date: Date; kind: string }>(
    weekItems.map(
      (item) =>
        [item.date.toISOString().slice(0, 10), item as { date: Date; kind: string }] as const
    )
  );
  const weekDays = WEEKDAY_LETTERS.map((letter, i) => {
    const day = addLocalDays(weekStart, i);
    const iso = dateKey(day);
    const item = scheduledByDay.get(iso);
    return {
      iso,
      letter,
      dayNumber: day.getDate(),
      hasSession: Boolean(item && item.kind !== 'rest'),
      isRest: item?.kind === 'rest',
      isToday: day.getTime() === today.getTime(),
      isSelected: day.getTime() === viewDate.getTime(),
    };
  });

  // Everything below reads real data where the feature already exists.
  // Where the feature is later in the roadmap (water, etc.), this shows
  // an honest empty state instead of pretending.
  const [
    goals,
    goalLogs,
    target,
    nutritionLogs,
    stepLog,
    upcomingCalls,
    latestMessage,
    activeProgram,
    latestWeight,
  ] = user
    ? await Promise.all([
        prisma.dailyGoal.findMany({ where: { clientId: user.id, active: true } }),
        prisma.dailyGoalLog.findMany({ where: { clientId: user.id, date: viewDate } }),
        prisma.nutritionTarget.findFirst({
          where: { clientId: user.id, effectiveDate: { lte: viewDate } },
          orderBy: { effectiveDate: 'desc' },
        }),
        prisma.nutritionLog.findMany({ where: { clientId: user.id, date: viewDate } }),
        prisma.stepLog.findUnique({ where: { clientId_date: { clientId: user.id, date: viewDate } } }),
        upcomingForClient(user.id),
        prisma.message.findFirst({
          where: { recipientId: user.id },
          orderBy: { createdAt: 'desc' },
          include: { sender: { include: { profile: true } } },
        }),
        prisma.clientProgram.findFirst({
          where: { clientId: user.id, active: true },
          include: { template: { include: { workouts: { orderBy: { dayOrder: 'asc' } } } } },
        }),
        prisma.weightLog.findFirst({
          where: { clientId: user.id },
          orderBy: { date: 'desc' },
        }),
      ])
    : [[], [], null, [], null, [], null, null, null];

  const weighedInToday = latestWeight ? latestWeight.date.getTime() === viewDate.getTime() : false;

  const unreadUpdates = user
    ? await prisma.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  const caloriesEaten = nutritionLogs.reduce((sum, l) => sum + l.calories, 0);
  const proteinEaten = Math.round(nutritionLogs.reduce((sum, l) => sum + Number(l.protein), 0));

  // Rotate through the assigned program's days based on how many days have
  // passed since it was assigned — a simple, predictable cadence with no
  // extra scheduling data needed.
  const workouts = activeProgram?.template.workouts ?? [];
  const daysSinceStart = activeProgram
    ? Math.max(0, Math.floor((today.getTime() - activeProgram.assignedAt.getTime()) / 86400000))
    : 0;
  const todaysWorkout = workouts.length > 0 ? workouts[daysSinceStart % workouts.length] : null;

  const todaysLog =
    user && todaysWorkout
      ? await prisma.workoutLog.findFirst({
          where: {
            clientId: user.id,
            workoutId: todaysWorkout.id,
            /*
              Instants, not the `@db.Date` label for the day. The label is UTC
              midnight of that date, which in New York is 8pm the previous
              evening — so bounding by it swept last night's unfinished
              session into this morning and appended today's sets to it.
            */
            startedAt: {
              gte: startOfDay(viewDate, tz),
              lt: startOfDay(addLocalDays(viewDate, 1), tz),
            },
          },
          orderBy: { startedAt: 'desc' },
        })
      : null;

  const workoutDone = Boolean(todaysLog?.completedAt);

  /*
    Each daily goal becomes a row in the goal window. Where the app already
    tracks the underlying number — steps, protein, calories — the row carries
    real progress rather than just a checkbox, so the client can see how far
    into it they are without opening anything. A goal is complete when it was
    logged complete OR when the tracked number has caught up to the target.
  */
  const loggedDone = new Set(goalLogs.filter((g) => g.completed).map((g) => g.dailyGoalId));

  const rows = goals.map((goal) => {
    const label = habitLabel(goal.goalType, goal.targetValue);
    let value: number | undefined;
    let total: number | undefined;
    let unit = '';

    if (goal.goalType === 'steps') {
      value = stepLog?.steps ?? 0;
      // Falls back to the number the deployed week already carries, so the
      // two places steps appear on this screen can't disagree.
      total = targetNumber(goal.targetValue) ?? scheduled?.stepTarget ?? undefined;
    } else if (goal.goalType === 'protein') {
      value = proteinEaten;
      total = target ? Math.round(Number(target.protein)) : targetNumber(goal.targetValue);
      unit = 'g';
    } else if (goal.goalType === 'calories') {
      value = caloriesEaten;
      total = target?.calories ?? targetNumber(goal.targetValue);
    } else if (goal.goalType === 'workout') {
      value = workoutDone ? 1 : 0;
      total = 1;
    }

    // Calories are a budget, not a target to beat. Everything else is a reach.
    const mode: CountMode = goal.goalType === 'calories' ? 'budget' : 'reach';
    const hit = value !== undefined && countState(value, total, mode) === 'landed';
    return {
      id: goal.id,
      label,
      value,
      total,
      unit,
      mode,
      done: loggedDone.has(goal.id) || hit,
      // Only manual habits get a checkbox, and only on today — ticking a box
      // while looking at Thursday would write Thursday's habit against
      // today's date, which is a quiet way to corrupt somebody's streak.
      //
      // Only manual habits get a checkbox. A tracked one completes off the
      // number the app already holds, and letting it be hand-ticked would
      // mean protein could read done on a day someone ate 40g.
      tickable: isToday && !isTracked(goal.goalType),
    };
  });

  const stepsHabit = goals.find((g) => g.goalType === 'steps') ?? null;
  const carbsEaten = Math.round(nutritionLogs.reduce((sum, l) => sum + Number(l.carbs), 0));
  const fatEaten = Math.round(nutritionLogs.reduce((sum, l) => sum + Number(l.fat), 0));

  /*
    The step goal, from whichever source actually set one. The deployed
    calendar carries a per-day target and wins when it exists — a rest day can
    legitimately ask for more walking than a leg day. A standing steps habit is
    the fallback. Null when neither is set, which renders as a plain count.
  */
  const stepGoal = scheduled?.stepTarget ?? targetNumber(stepsHabit?.targetValue) ?? null;

  // A rest day has no session to finish, so its bar says so rather than
  // sitting at 0/1 all day looking like something missed.
  const hasSessionToday = scheduled ? scheduled.kind !== 'rest' : Boolean(todaysWorkout);

  const completedCount = rows.filter((r) => r.done).length;
  const nextCall = upcomingCalls[0] ?? null;

  return (
    /*
      One column on a phone, two on a desktop.

      The full-width run at the top is the answer to "what do I do today" —
      the date, the week, and the session — and it stays full width at every
      size because splitting the answer in half is how you stop it reading
      as an answer. Everything below it is reference: habits, food, steps,
      weight, the last message. Those pair up.
    */
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6 lg:gap-y-6">
      <header className="lg:col-span-2">
        <p className="readout text-[11px] uppercase text-muted-foreground">
          {/* Server-rendered, so the zone has to be named or this flips to
              tomorrow's date mid-evening for anyone west of UTC. */}
          {viewDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          {/*
            The greeting is for today. On any other day it would be a lie —
            "Good evening" on a Saturday you're looking at from Tuesday — so
            the heading becomes the day itself, which is the more useful
            thing to say anyway once you've navigated somewhere.
          */}
          <h1 className="text-2xl font-bold">
            {isToday
              ? `${greeting(hourIn(tz))}, ${firstName}.`
              : viewDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}
          </h1>
          {unreadUpdates > 0 && (
            <Link
              href="/notifications"
              className="readout shrink-0 border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] uppercase text-accent"
            >
              [{unreadUpdates}] new
            </Link>
          )}
        </div>
      </header>

      <div className="lg:col-span-2">
        <WeekStrip days={weekDays} />
      </div>

      {/*
        A way back, and a reason to notice you've wandered.

        Without this the only route home from Friday is the browser's back
        button, and on a phone installed as a PWA there isn't one.
      */}
      {!isToday && (
        <Link
          href="/today"
          className="readout -mt-1 self-start text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent lg:col-span-2"
        >
          {isPast ? '← Back to today' : '← Back to today'}
        </Link>
      )}

      {/*
        What the program says today is.

        Above everything else because it is the answer to the question the
        client opened the app to ask. A rest day gets the same billing as a
        session — being told plainly to rest is the instruction, not the
        absence of one.
      */}
      {scheduled && (
        <SystemWindow
          className="lg:col-span-2"
          title={scheduled.kind === 'rest' ? 'Rest day' : isToday ? "Today's session" : 'Session'}
          meta={scheduled.workout?.estMinutes ? `[${scheduled.workout.estMinutes} min]` : undefined}
        >
          <SystemWindowContent className="flex flex-col gap-3 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={
                  scheduled.kind === 'rest'
                    ? 'text-sm text-muted-foreground'
                    : 'glow-soft text-sm font-medium text-foreground'
                }
              >
                {scheduled.kind === 'rest'
                  ? 'Nothing in the gym today. Steps and food still count.'
                  : scheduled.label}
              </span>
              {scheduled.workoutId && scheduled.kind !== 'rest' && (
                <Link
                  href={`/workouts/${scheduled.workoutId}`}
                  className="readout shrink-0 border border-accent/50 bg-accent/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
                >
                  Start
                </Link>
              )}
            </div>

            {scheduled.stepTarget && (
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-sm text-muted-foreground">
                  {scheduled.cardioType?.name ?? 'Steps'}
                </span>
                <Count
                  value={stepLog?.steps ?? 0}
                  total={scheduled.stepTarget}
                  mode="reach"
                />
              </div>
            )}

            {/*
              A minutes-based cardio day. The block above only ever rendered
              when a step target was set, so somebody prescribed "Stairmaster,
              20 minutes" saw the label and no number at all, and had nowhere
              to say they had done it. cardioMinutes was written by the deploy
              and read by nothing, and had no input on the coach's builder
              either, so it was never even non-null.

              Not gated on the absence of a step target: steps live on every
              day, not just cardio days, and one "set week steps" click writes
              the same target across all seven. A day can carry both.
            */}
            {scheduled.kind === 'cardio' && scheduled.cardioMinutes && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <span className="text-sm text-muted-foreground">
                  {scheduled.cardioType?.name ?? 'Cardio'}{' '}
                  <span className="readout text-[10px] uppercase">
                    {scheduled.cardioMinutes} min
                  </span>
                </span>

                {cardioLog?.minutes && !isToday ? (
                  <span className="readout flex items-center gap-1 text-[10px] uppercase text-success">
                    <Check size={12} /> {cardioLog.minutes} min done
                  </span>
                ) : isToday ? (
                  <form action={logCardio} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="cardioTypeId" value={scheduled.cardioTypeId ?? ''} />
                    <input
                      type="number"
                      name="minutes"
                      min="1"
                      max="600"
                      inputMode="numeric"
                      defaultValue={cardioLog?.minutes ?? scheduled.cardioMinutes}
                      aria-label="Minutes done"
                      className="readout h-9 w-20 border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none"
                    />
                    <button
                      type="submit"
                      className="readout border border-accent/50 bg-accent/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
                    >
                      {cardioLog?.minutes ? 'Update' : 'Log'}
                    </button>
                    {cardioLog?.minutes ? (
                      <Check size={12} className="shrink-0 text-success" />
                    ) : null}
                  </form>
                ) : null}
              </div>
            )}
          </SystemWindowContent>
        </SystemWindow>
      )}

      {/*
        The next call, if there is one. Everything else on this screen is
        something you can do any time today; a call is the only thing with a
        time attached, so it sits above the rest.
      */}
      {nextCall && (
        <SystemWindow title="Next call" plain className="lg:col-span-2">
          <SystemWindowContent className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <span className="readout text-sm text-accent glow-soft">
              <LocalTime iso={nextCall.startsAt.toISOString()} />
            </span>
            {nextCall.location && (
              <a
                href={nextCall.location.startsWith('http') ? nextCall.location : undefined}
                target={nextCall.location.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="readout min-w-0 break-all text-[10px] uppercase text-muted-foreground hover:text-accent"
              >
                {nextCall.location}
              </a>
            )}
          </SystemWindowContent>
        </SystemWindow>
      )}

      {/* Daily goals — the core screen. Real numbers, not just checkboxes. */}
      {rows.length > 0 ? (
        <SystemWindow title="Goal" meta={`[${completedCount}/${rows.length}]`}>
          <SystemWindowContent className="pt-4">
            <ul className="flex flex-col">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[15px]">{r.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    {r.value !== undefined && r.total !== undefined ? (
                      <Count value={r.value} total={`${r.total}${r.unit}`} mode={r.mode} />
                    ) : (
                      <span className="readout text-sm text-muted-foreground">[—]</span>
                    )}
                    {/*
                      A tickable habit has to look different from a tracked
                      one. Rendered side by side they were identical, so the
                      first thing a client would do is tap Steps and get
                      nothing — the box has a pressable border, the readout
                      does not, and the tap target is bigger than the 16px
                      cell inside it.
                    */}
                    {r.tickable ? (
                      <form action={toggleHabit} className="flex">
                        <input type="hidden" name="goalId" value={r.id} />
                        <button
                          type="submit"
                          aria-label={r.done ? `Undo ${r.label}` : `Mark ${r.label} done`}
                          aria-pressed={r.done}
                          className="-my-2 border border-border/70 p-2 transition-colors hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none"
                        >
                          <Cell on={r.done} />
                        </button>
                      </form>
                    ) : (
                      <Cell on={r.done} className="opacity-60" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </SystemWindowContent>
        </SystemWindow>
      ) : (
        <SystemWindow title="Goal">
          <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
            Your coach hasn’t set your daily habits yet.
          </SystemWindowContent>
        </SystemWindow>
      )}


      {/*
        The rotation card, for clients whose program was never deployed as a
        week.

        `todaysWorkout` is the old way of answering "what today is": step
        through the program's days by how long ago it was assigned. It has no
        concept of a weekday and no concept of a rest day, so on a four-day
        program it tells somebody to train seven days a week and drifts a day
        further out of step every week.

        When a deployed week exists, `scheduled` above already answered the
        question correctly, and rendering both put two different workouts on
        screen with two Start buttons — the wrong one styled `primary`, so the
        loud button was the one that opened Monday's session on a Tuesday.
        The deployed week wins whenever there is one.
      */}
      {!scheduled && (
        <SystemWindow
          title={todaysWorkout ? `Session ${String(todaysWorkout.dayOrder).padStart(2, '0')}` : 'Session'}
        >
          <SystemWindowContent className="flex items-center justify-between gap-4 pt-4">
            <div>
              {todaysWorkout ? (
                <>
                  <p className="text-base font-medium">{todaysWorkout.name}</p>
                  <p className="readout mt-1 text-[11px] uppercase text-muted-foreground">
                    {workoutDone ? 'Complete' : todaysLog ? 'In progress' : 'Not started'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-medium">No workout assigned yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your coach will add your program soon.
                  </p>
                </>
              )}
            </div>
            {todaysWorkout ? (
              <Link href={`/workouts/${todaysWorkout.id}`}>
                <Button variant={workoutDone ? 'outline' : 'primary'} size="sm">
                  {workoutDone ? 'View' : todaysLog ? 'Continue' : 'Start'}
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Start
              </Button>
            )}
          </SystemWindowContent>
        </SystemWindow>
      )}

      {/* Nutrition */}
      <Link href="/nutrition">
        <SystemWindow title="Nutrition" interactive>
          <SystemWindowContent className="flex flex-col gap-4 pt-4">
            {target ? (
              <>
                {/*
                  Two rings and four bars, not six of the same thing.

                  Calories and protein are the two numbers this client is
                  actually coached on, so they get the shape that answers "am I
                  close" before anything is read. Carbs, fat, steps and the
                  session are the supporting cast: a row of bars compares them
                  against each other at a glance, which a row of circles can't
                  do and doesn't need to.

                  Every one carries its own colour, label and figure. The
                  colour is what lets you find the one that's behind; the label
                  is what tells you which it is, so nothing depends on telling
                  two hues apart. And every fill is guarded against a zero
                  target — `eaten / 0` is Infinity, and Math.min(Infinity, 100)
                  is a cheerful 100, which showed a FULL protein ring to
                  somebody with no protein target at all.
                */}
                <div className="flex items-start justify-center gap-8">
                  <ProgressRing metric="calories" value={caloriesEaten} target={target.calories} />
                  <ProgressRing
                    metric="protein"
                    value={proteinEaten}
                    target={Math.round(Number(target.protein))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-4">
                  <ProgressBar
                    metric="carbs"
                    value={carbsEaten}
                    target={Math.round(Number(target.carbs))}
                  />
                  <ProgressBar
                    metric="fat"
                    value={fatEaten}
                    target={Math.round(Number(target.fat))}
                  />
                  <ProgressBar metric="steps" value={stepLog?.steps ?? 0} target={stepGoal} />
                  <ProgressBar
                    metric="workout"
                    value={workoutDone ? 1 : 0}
                    target={hasSessionToday ? 1 : null}
                    label={hasSessionToday ? 'Workout' : 'Rest day'}
                    done="Nothing to hit"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your coach hasn’t set your targets yet.</p>
            )}
          </SystemWindowContent>
        </SystemWindow>
      </Link>

      {/* Steps + weight sit side by side — both are single figures, not
          progressions, so they read as a readout pair rather than two cards. */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2">
        {/*
          The steps entry itself, not a button that did nothing.

          This card used to render a ghost button with no onClick, no form and
          no href — the only step-logging affordance most clients ever saw, and
          it was inert. The real form lived in a separate window that only
          appeared once a coach had set a steps habit, so a client without one
          could never log a step at all.
        */}
        <Card>
          <CardContent className="pt-5">
            <p className="readout text-[10px] uppercase text-muted-foreground">Steps</p>
            <p className="readout mt-2 text-xl text-accent glow-soft">
              {stepLog ? stepLog.steps.toLocaleString() : '—'}
            </p>
            {stepsHabit?.targetValue && (
              <p className="readout mt-0.5 text-[10px] uppercase text-muted-foreground">
                of {Number(stepsHabit.targetValue).toLocaleString()}
              </p>
            )}
            <form action={logSteps} className="mt-3 flex items-center gap-1.5">
              <input
                type="number"
                name="steps"
                min="0"
                step="1"
                inputMode="numeric"
                defaultValue={stepLog?.steps ?? undefined}
                placeholder="Today"
                aria-label="Today's step count"
                className="readout h-9 w-full min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none"
              />
              <button
                type="submit"
                aria-label="Save step count"
                className="readout h-9 shrink-0 border border-border px-2 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
              >
                Save
              </button>
            </form>
          </CardContent>
        </Card>

        <Link href="/progress">
          <Card interactive className="h-full">
            <CardContent className="pt-5">
              <p className="readout text-[10px] uppercase text-muted-foreground">Weight</p>
              <p className="readout mt-2 text-xl text-accent glow-soft">
                {latestWeight ? `${Number(latestWeight.weight).toFixed(1)}` : '—'}
                {latestWeight && <span className="ml-1 text-xs text-muted-foreground">lb</span>}
              </p>
              <span className="readout mt-3 flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                {weighedInToday ? 'Progress' : 'Weigh in'}
                <ChevronRight size={12} />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Message preview */}
      <Link href="/messages">
        <Card interactive>
          <CardContent className="flex items-center justify-between pt-5">
            <div className="flex items-center gap-3">
              <MessageCircle size={18} className="shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {latestMessage
                    ? `Message from ${latestMessage.sender.profile?.fullName ?? 'your coach'}`
                    : 'Messages'}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {latestMessage ? latestMessage.body ?? 'Sent an attachment' : 'No messages yet'}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

    </div>
  );
}
