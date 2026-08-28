import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { notify } from '@/lib/notifications';
import {
  requiredPayments,
  isPaidInFull,
  localSubscriptionStatus,
  mergeStatus,
  invoiceRole,
  amountFromCents,
} from '@/lib/billing';

/*
  Keeping ARISE's idea of a recurring plan in step with Stripe's.

  Before this existed the app handled exactly one Stripe event —
  `checkout.session.completed` — which fires once, at signup. Everything
  after that was invisible: renewals were never recorded, failed cards were
  never noticed, and a fixed payment plan never stopped, because the agreed
  number of payments was written into Stripe's metadata and read by nothing.

  The rules live in lib/billing.ts and are tested there. This file is the
  part that has to touch the database and the Stripe API.
*/

/**
 * Records the subscription a checkout just created.
 *
 * Called from the finalize path, which already knows the PaymentLink — and
 * the link is what carries the agreed terms, so it is stored on the
 * subscription rather than re-derived later from the plan alone. A link can
 * carry a `numberOfPaymentsOverride` the plan does not know about.
 */
export async function recordSubscriptionFromCheckout(
  paymentLinkId: string,
  clientId: string,
  planId: string,
  stripeSubscriptionId: string
) {
  const existing = await prisma.subscription.findFirst({
    where: { provider: 'stripe', providerSubscriptionId: stripeSubscriptionId, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.subscription.create({
    data: {
      clientId,
      planId,
      paymentLinkId,
      provider: 'stripe',
      providerSubscriptionId: stripeSubscriptionId,
      status: 'active',
    },
  });
}

/** The terms a subscription was actually sold on: the link's, else the plan's. */
function termsOf(sub: {
  plan: { billingType: string; numberOfPayments: number | null };
  paymentLink: { numberOfPaymentsOverride: number | null } | null;
}) {
  return {
    billingType: sub.plan.billingType as 'one_time' | 'subscription' | 'payment_plan',
    numberOfPayments: sub.paymentLink?.numberOfPaymentsOverride ?? sub.plan.numberOfPayments,
  };
}

async function findSubscription(stripeSubscriptionId: string) {
  return prisma.subscription.findFirst({
    where: { provider: 'stripe', providerSubscriptionId: stripeSubscriptionId, deletedAt: null },
    include: { plan: true, paymentLink: true },
  });
}

/**
 * The local row for a Stripe subscription, creating it from Stripe if it
 * isn't there yet.
 *
 * Two situations need this, and both are the difference between the fix
 * working and doing nothing at all.
 *
 * The first is ordering. Stripe does not promise that
 * `checkout.session.completed` arrives before `invoice.paid`, and the row is
 * written by the finalize path that the first of those triggers. Losing that
 * race would drop the signup invoice on the floor, leaving the count one
 * short forever — so a six-payment plan would take seven.
 *
 * The second is every subscription that already exists. Nothing ever wrote
 * this table before, so every client currently being billed has no row, and
 * a handler that gives up when it finds none would leave exactly the people
 * this was written for still being charged. They are recoverable because
 * their checkout session is still on file as the PaymentLink's providerRef,
 * which is what this looks up.
 */
async function ensureLocalSubscription(stripeSubscriptionId: string) {
  const existing = await findSubscription(stripeSubscriptionId);
  if (existing) return existing;

  try {
    // Which checkout created this subscription? That session id is the
    // PaymentLink's providerRef, and the link carries the agreed terms.
    const sessions = await stripe.checkout.sessions.list({
      subscription: stripeSubscriptionId,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (!sessionId) return null;

    const link = await prisma.paymentLink.findFirst({ where: { providerRef: sessionId } });
    if (!link) return null;

    await recordSubscriptionFromCheckout(
      link.id,
      link.clientId,
      link.planId,
      stripeSubscriptionId
    );
  } catch (err) {
    console.error('Could not recover a subscription from Stripe', {
      stripeSubscriptionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  return findSubscription(stripeSubscriptionId);
}

/**
 * A paid invoice: every charge after the first, and the first one too.
 *
 * The first invoice of a subscription is the same money as the checkout the
 * client just completed, and a Payment row already exists for it. That row is
 * adopted onto the subscription rather than duplicated — recording it twice
 * would double the client's history and, because the count is what decides
 * when to stop, would end a six-payment plan a payment early.
 */
export async function handleInvoicePaid(invoice: {
  id: string;
  subscription: string | null;
  amount_paid: number | null;
  billing_reason: string | null;
  created: number | null;
}) {
  if (!invoice.subscription) return;

  const sub = await ensureLocalSubscription(invoice.subscription);
  if (!sub) return;

  const amount = amountFromCents(invoice.amount_paid);
  const paidAt = invoice.created ? new Date(invoice.created * 1000) : new Date();

  // Stripe retries deliveries. The unique index on (provider,
  // provider_payment_id) is the real guard; this check keeps the common
  // case from relying on a caught constraint error.
  const already = await prisma.payment.findFirst({
    where: { provider: 'stripe', providerPaymentId: invoice.id, deletedAt: null },
  });

  if (already) {
    /*
      An existing row is usually a replayed delivery, and there is nothing to
      do. But it can also be a decline that Stripe has since retried
      successfully — a failed row was written under this same invoice id,
      because Stripe reuses it across retries.

      Treating that as a duplicate and returning was a real bug: the money
      left the client's account, nothing recorded it, the count stayed one
      short, and the coach's screen kept saying their card was declining. On
      a six-payment plan they would have been charged a seventh time.
    */
    if (already.status !== 'succeeded') {
      await prisma.payment.update({
        where: { id: already.id },
        data: { status: 'succeeded', paidAt, amount, subscriptionId: sub.id },
      });
    }
  } else {
    const role = invoiceRole(invoice.billing_reason);

    // The signup charge already has a Payment row, written by the finalize
    // path against the checkout session. Attach it to the subscription
    // instead of writing a second one for the same money.
    const signupPayment =
      role === 'first' && sub.paymentLinkId
        ? await prisma.payment.findFirst({
            where: { paymentLinkId: sub.paymentLinkId, subscriptionId: null, deletedAt: null },
          })
        : null;

    if (signupPayment) {
      await prisma.payment.update({
        where: { id: signupPayment.id },
        data: {
          subscriptionId: sub.id,
          providerPaymentId: invoice.id,
          amount,
          status: 'succeeded',
          paidAt,
        },
      });
    } else {
      await prisma.payment.create({
        data: {
          clientId: sub.clientId,
          subscriptionId: sub.id,
          provider: 'stripe',
          providerPaymentId: invoice.id,
          amount,
          status: 'succeeded',
          paidAt,
        },
      });
    }
  }

  // A card that recovers should clear the past-due flag.
  if (sub.status === 'past_due') {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'active' } });
  }

  await stopIfPaidInFull(sub.id);
}

/**
 * The whole point of this file: end a fixed plan when it has been paid off.
 *
 * Counting from the database rather than trusting a running total means a
 * missed webhook that later gets replayed still arrives at the right answer.
 */
export async function stopIfPaidInFull(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, paymentLink: true },
  });
  /*
    Deliberately not skipping rows already marked `completed`.

    An earlier version returned early on `completed` and marked the row
    completed *before* calling Stripe, with a comment claiming the next
    invoice would retry a failed cancel. It could not: the early return saw
    `completed` and stopped. So a cancel that timed out — routine — left the
    subscription live at Stripe, charging every month, while ARISE showed
    "Paid in full" and had already told the coach billing had stopped. That
    is the original bug, reintroduced by the code fixing it.

    Only a subscription Stripe has confirmed is gone is safe to skip.
  */
  if (!sub || sub.status === 'canceled') return;

  const required = requiredPayments(termsOf(sub));
  if (required === null) return;

  const paid = await prisma.payment.count({
    where: { subscriptionId: sub.id, status: 'succeeded', deletedAt: null },
  });
  if (!isPaidInFull(paid, required)) return;

  /*
    Cancel first, and only record it as finished once Stripe has agreed.

    Ordering it this way means a failure leaves the row saying the plan is
    still running, which is both true and self-correcting: the next invoice
    arrives, lands here again, and retries. The opposite order produces a
    client being billed against a screen that says they are done.
  */
  if (sub.providerSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(sub.providerSubscriptionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already cancelled is success as far as this is concerned — the
      // billing is stopped, which is the whole objective.
      const alreadyGone = /no such subscription|already been canceled|already canceled/i.test(
        message
      );
      if (!alreadyGone) {
        console.error('Could not cancel finished subscription at Stripe — will retry', {
          subscriptionId: sub.id,
          error: message,
        });
        return;
      }
    }
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'completed' },
  });

  // Only on the transition, so a replayed invoice doesn't tell the coach the
  // same plan finished twice.
  if (sub.status !== 'completed') {
    await notifyCoach(
      sub.clientId,
      `Payment plan complete — ${paid} of ${required} payments received. Billing has stopped.`
    );
  }
}

/**
 * A declining card. Recorded as a failed Payment and surfaced to the coach,
 * because the alternative is finding out weeks later.
 */
export async function handleInvoicePaymentFailed(invoice: {
  id: string;
  subscription: string | null;
  amount_due: number | null;
}) {
  if (!invoice.subscription) return;

  const sub = await ensureLocalSubscription(invoice.subscription);
  if (!sub) return;

  const already = await prisma.payment.findFirst({
    where: { provider: 'stripe', providerPaymentId: invoice.id, deletedAt: null },
  });

  if (already) {
    // A retry that failed again: keep the row, don't add another.
    if (already.status !== 'failed') {
      await prisma.payment.update({ where: { id: already.id }, data: { status: 'failed' } });
    }
  } else {
    await prisma.payment.create({
      data: {
        clientId: sub.clientId,
        subscriptionId: sub.id,
        provider: 'stripe',
        providerPaymentId: invoice.id,
        amount: amountFromCents(invoice.amount_due),
        status: 'failed',
      },
    });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: mergeStatus(sub.status, 'past_due') },
  });

  await notifyCoach(sub.clientId, 'A payment failed. Their card was declined.');
}

/** Stripe's own view of the subscription changed — status, or the period end. */
export async function handleSubscriptionChanged(subscription: {
  id: string;
  status: string;
  current_period_end: number | null;
}) {
  const sub = await ensureLocalSubscription(subscription.id);
  if (!sub) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: mergeStatus(sub.status, localSubscriptionStatus(subscription.status)),
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : sub.currentPeriodEnd,
    },
  });
}

/**
 * Billing events matter to the coach, not the client — the client already
 * got an email from Stripe. There is one coach on this instance.
 */
async function notifyCoach(clientId: string, body: string) {
  const coach = await prisma.user.findFirst({ where: { role: 'coach' }, select: { id: true } });
  if (!coach) return;
  await notify(coach.id, 'account', body, { clientId });
}
