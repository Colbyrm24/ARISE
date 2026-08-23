import { prisma } from '@/lib/prisma';
import { dayOf, flagFor, type DayContext } from '@/lib/day-shape';

/*
  What the day looks like around one meal.

  The meals queue used to show a plate on its own, which is not how the job
  actually works. Read back any real reply a coach sends and the meal is
  rarely the subject of it:

    "youre closing the day right around 1550 with 150g protein"
    "551 left and only 24g of protein to go, thats an easy close"
    "the fat is already almost a full day so keep dinner light on that side"
    "were those two meals all you had my guy??"

  Every one of those needs the day, not the plate. Without it the coach reads
  the number off the card, then opens the client's profile to find out whether
  the number is good — and once he's doing that, the queue is slower than the
  text thread it replaced.

  So the queue carries the day with each meal: totals so far, the target, what
  is left, and the one thing worth saying about it.
*/

export { dayOf, withMealAdjusted } from '@/lib/day-shape';
export type { DayContext, DayFlag } from '@/lib/day-shape';

function n(v: unknown): number {
  return Math.round(Number(v ?? 0));
}

/**
 * Day context for a batch of meals, in two queries rather than two per meal.
 *
 * The queue renders up to forty cards. Asking per card would be eighty round
 * trips on a page that has to feel instant, and this runs on every load of
 * the busiest screen in the product.
 *
 * Keyed by `${clientId}|${ISO date}` so a client with meals on two dates in
 * the same queue — an overnight shift worker, or a coach catching up — gets
 * the right day on each card instead of both cards sharing one total.
 */
export async function getDayContexts(
  pairs: Array<{ clientId: string; date: Date }>
): Promise<Map<string, DayContext>> {
  const out = new Map<string, DayContext>();
  if (pairs.length === 0) return out;

  const clientIds = [...new Set(pairs.map((p) => p.clientId))];
  const dates = [...new Set(pairs.map((p) => dayOf(p.date).getTime()))].map((t) => new Date(t));

  const [logs, targets] = await Promise.all([
    prisma.nutritionLog.groupBy({
      by: ['clientId', 'date'],
      where: { clientId: { in: clientIds }, date: { in: dates } },
      _sum: { calories: true, protein: true, carbs: true, fat: true },
      _count: { _all: true },
    }),
    /*
      Every target row for these clients, newest first, so the effective one
      for any date can be picked in memory. Cheap — targets change a handful
      of times over a coaching relationship, not daily.
    */
    prisma.nutritionTarget.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: { effectiveDate: 'desc' },
    }),
  ]);

  const byPair = new Map<string, (typeof logs)[number]>(
    logs.map((l) => [`${l.clientId}|${dayOf(l.date).toISOString()}`, l])
  );

  for (const { clientId, date } of pairs) {
    const day = dayOf(date);
    const key = `${clientId}|${day.toISOString()}`;
    if (out.has(key)) continue;

    const row = byPair.get(key);
    const total = {
      calories: n(row?._sum.calories),
      protein: n(row?._sum.protein),
      carbs: n(row?._sum.carbs),
      fat: n(row?._sum.fat),
    };

    // The newest target that had taken effect by this date — not simply the
    // newest, or a target set today would rewrite the judgment on last week's
    // meals every time the coach adjusted somebody's numbers.
    const t = targets.find((x) => x.clientId === clientId && dayOf(x.effectiveDate) <= day);
    const target = t
      ? { calories: t.calories, protein: n(t.protein), carbs: n(t.carbs), fat: n(t.fat) }
      : null;

    out.set(key, {
      ...total,
      meals: row?._count._all ?? 0,
      target,
      left: target
        ? {
            calories: target.calories - total.calories,
            protein: target.protein - total.protein,
            fat: target.fat - total.fat,
          }
        : null,
      flag: flagFor(total, target),
    });
  }

  return out;
}

/** Single-meal convenience. Same two queries, one pair. */
export async function getDayContext(clientId: string, date: Date): Promise<DayContext | null> {
  const map = await getDayContexts([{ clientId, date }]);
  return map.get(`${clientId}|${dayOf(date).toISOString()}`) ?? null;
}
