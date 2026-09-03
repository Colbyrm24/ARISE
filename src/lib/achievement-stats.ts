import { prisma } from '@/lib/prisma';
import { longestRun, type AchievementStats } from '@/lib/achievements';
import { dayIn } from '@/lib/day';

/*
  Gathering the numbers the badges are made of.

  Split from achievements.ts because that module has to stay loadable in a
  bare node test, and anything importing Prisma is not. The catalogue and the
  ordering are the parts worth pinning down in a test; this is the part that
  just fetches.
*/

/**
 * Everything the badge board needs, in one pass.
 *
 * `tz` is the client's zone, and it is required rather than optional because
 * the one value in here that is a real instant cannot be turned into a
 * calendar day without it — see the note on `key` below.
 */
export async function achievementStatsFor(
  clientId: string,
  today: Date,
  tz: string | null | undefined
): Promise<AchievementStats> {
  const since30 = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29)
  );

  const [workouts, prSets, weights, photos, steps, cardio, goalLogs, proteinGoal] =
    await Promise.all([
      prisma.workoutLog.findMany({
        where: { clientId, completedAt: { not: null } },
        select: { startedAt: true },
      }),
      prisma.workoutLogSet.findMany({
        where: { isPr: true, workoutLog: { clientId } },
        select: { workoutSet: { select: { workoutExercise: { select: { exerciseId: true } } } } },
      }),
      // First and last only. The whole history would be hundreds of rows to
      // answer a question about two of them.
      prisma.weightLog.findMany({
        where: { clientId },
        orderBy: { date: 'asc' },
        select: { weight: true, date: true },
      }),
      prisma.progressPhoto.count({ where: { clientId } }),
      prisma.stepLog.findMany({
        where: { clientId, date: { gte: since30 } },
        select: { steps: true, date: true },
      }),
      prisma.cardioLog.findMany({ where: { clientId }, select: { date: true } }),
      prisma.dailyGoalLog.findMany({
        where: { clientId, completed: true },
        select: { date: true, dailyGoalId: true },
      }),
      prisma.dailyGoal.findFirst({
        where: { clientId, goalType: 'protein' },
        select: { id: true },
      }),
    ]);

  /*
    Four sources, and only three of them are the same kind of value.

    CardioLog.date, StepLog.date and DailyGoalLog.date are `@db.Date` — day
    labels, already the client's calendar day, and `toISOString().slice(0,10)`
    reads them back exactly. WorkoutLog.startedAt is a plain `DateTime`, a
    real instant, and the same call on that gives the UTC calendar day.

    So a client in Los Angeles who trained at 9pm Tuesday had the session
    filed under Wednesday while their steps for the same evening were filed
    under Tuesday — a hole punched in the streak on the day they actually
    trained, and a phantom active day next to it. longestRun walks these keys
    expecting consecutive days, so it broke a real streak and denied the
    consistency badge. It fired every evening for anybody west of UTC and
    every morning for anybody east of it.

    dayIn converts the instant to the client's calendar day first; the day
    labels are already in that shape and must not be passed through it a
    second time, which would shift them.
  */
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const instantKey = (d: Date) => key(dayIn(d, tz));

  /*
    A day counts as active if anything happened on it — same definition the
    leaderboard uses, so a client cannot be told they are consistent on one
    screen and not on the other.
  */
  const activeDays = new Set<string>();
  for (const w of workouts) activeDays.add(instantKey(w.startedAt));
  for (const c of cardio) activeDays.add(key(c.date));
  for (const s of steps) activeDays.add(key(s.date));
  for (const g of goalLogs) activeDays.add(key(g.date));

  const proteinDays = new Set(
    goalLogs.filter((g) => g.dailyGoalId === proteinGoal?.id).map((g) => key(g.date))
  );

  const first = weights[0];
  const last = weights[weights.length - 1];

  return {
    workouts: workouts.length,
    bestStreak: longestRun(activeDays),
    prs: prSets.length,
    liftsWithPr: new Set(
      prSets
        .map((s) => s.workoutSet?.workoutExercise?.exerciseId)
        .filter((id): id is string => Boolean(id))
    ).size,
    // One weigh-in is a starting point, not a change. Reporting a loss off a
    // single reading would hand somebody a badge for stepping on a scale.
    poundsDown: first && last && first !== last ? Number(first.weight) - Number(last.weight) : 0,
    photos,
    proteinStreak: longestRun(proteinDays),
    stepsLast30: steps.reduce((sum, s) => sum + s.steps, 0),
  };
}
