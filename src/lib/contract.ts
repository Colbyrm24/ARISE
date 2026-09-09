/*
  How far through the total they agreed to a client actually is.

  The agreement now states a TOTAL PROGRAM VALUE and says billing continues
  until that total is paid — a rolling subscription with no payment count,
  which the client can shorten by making one-time payments but cannot escape.
  That sentence is a promise in both directions, and only one direction was
  automatic:

    - requiredPayments() returns null for a `subscription` plan, so nothing
      ever cancels it. That is correct — it is what "rolling" means — but it
      also means the moment the client HAS paid the total, the only thing
      standing between them and a nineteenth $250 charge is the coach
      remembering.
    - the total was captured, printed into the agreement, and then never read
      again by anything. Nobody on either side of the app could see how much
      of it was left.

  So the number lives here. `contractProgress` is deliberately pure and takes
  plain numbers: the caller does the Prisma work of deciding WHICH payments
  belong to this contract (see the note in billing-card.tsx), and this decides
  what they mean.
*/

export type ContractProgress = {
  /** The agreed total, in dollars. */
  total: number;
  /** Successful payments against this contract, in dollars. */
  paid: number;
  /** What is still owed. Never negative — an overpayment is still "done". */
  remaining: number;
  /** 0–100, clamped, for a progress bar. */
  percent: number;
  /** Whether the total has been reached. */
  met: boolean;
};

/*
  Money compared in cents, not in floats.

  `paid` is a sum of Decimal columns and `total` is a Decimal too, so both
  arrive here having been through Number(). 250 * 18 is 4500 exactly, but
  8 x $562.50 is 4499.999999999999 often enough to matter, and the failure is
  the expensive direction: `met` stays false, the coach is never told to stop,
  and the client is charged again for a contract they finished.
*/
const cents = (n: number) => Math.round(n * 100);

/**
 * Progress against a stated contract total, or null when there is no total
 * to measure against.
 *
 * Null is the normal case for a one-time plan or a fixed payment plan, where
 * the payment count already says when the client is done and a second,
 * separately-maintained number would only be another thing to disagree.
 */
export function contractProgress(
  total: number | null | undefined,
  paid: number
): ContractProgress | null {
  if (total === null || total === undefined) return null;
  if (!Number.isFinite(total) || cents(total) <= 0) return null;

  const paidSafe = Number.isFinite(paid) && paid > 0 ? paid : 0;
  const remainingCents = Math.max(0, cents(total) - cents(paidSafe));

  return {
    total,
    paid: paidSafe,
    remaining: remainingCents / 100,
    percent: Math.min(100, Math.round((cents(paidSafe) / cents(total)) * 100)),
    met: remainingCents === 0,
  };
}

/**
 * How many more charges at this price it would take, if the client makes no
 * extra payments.
 *
 * Rounds UP, because a $4,500 total on $250/month with $4,400 paid is one
 * more charge, not 0.4 of one. Null when the price is not a usable figure —
 * there is no honest answer to give and "0 charges left" would be a lie the
 * coach might act on.
 */
export function chargesRemaining(remaining: number, price: number): number | null {
  if (!Number.isFinite(price) || cents(price) <= 0) return null;
  if (cents(remaining) <= 0) return 0;
  return Math.ceil(cents(remaining) / cents(price));
}

/**
 * Whether a subscription is still going to charge a client who has already
 * paid their whole contract.
 *
 * This is the one state the agreement text does not describe and the billing
 * code cannot fix by itself: a rolling plan has no count to run out, so
 * nothing at Stripe stops it. Surfaced to the coach as an action rather than
 * done automatically — cancelling somebody's billing is not a thing to do
 * behind his back, and he may well be re-signing them for another block.
 */
export function contractOverrunning(
  progress: ContractProgress | null,
  subscription: { status: string; cancelAtPeriodEnd: boolean | null }
): boolean {
  if (!progress?.met) return false;
  if (subscription.status !== 'active') return false;
  return !subscription.cancelAtPeriodEnd;
}
