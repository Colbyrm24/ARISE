import { dayIn, todayIn } from '@/lib/day';

/*
  Reading what a phone posted, with no database in sight.

  Split out of health-token.ts for the same reason day-shape and waiting-shape
  are split from their query shells: that module imports Prisma, and anything
  importing Prisma cannot be loaded in a test without a generated client. This
  half is pure, and it is the half where the bugs live — deciding which day a
  reading belongs to is fiddly enough to be worth pinning down.
*/

/**
 * Validates one posted reading.
 *
 * Health exports are messy: they send strings for numbers, they send zero for
 * a day that hasn't happened, and they retry. Anything that doesn't parse is
 * dropped rather than stored, because a bad number in a weight chart is worse
 * than a missing one.
 */
/**
 * A day's eating, as a phone reported it.
 *
 * Calories are required and the three macros are not, which is deliberate.
 * NutritionLog.calories is a non-null column and calories are the number the
 * day is judged on, so a row without them would be a row that makes the
 * headline lie. Deriving them from partial macros (4/4/9 over whatever
 * happened to be enabled in the export) would be worse than useless: somebody
 * exporting protein alone would see a 700-calorie day.
 *
 * So a nutrition payload missing calories is refused with a sentence saying
 * so, and the fix is one toggle in their export settings.
 */
export type HealthNutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** breakfast | lunch | dinner | snack, or null for a whole-day total. */
  meal: string | null;
};

export type HealthReading = {
  date: Date;
  steps?: number;
  weight?: number;
  nutrition?: HealthNutrition;
};

/*
  Nobody agrees what these fields are called.

  MyFitnessPal writes meal totals into Apple Health; Health Auto Export reads
  them back out under HealthKit's own identifiers, an iOS Shortcut names them
  whatever the person building it typed, and both get rewritten between app
  versions. Rather than pick one spelling and let a working export post
  silently-ignored numbers, every plausible name for a quantity maps onto it.

  Order matters only in that the first key present wins, so the plainest name
  is listed first.
*/
const ALIASES = {
  calories: ['calories', 'dietaryEnergy', 'dietary_energy', 'energy', 'dietary_energy_consumed'],
  protein: ['protein', 'dietaryProtein', 'dietary_protein'],
  carbs: [
    'carbs',
    'carbohydrates',
    'dietaryCarbohydrates',
    'dietary_carbohydrates',
    'carbohydrate',
  ],
  fat: ['fat', 'totalFat', 'total_fat', 'dietaryFatTotal', 'dietary_fat_total'],
} as const;

/** The first alias actually present, as a number, or NaN if none is. */
function pick(b: Record<string, unknown>, names: readonly string[]): number {
  for (const name of names) {
    if (b[name] === undefined || b[name] === null || b[name] === '') continue;
    return Number(b[name]);
  }
  return NaN;
}

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Reads the eating half of a payload.
 *
 * Exported for its own tests — the date logic above and the number validation
 * here fail in completely different ways and are easier to pin down apart.
 */
export function parseHealthNutrition(b: Record<string, unknown>): HealthNutrition | null {
  const calories = pick(b, ALIASES.calories);

  /*
    Zero is not a day of eating, it is an export that fired at 4am. Storing it
    would overwrite yesterday's real total through the same-day update, which
    is exactly the bug the steps field already learned the hard way.
  */
  if (!Number.isFinite(calories) || calories <= 0 || calories > 20000) return null;

  // A macro that is absent, unparseable or absurd counts as zero rather than
  // rejecting the row: a calorie total with no protein figure is still a
  // calorie total, and it is better on the screen than missing.
  const macro = (names: readonly string[]) => {
    const n = pick(b, names);
    if (!Number.isFinite(n) || n < 0 || n > 2000) return 0;
    return Math.round(n * 100) / 100;
  };

  const rawMeal = typeof b.meal === 'string' ? b.meal.trim().toLowerCase() : '';

  return {
    calories: Math.round(calories),
    protein: macro(ALIASES.protein),
    carbs: macro(ALIASES.carbs),
    fat: macro(ALIASES.fat),
    meal: MEAL_SLOTS.includes(rawMeal) ? rawMeal : null,
  };
}

export function parseHealthPayload(
  body: unknown,
  /** The client's zone, so an undated post lands on the day they just lived. */
  tz?: string | null
): HealthReading | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const raw = typeof b.date === 'string' ? b.date.trim() : '';

  /*
    Two separate date bugs lived on this line, and the shortcut that posts
    here runs late at night, which is exactly when both bite.

    A bare "2026-08-25" parses as UTC midnight, and the old
    `date.setHours(0,0,0,0)` then re-applied *local* midnight on top — a
    no-op on a UTC server, but a silent one-day shift on any other, against
    a `@db.Date` column. A date-only string is already a calendar date and
    must be taken literally, never re-zoned.

    With no date at all the old code took server-local midnight, so a
    shortcut firing at 11pm in Los Angeles filed the day's steps against
    tomorrow: the client's Today screen read zero all day and yesterday's
    count appeared at 5pm.
  */
  let date: Date;
  /*
    Three shapes, and only one of them is an instant.

    A bare "2026-08-25", and equally "2026-08-25T03:14:00" with no offset, are
    both WALL TIME — the phone's own clock, already in the client's zone. The
    date is right there and must be taken literally. Running either through
    `new Date()` and then a timezone is a double conversion: JS reads a
    zone-less datetime as server-local (UTC on Vercel), and shifting that into
    New York moves anything before 04:00 back a day. Health Auto Export and
    Shortcuts both emit exactly this form, from a shortcut that tends to fire
    late at night — so every such post would have been filed a day early and
    overwritten the previous day's real count through the clientId_date
    upsert.

    Only a string carrying `Z` or an explicit ±HH:MM names a real moment, and
    only that one gets resolved through the client's zone.
  */
  const wall = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+)?$/.exec(raw);
  if (wall) {
    const [, y, m, d] = wall;
    date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  } else if (raw) {
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    date = dayIn(at, tz);
  } else {
    date = todayIn(tz);
  }
  if (Number.isNaN(date.getTime())) return null;
  // A literal date can still be nonsense ("2026-13-45" parses to next year).
  if (date.getUTCFullYear() < 2020 || date.getUTCFullYear() > 2100) return null;

  // More than a day in the future is a clock problem, not a reading.
  if (date.getTime() > Date.now() + 86400000) return null;

  const out: HealthReading = { date };

  const steps = Number(b.steps);
  // Zero steps is almost always an export firing before the day started, and
  // storing it would overwrite a real count from the same day.
  if (Number.isFinite(steps) && steps > 0 && steps <= 200000) out.steps = Math.round(steps);

  const weight = Number(b.weight);
  // Wide enough for kg or lbs, narrow enough to reject a stray sensor value.
  if (Number.isFinite(weight) && weight >= 20 && weight <= 700) {
    out.weight = Math.round(weight * 100) / 100;
  }

  const nutrition = parseHealthNutrition(b);
  if (nutrition) out.nutrition = nutrition;

  if (out.steps === undefined && out.weight === undefined && out.nutrition === undefined) {
    return null;
  }
  return out;
}
