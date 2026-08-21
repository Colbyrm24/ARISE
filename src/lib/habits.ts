/*
  Daily habits.

  The Today screen has always rendered these. What was missing was every way
  of putting one there — DailyGoal, DailyGoalLog and StepLog were read and
  never written, so the first thing a client saw on opening the app was "your
  coach hasn't set your daily goals yet", permanently, no matter what the
  coach did. This module is the shared vocabulary that the coach editor, the
  client's tick and the Today screen all agree on.

  The split that matters is tracked versus manual. A tracked habit already has
  a number somewhere in the app — steps, protein, calories, the workout — and
  ticking it by hand would let a client mark protein done on a day they ate
  40g. Those complete themselves off the real number. Manual habits are the
  ones nothing else can know about: water, sleep, sunlight, no alcohol. Those
  are the only ones with a checkbox.
*/

export type HabitType =
  | 'workout'
  | 'steps'
  | 'protein'
  | 'calories'
  | 'water'
  | 'sleep'
  | 'photo'
  | 'custom';

export const HABIT_TYPES: HabitType[] = [
  'workout',
  'steps',
  'protein',
  'calories',
  'water',
  'sleep',
  'photo',
  'custom',
];

/** Habits the app can measure on its own. These are never hand-ticked. */
export const TRACKED: ReadonlySet<HabitType> = new Set<HabitType>([
  'workout',
  'steps',
  'protein',
  'calories',
]);

export function isTracked(type: string) {
  return TRACKED.has(type as HabitType);
}

type HabitMeta = {
  label: string;
  /** Placeholder for the coach's target field, or null when it takes none. */
  targetHint: string | null;
  unit: string;
};

export const HABIT_META: Record<HabitType, HabitMeta> = {
  workout: { label: 'Train', targetHint: null, unit: '' },
  steps: { label: 'Steps', targetHint: '10000', unit: '' },
  protein: { label: 'Protein', targetHint: 'from target', unit: 'g' },
  calories: { label: 'Calories', targetHint: 'from target', unit: '' },
  water: { label: 'Water', targetHint: '1 gallon', unit: '' },
  sleep: { label: 'Sleep', targetHint: '7 hours', unit: '' },
  photo: { label: 'Progress photo', targetHint: null, unit: '' },
  custom: { label: 'Habit', targetHint: 'what to do', unit: '' },
};

/**
 * What a habit row is called on screen.
 *
 * A custom habit's target field holds its whole description — "no alcohol",
 * "10 min stretch" — so for that one the target IS the label. Everything else
 * has a fixed name and uses the target as a number.
 */
export function habitLabel(type: string, targetValue: string | null) {
  if (type === 'custom') return targetValue?.trim() || 'Habit';
  return HABIT_META[type as HabitType]?.label ?? targetValue?.trim() ?? 'Habit';
}

export function isHabitType(value: string): value is HabitType {
  return (HABIT_TYPES as string[]).includes(value);
}

/**
 * Streak length in days, counting back from today.
 *
 * Today not being done yet does not break a streak — it's only mid-afternoon
 * as far as this function knows, and showing someone a broken streak at 2pm
 * for a habit they'll do at 8pm is the fastest way to make them stop looking.
 * Yesterday missing does break it.
 */
export function streakFrom(doneDates: Set<string>, today = new Date()): number {
  const day = 24 * 60 * 60 * 1000;
  const key = (d: Date) => d.toISOString().slice(0, 10);

  let streak = 0;
  let cursor = new Date(today.getTime());
  cursor.setHours(0, 0, 0, 0);

  if (doneDates.has(key(cursor))) streak += 1;
  cursor = new Date(cursor.getTime() - day);

  while (doneDates.has(key(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - day);
  }
  return streak;
}
