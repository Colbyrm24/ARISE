import { prisma } from '@/lib/prisma';
import { longestRun, type AchievementStats } from '@/lib/achievements';

/*
  Gathering the numbers the badges are made of.

  Split from achievements.ts because that module has to stay loadable in a
  bare node test, and anything importing Prisma is not. The catalogue and the
  ordering are the parts worth pinning down in a test; this is the part that
  just fetches.
*/

/** Everything the badge board needs, in one pass. */
export async function achievementStatsFor(
  clientId: string,
  today: Date
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

  const key = (d: Date) => d.toISOString().slice(0, 10);

  /*
    A day counts as active if anything happened on it — same definition the
    leaderboard uses, so a client cannot be told they are consistent on one
    screen and not on the other.
  */
  const activeDays = new Set<string>();
  for (const w of workouts) activeDays.add(key(w.startedAt));
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
