import { prisma } from '@/lib/prisma';
import { signMealPhotoUrls } from '@/lib/meal-photos';
import type { MealEstimate, EstimateItem } from '@/lib/meal-estimate';

/*
  The coach's side of photo logging.

  The point of this queue is that it is faster than a text thread, and the
  only way it stays faster is by putting everything needed for one decision in
  one row: the photo, what was read off it, the portion assumed for each item,
  and the numbers. If the coach has to open a client's profile to judge a
  plate, the queue has failed and he'll go back to Messages.

  A read the coach agrees with should cost one tap. That's the whole design
  budget.
*/

export type PendingMeal = {
  id: string;
  clientId: string;
  clientName: string;
  initials: string;
  loggedAt: Date;
  meal: string | null;
  name: string;
  photoUrl: string | null;
  /** Null for a failed read, which still shows up so the photo isn't stranded. */
  estimate: MealEstimate | null;
  failure: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Parses the stored estimate blob back into something typed.
 *
 * The column is Json, so nothing guarantees its shape — an older row written
 * before a field existed is a normal occurrence, not a bug. Anything that
 * doesn't parse degrades to a failed read rather than throwing, because one
 * malformed row must not take down the whole queue.
 */
function parseEstimate(value: unknown): { estimate: MealEstimate | null; failure: string | null } {
  if (!value || typeof value !== 'object') return { estimate: null, failure: null };
  const v = value as Record<string, unknown>;

  if (typeof v.failed === 'string') {
    return { estimate: null, failure: typeof v.message === 'string' ? v.message : 'Read failed.' };
  }
  if (!Array.isArray(v.items)) return { estimate: null, failure: null };

  const items: EstimateItem[] = v.items
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object')
    .map((i) => ({
      name: String(i.name ?? ''),
      portion: String(i.portion ?? ''),
      calories: Number(i.calories ?? 0),
      protein: Number(i.protein ?? 0),
      carbs: Number(i.carbs ?? 0),
      fat: Number(i.fat ?? 0),
    }));

  return {
    estimate: {
      name: String(v.name ?? ''),
      items,
      calories: Number(v.calories ?? 0),
      protein: Number(v.protein ?? 0),
      carbs: Number(v.carbs ?? 0),
      fat: Number(v.fat ?? 0),
      confidence:
        v.confidence === 'high' || v.confidence === 'low'
          ? (v.confidence as 'high' | 'low')
          : 'medium',
      note: typeof v.note === 'string' && v.note ? v.note : null,
      adjusted: v.adjusted === true || undefined,
    },
    failure: null,
  };
}

/**
 * Everything waiting on the coach, oldest first.
 *
 * Oldest first on purpose: a client who logged breakfast at 7am and is still
 * unanswered at 2pm is the one the queue exists for. Newest-first would keep
 * burying them under lunch.
 *
 * Not scoped by coach, matching getSegments() in console.ts — this is a
 * single-coach practice and Client.coachId is null on most rows, so filtering
 * on it today would show an empty queue.
 */
export async function getPendingMeals(limit = 40): Promise<PendingMeal[]> {
  const rows = await prisma.nutritionLog.findMany({
    where: { reviewState: { in: ['estimated', 'failed'] } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      client: { include: { user: { include: { profile: true } } } },
    },
  });
  if (rows.length === 0) return [];

  const urls = await signMealPhotoUrls(
    rows.map((r) => r.photoPath).filter((p): p is string => Boolean(p))
  );

  return rows.map((r) => {
    const fullName = r.client.user.profile?.fullName || r.client.user.email;
    const { estimate, failure } = parseEstimate(r.estimate);
    return {
      id: r.id,
      clientId: r.clientId,
      clientName: fullName,
      initials: initialsOf(fullName),
      loggedAt: r.createdAt,
      meal: r.meal,
      name: r.name || estimate?.name || 'Meal photo',
      photoUrl: r.photoPath ? urls.get(r.photoPath) ?? null : null,
      estimate,
      failure: failure ?? (r.reviewState === 'failed' ? 'Read failed.' : null),
      calories: r.calories,
      protein: Math.round(Number(r.protein)),
      carbs: Math.round(Number(r.carbs)),
      fat: Math.round(Number(r.fat)),
    };
  });
}

/** Badge count for the sidebar. Cheap enough to run on every coach page load. */
export async function countPendingMeals(): Promise<number> {
  return prisma.nutritionLog.count({ where: { reviewState: { in: ['estimated', 'failed'] } } });
}

/**
 * How far off the reads have been running, over the corrections made so far.
 *
 * Worth having because it's the only honest answer to "can I trust these".
 * A coach who can see that reads land within 6 percent stops checking every
 * one; a coach who can see they run 20 percent light knows to look harder at
 * the fat column. Both are more useful than a confidence label.
 */
export async function getReadAccuracy(): Promise<{
  corrected: number;
  confirmed: number;
  medianCalorieGapPct: number | null;
  direction: 'high' | 'low' | null;
} | null> {
  const [confirmed, corrections] = await Promise.all([
    prisma.nutritionLog.count({ where: { reviewState: 'confirmed' } }),
    prisma.nutritionLog.findMany({
      where: { reviewState: 'corrected' },
      select: { calories: true, estimate: true },
      orderBy: { reviewedAt: 'desc' },
      take: 200,
    }),
  ]);

  if (confirmed === 0 && corrections.length === 0) return null;

  const gaps: number[] = [];
  for (const row of corrections) {
    const { estimate } = parseEstimate(row.estimate);
    // Guard the divide: a corrected-to-zero row carries no ratio.
    if (!estimate || !row.calories) continue;
    gaps.push(((estimate.calories - row.calories) / row.calories) * 100);
  }

  if (gaps.length === 0) {
    return { corrected: corrections.length, confirmed, medianCalorieGapPct: null, direction: null };
  }

  // Median, not mean: one plate corrected from 900 to 200 would otherwise
  // define the whole number.
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;

  return {
    corrected: corrections.length,
    confirmed,
    medianCalorieGapPct: Math.round(Math.abs(median)),
    direction: median >= 0 ? 'high' : 'low',
  };
}
