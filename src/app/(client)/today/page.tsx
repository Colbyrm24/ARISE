import Link from 'next/link';
import { ChevronRight, MessageCircle, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Button } from '@/components/ui/button';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  const completedCount = goalLogs.filter((g) => g.completed).length;
  const totalGoals = goals.length;
  const ringProgress = totalGoals > 0 ? completedCount / totalGoals : 0;

  const caloriesEaten = nutritionLogs.reduce((sum, l) => sum + l.calories, 0);
  const proteinEaten = nutritionLogs.reduce((sum, l) => sum + Number(l.protein), 0);

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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Good morning, {firstName}.</h1>
          {unreadUpdates > 0 && (
            <Link
              href="/notifications"
              className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {unreadUpdates} new
            </Link>
          )}
        </div>
      </header>

      {/* Daily progress ring */}
      <Card>
        <CardContent className="flex items-center gap-5 pt-6">
          <ProgressRing progress={ringProgress} size={84} strokeWidth={7}>
            <span className="text-lg font-semibold">
              {totalGoals > 0 ? `${completedCount}/${totalGoals}` : '—'}
            </span>
          </ProgressRing>
          <div>
            <p className="text-sm font-medium">Daily Progress</p>
            <p className="text-sm text-muted-foreground">
              {totalGoals > 0
                ? `${completedCount} of ${totalGoals} goals complete`
                : 'Your coach hasn’t set your daily goals yet.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Today's workout */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workout</p>
            {todaysWorkout ? (
              <>
                <p className="mt-1 text-base font-medium">{todaysWorkout.name}</p>
                <p className="text-sm text-muted-foreground">
                  {todaysLog?.completedAt ? 'Completed today' : `Day ${todaysWorkout.dayOrder}`}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-base font-medium">No workout assigned yet</p>
                <p className="text-sm text-muted-foreground">Your coach will add your program soon.</p>
              </>
            )}
          </div>
          {todaysWorkout ? (
            <Link href={`/workouts/${todaysWorkout.id}`}>
              <Button variant="outline" size="sm">
                {todaysLog?.completedAt ? 'View' : todaysLog ? 'Continue' : 'Start'}
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Start
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Nutrition */}
      <Link href="/nutrition">
              <Card className="transition-colors hover:bg-secondary/40">
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nutrition</p>
          {target ? (
            <>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Calories</span>
                  <span className="text-muted-foreground">
                    {caloriesEaten} / {target.calories}
                  </span>
                </div>
                <Progress value={Math.min((caloriesEaten / target.calories) * 100, 100)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Protein</span>
                  <span className="text-muted-foreground">
                    {proteinEaten}g / {Number(target.protein)}g
                  </span>
                </div>
                <Progress value={Math.min((proteinEaten / Number(target.protein)) * 100, 100)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your coach hasn’t set your targets yet.</p>
          )}
        </CardContent>
      </Card>
      </Link>

      {/* Steps */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steps</p>
            <p className="mt-1 text-base font-medium">{stepLog ? stepLog.steps.toLocaleString() : '0'}</p>
          </div>
          <Button variant="outline" size="sm">
            Log Steps
          </Button>
        </CardContent>
      </Card>

      {/* Weight */}
      <Link href="/progress">
        <Card className="transition-colors hover:bg-secondary/40">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Weight
              </p>
              <p className="mt-1 text-base font-medium">
                {latestWeight ? `${Number(latestWeight.weight).toFixed(1)} lb` : 'Not logged yet'}
              </p>
            </div>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              {weighedInToday ? 'Progress' : 'Weigh in'}
              <ChevronRight size={16} />
            </span>
          </CardContent>
        </Card>
      </Link>

      {/* Message preview */}
      <Link href="/messages">
        <Card className="transition-colors hover:bg-secondary/40">
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex items-center gap-3">
              <MessageCircle size={20} className="text-accent" />
              <div>
                <p className="text-sm font-medium">
                  {latestMessage ? `Message from ${latestMessage.sender.profile?.fullName ?? 'your coach'}` : 'Messages'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {latestMessage ? latestMessage.body ?? 'Sent an attachment' : 'No messages yet'}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {/* AI Coach */}
      <Link href="/ai">
        <Card className="border-accent/30 bg-accent/5 transition-colors hover:bg-accent/10">
          <CardContent className="flex items-center gap-3 pt-6">
            <Sparkles size={20} className="text-accent" />
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
