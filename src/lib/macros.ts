/*
  Turning a calorie number into a plate.

  The coach sets calories. Everything else on that card was four boxes he had
  to do arithmetic for, every time, for every client — and arithmetic typed
  into a form at 9pm is arithmetic that eventually goes in wrong. The split
  below is the one he was doing in his head anyway, so the form does it.

  30 / 40 / 30 by calories, which is the ordinary balanced split: enough
  protein to hold muscle through a deficit, carbs as the largest share
  because that is what training runs on, and the rest as fat. It is a
  starting point, not a prescription — every field stays editable, and
  changing any macro by hand sticks until the calorie number moves again.
*/

/** Share of total calories each macro takes. Must sum to 1. */
const SPLIT = { protein: 0.3, carbs: 0.4, fat: 0.3 } as const;

/** Calories per gram. Protein and carbs are 4, fat is 9. */
const PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export type Macros = { protein: number; carbs: number; fat: number };

/**
 * The balanced macro split for a calorie target, in whole grams.
 *
 * Null for anything that is not a real target — empty, zero, negative, or
 * unreadable — because the caller's job in that case is to leave the fields
 * alone rather than to fill them with zeros. A coach half way through typing
 * "2" of "2400" should not watch three boxes fill with nonsense.
 */
export function balancedMacros(calories: number): Macros | null {
  if (!Number.isFinite(calories) || calories <= 0) return null;

  return {
    protein: Math.round((calories * SPLIT.protein) / PER_GRAM.protein),
    carbs: Math.round((calories * SPLIT.carbs) / PER_GRAM.carbs),
    fat: Math.round((calories * SPLIT.fat) / PER_GRAM.fat),
  };
}
