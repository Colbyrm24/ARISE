/*
  The shape of a day, with no database attached.

  Split out from day-totals.ts so the judgment — what counts as under-eaten,
  what the one thing worth saying is — can be exercised directly. These rules
  decide what a client reads in their thread, which makes them the part most
  worth being able to test without standing up Postgres.
*/

export type DayFlag =
  /** Barely eaten, with the day nearly over. The one that actually matters. */
  | 'under'
  /** Fat is spent but calories are not — the "keep dinner lean" line. */
  | 'fat_spent'
  /** Almost home, and what is left is easy to fill. */
  | 'easy_close'
  /** Over the ceiling. */
  | 'over'
  /** Protein behind where the calories are. */
  | 'protein_behind';

export type DayContext = {
  /** Totals for the whole date, including the meal being reviewed. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** How many things they logged that day. Drives "was that all you had?". */
  meals: number;
  /** Null when the coach hasn't set targets for this client yet. */
  target: { calories: number; protein: number; carbs: number; fat: number } | null;
  /** Target minus totals. Null without a target. Can go negative. */
  left: { calories: number; protein: number; fat: number } | null;
  flag: DayFlag | null;
};

/** Midnight UTC for a date, matching how NutritionLog.date is stored. */
export function dayOf(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Picks the one thing worth saying about the day.
 *
 * Deliberately returns at most one flag. A card that lights up three warnings
 * teaches the coach to read none of them, and the reply it feeds can only
 * carry one point anyway — real coaching texts are a number, one observation,
 * and a question.
 *
 * Order is by what changes the coach's answer most, not by severity: eating
 * almost nothing outranks a blown fat number, because one is a problem with
 * the day and the other is a note about dinner.
 */
export function flagFor(
  total: { calories: number; protein: number; fat: number },
  target: { calories: number; protein: number; fat: number } | null
): DayFlag | null {
  if (!target || target.calories <= 0) return null;

  const pct = total.calories / target.calories;
  const proteinPct = target.protein > 0 ? total.protein / target.protein : 1;

  // Under half the day's calories. Worth saying regardless of the hour: the
  // coach is reading this to decide what to tell them to eat next.
  if (pct < 0.5) return 'under';

  if (pct > 1.08) return 'over';

  // Fat is spent while calories still have room. This is the single most
  // common correction in a real thread — the plate was fine, the rest of the
  // day just has to avoid fat now.
  if (target.fat > 0 && total.fat >= target.fat * 0.9 && pct < 0.92) return 'fat_spent';

  // Calories are landing but protein is lagging badly behind them.
  if (pct >= 0.6 && proteinPct < pct - 0.25) return 'protein_behind';

  if (pct >= 0.75 && pct <= 1.08) return 'easy_close';

  return null;
}

type Macros = { calories: number; protein: number; carbs: number; fat: number };

/**
 * The same day with one meal's numbers swapped out.
 *
 * Needed because correcting a meal changes the day it sits in, and the reply
 * the coach is about to send quotes that day. Recomputing from the database
 * after the write would be a second round trip for arithmetic we can do here,
 * and would race with the write besides.
 *
 * Meal count is unchanged on purpose — a correction edits a plate, it doesn't
 * add or remove one.
 */
export function withMealAdjusted(
  day: DayContext,
  before: Macros,
  after: Macros
): DayContext {
  const total = {
    calories: day.calories - before.calories + after.calories,
    protein: day.protein - before.protein + after.protein,
    carbs: day.carbs - before.carbs + after.carbs,
    fat: day.fat - before.fat + after.fat,
  };

  return {
    ...total,
    meals: day.meals,
    target: day.target,
    left: day.target
      ? {
          calories: day.target.calories - total.calories,
          protein: day.target.protein - total.protein,
          fat: day.target.fat - total.fat,
        }
      : null,
    flag: flagFor(total, day.target),
  };
}
