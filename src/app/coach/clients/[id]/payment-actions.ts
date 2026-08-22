'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { stripe } from '@/lib/stripe';
import { getSiteUrl } from '@/lib/site-url';
import { finalizeManualPaymentLink } from '@/lib/payment-finalize';
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
  const manualCheckoutUrl = (formData.get('manualCheckoutUrl') as string | null)?.trim();

  if (!clientId || !planId || !agreementTemplateId || !provider || !startDateRaw) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const startDate = new Date(startDateRaw);
  const priceOverride = priceOverrideRaw ? Number(priceOverrideRaw) : null;
  const termMonthsOverride = termMonthsOverrideRaw ? Number(termMonthsOverrideRaw) : null;
  const effectivePrice = priceOverride ?? Number(plan.price);

  if (provider === 'stripe') {
    const origin = getSiteUrl();
    const isRecurring = plan.billingType !== 'one_time' && plan.paymentFrequency && plan.paymentFrequency !== 'one_time';

    const session = await stripe.checkout.sessions.create({
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
      ...(isRecurring && plan.billingType === 'payment_plan' && plan.numberOfPayments
        ? {
            subscription_data: {
              // Fixed-length payment plans are modeled as a subscription
              // that auto-cancels once the agreed number of payments has
              // gone through, rather than running forever like a true
              // subscription would.
              metadata: { numberOfPayments: String(plan.numberOfPayments) },
            },
          }
        : {}),
      success_url: `${origin}/agreement/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/today`,
      metadata: { clientId, planId },
    });

    if (!session.url) return;

    await prisma.paymentLink.create({
      data: {
        clientId,
        planId,
        agreementTemplateId,
        provider,
        priceOverride,
        termMonthsOverride,
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
        startDate,
        checkoutUrl: manualCheckoutUrl,
        providerRef: `manual-${Date.now()}`,
      },
    });
  }

  await prisma.client.update({ where: { userId: clientId }, data: { status: 'payment_pending' } });

  revalidatePath(`/coach/clients/${clientId}`);
}

/** Coach-confirmed payment for providers without a live webhook yet. */
export async function markPaymentLinkPaid(formData: FormData) {
  const coach = await requireCoach();

  const paymentLinkId = formData.get('paymentLinkId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!paymentLinkId || !clientId) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  await finalizeManualPaymentLink(paymentLinkId);

  revalidatePath(`/coach/clients/${clientId}`);
}
