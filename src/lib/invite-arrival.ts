import type { ClientStatus } from '@prisma/client';

/*
  What an invite does to somebody who already has a client record.

  Pulled out of the join route as a plain function because it is the one piece
  of that request with a real decision in it, and the decision is easy to get
  catastrophically wrong: he is about to move a book of clients across from
  another platform, several of whom already have accounts here, and the wrong
  answer either drops somebody who is actively training back to a payment
  screen, or leaves somebody he has personally vouched for locked out of the
  app he just told them to download.
*/

/**
 * The statuses that already have the paid product. Mirrors ENTITLED in
 * @/lib/auth, which cannot be imported here — it pulls in Supabase and
 * next/headers, and this module has to stay importable by a bare node test.
 * entitlement.test.ts asserts the two lists stay identical.
 */
const ENTITLED_HERE = new Set(['onboarding', 'active', 'ending_soon', 'completed']);

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
 * The status to write for a client who already exists, or null to leave them
 * exactly as they are.
 *
 * The two kinds of invite get opposite treatment on purpose.
 *
 * An EXISTING-CLIENT invite is the coach saying, in his own console, "this
 * person is my client and pays me elsewhere" — so it lets them in from
 * anywhere that isn't already in. That deliberately includes `paused` and
 * `cancelled`, which is not an edge case: cancelling their old Stripe
 * subscription is exactly how he stops billing them here, and
 * `customer.subscription.deleted` sets `paused` on the way through. Without
 * this, the client he just moved across would sign up, be told there was
 * nothing to pay, and then bounce off every screen onto "your last payment
 * did not go through".
 *
 * A PAYING invite only moves a fresh lead. Anyone else it would touch is
 * either mid-purchase — where the payment webhook owns the status — or
 * already training, and pushing them back out to pay is the failure this
 * whole function exists to prevent.
 *
 * Somebody already entitled is never touched by either kind.
 */
export function statusForExistingClient(
  current: ClientStatus,
  arriving: ClientStatus
): ClientStatus | null {
  if (ENTITLED_HERE.has(current)) return null;
  if (current === arriving) return null;

  if (arriving === 'onboarding') return 'onboarding';
  return current === 'lead' ? 'payment_pending' : null;
}
