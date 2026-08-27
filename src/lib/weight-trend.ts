import { daysAgoIn } from '@/lib/day';

/*
  Week-over-week weight, in one place.

  This was written twice — once on the client's own progress page and once on
  the coach's card — with the same off-by-one in both copies:

      const cut     = daysAgo(7).getTime();
      const prevCut = daysAgo(14).getTime();
      const recent  = points.filter((p) => p.date.getTime() >= cut);
      const prior   = points.filter((p) => p.date.getTime() >= prevCut && ... < cut);

  `recent` has no upper bound, so it runs day −7 through today: EIGHT days.
  `prior` is a half-open [−14, −7): seven. Comparing an 8-day mean to a 7-day
  mean shifts the windows' midpoints 7.5 days apart instead of 7, and the
  reported change comes out consistently large. A client losing a steady
  0.2 lb/day reads as −1.5 lb against a true −1.4.

  It's a small error and it's the number the client looks at first every
  week, which is a bad combination — steady loss reported slightly fast is
  exactly the shape that makes someone distrust the scale, or the coach.

  Both windows are now seven days, seven days apart, and computed in the
  client's own timezone so an evening weigh-in falls in the week it belongs to.
*/

export type WeightPoint = { date: Date; weight: number };

/** Mean, or null on an empty set — never NaN reaching a screen. */
function mean(points: WeightPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((s, p) => s + p.weight, 0) / points.length;
}

export type WeekOverWeek = {
  /** Signed lb change, or null when either week has no weigh-in. */
  change: number | null;
  recentCount: number;
  priorCount: number;
};

/**
 * Mean of days −6..0 against mean of days −13..−7.
 *
 * Inclusive of today at the top: a weigh-in this morning is part of this
 * week, and excluding it would mean the number never reflects the morning
 * the client is actually looking at it.
 */
export function weekOverWeek(
  points: WeightPoint[],
  tz: string | null | undefined,
  now: Date = new Date()
): WeekOverWeek {
  const recentFrom = daysAgoIn(6, tz, now).getTime();
  const priorFrom = daysAgoIn(13, tz, now).getTime();

  const recent = points.filter((p) => p.date.getTime() >= recentFrom);
  const prior = points.filter(
    (p) => p.date.getTime() >= priorFrom && p.date.getTime() < recentFrom
  );

  const a = mean(recent);
  const b = mean(prior);

  return {
    change: a !== null && b !== null ? a - b : null,
    recentCount: recent.length,
    priorCount: prior.length,
  };
}
