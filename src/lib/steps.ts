/*
  Steps: 12–15k a day, every day, for everyone.

  It is the one target that never changes with the program or the phase, so
  it lives here rather than in each program's calendar. A program or habit
  can ask for MORE (a 16k recovery day); nothing can ask for less.
*/

export const STEP_FLOOR = 12000;
export const STEP_CEILING = 15000;

/** The day's step goal: whatever was set, but never under the floor. */
export function stepGoalFor(target: number | null | undefined): number {
  return target && Number.isFinite(target) && target > STEP_FLOOR ? Math.round(target) : STEP_FLOOR;
}

/** "12–15k steps", or "16k steps" when a day asks for more than the range. */
export function stepsLabel(target?: number | null): string {
  if (target && target > STEP_CEILING) return `${Math.round(target / 1000)}k steps`;
  return '12–15k steps';
}
