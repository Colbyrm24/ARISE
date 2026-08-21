import Link from 'next/link';
import { ChevronRight, MessageCircle, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  SystemWindow,
  SystemWindowContent,
  Count,
  Cell,
} from '@/components/ui/system-window';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Time-aware greeting. It said "Good morning" at 11pm before. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const GOAL_LABELS: Record<string, string> = {
  workout: 'Workout',
  steps: 'Steps',
  protein: 'Protein',
  calories: 'Calories',
  water: 'Water',
  sleep: 'Sleep',
  photo: 'Progress photo',
};

export default async function TodayPage() {
  const user = await getCurrentUser();
  const firstName = user?.profile?.fullName?.split(' ')[0] ?? 'there';
  const today = todayDateOnly();

  // Everything below reads real data where the feature already exists.
  // Where the feature is later in the roadmap (water, etc.), this shows
  // an honest empty state instead of pretending.
  const [
    goals,
    goalLogs,
    target,
    nutritionLogs,
    stepLog,
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
    : [[], [], null, [], null, null, null, null];

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
    const label = GOAL_LABELS[goal.goalType] ?? goal.targetValue ?? 'Goal';
    let value: number | undefined;
    let total: number | undefined;
    let unit = '';

    if (goal.goalType === 'steps') {
      value = stepLog?.steps ?? 0;
      total = Number(goal.targetValue) || undefined;
    } else if (goal.goalType === 'protein') {
      value = proteinEaten;
      total = target ? Math.round(Number(target.protein)) : Number(goal.targetValue) || undefined;
      unit = 'g';
    } else if (goal.goalType === 'calories') {
      value = caloriesEaten;
      total = target?.calories ?? (Number(goal.targetValue) || undefined);
    } else if (goal.goalType === 'workout') {
      value = workoutDone ? 1 : 0;
      total = 1;
    }

    const hit = value !== undefined && total !== undefined && value >= total;
    return { id: goal.id, label, value, total, unit, done: loggedDone.has(goal.id) || hit };
  });

  const completedCount = rows.filter((r) => r.done).length;

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
                  <span className="text-[15px]">{r.label}</span>
                  <span className="flex items-center gap-3">
                    {r.value !== undefined && r.total !== undefined ? (
                      <Count value={r.value} total={`${r.total}${r.unit}`} />
                    ) : (
                      <span className="readout text-sm text-muted-foreground">[—]</span>
                    )}
                    <Cell on={r.done} />
                  </span>
                </li>
              ))}
            </ul>
          </SystemWindowContent>
        </SystemWindow>
      ) : (
        <SystemWindow title="Goal">
          <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
            Your coach hasn’t set your daily goals yet.
          </SystemWindowContent>
        </SystemWindow>
      )}

      {/* Today's workout */}
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
        <Card>
          <CardContent className="pt-5">
            <p className="readout text-[10px] uppercase text-muted-foreground">Steps</p>
            <p className="readout mt-2 text-xl text-accent glow-soft">
              {stepLog ? stepLog.steps.toLocaleString() : '0'}
            </p>
            <Button variant="ghost" size="sm" className="mt-3 -ml-4">
              Log steps
            </Button>
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
