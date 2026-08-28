import { dayIn } from '@/lib/day';

/*
  Which calendar day a session belongs to.

  Split out from scheduled.ts so it can be tested without a database. The
  first version of this logic lived inline, derived the day from the moment
  the client hit Finish, and shipped with tests that only exercised the day
  helpers underneath it — so the actual decision went untested and was wrong.
*/

/**
 * A session belongs to the day it STARTED, in the client's own timezone.
 *
 * Not the day it finished. Everything else in the app already attributes a
 * session to `startedAt` — the Today screen's "workout done", the session
 * page, the workouts list, the today-log lookup all bound on it — and
 * disagreeing here is worse than being wrong in a consistent direction.
 *
 * The case that makes it concrete: a shift worker starts Thursday's session
 * at 11:50pm and finishes at 12:10am. Attributing it to the finish would
 * leave Thursday's chip hollow while their own screen says Thursday is done,
 * and would tick Friday before they had trained Friday. Then when they
 * actually train on Friday, the "don't overwrite an existing timestamp"
 * guard finds Friday already ticked and marks nothing at all — so two
 * sessions trained shows as one, on the wrong day, permanently.
 */
export function sessionDay(startedAt: Date, tz: string | null | undefined): Date {
  return dayIn(startedAt, tz);
}
