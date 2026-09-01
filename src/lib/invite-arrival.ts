import type { ClientStatus } from '@prisma/client';

/*
  What an invite does to somebody who already has a client record.

  Pulled out of the join route as a plain function because it is the one piece
  of that request with a real decision in it, and the decision is easy to get
  catastrophically wrong: he is about to move a book of clients across from
  another platform, several of whom already have accounts here, and the wrong
  answer takes somebody who is actively training and drops them back to a
  payment screen they cannot get past.

  The rule is that an invite only ever moves somebody forward.
*/

/** Where a person lands when they use an invite. */
export function arrivingStatus(skipPayment: boolean): ClientStatus {
  /*
    Somebody already paying goes straight to the intake, which is an entitled
    status — they can open the app the moment they finish signing up, which is
    the whole point of moving them across. Everybody else owes money first.
  */
  return skipPayment ? 'onboarding' : 'payment_pending';
}

/**
 * The statuses that mean "hasn't got going yet". Only these can be moved by
 * an invite; anything else describes a client with a history the invite has
 * no business rewriting.
 */
const NOT_STARTED: ReadonlySet<string> = new Set(['lead', 'payment_pending', 'onboarding']);

/**
 * The status to write for a client who already exists, or null to leave them
 * exactly as they are.
 *
 * Null covers three cases that all matter:
 *   - an active client re-using a link (never demote them to payment_pending);
 *   - a paused, cancelled or completed client (their status is a record, and
 *     re-inviting them is not the moment to erase it);
 *   - somebody already sitting at the status they'd be moved to.
 */
export function statusForExistingClient(
  current: ClientStatus,
  arriving: ClientStatus
): ClientStatus | null {
  if (!NOT_STARTED.has(current)) return null;
  if (current === arriving) return null;
  /*
    payment_pending → onboarding happens when a client who never paid is
    re-invited on an existing-client link, which is exactly how he will fix
    somebody who bounced off a checkout. onboarding → payment_pending must
    not: that is a person already inside the app, and pushing them back out
    to pay is the failure this whole function exists to prevent.
  */
  if (current === 'onboarding' && arriving === 'payment_pending') return null;
  return arriving;
}
