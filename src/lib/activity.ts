/*
  What the coach gets told when a client trains.

  The notification system has been complete for weeks — a row, a push, a link
  that opens the right screen for whoever is reading. What it never had was
  anyone calling it for the three things clients actually do every day. A
  client could finish every workout on the program, log cardio daily and hit
  protein all week, and the coach's feed stayed empty. Messages and check-ins
  rang; training was silent.

  The text lives here, away from Prisma, because deciding what a line says is
  the part worth pinning down in a test — and because anything importing the
  client can't be loaded in a bare node test at all.
*/

/** Nobody wants "Colby Mullins finished". First names only in a feed. */
export function firstName(full: string | null | undefined) {
  const name = (full ?? '').trim();
  if (!name) return 'A client';
  return name.split(/\s+/)[0];
}

/**
 * A finished session.
 *
 * Duration is included only when it is believable. WorkoutLog.duration is
 * derived from startedAt, and a client who opens a workout, walks away and
 * taps finish the next morning produces a 14-hour session — printing that
 * makes the whole feed look broken, so anything past three hours drops the
 * time rather than the line.
 */
export function workoutFinishedBody(
  name: string | null | undefined,
  workoutTitle: string | null | undefined,
  durationSeconds?: number | null
) {
  const who = firstName(name);
  const title = (workoutTitle ?? '').trim();
  const what = title ? `finished ${title}` : 'finished their workout';

  const mins = durationSeconds ? Math.round(durationSeconds / 60) : 0;
  const believable = mins >= 5 && mins <= 180;
  return believable ? `${who} ${what} · ${mins} min` : `${who} ${what}`;
}

/** A logged cardio session. */
export function cardioLoggedBody(
  name: string | null | undefined,
  cardioType: string | null | undefined,
  minutes: number
) {
  const who = firstName(name);
  const kind = (cardioType ?? '').trim().toLowerCase() || 'cardio';
  return `${who} logged ${minutes} min of ${kind}`;
}

/**
 * A protein goal reached.
 *
 * Deliberately fires on the crossing, not on every meal after it. The caller
 * uses the unique index on (dailyGoalId, date) as the referee — whoever
 * inserts the completion row first announces it, and every later meal that
 * day finds the row already there and says nothing.
 */
export function proteinHitBody(
  name: string | null | undefined,
  grams: number,
  target: number
) {
  return `${firstName(name)} hit their protein goal · ${Math.round(grams)}g of ${Math.round(target)}g`;
}

/**
 * Whether today's eating has just crossed the protein goal.
 *
 * `before` is what they had logged prior to this meal. Crossing means the
 * goal was not met and now is — re-reaching it after an edit is not a new
 * event, and a target of zero or nothing is not a goal to cross.
 */
export function crossedProtein(before: number, after: number, target: number | undefined) {
  if (!target || target <= 0) return false;
  return before < target && after >= target;
}
