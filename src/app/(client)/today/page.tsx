import Link from 'next/link';
import { ChevronRight, MessageCircle, Sparkles } from 'lucide-react';
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
import { scheduledToday } from '@/lib/program-deploy';
import { LocalTime } from '@/components/local-time';
import { toggleHabit, logSteps } from './actions';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

/** Time-aware greeting. It said "Good morning" at 11pm before. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function TodayPage() {
  const user = await requireEntitledClient();
  const firstName = user?.profile?.fullName?.split(' ')[0] ?? 'there';
  const today = todayDateOnly();

  // What the program says today is. Null when nobody has deployed one yet,
  // in which case this whole block stays off the screen rather than showing
  // an empty shell.
  const scheduled = user ? await scheduledToday(user.id) : null;

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
        prisma.dailyGoalLog.findMany({ where: { clientId: user.id, date: today } }),
        prisma.nutritionTarget.findFirst({
          where: { clientId: user.id, effectiveDate: { lte: today } },
          orderBy: { effectiveDate: 'desc' },
        }),
        prisma.nutritionLog.findMany({ where: { clientId: user.id, date: today } }),
        prisma.stepLog.findUnique({ where: { clientId_date: { clientId: user.id, date: today } } }),
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

  const weighedInToday = latestWeight ? latestWeight.date.getTime() === today.getTime() : false;

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
          where: { clientId: user.id, workoutId: todaysWorkout.id, startedAt: { gte: today } },
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
      // Only manual habits get a checkbox. A tracked one completes off the
      // number the app already holds, and letting it be hand-ticked would
      // mean protein could read done on a day someone ate 40g.
      tickable: !isTracked(goal.goalType),
    };
  });

  const completedCount = rows.filter((r) => r.done).length;
  const stepsHabit = goals.find((g) => g.goalType === 'steps') ?? null;
  const nextCall = upcomingCalls[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {greeting()}, {firstName}.
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

      {/*
        What the program says today is.

        Above everything else because it is the answer to the question the
        client opened the app to ask. A rest day gets the same billing as a
        session — being told plainly to rest is the instruction, not the
        absence of one.
      */}
      {scheduled && (
        <SystemWindow
          title={scheduled.kind === 'rest' ? 'Rest day' : "Today's session"}
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
          </SystemWindowContent>
        </SystemWindow>
      )}

      {/*
        The next call, if there is one. Everything else on this screen is
        something you can do any time today; a call is the only thing with a
        time attached, so it sits above the rest.
      */}
      {nextCall && (
        <SystemWindow title="Next call" plain>
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
                <div>
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span>Calories</span>
                    <Count value={caloriesEaten} total={target.calories} />
                  </div>
                  <Progress value={Math.min((caloriesEaten / target.calories) * 100, 100)} />
                </div>
                <div>
                  <div className="mb-2 flex items-baseline justify-between text-sm">
                    <span>Protein</span>
                    <Count
                      value={proteinEaten}
                      total={`${Math.round(Number(target.protein))}g`}
                    />
                  </div>
                  <Progress
                    value={Math.min((proteinEaten / Number(target.protein)) * 100, 100)}
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
      <div className="grid grid-cols-2 gap-4">
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

      {/* AI Coach */}
      <Link href="/ai">
        <Card interactive className="border-accent/30 bg-accent/[0.06]">
          <CardContent className="flex items-center gap-3 pt-5">
            <Sparkles size={18} className="text-accent" />
            <div>
              <p className="text-sm font-medium">AI Coach</p>
              <p className="text-sm text-muted-foreground">Ask me anything</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
