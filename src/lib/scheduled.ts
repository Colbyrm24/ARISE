import { prisma } from '@/lib/prisma';
import { zoneOf } from '@/lib/day';
import { sessionDay } from '@/lib/scheduled-day';

/*
  Closing the loop on a client's calendar.

  ScheduledItem rows are written by the program deploy and read by the coach's
  client calendar, which draws a filled chip for a finished session and a
  hollow one for an outstanding one. `completedAt` was the field deciding
  which — and nothing in the app ever set it. Not the workout finish action,
  not anything else: the only writes to the table were createMany and
  deleteMany from the deploy.

  So every chip rendered hollow forever and the month header read
  "Workouts 0/12" for somebody who had trained twelve times. The page's own
  comment says a month of hollow chips with a few filled ones is the whole
  point of looking at it, and that state was unreachable.

  Finishing a workout and logging cardio now mark the matching day done.
*/

/**
 * Marks the client's scheduled item for a given day and kind as complete.
 *
 * Matched on the day and kind rather than the workout id. Kind is part of it
 * on purpose: finishing a lift should not tick a cardio chip, and the two can
 * sit on the same date. Within a kind the workout id only narrows the match
 * when we have it, so training a session the coach placed on another day
 * still fills that day's chip.
 *
 * Idempotent, and never overwrites an existing timestamp: re-finishing a
 * session should not move the day it was recorded on.
 */
export async function markScheduledDone(
  clientId: string,
  kind: 'workout' | 'cardio',
  opts: { workoutId?: string | null; day?: Date; startedAt?: Date } = {}
) {
  // Which day the chip belongs to, and when it was actually finished, are two
  // different questions. The day comes from when the session started; the
  // timestamp we store is now.
  const completedAt = new Date();
  const anchor = opts.startedAt ?? completedAt;

  let day = opts.day;
  if (!day) {
    // The client's own day, not the server's. On a UTC host an evening
    // session would otherwise tick tomorrow's box and leave today hollow.
    const who = await prisma.user.findUnique({
      where: { id: clientId },
      select: { profile: { select: { timezone: true } } },
    });
    day = sessionDay(anchor, zoneOf(who?.profile));
  }

  try {
    // Prefer the exact scheduled workout when we know which one it was.
    if (kind === 'workout' && opts.workoutId) {
      const exact = await prisma.scheduledItem.updateMany({
        where: { clientId, date: day, kind, workoutId: opts.workoutId, completedAt: null },
        data: { completedAt },
      });
      if (exact.count > 0) return exact.count;
    }

    const any = await prisma.scheduledItem.updateMany({
      where: { clientId, date: day, kind, completedAt: null },
      data: { completedAt },
    });
    return any.count;
  } catch (err) {
    /*
      Bookkeeping, not the point of the request. The client has finished
      their session and that is already recorded on the WorkoutLog; failing
      to tick a calendar chip should never surface as an error on the screen
      where they just hit finish.
    */
    console.error('Could not mark a scheduled item complete', {
      clientId,
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
