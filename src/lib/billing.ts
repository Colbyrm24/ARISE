import type { BillingType } from '@prisma/client';

/*
  The rules of a recurring plan, kept away from Stripe and Prisma so they can
  be tested directly.

  This exists because of a specific, expensive bug. A "fixed payment plan"
  was created as a Stripe subscription with the agreed number of payments
  written into its metadata — and nothing, anywhere, ever read that number
  back. Stripe does not stop on its own. A six-payment plan billed the client
  every month forever, and ARISE recorded none of it: the coach saw one
  payment at signup and nothing after.

  So the two questions below are the whole job. How many payments does this
  plan owe, and has that many been taken?
*/

/** A plan's Stripe subscription can only be linked to one of these shapes. */
export type PlanTerms = {
  billingType: BillingType;
  /** The agreed count for a fixed plan. Null on an open-ended subscription. */
  numberOfPayments: number | null;
};

/**
 * How many successful payments this plan is owed, or null when it runs until
 * somebody cancels it.
 *
 * Only `payment_plan` terminates. An ongoing `subscription` is open-ended by
 * definition, and a `one_time` plan never became a subscription at all — if
 * one somehow did, treating it as open-ended would bill forever, so it is
 * capped at the single payment it was sold as.
 */
export function requiredPayments({ billingType, numberOfPayments }: PlanTerms): number | null {
  if (billingType === 'one_time') return 1;
  if (billingType === 'payment_plan') {
    // A fixed plan with no count is a plan nobody can finish. Refuse to
    // guess: null here means "leave it running", which is the same
    // open-ended behaviour as a subscription and is at least honest about
    // not knowing. The coach's payments screen is where that gets noticed.
    if (!numberOfPayments || numberOfPayments < 1) return null;
    return Math.floor(numberOfPayments);
  }
  return null;
}

/**
 * Whether the plan has now been paid in full and its subscription should be
 * cancelled at the provider.
 *
 * Deliberately `>=` rather than `===`. If a payment is ever recorded twice —
 * a webhook replayed before the idempotency guard landed, a manual row added
 * by hand — an `===` check would step straight over the boundary and bill
 * the client forever. Overshooting should still stop.
 */
export function isPaidInFull(paymentsSucceeded: number, required: number | null): boolean {
  if (required === null) return false;
  return paymentsSucceeded >= required;
}

/** What is still owed, for showing a coach "3 of 6". Null when open-ended. */
export function paymentsRemaining(
  paymentsSucceeded: number,
  required: number | null
): number | null {
  if (required === null) return null;
  return Math.max(0, required - paymentsSucceeded);
}

/*
  Stripe's subscription statuses are a superset of what a coach needs to see.
  Collapsing them here keeps that vocabulary out of the rest of the app.
*/
export type LocalSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'completed';

/**
 * Maps a Stripe subscription status onto the four states worth showing.
 *
 * `completed` is never returned from here — it isn't a Stripe status. A plan
 * that finished its agreed payments is cancelled at Stripe and arrives back
 * as `canceled`, so the local row is marked `completed` at the moment we
 * cancel it, and this mapping is not allowed to overwrite that afterwards.
 * See `mergeStatus`.
 */
export function localSubscriptionStatus(stripeStatus: string): LocalSubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      // An unknown status is not worth guessing at; leaving it active means
      // the coach still sees the client as billing, which is the safer
      // wrong answer than silently marking a live plan cancelled.
      return 'active';
  }
}

/**
 * Keeps `completed` from being downgraded to `canceled`.
 *
 * Cancelling a finished payment plan makes Stripe send
 * `customer.subscription.deleted` moments later. Without this, a plan the
 * client fully paid would show in the coach's console as though they had
 * quit.
 */
export function mergeStatus(
  current: string,
  incoming: LocalSubscriptionStatus
): LocalSubscriptionStatus | string {
  if (current === 'completed') return 'completed';
  return incoming;
}

/*
  Which invoice is this?

  The first invoice of a subscription is the same money as the checkout the
  client just completed, and a Payment row already exists for it. Recording
  it again would double the client's payment history and — because the count
  drives cancellation — end a six-payment plan two payments early.
*/
export type InvoiceRole = 'first' | 'renewal';

export function invoiceRole(billingReason: string | null | undefined): InvoiceRole {
  return billingReason === 'subscription_create' ? 'first' : 'renewal';
}

/**
 * Stripe deals in minor units. Everything downstream of this — the Payment
 * row, the coach's screen, the agreement — is in dollars.
 */
export function amountFromCents(cents: number | null | undefined): number {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export type RefundOutcome = 'full' | 'partial' | 'none';

/**
 * What a refund did to a charge.
 *
 * This mattered because nothing in ARISE knew a refund had happened at all.
 * `PaymentStatus.refunded` was in the schema and rendered on the coach's
 * billing card, and no code path ever wrote it — `charge.refunded` was not
 * even a subscribed event. Refund somebody in Stripe and the app went on
 * showing them fully paid forever.
 *
 * That is worse than a wrong label. `paymentsRemaining` counts succeeded
 * payments, so a refunded charge still counted toward a fixed plan: refund
 * the third of six and the client gets five charges and a subscription that
 * cancels itself one payment early.
 *
 * Partial is deliberately its own answer rather than being rounded up to
 * full. Half a payment back is not a payment that did not happen, and
 * marking the row `refunded` would silently un-count money the client is
 * still out. The coach gets told; the row stays as it is.
 */
export function refundOutcome(
  amount: number | null | undefined,
  amountRefunded: number | null | undefined
): RefundOutcome {
  const charged = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const back =
    typeof amountRefunded === 'number' && Number.isFinite(amountRefunded) ? amountRefunded : 0;

  if (back <= 0) return 'none';
  // A charge cannot be refunded for more than it took, so >= is the same
  // question as == and survives a rounding difference between API versions.
  if (charged > 0 && back >= charged) return 'full';
  return 'partial';
}

/**
 * A price a coach typed into a form, or null if it isn't one.
 *
 * `Number('')` is 0 and `Number('abc')` is NaN, and both used to travel all
 * the way to `Math.round(NaN * 100)` inside a Stripe call, which 500s the
 * page the coach is standing on. Zero is rejected too: a $0 checkout is
 * never what anyone meant to send a client.
 */
export function parsePrice(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Stripe takes integer cents; more precision than that is a typo.
  return Math.round(n * 100) / 100;
}

/**
 * A positive whole count from a form, or null.
 *
 * Same reasoning as `parsePrice`: a term of "abc" months should not reach
 * the database as NaN, where it becomes null silently and quietly changes
 * the terms of an agreement.
 */
export function parseCount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Which stored reference a completed checkout could belong to.
 *
 * A plan priced inside ARISE creates a Checkout Session and stores that
 * session's id. A plan backed by a real Stripe price creates a Payment Link —
 * which does not expire — and stores the link's id instead; the session then
 * only exists from the moment the client actually pays, so its id matches
 * nothing on file. Anything looking a paid checkout back up has to try both,
 * or a Payment Link payment strands the client on the finalizing screen and
 * its subscription is never recorded.
 */
export function checkoutRefs(session: {
  id: string;
  payment_link?: string | { id: string } | null;
}): string[] {
  const linkRef =
    typeof session.payment_link === 'string' ? session.payment_link : session.payment_link?.id;

  // Session id first: it is the older shape and still the common one.
  return linkRef && linkRef !== session.id ? [session.id, linkRef] : [session.id];
}
