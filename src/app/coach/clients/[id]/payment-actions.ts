'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach, isEntitled } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { stripe } from '@/lib/stripe';
import { getSiteUrl } from '@/lib/site-url';
import { finalizeManualPaymentLink } from '@/lib/payment-finalize';
import { parsePrice, parseCount } from '@/lib/billing';
import type { PaymentFrequency, PaymentProviderType } from '@prisma/client';

const FREQUENCY_TO_INTERVAL: Record<Exclude<PaymentFrequency, 'one_time'>, { interval: 'week' | 'month'; interval_count: number }> = {
  weekly: { interval: 'week', interval_count: 1 },
  biweekly: { interval: 'week', interval_count: 2 },
  monthly: { interval: 'month', interval_count: 1 },
};

/**
 * Generates the payment link a coach sends a client: creates a Stripe
 * Checkout Session (or, for FanBasis, tracks a manually-created link — see
 * the note on the form) and a PaymentLink row so the eventual webhook
 * knows exactly which client, plan, and agreement template it belongs to.
 */
export async function createPaymentLink(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const planId = formData.get('planId') as string | null;
  const agreementTemplateId = formData.get('agreementTemplateId') as string | null;
  const provider = formData.get('provider') as PaymentProviderType | null;
  const startDateRaw = formData.get('startDate') as string | null;
  const priceOverrideRaw = formData.get('priceOverride') as string | null;
  const termMonthsOverrideRaw = formData.get('termMonthsOverride') as string | null;
  const numberOfPaymentsOverrideRaw = formData.get('numberOfPaymentsOverride') as string | null;
  const manualCheckoutUrl = (formData.get('manualCheckoutUrl') as string | null)?.trim();

  if (!clientId || !planId || !agreementTemplateId || !provider || !startDateRaw) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const startDate = new Date(startDateRaw);
  if (Number.isNaN(startDate.getTime())) return;

  /*
    These used to be `raw ? Number(raw) : null`, which turns "abc" into NaN
    rather than null — and `?? Number(plan.price)` doesn't catch NaN, only
    null. So a typo in the price box travelled all the way into
    `unit_amount: Math.round(NaN * 100)` inside the Stripe call, which 500s
    the page the coach is standing on with no hint as to which field did it.
  */
  const priceOverride = parsePrice(priceOverrideRaw);
  const termMonthsOverride = parseCount(termMonthsOverrideRaw);
  // How many payments this client agreed to, when it differs from the plan's
  // default. This is what decides when their subscription stops, so it is
  // stored on the link rather than living only in Stripe's metadata.
  const numberOfPaymentsOverride = parseCount(numberOfPaymentsOverrideRaw);
  const effectivePrice = priceOverride ?? Number(plan.price);
  if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) return;

  if (provider === 'stripe') {
    const origin = getSiteUrl();
    const isRecurring = plan.billingType !== 'one_time' && plan.paymentFrequency && plan.paymentFrequency !== 'one_time';

    // Stripe is a network call on a page the coach is watching. A refused
    // API key or a transient outage should leave them on the form, not on a
    // stack trace.
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: isRecurring ? 'subscription' : 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(effectivePrice * 100),
              product_data: { name: plan.name },
              ...(isRecurring
                ? { recurring: FREQUENCY_TO_INTERVAL[plan.paymentFrequency as Exclude<PaymentFrequency, 'one_time'>] }
                : {}),
            },
            quantity: 1,
          },
        ],
        ...(isRecurring && plan.billingType === 'payment_plan'
          ? {
              subscription_data: {
                // Informational only. This metadata used to be the *only*
                // record of how many payments were agreed, and nothing ever
                // read it back — which is how fixed plans came to bill
                // forever. The count that actually stops the billing lives
                // on the PaymentLink now, enforced from the invoice webhooks
                // by lib/subscription-sync.ts.
                metadata: {
                  numberOfPayments: String(
                    numberOfPaymentsOverride ?? plan.numberOfPayments ?? ''
                  ),
                },
              },
            }
          : {}),
        success_url: `${origin}/agreement/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/today`,
        metadata: { clientId, planId },
      });
    } catch (err) {
      console.error('Stripe refused to create a checkout session', {
        clientId,
        planId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!session.url) return;

    await prisma.paymentLink.create({
      data: {
        clientId,
        planId,
        agreementTemplateId,
        provider,
        priceOverride,
        termMonthsOverride,
        numberOfPaymentsOverride,
        startDate,
        checkoutUrl: session.url,
        providerRef: session.id,
      },
    });
  } else {
    // FanBasis: no live API integration yet, so the coach pastes the
    // checkout link they generated directly in FanBasis. ARISE still
    // tracks it and lets the coach confirm payment by hand once it lands.
    if (!manualCheckoutUrl) return;

    await prisma.paymentLink.create({
      data: {
        clientId,
        planId,
        agreementTemplateId,
        provider,
        priceOverride,
        termMonthsOverride,
        numberOfPaymentsOverride,
        startDate,
        checkoutUrl: manualCheckoutUrl,
        providerRef: `manual-${Date.now()}`,
      },
    });
  }

  /*
    Move them to payment_pending only if they haven't bought yet.

    This used to be unconditional, and `payment_pending` is below the
    entitlement line — so generating a link for somebody who was already
    active silently revoked their access to the entire app. The coach saw
    nothing; the client opened ARISE that evening and got the waiting-room
    screen telling them to check their email for a payment link, with their
    program, their meals and their history all gone.

    Sending a renewal or a second-term link to a client mid-engagement is a
    completely ordinary thing to do, so the old behaviour was a live trap.
    A link for someone already being coached is now just a link.
  */
  const existing = await prisma.client.findUnique({
    where: { userId: clientId },
    select: { status: true },
  });

  if (existing && !isEntitled(existing.status)) {
    await prisma.client.update({
      where: { userId: clientId },
      data: { status: 'payment_pending' },
    });
  }

  revalidatePath(`/coach/clients/${clientId}`);
}

/** Coach-confirmed payment for providers without a live webhook yet. */
export async function markPaymentLinkPaid(formData: FormData) {
  const coach = await requireCoach();

  const paymentLinkId = formData.get('paymentLinkId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!paymentLinkId || !clientId) return;

  /*
    The guard used to check `clientId` while everything downstream keyed off
    `paymentLink.clientId` — two ids on one form, and the checked one wasn't
    the one that acted. Submitting your own client next to somebody else's
    pending link passed the check and then, on THEIR client, marked the link
    paid, wrote a succeeded Payment for the full plan price with no money
    moved, created a binding agreement, and pushed them to agreement_pending.

    So the link is resolved first and its own owner is what gets checked.
  */
  const link = await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    select: { clientId: true },
  });
  if (!link || link.clientId !== clientId) return;
  if (!(await coachOwnsClient(coach.id, link.clientId))) return;

  await finalizeManualPaymentLink(paymentLinkId);

  revalidatePath(`/coach/clients/${clientId}`);
}
