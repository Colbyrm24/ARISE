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
