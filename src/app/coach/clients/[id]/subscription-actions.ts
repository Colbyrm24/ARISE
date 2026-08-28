'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { stripe } from '@/lib/stripe';

/*
  Ending a client's billing, from ARISE.

  Marking somebody `cancelled` on the status row used to do nothing at
  Stripe. They lost the app that evening and their card kept being charged
  every month afterwards — the same shape of bug as a fixed plan that billed
  forever, arriving from the other direction, and worse, because this one
  takes money from somebody who is no longer a client.

  Two ways to end it, because they are different decisions:

  - at period end: they keep what they paid for until it runs out, then
    billing stops on its own. Nothing is owed back.
  - now: billing stops this second. Whatever remains of the month they paid
    for is money the coach owes them, and Stripe is where a refund is issued.
*/

/** Resolves a subscription and proves this coach is allowed to touch it. */
async function ownedSubscription(coachId: string, subscriptionId: string, clientId: string) {
  if (!(await coachOwnsClient(coachId, clientId))) return null;

  /*
    The id is checked against the client it claims to belong to, not just
    fetched. Every 'use server' export is a public endpoint, and a form
    carrying somebody else's subscription id next to a client this coach does
    own would otherwise cancel a stranger's billing.
  */
  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, clientId, deletedAt: null },
  });
  return sub;
}

/**
 * Stop billing when the paid-for period runs out.
 *
 * The local flag is written only after Stripe agrees, so a failure leaves
 * the console saying billing is still running — which is the true and
 * self-correcting answer. The opposite order shows a coach "ends March 4th"
 * over a card that will be charged in March.
 */
export async function endBillingAtPeriodEnd(formData: FormData) {
  const coach = await requireCoach();
  const subscriptionId = formData.get('subscriptionId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!subscriptionId || !clientId) return;

  const sub = await ownedSubscription(coach.id, subscriptionId, clientId);
  if (!sub || !sub.providerSubscriptionId) return;

  try {
    const updated = await stripe.subscriptions.update(sub.providerSubscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: updated.current_period_end
          ? new Date(updated.current_period_end * 1000)
          : sub.currentPeriodEnd,
      },
    });
  } catch (err) {
    console.error('Could not schedule a subscription to end at period end', {
      subscriptionId: sub.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  revalidatePath(`/coach/clients/${clientId}`);
}

/**
 * Stop billing immediately.
 *
 * Deliberately does not refund. A refund is money moving back out and is the
 * coach's decision to make with the full picture in front of him, in Stripe,
 * where it can also be partial. Silently refunding from here would be ARISE
 * deciding that for him.
 */
export async function endBillingNow(formData: FormData) {
  const coach = await requireCoach();
  const subscriptionId = formData.get('subscriptionId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!subscriptionId || !clientId) return;

  const sub = await ownedSubscription(coach.id, subscriptionId, clientId);
  if (!sub || !sub.providerSubscriptionId) return;

  try {
    await stripe.subscriptions.cancel(sub.providerSubscriptionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Already gone at Stripe is the outcome we wanted, so record it rather
    // than leaving the console showing a subscription that no longer exists.
    const alreadyGone = /no such subscription|already been canceled|already canceled/i.test(message);
    if (!alreadyGone) {
      console.error('Could not cancel a subscription at Stripe', {
        subscriptionId: sub.id,
        error: message,
      });
      return;
    }
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    // Not `completed` — that word means the client paid everything they
    // agreed to. This one was ended early, and the console should say so.
    data: { status: 'canceled', cancelAtPeriodEnd: false },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}

/** Undo a scheduled ending — they changed their mind, or the coach did. */
export async function keepBillingRunning(formData: FormData) {
  const coach = await requireCoach();
  const subscriptionId = formData.get('subscriptionId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!subscriptionId || !clientId) return;

  const sub = await ownedSubscription(coach.id, subscriptionId, clientId);
  if (!sub || !sub.providerSubscriptionId) return;

  try {
    await stripe.subscriptions.update(sub.providerSubscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (err) {
    console.error('Could not resume a subscription', {
      subscriptionId: sub.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: false },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}
