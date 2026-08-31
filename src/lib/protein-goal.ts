import { prisma } from '@/lib/prisma';
import { parseTarget } from '@/lib/habits';
import { notifyCoach, displayName } from '@/lib/notifications';
import { proteinHitBody } from '@/lib/activity';

/*
  Reaching the protein goal, recorded once.

  Two things were missing and they turn out to be the same thing. The coach
  was never told a client hit protein — the notification path existed with no
  caller. And the completion was never written down: the Today screen decided
  "done" by comparing today's number against the target at render time, so
  nothing persisted, and streakFrom — which reads DailyGoalLog rows — could
  never see a protein day. A client could hit protein thirty days running and
  their streak stayed zero.

  Writing the row fixes both, and the unique index on (dailyGoalId, date) is
  what keeps the announcement to one a day. Every meal logged after the one
  that crossed the line finds the row already there and says nothing. That is
  the database refereeing rather than a re-read deciding, which matters here
  because a client logging two meals quickly is exactly when both would pass
  the same check.
*/

/**
 * Call after anything that changes today's eating. Silent unless this is the
 * moment the goal was reached.
 *
 * Never throws: a meal that was saved must not fail because the coach's
 * notification did.
 */
export async function recordProteinGoal(clientId: string, date: Date) {
  try {
    const goal = await prisma.dailyGoal.findFirst({
      where: { clientId, goalType: 'protein', active: true },
      select: { id: true, targetValue: true },
    });
    if (!goal) return;

    const [target, logs] = await Promise.all([
      prisma.nutritionTarget.findFirst({
        where: { clientId, effectiveDate: { lte: date } },
        orderBy: { effectiveDate: 'desc' },
        select: { protein: true },
      }),
      prisma.nutritionLog.findMany({
        where: { clientId, date },
        select: { protein: true },
      }),
    ]);

    // The coach's nutrition target wins over the text typed on the habit,
    // same precedence the Today screen uses — otherwise the row could tick
    // against one number while the screen shows another.
    const goalGrams = target ? Number(target.protein) : parseTarget(goal.targetValue);
    if (!goalGrams || goalGrams <= 0) return;

    const eaten = logs.reduce((sum, l) => sum + Number(l.protein), 0);
    if (eaten < goalGrams) return;

    /*
      Insert, don't upsert. A plain create throwing on the unique index is the
      whole dedupe: whoever gets there first announces, everyone after is a
      no-op. An upsert would succeed every time and re-announce all day.
    */
    await prisma.dailyGoalLog.create({
      data: { clientId, dailyGoalId: goal.id, date, completed: true, autoCompleted: true },
    });

    const name = await displayName(clientId);
    await notifyCoach(clientId, 'activity', proteinHitBody(name, eaten, goalGrams));
  } catch {
    // Already recorded (the unique index did its job), or the notification
    // failed. Neither is worth failing the meal that was just logged.
  }
}
