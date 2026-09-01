import { startOfDayInstantFor } from '@/lib/day';

/*
  Which unfinished WorkoutLog counts as "the session I am in right now".

  Split out of the workout actions so it can be tested without a database —
  the same reason scheduled-day.ts exists. The rule lived inline as a bare
  `startedAt >= local midnight`, and both of its edges were wrong in a way
  only a date test would have caught.

  Too tight, at the midnight edge: a session started at 10pm and still going
  at 00:05 stopped matching, so the next logged set opened a SECOND log. The
  four sets from before midnight dropped out of the inputs, the header
  counter fell from [4/12] back to [1/12], a PR earned in the first half
  disappeared, and Finish then recorded a six-minute workout — leaving the
  real log open forever.

  Too loose, in completeWorkout: that query had no lower bound at all.
  Nothing in the app ever closes an abandoned log, so they accumulate, and
  Finish on a session with no sets logged reached past them all to the oldest
  one — writing a seven-day duration, last week's volume, and ticking last
  week's calendar chip while today's stayed hollow.
*/

/**
 * How far a session in progress can reach back past local midnight.
 *
 * Longer than any real session and shorter than the gap to the next one.
 * That gap is what makes the number safe in both directions: it reunites a
 * session split by midnight, and it can never pull yesterday evening's
 * abandoned log into this morning's training.
 */
export const OPEN_SESSION_MS = 6 * 60 * 60 * 1000;

/**
 * The earliest `startedAt` that still belongs to the session in progress.
 *
 * Local midnight normally, and during the small hours the moment
 * OPEN_SESSION_MS ago — whichever is earlier. Past ~6am the grace window is
 * entirely inside today, so this is just midnight again and a log left open
 * last night is correctly out of reach.
 */
export function openSessionSince(
  user: Parameters<typeof startOfDayInstantFor>[0],
  now: Date = new Date()
): Date {
  const midnight = startOfDayInstantFor(user, now);
  const grace = new Date(now.getTime() - OPEN_SESSION_MS);
  return grace < midnight ? grace : midnight;
}
